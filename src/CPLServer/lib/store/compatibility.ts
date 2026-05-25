import * as fs from 'fs';
import * as path from 'path';

import { Config } from '../config';
import { escapeRegExp, sanitizePluginFileName } from '../files';
import type {
  CompatibilityReport,
  CompatibilityReportStatus,
  RelatedCompatibilityReport,
} from '../types';

const COMPATIBILITY_DIR = path.resolve(process.cwd(), 'data', 'compatibility');

const ensureCompatibilityDir = (): void => {
  if (!fs.existsSync(COMPATIBILITY_DIR)) {
    fs.mkdirSync(COMPATIBILITY_DIR, { recursive: true });
  }
};

const getCompatibilityFilePath = (pluginTitle: string): string =>
  path.join(
    COMPATIBILITY_DIR,
    `${sanitizePluginFileName(pluginTitle)}${Config.getServerSuffix()}.json`,
  );

const getAllCompatibilityFiles = (pluginTitle: string): string[] => {
  if (!fs.existsSync(COMPATIBILITY_DIR)) {
    return [];
  }

  const safeName = escapeRegExp(sanitizePluginFileName(pluginTitle));
  const pattern = new RegExp(`^${safeName}(\\.[^.]+)?\\.json$`);

  return fs
    .readdirSync(COMPATIBILITY_DIR)
    .filter(fileName => pattern.test(fileName))
    .map(fileName => path.join(COMPATIBILITY_DIR, fileName));
};

const loadReportsFromDisk = (pluginTitle: string): CompatibilityReport[] => {
  const filePath = getCompatibilityFilePath(pluginTitle);
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as CompatibilityReport[];
      if (Array.isArray(data)) {
        return data;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[CPL-Server] Error reading compatibility reports for ${pluginTitle}:`, message);
  }
  return [];
};

const saveReportsToDisk = (pluginTitle: string, reports: CompatibilityReport[]): void => {
  try {
    ensureCompatibilityDir();
    fs.writeFileSync(
      getCompatibilityFilePath(pluginTitle),
      JSON.stringify(reports, null, 2),
      'utf-8',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[CPL-Server] Error saving compatibility reports for ${pluginTitle}:`, message);
  }
};

const getAllReportsFromDisk = (): CompatibilityReport[] => {
  if (!fs.existsSync(COMPATIBILITY_DIR)) {
    return [];
  }

  const reports: CompatibilityReport[] = [];
  fs.readdirSync(COMPATIBILITY_DIR)
    .filter(fileName => fileName.endsWith('.json'))
    .forEach(fileName => {
      try {
        const filePath = path.join(COMPATIBILITY_DIR, fileName);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as CompatibilityReport[];
        if (Array.isArray(data)) {
          reports.push(...data);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[CPL-Server] Error reading compatibility file ${fileName}:`, message);
      }
    });

  return reports;
};

const aggregateReports = (pluginTitle: string): CompatibilityReport[] => {
  const seenIds = new Set<string>();
  const reports: CompatibilityReport[] = [];

  getAllCompatibilityFiles(pluginTitle).forEach(filePath => {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as CompatibilityReport[];
      if (!Array.isArray(data)) {
        return;
      }

      data.forEach(report => {
        if (!seenIds.has(report.id)) {
          seenIds.add(report.id);
          reports.push(report);
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[CPL-Server] Error reading compatibility file ${filePath}:`, message);
    }
  });

  reports.sort((left, right) => {
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });

  return reports;
};

export const CompatibilityStore = {
  getReports(pluginTitle: string, status?: CompatibilityReportStatus | null): CompatibilityReport[] {
    const reports = aggregateReports(pluginTitle);
    if (!status) {
      return reports;
    }
    return reports.filter(report => report.status === status);
  },

  addReport(pluginTitle: string, report: CompatibilityReport): CompatibilityReport {
    const reports = loadReportsFromDisk(pluginTitle);
    reports.push(report);
    saveReportsToDisk(pluginTitle, reports);
    return report;
  },

  updateReportStatus(
    pluginTitle: string,
    reportId: string,
    status: CompatibilityReportStatus,
  ): CompatibilityReport | null {
    for (const filePath of getAllCompatibilityFiles(pluginTitle)) {
      try {
        const reports = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as CompatibilityReport[];
        if (!Array.isArray(reports)) {
          continue;
        }

        const report = reports.find(r => r.id === reportId);
        if (!report) {
          continue;
        }

        report.status = status;
        report.updatedAt = new Date().toISOString();
        fs.writeFileSync(filePath, JSON.stringify(reports, null, 2), 'utf-8');
        return report;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[CPL-Server] Error updating compatibility file ${filePath}:`, message);
      }
    }

    return null;
  },

  getPendingReports(): CompatibilityReport[] {
    return getAllReportsFromDisk().filter(report => report.status === 'pending');
  },

  getAllReports(): CompatibilityReport[] {
    return getAllReportsFromDisk();
  },

  getRelatedReports(
    pluginTitle: string,
    status?: CompatibilityReportStatus | null,
  ): RelatedCompatibilityReport[] {
    const related: RelatedCompatibilityReport[] = [];
    const seen = new Set<string>();

    for (const report of getAllReportsFromDisk()) {
      if (status && report.status !== status) {
        continue;
      }

      if (report.pluginTitle === pluginTitle) {
        const key = `${report.id}:subject`;
        if (!seen.has(key)) {
          seen.add(key);
          related.push({ role: 'subject', report });
        }
      }

      for (const conflict of report.conflictingPlugins ?? []) {
        if (conflict.pluginTitle !== pluginTitle) {
          continue;
        }

        const key = `${report.id}:conflicting-plugin:${conflict.pluginTitle}`;
        if (!seen.has(key)) {
          seen.add(key);
          related.push({
            role: 'conflicting-plugin',
            report,
            conflictingPlugin: conflict,
          });
        }
      }
    }

    related.sort((left, right) => {
      return new Date(right.report.createdAt).getTime() - new Date(left.report.createdAt).getTime();
    });

    return related;
  },
};
