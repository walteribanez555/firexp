import type { SeriesSummary } from '@fire-stick/types';

// ── Repository interface ──────────────────────────────────────────────────────

export interface ISeriesRepository {
  findAll(): Promise<SeriesSummary[]>;
  findById(id: string): Promise<SeriesSummary | null>;
  create(input: CreateSeriesInput): Promise<SeriesSummary>;
  update(id: string, input: UpdateSeriesInput): Promise<SeriesSummary | null>;
  delete(id: string): Promise<boolean>;
  /** Push/update an episode stub inside the series.episodes array. */
  syncEpisode(seriesId: string, episode: { id: string; number: number; title: string; thumbnailUrl: string }): Promise<void>;
  /** Remove an episode stub from the series.episodes array. */
  removeEpisode(seriesId: string, episodeId: string): Promise<void>;
}

export interface CreateSeriesInput {
  title:        string;
  description:  string;
  category?:    string;
  thumbnailUrl: string;
}

export type UpdateSeriesInput = Partial<CreateSeriesInput>;
