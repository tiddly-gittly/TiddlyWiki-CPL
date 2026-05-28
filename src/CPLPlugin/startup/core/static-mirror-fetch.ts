/**
 * Static-mirror-first download for plugin JSON.
 *
 * Priority order for fetching plugin tiddler JSON:
 *   1. https://tw-cpl.netlify.app  (primary static mirror)
 *   2. https://tiddly-gittly.github.io/TiddlyWiki-CPL  (secondary static mirror)
 *   3. caller falls back to cpl('Install', ...) via the bridge (server or current mirror)
 *
 * The static library serves files at:
 *   {origin}/plugins/{formattedTitle}.json
 *
 * where formattedTitle mirrors the build-side formatTitle() transform:
 *   $:/plugins/author/name  →  author_name
 *   $:/languages/…          →  languages_…
 *   $:/themes/…             →  themes_…
 *   special chars           →  _
 *   then URI-encoded
 */

/** Mirrors to try in order before falling back to the bridge. */
export const STATIC_MIRROR_BASES = [
  'https://tw-cpl.netlify.app',
  'https://tiddly-gittly.github.io/TiddlyWiki-CPL',
] as const;

const normalizeRepoEntry = (entry: string): string => entry.replace(/\/$/, '');

export const fetchStaticRepoFile = async (
  repoEntry: string,
  path: string,
): Promise<string> => {
  const url = `${normalizeRepoEntry(repoEntry)}/${path.replace(/^\//, '')}`;
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }

  return response.text();
};

/**
 * Transform a TiddlyWiki plugin title into the filename used by the static
 * library, matching the build-time formatTitle() in scripts/utils/tiddler.ts.
 */
export const formatPluginTitle = (title: string): string =>
  encodeURIComponent(
    title
      .replace('$:/plugins/', '')
      .replace('$:/languages/', 'languages_')
      .replace('$:/themes/', 'themes_')
      .replace(/[:/<>"|?*]/g, '_'),
  );

const fetchFromMirror = async (
  base: string,
  title: string,
): Promise<string> => {
  const url = `${base}/plugins/${formatPluginTitle(title)}.json`;
  const response = await fetch(url, {
    // Treat non-OK responses as errors so we can fall through to the next mirror.
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }

  const text = await response.text();
  // Sanity-check: the payload should be a JSON object starting with '{'.
  if (!text.trimStart().startsWith('{')) {
    throw new Error(`Unexpected response body from ${url}`);
  }

  return text;
};

/**
 * Try to download a plugin JSON from static mirrors in priority order.
 *
 * @param title  The TiddlyWiki plugin tiddler title.
 * @returns      Resolved with the raw JSON string, or rejects if ALL mirrors failed.
 */
export const fetchPluginFromStaticMirrors = async (
  title: string,
): Promise<string> => {
  const errors: string[] = [];
  for (const base of STATIC_MIRROR_BASES) {
    try {
      return await fetchFromMirror(base, title);
    } catch (error) {
      errors.push(String(error));
    }
  }

  throw new Error(
    `All static mirrors failed for "${title}": ${errors.join('; ')}`,
  );
};
