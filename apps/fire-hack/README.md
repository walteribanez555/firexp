# fire-hack — Interactive Branching Narrative for Fire TV

A Fire TV app where the story branches based on decisions the viewer makes on their phone. No gestures or computer vision required — the phone is the smart remote.

## How it works

1. A QR code appears on the TV screen
2. The viewer scans it with their phone and answers a short questionnaire
3. The cloud processes the answers and selects the opening chapter
4. The story plays on Fire TV (single concatenated MP4, navigation via seek)
5. At decision points, an overlay appears and the viewer chooses on their phone
6. The app seeks to the next chapter based on the decision; a timeout falls back to the default branch

## Architecture — MVVM

```
com.example.fire_hack/
├── data/
│   ├── model/          ← pure data classes, no logic
│   │   ├── StoryGraph.kt       — full story deserialized from assets
│   │   ├── Chapter.kt          — node: videoIn, videoOut, decisionAt, options, defaultNextId
│   │   ├── Decision.kt         — option: id, label, nextChapterId
│   │   ├── SessionEvent.kt     — sealed: SessionConnected | QuestionnaireComplete | DecisionMade | ...
│   │   └── AppState.kt         — sealed: Connecting | WaitingQuestionnaire | Playing | DecisionWindow | Ended
│   ├── source/         ← single-responsibility I/O adapters
│   │   ├── StoryAssetSource.kt     — reads story_graph.json from assets/
│   │   ├── SessionWebSocketSource.kt — OkHttp WebSocket → Flow<SessionEvent>
│   │   └── PlayerSource.kt         — ExoPlayer wrapper: play, pause, seekTo
│   └── repository/     ← abstracts sources; ViewModels only touch repositories
│       ├── StoryRepository.kt
│       ├── SessionRepository.kt
│       └── PlayerRepository.kt
├── domain/
│   └── usecase/        ← business logic, isolated from Android
│       ├── CreateSessionUseCase.kt       — generates sessionId + QR URL
│       ├── WatchEventsUseCase.kt         — Flow<SessionEvent> filtered for the ViewModel
│       └── ResolveNextChapterUseCase.kt  — (decision, currentChapter) → next Chapter
├── ui/
│   ├── viewmodel/
│   │   ├── ConnectionViewModel.kt  — creates session, exposes QR, detects phone connection
│   │   ├── WaitingViewModel.kt     — waits for QuestionnaireComplete event
│   │   └── PlayerViewModel.kt      — orchestrates ExoPlayer + WebSocket events + chapter resolution
│   ├── screen/
│   │   ├── ConnectionScreen.kt     — QR code + session code display
│   │   ├── WaitingScreen.kt        — spinner while user fills questionnaire on phone
│   │   ├── PlayerScreen.kt         — fullscreen ExoPlayer + conditional DecisionOverlay
│   │   └── EndingScreen.kt         — final screen with restart option
│   ├── component/
│   │   ├── QrCodeView.kt           — generates and renders QR from URL (ZXing)
│   │   ├── DecisionOverlay.kt      — semi-transparent overlay with countdown progress bar
│   │   └── ChapterTransition.kt    — black fade during seek between chapters
│   └── Navigation.kt               — NavHost with typed routes
└── MainActivity.kt
```

## Navigation flow

```
ConnectionScreen  →  WaitingScreen  →  PlayerScreen  →  EndingScreen
   (QR + code)      (questionnaire)    (video + decisions)   (final)
```

## Story graph

The full video is a single MP4 with all branches concatenated. The app navigates between chapters via `ExoPlayer.seekTo(positionMs)` — no multiple files, no multiple decoders.

`assets/story_graph.json` defines every chapter:

```json
{
  "startChapterId": "intro",
  "chapters": {
    "intro": {
      "id": "intro",
      "videoIn": 0,
      "videoOut": 30000,
      "decisionAt": 25000,
      "decisionWindow": 5000,
      "options": [
        { "id": "path_a", "label": "Path A", "nextChapterId": "branch_a" }
      ],
      "defaultNextId": "branch_a"
    }
  }
}
```

| Field | Description |
|---|---|
| `videoIn` / `videoOut` | Start and end of the chapter in milliseconds within the concatenated MP4 |
| `decisionAt` | Milliseconds from `videoIn` when the decision overlay appears |
| `decisionWindow` | How long (ms) the user has to decide before the default branch is taken |
| `defaultNextId` | Chapter to jump to if no decision arrives in time |

## Video pipeline

```bash
# Encode all clips with a keyframe every 0.5s for fast seeking
ffmpeg -i clip1.mp4 -g 15 -r 30 clip1_enc.mp4
ffmpeg -i clip2.mp4 -g 15 -r 30 clip2_enc.mp4

# Concatenate into one file
ffmpeg -f concat -safe 0 -i filelist.txt -c copy story.mp4
```

## Dependencies

| Library | Purpose |
|---|---|
| `androidx.media3:media3-exoplayer` | Video playback + seek |
| `androidx.media3:media3-ui` | `PlayerView` for Compose via `AndroidView` |
| `com.squareup.okhttp3:okhttp` | WebSocket client for relay events |
| `org.jetbrains.kotlinx:kotlinx-serialization-json` | Deserialize `story_graph.json` and WebSocket messages |
| `androidx.navigation:navigation-compose` | Screen navigation |
| `com.google.zxing:core` | QR code generation |
| `androidx.tv:tv-material` | Compose components optimized for TV |

## Relay protocol (WebSocket)

The relay server sends JSON messages to the TV app:

```json
{ "type": "SESSION_CONNECTED", "payload": { "sessionId": "ABC12345" } }
{ "type": "QUESTIONNAIRE_COMPLETE", "payload": { "initialChapterId": "intro" } }
{ "type": "DECISION_MADE", "payload": { "decisionId": "path_a" } }
```

## Hackathon tracks

- **Primary:** Fire TV (Fire OS, Android/Kotlin, Jetpack Compose)
- **Categories:** AI-enhanced viewing · Multi-modal UX · Family entertainment
- **Mini challenge:** AWS Builder (Bedrock for questionnaire processing) · Open Source

## Build & run

1. Open `apps/fire-hack` in Android Studio
2. Connect a Fire TV device or launch a Fire TV AVD
3. Run the app — a QR code will appear on screen
4. Open the phone web app, scan the code, and answer the questionnaire
