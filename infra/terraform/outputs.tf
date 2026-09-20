# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "lambda_function_url" {
  description = "HTTPS endpoint for the prompt-generator Lambda function URL. Empty when create_lambda = false."
  value       = var.create_lambda ? aws_lambda_function_url.prompt_generator[0].function_url : ""
}

output "lambda_role_arn" {
  description = "ARN of the IAM role assumed by the Lambda function. Empty when create_lambda = false."
  value       = var.create_lambda ? aws_iam_role.lambda[0].arn : ""
}

output "prompts_table_name" {
  description = "Name of the DynamoDB prompt cache table."
  value       = aws_dynamodb_table.prompts.name
}

output "prompts_table_arn" {
  description = "ARN of the DynamoDB prompt cache table."
  value       = aws_dynamodb_table.prompts.arn
}

output "bedrock_policy_arn" {
  description = "ARN of the IAM policy granting Bedrock InvokeModel access."
  value       = aws_iam_policy.bedrock.arn
}

output "secret_arn" {
  description = "ARN of the Secrets Manager secret (placeholder). Empty when create_secret = false."
  value       = var.create_secret ? aws_secretsmanager_secret.config[0].arn : ""
  sensitive   = true
}
