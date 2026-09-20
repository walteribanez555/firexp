import type { SeriesSummary, EpisodeSummary } from '@fire-stick/types';

/**
 * DynamoDB item shape for a Series.
 * Extends SeriesSummary with audit fields.
 */
export interface SeriesItem extends Record<string, unknown> {
  id:           string;
  title:        string;
  description:  string;
  category?:    string;
  thumbnailUrl: string;
  episodes:     EpisodeSummary[];
  createdAt:    string;
  updatedAt:    string;
}

export function toSeriesSummary(item: SeriesItem): SeriesSummary {
  return {
    id:           item.id,
    title:        item.title,
    description:  item.description,
    category:     item.category ?? '',
    thumbnailUrl: item.thumbnailUrl,
    episodes:     item.episodes,
  };
}
