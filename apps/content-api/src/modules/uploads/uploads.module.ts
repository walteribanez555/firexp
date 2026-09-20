import { Hono } from 'hono';
import { handleException, BadRequestException } from '../../common/exceptions';
import {
  getPresignedUploadUrl,
  buildPublicUrl,
  buildVideoKey,
  createMultipartUpload,
  completeMultipartUpload,
  abortMultipartUpload,
  validateMultipartParams,
} from '../../common/services/s3.service';
import { config } from '../../config';
import type { AppEnv } from '../../app.types';

export const uploadsRouter = new Hono<AppEnv>();

// ─── Single-PUT presign ───────────────────────────────────────────────────────

interface PresignBody {
  episodeId?:    string;
  chapterId?:    string;
  variantTag?:   string;
  contentType?:  string;
  fileSizeBytes?: number;
}

// POST /api/v1/uploads/presign
uploadsRouter.post('/presign', async (c) => {
  try {
    const body = await c.req.json<PresignBody>();

    if (!body.episodeId)   throw new BadRequestException('episodeId is required');
    if (!body.chapterId)   throw new BadRequestException('chapterId is required');
    if (!body.variantTag)  throw new BadRequestException('variantTag is required');
    if (!body.contentType) throw new BadRequestException('contentType is required');

    if (!body.contentType.startsWith('video/')) {
      throw new BadRequestException(
        `contentType must be a video/* MIME type, got: ${body.contentType}`,
        'INVALID_CONTENT_TYPE',
      );
    }

    const key       = buildVideoKey(body.episodeId, body.chapterId, body.variantTag);
    const expiresIn = config.getValue('presignTtl');
    const uploadUrl = await getPresignedUploadUrl(key, body.contentType, expiresIn);
    const publicUrl = buildPublicUrl(key);

    return c.json({
      data: { uploadUrl, key, publicUrl, expiresIn },
    });
  } catch (err) {
    return handleException(err, c);
  }
});

// ─── Multipart: create ────────────────────────────────────────────────────────

interface MultipartCreateBody {
  episodeId?:    string;
  chapterId?:    string;
  variantTag?:   string;
  contentType?:  string;
  fileSizeBytes?: number;
  partCount?:    number;
}

// POST /api/v1/uploads/multipart/create
uploadsRouter.post('/multipart/create', async (c) => {
  try {
    const body = await c.req.json<MultipartCreateBody>();

    if (!body.episodeId)   throw new BadRequestException('episodeId is required');
    if (!body.chapterId)   throw new BadRequestException('chapterId is required');
    if (!body.variantTag)  throw new BadRequestException('variantTag is required');
    if (!body.contentType) throw new BadRequestException('contentType is required');
    if (body.fileSizeBytes == null) throw new BadRequestException('fileSizeBytes is required');
    if (body.partCount == null)     throw new BadRequestException('partCount is required');

    // Validate content type, partCount, and part-size constraints.
    try {
      validateMultipartParams({
        contentType:   body.contentType,
        partCount:     body.partCount,
        fileSizeBytes: body.fileSizeBytes,
      });
    } catch (validationErr) {
      throw new BadRequestException(
        validationErr instanceof Error ? validationErr.message : String(validationErr),
        'INVALID_MULTIPART_PARAMS',
      );
    }

    const key    = buildVideoKey(body.episodeId, body.chapterId, body.variantTag);
    const result = await createMultipartUpload({
      key,
      contentType:   body.contentType,
      partCount:     body.partCount,
      fileSizeBytes: body.fileSizeBytes,
    });

    return c.json({ data: result });
  } catch (err) {
    return handleException(err, c);
  }
});

// ─── Multipart: complete ──────────────────────────────────────────────────────

interface MultipartCompleteBody {
  key?:      string;
  uploadId?: string;
  parts?:    { partNumber: number; eTag: string }[];
}

// POST /api/v1/uploads/multipart/complete
uploadsRouter.post('/multipart/complete', async (c) => {
  try {
    const body = await c.req.json<MultipartCompleteBody>();

    if (!body.key)      throw new BadRequestException('key is required');
    if (!body.uploadId) throw new BadRequestException('uploadId is required');
    if (!Array.isArray(body.parts) || body.parts.length === 0) {
      throw new BadRequestException('parts must be a non-empty array of { partNumber, eTag }');
    }

    for (const part of body.parts) {
      if (!Number.isInteger(part.partNumber) || part.partNumber < 1) {
        throw new BadRequestException(
          `Invalid partNumber ${part.partNumber} — must be a positive integer`,
          'INVALID_PART',
        );
      }
      if (typeof part.eTag !== 'string' || !part.eTag.trim()) {
        throw new BadRequestException(
          `Missing eTag for part ${part.partNumber}`,
          'INVALID_PART',
        );
      }
    }

    const result = await completeMultipartUpload({
      key:      body.key,
      uploadId: body.uploadId,
      parts:    body.parts,
    });

    return c.json({ data: result });
  } catch (err) {
    return handleException(err, c);
  }
});

// ─── Multipart: abort ─────────────────────────────────────────────────────────

interface MultipartAbortBody {
  key?:      string;
  uploadId?: string;
}

// POST /api/v1/uploads/multipart/abort
uploadsRouter.post('/multipart/abort', async (c) => {
  try {
    const body = await c.req.json<MultipartAbortBody>();

    if (!body.key)      throw new BadRequestException('key is required');
    if (!body.uploadId) throw new BadRequestException('uploadId is required');

    await abortMultipartUpload({ key: body.key, uploadId: body.uploadId });

    return c.json({ data: { ok: true } });
  } catch (err) {
    return handleException(err, c);
  }
});
