#!/usr/bin/env bash
# Ensure the account can invoke the Bedrock models Firexp uses.
#
# Model access is NOT the IAM policy (that's in FirexpAiStack). It's an account-
# level entitlement. This checks each model and, if it needs a marketplace/EULA
# agreement, accepts the first offer automatically. Entitlement-based Anthropic
# models (haiku-4-5 / sonnet-4-6) are usually already AVAILABLE — then this is a
# no-op preflight.
#
# Non-blocking: prints status and exits 0 (the deploy itself doesn't need Bedrock;
# only runtime AI calls do). Requires only the AWS CLI (no jq).
#
# Usage: AWS_REGION=us-east-1 bash infra/scripts/bedrock-access.sh
set -uo pipefail

REGION="${AWS_REGION:-us-east-1}"
MODELS=(
  "anthropic.claude-haiku-4-5-20251001-v1:0"
  "anthropic.claude-sonnet-4-6"
)

for M in "${MODELS[@]}"; do
  ENT=$(aws bedrock get-foundation-model-availability --model-id "$M" --region "$REGION" \
    --query entitlementAvailability --output text 2>/dev/null || echo "UNKNOWN")

  if [ "$ENT" = "AVAILABLE" ]; then
    echo "[ok]   $M — access available"
    continue
  fi

  # Needs an agreement — accept the first offer automatically.
  OFFER=$(aws bedrock list-foundation-model-agreement-offers --model-id "$M" --region "$REGION" \
    --query 'offers[0].offerToken' --output text 2>/dev/null || echo "")

  if [ -n "$OFFER" ] && [ "$OFFER" != "None" ]; then
    echo "[enable] $M — accepting model agreement…"
    if aws bedrock create-foundation-model-agreement --model-id "$M" --offer-token "$OFFER" \
        --region "$REGION" >/dev/null 2>&1; then
      echo "[ok]   $M — agreement created"
    else
      echo "[warn] $M — could not auto-accept (may need the use-case form): Console → Bedrock → Model access"
    fi
  else
    echo "[warn] $M — access not available and no offer found: Console → Bedrock → Model access"
  fi
done
