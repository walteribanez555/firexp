# Firexp — Deployment (step by step)

How to deploy Firexp to AWS. Two paths:

- **A. GitHub Actions** (`.github/workflows/deploy.yml`) — one manual click.
- **B. Manual CLI** — the exact sequence, useful for the first deploy and for
  understanding what the pipeline automates.

Everything is **AWS CDK** (`infra/cdk`). Account/region used: `557690620729` /
`us-east-1`. Stacks:

| Stack | Owns |
|---|---|
| `FirexpContentStack` | DynamoDB (series/episodes/sessions) · S3 · CloudFront (OAC) · content-api Lambda · HTTP API |
| `FirexpAiStack` | Bedrock IAM · prompt-cache DynamoDB · prompt-generator Lambda · HTTP API |
| `FirexpRelayStack` | VPC · ECR · ECS cluster · **relay** WebSocket service (Fargate). DEV = 1 public-IP task (no ALB/NAT); PROD = ALB + NAT. See `infra/cdk/README.md`. |

---

## 0. Prerequisites (once)

```bash
aws sts get-caller-identity          # creds present, account 557690620729
docker info                          # Docker running (needed for the relay image)
cd infra/cdk && npx cdk bootstrap    # only if CDKToolkit stack doesn't exist yet
```

**Enable Bedrock model access** (IAM is not enough): AWS Console → Amazon Bedrock
→ Model access → request `Claude Haiku 4.5` + `Claude Sonnet 4.6`. Without this the
AI features return `AccessDeniedException`.

---

## A. Deploy with GitHub Actions (recommended)

1. Set repo secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (the
   `infra-deploy` IAM user), and optionally `AWS_ACCOUNT_ID`.
2. Actions → **Deploy (CDK + ECS)** → *Run workflow* → pick `dev` or `prod`.

The workflow runs the whole sequence below (base → push image → service → roll →
print IP). **Rollback** = run the same workflow from an older git tag.

---

## B. Manual CLI deploy

All commands assume `ENV=dev` (use `prod` for production). Run from the repo root
unless noted.

### 1. content + ai stacks

```bash
npm ci
npm run build -w @fire-stick/types          # CDK bundles the Lambdas from source
cd infra/cdk && npm ci
npx cdk deploy FirexpContentStack FirexpAiStack -c environment=dev --require-approval never
```

Grab the outputs (used below):

```bash
aws cloudformation describe-stacks --stack-name FirexpContentStack \
  --query "Stacks[0].Outputs[?OutputKey=='ContentApiUrl'].OutputValue" --output text
# → https://XXXX.execute-api.us-east-1.amazonaws.com   (the CONTENT_API_URL, base, NO /api/v1)
```

### 2. Seed DynamoDB (tables are created empty)

```bash
cd apps/content-api
AWS_REGION=us-east-1 \
SERIES_TABLE=firexp-dev-series EPISODES_TABLE=firexp-dev-episodes SESSIONS_TABLE=firexp-dev-sessions \
npx ts-node -r tsconfig-paths/register scripts/dynamo-init.ts     # idempotent
```

Verify: `curl https://XXXX.execute-api.us-east-1.amazonaws.com/api/v1/series`

### 3. Relay — 3 phases (image must exist before the service starts)

**3a. Base only** (creates VPC + ECR + cluster; no service yet):

```bash
cd infra/cdk
npx cdk deploy FirexpRelayStack -c environment=dev -c deployService=false --require-approval never
REPO=$(aws cloudformation describe-stacks --stack-name FirexpRelayStack \
  --query "Stacks[0].Outputs[?OutputKey=='RelayRepoUri'].OutputValue" --output text)
```

**3b. Build & push the relay image** (ARM64 / Graviton — matches the task):

```bash
cd <repo-root>
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin 557690620729.dkr.ecr.us-east-1.amazonaws.com
docker build --platform linux/arm64 -f apps/relay/Dockerfile -t "$REPO:dev-latest" .
docker push "$REPO:dev-latest"
```

**3c. Deploy the service** (wire the content-api URL):

```bash
cd infra/cdk
npx cdk deploy FirexpRelayStack -c environment=dev -c deployService=true \
  -c contentApiUrl=https://XXXX.execute-api.us-east-1.amazonaws.com --require-approval never
```

### 4. Find the relay & wire the clients

The dev relay has an **ephemeral public IP** (no ALB):

```bash
bash infra/scripts/relay-ip.sh          # → http://<ip>:3001
curl http://<ip>:3001/health            # {"status":"ok"}
```

- **fire-hack** → `apps/fire-hack/.../Config.kt` → `RELAY_CLOUD = "http://<ip>:3001"`.
- **content-dashboard** → `apps/content-dashboard/.env` →
  `VITE_CONTENT_API_URL=https://XXXX.execute-api.us-east-1.amazonaws.com/api/v1`
  (note: the dashboard value **includes** `/api/v1`; the relay's `CONTENT_API_URL` does **not**).

---

## Address map (who talks to whom)

| From → to | Config | Value |
|---|---|---|
| dashboard → content-api | `VITE_CONTENT_API_URL` | `<ContentApiUrl>/api/v1` |
| relay → content-api | `CONTENT_API_URL` (CDK `-c contentApiUrl`) | `<ContentApiUrl>` (base, no `/api/v1`) |
| content-api → media | `CDN_BASE` (set by CDK) | `<ContentCdnUrl>` (CloudFront) |
| fire-hack TV / phone → relay | `Config.RELAY_HOST` / `PHONE_HOST` | `http://<relay-ip>:3001` |

---

## Turn the relay off / on (cost control)

The dev relay (Fargate, ~$9/mo running) is the only always-on cost. Everything
else is serverless (idle ≈ $0). Scale it to zero when idle:

```bash
# OFF
aws ecs update-service --cluster firexp-dev-relay-cluster --service firexp-dev-relay --desired-count 0
# ON (IP changes — re-run relay-ip.sh and update Config.kt)
aws ecs update-service --cluster firexp-dev-relay-cluster --service firexp-dev-relay --desired-count 1
```

---

## Teardown

```bash
cd infra/cdk
npx cdk destroy FirexpRelayStack FirexpAiStack FirexpContentStack -c environment=dev
```

Dev buckets/tables use `RemovalPolicy.DESTROY`; prod is `RETAIN` (delete manually).

---

## Cost (us-east-1, dev)

| | Running | Idle |
|---|---|---|
| Relay (Fargate 1× ARM64) | ~$9/mo | $0 (desiredCount 0) |
| Lambda · DynamoDB · API GW · CloudFront · S3 | free-tier / cents | ~$0 |
| Bedrock | per-token, on use | $0 |

**PROD** adds ALB (~$16/mo) + NAT (~$32/mo) for the relay ≈ ~$57/mo.
