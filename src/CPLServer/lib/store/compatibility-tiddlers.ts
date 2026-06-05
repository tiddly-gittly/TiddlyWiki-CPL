import * as fs from 'fs';
import * as pathModule from 'path';

import { Config } from '../config';
import type {
  CompatibilityReport,
  CompatibilityReportStatus,
  ConflictingPlugin,
  RelatedCompatibilityReport,
  PendingCommentRecord,
} from '../types';

const getCompatibilityDir = (): string => Config.compatibilityTiddlersDir;

const ensureDir = (): void => {
  const dir = getCompatibilityDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

/**
 * Parse a compatibility report .tid back into CompatibilityReport.
 */
const parseCompatibilityTiddler = (raw: string): CompatibilityReport | null => {
  const lines = raw.split(/\r?\n/);
  const fields: Record<string, string> = {};
  let bodyStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '' && Object.keys(fields).length > 0) {
      bodyStart = i + 1;
      break;
    }

    const colonIdx = lines[i].indexOf(':');
    if (colonIdx === -1) {
      continue;
    }

    const key = lines[i].substring(0, colonIdx).trim().toLowerCase();
    const value = lines[i].substring(colonIdx + 1).trim();

    if (
      key === 'title' ||
      key === 'plugin-title' ||
      key === 'reporter-github-id' ||
      key === 'reporter-username' ||
      key === 'tw-version-min' ||
      key === 'tw-version-max' ||
      key === 'conflicting-plugins' ||
      key === 'status' ||
      key === 'created-at' ||
      key === 'updated-at'
    ) {
      fields[key] = value;
    }
  }

  if (!fields['plugin-title'] || !fields['created-at']) {
    return null;
  }

  const content = lines.slice(bodyStart).join('\n').trim();
  let conflictingPlugins: ConflictingPlugin[] = [];
  if (fields['conflicting-plugins']) {
    try {
      conflictingPlugins = JSON.parse(fields['conflicting-plugins']);
    } catch {
      conflictingPlugins = [];
    }
  }

  const id = fields.title?.startsWith('$:/cpl/compatibility/')
    ? fields.title.slice('$:/cpl/compatibility/'.length)
    : fields.title ?? '';

  return {
    id,
    pluginTitle: fields['plugin-title'],
    reporterGithubId: fields['reporter-github-id'] ?? '',
    reporterUsername: fields['reporter-username'] ?? 'Anonymous',
    twVersionMin: fields['tw-version-min'] || undefined,
    twVersionMax: fields['tw-version-max'] || undefined,
    conflictingPlugins,
    description: content,
    status: (fields.status as CompatibilityReportStatus) || 'pending',
    createdAt: fields['created-at'],
    updatedAt: fields['updated-at'] ?? fields['created-at'],
  };
};

/**
 * Serialize a CompatibilityReport to .tid format.
 */
const serializeCompatibilityTiddler = (report: CompatibilityReport): string => {
  const fields: Record<string, string> = {
    title: `$:/cpl/compatibility/${report.id}`,
    'plugin-title': report.pluginTitle,
    'reporter-github-id': report.reporterGithubId,
    'reporter-username': report.reporterUsername,
    status: report.status,
    'created-at': report.createdAt,
    'updated-at': report.updatedAt,
    type: 'text/vnd.tiddlywiki',
  };

  if (report.twVersionMin) {
    fields['tw-version-min'] = report.twVersionMin;
  }
  if (report.twVersionMax) {
    fields['tw-version-max'] = report.twVersionMax;
  }
  if (report.conflictingPlugins.length > 0) {
    fields['conflicting-plugins'] = JSON.stringify(report.conflictingPlugins);
  }

  const header = Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');

  return `${header}\n\n${report.description}`;
};

/**
 * Read all report tiddlers from disk.
 */
const readAllReportTiddlers = (): CompatibilityReport[] => {
  const dir = getCompatibilityDir();
  if (!fs.existsSync(dir)) {
    return [];
  }

  const reports: CompatibilityReport[] = [];
  for (const fileName of fs.readdirSync(dir)) {
    if (!fileName.endsWith('.tid')) {
      continue;
    }
    try {
      const content = fs.readFileSync(pathModule.join(dir, fileName), 'utf-8');
      const parsed = parseCompatibilityTiddler(content);
      if (parsed) {
        reports.push(parsed);
      }
    } catch {
      // skip
    }
  }

  return reports;
};

export const CompatibilityTiddlerStore = {
  getReports(
    pluginTitle: string,
    status?: CompatibilityReportStatus | null,
  ): CompatibilityReport[] {
    const all = readAllReportTiddlers().filter(
      r => r.pluginTitle === pluginTitle,
    );
    return status ? all.filter(r => r.status === status) : all;
  },

  addReport(report: CompatibilityReport): CompatibilityReport {
    ensureDir();
    const tid = serializeCompatibilityTiddler(report);
    const fileName = pathModule.join(
      getCompatibilityDir(),
      `${report.id}${Config.getServerSuffix()}.tid`,
    );
    fs.writeFileSync(fileName, tid, 'utf-8');
    return report;
  },

  /**
   * Find a report file by ID, regardless of server suffix.
   */
  findReportFile(reportId: string): string | null {
    const dir = getCompatibilityDir();
    if (!fs.existsSync(dir)) {
      return null;
    }
    for (const fileName of fs.readdirSync(dir)) {
      if (fileName.startsWith(reportId) && fileName.endsWith('.tid')) {
        return pathModule.join(dir, fileName);
      }
    }
    return null;
  },

  updateReportStatus(
    reportId: string,
    status: Exclude<CompatibilityReportStatus, 'deleted'>,
  ): CompatibilityReport | null {
    const dir = getCompatibilityDir();
    let filePath = pathModule.join(dir, `${reportId}.tid`);
    if (!fs.existsSync(filePath)) {
      const existing = this.findReportFile(reportId);
      if (existing) {
        filePath = existing;
      } else {
        return null;
      }
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const report = parseCompatibilityTiddler(content);
      if (!report) {
        return null;
      }

      report.status = status;
      report.updatedAt = new Date().toISOString();

      const tid = serializeCompatibilityTiddler(report);
      fs.writeFileSync(filePath, tid, 'utf-8');
      return report;
    } catch {
      return null;
    }
  },

  deleteReport(reportId: string): boolean {
    const filePath = pathModule.join(getCompatibilityDir(), `${reportId}.tid`);
    if (!fs.existsSync(filePath)) {
      return false;
    }
    try {
      fs.unlinkSync(filePath);
      return true;
    } catch {
      return false;
    }
  },

  getRelatedReports(pluginTitle: string): RelatedCompatibilityReport[] {
    const all = readAllReportTiddlers();
    const results: RelatedCompatibilityReport[] = [];

    for (const report of all) {
      if (report.status !== 'approved') {
        continue;
      }

      if (report.pluginTitle === pluginTitle) {
        results.push({ role: 'subject', report });
      }

      for (const conflict of report.conflictingPlugins ?? []) {
        if (conflict.pluginTitle === pluginTitle) {
          results.push({
            role: 'conflicting-plugin',
            report,
            conflictingPlugin: conflict,
          });
        }
      }
    }

    return results;
  },

  getPendingReports(): PendingCommentRecord[] {
    return readAllReportTiddlers()
      .filter(r => r.status === 'pending')
      .map(r => ({
        pluginTitle: r.pluginTitle,
        comment: {
          id: r.id,
          githubId: r.reporterGithubId,
          username: r.reporterUsername,
          avatar: '',
          content: r.description,
          status: r.status,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        },
      }));
  },
};
