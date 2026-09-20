import { apiClient } from '@/lib/api-client';
import type { SeriesSummary, EpisodeDetail } from '@fire-stick/types';

// ─── Series ────────────────────────────────────────────────────────────────

export function fetchAllSeries(): Promise<SeriesSummary[]> {
  return apiClient.get<SeriesSummary[]>('/series');
}

export function fetchSeries(id: string): Promise<SeriesSummary> {
  return apiClient.get<SeriesSummary>(`/series/${id}`);
}

export interface CreateSeriesPayload {
  title: string;
  description: string;
  category?: string;
  thumbnailUrl?: string;
}

export function createSeries(payload: CreateSeriesPayload): Promise<SeriesSummary> {
  return apiClient.post<SeriesSummary>('/series', payload);
}

export function updateSeries(id: string, payload: Partial<CreateSeriesPayload>): Promise<SeriesSummary> {
  return apiClient.put<SeriesSummary>(`/series/${id}`, payload);
}

export function deleteSeries(id: string): Promise<void> {
  return apiClient.delete<void>(`/series/${id}`);
}

// ─── Episodes ──────────────────────────────────────────────────────────────

export function fetchEpisode(id: string): Promise<EpisodeDetail> {
  return apiClient.get<EpisodeDetail>(`/episodes/${id}`);
}

export interface CreateEpisodePayload {
  title: string;
  // The backend assigns the number automatically (unique per series). We still send
  // a computed next-number for backward-compatibility with older backend builds.
  number?: number;
}

export function createEpisode(seriesId: string, payload: CreateEpisodePayload): Promise<EpisodeDetail> {
  return apiClient.post<EpisodeDetail>(`/series/${seriesId}/episodes`, payload);
}

export function updateEpisode(id: string, payload: Partial<EpisodeDetail>): Promise<EpisodeDetail> {
  return apiClient.put<EpisodeDetail>(`/episodes/${id}`, payload);
}

export function deleteEpisode(id: string): Promise<void> {
  return apiClient.delete<void>(`/episodes/${id}`);
}
