# ---------------------------------------------------------------------------
# Lambda — prompt-generator
#
# All resources in this file are gated behind var.create_lambda (default:
# false) so that `terraform validate` and `terraform plan` succeed without
# a build artifact present.
#
# To enable:
#   1. Build the Lambda ZIP:
#        cd apps/prompt-generator
#        npm run build:lambda:prod
#        zip -j dist/prompt-generator-lambda.zip dist/index.js
#   2. Set create_lambda = true in terraform.tfvars (or -var flag).
#   3. terraform plan && terraform apply
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# CloudWatch Log Group (created independently so logs persist across deploys)
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "lambda" {
  count = var.create_lambda ? 1 : 0

  name              = "/aws/lambda/${var.project}-prompt-generator"
  retention_in_days = var.lambda_log_retention_days

  tags = var.tags
}

# ---------------------------------------------------------------------------
# IAM — Assume-role policy (trust policy)
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    sid     = "LambdaAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# ---------------------------------------------------------------------------
# IAM Role
# ---------------------------------------------------------------------------

resource "aws_iam_role" "lambda" {
  count = var.create_lambda ? 1 : 0

  name               = "${var.project}-prompt-generator-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  description        = "Execution role for the fire-hack prompt-generator Lambda function."

  tags = var.tags
}

# ---------------------------------------------------------------------------
# IAM — Attach AWS-managed basic execution policy (CloudWatch Logs)
# ---------------------------------------------------------------------------

resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  count = var.create_lambda ? 1 : 0

  role       = aws_iam_role.lambda[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# ---------------------------------------------------------------------------
# IAM — Attach Bedrock invoke policy (defined in bedrock.tf)
# ---------------------------------------------------------------------------

resource "aws_iam_role_policy_attachment" "lambda_bedrock" {
  count = var.create_lambda ? 1 : 0

  role       = aws_iam_role.lambda[0].name
  policy_arn = aws_iam_policy.bedrock.arn
}

# ---------------------------------------------------------------------------
# IAM — Inline policy: DynamoDB access scoped to the prompts table
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "lambda_dynamodb" {
  statement {
    sid    = "DynamoDBPromptCache"
    effect = "Allow"

    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:DeleteItem", # optional: allow cache invalidation
      "dynamodb:UpdateItem", # optional: allow TTL refresh
    ]

    resources = [aws_dynamodb_table.prompts.arn]
  }
}

resource "aws_iam_role_policy" "lambda_dynamodb" {
  count = var.create_lambda ? 1 : 0

  name   = "dynamodb-prompt-cache"
  role   = aws_iam_role.lambda[0].id
  policy = data.aws_iam_policy_document.lambda_dynamodb.json
}

# ---------------------------------------------------------------------------
# IAM — Inline policy: Secrets Manager (conditional on create_secret)
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "lambda_secrets" {
  count = (var.create_lambda && var.create_secret) ? 1 : 0

  statement {
    sid    = "SecretsManagerRead"
    effect = "Allow"

    actions = [
      "secretsmanager:GetSecretValue",
    ]

    resources = [aws_secretsmanager_secret.config[0].arn]
  }
}

resource "aws_iam_role_policy" "lambda_secrets" {
  count = (var.create_lambda && var.create_secret) ? 1 : 0

  name   = "secrets-manager-read"
  role   = aws_iam_role.lambda[0].id
  policy = data.aws_iam_policy_document.lambda_secrets[0].json
}

# ---------------------------------------------------------------------------
# Lambda Function
# ---------------------------------------------------------------------------

resource "aws_lambda_function" "prompt_generator" {
  count = var.create_lambda ? 1 : 0

  function_name = "${var.project}-prompt-generator"
  description   = "Generates narrative prompts using Amazon Bedrock; caches results in DynamoDB."

  # Deployment package — built from apps/prompt-generator
  filename         = var.lambda_zip_path
  source_code_hash = filebase64sha256(var.lambda_zip_path)

  handler = "index.handler" # CommonJS export from apps/prompt-generator/dist/index.js
  runtime = var.lambda_runtime

  role = aws_iam_role.lambda[0].arn

  memory_size = var.lambda_memory_mb
  timeout     = var.lambda_timeout_seconds

  environment {
    variables = {
      # Which Bedrock model to use (primary — override at deploy time if needed)
      BEDROCK_MODEL_ID = var.model_ids[0]

      # DynamoDB cache table
      PROMPTS_TABLE = aws_dynamodb_table.prompts.name

      # AWS SDK region (the SDK reads this automatically but we set it explicitly)
      AWS_REGION = var.region

      # Secrets Manager secret ID (empty string when secret is not created)
      SECRET_ID = var.create_secret ? aws_secretsmanager_secret.config[0].name : ""

      # Application-level feature flags
      PROMPT_MODE       = var.prompt_mode
      CACHE_TTL_SECONDS = tostring(var.cache_ttl_seconds)
    }
  }

  # Ensure the log group exists before the function (avoids a race on first deploy)
  depends_on = [
    aws_cloudwatch_log_group.lambda,
    aws_iam_role_policy_attachment.lambda_basic_execution,
  ]

  tags = var.tags
}

# ---------------------------------------------------------------------------
# Lambda Function URL
#
# SECURITY NOTE: authorization_type defaults to NONE for local development
# convenience.  Change to AWS_IAM before exposing this URL publicly to
# prevent unauthenticated invocations.  With AWS_IAM, callers must sign
# requests with SigV4 (or use a CloudFront OAC / API Gateway as a proxy).
# ---------------------------------------------------------------------------

resource "aws_lambda_function_url" "prompt_generator" {
  count = var.create_lambda ? 1 : 0

  function_name      = aws_lambda_function.prompt_generator[0].function_name
  authorization_type = var.lambda_url_auth_type

  cors {
    allow_credentials = false
    allow_origins     = ["*"] # Tighten for production (e.g. your Fire TV app origin)
    allow_methods     = ["POST", "OPTIONS"]
    allow_headers     = ["Content-Type", "Authorization"]
    max_age           = 300
  }
}
