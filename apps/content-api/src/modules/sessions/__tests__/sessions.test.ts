/**
 * Sessions module tests — memory-mode only (no AWS required).
 * Tests cover:
 *   1. SessionsMemoryRepository — createSession / recordDecision / getEpisodeStats
 *   2. AGG math — counts, totals, pct
 *   3. HTTP layer — POST /sessions, POST /sessions/:room/decisions, GET /episodes/:id/stats
 *   4. 422 validation — PUT /episodes/:id with invalid graph
 */

import { SessionsMemoryRepository } from '../sessions.memory.repository';
import { setSessionsRepo } from '../sessions.module';
import { setEpisodesRepo } from '../../episodes/episodes.module';
import { EpisodesMemoryRepository } from '../../episodes/episodes.memory.repository';
import { app } from '../../../app';

// ── Force memory mode ─────────────────────────────────────────────────────────

beforeEach(() => {
  const sessionsRepo = new SessionsMemoryRepository();
  setSessionsRepo(sessionsRepo);
  setEpisodesRepo(new EpisodesMemoryRepository());
});

// ── 1. SessionsMemoryRepository unit tests ────────────────────────────────────

describe('SessionsMemoryRepository', () => {
  let repo: SessionsMemoryRepository;

  beforeEach(() => {
    repo = new SessionsMemoryRepository();
  });

  it('createSession is idempotent', async () => {
    const a = await repo.createSession('ROOM1', 'episode1');
    const b = await repo.createSession('ROOM1', 'episode1');
    expect(a.roomCode).toBe('ROOM1');
    expect(b.roomCode).toBe('ROOM1');
    expect(a.startedAt).toBe(b.startedAt);
  });

  it('getSession returns null for unknown room', async () => {
    const result = await repo.getSession('GHOST');
    expect(result).toBeNull();
  });

  it('recordDecision persists and increments AGG', async () => {
    await repo.createSession('ROOM2', 'episode1');
    await repo.recordDecision({
      roomCode:   'ROOM2',
      chapterId:  'ch1',
      decisionId: 'dec1',
      chosen:     'hands_up',
      votes:      { hands_up: 3, crouch: 1 },
      flagsAfter: { bravery: 2 },
      ts:         Date.now(),
    });

    const stats = await repo.getEpisodeStats('episode1');
    expect(stats.decisions['dec1']).toBeDefined();
    expect(stats.decisions['dec1'].total).toBe(1);
    expect(stats.decisions['dec1'].options['hands_up']).toBeDefined();
    expect(stats.decisions['dec1'].options['hands_up'].count).toBe(1);
  });

  it('AGG math: counts and pct are correct across multiple rooms', async () => {
    await repo.createSession('ROOMA', 'episode1');
    await repo.createSession('ROOMB', 'episode1');
    await repo.createSession('ROOMC', 'episode1');

    // ROOMA chose hands_up
    await repo.recordDecision({
      roomCode: 'ROOMA', chapterId: 'ch1', decisionId: 'dec1',
      chosen: 'hands_up', votes: {}, flagsAfter: {}, ts: 1,
    });
    // ROOMB chose hands_up
    await repo.recordDecision({
      roomCode: 'ROOMB', chapterId: 'ch1', decisionId: 'dec1',
      chosen: 'hands_up', votes: {}, flagsAfter: {}, ts: 2,
    });
    // ROOMC chose crouch
    await repo.recordDecision({
      roomCode: 'ROOMC', chapterId: 'ch1', decisionId: 'dec1',
      chosen: 'crouch', votes: {}, flagsAfter: {}, ts: 3,
    });

    const stats = await repo.getEpisodeStats('episode1');
    const dec   = stats.decisions['dec1'];

    expect(dec).toBeDefined();
    expect(dec.total).toBe(3);
    expect(dec.options['hands_up'].count).toBe(2);
    expect(dec.options['crouch'].count).toBe(1);

    // pct: hands_up = 66.7%, crouch = 33.3%
    expect(dec.options['hands_up'].pct).toBeCloseTo(66.7, 0);
    expect(dec.options['crouch'].pct).toBeCloseTo(33.3, 0);
  });

  it('getEpisodeStats returns empty decisions when no data', async () => {
    const stats = await repo.getEpisodeStats('episode-with-no-sessions');
    expect(stats.decisions).toEqual({});
  });

  it('getSessionDecisions returns recorded decisions for a room', async () => {
    await repo.createSession('ROOQ', 'episode1');
    await repo.recordDecision({
      roomCode: 'ROOQ', chapterId: 'ch1', decisionId: 'decX',
      chosen: 'stand_up', votes: { stand_up: 4 }, flagsAfter: {}, ts: 99,
    });
    const decs = await repo.getSessionDecisions('ROOQ');
    expect(decs).toHaveLength(1);
    expect(decs[0].chosen).toBe('stand_up');
    expect(decs[0].decisionId).toBe('decX');
  });
});

// ── 2. HTTP: POST /api/v1/sessions ───────────────────────────────────────────

describe('POST /api/v1/sessions', () => {
  it('creates a session and returns 201', async () => {
    const res = await app.request('/api/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode: 'HTTPROOM', episodeId: 'episode1' }),
    });
    expect(res.status).toBe(201);
    const json = await res.json() as { data: { roomCode: string; episodeId: string } };
    expect(json.data.roomCode).toBe('HTTPROOM');
    expect(json.data.episodeId).toBe('episode1');
  });

  it('returns 400 when roomCode is missing', async () => {
    const res = await app.request('/api/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ episodeId: 'episode1' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when episodeId is missing', async () => {
    const res = await app.request('/api/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode: 'HTTPROOM' }),
    });
    expect(res.status).toBe(400);
  });
});

// ── 3. HTTP: POST /api/v1/sessions/:roomCode/decisions ───────────────────────

describe('POST /api/v1/sessions/:roomCode/decisions', () => {
  beforeEach(async () => {
    // Ensure session exists
    await app.request('/api/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode: 'DEC-ROOM', episodeId: 'episode1' }),
    });
  });

  it('records a decision and returns 200', async () => {
    const res = await app.request('/api/v1/sessions/DEC-ROOM/decisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chapterId: 'ch1', decisionId: 'dec1', chosen: 'hands_up',
        votes: { hands_up: 3 }, flagsAfter: { bravery: 1 },
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json() as { data: { ok: boolean } };
    expect(json.data.ok).toBe(true);
  });

  it('returns 400 when decisionId is missing', async () => {
    const res = await app.request('/api/v1/sessions/DEC-ROOM/decisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapterId: 'ch1', chosen: 'hands_up' }),
    });
    expect(res.status).toBe(400);
  });
});

// ── 4. HTTP: GET /api/v1/episodes/:id/stats ──────────────────────────────────

describe('GET /api/v1/episodes/:id/stats', () => {
  it('returns empty stats for an episode with no sessions', async () => {
    const res = await app.request('/api/v1/episodes/episode1/stats');
    expect(res.status).toBe(200);
    const json = await res.json() as { data: { decisions: Record<string, unknown> } };
    expect(json.data).toBeDefined();
    expect(json.data.decisions).toBeDefined();
  });

  it('returns correct counts and pct after decisions are posted', async () => {
    // Create 3 sessions
    for (const code of ['S1', 'S2', 'S3']) {
      await app.request('/api/v1/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: code, episodeId: 'ep-stats-test' }),
      });
    }

    // S1 and S2 choose hands_up; S3 chooses crouch
    await app.request('/api/v1/sessions/S1/decisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapterId: 'ch1', decisionId: 'myDec', chosen: 'hands_up', votes: {}, flagsAfter: {} }),
    });
    await app.request('/api/v1/sessions/S2/decisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapterId: 'ch1', decisionId: 'myDec', chosen: 'hands_up', votes: {}, flagsAfter: {} }),
    });
    await app.request('/api/v1/sessions/S3/decisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapterId: 'ch1', decisionId: 'myDec', chosen: 'crouch', votes: {}, flagsAfter: {} }),
    });

    const res = await app.request('/api/v1/episodes/ep-stats-test/stats');
    expect(res.status).toBe(200);

    const json = await res.json() as {
      data: {
        decisions: {
          myDec: {
            total: number;
            options: { hands_up?: { count: number; pct: number }; crouch?: { count: number; pct: number } };
          };
        };
      };
    };

    const dec = json.data.decisions['myDec'];
    expect(dec).toBeDefined();
    expect(dec.total).toBe(3);
    expect(dec.options['hands_up']?.count).toBe(2);
    expect(dec.options['crouch']?.count).toBe(1);
    expect(dec.options['hands_up']?.pct).toBeCloseTo(66.7, 0);
    expect(dec.options['crouch']?.pct).toBeCloseTo(33.3, 0);
  });
});

// ── 5. 422 validation on PUT /episodes/:id ────────────────────────────────────

describe('PUT /api/v1/episodes/:id — graph validation', () => {
  it('returns 422 with INVALID_GRAPH when chapters have bad schema', async () => {
    // Provide a chapter with a variant that has no "default" last — but let's
    // use a schema violation: chapter with empty variants array
    const invalidBody = {
      title: 'Test Episode',
      chapters: [
        {
          id:        'ch-bad',
          title:     'Bad Chapter',
          decisions: [],
          variants:  [],   // violates min(1) constraint
        },
      ],
      flags: {},
      video: '/v.mp4',
    };

    const res = await app.request('/api/v1/episodes/episode1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidBody),
    });

    expect(res.status).toBe(422);
    const json = await res.json() as { error: string; code: string; issues: unknown[] };
    expect(json.code).toBe('INVALID_GRAPH');
    expect(Array.isArray(json.issues)).toBe(true);
    expect(json.issues.length).toBeGreaterThan(0);
  });

  it('returns 200 with warnings field when graph has warnings but no errors', async () => {
    // A valid graph: single chapter, variants has a default, decision is inconsequential.
    // The seeded episode1 should pass validation with no issues (or just warnings).
    const res = await app.request('/api/v1/episodes/episode1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated Title' }),
    });

    // Seeded episode may or may not have warnings — should not be 422
    expect(res.status).toBe(200);
    const json = await res.json() as { data: { title: string }; warnings?: unknown[] };
    expect(json.data.title).toBe('Updated Title');
  });

  it('accepts a perfectly valid graph with no issues', async () => {
    const validBody = {
      title:   'Clean Episode',
      video:   '/clean.mp4',
      flags:   { bravery: 0 },
      chapters: [
        {
          id:    'ch1',
          title: 'Chapter One',
          decisions: [
            {
              id:      'd1',
              phase:   'pre',
              window:  10,
              prompt:  'Choose',
              options: [
                { gesture: 'hands_up',   label: 'Up',   set: { bravery: '+1' } },
                { gesture: 'crouch',     label: 'Down', set: { bravery: '-1' } },
              ],
              default: { set: {} },
            },
          ],
          variants: [
            { in: 0, out: 30, when: 'bravery >= 1', tag: 'brave' },
            { in: 0, out: 30, when: 'default',      tag: 'coward' },
          ],
        },
      ],
      questionnaire: [],
    };

    const res = await app.request('/api/v1/episodes/episode1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(200);
    const json = await res.json() as { data: { title: string } };
    expect(json.data.title).toBe('Clean Episode');
  });
});
