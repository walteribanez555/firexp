# content-api

Source-of-truth serverless backend for the Fire TV interactive-narrative content
(series, episodes, branching story graph), backed by DynamoDB + S3.

## Stack

- **Runtime**: Hono + @hono/node-server / hono/aws-lambda
- **Database**: AWS DynamoDB (DocumentClient v3)
- **Storage**: AWS S3 + presigned PUT URLs
- **Build**: esbuild dual targets (Lambda node20 / ECS node22)
- **Tests**: jest + ts-jest (in-memory store, no AWS required)
- **Types**: `@fire-stick/types` (shared monorepo package)

---

## Endpoints (`base /api/v1`, envelope `{ data }`)

### Health

| Method | Path            | Response                |
|--------|-----------------|-------------------------|
| GET    | `/api/v1/health`| `{ status: 'ok' }`      |

### Series (read)

| Method | Path                | Response                    |
|--------|---------------------|-----------------------------|
| GET    | `/api/v1/series`    | `{ data: SeriesSummary[] }` |
| GET    | `/api/v1/series/:id`| `{ data: SeriesSummary }`   |

### Series (admin write)

| Method | Path                | Body                                        | Response                       |
|--------|---------------------|---------------------------------------------|--------------------------------|
| POST   | `/api/v1/series`    | `{ title, description, thumbnailUrl? }`     | `{ data: SeriesSummary }` 201  |
| PUT    | `/api/v1/series/:id`| `{ title?, description?, thumbnailUrl? }`   | `{ data: SeriesSummary }`      |
| DELETE | `/api/v1/series/:id`| —                                           | `{ data: { id } }`             |

### Episodes (read)

| Method | Path                   | Response                   |
|--------|------------------------|----------------------------|
| GET    | `/api/v1/episodes/:id` | `{ data: EpisodeDetail }`  |

### Episodes (admin write)

| Method | Path                                 | Body                                                               | Response                       |
|--------|--------------------------------------|--------------------------------------------------------------------|--------------------------------|
| POST   | `/api/v1/series/:id/episodes`        | `{ number, title, questionnaire?, flags?, chapters?, video? }`     | `{ data: EpisodeDetail }` 201  |
| PUT    | `/api/v1/episodes/:id`               | Full `EpisodeDetail` (incl. chapters/variants/decisions)           | `{ data: EpisodeDetail }`      |
| DELETE | `/api/v1/episodes/:id`               | —                                                                  | `{ data: { id } }`             |

> `POST /series/:id/episodes` and `DELETE /episodes/:id` automatically keep `SeriesSummary.episodes[]` in sync.

### Uploads

#### Single-PUT (small files ≤ 8 MiB)

| Method | Path                        | Body                                                                  | Response                                           |
|--------|-----------------------------|-----------------------------------------------------------------------|----------------------------------------------------|
| POST   | `/api/v1/uploads/presign`   | `{ episodeId, chapterId, variantTag, contentType, fileSizeBytes? }`   | `{ data: { uploadUrl, key, publicUrl, expiresIn }}`|

#### Multipart (large files > 8 MiB — browser uploads parts directly to S3)

| Method | Path                                   | Body                                                                                                         | Response                                                                                   |
|--------|----------------------------------------|--------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------|
| POST   | `/api/v1/uploads/multipart/create`     | `{ episodeId, chapterId, variantTag, contentType, fileSizeBytes, partCount }`                                | `{ data: { key, uploadId, publicUrl, partUrls: [{partNumber, url}] } }`                    |
| POST   | `/api/v1/uploads/multipart/complete`   | `{ key, uploadId, parts: [{partNumber, eTag}] }`                                                             | `{ data: { publicUrl } }`                                                                  |
| POST   | `/api/v1/uploads/multipart/abort`      | `{ key, uploadId }`                                                                                          | `{ data: { ok: true } }`                                                                   |

**Notes:**
- `contentType` must be `video/*` — validated server-side.
- S3 key pattern: `videos/{episodeId}/{chapterId}/{variantTag}.mp4`
- `publicUrl` = `${CDN_BASE}/${key}` when `CDN_BASE` is set, else the regional S3 object URL.
- Recommended part size: **8 MiB**. S3 requires all non-last parts to be ≥ 5 MiB.
- Presigned part URL TTL: `MULTIPART_PRESIGN_TTL` env var (default 900 s / 15 min).
- The browser must send the `ETag` response header per part (requires `CORS ExposeHeaders: ETag` on the bucket — managed by infra).
- On success, the dashboard calls `PUT /episodes/:id` to persist `variant.videoUrl = publicUrl`.
- Neither endpoint auto-mutates the episode — that is the caller's responsibility.

---

## Data Model

```
SeriesSummary  { id, title, description, thumbnailUrl, episodes: EpisodeSummary[] }
EpisodeSummary { id, number, title, thumbnailUrl }

EpisodeDetail  extends StoryGraph {
  id, seriesId, number, questionnaire: Question[]
}

StoryGraph { video, title, flags: Flags, chapters: StoryChapter[] }
StoryChapter   { id, title, decisions: ChapterDecision[], variants: StoryVariant[] }
ChapterDecision{ id, phase, at?, window, prompt?, options: DecisionOption[], default }
StoryVariant   { in, out, when, tag?, videoUrl? }
```

---

## Environment Variables

| Variable                | Default               | Description                                                                                      |
|-------------------------|-----------------------|--------------------------------------------------------------------------------------------------|
| `PORT`                  | `3003`                | HTTP port (ECS/local)                                                                            |
| `AWS_REGION`            | `us-east-1`           | AWS region                                                                                       |
| `DYNAMODB_ENDPOINT`     | *(unset)*             | Override DynamoDB endpoint (e.g. `http://localhost:8000` for DynamoDB Local). Also enables dynamo storage. |
| `SERIES_TABLE`          | `firexp-dev-series`   | DynamoDB table for series                                                                        |
| `EPISODES_TABLE`        | `firexp-dev-episodes` | DynamoDB table for episodes                                                                      |
| `CONTENT_BUCKET`        | *(empty)*             | S3 bucket for video uploads; when unset, stub mode is active                                     |
| `CDN_BASE`              | *(empty)*             | CloudFront origin prefix for `publicUrl` (e.g. `https://cdn.example.com`)                        |
| `PRESIGN_TTL`           | `300`                 | Presigned PUT URL expiry in seconds (single-part path)                                           |
| `MULTIPART_PRESIGN_TTL` | `900`                 | Presigned UploadPart URL expiry in seconds (multipart path)                                      |
| `STORAGE`               | auto-detected         | Force `memory` (tests) or `dynamo`. Default is `dynamo` when `DYNAMODB_ENDPOINT` or table vars are set. |
| `LOG_LEVEL`             | `info`                | `debug` / `info` / `warn` / `error`                                                             |
| `NODE_ENV`              | `development`         | Node environment                                                                                 |

### AWS Credentials — running locally

Credentials are resolved via the **AWS SDK default provider chain** — no keys are ever hardcoded.
Create a `.env` file at `apps/content-api/.env` (already in the root `.gitignore`):

```dotenv
# apps/content-api/.env  (never commit this file)
AWS_REGION=us-east-1

# Option A — named profile (recommended for local dev)
AWS_PROFILE=my-dev-profile

# Option B — explicit keys (CI / temporary credentials)
# AWS_ACCESS_KEY_ID=...
# AWS_SECRET_ACCESS_KEY=...
# AWS_SESSION_TOKEN=...   # if using STS / SSO short-lived creds

CONTENT_BUCKET=firexp-dev-videos          # your S3 bucket name
CDN_BASE=https://dXXXXXXXXXX.cloudfront.net   # optional CloudFront distribution

PRESIGN_TTL=300
MULTIPART_PRESIGN_TTL=900
```

The server loads `.env` automatically via `process.loadEnvFile` in `src/main.ts`.

### Offline / stub mode

When `CONTENT_BUCKET` is **not set**, all upload endpoints return deterministic stub URLs
(`stub://…`) and multipart complete/abort are no-ops. The dashboard upload flow is
fully demoable without any AWS credentials or bucket.

### Storage auto-detection

The service selects **DynamoDB storage** when:
- `DYNAMODB_ENDPOINT` is set (local dev with DynamoDB Local), **or**
- Both `SERIES_TABLE` and `EPISODES_TABLE` are set (prod / CI with real AWS).

**In-memory storage** is used only when `STORAGE=memory` is explicitly set (e.g. `npm test`).
The in-memory store is seeded from `src/seed/seed-data.ts` (the same canonical data loaded into DynamoDB by `dynamo:init`).

---

## Local DynamoDB workflow

DynamoDB Local runs in Docker (no AWS account needed).

### 1. Start DynamoDB Local

```bash
# From the monorepo root:
docker compose up -d dynamodb-local

# Or using the npm shortcut (from apps/content-api):
npm run dynamo:up
```

The container listens on `localhost:8000` and persists data in a Docker volume (`dynamodb_data`).

### 2. Create tables and seed data

```bash
cd apps/content-api

DYNAMODB_ENDPOINT=http://localhost:8000 \
AWS_REGION=us-east-1 \
SERIES_TABLE=firexp-dev-series \
EPISODES_TABLE=firexp-dev-episodes \
npm run dynamo:init
```

This is idempotent — safe to re-run. Existing items are skipped.

### 3. Run the service against DynamoDB Local

```bash
DYNAMODB_ENDPOINT=http://localhost:8000 \
AWS_REGION=us-east-1 \
SERIES_TABLE=firexp-dev-series \
EPISODES_TABLE=firexp-dev-episodes \
PORT=3003 \
node dist/main.js
```

The service defaults to `dynamo` storage when `DYNAMODB_ENDPOINT` or both table env vars are present.
To force in-memory mode (tests): `STORAGE=memory`.

### Production (real AWS)

No `DYNAMODB_ENDPOINT` — the SDK uses the default AWS credential chain:

```bash
AWS_REGION=us-east-1 \
SERIES_TABLE=firexp-prod-series \
EPISODES_TABLE=firexp-prod-episodes \
node dist/main.js
```

The CDK stack provisions the real tables (`infra/cdk/lib/firexp-content-stack.ts`).

---

## Scripts

```bash
npm run dev           # ts-node local server on :3003
npm run build         # ECS build → dist/main.js
npm run build:lambda  # Lambda build → dist/index.js (node20)
npm run build:ecs     # ECS build → dist/main.js (node22)
npm test              # jest (STORAGE=memory, no AWS needed)
npm run lint          # eslint src
npm run dynamo:up     # docker compose up -d dynamodb-local
npm run dynamo:init   # create tables + seed (needs DYNAMODB_ENDPOINT etc.)
```

---

## How this becomes the relay's source of truth

The relay (`apps/relay`) currently reads series/episode JSON from disk.
Replace `apps/relay/src/modules/series/series.service.ts` to fetch from
`GET /api/v1/series` and `GET /api/v1/episodes/:id` on this service.
The API shape is identical to what the relay serves today, so the Fire TV
client needs no changes.
