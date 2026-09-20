# infra/cdk — Firexp Content-API CDK Stack

AWS CDK (TypeScript) infrastructure for the `content-api` service.

> **Coexistence note:** `infra/terraform/` manages the Bedrock/prompt-generator
> backend (fire-hack hackathon) and is completely independent. CDK does not touch
> any Terraform-managed resources, and Terraform does not touch any CDK-managed
> resources. The two tools share the same AWS account but manage disjoint resource sets.

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
| `allowedOrigins` | `["*"]` (dev) | Restrict to dashboard origin in prod (see TODO in code) |
| `allowedHeaders` | `["*"]` | Browser preflight may include arbitrary SDK headers |
| `exposedHeaders` | `["ETag"]` | **Required** — the browser AWS SDK reads each part's ETag to assemble the `CompleteMultipartUpload` call. Without this, the browser cannot read the ETag from the CORS response and multipart uploads silently fail. |
| `maxAge` | 3000 | Preflight cache TTL (seconds) |

### How CDN_BASE flows to the Lambda

The CloudFront distribution domain name is resolved at CDK synth time as a
CloudFormation `Fn::GetAtt` on the distribution resource. The Lambda's
`CDN_BASE` environment variable is set to `https://${contentDistribution.distributionDomainName}`,
so at deploy time it resolves to something like:
`https://d1a2b3c4d5e6f7.cloudfront.net`.

The Lambda uses `CDN_BASE` to build the public playback URL returned to clients:
```
publicUrl = `${CDN_BASE}/${s3Key}`
```

`CONTENT_BUCKET` continues to point at the private S3 bucket — the Lambda uses it
to generate presigned PUT URLs for uploads. The bucket is never exposed publicly;
CloudFront is the only entity that can issue GETs against it.

### Cost and PriceClass notes

| PriceClass | Edge locations | ~Cost vs ALL |
|---|---|---|
| `PRICE_CLASS_100` (default) | US, Canada, Europe, Israel | Cheapest — good for Fire TV launch |
| `PRICE_CLASS_200` | PRICE_CLASS_100 + APAC, Middle East, Africa | ~10-20% more |
| `PRICE_CLASS_ALL` | All worldwide edge locations | Most expensive |

Override at synth time:
```bash
npx cdk synth -c environment=prod -c cdnPriceClass=PRICE_CLASS_ALL
```

CloudFront data transfer pricing is roughly $0.0085–$0.012 / GB for PRICE_CLASS_100.
For a hackathon / dev environment the free tier (1 TB / month for 12 months) covers
most usage.

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
npx cdk deploy FirexpContentStack -c environment=prod
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

CloudFront, the S3 bucket, and CORS are always synthesized regardless of
`createLambda`.

---

## How the Lambda bundles content-api

`NodejsFunction` uses **esbuild under the hood** — it bundles
`apps/content-api/src/index.ts` at **deploy time**, not at synth time.
`cdk synth` therefore succeeds even if the app source has never been compiled.

Key bundling settings:

| Setting | Value | Reason |
|---------|-------|--------|
| `entry` | `apps/content-api/src/index.ts` | Lambda entrypoint |
| `handler` | `handler` | Named export in the entrypoint |
| `projectRoot` | repo root | Resolves monorepo workspace packages |
| `depsLockFilePath` | repo root `package-lock.json` | Correct lockfile for workspace |
| `externalModules` | `@aws-sdk/*` | Already in Lambda runtime; keeps bundle small |
| `minify` | `true` in prod | Smaller cold-start bundle |

---

## Pointing the dashboard / Fire TV app at the API

After deploy, the API endpoint is in the CloudFormation output `ContentApiUrl`
and exported as `firexp-{env}-content-api-url`. Retrieve it:

```bash
aws cloudformation describe-stacks \
  --stack-name FirexpContentStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ContentApiUrl`].OutputValue' \
  --output text
```

The CloudFront CDN base URL is in `ContentCdnUrl` (export `firexp-{env}-content-cdn-url`):

```bash
aws cloudformation describe-stacks \
  --stack-name FirexpContentStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ContentCdnUrl`].OutputValue' \
  --output text
```

Set `ContentApiUrl` as the `API_BASE_URL` in the dashboard / Fire TV build pipeline.
`ContentCdnUrl` is also injected into the Lambda as `CDN_BASE` automatically.

---

## Resources created

| Resource | Name |
|----------|------|
| DynamoDB table | `firexp-{env}-series` |
| DynamoDB table | `firexp-{env}-episodes` |
| DynamoDB GSI (on episodes) | `seriesId-number-index` |
| S3 bucket (private) | `firexp-{env}-content` |
| CloudFront OAC | _(CDK-managed, no custom name)_ |
| CloudFront distribution | _(CDK-managed; domain in `ContentCdnUrl` output)_ |
| Lambda function | `firexp-{env}-content-api` |
| HTTP API v2 | `firexp-{env}-content-api` |

### IAM grants (least-privilege)

- `seriesTable.grantReadWriteData(lambda)` — DynamoDB CRUD on series table
- `episodesTable.grantReadWriteData(lambda)` — DynamoDB CRUD on episodes table
- `contentBucket.grantReadWrite(lambda)` — S3 GetObject / PutObject / DeleteObject (for presigned URL generation)
- OAC bucket policy — `s3:GetObject` Allow for `cloudfront.amazonaws.com`, conditioned on the distribution ARN

No `*` actions; no `iam:*`; nothing broader than the service scope.

---

## Adding a custom domain and ACM certificate

The distribution ships without a custom domain to keep the stack self-contained.
To add one, edit `firexp-content-stack.ts` and uncomment/add these properties on
`ContentDistribution`:

```typescript
// The ACM certificate MUST be in us-east-1, regardless of the stack region.
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

// ...inside the Distribution props:
domainNames: ['cdn.firexp.io'],
certificate: acm.Certificate.fromCertificateArn(
  this, 'Cert', 'arn:aws:acm:us-east-1:557690620729:certificate/<id>'
),
```

---

## Running tests

```bash
npm test
```

Uses Jest + `aws-cdk-lib/assertions` to assert resource properties without
deploying anything. Test coverage includes:

- Synthesis (dev + prod)
- DynamoDB tables + GSI
- S3 bucket: BLOCK_ALL public access, SSL enforcement, CORS (PUT/GET/HEAD/POST + ETag expose)
- CloudFront distribution: present, HTTPS redirect, PRICE_CLASS_100, OAC (not OAI), bucket policy grant
- Lambda: runtime, env vars, CDN_BASE wired, CONTENT_BUCKET separate from CDN
- HTTP API v2 name and protocol
- Stack tags
- CloudFormation outputs (all 5 exports including ContentCdnUrl)

---

## Infra coexistence

```
infra/
  terraform/   ← Bedrock + DynamoDB prompts table (fire-hack prompt-generator)
                 Managed by Terraform. Do NOT touch with CDK.
  cdk/         ← content-api (this directory)
                 Managed by CDK. Do NOT touch with Terraform.
```
