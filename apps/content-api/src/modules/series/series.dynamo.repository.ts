import { randomUUID } from 'crypto';
import type { SeriesSummary } from '@fire-stick/types';
import { DynamoTable } from '../../orm/dynamo-table';
import { getDocClient } from '../../orm/dynamo-client';
import type { SeriesItem } from '../../orm/entities/series.entity';
import { toSeriesSummary } from '../../orm/entities/series.entity';
import { config, createLogger } from '../../config';
import type { ISeriesRepository, CreateSeriesInput, UpdateSeriesInput } from './series.repository';

const logger = createLogger('SeriesDynamoRepository');

export class SeriesDynamoRepository implements ISeriesRepository {
  private readonly table: DynamoTable<SeriesItem>;

  constructor() {
    this.table = new DynamoTable<SeriesItem>(getDocClient(), config.getValue('seriesTable'));
    logger.debug('SeriesDynamoRepository initialized', { table: config.getValue('seriesTable') });
  }

  async findAll(): Promise<SeriesSummary[]> {
    const items = await this.table.scan();
    return items.map(toSeriesSummary);
  }

  async findById(id: string): Promise<SeriesSummary | null> {
    const item = await this.table.get(id);
    return item ? toSeriesSummary(item) : null;
  }

  async create(input: CreateSeriesInput): Promise<SeriesSummary> {
    const now  = new Date().toISOString();
    const item: SeriesItem = {
      id:           randomUUID(),
      title:        input.title,
      description:  input.description,
      category:     input.category ?? '',
      thumbnailUrl: input.thumbnailUrl,
      episodes:     [],
      createdAt:    now,
      updatedAt:    now,
    };
    await this.table.put(item);
    logger.info('Series created', { id: item.id });
    return toSeriesSummary(item);
  }

  async update(id: string, input: UpdateSeriesInput): Promise<SeriesSummary | null> {
    const updates: Partial<SeriesItem> = {
      ...input,
      updatedAt: new Date().toISOString(),
    };
    const item = await this.table.update(id, updates);
    return item ? toSeriesSummary(item) : null;
  }

  async delete(id: string): Promise<boolean> {
    return this.table.delete(id);
  }

  async syncEpisode(
    seriesId: string,
    episode:  { id: string; number: number; title: string; thumbnailUrl: string },
  ): Promise<void> {
    const series = await this.table.get(seriesId);
    if (!series) return;

    const episodes = series.episodes.filter((e) => e.id !== episode.id);
    episodes.push({ id: episode.id, number: episode.number, title: episode.title, thumbnailUrl: episode.thumbnailUrl });
    episodes.sort((a, b) => a.number - b.number);

    await this.table.update(seriesId, { episodes, updatedAt: new Date().toISOString() });
  }

  async removeEpisode(seriesId: string, episodeId: string): Promise<void> {
    const series = await this.table.get(seriesId);
    if (!series) return;

    const episodes = series.episodes.filter((e) => e.id !== episodeId);
    await this.table.update(seriesId, { episodes, updatedAt: new Date().toISOString() });
  }
}
