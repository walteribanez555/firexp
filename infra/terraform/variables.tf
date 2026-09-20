# ---------------------------------------------------------------------------
# Global
# ---------------------------------------------------------------------------

variable "region" {
  description = "AWS region to deploy resources into."
  type        = string
  default     = "us-east-1"
}

variable "account_id" {
  description = "AWS account ID. Used to construct Bedrock inference-profile ARNs (which are account-scoped)."
  type        = string
  default     = "557690620729"
}

variable "project" {
  description = "Short prefix applied to all resource names and tags."
  type        = string
  default     = "fire-hack"
}

variable "tags" {
  description = "Additional tags merged onto every resource."
  type        = map(string)
  default = {
    Project     = "fire-hack"
    Environment = "production"
    ManagedBy   = "terraform"
  }
}

# ---------------------------------------------------------------------------
# Bedrock
# ---------------------------------------------------------------------------

variable "model_ids" {
  description = <<-EOT
    List of Bedrock cross-region inference-profile model IDs the Lambda is
    allowed to invoke.  These must already be enabled in the Bedrock console
    (IAM alone is insufficient — see README.md).
  EOT
  type        = list(string)
  default = [
    "us.anthropic.claude-haiku-4-5-20251001-v1:0", # fast / low-cost
    "us.anthropic.claude-sonnet-4-6",              # higher quality
  ]
}

# ---------------------------------------------------------------------------
# DynamoDB
# ---------------------------------------------------------------------------

variable "prompts_table_name" {
  description = "Name of the DynamoDB table used as a prompt cache."
  type        = string
  default     = "fire-hack-prompts"
}

# ---------------------------------------------------------------------------
# Lambda
# ---------------------------------------------------------------------------

variable "lambda_runtime" {
  description = "Lambda runtime identifier."
  type        = string
  default     = "nodejs20.x"
}

variable "lambda_zip_path" {
  description = <<-EOT
    Path (relative to the infra/terraform directory) to the Lambda deployment
    ZIP.  Build the ZIP first:
      cd apps/prompt-generator
      npm run build:lambda:prod
      zip -j dist/prompt-generator-lambda.zip dist/index.js
    Then run terraform plan/apply.
  EOT
  type        = string
  default     = "../../apps/prompt-generator/dist/prompt-generator-lambda.zip"
}

variable "lambda_memory_mb" {
  description = "Memory allocated to the Lambda function in MB."
  type        = number
  default     = 512
}

variable "lambda_timeout_seconds" {
  description = "Lambda function timeout in seconds."
  type        = number
  default     = 30
}

variable "lambda_log_retention_days" {
  description = "CloudWatch Logs retention period in days for Lambda log group."
  type        = number
  default     = 14
}

variable "lambda_url_auth_type" {
  description = <<-EOT
    Authorization type for the Lambda function URL.
    Default is NONE for local development convenience.
    IMPORTANT: change to AWS_IAM in production to prevent unauthenticated access.
  EOT
  type        = string
  default     = "NONE"

  validation {
    condition     = contains(["NONE", "AWS_IAM"], var.lambda_url_auth_type)
    error_message = "lambda_url_auth_type must be NONE or AWS_IAM."
  }
}

# ---------------------------------------------------------------------------
# Runtime environment variables forwarded to Lambda
# ---------------------------------------------------------------------------

variable "prompt_mode" {
  description = "Value for the PROMPT_MODE env var inside Lambda."
  type        = string
  default     = "production"
}

variable "cache_ttl_seconds" {
  description = "Value for CACHE_TTL_SECONDS env var inside Lambda."
  type        = number
  default     = 3600
}

# ---------------------------------------------------------------------------
# Feature flags
# ---------------------------------------------------------------------------

variable "create_lambda" {
  description = <<-EOT
    Set to true to create the Lambda function, IAM role, function URL, and
    CloudWatch log group.  Defaults to false so `terraform validate` and
    `terraform plan` work before the build artifact exists.
  EOT
  type        = bool
  default     = false
}

variable "create_secret" {
  description = <<-EOT
    Set to true to create the Secrets Manager placeholder secret.
    The secret is created with no value — populate it manually in the console
    or via `aws secretsmanager put-secret-value` after apply.
  EOT
  type        = bool
  default     = false
}

# ---------------------------------------------------------------------------
# Secrets Manager
# ---------------------------------------------------------------------------

variable "secret_name" {
  description = "Name of the Secrets Manager secret used for Lambda runtime config."
  type        = string
  default     = "fire-hack/prompt-generator"
}
