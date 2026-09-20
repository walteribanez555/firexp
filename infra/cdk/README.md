# infra/cdk — Firexp CDK Stacks

AWS CDK (TypeScript) infrastructure for the Firexp platform. All AWS resources
are managed here — there is no other IaC tool in use.

Three stacks are synthesised together:

| Stack | What it owns |
|---|---|
| **FirexpContentStack** | DynamoDB (series/episodes/sessions) + S3 + CloudFront (OAC) + content-api Lambda + HTTP API |
| **FirexpAiStack** | Bedrock IAM managed policy + DynamoDB prompt-cache + prompt-generator Lambda + HTTP API + optional Secrets Manager |
| **FirexpRelayStack** | ECS Fargate WebSocket relay (VPC + ECR + cluster + service). Topology differs by stage — see [Relay: DEV vs PROD](#relay-websocket--dev-vs-prod). |

---

## Architecture

```
Fire TV App / content-dashboard
         │
         ▼
HTTP API v2  (firexp-{env}-content-api)
         │
         ▼
Lambda  (firexp-{env}-content-api)   ← NodejsFunction, bundled from source
    │           │               │
    ▼           ▼               ▼
DynamoDB    DynamoDB         S3 Bucket (PRIVATE)
series      episodes         content
(PK id)     (PK id +         (video assets)
            GSI seriesId-         │
            number-index)         │ OAC (SigV4)
                                  ▼
                          CloudFront CDN
                     (firexp-{env}-content CDN)
                               │
                               ▼
                    Fire TV Player / browser

HTTP API v2  (firexp-{env}-prompt-api)
         │
         ▼
Lambda  (firexp-{env}-prompt-generator)
    │           │
    ▼           ▼
Bedrock    DynamoDB  (firexp-{env}-prompts — prompt cache, TTL)
```

### Private bucket + CloudFront (OAC) model

The S3 content bucket is **fully private** — `BlockPublicAccess.BLOCK_ALL` with
`enforceSSL: true`. No public S3 URLs are ever issued for video playback.

Videos are served exclusively through the **CloudFront distribution** using an
**Origin Access Control (OAC)**:

- CDK creates an `AWS::CloudFront::OriginAccessControl` resource (type S3, SigV4
  signing, always-sign).
- The bucket policy is automatically extended by CDK with an `s3:GetObject Allow`
  statement conditioned on the CloudFront distribution ARN — only that specific
  distribution can read the bucket.
- Clients (Fire TV player, dashboard) always receive `https://<cdn-domain>/...`
  URLs, never raw S3 URLs.

#### Why OAC instead of OAI?

| | OAC (used here) | OAI (legacy) |
|---|---|---|
| AWS recommendation | Current (preferred) | Legacy — not recommended for new distributions |
| SSE-KMS support | Yes | No |
| Signing | SigV4 (per-request) | Canonical URL (weaker) |
| Bucket policy condition | Distribution ARN | Global CloudFront principal |

OAC is strictly more secure and is the method recommended by AWS for all new
CloudFront-to-S3 distributions.

### Multipart upload CORS (ETag exposure)

The S3 bucket's CORS rule is configured for browser multipart uploads:

| CORS field | Value | Reason |
|---|---|---|
| `allowedMethods` | PUT, GET, HEAD, POST | PUT=upload parts; POST=initiate/complete MPU; GET/HEAD=presigned reads |
| `allowedOrigins` | `["*"]` (dev) | Restrict to dashboard origin in prod |
| `allowedHeaders` | `["*"]` | Browser preflight may include arbitrary SDK headers |
| `exposedHeaders` | `["ETag"]` | **Required** — the browser AWS SDK reads each part's ETag to assemble the `CompleteMultipartUpload` call. Without this, multipart uploads silently fail. |
| `maxAge` | 3000 | Preflight cache TTL (seconds) |

---

## Relay (WebSocket) — DEV vs PROD

The relay (`apps/relay`) is a **stateful** real-time service: it keeps each
room's state **in memory** (a "dumb forwarder" with a `RoomState` per room).
That single fact drives every deployment decision below — it must run as a
**single task**; scaling horizontally would split a room's TV and phones across
tasks and break it (a per-client ALB sticky cookie does *not* co-locate all the
devices of one room). True scaling would need shared pub/sub (e.g. ElastiCache)
and is intentionally out of scope.

Because there is no always-on requirement during the hackathon, the stage picks
a deliberately different topology to trade durability for cost:

| Aspect | **DEV** (`environment=dev`) | **PROD** (`environment=prod`) |
|---|---|---|
| Goal | cheap, for testing/development | durable, load-balanced |
| Fargate task | 1 (256 CPU / 512 MB) | 1 (512 CPU / 1024 MB) |
| Exposure | **public IP on the task, no ALB** | **Application Load Balancer** (stable DNS) |
| Subnets / NAT | public subnets, **`natGateways: 0`** | private task + **1 NAT gateway** |
| Reach it via | ephemeral task IP → `infra/scripts/relay-ip.sh` | ALB DNS (`RelayLoadBalancerDns` output) |
| TLS | none → `ws://` (fine for emulator/LAN) | HTTP today; add ACM cert + `:443` for `wss://` |
| Deploy behaviour | `minHealthyPercent: 0` (stop-then-start) | `minHealthyPercent: 100` + circuit breaker |
| Idle WS timeout | n/a (no ALB) | ALB `idleTimeout: 1h` (+ app ping/pong) |
| Rough cost | **~$9/mo** running (or ~$0 at `desiredCount 0`) | **~$57/mo** (ALB + NAT + Fargate) |

**Why the dev shape saves money:** dropping the ALB (~$16/mo) and the NAT
gateway (~$32/mo) removes the two fixed costs; the task egresses to the public
content-api directly through the Internet Gateway using its own public IP.

**Finding the dev task (its IP is ephemeral):**

```bash
bash infra/scripts/relay-ip.sh                 # defaults: firexp-dev-relay-cluster / firexp-dev-relay
# → prints http://<ip>:3001 / ws://<ip>:3001 — paste into fire-hack Config.RELAY_HOST/PHONE_HOST
```

For a stable dev hostname, add an EventBridge (ECS Task State Change) → Lambda
rule that upserts a Route53 A record on task start (not included; needs a domain).

### First deploy (image must exist)

The service references the ECR image tag `${env}-latest`, so an image must be
pushed **before** the service can stabilise:

```bash
cd infra/cdk && npx cdk deploy FirexpRelayStack -c environment=dev   # creates VPC/cluster/ECR/service
# then build + push (or let CI do it):
aws ecr get-login-password | docker login --username AWS --password-stdin <acct>.dkr.ecr.us-east-1.amazonaws.com
docker build -f apps/relay/Dockerfile -t <repoUri>:dev-latest .      # context = repo root
docker push <repoUri>:dev-latest
aws ecs update-service --cluster firexp-dev-relay-cluster --service firexp-dev-relay --force-new-deployment
```

Pass the deployed content-api URL so the relay can forward sessions:

```bash
npx cdk deploy FirexpRelayStack -c environment=dev -c contentApiUrl=https://xxxx.execute-api.us-east-1.amazonaws.com
```

---

## Prerequisites

- Node.js >= 18  (`node -v`)
- AWS CLI configured pointing at account `557690620729`
  (`aws sts get-caller-identity` to verify)
- AWS CDK CLI — installed as a local dev dependency (no global install needed)

---

## Getting started

```bash
# 1. Install — isolated node_modules, does NOT affect the monorepo root
cd infra/cdk
npm install

# 2. Compile TypeScript
npm run build

# 3. Synthesise (no AWS calls; produces CloudFormation under cdk.out/)
npx cdk synth -c environment=dev

# 4. Deploy (creates real AWS resources — DO NOT run this automatically)
#    Review the diff first: npx cdk diff -c environment=prod
npx cdk deploy --all -c environment=prod
```

> **DO NOT auto-apply.** Always run `cdk diff` and review the plan before
> `cdk deploy`. The `deploy` command is intentionally absent from CI to prevent
> accidental mutations.

---

## Stage / environment

Stage is passed via CDK context at synth/deploy time:

| Command suffix           | Stage | DynamoDB billing | Removal policy | PITR |
|--------------------------|-------|-----------------|----------------|------|
| `-c environment=dev`     | dev   | PROVISIONED 5/5 | DESTROY        | off  |
| `-c environment=prod`    | prod  | PAY_PER_REQUEST | RETAIN         | on   |
| _(omitted)_              | dev   | PROVISIONED 5/5 | DESTROY        | off  |

The `createLambda` context flag (default `true`) gates Lambda + API creation:

```bash
# Tables + bucket + CloudFront only (useful for first-time bootstrap)
npx cdk synth -c environment=dev -c createLambda=false
```

The `createSecret` context flag (default `false`) gates Secrets Manager creation:

```bash
npx cdk synth -c environment=dev -c createSecret=true
```

---

## Enable Bedrock Model Access (REQUIRED before using AI features)

IAM permissions alone are **not** enough — each model must be individually
approved in the AWS Console:

1. Open **Amazon Bedrock** → **Model access** → **Manage model access**.
2. Tick `Claude Haiku 4.5` and `Claude Sonnet 4.6` under Anthropic.
3. Click **Request model access** and wait for **Access granted** status.

> Without this step, Bedrock returns `AccessDeniedException` at runtime even
> when the IAM policy is correct.

---

## Resources created

### FirexpContentStack

| Resource | Name |
|----------|------|
| DynamoDB table | `firexp-{env}-series` |
| DynamoDB table | `firexp-{env}-episodes` (+ `seriesId-number-index` GSI) |
| DynamoDB table | `firexp-{env}-sessions` (+ `byEpisode` GSI) |
| S3 bucket (private) | `firexp-{env}-content` |
| CloudFront distribution | _(domain in `ContentCdnUrl` output)_ |
| Lambda function | `firexp-{env}-content-api` |
| HTTP API v2 | `firexp-{env}-content-api` |

### FirexpAiStack

| Resource | Name |
|----------|------|
| IAM ManagedPolicy | `firexp-{env}-bedrock-invoke` |
| DynamoDB table | `firexp-{env}-prompts` (PK: `cacheKey`, TTL: `ttl`) |
| Lambda function | `firexp-{env}-prompt-generator` |
| HTTP API v2 | `firexp-{env}-prompt-api` |
| Secrets Manager secret | `firexp/{env}/prompt-generator` _(optional)_ |

### FirexpRelayStack

| Resource | Name |
|----------|------|
| VPC | `firexp-{env}-vpc` (dev: public only, no NAT · prod: +1 NAT) |
| ECR repository | `firexp-{env}-relay` |
| ECS cluster | `firexp-{env}-relay-cluster` |
| ECS Fargate service | `firexp-{env}-relay` |
| ALB | _(prod only — `RelayLoadBalancerDns` output)_ |

---

## Running tests

```bash
npm test
```

Uses Jest + `aws-cdk-lib/assertions` to assert resource properties without
deploying anything. 64 tests across three test files cover:

- Synthesis (dev + prod for both stacks)
- DynamoDB tables, GSI, TTL, billing modes
- Bedrock IAM policy: inference-profile ARNs, foundation-model ARNs, discovery
- S3 bucket: BLOCK_ALL public access, SSL enforcement, CORS + ETag expose
- CloudFront: HTTPS redirect, PRICE_CLASS_100, OAC (not OAI), bucket policy
- Lambda: runtime, env vars, CDN_BASE wired, CONTENT_BUCKET separate from CDN
- HTTP API v2: name and protocol
- Secrets Manager: absent by default, present with `createSecret=true`
- Relay: dev topology (no NAT, no ALB, public IP, port 3001 open) vs prod (NAT + ALB + `/health`)
- Stack tags (Project / Environment / ManagedBy:CDK)
- CloudFormation outputs / export names
