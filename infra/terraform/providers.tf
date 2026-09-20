# ---------------------------------------------------------------------------
# AWS Provider
#
# Authentication relies on the default credential chain in order of priority:
#   1. Environment variables (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)
#   2. ~/.aws/credentials (default profile, or AWS_PROFILE env var)
#   3. IAM instance/container role (when running on EC2 / ECS / Lambda / GH Actions OIDC)
#
# The IAM user `infra-deploy` (account 557690620729) is the intended principal.
# Never hard-code credentials here or commit them to source control.
# ---------------------------------------------------------------------------

provider "aws" {
  region = var.region
}
