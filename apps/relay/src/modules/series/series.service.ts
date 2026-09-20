import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SeriesSummary, EpisodeDetail } from './series.types';
import { createLogger } from '../../config';

const logger     = createLogger('SeriesService');
const SERIES_DIR = join(process.cwd(), 'series');

/**
 * Source of truth for catalog data.
 *
 * When `CONTENT_API_URL` is set (e.g. http://localhost:3003/api/v1) the relay
 * reads series/episodes from the content-api management backend — the authoritative
 * store backed by DynamoDB. If it is unset or unreachable, the relay falls back to
 * the bundled `series/*.json` files so local/offline demos keep working.
 */
const CONTENT_API_URL = process.env.CONTENT_API_URL?.replace(/\/$/, '') ?? '';

const seriesCache:  SeriesSummary[]            = [];
const episodeCache: Map<string, EpisodeDetail> = new Map();

// ── Remote (content-api) ────────────────────────────────────────────────────────

async function fetchFromApi<T>(path: string): Promise<T | null> {
  if (!CONTENT_API_URL) return null;
  try {
    const res = await fetch(`${CONTENT_API_URL}${path}`);
    if (!res.ok) { logger.warn(`content-api ${path} → ${res.status}`); return null; }
    const body = await res.json() as { data: T };
    return body.data;
  } catch (err) {
    logger.warn(`content-api ${path} unreachable, using local fallback`, err);
    return null;
  }
}

// ── Local fallback (bundled JSON) ───────────────────────────────────────────────

function loadSeriesList(): SeriesSummary[] {
  if (seriesCache.length > 0) return seriesCache;

  const path = join(SERIES_DIR, 'series.json');
  if (!existsSync(path)) { logger.warn('series/series.json not found'); return []; }

  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as SeriesSummary[];
    seriesCache.push(...data);
    return seriesCache;
  } catch (err) {
    logger.error('Failed to parse series.json', err);
    return [];
  }
}

function loadEpisode(episodeId: string): EpisodeDetail | null {
  if (episodeCache.has(episodeId)) return episodeCache.get(episodeId)!;

  const path = join(SERIES_DIR, 'episodes', `${episodeId}.json`);
  if (!existsSync(path)) { logger.warn(`Episode not found: ${episodeId}`); return null; }

  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as EpisodeDetail;
    episodeCache.set(episodeId, data);
    return data;
  } catch (err) {
    logger.error(`Failed to parse episode ${episodeId}`, err);
    return null;
  }
}

// ── Public API (async: remote first, local fallback) ────────────────────────────

export const seriesService = {
  async list(): Promise<SeriesSummary[]> {
    return (await fetchFromApi<SeriesSummary[]>('/series')) ?? loadSeriesList();
  },
  async getSeries(id: string): Promise<SeriesSummary | null> {
    return (await fetchFromApi<SeriesSummary>(`/series/${id}`))
      ?? (loadSeriesList().find((s) => s.id === id) ?? null);
  },
  async getEpisode(id: string): Promise<EpisodeDetail | null> {
    return (await fetchFromApi<EpisodeDetail>(`/episodes/${id}`)) ?? loadEpisode(id);
  },
  /** Proxy the content-api aggregate stats ("% of rooms chose X") for the phone. */
  async getEpisodeStats(id: string): Promise<unknown | null> {
    return fetchFromApi<unknown>(`/episodes/${id}/stats`);
  },
};
