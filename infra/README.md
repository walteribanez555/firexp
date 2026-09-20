# infra — Fire Hack AWS Infrastructure

Terraform code to provision AWS resources for the **fire-hack** hackathon project's
Bedrock / prompt-generator backend.

> **IMPORTANT:** Review `terraform plan` before any apply.  
> Nothing here is auto-applied. No remote backend is configured — state is local by default.

---

## Architecture

```
Fire TV App (Vega OS)
       │
       ▼
Lambda Function URL (HTTPS)
       │
       ├─► Amazon Bedrock  (Claude Haiku 4.5 / Sonnet 4.6)
       │
       └─► DynamoDB  (fire-hack-prompts — prompt cache with TTL)
                │
                └─► (optional) Secrets Manager
```

---

## Model IDs

These are **cross-region inference profile** IDs invoked directly as `modelId`:

| ID | Purpose |
|---|---|
| `us.anthropic.claude-haiku-4-5-20251001-v1:0` | Primary — fast, low cost |
| `us.anthropic.claude-sonnet-4-6` | Secondary — higher quality |

Both models **incur per-token AWS cost** when invoked.  
Neither is free-tier eligible.  Monitor usage in the AWS Billing console.

---

## Prerequisites

- [Terraform >= 1.5](https://developer.hashicorp.com/terraform/install) — `terraform version`
- AWS CLI configured: `aws sts get-caller-identity` should return account `557690620729`
- Default profile → IAM user `infra-deploy` (or set `AWS_PROFILE=infra-deploy`)

---

## Enable Bedrock Model Access (REQUIRED)

IAM permissions alone are **not** enough — each model must be individually approved in the console:

1. Open the AWS Console → **Amazon Bedrock** → **Model access** (left sidebar).
2. Click **Manage model access** (top-right).
3. Find **Anthropic** in the provider list and expand it.
4. Tick both:
   - `Claude Haiku 4.5` (maps to `claude-haiku-4-5-20251001-v1:0`)
   - `Claude Sonnet 4.6` (maps to `claude-sonnet-4-6`)
5. Click **Request model access** and wait for **Access granted** status (usually instant for Anthropic models).
6. Repeat for any additional models added to `var.model_ids`.

> Without this step, Bedrock will return `AccessDeniedException` at runtime even if the IAM policy is correct.

---

## Build the Lambda ZIP

The Lambda resources are gated behind `create_lambda = true`.  
Build the artifact first:

```bash
cd apps/prompt-generator
npm install
npm run build:lambda:prod          # compiles TypeScript → dist/index.js (CommonJS)
zip -j dist/prompt-generator-lambda.zip dist/index.js
```

The resulting ZIP path matches the default `lambda_zip_path` variable:
`../../apps/prompt-generator/dist/prompt-generator-lambda.zip` (relative to `infra/terraform/`).

---

## Terraform Workflow

```bash
# 1. Navigate to the Terraform root
cd infra/terraform

# 2. Copy and edit variables
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars — at minimum set create_lambda = true after building the ZIP

# 3. Initialize (downloads the AWS provider, no remote backend)
terraform init -backend=false

# 4. Format check (CI-safe; exits non-zero if formatting is wrong)
terraform fmt -check -recursive

# 5. Validate syntax and references (no AWS calls)
terraform validate

# 6. Preview changes — READ THIS OUTPUT before applying
terraform plan

# 7. Apply (creates real AWS resources — incurs cost)
terraform apply
```

> **Tip:** Run `terraform plan -out=tfplan && terraform apply tfplan` to ensure  
> the apply is exactly what you reviewed.

---

## Feature Flags

| Variable | Default | Effect |
|---|---|---|
| `create_lambda` | `false` | Creates Lambda function, IAM role, function URL, CloudWatch log group |
| `create_secret` | `false` | Creates Secrets Manager placeholder secret |

Leave both `false` to provision only DynamoDB + Bedrock IAM policy (safe bootstrap state).

---

## Populating the Secret

After `terraform apply` with `create_secret = true`:

```bash
aws secretsmanager put-secret-value \
  --secret-id fire-hack/prompt-generator \
  --secret-string '{"SOME_API_KEY":"replace_me"}'
```

Never store secret values in `.tf` files or `terraform.tfvars`.

---

## Security Notes

- **Function URL auth:** defaults to `NONE` for development. Set `lambda_url_auth_type = "AWS_IAM"` in production.
- **State file:** contains resource ARNs but no secret values. Keep it out of source control (add `infra/terraform/terraform.tfstate*` to `.gitignore`).
- **IAM least privilege:** the Lambda role can only invoke the two listed Bedrock models, read/write the one DynamoDB table, and (optionally) read one Secrets Manager secret.

---

## Outputs

After apply:

| Output | Description |
|---|---|
| `lambda_function_url` | HTTPS endpoint to invoke the prompt-generator |
| `lambda_role_arn` | IAM role ARN (useful for granting additional access) |
| `prompts_table_name` | DynamoDB table name |
| `prompts_table_arn` | DynamoDB table ARN |
| `bedrock_policy_arn` | Bedrock invoke policy ARN (attach to other roles if needed) |
| `secret_arn` | Secrets Manager ARN (empty if `create_secret = false`) |

---

## Tear Down

```bash
terraform destroy   # removes ALL resources created by this config
```

Secrets Manager has a recovery window (default 30 days). To delete immediately:

```bash
aws secretsmanager delete-secret \
  --secret-id fire-hack/prompt-generator \
  --force-delete-without-recovery
```
