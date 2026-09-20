/**
 * Unit tests — uploads presign key building + contentType validation,
 * multipart create/complete/abort stub mode and validation.
 *
 * Mocks @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner to avoid
 * real AWS calls.
 */

// ── Mock AWS before any imports ───────────────────────────────────────────────

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client:                     jest.fn().mockImplementation(() => ({ send: jest.fn() })),
  PutObjectCommand:             jest.fn().mockImplementation((input: unknown) => input),
  CreateMultipartUploadCommand: jest.fn().mockImplementation((input: unknown) => input),
  UploadPartCommand:            jest.fn().mockImplementation((input: unknown) => input),
  CompleteMultipartUploadCommand: jest.fn().mockImplementation((input: unknown) => input),
  AbortMultipartUploadCommand:  jest.fn().mockImplementation((input: unknown) => input),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.example.com/presigned?sig=mock'),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

import { app } from '../../../app';
import {
  buildVideoKey,
  validateMultipartParams,
  PART_SIZE_BYTES,
  MIN_PART_SIZE_BYTES,
} from '../../../common/services/s3.service';

// ─── POST /api/v1/uploads/presign ─────────────────────────────────────────────

describe('POST /api/v1/uploads/presign', () => {
  const validBody = {
    episodeId:    'episode1',
    chapterId:    'ch1',
    variantTag:   'confrontation',
    contentType:  'video/mp4',
    fileSizeBytes: 10_000_000,
  };

  it('returns 400 when episodeId is missing', async () => {
    const res = await app.request('/api/v1/uploads/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, episodeId: undefined }),
    });
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toMatch(/episodeId/);
  });

  it('returns 400 when contentType is not video/*', async () => {
    const res = await app.request('/api/v1/uploads/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, contentType: 'image/png' }),
    });
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string; code: string };
    expect(json.code).toBe('INVALID_CONTENT_TYPE');
  });

  it('builds the correct S3 key pattern', async () => {
    process.env['STORAGE'] = 'memory';
    delete process.env['CONTENT_BUCKET'];

    const res = await app.request('/api/v1/uploads/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(200);
    const json = await res.json() as { data: { key: string; uploadUrl: string; publicUrl: string; expiresIn: number } };
    expect(json.data.key).toBe('videos/episode1/ch1/confrontation.mp4');
    expect(typeof json.data.expiresIn).toBe('number');
    expect(json.data.expiresIn).toBeGreaterThan(0);
  });

  it('returns stub presign URL when no CONTENT_BUCKET is set', async () => {
    process.env['STORAGE'] = 'memory';
    delete process.env['CONTENT_BUCKET'];

    const res = await app.request('/api/v1/uploads/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    const json = await res.json() as { data: { uploadUrl: string } };
    expect(json.data.uploadUrl).toMatch(/^stub:\/\//);
  });
});

// ─── buildVideoKey ────────────────────────────────────────────────────────────

describe('buildVideoKey', () => {
  it('returns the canonical key pattern', () => {
    expect(buildVideoKey('ep1', 'ch2', 'alpha')).toBe('videos/ep1/ch2/alpha.mp4');
  });
});

// ─── validateMultipartParams ──────────────────────────────────────────────────

describe('validateMultipartParams', () => {
  it('throws when contentType is not video/*', () => {
    expect(() =>
      validateMultipartParams({ contentType: 'application/octet-stream', partCount: 1, fileSizeBytes: 10 }),
    ).toThrow(/video\//);
  });

  it('throws when partCount is 0', () => {
    expect(() =>
      validateMultipartParams({ contentType: 'video/mp4', partCount: 0, fileSizeBytes: 10_000_000 }),
    ).toThrow(/partCount/);
  });

  it('throws when partCount is negative', () => {
    expect(() =>
      validateMultipartParams({ contentType: 'video/mp4', partCount: -1, fileSizeBytes: 10_000_000 }),
    ).toThrow(/partCount/);
  });

  it('throws when computed part size would be below S3 minimum for non-last parts', () => {
    // fileSizeBytes = 6 MiB, partCount = 3 → each part ~2 MiB < 5 MiB min
    const fileSizeBytes = 6 * 1024 * 1024;
    expect(() =>
      validateMultipartParams({ contentType: 'video/mp4', partCount: 3, fileSizeBytes }),
    ).toThrow(/5 MiB/);
  });

  it('passes for a single part of any size', () => {
    // partCount === 1: only one part, so the "last part exception" applies — no min size check
    expect(() =>
      validateMultipartParams({ contentType: 'video/mp4', partCount: 1, fileSizeBytes: 1024 }),
    ).not.toThrow();
  });

  it('passes for a valid multi-part upload (100 MiB / 8 MiB parts = 13 parts)', () => {
    const fileSizeBytes = 100 * 1024 * 1024;
    const partCount     = Math.ceil(fileSizeBytes / PART_SIZE_BYTES);
    expect(() =>
      validateMultipartParams({ contentType: 'video/mp4', partCount, fileSizeBytes }),
    ).not.toThrow();
  });

  it('exports correct PART_SIZE_BYTES (8 MiB) and MIN_PART_SIZE_BYTES (5 MiB)', () => {
    expect(PART_SIZE_BYTES).toBe(8 * 1024 * 1024);
    expect(MIN_PART_SIZE_BYTES).toBe(5 * 1024 * 1024);
  });
});

// ─── POST /api/v1/uploads/multipart/create (stub mode) ───────────────────────

describe('POST /api/v1/uploads/multipart/create — stub mode', () => {
  const validBody = {
    episodeId:    'ep1',
    chapterId:    'ch1',
    variantTag:   'alpha',
    contentType:  'video/mp4',
    fileSizeBytes: 50 * 1024 * 1024, // 50 MiB
    partCount:    7,
  };

  beforeEach(() => {
    process.env['STORAGE'] = 'memory';
    delete process.env['CONTENT_BUCKET'];
  });

  it('returns 200 with key, uploadId, publicUrl, and partUrls array', async () => {
    const res = await app.request('/api/v1/uploads/multipart/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(200);
    const json = await res.json() as {
      data: {
        key: string;
        uploadId: string;
        publicUrl: string;
        partUrls: { partNumber: number; url: string }[];
      };
    };
    expect(json.data.key).toBe('videos/ep1/ch1/alpha.mp4');
    expect(typeof json.data.uploadId).toBe('string');
    expect(json.data.uploadId).toMatch(/^stub-upload-/);
    expect(json.data.publicUrl).toMatch(/^stub:\/\//);
    expect(json.data.partUrls).toHaveLength(7);
    expect(json.data.partUrls[0].partNumber).toBe(1);
    expect(json.data.partUrls[6].partNumber).toBe(7);
    expect(json.data.partUrls[0].url).toMatch(/^stub:\/\/multipart/);
  });

  it('returns 400 when episodeId is missing', async () => {
    const res = await app.request('/api/v1/uploads/multipart/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, episodeId: undefined }),
    });
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toMatch(/episodeId/);
  });

  it('returns 400 when contentType is not video/*', async () => {
    const res = await app.request('/api/v1/uploads/multipart/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, contentType: 'image/jpeg' }),
    });
    expect(res.status).toBe(400);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('INVALID_MULTIPART_PARAMS');
  });

  it('returns 400 when partCount would produce sub-minimum parts', async () => {
    // 6 MiB / 3 parts = 2 MiB per part < 5 MiB S3 minimum
    const res = await app.request('/api/v1/uploads/multipart/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...validBody,
        fileSizeBytes: 6 * 1024 * 1024,
        partCount: 3,
      }),
    });
    expect(res.status).toBe(400);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('INVALID_MULTIPART_PARAMS');
  });
});

// ─── POST /api/v1/uploads/multipart/complete (stub mode) ─────────────────────

describe('POST /api/v1/uploads/multipart/complete — stub mode', () => {
  beforeEach(() => {
    process.env['STORAGE'] = 'memory';
    delete process.env['CONTENT_BUCKET'];
  });

  it('returns 200 with publicUrl for a stub uploadId', async () => {
    const res = await app.request('/api/v1/uploads/multipart/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key:      'videos/ep1/ch1/alpha.mp4',
        uploadId: 'stub-upload-1234',
        parts:    [{ partNumber: 1, eTag: '"abc123"' }],
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json() as { data: { publicUrl: string } };
    expect(json.data.publicUrl).toMatch(/stub:\/\/no-bucket-configured\/videos\/ep1\/ch1\/alpha\.mp4/);
  });

  it('returns 400 when parts array is empty', async () => {
    const res = await app.request('/api/v1/uploads/multipart/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key:      'videos/ep1/ch1/alpha.mp4',
        uploadId: 'stub-upload-1234',
        parts:    [],
      }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when key is missing', async () => {
    const res = await app.request('/api/v1/uploads/multipart/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId: 'stub-upload-1234',
        parts:    [{ partNumber: 1, eTag: '"abc"' }],
      }),
    });
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/v1/uploads/multipart/abort (stub mode) ────────────────────────

describe('POST /api/v1/uploads/multipart/abort — stub mode', () => {
  beforeEach(() => {
    process.env['STORAGE'] = 'memory';
    delete process.env['CONTENT_BUCKET'];
  });

  it('returns 200 with ok: true for a stub uploadId', async () => {
    const res = await app.request('/api/v1/uploads/multipart/abort', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key:      'videos/ep1/ch1/alpha.mp4',
        uploadId: 'stub-upload-1234',
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json() as { data: { ok: boolean } };
    expect(json.data.ok).toBe(true);
  });

  it('returns 400 when uploadId is missing', async () => {
    const res = await app.request('/api/v1/uploads/multipart/abort', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'videos/ep1/ch1/alpha.mp4' }),
    });
    expect(res.status).toBe(400);
  });
});
