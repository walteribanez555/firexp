# Firexp — Handoff & Current-State Report

> Purpose: a self-contained snapshot for **another model/engineer to evaluate the
> current product** without prior context. It captures what exists, what's
> deployed, every deliberate design decision/consideration, current status vs the
> roadmap, known gaps, and how to run/verify. Written after a multi-session build.
> Account **557690620729** · region **us-east-1**. Dev environment.

---

## 1. What Firexp is

Four people on a couch. The show hits a fork, and every "what would *you* do?"
dies quietly in one person's head. Every fix so far has been individual —
Bandersnatch hands one remote to one person; X-Ray informs whoever holds the
phone but gives them no power and doesn't involve the others. **Firexp inverts
it: the room decides, and nobody stares at a screen that isn't the TV.**

> Twitch taught audiences to decide together. X-Ray taught Amazon that the second
> screen belongs in the living room. **Firexp is the show where the room votes
> from their phones and the TV never breaks.**

Concretely, it's an interactive **branching-narrative** platform for **Amazon
Fire TV** (hackathon: Fire TV track + AWS Builder + Open Source). The room watches
together and decides the story **from their phones**:

1. Fire TV shows a catalog → pick an episode → a **QR** appears.
2. Each viewer opens a phone web page (no install), answers a short questionnaire
   that sets the room's numeric **flags**.
3. The TV plays **continuous video**; decisions appear **only on the phones**
   (live tally, revocable votes, countdown). The TV shows **no decision UI**.
4. Flags select which **variant clip** plays next → different rooms reach
   different endings. After the episode: "your room chose A · 62% of rooms chose
   B" + a **Bedrock/Nova**-generated recap.

**Differentiator:** the TV never breaks immersion (inverse of X-Ray). A shared
TypeScript `story-graph` engine drives the TV, the CMS flag-simulator, and static
validation ("fake choice" detection).

---

## 2. Current state at a glance

| Area | State |
|---|---|
| Backend (content-api, prompt-gen, DynamoDB, S3, CloudFront) | ✅ **Deployed on AWS** (serverless) |
| Relay (WebSocket) | ✅ **Deployed on ECS Fargate** (dev: 1 task, public IP) |
| Dashboard / CMS (React) | ✅ **Deployed on S3 + CloudFront** |
| TV app (fire-hack, Kotlin) | ✅ Builds + runs on the `Television_1080p` emulator against the deployed relay |
| Phone web (vote UI) | ✅ Served by the relay |
| Autonomous deploy (GitHub Actions) | ✅ Validated end-to-end from a clean slate |
| **Playable branch video** | ❌ **Not yet** — clips are not uploaded to S3, so `/videos/*` 404s and playback falls back |

**End-to-end works today:** catalog → QR → lobby/questionnaire → room votes →
live tally → decision results → ending + Library tabs. **Video playback of
branches does not** (no media in S3).

---

## 3. Live endpoints (dev, as of writing)

| Service | URL |
|---|---|
| content-api (HTTP API) | `https://irxwyxqdxe.execute-api.us-east-1.amazonaws.com` (routes under `/api/v1`) |
| prompt-generator (Bedrock) | `https://r7pz6dhnr1.execute-api.us-east-1.amazonaws.com` |
| CloudFront (media CDN) | `https://d3czjx65mtprz5.cloudfront.net` |
| Dashboard / CMS | `https://d2auh5dqwmf43n.cloudfront.net` |
| Relay (WebSocket + phone + catalog proxy) | `http://34.227.161.148:3001` **(ephemeral — see §5)** |

Quick checks (all returned HTTP 200 at handoff): `/api/v1/series`, relay `/health`,
relay `/phone/`, dashboard root.

> ⚠️ The **relay IP is ephemeral** (dev has no load balancer). If the relay is
> redeployed/restarted it changes. Re-resolve with `bash infra/scripts/relay-ip.sh`
> and update `apps/fire-hack/.../Config.kt` (`RELAY_CLOUD`).

---

## 4. Architecture

Monorepo (Turborepo + npm workspaces).

```
apps/
  fire-hack/         TV — Android/Kotlin/Compose for TV. StoryEngine (autonomous
                     "director"), ExoPlayer (preload + decoder fallback), QR.
  phone/             Viewer web client — apps/phone/web (vanilla TS + Vite),
                     built into apps/relay/public/phone. (No React Native.)
  relay/             Hono + `ws`. "Dumb forwarder": rooms, live tally, host/lobby,
                     late-join, ping/pong reference clock; serves phone + media;
                     proxies content-api; forwards log_entry/sessions to content-api.
  content-api/       Hono on DynamoDB. Series/episodes source of truth; sessions
                     with atomic vote aggregates (/stats); S3 presign (single+multipart);
                     Bedrock recap; 422 graph validation.
  content-dashboard/ React + shadcn CMS: series/episode CRUD, React Flow editor,
                     flag simulator, inline per-step video upload.
  prompt-generator/  Bedrock (Converse) prompt service + DynamoDB prompt-cache (Lambda).
packages/
  types/             @fire-stick/types — shared TS interfaces + zod schemas.
  story-graph/       @fire-stick/story-graph — pure branching engine + AST + validation.
infra/cdk/           AWS CDK (TypeScript) — 4 stacks (below).
infra/scripts/       relay-ip.sh, bedrock-access.sh
.github/workflows/   ci.yml (node + cdk + android) · deploy.yml (manual autonomous deploy)
```

**CDK stacks (4):**
- `FirexpContentStack` — DynamoDB (series/episodes/sessions) + private S3 + CloudFront (OAC) + content-api Lambda + HTTP API v2.
- `FirexpAiStack` — Bedrock IAM managed policy + prompt-cache DynamoDB (TTL) + prompt-generator Lambda + HTTP API.
- `FirexpRelayStack` — ECS Fargate WebSocket relay. Image built by CDK via `ContainerImage.fromAsset` (ARM64/Graviton, distroless). Content-api URL wired via `Fn.importValue`. **DEV** = single task, public IP, no ALB, no NAT, `ws://`. **PROD** branch = ALB + NAT + private task (not deployed).
- `FirexpDashboardStack` — CMS SPA on private S3 + CloudFront (OAC), gated by `-c dashboard=true` (uploads the built `dist`).

**WebSocket protocol (vote-based):** `episode_start`, `window_open`/`window_closed`,
`vote`, `tally`, `watching`, `window_open_sync` (late join), `log_entry`/`story_end`,
`ping`/`pong`. Schemas in `@fire-stick/types`.

---

## 5. Design decisions & considerations (important context)

These are **deliberate**, not oversights:

1. **Dev/budget posture.** The deployed setup minimises cost: relay = **1 Fargate
   task, public IP, NO ALB, NO NAT** (~$9/mo vs ~$57 with ALB+NAT), plain `ws://`
   (no TLS), `CORS: *`. Documented in `infra/cdk/README.md` ("Development posture
   & cost trade-offs"). Turn the relay off to reach ~$0 compute:
   `aws ecs update-service --cluster firexp-dev-relay-cluster --service firexp-dev-relay --desired-count 0`.
2. **Ephemeral relay IP.** No stable hostname in dev (no ALB/Route53). `Config.kt`
   is hand-updated per redeploy via `relay-ip.sh`. Prod fix noted (ALB + ACM + Route53).
3. **Videos not in S3 → 404.** Seed uses relative `/videos/...` paths the relay
   doesn't host (excluded from the image; media belongs on S3/CloudFront). Upload
   via the dashboard (real presign) to enable playback. Thumbnails (`/images/*`) work.
4. **Relay is stateful & single-task.** Room state is in an in-memory `Map` AND
   persisted to **local disk** (ephemeral on Fargate). It **cannot scale
   horizontally** without shared state — the central prod problem (see §9/§10).
5. **Autonomous deploy.** `cdk deploy --all` builds/pushes the relay image
   (`fromAsset`), wires cross-stack URLs (`Fn.importValue`), seeds DynamoDB, and
   runs a Bedrock model-access preflight (`bedrock-access.sh`). Validated on a
   clean slate via GitHub Actions. **Only human setup:** 2 repo secrets
   (`AWS_ACCESS_KEY_ID/SECRET`). Bedrock model access is automated + already granted.
6. **TV = video only.** Per product decision, the TV renders **no decision
   overlay**; all interaction is on the phone ("todo por detrás").
7. **Phone is web, not RN.** An abandoned React Native tree was removed; the phone
   is `apps/phone/web` (vanilla TS), served by the relay.
8. **Client-side session log fallback (phone).** The Library tabs
   (Journey/Votes/What-if) now build a log client-side from `watching`/`window_closed`
   so they show data even if the relay's server log is empty.
9. **TypeScript aligned to 6.x** across the monorepo (was mixed 5.9/6.0).
10. **Known IAM gap:** content-api calls Bedrock for recaps, but the Bedrock
    policy lives in `FirexpAiStack` and is currently **manually attached** (comment
    in `bin/firexp.ts`). Should be wired in code.

---

## 6. Status vs roadmap (`docs/ROADMAP.md`)

**Product (Part A):** A0 ✅ · A1 ✅ (live tally, revocable, countdown) · A2 🟡
(host+lobby+late-join ✅; host controls + audience rule ⬜) · A3 🟡 ("% of rooms" ✅;
lit path graph in Library ⬜) · A4 ✅ (fake-decision validation) · A5 ⬜ (dead-ends) ·
A6 ⬜ (viewer profile) · A7 ⬜ (creator analytics) · A8 ⬜ (X-Ray context).

**Technical (Part B):** B1 ✅ (pure engine + AST + fixtures; **Kotlin↔TS JUnit
parity ⬜**) · B2 ✅ (RoomState + clock + zod) · B3 ✅ (sessions + /stats) · B4 🟡
(decoder fallback ✅; `DefaultPreloadManager` + `tv.material3` migration ⬜) · B5 🟡
(phone reconnect/vibrate/wakelock ✅; **viewerId dedup in relay ⬜**) · B6 🟡 (recap ✅;
cache by `hash(prompt+model+schema)` ⬜) · B7 ✅ (MySQL out, single `dev`, CI, LICENSE, README EN).

**Beyond the original roadmap (done this session):** full AWS deploy + autonomous
CI/CD, dashboard hosting, CDK CI job, dead-code cleanup, docs reconciled with code.

---

## 7. Submission (Devpost) status (`docs/SUBMISSION.md`)

- ✅ Track (Fire TV) + mini challenges (AWS Builder, Open Source) selected.
- 🟡 Project description + product-feedback + friction-logs drafted (`docs/submission/`).
- ⬜ **Produced demo episode with real playable clips** (biggest gap — video 404).
- ⬜ **Demo video** (<3 min, English).
- ⬜ **Devpost form** submitted.
- ⬜ **APK in GitHub Releases** (APK builds: `apps/fire-hack/app/build/outputs/apk/debug/app-debug.apk`, ~50MB).
- ⬜ **Open Source**: publish `@fire-stick/story-graph` to npm or a PR.
- 🟡 Repo: LICENSE ✅, README EN ✅, `.env.example` ✅, CI ✅, `npm run dev` ✅;
  "What we built (dates)" + AWS-integration diagram + git-history secrets scan ⬜.

---

## 8. Known issues / gaps

- **No playable video** in the cloud (S3 empty) → branch playback falls back.
- **Relay single-task + in-memory/local-disk state** → no horizontal scale; task
  replacement loses live rooms.
- **Ephemeral relay IP** → `Config.kt` hand-edited per redeploy.
- **`ws://` (no TLS)** → fine for emulator/LAN; blocks HTTPS-hosted phone pages.
- **CORS `*`** and **Bedrock discovery IAM `*`** (dev).
- **CMS is open** (no auth) — anyone with the CloudFront URL can edit content /
  issue presigned uploads.
- **Bedrock policy manual-attach** cross-stack gap (bin comment).
- **Kotlin↔TS parity** JUnit test still missing (fixtures exist).

---

## 9. Production readiness

A full phased plan exists (produced by an architect pass; summary):
- **Phase 0 (quick wins):** TLS/`wss://`, CORS lockdown, GitHub **OIDC** (drop
  static keys), AWS Budgets, wire Bedrock IAM in code + tighten discovery.
- **Phase 1 (foundational):** multi-env dev/staging/prod + approvals, WAF, **CMS
  auth (Cognito + API JWT authorizer)**, DynamoDB PITR/Backup/TTL, custom domains,
  observability (dashboards/alarms/SNS/X-Ray).
- **Phase 2 (scale):** **relay shared state via ElastiCache Redis pub/sub**
  (recommended over API-GW-WebSocket rewrite or a custom sharded router) →
  multi-task autoscaling + multi-AZ; blue/green-aware rolling deploys.

---

## 10. How to run & verify

**Local (all services):**
```bash
npm install
npm run dev          # DynamoDB Local + content-api(:3003) + relay(:3001) + dashboard(:5174)
# TV: open apps/fire-hack in Android Studio; Config.kt RELAY_CLOUD = http://10.0.2.2:3001 (emulator)
```

**Against the deployed backend:**
- Dashboard: `apps/content-dashboard/.env` → `VITE_CONTENT_API_URL=<content-api>/api/v1`; `npm run dev -w content-dashboard`.
- TV: `Config.kt` `RELAY_CLOUD = http://<relay-ip>:3001` (`relay-ip.sh`); `./gradlew :app:installDebug`.
- Phone (manual test): open the relay's `/tv-sim` in a browser to get a room+QR, then `/phone?room=<CODE>`.

**Deploy (autonomous):** GitHub Actions → **Deploy (CDK)** → run (dev/prod). Or
`cd infra/cdk && npx cdk deploy --all -c environment=dev`. Full guide:
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## 11. Repo / evaluation notes

- Docs to read next: `README.md`, `docs/DEPLOYMENT.md`, `docs/STATUS.md`,
  `docs/ROADMAP.md`, `infra/cdk/README.md`, per-app `README.md`s (recently
  reconciled with the code).
- Tests: content-api **60** (jest), story-graph **72** (vitest), CDK **64** (jest);
  TV compiles (`compileDebugKotlin`). CI runs node + cdk + android.
- **Working-tree note:** at handoff there may be **uncommitted local changes**
  (recent doc reconciliation + the phone/TV UI fixes + `Config.kt` IP). Check
  `git status`; the deployed artifacts already reflect them.
- Verified interactively this session: the emulator loads the catalog (5 series)
  from the deployed relay and shows the lobby QR pointing at the deployed relay;
  content-api/dashboard/relay all return 200.

---

## 12. Suggested evaluation focus

1. Does the **branching model** (flags → `when` variant selection, first-match,
   `default` last) hold up? See `packages/story-graph`.
2. Is the **relay's dumb-forwarder + TV-as-brain** split sound, and is the
   single-task/state limitation acceptable for the target (living-room rooms)?
3. Is the **autonomous IaC** (4 stacks, `fromAsset`, `Fn.importValue`, seed +
   Bedrock preflight) correct and reproducible?
4. Biggest product gap to a compelling demo: **real playable clips in S3** — is
   the upload path (dashboard presign → S3 → CloudFront) production-shaped?
