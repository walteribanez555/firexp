import { randomUUID } from 'crypto';
import type { EpisodeDetail } from '@fire-stick/types';
import { createLogger } from '../../config';
import { SEED_EPISODES } from '../../seed/seed-data';
import type { IEpisodesRepository, CreateEpisodeInput, UpdateEpisodeInput } from './episodes.repository';

const logger = createLogger('EpisodesMemoryRepository');

// ── In-memory store ───────────────────────────────────────────────────────────

export class EpisodesMemoryRepository implements IEpisodesRepository {
  private readonly store: Map<string, EpisodeDetail>;

  constructor(seed: EpisodeDetail[] = SEED_EPISODES) {
    this.store = new Map(seed.map((e) => [e.id, { ...e }]));
    logger.debug('EpisodesMemoryRepository initialized', { count: this.store.size });
  }

  async findById(id: string): Promise<EpisodeDetail | null> {
    return this.store.get(id) ?? null;
  }

  async findBySeriesId(seriesId: string): Promise<EpisodeDetail[]> {
    return Array.from(this.store.values()).filter((e) => e.seriesId === seriesId);
  }

  async create(input: CreateEpisodeInput): Promise<EpisodeDetail> {
    const item: EpisodeDetail = {
      id:            randomUUID(),
      seriesId:      input.seriesId,
      number:        input.number,
      title:         input.title,
      video:         input.video ?? '',
      questionnaire: input.questionnaire ?? [],
      flags:         input.flags ?? {},
      chapters:      input.chapters ?? [],
    };
    this.store.set(item.id, item);
    logger.info('Episode created (memory)', { id: item.id });
    return item;
  }

  async update(id: string, input: UpdateEpisodeInput): Promise<EpisodeDetail | null> {
    const existing = this.store.get(id);
    if (!existing) return null;

    const updated: EpisodeDetail = { ...existing, ...input };
    this.store.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}
