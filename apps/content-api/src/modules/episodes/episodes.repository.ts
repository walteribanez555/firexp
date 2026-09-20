import type { EpisodeDetail, StoryChapter, Question, Flags } from '@fire-stick/types';

// ── Repository interface ──────────────────────────────────────────────────────

export interface IEpisodesRepository {
  findById(id: string): Promise<EpisodeDetail | null>;
  findBySeriesId(seriesId: string): Promise<EpisodeDetail[]>;
  create(input: CreateEpisodeInput): Promise<EpisodeDetail>;
  update(id: string, input: UpdateEpisodeInput): Promise<EpisodeDetail | null>;
  delete(id: string): Promise<boolean>;
}

export interface CreateEpisodeInput {
  seriesId:      string;
  number:        number;
  title:         string;
  video?:        string;
  questionnaire?: Question[];
  flags?:        Flags;
  chapters?:     StoryChapter[];
}

export type UpdateEpisodeInput = Partial<Omit<EpisodeDetail, 'id' | 'seriesId'>>;
