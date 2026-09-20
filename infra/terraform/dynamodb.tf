# ---------------------------------------------------------------------------
# DynamoDB — Prompt Cache Table
#
# Schema
#   cacheKey  (String, HASH)  — cache key (e.g. SHA-256 of prompt + model)
#   ttl       (Number)        — Unix epoch seconds; DynamoDB TTL auto-deletes
#                               items when this is in the past.
#
# Billing mode: PAY_PER_REQUEST (no capacity planning required for variable
# hackathon traffic; switch to PROVISIONED + auto-scaling for steady-state
# production workloads to cap costs).
# ---------------------------------------------------------------------------

resource "aws_dynamodb_table" "prompts" {
  name         = var.prompts_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "cacheKey"

  attribute {
    name = "cacheKey"
    type = "S" # String
  }

  # TTL — DynamoDB will automatically delete items whose `ttl` value
  # (a Unix epoch in seconds) is in the past.  The attribute must be a
  # Number type; the application sets it via CACHE_TTL_SECONDS env var.
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  # Point-in-time recovery — disabled by default to keep hackathon costs low.
  # Enable in production: point_in_time_recovery { enabled = true }

  tags = merge(var.tags, {
    Name = var.prompts_table_name
  })
}
