/**
 * Unit tests — EpisodesMemoryRepository CRUD.
 * No AWS — pure in-memory logic.
 */

import { EpisodesMemoryRepository } from '../episodes.memory.repository';
import type { EpisodeDetail } from '@fire-stick/types';

describe('EpisodesMemoryRepository', () => {
  let repo: EpisodesMemoryRepository;

  beforeEach(() => {
    repo = new EpisodesMemoryRepository();
  });

  it('findById returns seeded episode1', async () => {
    const ep = await repo.findById('episode1');
    expect(ep).not.toBeNull();
    expect(ep?.id).toBe('episode1');
    expect(ep?.seriesId).toBe('series1');
    expect(ep?.number).toBe(1);
  });

  it('findById returns null for missing episode', async () => {
    const ep = await repo.findById('ghost');
    expect(ep).toBeNull();
  });

  it('findBySeriesId returns episodes for a given series', async () => {
    const eps = await repo.findBySeriesId('series1');
    expect(eps.length).toBeGreaterThanOrEqual(1);
    eps.forEach((e) => expect(e.seriesId).toBe('series1'));
  });

  it('create adds a new episode', async () => {
    const ep = await repo.create({
      seriesId: 'series1',
      number:   2,
      title:    'Episode Two',
    });
    expect(ep.id).toBeTruthy();
    expect(ep.seriesId).toBe('series1');
    expect(ep.number).toBe(2);
    expect(ep.questionnaire).toEqual([]);
    expect(ep.chapters).toEqual([]);

    const found = await repo.findById(ep.id);
    expect(found).not.toBeNull();
  });

  it('update mutates the episode', async () => {
    const updated = await repo.update('episode1', { title: 'New Title' });
    expect(updated?.title).toBe('New Title');
    // other fields unchanged
    expect(updated?.seriesId).toBe('series1');
  });

  it('update returns null for missing episode', async () => {
    const result = await repo.update('ghost', { title: 'x' });
    expect(result).toBeNull();
  });

  it('delete removes the episode', async () => {
    const ok = await repo.delete('episode1');
    expect(ok).toBe(true);
    expect(await repo.findById('episode1')).toBeNull();
  });

  it('delete returns false for missing episode', async () => {
    const ok = await repo.delete('ghost');
    expect(ok).toBe(false);
  });

  it('seeded EpisodeDetail has correct shape (StoryGraph + id + seriesId + number + questionnaire)', async () => {
    const ep = await repo.findById('episode1') as EpisodeDetail;

    // EpisodeDetail fields
    expect(typeof ep.id).toBe('string');
    expect(typeof ep.seriesId).toBe('string');
    expect(typeof ep.number).toBe('number');
    expect(Array.isArray(ep.questionnaire)).toBe(true);

    // StoryGraph fields
    expect(typeof ep.video).toBe('string');
    expect(typeof ep.title).toBe('string');
    expect(typeof ep.flags).toBe('object');
    expect(Array.isArray(ep.chapters)).toBe(true);

    // Chapter structure
    const ch = ep.chapters[0];
    expect(typeof ch.id).toBe('string');
    expect(Array.isArray(ch.decisions)).toBe(true);
    expect(Array.isArray(ch.variants)).toBe(true);
  });
});
