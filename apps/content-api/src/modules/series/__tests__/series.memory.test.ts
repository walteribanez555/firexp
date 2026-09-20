/**
 * Unit tests — SeriesMemoryRepository CRUD.
 * No AWS, no fs — pure in-memory logic.
 */

import { SeriesMemoryRepository } from '../series.memory.repository';

describe('SeriesMemoryRepository', () => {
  let repo: SeriesMemoryRepository;

  beforeEach(() => {
    // Fresh repo with default seed for each test
    repo = new SeriesMemoryRepository();
  });

  it('findAll returns seeded series', async () => {
    const all = await repo.findAll();
    expect(all.length).toBeGreaterThanOrEqual(1);
    expect(all[0]).toMatchObject({ id: 'series1', title: 'Mystery House' });
  });

  it('findById returns the correct series', async () => {
    const s = await repo.findById('series1');
    expect(s).not.toBeNull();
    expect(s?.id).toBe('series1');
  });

  it('findById returns null for missing id', async () => {
    const s = await repo.findById('does-not-exist');
    expect(s).toBeNull();
  });

  it('create adds a new series with an id', async () => {
    const created = await repo.create({
      title:        'New Series',
      description:  'Desc',
      thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
    });
    expect(created.id).toBeTruthy();
    expect(created.title).toBe('New Series');
    expect(created.episodes).toEqual([]);

    const found = await repo.findById(created.id);
    expect(found).not.toBeNull();
  });

  it('update mutates existing series', async () => {
    const updated = await repo.update('series1', { title: 'Updated Title' });
    expect(updated?.title).toBe('Updated Title');
    // description unchanged
    expect(updated?.description).toBe('A collection of interactive horror experiences where your choices change everything.');
  });

  it('update returns null for missing series', async () => {
    const result = await repo.update('ghost', { title: 'x' });
    expect(result).toBeNull();
  });

  it('delete removes the series', async () => {
    const ok = await repo.delete('series1');
    expect(ok).toBe(true);
    expect(await repo.findById('series1')).toBeNull();
  });

  it('delete returns false for missing series', async () => {
    const ok = await repo.delete('ghost');
    expect(ok).toBe(false);
  });

  it('syncEpisode adds episode stub to series', async () => {
    await repo.syncEpisode('series1', { id: 'ep99', number: 99, title: 'Bonus', thumbnailUrl: '' });
    const s = await repo.findById('series1');
    expect(s?.episodes.some((e) => e.id === 'ep99')).toBe(true);
  });

  it('removeEpisode removes episode stub', async () => {
    await repo.removeEpisode('series1', 'episode1');
    const s = await repo.findById('series1');
    expect(s?.episodes.some((e) => e.id === 'episode1')).toBe(false);
  });
});
