# infra — Fire Hack AWS Infrastructure

All AWS infrastructure is managed with **AWS CDK** in `infra/cdk`.

> **Deploy is autonomous** via the `Deploy (CDK)` GitHub Action (`cdk deploy --all`
> + seed + Bedrock access + dashboard hosting). For manual deploys, review
> `cdk diff` first. See [`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md).
>
> **Dev vs prod / cost:** the `dev` deployment is deliberately budget‑minimising —
> relay = single Fargate task, **no ALB / no NAT**, `ws://`, `CORS: *` (≈ $9/mo).
> These are intentional development trade‑offs; harden TLS/CORS/IAM and use the
> relay `prod` mode (ALB + NAT) before a public launch. Full rationale in
> [`infra/cdk/README.md`](cdk/README.md).
>
> Helper scripts: `infra/scripts/relay-ip.sh`, `infra/scripts/bedrock-access.sh`.

---

## Stacks

### FirexpContentStack (`lib/firexp-content-stack.ts`)

| Resource | Name pattern | Notes |
|---|---|---|
| DynamoDB | `firexp-{env}-series` | Series catalogue |
| DynamoDB | `firexp-{env}-episodes` | Episode graph + `seriesId-number-index` GSI |
| DynamoDB | `firexp-{env}-sessions` | Single-table sessions + `byEpisode` GSI |
| S3 | `firexp-{env}-content` | Private video bucket (OAC only) |
| CloudFront | — | CDN in front of the S3 bucket (OAC, TLS 1.2) |
| Lambda | `firexp-{env}-content-api` | NodejsFunction — Hono content API |
| HTTP API | `firexp-{env}-content-api` | API Gateway v2 |

### FirexpAiStack (`lib/firexp-ai-stack.ts`)

| Resource | Name pattern | Notes |
|---|---|---|
| IAM ManagedPolicy | `firexp-{env}-bedrock-invoke` | InvokeModel + InvokeModelWithResponseStream on inference profiles AND foundation models; discovery actions on `*` |
| DynamoDB | `firexp-{env}-prompts` | Prompt cache; PK `cacheKey`, TTL `ttl`, PAY_PER_REQUEST |
| Lambda | `firexp-{env}-prompt-generator` | NodejsFunction — Hono + Bedrock prompt generator |
| HTTP API | `firexp-{env}-prompt-api` | API Gateway v2 |
| Secrets Manager | `firexp/{env}/prompt-generator` | Optional placeholder (set `-c createSecret=true`) |

### FirexpRelayStack (`lib/firexp-relay-stack.ts`)

| Resource | Name pattern | Notes |
|---|---|---|
| VPC | `firexp-{env}-vpc` | dev: public subnets only, no NAT · prod: +1 NAT gateway |
| ECS cluster | `firexp-{env}-relay-cluster` | Fargate |
| ECS Fargate service | `firexp-{env}-relay` | WebSocket relay (single task; state in memory) |
| Container image | CDK asset (bootstrap ECR) | Built & pushed from `apps/relay/Dockerfile` via `ContainerImage.fromAsset` at deploy time — no manual build/push |
| ALB | — | prod only (`RelayLoadBalancerDns` output); dev uses the task's ephemeral public IP |

> Deploy is autonomous: `cdk deploy` builds/pushes the image and imports the
> content-api URL from `FirexpContentStack` automatically. See `infra/cdk/README.md`
> for the DEV vs PROD topology.

---

## Architecture

```
Fire TV App / Phone
       │
       ▼
HTTP API (API Gateway v2)
       │
       ├─► Lambda: prompt-generator
       │       ├─► Amazon Bedrock  (Claude Haiku 4.5 / Sonnet 4.6)
       │       └─► DynamoDB  (firexp-{env}-prompts — prompt cache with TTL)
       │               └─► (optional) Secrets Manager
       │
       └─► Lambda: content-api
               ├─► DynamoDB  (series / episodes / sessions)
               ├─► S3 (private content bucket)
               └─► Amazon Bedrock  (ConverseCommand — recap endpoint)
```

---

## Bedrock model IDs

These are **cross-region inference profile** IDs invoked directly as `modelId`:

| ID | Purpose |
|---|---|
| `us.anthropic.claude-haiku-4-5-20251001-v1:0` | Primary — fast, low cost |
| `us.anthropic.claude-sonnet-4-6` | Secondary — higher quality |

Both models **incur per-token AWS cost** when invoked.  
Neither is free-tier eligible. Monitor usage in the AWS Billing console.

---

## Enable Bedrock Model Access (REQUIRED)

IAM permissions alone are **not** enough — each model must be individually approved in the console:

1. Open the AWS Console → **Amazon Bedrock** → **Model access** (left sidebar).
2. Click **Manage model access** (top-right).
3. Find **Anthropic** in the provider list and expand it.
4. Tick both:
   - `Claude Haiku 4.5` (maps to `claude-haiku-4-5-20251001-v1:0`)
   - `Claude Sonnet 4.6` (maps to `claude-sonnet-4-6`)
5. Click **Request model access** and wait for **Access granted** status.
6. Repeat for any additional models.

> Without this step, Bedrock will return `AccessDeniedException` at runtime even if the IAM policy is correct.

---

## Prerequisites

- Node.js ≥ 18
- AWS CLI configured: `aws sts get-caller-identity` should return account `557690620729`
- Default profile → IAM user `infra-deploy` (or set `AWS_PROFILE=infra-deploy`)

---

## CDK Workflow

```bash
# Navigate to the CDK root
cd infra/cdk

# Install dependencies
npm install

# Build TypeScript
npm run build

# Synthesise (dry-run, no AWS calls required)
npx cdk synth -c environment=dev

# Preview changes against a deployed stack
npx cdk diff -c environment=dev

# Deploy (creates real AWS resources — incurs cost)
npx cdk deploy --all -c environment=dev

# Run tests
npm test
```

---

## Feature Flags (CDK context)

| Context key | Default | Effect |
|---|---|---|
| `environment` | `dev` | Deployment stage prefix (`firexp-{env}-*`) |
| `createLambda` | `true` | Set `false` to synth without a build artifact |
| `createSecret` | `false` | Set `true` to create the Secrets Manager placeholder |
| `cdnPriceClass` | `PRICE_CLASS_100` | CloudFront price class |

Pass as `-c key=value` at synth/deploy time.

---

## Populating the Secret

After deploying with `createSecret=true`:

```bash
aws secretsmanager put-secret-value \
  --secret-id firexp/dev/prompt-generator \
  --secret-string '{"SOME_API_KEY":"replace_me"}'
```

Never store secret values in CDK code or `cdk.json`.

---

## Security Notes

- **API auth:** the HTTP APIs default to open (no auth) for development. Restrict with a Lambda authorizer or API Gateway auth for production.
- **IAM least privilege:** the prompt-generator role can only invoke the two listed Bedrock models, read/write the one DynamoDB prompt-cache table, and (optionally) read one Secrets Manager secret.
- **S3 bucket:** private — accessible only via CloudFront OAC or presigned URLs from the content-api Lambda.

---

## Outputs

After deploy:

| Output | Description |
|---|---|
| `ContentApiUrl` | HTTP API v2 endpoint (content-api) |
| `ContentBucketName` | Private S3 bucket name |
| `ContentCdnUrl` | CloudFront CDN URL for video playback |
| `SeriesTableName` | DynamoDB series table |
| `EpisodesTableName` | DynamoDB episodes table |
| `SessionsTableName` | DynamoDB sessions table |
| `PromptsTableName` | DynamoDB prompt-cache table |
| `BedrockPolicyArn` | Bedrock managed policy ARN (attach to other roles if needed) |
| `PromptApiUrl` | HTTP API v2 endpoint (prompt-generator) |
| `PromptGeneratorFunctionName` | Lambda function name (prompt-generator) |

---

## Tear Down

```bash
npx cdk destroy --all -c environment=dev
```
