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

## 0. Prerequisites

Pick a path — the setup differs:

| | **A. GitHub Actions** (recommended) | **B. Manual CLI** |
|---|---|---|
| Local tooling | none | AWS CLI + Node 24 + Docker (Docker only for the relay) |
| CDK bootstrap | automatic (in the workflow) | run once: `cd infra/cdk && npx cdk bootstrap` |
| Setup needed | 2 repo secrets (see A) | AWS creds configured locally |

**One shared account step (both paths, once):** enable **Bedrock model access** —
Console → Amazon Bedrock → Model access → `Claude Haiku 4.5` + `Claude Sonnet 4.6`.
IAM alone is not enough; without it the AI features return `AccessDeniedException`.
It is **not** required for the deploy to succeed (only for runtime AI calls), and
it **cannot** be automated (console/account action).

> **Why Docker (manual path only)?** Only the **relay** needs it — it runs on ECS
> Fargate, so CDK builds & pushes its image (`ContainerImage.fromAsset`) during
> `cdk deploy`. The Lambdas bundle with local esbuild (no Docker). The Actions
> path builds the image on the runner, so you need nothing locally.

---

## A. Deploy with GitHub Actions (recommended)

The **Deploy (CDK)** workflow (`.github/workflows/deploy.yml`) does everything on
one click: bootstrap (idempotent) → `cdk deploy --all` (builds/pushes the relay
image with `fromAsset`, orders content → ai → relay, wires cross-stack URLs) →
seed DynamoDB → print the relay IP.

### One-time setup — just 2 repo secrets

Settings → Secrets and variables → Actions → *New secret*:
`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` for an IAM user/role that can
deploy (the `infra-deploy` user has `AdministratorAccess`).

```bash
# or from the CLI, using the keys already on this machine:
gh secret set AWS_ACCESS_KEY_ID     -R <owner>/firexp --body "$(aws configure get aws_access_key_id)"
gh secret set AWS_SECRET_ACCESS_KEY -R <owner>/firexp --body "$(aws configure get aws_secret_access_key)"
```

Everything else — bootstrap, image build/push, cross-stack wiring, seeding — is
automatic. (Bedrock model access is the only account step; see Prerequisites.)

### Run it

Actions → **Deploy (CDK)** → *Run workflow* → pick `dev` or `prod`. That's it.

**Rollback** = run the same workflow from an older git tag.

### Fully hands-off (optional): auto-deploy on merge

To deploy automatically when `main` changes, add a `push` trigger to
`deploy.yml` (kept manual by default so AWS isn't mutated on every commit):

```yaml
on:
  push: { branches: [main] }
  workflow_dispatch: { inputs: { environment: { type: choice, options: [dev, prod], default: dev } } }
```
(with `push`, default the environment to `dev` in the steps).

---

## B. Manual CLI deploy

Verify the local prerequisites first:

```bash
aws sts get-caller-identity          # creds present, account 557690620729
docker info                          # Docker running — only needed for the relay
cd infra/cdk && npx cdk bootstrap    # idempotent; only needed the first time
```

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

### 3. Relay — one command (autonomous)

CDK builds & pushes the image (`fromAsset`) and imports the content-api URL from
the content stack automatically. Docker must be running.

```bash
cd infra/cdk
npx cdk deploy FirexpRelayStack -c environment=dev --require-approval never
```

> Or skip steps 1–3 entirely with `npx cdk deploy --all -c environment=dev` — CDK
> orders the stacks by dependency (content → relay) in a single run.
> On an amd64 host, enable arm64 emulation first: `docker run --privileged --rm tonistiigi/binfmt --install arm64`.

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
