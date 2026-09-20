import { randomUUID } from 'crypto';
import type { EpisodeDetail } from '@fire-stick/types';
import { DynamoTable } from '../../orm/dynamo-table';
import { getDocClient } from '../../orm/dynamo-client';
import type { EpisodeItem } from '../../orm/entities/episode.entity';
import { toEpisodeDetail } from '../../orm/entities/episode.entity';
import { config, createLogger } from '../../config';
import type { IEpisodesRepository, CreateEpisodeInput, UpdateEpisodeInput } from './episodes.repository';

const logger = createLogger('EpisodesDynamoRepository');

export class EpisodesDynamoRepository implements IEpisodesRepository {
  private readonly table: DynamoTable<EpisodeItem>;

  constructor() {
    this.table = new DynamoTable<EpisodeItem>(getDocClient(), config.getValue('episodesTable'));
    logger.debug('EpisodesDynamoRepository initialized', { table: config.getValue('episodesTable') });
  }

  async findById(id: string): Promise<EpisodeDetail | null> {
    const item = await this.table.get(id);
    return item ? toEpisodeDetail(item) : null;
  }

  async findBySeriesId(seriesId: string): Promise<EpisodeDetail[]> {
    const items = await this.table.queryIndex({
      indexName: 'seriesId-number-index',
      pk: { name: 'seriesId', value: seriesId },
    });
    return items.map(toEpisodeDetail);
  }

  async create(input: CreateEpisodeInput): Promise<EpisodeDetail> {
    const now  = new Date().toISOString();
    const item: EpisodeItem = {
      id:            randomUUID(),
      seriesId:      input.seriesId,
      number:        input.number,
      title:         input.title,
      video:         input.video ?? '',
      questionnaire: input.questionnaire ?? [],
      flags:         input.flags ?? {},
      chapters:      input.chapters ?? [],
      createdAt:     now,
      updatedAt:     now,
    };
    await this.table.put(item);
    logger.info('Episode created', { id: item.id, seriesId: item.seriesId });
    return toEpisodeDetail(item);
  }

  async update(id: string, input: UpdateEpisodeInput): Promise<EpisodeDetail | null> {
    const updates: Partial<EpisodeItem> = {
      ...(input.title         !== undefined ? { title:         input.title }         : {}),
      ...(input.number        !== undefined ? { number:        input.number }        : {}),
      ...(input.video         !== undefined ? { video:         input.video }         : {}),
      ...(input.questionnaire !== undefined ? { questionnaire: input.questionnaire } : {}),
      ...(input.flags         !== undefined ? { flags:         input.flags }         : {}),
      ...(input.chapters      !== undefined ? { chapters:      input.chapters }      : {}),
      updatedAt: new Date().toISOString(),
    };
    const item = await this.table.update(id, updates);
    return item ? toEpisodeDetail(item) : null;
  }

  async delete(id: string): Promise<boolean> {
    return this.table.delete(id);
  }
}
