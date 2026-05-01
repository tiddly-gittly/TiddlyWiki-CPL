import * as path from 'path';

const dotenv = require('dotenv') as {
  config: () => void;
};

try {
  dotenv.config();
} catch {
  console.warn('[CPL-Server] dotenv not available, using process.env directly');
}

const env = (key: string, defaultValue: string): string => {
  const value = process.env[key];
  return value !== undefined ? value : defaultValue;
};

const envInt = (key: string, defaultValue: number): number => {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

const envList = (key: string): string[] => {
  const value = process.env[key];
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
};

const adminGithubIds = envList('CPL_ADMIN_GITHUB_IDS');
const serverId = env('CPL_SERVER_ID', '');

export const Config = {
  jwtSecret: env('CPL_JWT_SECRET', 'default-dev-secret-change-me'),
  jwtExpiryDays: envInt('CPL_JWT_EXPIRY_DAYS', 30),
  githubClientId: env('CPL_GITHUB_CLIENT_ID', ''),
  githubClientSecret: env('CPL_GITHUB_CLIENT_SECRET', ''),
  adminGithubIds,
  commentRateLimit: envInt('CPL_COMMENT_RATE_LIMIT', 10),
  serverId,
  dataDir: path.resolve(process.cwd(), 'data'),
  commentsDir: path.resolve(process.cwd(), 'data', 'comments'),
  isAdmin: (githubId?: string | number | null): boolean => {
    if (!githubId) {
      return false;
    }

    return adminGithubIds.includes(String(githubId));
  },
  getServerSuffix: (): string => (serverId ? `.${serverId}` : ''),
} as const;