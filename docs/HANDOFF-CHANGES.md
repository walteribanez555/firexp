# Firexp — Change Report (session delta)

> Purpose: a self-contained summary of **what changed in the latest work session
> and the current state**, for another model/engineer to evaluate. Read
> [`HANDOFF.md`](../HANDOFF.md) first for the base product/architecture; this doc
> is the **delta** on top of it (positioning + 3 feature tracks + cost strategy).
> Account **557690620729** · **us-east-1** · dev.

**TL;DR:** four parallel work tracks landed — (1) narrative/positioning reframe,
(2) **Amazon Nova** as the AI (recap/prompts + Nova Canvas cover art), (3) **Fire
TV** device signals (deep link + home recommendations), (4) **Twitch chat → votes**.
All builds/tests are green. **The changes are code-complete but NOT yet committed
and NOT yet deployed** (the live AWS env still runs the previous version).

---

## 1. What changed (4 tracks)

### Track A — Narrative / positioning (docs only)
Repositions the pitch to **lead with the human tension, not the architecture**
(the risk flagged: a Fire TV judge reads a "thin TV app + big cloud platform").
- `docs/submission/description.md` — rewritten into Devpost **Story** headers
  (Inspiration → What it does → How we built it → Challenges → What's next); the
  couch scene + "interactivity has been individual (Bandersnatch/X-Ray)" → "the
  room decides." Diagram moved under *How we built it*. Thesis line + ecosystem
  analogies (Twitch / X-Ray / Prime Video co-viewing).
- `README.md`, `README.es.md`, `HANDOFF.md` — openings reframed (tension → product
  → architecture). Enforced rule: the word "architecture" appears only in the
  *How we built it* section.
- `docs/submission/product-feedback.md` — added ecosystem-fit framing (esp. Bedrock/Nova, Fire OS).
- `docs/SUBMISSION.md` — video-script rule: **no "architecture" before minute 2**;
  **first 45s + last 30s are Fire TV**, cloud in the middle as support.
- `docs/GTM-PLAN.md` (new) — tiered go-to-market plan + "nothing that can't be
  shown in the video or the repo" rule.

### Track B — Amazon Nova (Bedrock)
Makes the AI **Amazon-first** and adds AI cover art.
- **Model swap → `us.amazon.nova-lite-v1:0`** (default, env-configurable via
  `BEDROCK_MODEL_ID`; Anthropic haiku/sonnet remain as override). Nova speaks the
  Converse API, so the recap + prompt-generator work with an id swap.
  - `infra/cdk/lib/firexp-ai-stack.ts` (default model + Nova ARNs in the IAM policy),
    `apps/content-api/src/config/config.ts` + `.../sessions/sessions.module.ts` (recap),
    `apps/prompt-generator/src/config/config.ts`.
- **Closed the cross-stack IAM gap in code:** the content-api Lambda now gets an
  inline `bedrock:InvokeModel` grant in `FirexpContentStack` (no more manual
  `attach-role-policy`; note updated in `bin/firexp.ts`).
- **Nova Canvas cover generation:** `apps/content-api/src/modules/covers/covers.service.ts`
  (new) → `InvokeModel` on `amazon.nova-canvas-v1:0` (1280×720), uploads the PNG to
  S3 (`images/covers/<id>.png`), sets `thumbnailUrl` to the CDN URL. Routes
  `POST /api/v1/series/:id/cover` and `POST /api/v1/episodes/:id/cover`. **Fails soft**
  (stub URL) if Bedrock/bucket unavailable.
- **CMS button:** "Generate cover (Nova)" in the dashboard series menu
  (`apps/content-dashboard` — `Sidebar.tsx`, `use-series` hook, `series.api.ts`).
- `infra/scripts/bedrock-access.sh` — now also ensures access for Nova Lite + Nova Canvas.

### Track C — Fire TV device signals (Kotlin, `apps/fire-hack`)
Makes the TV exercise Fire-TV-specific capabilities (answers "uses device capabilities").
- **Deep link** `firexp://episode/<episodeId>[?series=<id>]` → resolves the episode
  from the catalog, creates a room, lands on the **Lobby/QR** (bypasses the catalog).
  Files: `deeplink/DeepLink.kt`, `deeplink/DeepLinkPendingIntent.kt`, `MainActivity.kt`
  (onCreate + onNewIntent), `ui/Navigation.kt` (`enterRoom` + `LaunchedEffect(deepLink)`),
  `AndroidManifest.xml` (VIEW intent-filter).
  Test: `adb shell am start -a android.intent.action.VIEW -d "firexp://episode/episode2" com.example.fire_hack`
- **Fire TV home recommendations row:** `recommendations/RecommendationsPublisher.kt`
  + `BootRecommendationReceiver.kt` — posts "Continue your room's story — <title>"
  cards (NotificationCompat + `CATEGORY_RECOMMENDATION` + art + deep-link PendingIntent),
  on `BOOT_COMPLETED` and after an episode ends. **Renders only on a physical Fire TV**
  (the emulator posts but doesn't show the row); the deep link works everywhere.

### Track D — Twitch chat → audience votes (`apps/relay`)
Turns a Twitch stream's chat into votes (Amazon-owned platform hook). **Inert when
unconfigured.**
- `apps/relay/src/modules/twitch/twitch.adapter.ts` (new) — anonymous read-only IRC
  over WS (`wss://irc-ws.chat.twitch.tv:443`), parses `!a`/`!b`/`!c` or `!1`/`!2` →
  option index of the current open window.
- **Audience rule (safe):** Twitch votes only touch `openWindow.tally` (count toward
  the winner) but **never re-profile flags** and are never saved as viewer profiles
  (flags come only from the TV's `log_entry` = phone votes). Deduped per Twitch user
  per window; reset on `window_open`.
- Wire-up: `rooms.types.ts`, `rooms.service.ts` (`handleWindowOpen`/`handleAudienceVote`),
  `main.ts` (`initFromEnv`, detach on `story_end`), `rooms.module.ts`
  (`POST/DELETE /api/v1/rooms/:code/twitch`), `.env.example`.
- Enable: env `TWITCH_CHANNEL`+`TWITCH_ROOM`, or `POST /api/v1/rooms/:code/twitch {channel}`.

---

## 2. Verification (all green, this session)

| Area | Result |
|---|---|
| packages (types, story-graph) | build ✓ |
| content-api | build ✓ · **60/60** jest ✓ |
| story-graph | **72** vitest ✓ |
| relay | esbuild build ✓ |
| prompt-generator | build ✓ · 9/9 tests ✓ |
| content-dashboard | `tsc -b && vite build` ✓ |
| infra/cdk | `tsc --noEmit` ✓ · `cdk synth --all` ✓ · **67/67** jest ✓ |
| fire-hack | `compileDebugKotlin` ✓ |

---

## 3. Caveats (must know before relying on it)

1. **Nova model access.** IAM ≠ entitlement — `amazon.nova-lite-v1:0` and
   `amazon.nova-canvas-v1:0` must be enabled in Bedrock (console or
   `bedrock-access.sh`). Until then recap/covers **fail soft** (templated recap /
   stub URL). Anthropic (haiku/sonnet) was already granted in this account; Nova
   grant not yet confirmed.
2. **prompt-generator uses forced tool-use** (`toolChoice`), which Nova supports
   less fully than Anthropic. If Nova rejects it, set `BEDROCK_MODEL_ID` back to an
   Anthropic profile **for that Lambda only** (env, no code change). Recap (plain
   Converse) and Nova Canvas covers are unaffected.
3. **Fire TV recommendations** render only on a real Fire TV device; the deep link
   is the demoable part everywhere.
4. **Twitch** is inert unless configured; audience votes never affect flags.

---

## 4. State: code vs deployed (important)

- **Code:** the four tracks above are complete and building. **Not committed** yet
  (check `git status`) and **not deployed**.
- **Deployed (live) AWS still runs the PREVIOUS version** (pre-Nova/Twitch/deep-link):
  content-api `https://irxwyxqdxe.execute-api.us-east-1.amazonaws.com`, relay
  `http://34.227.161.148:3001` (ephemeral IP), dashboard
  `https://d2auh5dqwmf43n.cloudfront.net`. Videos still 404 (no clips in S3).
- To make the new features **live**: `cdk deploy --all` (Nova + IAM + cover routes)
  → redeploy relay (Twitch; new IP → update `Config.kt`) → rebuild/install the TV
  APK (deep link). Then grant Nova access (`bedrock-access.sh`).

---

## 5. Cost strategy (asked this session)

Only the **relay Fargate** (~$9/mo *running*) and **Bedrock/Nova usage** cost
anything; the rest is free-tier/idle ≈ $0. Recommended posture for a demo project:
- **Ephemeral:** `cdk destroy --all` after use (dev is `RemovalPolicy.DESTROY`, so
  $0 idle); redeploy autonomously (~10 min) when needed.
- Or **scale the relay to 0** between uses:
  `aws ecs update-service --cluster firexp-dev-relay-cluster --service firexp-dev-relay --desired-count 0`.
- **Guardrails:** AWS Budgets alarm; Nova Lite (cheap) + Canvas covers cached to S3
  (one-time per series) + recap/prompt DynamoDB cache with TTL; keep the dev
  topology (no ALB/NAT). *(A Budget + scheduled relay auto-off can be added to the
  CDK — proposed, not yet implemented.)*

---

## 6. Pending decisions / next steps

1. **Commit + push** the four tracks (suggested: `feat(nova)`, `feat(tv): deep link + recs`,
   `feat(relay): twitch votes`, `docs: story + GTM`).
2. **Deploy** to make it live (see §4) + grant Nova access.
3. **Cost automation** (Budget + relay auto-off) — optional, proposed.
4. **Real demo clips → S3** (unblocks branch-cut playback; the biggest demo gap).
5. Roadmap items still open (see `HANDOFF.md` §6): Kotlin↔TS JUnit parity, remote-as-backup-voter (A/V), viewer profile (A6), creator analytics (A7).

---

## 7. How to build & verify locally

```bash
# no reinstall needed if node_modules present
npm run build -w @fire-stick/types -w @fire-stick/story-graph
npm run build -w content-api -w relay -w prompt-generator -w content-dashboard
npm test -w content-api        # 60
npm test -w @fire-stick/story-graph  # 72
cd infra/cdk && npx cdk synth --all -c environment=dev && npm test   # 67
cd apps/fire-hack && ./gradlew :app:compileDebugKotlin --no-daemon
```
