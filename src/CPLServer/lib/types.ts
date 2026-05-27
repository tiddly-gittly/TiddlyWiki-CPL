import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from 'http';
import type { ServerEndpointContext } from 'tiddlywiki';

export interface RouteRequest extends IncomingMessage {
  headers: IncomingHttpHeaders;
  connection: IncomingMessage['socket'] & {
    remoteAddress?: string | null;
  };
  socket: IncomingMessage['socket'] & {
    remoteAddress?: string | null;
  };
  url?: string;
}

export interface RouteContext extends ServerEndpointContext {
  sendResponse: (
    statusCode: number,
    headers: Record<string, string>,
    body: string,
  ) => void;
}

export type RouteHandler = (
  request: RouteRequest,
  response: ServerResponse,
  context: RouteContext,
) => void | Promise<void>;

export interface AuthenticatedUser {
  githubId: string;
  username: string;
  avatar: string;
}

export interface TokenPayload extends AuthenticatedUser {
  exp?: number;
  iat?: number;
}

export interface DownloadStats {
  downloadCount: number;
  lastUpdated: string | null;
  downloadsByIp: Record<string, string>;
}

export interface RatingRecord {
  ip: string;
  rating: number;
  timestamp: string;
}

export interface RatingStats {
  ratings: RatingRecord[];
  averageRating: number;
  totalRatings: number;
}

export type CommentStatus = 'pending' | 'approved' | 'rejected' | 'deleted';

export interface CommentRecord {
  id: string;
  githubId: string;
  username: string;
  avatar: string;
  content: string;
  status: CommentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CommentFile {
  pluginTitle: string;
  comments: CommentRecord[];
}

export interface PendingCommentRecord {
  pluginTitle: string;
  comment: CommentRecord;
}

export type CompatibilityReportStatus = 'pending' | 'approved' | 'rejected';

export type CompatibilitySeverity = 'info' | 'warning' | 'error';

export type CompatibilityConflictType =
  | 'conflict'
  | 'breaks'
  | 'requires'
  | 'replaces'
  | 'optional';

export interface ConflictingPlugin {
  pluginTitle: string;
  description: string;
  versionMin?: string;
  versionMax?: string;
  severity?: CompatibilitySeverity;
  type?: CompatibilityConflictType;
}

export interface CompatibilityReport {
  id: string;
  pluginTitle: string;
  reporterGithubId: string;
  reporterUsername: string;
  twVersionMin?: string;
  twVersionMax?: string;
  conflictingPlugins: ConflictingPlugin[];
  description: string;
  status: CompatibilityReportStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RelatedCompatibilityReport {
  role: 'subject' | 'conflicting-plugin';
  report: CompatibilityReport;
  conflictingPlugin?: ConflictingPlugin;
}

export interface GitHubTokenResponse {
  access_token?: string;
  [key: string]: unknown;
}

export interface GitHubUserProfile {
  id?: number;
  login?: string;
  name?: string;
  avatar_url?: string;
  [key: string]: unknown;
}
