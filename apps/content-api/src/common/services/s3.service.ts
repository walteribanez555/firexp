import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config, createLogger } from '../../config';

const logger = createLogger('S3Service');

// ─── Constants ────────────────────────────────────────────────────────────────

/** Recommended part size: 8 MiB.  S3 minimum is 5 MiB (except the last part). */
export const PART_SIZE_BYTES = 8 * 1024 * 1024; // 8 MiB

/** S3 minimum part size for all parts except the last (5 MiB). */
export const MIN_PART_SIZE_BYTES = 5 * 1024 * 1024; // 5 MiB

/** Default TTL for multipart presigned URLs (900 s = 15 min). */
export const MULTIPART_PRESIGN_TTL_DEFAULT = 900;

// ─── Public types ─────────────────────────────────────────────────────────────

export interface PresignResult {
  uploadUrl: string;
  key:       string;
  publicUrl: string;
  expiresIn: number;
}

export interface PartUrl {
  partNumber: number;
  url:        string;
}

export interface MultipartCreateResult {
  key:       string;
  uploadId:  string;
  publicUrl: string;
  partUrls:  PartUrl[];
}

export interface CompletedPart {
  partNumber: number;
  eTag:       string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build the public/CDN URL for an S3 key.
 * If CDN_BASE is configured, use it; otherwise derive the regional S3 URL.
 */
export function buildPublicUrl(key: string): string {
  const cdnBase = config.getValue('cdnBase');
  if (cdnBase) return `${cdnBase.replace(/\/$/, '')}/${key}`;

  const bucket = config.getValue('contentBucket');
  const region = config.getValue('awsRegion');
  if (!bucket) return `stub://no-bucket-configured/${key}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

/**
 * Build the canonical S3 key for a video variant.
 * Convention: videos/{episodeId}/{chapterId}/{variantTag}.mp4
 */
export function buildVideoKey(
  episodeId:  string,
  chapterId:  string,
  variantTag: string,
): string {
  return `videos/${episodeId}/${chapterId}/${variantTag}.mp4`;
}

/**
 * Validate multipart request parameters.
 * Throws a descriptive Error if anything is out of range.
 */
export function validateMultipartParams(opts: {
  contentType:   string;
  partCount:     number;
  fileSizeBytes: number;
}): void {
  const { contentType, partCount, fileSizeBytes } = opts;

  if (!contentType.startsWith('video/')) {
    throw new Error(`contentType must be video/*, got: ${contentType}`);
  }
  if (!Number.isInteger(partCount) || partCount < 1) {
    throw new Error(`partCount must be a positive integer, got: ${partCount}`);
  }
  // Validate minimum part size: all parts except the last must be ≥ 5 MiB.
  // fileSizeBytes / partCount approximates how big each part will be.
  // If partCount > 1, the effective part size for non-last parts is ceiling division.
  if (partCount > 1) {
    const approxPartSize = Math.ceil(fileSizeBytes / partCount);
    if (approxPartSize < MIN_PART_SIZE_BYTES) {
      throw new Error(
        `Computed part size ~${approxPartSize} bytes is below the S3 minimum of ` +
        `${MIN_PART_SIZE_BYTES} bytes (5 MiB) for non-last parts. ` +
        `Use fewer parts or a larger part size (recommended: ${PART_SIZE_BYTES} bytes / 8 MiB).`,
      );
    }
  }
}

// ─── S3 client factory (lazy, one per invocation) ─────────────────────────────

function makeS3Client(): S3Client {
  return new S3Client({
    region: config.getValue('awsRegion'),
    // Disable automatic checksum injection so presigned URLs work from the
    // browser — fetch() / XHR cannot compute CRC32 before sending the body.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

// ─── Single-PUT presign ───────────────────────────────────────────────────────

/**
 * Generate a presigned PUT URL for direct browser-to-S3 upload.
 *
 * Falls back to a stub URL when no bucket is configured — lets the
 * dashboard flow work offline without hitting AWS.
 */
export async function getPresignedUploadUrl(
  key:       string,
  mimeType:  string,
  expiresIn: number,
): Promise<string> {
  const bucket = config.getValue('contentBucket');

  if (!bucket) {
    logger.warn('CONTENT_BUCKET not set — returning stub presign URL', { key });
    return `stub://presign/${encodeURIComponent(key)}?contentType=${encodeURIComponent(mimeType)}&expiresIn=${expiresIn}`;
  }

  const client  = makeS3Client();
  const command = new PutObjectCommand({
    Bucket:      bucket,
    Key:         key,
    ContentType: mimeType,
  });

  const url = await getSignedUrl(client, command, { expiresIn });
  logger.debug('Presigned upload URL generated', { key, mimeType, expiresIn });
  return url;
}

// ─── Multipart upload ─────────────────────────────────────────────────────────

/**
 * Initiate a multipart upload and return one presigned UploadPart URL per part.
 *
 * Falls back to stub URLs when no bucket is configured.
 */
export async function createMultipartUpload(opts: {
  key:           string;
  contentType:   string;
  partCount:     number;
  fileSizeBytes: number;
}): Promise<MultipartCreateResult> {
  const { key, contentType, partCount, fileSizeBytes } = opts;
  const bucket = config.getValue('contentBucket');

  // ── Stub mode (offline / dev without CONTENT_BUCKET) ──────────────────────
  if (!bucket) {
    logger.warn('CONTENT_BUCKET not set — returning stub multipart URLs', { key });
    const stubUploadId = `stub-upload-${Date.now()}`;
    const partUrls: PartUrl[] = Array.from({ length: partCount }, (_, i) => ({
      partNumber: i + 1,
      url: `stub://multipart/${encodeURIComponent(key)}/${stubUploadId}/part/${i + 1}`,
    }));
    return {
      key,
      uploadId:  stubUploadId,
      publicUrl: buildPublicUrl(key),
      partUrls,
    };
  }

  const expiresIn = Number(process.env['MULTIPART_PRESIGN_TTL']) || MULTIPART_PRESIGN_TTL_DEFAULT;
  const client    = makeS3Client();

  // 1. Create the multipart upload — gets an uploadId back.
  const createRes = await client.send(
    new CreateMultipartUploadCommand({
      Bucket:      bucket,
      Key:         key,
      ContentType: contentType,
    }),
  );

  const uploadId = createRes.UploadId;
  if (!uploadId) throw new Error('S3 did not return an UploadId for CreateMultipartUpload');

  // 2. Presign one UploadPart URL per part.
  const partUrls: PartUrl[] = await Promise.all(
    Array.from({ length: partCount }, async (_, i) => {
      const partNumber = i + 1;
      const url = await getSignedUrl(
        client,
        new UploadPartCommand({
          Bucket:     bucket,
          Key:        key,
          UploadId:   uploadId,
          PartNumber: partNumber,
        }),
        { expiresIn },
      );
      return { partNumber, url };
    }),
  );

  logger.debug('Multipart upload created', { key, uploadId, partCount, fileSizeBytes });

  return {
    key,
    uploadId,
    publicUrl: buildPublicUrl(key),
    partUrls,
  };
}

/**
 * Complete a multipart upload using the eTags collected from each part PUT.
 * Falls back to a no-op when no bucket is configured.
 */
export async function completeMultipartUpload(opts: {
  key:      string;
  uploadId: string;
  parts:    CompletedPart[];
}): Promise<{ publicUrl: string }> {
  const { key, uploadId, parts } = opts;
  const bucket = config.getValue('contentBucket');

  // ── Stub mode ──────────────────────────────────────────────────────────────
  if (!bucket || uploadId.startsWith('stub-upload-')) {
    logger.warn('Stub mode — complete multipart no-op', { key, uploadId });
    return { publicUrl: buildPublicUrl(key) };
  }

  const client = makeS3Client();
  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket:   bucket,
      Key:      key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.map((p) => ({
          PartNumber: p.partNumber,
          ETag:       p.eTag,
        })),
      },
    }),
  );

  logger.debug('Multipart upload completed', { key, uploadId, partCount: parts.length });
  return { publicUrl: buildPublicUrl(key) };
}

/**
 * Abort a multipart upload — cleans up partial data on S3.
 * Falls back to a no-op when no bucket is configured.
 */
export async function abortMultipartUpload(opts: {
  key:      string;
  uploadId: string;
}): Promise<void> {
  const { key, uploadId } = opts;
  const bucket = config.getValue('contentBucket');

  // ── Stub mode ──────────────────────────────────────────────────────────────
  if (!bucket || uploadId.startsWith('stub-upload-')) {
    logger.warn('Stub mode — abort multipart no-op', { key, uploadId });
    return;
  }

  const client = makeS3Client();
  await client.send(
    new AbortMultipartUploadCommand({
      Bucket:   bucket,
      Key:      key,
      UploadId: uploadId,
    }),
  );

  logger.debug('Multipart upload aborted', { key, uploadId });
}
