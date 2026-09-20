# Firexp — Project Description (draft)

_Paste into Devpost "Story". English. Uses Devpost's suggested headers._

> Thesis: **Twitch taught audiences to decide together. X-Ray taught Amazon that the second screen belongs in the living room. Firexp is the show where the room votes from their phones and the TV never breaks.**

---

## Inspiration

Picture four people on a couch on a Friday night. The show hits a fork — someone should run, someone should stay — and every "what would *you* do?" dies quietly in one person's head. Nobody says it. The moment passes. You watched the same thing, but you didn't decide anything, together or apart.

Every attempt to fix this has been *individual*. Bandersnatch handed one remote to one person; the rest of the couch watched them choose. Second-screen companion apps light up one phone with trivia the others can't see. Amazon X-Ray tells the person holding the phone who's on screen — but it gives them no power over the story, and it doesn't involve anyone else in the room. One remote, one decider, everybody else spectates.

Firexp inverts that. The **room** decides. Everyone pulls out the phone already in their hand, and the one screen nobody has to look away from is the TV. The decision leaves the single remote-holder's head and becomes something the whole couch argues about out loud — and then votes on.

- **Twitch** brought audience participation to streaming; Firexp brings it to the living room.
- **X-Ray** tells you who's on screen; Firexp lets you decide what they do.
- **Prime Video co-viewing**: Amazon already knows people want to watch together — Firexp is what happens when they can also *decide* together.

---

## What it does

1. The Fire TV shows an episode; a **QR** appears. Each viewer opens a phone web page — no app to install.
2. A short **questionnaire** sets the room's profile as numeric "flags."
3. As the story plays, decisions appear **only on the phones**. Viewers **vote**; the tally moves live and votes are revocable until the timer closes.
4. The **TV never shows decision UI** — it plays continuous video and silently cuts to the branch the room chose. Different rooms reach different endings.

After the episode, each viewer sees **"your room chose A · 62% of rooms chose B"** and an **Amazon Bedrock / Nova**-generated recap of the route they took — a hook to replay and reach the ending only 8% of rooms saw.

---

## How we built it

One idea holds the whole system together: a **shared, pure branching engine**. The `story-graph` TypeScript package is the single source of truth for how flags select clips and how conditions resolve — the *same* code drives the TV, the CMS flag-simulator, and static "fake choice" validation.

The **TV is the brain**. The `StoryEngine` runs on the Fire TV device itself (Kotlin + Jetpack Compose, Media3/ExoPlayer): it plays video, opens the decision windows on the phones, tallies the votes, picks the branch, and prefetches the next clip so branch cuts don't buffer. The **relay is a dumb forwarder** — it moves messages between phones and the TV by room (live tally, host/lobby, late-join, a ping/pong reference clock) and holds **no** story logic. Everything else is AWS.

```
                 ┌───────────────── DynamoDB ─────────────────┐
                 │   series · episodes (graph) · prompt-cache  │
                 └───────────────────▲─────────────────────────┘
                                     │
        ┌──────────────┐   HTTP {data}│        ┌──────────────────┐
        │ content-api  │◀─────────────┘        │ prompt-generator │  (Bedrock / Nova)
        │ (stateless)  │  S3 presign/multipart │   (stateless)    │
        └──────▲───────┘        │              └──────────────────┘
   CONTENT_API │                ▼
        ┌──────┴───────┐    ┌───────┐        ┌─────────────────────┐
        │    RELAY     │    │  S3   │──CDN──▶│  CloudFront (video) │
        │ (dumb WS)    │    └───────┘        └─────────────────────┘
        │  /phone /videos
        └───▲───────▲──┘
   WebSocket│       │HTTP + WS
     ┌──────┴──┐  ┌─┴────────┐
     │ fire-hack│  │  phone   │  (web, no install)
     │ TV=brain │  │ (device) │
     └──────────┘  └──────────┘
```

- **Fire TV** (Kotlin/Compose + Media3/ExoPlayer) — plays video, runs the `StoryEngine`, prefetches branches, decoder fallback so a bad clip never blacks out the story.
- **Relay** (Hono + `ws` on **ECS Fargate**) — real-time forwarder: rooms, live tally, host/lobby, late-join, reference clock. No business logic.
- **content-api** (Hono, stateless) on **Amazon DynamoDB** — source of truth; atomic vote aggregates power "% of rooms chose X"; presigned single/multipart uploads to **S3**.
- **Video** on private **S3 + CloudFront (OAC)**.
- **Amazon Bedrock / Nova** — decision prompts and end-of-episode recaps.
- **CMS** (React + shadcn + React Flow) — creators build the branching *graph*, not the versions, with a flag simulator.
- Everything is **AWS CDK** (four stacks) and deploys autonomously from one GitHub Action.

---

## Challenges we ran into

- **A phone-to-phone reference clock.** Votes and countdowns have to feel simultaneous across three or four phones that never share a clock. We built a ping/pong reference clock through the relay so every phone counts down to the same close, and the TV resolves on a single deadline.
- **"During" decisions that must fit every variant.** A decision that fires mid-scene (`phase: "during"` at a timestamp) has to land cleanly no matter which branch the room is already on — the prompt, the timing, and the flag mutations have to be coherent across every reachable variant, not just the happy path.
- **Shooting for continuity so branch cuts don't jump.** The story is a graph of clips, but the audience must never *see* the seams. Producing footage where any branch can cut to any next variant — matched framing, continuity, prefetch-timed — is as much a directing problem as an engineering one.

---

## What's next

- **Remote-as-backup-voter** — let the Fire TV remote cast a vote for the couch that didn't grab a phone (planned, not yet built).
- **Twitch-chat votes** — the same "room decides" loop, opened up to a streaming audience voting from chat.
- **Appstore listing** — ship the TV app to the Amazon Appstore so any living room can start a room.

---

**Categories:** multi-modal UX · family entertainment · AI-enhanced viewing.
**Track:** Fire TV · **Mini challenges:** AWS Builder · Open Source.
