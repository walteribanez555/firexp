import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  presignUpload,
  multipartCreate,
  multipartComplete,
  multipartAbort,
  type CompletedPart,
} from '../api/uploads.api';
import { updateEpisode } from '../../series/api/series.api';
import { uploadToS3, uploadPartToS3 } from '@/lib/api-client';
import { episodeKey } from '../../series/hooks/use-series';
import type { EpisodeDetail } from '@fire-stick/types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Files ≤ this threshold use a single presigned PUT; larger files use multipart. */
const MULTIPART_THRESHOLD_BYTES = 8 * 1024 * 1024; // 8 MiB

/** Part size for multipart uploads (≥ 5 MiB per non-last S3 part). */
const PART_SIZE_BYTES = 8 * 1024 * 1024; // 8 MiB

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UploadVariantParams {
  episodeId:  string;
  chapterId:  string;
  variantTag: string;
  file:       File;
  episode:    EpisodeDetail;
}

export type UploadStatus =
  | 'idle'
  | 'presigning'
  | 'uploading'
  | 'completing'
  | 'patching'
  | 'done'
  | 'error';

export interface UploadProgress {
  chapterId:  string;
  variantTag: string;
  status:     UploadStatus;
  /** 0–100 reflecting total bytes across all parts */
  progress:   number;
  error?:     string;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useUploadVariant() {
  const qc = useQueryClient();
  const [progresses, setProgresses] = useState<Map<string, UploadProgress>>(new Map());

  function setProg(key: string, patch: Partial<UploadProgress>) {
    setProgresses((m) => {
      const next     = new Map(m);
      const existing = next.get(key) ?? { chapterId: '', variantTag: '', status: 'idle', progress: 0 };
      next.set(key, { ...existing, ...patch });
      return next;
    });
  }

  // ── Single-PUT (≤ 8 MiB) ────────────────────────────────────────────────────

  async function runSinglePut(
    episodeId:   string,
    chapterId:   string,
    variantTag:  string,
    file:        File,
    contentType: string,
    progressKey: string,
  ): Promise<string> {
    setProg(progressKey, { chapterId, variantTag, status: 'presigning', progress: 0 });

    const { uploadUrl, publicUrl } = await presignUpload({
      episodeId,
      chapterId,
      variantTag,
      contentType,
      fileSizeBytes: file.size,
    });

    setProg(progressKey, { status: 'uploading', progress: 0 });

    await uploadToS3(uploadUrl, file, (pct) => {
      setProg(progressKey, { progress: pct });
    });

    return publicUrl;
  }

  // ── Multipart (> 8 MiB) ─────────────────────────────────────────────────────

  async function runMultipart(
    episodeId:   string,
    chapterId:   string,
    variantTag:  string,
    file:        File,
    contentType: string,
    progressKey: string,
  ): Promise<string> {
    const partCount = Math.ceil(file.size / PART_SIZE_BYTES);

    setProg(progressKey, { chapterId, variantTag, status: 'presigning', progress: 0 });

    const { key, uploadId, publicUrl, partUrls } = await multipartCreate({
      episodeId,
      chapterId,
      variantTag,
      contentType,
      fileSizeBytes: file.size,
      partCount,
    });

    setProg(progressKey, { status: 'uploading', progress: 0 });

    // Per-part loaded bytes for aggregate progress reporting.
    const loadedPerPart = new Array<number>(partCount).fill(0);
    const totalBytes    = file.size;

    function onPartProgress(partIndex: number, loaded: number) {
      loadedPerPart[partIndex] = loaded;
      const totalLoaded = loadedPerPart.reduce((a, b) => a + b, 0);
      // Cap at 99 — the final 1% is saved for the CompleteMultipartUpload round-trip.
      const pct = Math.min(99, Math.round((totalLoaded / totalBytes) * 100));
      setProg(progressKey, { progress: pct });
    }

    const completedParts: CompletedPart[] = [];

    try {
      // Sequential part uploads — avoids browser connection concurrency limits.
      for (let i = 0; i < partUrls.length; i++) {
        const { partNumber, url } = partUrls[i];
        const start = (partNumber - 1) * PART_SIZE_BYTES;
        const end   = Math.min(start + PART_SIZE_BYTES, file.size);
        const blob  = file.slice(start, end);

        const eTag = await uploadPartToS3(url, blob, contentType, (loaded) => {
          onPartProgress(i, loaded);
        });

        completedParts.push({ partNumber, eTag });
      }
    } catch (partErr) {
      // Best-effort abort to release partial S3 storage.
      await multipartAbort({ key, uploadId }).catch(() => undefined);
      throw partErr;
    }

    // "Completing" phase: waiting for S3 to assemble the parts.
    setProg(progressKey, { status: 'completing', progress: 99 });

    const { publicUrl: confirmedUrl } = await multipartComplete({
      key,
      uploadId,
      parts: completedParts,
    });

    return confirmedUrl;
  }

  // ── Mutation ─────────────────────────────────────────────────────────────────

  const uploadMutation = useMutation({
    mutationFn: async ({
      episodeId,
      chapterId,
      variantTag,
      file,
      episode,
    }: UploadVariantParams) => {
      const progressKey = `${chapterId}:${variantTag}`;
      const contentType = file.type || 'video/mp4';

      // Choose path by file size.
      const publicUrl =
        file.size <= MULTIPART_THRESHOLD_BYTES
          ? await runSinglePut(episodeId, chapterId, variantTag, file, contentType, progressKey)
          : await runMultipart(episodeId, chapterId, variantTag, file, contentType, progressKey);

      // Patch the episode's variant.videoUrl.
      setProg(progressKey, { status: 'patching', progress: 100 });

      const updated: EpisodeDetail = {
        ...episode,
        chapters: episode.chapters.map((ch) => {
          if (ch.id !== chapterId) return ch;
          return {
            ...ch,
            variants: ch.variants.map((v) =>
              v.tag === variantTag ? { ...v, videoUrl: publicUrl } : v,
            ),
          };
        }),
      };

      await updateEpisode(episodeId, updated);
      await qc.invalidateQueries({ queryKey: episodeKey(episodeId) });

      setProg(progressKey, { status: 'done' });
      toast.success(`Uploaded variant "${variantTag}" for chapter "${chapterId}"`);
      return publicUrl;
    },

    onError: (err, variables) => {
      const key = `${variables.chapterId}:${variables.variantTag}`;
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setProg(key, { status: 'error', error: msg });
      toast.error(`Upload error: ${msg}`);
    },
  });

  return { uploadMutation, progresses };
}
