# Friction Logs (draft)

_Optional Devpost deliverable — up to 10% judging bonus. Each: task · steps · expected vs actual · severity · workaround · suggestion. All are real frictions hit during the build._

### 1. Fire TV emulator can't reach the host LAN IP
- **Task:** point the TV app at the local relay so the phone QR is scannable.
- **Steps:** set `RELAY_HOST` to the Mac's LAN IP; run relay; scan QR.
- **Expected:** emulator reaches `192.168.x.x:3001`. **Actual:** connection refused — the AVD guest can't route to the host LAN IP.
- **Severity:** high (blocks the whole flow).
- **Workaround:** use `10.0.2.2` (emulator host-loopback alias) for the TV's own connection, but keep the **LAN IP** in the QR the physical phone scans — two separate hosts.
- **Suggestion:** document this second-screen case; a first-class "host address" alias that works for both would help.

### 2. Host IP changes under DHCP mid-session
- **Task:** demo across a physical phone + emulator.
- **Expected:** stable host address. **Actual:** DHCP reassigned the Mac's IP (.18 → .12), breaking the QR and `Config.kt`.
- **Severity:** medium.
- **Workaround:** re-edit `Config.RELAY_HOST/PHONE_HOST` and rebuild; recommend a router DHCP reservation.
- **Suggestion:** an `.env`/discovery mechanism so the app resolves the relay without hardcoding an IP.

### 3. 1080p@60 clip crashes the emulator's software decoder
- **Task:** play test clips of mixed resolutions.
- **Expected:** playback or graceful skip. **Actual:** `MediaCodecRenderer` "Format exceeds capabilities" → app crash on the software decoder.
- **Severity:** high (crash).
- **Workaround:** `DefaultRenderersFactory.setEnableDecoderFallback(true)` + `onPlayerError` that recovers to another variant; encode demo clips at 720p for the emulator.
- **Suggestion:** clearer emulator decoder-capability docs; fallback on by default.

### 4. Offline Gradle build blocks adding libraries
- **Task:** add an image loader (Coil) to the TV.
- **Expected:** add dependency, build. **Actual:** the build runs `--offline`; new artifacts aren't cached → resolution fails.
- **Severity:** medium.
- **Workaround:** built a dependency-free `NetworkImage` with OkHttp + BitmapFactory.
- **Suggestion:** N/A (environment constraint) — worth noting for reproducible/offline CI.

### 5. Bedrock: IAM permission ≠ model access
- **Task:** call Claude via Bedrock Converse.
- **Expected:** IAM `bedrock:InvokeModel` is enough. **Actual:** AccessDenied until the model is explicitly enabled in the Bedrock console.
- **Severity:** medium (silent-ish; error doesn't say "opt in").
- **Workaround:** enable model access in console; graceful fallback to a templated recap if unavailable.
- **Suggestion:** the SDK error should link to the model-access opt-in.

### 6. Public sample video buckets return 403
- **Task:** wire real test video per branch.
- **Expected:** the classic `gtv-videos-bucket` samples are public. **Actual:** 403 (no longer public).
- **Severity:** low.
- **Workaround:** switched to `test-videos.co.uk` (CC clips) + self-hosting via the relay.
- **Suggestion:** N/A (third-party) — note that "well-known" sample URLs rot.

### 7. Browser multipart upload needs S3 CORS `ExposeHeaders: ETag`
- **Task:** upload large videos from the dashboard via presigned multipart.
- **Expected:** parts upload, then complete. **Actual:** the browser can't read each part's `ETag` → complete fails silently.
- **Severity:** medium.
- **Workaround:** add `exposedHeaders: ["ETag"]` (and PUT/POST) to the bucket CORS in CDK.
- **Suggestion:** call this out prominently in the S3 browser-upload docs.

### 8. Workspace CJS package not tree-shakeable by Vite
- **Task:** consume the shared `story-graph` package in the React dashboard.
- **Expected:** import and build. **Actual:** the CJS dist wasn't resolved cleanly by Rollup's ESM resolver.
- **Severity:** low.
- **Workaround:** Vite alias to the package source.
- **Suggestion:** dual ESM/CJS output for shared workspace packages.
