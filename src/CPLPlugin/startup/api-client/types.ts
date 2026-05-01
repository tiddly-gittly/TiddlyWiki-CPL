export type JsonObject = Record<string, unknown>;
export type ApiCallback<T> = (error: string | null, data: T | null) => void;

export interface HttpErrorLike {
  message?: string;
  status?: number;
  statusText?: string;
}

export interface AuthStatusResponse extends JsonObject {
  authenticated?: boolean;
  user?: unknown;
}

export interface RatingResponse extends JsonObject {
  averageRating?: number;
  totalRatings?: number;
}

export interface OAuthResponse extends JsonObject {
  success?: boolean;
  token?: string;
  user?: unknown;
}

export interface CPLServerApi {
  recordDownload: (pluginTitle: string, callback: ApiCallback<JsonObject>) => void;
  getStats: (pluginTitle: string, callback: ApiCallback<JsonObject>) => void;
  getAllStats: (callback: ApiCallback<JsonObject>) => void;
  submitRating: (
    pluginTitle: string,
    rating: number,
    callback: ApiCallback<RatingResponse>,
  ) => void;
  getChangelog: (pluginTitle: string, callback: ApiCallback<JsonObject>) => void;
  getComments: (pluginTitle: string, callback: ApiCallback<JsonObject>) => void;
  submitComment: (
    pluginTitle: string,
    content: string,
    callback: ApiCallback<JsonObject>,
  ) => void;
  checkAuthStatus: (callback: ApiCallback<AuthStatusResponse>) => void;
  logout: () => void;
}

export type TwWithCplApi = typeof $tw & {
  cpl?: CPLServerApi;
  cplServerAPI?: CPLServerApi;
};

export const tw = $tw as TwWithCplApi;

type RootWidgetListener = Parameters<typeof tw.rootWidget.addEventListener>[1];
export type RootWidgetEvent = RootWidgetListener extends (
  event: infer EventType,
) => boolean | Promise<void> | undefined
  ? EventType
  : never;
