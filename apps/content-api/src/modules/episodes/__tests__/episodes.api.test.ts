/**
 * Integration tests — GET /api/v1/episodes/:id returns EpisodeDetail shape.
 * Uses the in-memory repository (no AWS).
 */

import { app } from '../../../app';
import type { EpisodeDetail } from '@fire-stick/types';

describe('GET /api/v1/episodes/:id', () => {
  it('returns 200 with EpisodeDetail shape for seeded episode1', async () => {
    const res = await app.request('/api/v1/episodes/episode1');
    expect(res.status).toBe(200);

    const json = await res.json() as { data: EpisodeDetail };
    const ep   = json.data;

    // Top-level envelope
    expect(ep).toBeDefined();

    // EpisodeDetail-specific fields
    expect(ep.id).toBe('episode1');
    expect(ep.seriesId).toBe('series1');
    expect(typeof ep.number).toBe('number');
    expect(Array.isArray(ep.questionnaire)).toBe(true);

    // StoryGraph fields
    expect(typeof ep.video).toBe('string');
    expect(typeof ep.title).toBe('string');
    expect(typeof ep.flags).toBe('object');
    expect(Array.isArray(ep.chapters)).toBe(true);

    // At least one chapter with decisions and variants
    const ch = ep.chapters[0];
    expect(ch).toBeDefined();
    expect(typeof ch.id).toBe('string');
    expect(Array.isArray(ch.decisions)).toBe(true);
    expect(Array.isArray(ch.variants)).toBe(true);
  });

  it('returns 404 for unknown episode', async () => {
    const res = await app.request('/api/v1/episodes/does-not-exist');
    expect(res.status).toBe(404);
    const json = await res.json() as { error: string };
    expect(json.error).toMatch(/not found/i);
  });
});

describe('GET /api/v1/series', () => {
  it('returns 200 with data array including seeded series', async () => {
    const res = await app.request('/api/v1/series');
    expect(res.status).toBe(200);
    const json = await res.json() as { data: unknown[] };
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/v1/health', () => {
  it('returns status ok', async () => {
    const res = await app.request('/api/v1/health');
    expect(res.status).toBe(200);
    const json = await res.json() as { status: string };
    expect(json.status).toBe('ok');
  });
});
