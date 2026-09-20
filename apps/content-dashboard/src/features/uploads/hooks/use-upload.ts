import { useState } from 'react';
import { toast } from 'sonner';
import {
  presignUpload,
  multipartCreate,
  multipartComplete,
  multipartAbort,
  type CompletedPart,
} from '../api/uploads.api';
import { uploadToS3, uploadPartToS3 } from '@/lib/api-client';

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
  /** Original file metadata, captured at mutation start (for in-session feedback). */
  fileName?:  string;
  fileSize?:  number;
  /** true when file size crossed the multipart threshold. */
  multipart?: boolean;
  error?:     string;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Uploads a branch video to S3 (single-PUT or multipart by size) and resolves
 * with the public URL. It deliberately does NOT persist the episode — the caller
 * (the flow editor) writes the returned URL onto the step, so the video is linked
 * as part of the same unsaved graph edit.
 */
export function useVariantUpload() {
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
    p: UploadVariantParams,
    contentType: string,
    key: string,
  ): Promise<string> {
    setProg(key, { status: 'presigning', progress: 0 });

    const { uploadUrl, publicUrl } = await presignUpload({
      episodeId: p.episodeId,
      chapterId: p.chapterId,
      variantTag: p.variantTag,
      contentType,
      fileSizeBytes: p.file.size,
    });

    setProg(key, { status: 'uploading', progress: 0 });
    await uploadToS3(uploadUrl, p.file, (pct) => setProg(key, { progress: pct }));

    return publicUrl;
  }

  // ── Multipart (> 8 MiB) ─────────────────────────────────────────────────────

  async function runMultipart(
    p: UploadVariantParams,
    contentType: string,
    key: string,
  ): Promise<string> {
    const { file } = p;
    const partCount = Math.ceil(file.size / PART_SIZE_BYTES);

    setProg(key, { status: 'presigning', progress: 0 });

    const { key: s3Key, uploadId, publicUrl, partUrls } = await multipartCreate({
      episodeId: p.episodeId,
      chapterId: p.chapterId,
      variantTag: p.variantTag,
      contentType,
      fileSizeBytes: file.size,
      partCount,
    });

    setProg(key, { status: 'uploading', progress: 0 });

    const loadedPerPart = new Array<number>(partCount).fill(0);
    const totalBytes    = file.size;

    function onPartProgress(partIndex: number, loaded: number) {
      loadedPerPart[partIndex] = loaded;
      const totalLoaded = loadedPerPart.reduce((a, b) => a + b, 0);
      const pct = Math.min(99, Math.round((totalLoaded / totalBytes) * 100));
      setProg(key, { progress: pct });
    }

    const completedParts: CompletedPart[] = [];

    try {
      for (let i = 0; i < partUrls.length; i++) {
        const { partNumber, url } = partUrls[i];
        const start = (partNumber - 1) * PART_SIZE_BYTES;
        const end   = Math.min(start + PART_SIZE_BYTES, file.size);
        const blob  = file.slice(start, end);

        const eTag = await uploadPartToS3(url, blob, contentType, (loaded) => onPartProgress(i, loaded));
        completedParts.push({ partNumber, eTag });
      }
    } catch (partErr) {
      await multipartAbort({ key: s3Key, uploadId }).catch(() => undefined);
      throw partErr;
    }

    setProg(key, { status: 'completing', progress: 99 });
    const { publicUrl: confirmedUrl } = await multipartComplete({ key: s3Key, uploadId, parts: completedParts });
    return confirmedUrl;
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /** Upload a file and resolve with its public URL. Throws on failure. */
  async function uploadVariant(p: UploadVariantParams): Promise<string> {
    const key = `${p.chapterId}:${p.variantTag}`;
    const contentType = p.file.type || 'video/mp4';
    const isMultipart = p.file.size > MULTIPART_THRESHOLD_BYTES;

    setProg(key, {
      chapterId: p.chapterId,
      variantTag: p.variantTag,
      fileName: p.file.name,
      fileSize: p.file.size,
      multipart: isMultipart,
    });

    try {
      const publicUrl = isMultipart
        ? await runMultipart(p, contentType, key)
        : await runSinglePut(p, contentType, key);

      setProg(key, { status: 'done', progress: 100 });
      toast.success('Video uploaded');
      return publicUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setProg(key, { status: 'error', error: msg });
      toast.error(`Upload error: ${msg}`);
      throw err;
    }
  }

  return { progresses, uploadVariant };
}
