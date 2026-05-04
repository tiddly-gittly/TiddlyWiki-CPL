import * as fs from 'fs';
import * as path from 'path';

import { Config } from '../config';
import type { CompatibilityReport, CompatibilityReportStatus } from '../types';

const COMPATIBILITY_DIR = path.resolve(process.cwd(), 'data', 'compatibility');

const ensureCompatibilityDir = (): void => {
  if (!fs.existsSync(COMPATIBILITY_DIR)) {
    fs.mkdirSync(COMPATIBILITY_DIR, { recursive: true });
  }
};

const getCompatibilityFilePath = (pluginTitle: string): string =>
  path.join(
    COMPATIBILITY_DIR,
    `${sanitizeFileName(pluginTitle)}${Config.getServerSuffix()}.json`,
  );

const sanitizeFileName = (name: string): string =>
  name.replace(/[^a-zA-Z0-9._-]/g, '_');

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

export const CompatibilityStore = {
  getReports(pluginTitle: string, status?: CompatibilityReportStatus | null): CompatibilityReport[] {
    const reports = loadReportsFromDisk(pluginTitle);
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
    const reports = loadReportsFromDisk(pluginTitle);
    const report = reports.find(r => r.id === reportId);
    if (!report) {
      return null;
    }

    report.status = status;
    report.updatedAt = new Date().toISOString();
    saveReportsToDisk(pluginTitle, reports);
    return report;
  },

  getPendingReports(): CompatibilityReport[] {
    return getAllReportsFromDisk().filter(report => report.status === 'pending');
  },

  getAllReports(): CompatibilityReport[] {
    return getAllReportsFromDisk();
  },
};
