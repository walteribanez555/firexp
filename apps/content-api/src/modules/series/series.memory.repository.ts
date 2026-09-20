import { randomUUID } from 'crypto';
import type { SeriesSummary } from '@fire-stick/types';
import { createLogger } from '../../config';
import { SEED_SERIES } from '../../seed/seed-data';
import type { ISeriesRepository, CreateSeriesInput, UpdateSeriesInput } from './series.repository';

const logger = createLogger('SeriesMemoryRepository');

// ── In-memory store ───────────────────────────────────────────────────────────

export class SeriesMemoryRepository implements ISeriesRepository {
  private readonly store: Map<string, SeriesSummary>;

  constructor(seed: SeriesSummary[] = SEED_SERIES) {
    this.store = new Map(seed.map((s) => [s.id, { ...s, episodes: [...s.episodes] }]));
    logger.debug('SeriesMemoryRepository initialized', { count: this.store.size });
  }

  async findAll(): Promise<SeriesSummary[]> {
    return Array.from(this.store.values());
  }

  async findById(id: string): Promise<SeriesSummary | null> {
    return this.store.get(id) ?? null;
  }

  async create(input: CreateSeriesInput): Promise<SeriesSummary> {
    const item: SeriesSummary = {
      id:           randomUUID(),
      title:        input.title,
      description:  input.description,
      thumbnailUrl: input.thumbnailUrl,
      episodes:     [],
    };
    this.store.set(item.id, item);
    logger.info('Series created (memory)', { id: item.id });
    return item;
  }

  async update(id: string, input: UpdateSeriesInput): Promise<SeriesSummary | null> {
    const existing = this.store.get(id);
    if (!existing) return null;

    const updated: SeriesSummary = { ...existing, ...input };
    this.store.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async syncEpisode(
    seriesId: string,
    episode:  { id: string; number: number; title: string; thumbnailUrl: string },
  ): Promise<void> {
    const series = this.store.get(seriesId);
    if (!series) return;

    const episodes = series.episodes.filter((e) => e.id !== episode.id);
    episodes.push(episode);
    episodes.sort((a, b) => a.number - b.number);
    this.store.set(seriesId, { ...series, episodes });
  }

  async removeEpisode(seriesId: string, episodeId: string): Promise<void> {
    const series = this.store.get(seriesId);
    if (!series) return;

    const episodes = series.episodes.filter((e) => e.id !== episodeId);
    this.store.set(seriesId, { ...series, episodes });
  }
}
