# Firexp — Go-to-Market & Positioning Plan

> Positioning and go-to-market plan for the Fire TV hackathon submission and the
> first steps beyond it. **Governing rule: nothing that can't be shown in the
> video or the repo.** Every claim in the submission must be demonstrable on
> screen or reproducible from the codebase — no vaporware, no roadmap-as-feature.

---

## Positioning (the one-liner)

**Twitch taught audiences to decide together. X-Ray taught Amazon that the second
screen belongs in the living room. Firexp is the show where the room votes from
their phones and the TV never breaks.**

Lead with the human tension (four people on a couch; the decision trapped in one
head), then the product (the room votes; the TV never shows decision UI), and only
then the "how." The word "architecture" never appears before "How we built it."

### Ecosystem analogies (verifiable, no false claims)
- **Twitch** — brought audience participation to streaming; Firexp brings it to the living room.
- **X-Ray** — tells you who's on screen; Firexp lets you decide what they do.
- **Prime Video co-viewing** — Amazon already knows people want to watch together; Firexp is what happens when they can also *decide* together. _(Do NOT assert anything about Watch Party's current status.)_

---

## Tiered plan

The plan is tiered so the submission stands on Tier 0 alone, and each higher tier
is only claimed once it can be **shown in the video or the repo**.

### Tier 0 — Narrative (the submission stands on this)
The story, faithfully told and fully demonstrable today.
- Devpost "Story" in the correct headers (Inspiration → What it does → How we built it → Challenges → What's next).
- README / README.es / HANDOFF lead with tension → product → how.
- Video script: first 45s and last 30s are Fire TV; cloud in the middle as support; no "architecture" before minute 2.
- Live demo of the room loop: QR → questionnaire → votes → silent branch cut → "% of rooms" + Bedrock/Nova recap.

### Tier 1 — Device-signal (proves it's a real Fire TV citizen)
Signals that Firexp belongs on the device and in the Amazon ecosystem.
- **Amazon Nova** — recap / prompt generation on the in-house model.
- **Fire TV recommendations row + deep link** — surface an episode in the launcher's recommendations and deep-link straight into a room.
- **Amazon Appstore Live App Testing** — get the TV app into a testable Appstore state.

### Tier 2 — Optional (upside, only if it can be shown)
Reach extensions that reuse the same "room decides" loop.
- **Twitch votes** — open the vote loop to a streaming audience voting from chat.
- **In-app purchase (IAP)** — premium episodes / seasons.

---

## Ownership: implementing now vs manual/next

| Item | Tier | Status |
|---|---|---|
| Amazon Nova (recap/prompt) | 1 | 🛠️ **Being implemented now** (another agent) |
| Fire TV deep link + recommendations row | 1 | 🛠️ **Being implemented now** (another agent) |
| Twitch vote adapter | 2 | 🛠️ **Being implemented now** (another agent) |
| Tier 0 narrative (docs, video script, story headers) | 0 | 🛠️ **Being implemented now** (this docs pass) |
| Amazon Appstore submission / Live App Testing | 1 | ✍️ **Manual / next** (human) |
| Real demo clips uploaded to S3 (playable branches) | 0 | ✍️ **Manual / next** (biggest demo gap — video 404 until done) |
| In-app purchase (IAP) | 2 | ✍️ **Manual / next** (not started) |
| Remote-as-backup-voter | — | 🔜 **What's next only** (not built; do not claim as done) |

Legend: 🛠️ in progress by an agent now · ✍️ manual/next (human) · 🔜 roadmap only.

---

## Guardrails (faithfulness)
- **Remote-as-backup-voter** is "What's next," not a shipped feature.
- Do not claim playable cloud video until clips are actually in S3 (today `/videos/*` 404s and playback falls back).
- Twitch and IAP are Tier 2 upside — only show what exists in the repo or on screen.
- Every ecosystem analogy is comparative, not a claim about Amazon's own roadmap.
