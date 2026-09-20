import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchAllSeries,
  fetchSeries,
  createSeries,
  updateSeries,
  deleteSeries,
  generateSeriesCover,
  fetchEpisode,
  createEpisode,
  updateEpisode,
  deleteEpisode,
  type CreateSeriesPayload,
  type CreateEpisodePayload,
} from '../api/series.api';
import type { EpisodeDetail } from '@fire-stick/types';

export const SERIES_KEY = ['series'] as const;
export const seriesDetailKey = (id: string) => ['series', id] as const;
export const episodeKey = (id: string) => ['episode', id] as const;

// ─── Series hooks ──────────────────────────────────────────────────────────

export function useAllSeries() {
  return useQuery({
    queryKey: SERIES_KEY,
    queryFn: fetchAllSeries,
  });
}

export function useSeriesDetail(id: string) {
  return useQuery({
    queryKey: seriesDetailKey(id),
    queryFn: () => fetchSeries(id),
    enabled: !!id,
  });
}

export function useCreateSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateSeriesPayload) => createSeries(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SERIES_KEY });
      toast.success('Series created');
    },
  });
}

export function useUpdateSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateSeriesPayload> }) =>
      updateSeries(id, payload),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: SERIES_KEY });
      void qc.invalidateQueries({ queryKey: seriesDetailKey(id) });
      toast.success('Series updated');
    },
  });
}

export function useDeleteSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSeries(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SERIES_KEY });
      toast.success('Series deleted');
    },
  });
}

export function useGenerateSeriesCover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, prompt }: { id: string; prompt?: string }) =>
      generateSeriesCover(id, prompt),
    onSuccess: (result, { id }) => {
      void qc.invalidateQueries({ queryKey: SERIES_KEY });
      void qc.invalidateQueries({ queryKey: seriesDetailKey(id) });
      toast.success(
        result.generated
          ? 'Cover generated with Amazon Nova'
          : 'Nova unavailable — cover not generated',
      );
    },
  });
}

// ─── Episode hooks ─────────────────────────────────────────────────────────

export function useEpisode(id: string) {
  return useQuery({
    queryKey: episodeKey(id),
    queryFn: () => fetchEpisode(id),
    enabled: !!id,
  });
}

export function useCreateEpisode(seriesId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateEpisodePayload) => createEpisode(seriesId, payload),
    onSuccess: () => {
      // SERIES_KEY (['series']) also matches ['series', id] by prefix → refreshes
      // both the catalog list (useAllSeries) and any series detail.
      void qc.invalidateQueries({ queryKey: SERIES_KEY });
      toast.success('Episode created');
    },
  });
}

export function useUpdateEpisode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<EpisodeDetail> }) =>
      updateEpisode(id, payload),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: episodeKey(id) });
      toast.success('Episode saved');
    },
  });
}

export function useDeleteEpisode(seriesId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteEpisode(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: seriesDetailKey(seriesId) });
      toast.success('Episode deleted');
    },
  });
}
