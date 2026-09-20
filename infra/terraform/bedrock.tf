# ---------------------------------------------------------------------------
# Bedrock IAM policy
#
# IMPORTANT — IAM is NOT sufficient on its own.
# Before this policy has any effect, each model must be individually enabled
# in the AWS Console under:
#   Amazon Bedrock → Model access → Request model access
# See README.md for the step-by-step guide.
#
# ARN shapes used here:
#   Foundation model (global, no account):
#     arn:aws:bedrock:<region>::foundation-model/<provider>.<model-short-id>
#   Cross-region inference profile (account-scoped):
#     arn:aws:bedrock:<region>:<account>:inference-profile/<model-id>
#
# The inference profiles listed in var.model_ids route internally to the
# underlying foundation models.  We grant InvokeModel on BOTH so callers
# can address either ARN form.
# ---------------------------------------------------------------------------

locals {
  # Map each cross-region inference-profile model-id to its underlying
  # foundation-model short name (the part after the last "/" in the FM ARN).
  #
  # Haiku 4.5:  us.anthropic.claude-haiku-4-5-20251001-v1:0
  #   routes to  anthropic.claude-haiku-4-5-20251001-v1:0
  # Sonnet 4.6: us.anthropic.claude-sonnet-4-6
  #   routes to  anthropic.claude-sonnet-4-6
  #
  # The "us." prefix is stripped to get the foundation-model id.
  foundation_model_ids = [
    for mid in var.model_ids :
    replace(mid, "/^us\\./", "")
  ]

  # Cross-region inference profile ARNs (account-scoped, us-east-1).
  # Used when the caller passes the model_id directly as modelId in the SDK.
  inference_profile_arns = [
    for mid in var.model_ids :
    "arn:aws:bedrock:${var.region}:${var.account_id}:inference-profile/${mid}"
  ]

  # Foundation model ARNs (global namespace — no account segment).
  # Required because the inference profile internally calls these.
  foundation_model_arns = [
    for fmid in local.foundation_model_ids :
    "arn:aws:bedrock:${var.region}::foundation-model/${fmid}"
  ]
}

# ---------------------------------------------------------------------------
# Policy document
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "bedrock" {
  # Statement 1 — invoke inference profiles directly (primary usage path)
  statement {
    sid    = "BedrockInvokeInferenceProfiles"
    effect = "Allow"

    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream",
    ]

    resources = local.inference_profile_arns
  }

  # Statement 2 — invoke foundation models (required for cross-region routing)
  statement {
    sid    = "BedrockInvokeFoundationModels"
    effect = "Allow"

    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream",
    ]

    resources = local.foundation_model_arns
  }

  # Statement 3 — discovery / health-check actions (read-only, no cost)
  statement {
    sid    = "BedrockDiscovery"
    effect = "Allow"

    actions = [
      "bedrock:GetInferenceProfile",
      "bedrock:ListInferenceProfiles",
      "bedrock:ListFoundationModels",
    ]

    # These list/describe APIs do not accept resource-level conditions.
    resources = ["*"]
  }
}

resource "aws_iam_policy" "bedrock" {
  name        = "${var.project}-bedrock-invoke"
  description = "Allow the prompt-generator Lambda to invoke Bedrock inference profiles and their underlying foundation models."
  policy      = data.aws_iam_policy_document.bedrock.json

  tags = var.tags
}
