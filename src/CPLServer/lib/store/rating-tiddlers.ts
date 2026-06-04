import * as fs from 'fs';
import * as pathModule from 'path';

import { Config } from '../config';
import { Config } from '../config';
import type { AuthenticatedUser, RatingRecord, RatingStats } from '../types';

const getRatingsDir = (): string => Config.ratingsTiddlersDir;

const TID_FIELD_ORDER = [
  'title',
  'plugin-title',
  'github-id',
  'username',
  'rating',
  'timestamp',
  'type',
];

const ensureDir = (): void => {
  const dir = getRatingsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

/**
 * Parse a rating .tid file back into a RatingRecord.
 *
 * Expected format:
 * title: $:/cpl/rating/<id>
 * plugin-title: $:/plugins/xxx/yyy
 * github-id: 3746270
 * username: linonetwo
 * rating: 5
 * timestamp: 2026-06-04T12:00:00.000Z
 * type: text/vnd.tiddlywiki
 */
const parseRatingTiddler = (raw: string): RatingRecord | null => {
  const lines = raw.split(/\r?\n/);
  const fields: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') break;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.substring(0, colonIdx).trim().toLowerCase();
    const value = line.substring(colonIdx + 1).trim();

    if (
      key === 'github-id' ||
      key === 'username' ||
      key === 'rating' ||
      key === 'timestamp'
    ) {
      fields[key] = value;
    }
  }

  if (!fields['github-id'] || !fields['rating'] || !fields['timestamp']) {
    return null;
  }

  const rating = Number.parseInt(fields['rating'], 10);
  if (Number.isNaN(rating) || rating < 1 || rating > 5) return null;

  return {
    githubId: fields['github-id'],
    username: fields['username'],
    rating,
    timestamp: fields['timestamp'],
  };
};

/**
 * Read all rating .tid files for a plugin and compute aggregated stats.
 */
const readAllRatingTiddlers = (
  pluginTitle: string,
): RatingStats => {
  const dir = getRatingsDir();
  if (!fs.existsSync(dir)) {
    return { ratings: [], averageRating: 0, totalRatings: 0 };
  }

  const ratings: RatingRecord[] = [];

  for (const fileName of fs.readdirSync(dir)) {
    if (!fileName.endsWith('.tid')) continue;

    const filePath = pathModule.join(dir, fileName);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split(/\r?\n/);
      const pluginField = lines.find(
        l => l.toLowerCase().startsWith('plugin-title:'),
      );
      if (!pluginField) continue;

      const parsedPlugin = pluginField.substring(
        pluginField.indexOf(':') + 1,
      ).trim();
      if (parsedPlugin !== pluginTitle) continue;

      const parsed = parseRatingTiddler(content);
      if (parsed) ratings.push(parsed);
    } catch {
      // skip unreadable
    }
  }

  const totalRatings = ratings.length;
  const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
  const averageRating =
    totalRatings > 0
      ? Math.round((sum / totalRatings) * 10) / 10
      : 0;

  return { ratings, averageRating, totalRatings };
};

export const RatingTiddlerStore = {
  getStats(pluginTitle: string): RatingStats {
    return readAllRatingTiddlers(pluginTitle);
  },

  getAllStats(): Record<string, RatingStats> {
    const dir = getRatingsDir();
    if (!fs.existsSync(dir)) return {};

    const aggregated: Record<string, { ratings: RatingRecord[] }> = {};

    for (const fileName of fs.readdirSync(dir)) {
      if (!fileName.endsWith('.tid')) continue;
      try {
        const content = fs.readFileSync(
          pathModule.join(dir, fileName),
          'utf-8',
        );
        const lines = content.split(/\r?\n/);
        const pluginField = lines.find(
          l => l.toLowerCase().startsWith('plugin-title:'),
        );
        if (!pluginField) continue;

        const pluginTitle = pluginField
          .substring(pluginField.indexOf(':') + 1)
          .trim();
        const parsed = parseRatingTiddler(content);
        if (!parsed) continue;

        if (!aggregated[pluginTitle]) {
          aggregated[pluginTitle] = { ratings: [] };
        }
        aggregated[pluginTitle].ratings.push(parsed);
      } catch {
        // skip
      }
    }

    const result: Record<string, RatingStats> = {};
    for (const [title, data] of Object.entries(aggregated)) {
      const totalRatings = data.ratings.length;
      const sum = data.ratings.reduce((acc, r) => acc + r.rating, 0);
      result[title] = {
        ratings: data.ratings,
        averageRating:
          totalRatings > 0
            ? Math.round((sum / totalRatings) * 10) / 10
            : 0,
        totalRatings,
      };
    }

    return result;
  },

  addRating(
    pluginTitle: string,
    user: AuthenticatedUser,
    rating: number,
  ): RatingStats {
    ensureDir();

    const timestamp = new Date().toISOString();
    const ratingId = `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const tid = [
      `title: $:/cpl/rating/${ratingId}`,
      `plugin-title: ${pluginTitle}`,
      `github-id: ${user.githubId}`,
      `username: ${user.username}`,
      `rating: ${rating}`,
      `timestamp: ${timestamp}`,
      `type: text/vnd.tiddlywiki`,
    ].join('\n');

    const fileName = pathModule.join(getRatingsDir(), `${ratingId}${Config.getServerSuffix()}.tid`);
    fs.writeFileSync(fileName, tid, 'utf-8');

    return readAllRatingTiddlers(pluginTitle);
  },
};
