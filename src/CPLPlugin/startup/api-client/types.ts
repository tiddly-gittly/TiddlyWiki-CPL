export type JsonObject = Record<string, unknown>;
export type ApiCallback<T> = (error: string | null, data: T | null) => void;

export interface HttpErrorLike {
  message?: string;
  status?: number;
  statusText?: string;
}

export interface PluginStatsResponse extends JsonObject {
  plugintitle?: string;
  downloadCount?: number;
  downloadLastUpdated?: string | null;
  averageRating?: number;
  totalRatings?: number;
}

export interface OAuthResponse extends JsonObject {
  success?: boolean;
  user?: unknown;
}

export interface CPLServerApi {
  getStats: (
    pluginTitle: string,
    callback: ApiCallback<PluginStatsResponse>,
  ) => void;
  recordDownload: (
    pluginTitle: string,
    callback: ApiCallback<JsonObject>,
  ) => void;
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
