# Firexp — Branching Interactive Narrative for Fire TV

[![CI](https://github.com/walteribanez555/firexp/actions/workflows/ci.yml/badge.svg)](https://github.com/walteribanez555/firexp/actions/workflows/ci.yml)

> Also available in [Español](README.es.md)

Four people on a couch. The show hits a fork, and every "what would *you* do?" dies quietly in
one person's head. Every fix so far has been individual — Bandersnatch hands one remote to one
person; X-Ray informs whoever holds the phone but gives them no power and doesn't involve the
others. **Firexp inverts it: the room decides, and nobody stares at a screen that isn't the TV.**

> Twitch taught audiences to decide together. X-Ray taught Amazon that the second screen belongs
> in the living room. **Firexp is the show where the room votes from their phones and the TV never breaks.**

### What it does

1. The Fire TV shows an episode; a **QR** appears — each viewer opens a phone web page, no install.
2. A short **questionnaire** sets the room's profile (numeric flags).
3. As the story plays, decisions appear **only on the phones**; viewers **vote** (live tally, revocable until the timer closes).
4. The **TV never shows decision UI** — it plays continuous video and silently cuts to the branch the room chose. Different rooms reach different endings, then: "your room chose A · 62% of rooms chose B" + a **Bedrock/Nova** recap.

**Track:** Fire TV (Fire OS / Android) · **Mini challenges:** AWS Builder (Bedrock) · Open Source

---

## 1. Concept (business logic)

An episode is not a linear video — it is a **graph of clips (variants)** connected by decisions.
The audience builds their own version of the story:

1. **Initial questionnaire** → sets a viewer profile (numeric flags).
2. During playback, **decisions appear** on the phone for viewers to vote on.
3. Each decision **mutates the flags**, and the flags **select which clip plays next**.
4. The condition tree leads to **different endings**.

> In one sentence: *the questionnaire profiles the viewer, each decision mutates flags, the flags
> select the clip, and the condition tree leads to different endings — the TV is the
> player/brain and the phone is the decision controller.*

---

## 2. How we built it (architecture)

```
                 ┌───────────────── DynamoDB ─────────────────┐
                 │   series · episodes (graph) · prompt-cache  │
                 └───────────────────▲─────────────────────────┘
                                     │
        ┌──────────────┐   HTTP {data}│        ┌──────────────────┐
        │ content-api  │◀─────────────┘        │ prompt-generator │  (Bedrock)
        │ (stateless)  │  S3 presign/multipart │   (stateless)    │
        └──────▲───────┘        │              └──────────────────┘
   CONTENT_API │                ▼
        ┌──────┴───────┐    ┌───────┐        ┌─────────────────────┐
        │    RELAY     │    │  S3   │──CDN──▶│  CloudFront (video) │
        │ WS + static  │    └───────┘        └─────────────────────┘
        │  /videos /phone
        └───▲───────▲──┘
   WebSocket│       │HTTP + WS
     ┌──────┴──┐  ┌─┴────────┐
     │ fire-hack│  │  phone   │  (web, no install)
     │   (TV)   │  │ (device) │
     └──────────┘  └──────────┘
```

| Component | Type | Role |
|---|---|---|
| **fire-hack** (Android/Kotlin/Compose) | TV app | The "director": plays video (ExoPlayer), runs the `StoryEngine`, opens decision windows, tallies votes, picks the branch. |
| **phone** (`apps/phone/web`, TS+Vite) | Web served by relay | The viewer scans a QR code, answers the questionnaire, and **votes**. No app install required. |
| **relay** (Hono + `ws`) | Real-time | Forwards messages by room, serves the phone client and media (`/videos`, `/images`), proxies the catalog. **No business logic.** |
| **content-api** (Hono) | Stateless | Source of truth for content over **DynamoDB**; generates presigned URLs (single/multipart) for uploading to **S3**. |
| **content-dashboard** (React + shadcn) | CMS | Create series/episodes, edit the **flow** (React Flow), and upload videos per variant. |
| **prompt-generator** (Hono/Lambda) | Stateless | Generates decision text with **Bedrock**, cached in DynamoDB. |
| **packages/types** | Library | Shared contracts (`@fire-stick/types`) across relay, phone, content-api, and the TV mirror. |

---

## 3. Data model

```
Series → Episodes → Chapters → { Variants, Decisions }
```

- **Flags** — numeric counters (`violent`, `confident`, `united`, …). Seeded from the
  questionnaire and mutated with each decision (`"+1"`/`"-1"` = relative, plain number =
  absolute).
- **Variant** — a video clip per branch: `{ in, out, when, tag, videoUrl }`. `when` is a
  condition on flags (`violent >= 1`, `confident <= -2 && united >= 1`). **The last variant is
  always `when: "default"`.**
- **Decision** — `phase: "pre"` (before the chapter) or `"during"` (at a timestamp `at`), with
  `options: [{ gesture, label, set }]` (where `set` mutates flags) and a `default` if nobody
  votes.

Variant selection: `when` is evaluated **top-to-bottom; the first match wins** (if none, `default`).

---

## 4. End-to-end flow

```
TV: catalog (DynamoDB) → select episode → display QR (relay LAN IP)
Phone: scan QR → join room (WebSocket) → questionnaire
   → POST /rooms/:code/questionnaire → relay applies flags → broadcast "episode_start"
TV: StoryEngine starts → plays chapter 1 variant (ExoPlayer)
   → at each decision: sends "window_open" ONLY to the phone (no overlay on TV)
Phone: shows decision → viewer votes ("vote")
TV: tallies votes → resolves (majority; tie/no votes = default) → applies flags
   → "window_closed" + "log_entry" → selects and plays next variant
     (pre-loaded → no buffering) … repeats until the end → "story_end"
Phone: Library (Journey / Votes / What-if)
```

**Design principle:** the relay is dumb, **the TV is the brain**, and **the TV never shows
decision UI** — only continuous video; all decision interaction lives on the phone ("all behind
the scenes").

### WebSocket message contract

| Direction | `type` | Use |
|---|---|---|
| phone → relay → TV | `vote` | Viewer chose an option |
| TV → relay → phones | `window_open` / `window_closed` | Open/close a decision window |
| TV → relay → phones | `watching` | Currently playing chapter/variant |
| TV → relay | `log_entry` / `story_end` | Persist decision / story end |
| relay → room | `assigned` / `viewer_left` | Viewer join/leave (TV joins with `role=tv`, not counted as viewer) |
| relay → all | `episode_start` | Questionnaire ready → `{ chapterId, flags }` |

---

## 5. Content management (CMS)

- In the **dashboard** you create series/episodes (episode number is **auto-assigned and unique**
  per series) and in the **flow editor** (React Flow) you model chapters → variants →
  decisions with their flag conditions; a **flag simulator** panel highlights the path that
  would play.
- **Video upload** per variant: `POST /uploads/presign` (or `multipart/*` for large files)
  → `PUT` directly to **S3** → `videoUrl` is stored (served by **CloudFront**).
- Everything persists in **DynamoDB**; relay/TV consume it with the same `{data}` contract.

---

## 6. Performance and resilience (TV)

- **Prefetch**: while a chapter plays, the next chapter's variants are prefetched (ExoPlayer
  media cache) → branch cuts with no buffering.
- **Multi-format**: decoder fallback + playback error handling — an incompatible clip does not
  break the story (the branch shows black, the engine continues).
- **No mock data**: the catalog shows only real content; if the backend is unreachable the list
  is empty (never fake series). The relay falls back to local JSON for the catalog.

---

## 7. Deploy topology

| Service | Type | Destination |
|---|---|---|
| content-api, prompt-generator | Stateless (HTTP) | **Lambda** (CDK `NodejsFunction`) |
| **relay** | **WebSocket / real-time** | **ECS Fargate** (Lambda doesn't support persistent WS) |
| data | — | **DynamoDB** |
| video | — | **Private S3 + CloudFront (OAC)** |
| phone | web | Static (served by the relay) |
| dashboard (CMS) | web | **Private S3 + CloudFront (OAC)** |

Infrastructure as code: **AWS CDK only** (`infra/cdk`) — **four stacks**:
`FirexpContentStack` (content-api + DynamoDB + S3 + CloudFront), `FirexpAiStack`
(Bedrock IAM + prompt-generator + prompt-cache DynamoDB), `FirexpRelayStack` (ECS
Fargate WebSocket relay) and `FirexpDashboardStack` (CMS on S3 + CloudFront, gated
by `-c dashboard=true`).

**Deploy is autonomous** — the `Deploy (CDK)` GitHub Action runs `cdk deploy --all`
(builds the relay image via `fromAsset`, wires cross-stack URLs), seeds DynamoDB,
enables Bedrock access and hosts the dashboard, with no manual steps. See
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

> **Dev vs prod / cost:** the deployed setup is intentionally a **development,
> budget-minimising** posture — the relay runs as a single Fargate task with a
> public IP and **no ALB and no NAT** (≈ $9/mo vs ≈ $57/mo), plain `ws://`, and
> `CORS: *`. These are deliberate cost/dev trade-offs; the relay stack's `prod`
> mode adds ALB + NAT and TLS/CORS hardening should be applied before a public launch.

---

## 8. Repo layout

```
apps/
  fire-hack/         TV — Android/Kotlin/Compose (StoryEngine, ExoPlayer)
  phone/             Viewer web client (served by relay)
  relay/             WebSocket + static + catalog proxy
  content-api/       Content CRUD over DynamoDB + S3 presign
  content-dashboard/ CMS React (series, flow editor, uploads)
  prompt-generator/  AI prompt service (Bedrock + DynamoDB cache)
packages/
  types/             @fire-stick/types (shared contracts)
  story-graph/       @fire-stick/story-graph (graph logic)
infra/cdk/           CDK: 4 stacks (content, ai, relay, dashboard)
infra/scripts/       relay-ip.sh (resolve dev relay IP) · bedrock-access.sh (model access)
scripts/dev.sh       Single-command local dev launcher
docker-compose.yml   DynamoDB Local (dev)
```

---

## 9. Run in 5 minutes

```bash
# 0. Prerequisites: Node 24, Docker, Android Studio (for the TV app)
npm install

# 1. Start everything (DynamoDB Local + content-api + relay + dashboard)
npm run dev

# 2. Install the Fire TV APK
#    Open apps/fire-hack in Android Studio → Run on emulator or sideload to device.
#    Config (apps/fire-hack/.../Config.kt) sets a single RELAY_CLOUD host
#    (RELAY_HOST and PHONE_HOST both alias it):
#      Deployed relay → RELAY_CLOUD = http://<fargate-ip>:3001  (bash infra/scripts/relay-ip.sh)
#      Local dev      → http://10.0.2.2:3001 (emulator) or your LAN IP (physical device)
#    For local dev, TV and phone must be on the same WiFi.
```

`npm run dev` does the following automatically:

| Step | What |
|---|---|
| `docker compose up -d dynamodb-local` | Starts DynamoDB Local on :8000 |
| `npm run dynamo:init` (content-api) | Creates tables + seeds sample data (skipped if already done) |
| content-api on :3003 | DynamoDB-backed content source of truth |
| relay on :3001 | WebSocket hub + serves phone UI + proxies catalog |
| content-dashboard (Vite) | CMS at the Vite dev URL (:5174) |

---

## 10. Hackathon checklist

- [ ] Demo < 3 min (app on Fire TV / AVD)
- [ ] Public repo + open source license
- [ ] Description of what it does and how it works
- [ ] Mini challenge **AWS Builder** — Bedrock in `prompt-generator`
- [ ] Mini challenge **Open Source**
