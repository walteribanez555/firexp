# fire-hack — Interactive Branching Narrative for Fire TV

A Fire TV app where a story branches on decisions the **room** makes from their
phones. No gestures or computer vision — each phone is a second-screen voting
controller, and the TV never shows any decision UI (all interaction lives on the
phones; the inverse of X-Ray).

## How it works

1. The TV shows a catalog; the viewer picks an episode.
2. A **QR code** appears; each viewer opens the phone web page (no install) and
   answers a short questionnaire that sets the room's numeric **flags**.
3. On `episode_start`, the TV begins playing **continuous video**.
4. Decisions appear **only on the phones**. Viewers vote; the tally is live and
   votes are revocable until the timer closes.
5. The TV silently cuts to the branch the room chose — **flags select the clip** —
   and preloads the next one. Different rooms reach different endings.

The TV is autonomous: it drives the timeline, opens/closes decision windows,
tallies votes and picks variants. The relay is a dumb forwarder; there is no
decision overlay rendered on the TV.

## Architecture

```
com.example.fire_hack/
├── Config.kt                     — RELAY_CLOUD host (RELAY_HOST/PHONE_HOST alias it)
├── MainActivity.kt
├── domain/
│   └── StoryEngine.kt            — the "director": delay-based timeline, opens
│                                   decision windows, tallies votes, applies flags,
│                                   selects the next variant (first-match `when`)
├── data/
│   ├── model/                    — Series, EpisodeSummary, EpisodeGraph, StoryChapter,
│   │                               StoryVariant, ChapterDecision, Route, …
│   └── source/
│       ├── PlayerSource.kt       — @UnstableApi ExoPlayer wrapper: media cache,
│       │                           preload (CacheWriter), decoder fallback (no black screen)
│       └── SessionWebSocketSource.kt — OkHttp WebSocket → Flow of relay messages
└── ui/
    ├── Navigation.kt             — state-driven screens: Splash → Catalog → Lobby
    │                               → Playing (video only) → Ending
    ├── screen/                   — SplashScreen, SeriesCatalogScreen, LobbyScreen, EndingScreen
    ├── component/                — FirexpLogo, QrCodeView (ZXing), NetworkImage (OkHttp),
    │                               DecisionOverlay, ChapterTransition
    └── theme/                    — Color.kt (ember-on-near-black design system)
```

## Content model

Each **chapter** has its own **variant clips** (separate MP4s, not one concatenated
file). A variant carries a `when` condition over the room's flags (e.g.
`"confident >= 1"`, last is `"default"`); the StoryEngine picks the first match.
Episodes/series come from the **content-api** (via the relay's catalog proxy);
media URLs are resolved against `Config.RELAY_HOST` (`/images/...`) or the CDN.

## Networking (`Config.kt`)

`RELAY_CLOUD` is the single backend host; `RELAY_HOST` and `PHONE_HOST` alias it.
- **Deployed relay** (ECS Fargate): `http://<fargate-ip>:3001` — resolve the
  current (ephemeral) IP with `bash infra/scripts/relay-ip.sh`.
- **Local dev**: `http://10.0.2.2:3001` on the Android TV emulator, or the host
  LAN IP on a physical device (TV + phones on the same WiFi).

## Relay protocol (WebSocket)

The TV connects with `?room=<CODE>&role=tv`; phones connect with `?room=<CODE>`.
JSON messages (see `apps/relay` and `packages/types`):

| Direction | `type` | Meaning |
|---|---|---|
| relay → all | `episode_start` | questionnaire done → `{ chapterId, flags }` |
| TV → relay → phones | `window_open` / `window_closed` | open/close a decision window |
| phone → relay → TV | `vote` | a viewer chose an option (revocable) |
| relay → room | `tally` | live vote counts |
| TV → relay → phones | `watching` | currently playing chapter/variant |
| relay → phone | `assigned` / `window_open_sync` | join + late-join catch-up |
| TV → relay | `log_entry` / `story_end` | persisted to DynamoDB via content-api |
| both | `ping` / `pong` | relay is the reference clock |

## Dependencies

| Library | Purpose |
|---|---|
| `androidx.media3:media3-exoplayer` (+`-ui`) | playback, media cache, preload, decoder fallback |
| `com.squareup.okhttp3:okhttp` | WebSocket client + image loading |
| `org.jetbrains.kotlinx:kotlinx-serialization-json` | relay message / model (de)serialization |
| `com.google.zxing:core` | QR generation |
| `androidx.tv:tv-material` (`androidx.tv.material3`) | TV-optimized Compose (D-pad focus) |

## Build & run

1. Open `apps/fire-hack` in Android Studio.
2. Point `Config.kt`'s `RELAY_CLOUD` at your relay (deployed IP via
   `relay-ip.sh`, or `http://10.0.2.2:3001` for the emulator against a local relay).
3. Run on a Fire TV device or a Television AVD → the catalog appears; pick an
   episode to show the QR and start a room.

> Videos: the deployed relay serves the phone page + images but **not** `/videos`
> (branch clips are hosted on S3/CloudFront and uploaded via the CMS). With only
> the seed data, catalog + decisions work but branch playback falls back until
> clips are uploaded.

## Hackathon

- **Track:** Fire TV (Fire OS, Kotlin, Jetpack Compose / Compose for TV).
- **Categories:** multi-modal UX · family entertainment · AI-enhanced viewing.
- **Mini challenges:** AWS Builder (Bedrock recaps/prompts) · Open Source.
