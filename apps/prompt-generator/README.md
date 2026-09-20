# prompt-generator

Standalone HTTP microservice that generates narrative decision prompts for the Fire TV interactive film experience.  
It is the production-grade counterpart to the inline prompt logic embedded in `apps/relay`, extracted for independent scaling and caching.

---

## Endpoints

| Method | Path        | Description                                      |
|--------|-------------|--------------------------------------------------|
| GET    | `/health`   | Liveness check; returns `{ status: "ok" }`       |
| POST   | `/generate` | Generate a prompt (AI / random / static fallback)|

### POST `/generate`

**Request body**

```json
{
  "decisionId":   "ch1_pre_1",
  "chapterId":    "ch1",
  "storyId":      "episode1",
  "options":      [{ "gesture": "hands_up", "label": "Enter" }, { "gesture": "crouch", "label": "Wait" }],
  "flags":        { "confident": 2, "united": 1 },
  "staticPrompt": "What do you do?"
}
```

**Response (200)**

```json
{
  "data": {
    "prompt":      "A flicker of light inside — someone might need help.",
    "tone":        "tense",
    "nudgeTarget": "hands_up",
    "source":      "ai"
  }
}
```

`source` is one of `"ai"` | `"random"` | `"static"`.

---

## Environment variables

| Variable             | Default                                         | Description                                           |
|----------------------|-------------------------------------------------|-------------------------------------------------------|
| `PORT`               | `3002`                                          | HTTP listen port (local / ECS)                        |
| `AWS_REGION`         | `us-east-1`                                     | AWS region for Bedrock, DynamoDB, Secrets Manager     |
| `BEDROCK_MODEL_ID`   | `us.anthropic.claude-haiku-4-5-20251001-v1:0`   | Active Bedrock inference profile ID                   |
| `PROMPT_MODE`        | `ai`                                            | `ai` | `random` | `static`                            |
| `PROMPTS_TABLE`      | `fire-hack-prompts`                             | DynamoDB table for prompt cache (empty = no cache)    |
| `CACHE_TTL_SECONDS`  | `86400`                                         | DynamoDB TTL for cached prompts (seconds)             |
| `SECRET_ID`          | _(unset)_                                       | AWS Secrets Manager secret ARN/name; if set, overrides the above at startup |
| `LOG_LEVEL`          | `info` (dev), `warn` (prod)                     | `debug` | `info` | `warn` | `error`                    |
| `NODE_ENV`           | `development`                                   | `development` | `production`                          |

### Bedrock model IDs

| Model                                      | Notes                                     |
|--------------------------------------------|-------------------------------------------|
| `us.anthropic.claude-haiku-4-5-20251001-v1:0` | **Default** — fast, cheap, good for prompts |
| `us.anthropic.claude-sonnet-4-6`           | Sonnet alternative for higher quality      |

These are inference-profile IDs used directly as the `modelId` in `ConverseCommand`.

---

## Build targets

```bash
npm run build              # ECS/local dev — dist/main.js + sourcemap
npm run build:prod         # ECS/local prod — dist/main.js minified
npm run build:ecs          # Same as build (explicit alias)
npm run build:lambda       # Lambda dev — dist/index.js + sourcemap
npm run build:lambda:prod  # Lambda prod — dist/index.js minified
```

The Lambda bundle excludes `@aws-sdk/*` (provided by the Lambda runtime layer).  
The ECS/local bundle also excludes `@aws-sdk/*` (present in the container image's `node_modules`).

---

## Running locally

```bash
cp .env.example .env          # create your .env
npm run dev                   # ts-node watch mode on port 3002
# or after build:
npm start                     # node dist/main.js
```

---

## Testing

```bash
npm test           # jest (ts-jest, unit tests only)
npm run lint       # eslint src/
```

---

## How it relates to relay

`apps/relay` embeds the prompt service inline (`apps/relay/src/modules/prompts/`).  
This service mirrors that logic exactly but adds:

- **DynamoDB-backed write-through cache** — avoids repeated Bedrock calls for the same decision context.
- **AWS Secrets Manager integration** — optional runtime config overrides.
- **Dedicated Lambda entry point** — `src/lambda.ts` using `hono/aws-lambda handle()`.
- **Standalone port** (3002) — can be deployed independently from the relay WebSocket server.

The knowledge base format (JSON files in `kb/`) and the `generate_prompt` Bedrock tool spec are identical.
