export type CplPayload = Record<string, string | number | boolean | undefined>;
export type CplRequest = (type: string, payload?: CplPayload) => Promise<string>;
export type RequestHandlers = [(value: string) => void, (reason?: unknown) => void];

export interface DependencyTree {
  [key: string]: DependencyTree;
}

export interface CplMessageData {
  type?: string;
  token?: number;
  target?: string;
  payload?: string;
  success?: boolean;
}

export interface PluginInfo {
  title: string;
  author?: string;
  name?: string;
  description?: string;
  tags?: string;
  category?: string;
  versions?: Record<string, string>;
  latest?: string;
  suggestions?: string;
  dependents?: string;
  'parent-plugin'?: string;
  'versions-size'?: Record<string, number | null>;
  [key: string]: unknown;
}

type TwWithLayoutState = typeof $tw & {
  titleWidgetNode?: {
    refresh: (changes: unknown, container: Node | null, nextSibling: unknown) => boolean;
  };
  titleContainer?: HTMLElement | null;
};

export const tw = $tw as TwWithLayoutState;

type RootWidgetListener = Parameters<typeof tw.rootWidget.addEventListener>[1];

export type RootWidgetEvent = RootWidgetListener extends (
  event: infer EventType,
) => boolean | Promise<void> | undefined
  ? EventType
  : never;

export const browserRuntime = globalThis as typeof globalThis & {
  __tiddlywiki_cpl__?: CplRequest;
  __tiddlywiki_cpl__reset__?: () => void;
};