export interface HttpErrorLike {
  message?: string;
  status?: number;
  statusText?: string;
}

export interface OAuthResponse {
  success?: boolean;
  user?: unknown;
}

export const tw = $tw as typeof $tw & {
  cpl?: unknown;
  cplServerAPI?: unknown;
};

type RootWidgetListener = Parameters<typeof tw.rootWidget.addEventListener>[1];
export type RootWidgetEvent = RootWidgetListener extends (
  event: infer EventType,
) => boolean | Promise<void> | undefined
  ? EventType
  : never;
