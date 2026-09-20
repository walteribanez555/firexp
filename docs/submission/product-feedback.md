# Product Feedback (draft)

_Devpost requires feedback on **every** tool/API/SDK used. One entry each: what we used it for · what worked · what needs work · onboarding · would we use it again._

## Fire OS / Android (Kotlin)
- **Ecosystem fit:** X-Ray already proved the second screen belongs in the living room — it tells you *who's on screen*. Firexp is the next step on the same device: the room *decides what they do*, and the TV never breaks immersion to show it.
- **Used for:** the TV app (`fire-hack`) — catalog, QR pairing, the autonomous StoryEngine, playback.
- **Worked:** standard Android tooling on Fire OS; the Android TV emulator (`Television_1080p` AVD) let us iterate without hardware.
- **Needs work:** the emulator can't reach the host LAN IP, so the phone-facing QR and the TV's own relay host need different values (`10.0.2.2` vs LAN IP) — a real footgun for second-screen apps.
- **Onboarding:** smooth if you already know Android; the Fire TV specifics (leanback launcher category, D-pad focus) are under-documented.
- **Again:** yes.

## Jetpack Compose for TV (`androidx.tv.material3`)
- **Used for:** catalog focus/D-pad navigation and TV-styled surfaces.
- **Worked:** focus handling and the TV Material components once wired.
- **Needs work:** mixing generic Compose and `tv.material3` is easy to get subtly wrong; more guidance on when to use which would help.
- **Again:** yes.

## Media3 / ExoPlayer
- **Used for:** playback, disk media cache + prefetch of the next branch's clips, decoder fallback, error handling.
- **Worked:** `DefaultMediaSourceFactory` container inference; `setEnableDecoderFallback(true)` saved us when 1080p@60 clips exceeded the emulator's software decoder.
- **Needs work:** `DefaultPreloadManager` (1.3+) is powerful but the integration surface is heavy for a simple "prefetch the next clip" case — we fell back to `CacheWriter`.
- **Again:** yes.

## Amazon Bedrock (Converse API) + Amazon Nova
- **Ecosystem fit:** Twitch brought audience participation to streaming; Firexp brings it to the living room — and Bedrock is what turns each room's unique path into a personalized, spoiler-safe recap ("your room chose A · 62% of rooms chose B"). Amazon Nova is the natural in-house model for that recap/prompt generation on Fire TV.
- **Used for:** generating decision prompts (tool-use / structured output) and end-of-episode room recaps via the Converse API. Models: `us.anthropic.claude-haiku-4-5`; **Amazon Nova** for on-device-adjacent recap generation.
- **Worked:** the Converse API + tool-use gives clean structured JSON; latency is fine for authoring.
- **Needs work:** IAM permission ≠ model access — you still must opt in per model in the console, which isn't obvious from the SDK errors.
- **Again:** yes.

## Amazon DynamoDB (+ DynamoDB Local)
- **Used for:** series/episodes source of truth and a `sessions` table with atomic vote aggregates (`ADD`), read back as "% of rooms chose X".
- **Worked:** single-table + atomic counters made the aggregate stats a one-query read, no scan. DynamoDB Local made offline dev trivial.
- **Needs work:** modeling GSIs for both item types in one table has a learning curve.
- **Again:** yes.

## Amazon S3 + CloudFront
- **Used for:** video storage (private bucket) served via CloudFront with Origin Access Control; browser uploads via presigned PUT and multipart.
- **Worked:** OAC + private bucket is the right modern pattern; presigned multipart handled large clips.
- **Needs work:** browser multipart needs `ExposeHeaders: ETag` in the bucket CORS — easy to miss, fails silently otherwise.
- **Again:** yes.

## AWS CDK
- **Used for:** all infrastructure — DynamoDB (series/episodes/sessions/prompt-cache), S3, CloudFront (OAC), Bedrock IAM managed policy, Lambda (NodejsFunction) for content-api and prompt-generator, HTTP API v2, and **ECS Fargate** (WebSocket relay, image via `ContainerImage.fromAsset`). Four stacks: `FirexpContentStack`, `FirexpAiStack`, `FirexpRelayStack`, `FirexpDashboardStack` (CMS on S3+CloudFront). The whole platform deploys autonomously from one GitHub Action (`cdk deploy --all` + seed + Bedrock access).
- **Worked:** `grant*` helpers and `S3BucketOrigin.withOriginAccessControl()` are excellent; `cdk synth` in CI catches drift; a single IaC tool across the whole project eliminates toolchain friction.
- **Needs work:** NodejsFunction bundling assumptions in a monorepo (projectRoot/depsLockFilePath) took trial and error.
- **Again:** yes.

## Hono
- **Used for:** relay HTTP + content-api + prompt-generator (Lambda + local via `@hono/node-server`).
- **Worked:** tiny, fast, one codebase runs on Lambda and locally; great DX.
- **Needs work:** none major.
- **Again:** yes.

## React + shadcn/ui + React Flow (dashboard)
- **Used for:** the CMS — series/episode CRUD, the visual flow editor, flag simulator, uploads.
- **Worked:** React Flow made the branching graph tangible; shadcn gave a fast, themeable UI.
- **Needs work:** React Flow bundle size is large; the CJS build of our workspace package needed a Vite alias to the source.
- **Again:** yes.

## Devpost
- **Used for:** submission.
- **Worked:** clear track/mini-challenge structure.
- **Needs work:** judging-criteria weights aren't published; the required deliverables would be easier as a pre-flight checklist.
- **Again:** yes.
