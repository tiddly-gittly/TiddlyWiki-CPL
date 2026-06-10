export type JsonObject = Record<string, unknown>;
export type ApiCallback<T> = (error: string | null, data: T | null) => void;

export interface HttpErrorLike {
  message?: string;
  status?: number;
  statusText?: string;
}

export interface RatingResponse extends JsonObject {
  averageRating?: number;
  totalRatings?: number;
}

export interface OAuthResponse extends JsonObject {
  success?: boolean;
  user?: unknown;
}

export interface CPLServerApi {
  recordDownload: (
    pluginTitle: string,
    callback: ApiCallback<JsonObject>,
  ) => void;
  submitRating: (
    pluginTitle: string,
    rating: number,
    callback: ApiCallback<RatingResponse>,
  ) => void;
  submitComment: (
    pluginTitle: string,
    content: string,
    callback: ApiCallback<JsonObject>,
  ) => void;
  submitCompatibilityReport: (
    pluginTitle: string,
    payload: {
      twVersionMin?: string;
      twVersionMax?: string;
      conflictingPlugins: Array<{ pluginTitle: string; description: string }>;
      description: string;
    },
    callback: ApiCallback<JsonObject>,
  ) => void;
  logout: () => void;
  moderateComment: (
    pluginTitle: string,
    commentId: string,
    status: string,
    callback: ApiCallback<JsonObject>,
  ) => void;
  moderateCompatibilityReport: (
    pluginTitle: string,
    reportId: string,
    status: string,
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
