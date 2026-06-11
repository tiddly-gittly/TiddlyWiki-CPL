export interface DependencyTree {
  [key: string]: DependencyTree;
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
    refresh: (
      changes: unknown,
      container: Node | null,
      nextSibling: unknown,
    ) => boolean;
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
