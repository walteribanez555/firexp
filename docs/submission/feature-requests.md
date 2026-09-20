# Feature Requests (draft)

_Optional Devpost deliverable. Priority: critical / important / nice-to-have._

### critical
- **Native second-screen pairing API in the Fire TV SDK.** Today we bootstrap TV↔phone with a QR + a self-hosted WebSocket relay and a hand-rolled host-address story (`10.0.2.2` vs LAN IP). A first-class pairing/second-screen API (device discovery + a managed channel) would remove the most fragile part of any "phone as controller" experience.

### important
- **A managed, low-latency real-time channel** (persistent WebSocket) that fits serverless. Lambda can't hold WS sessions, so the relay must run on a container (Fargate) — a managed room/pub-sub primitive for Fire TV second-screen would let the whole stack stay serverless.
- **Emulator networking parity for second-screen apps** — let the AVD reach the host LAN IP (or expose a documented alias) so the same build works on emulator and device without config swaps.

### nice-to-have
- **Media3 `PreloadManager` "simple mode"** — a one-call "prefetch these next URIs" helper for branching/playlist apps, without wiring the full preload pipeline.
- **Bedrock model-access clarity** — SDK errors that distinguish "no IAM permission" from "model not enabled in console," with a deep link to opt in.
- **S3 browser-upload preset** — a CDK/S3 construct that ships the correct CORS (incl. `ExposeHeaders: ETag`) for presigned multipart out of the box.
