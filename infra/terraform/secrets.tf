# ---------------------------------------------------------------------------
# Secrets Manager — runtime config placeholder
#
# This resource is gated behind var.create_secret (default: false).
#
# The secret is created EMPTY (no SecretString / SecretBinary).  Populate
# it after apply with:
#
#   aws secretsmanager put-secret-value \
#     --secret-id fire-hack/prompt-generator \
#     --secret-string '{"SOME_API_KEY":"value","OTHER_KEY":"value"}'
#
# NEVER commit plaintext secret values to source control.  The Terraform
# state file will contain the secret ARN but NOT the secret value (because
# we use aws_secretsmanager_secret without a version resource).
#
# The Lambda reads the secret at cold-start via SECRET_ID env var using
# the @aws-sdk/client-secrets-manager package.
# ---------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "config" {
  count = var.create_secret ? 1 : 0

  name        = var.secret_name
  description = "Runtime configuration for the fire-hack prompt-generator Lambda."

  # Prevent accidental deletion during terraform destroy (remove for scratch envs)
  # recovery_window_in_days = 7  # default is 30; set to 0 to allow immediate delete

  tags = var.tags

  lifecycle {
    # Ignore any changes to the secret value made outside Terraform
    # (e.g. via the console or aws CLI).  We intentionally never manage
    # the plaintext value in Terraform state.
    ignore_changes = [
      tags,
    ]
  }
}

# ---------------------------------------------------------------------------
# Secret version — intentionally NOT created here.
#
# Uncomment the block below only if you want Terraform to manage the initial
# secret value.  If you do, move actual values to a tfvars file that is
# gitignored, or use a data source from an external vault.
#
# resource "aws_secretsmanager_secret_version" "config_initial" {
#   count     = var.create_secret ? 1 : 0
#   secret_id = aws_secretsmanager_secret.config[0].id
#
#   # NEVER hard-code real credentials here.
#   secret_string = jsonencode({
#     SOME_KEY = "REPLACE_ME"
#   })
#
#   lifecycle {
#     ignore_changes = [secret_string]
#   }
# }
# ---------------------------------------------------------------------------
