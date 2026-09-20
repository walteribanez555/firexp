#!/usr/bin/env bash
# Resolve the current public IP of the DEV relay Fargate task.
#
# The dev relay runs as a single Fargate task with a public IP and no load
# balancer (see infra/cdk/lib/firexp-relay-stack.ts). That IP is EPHEMERAL —
# it changes on every redeploy/restart — so use this to find the live one and
# point fire-hack Config.RELAY_HOST / PHONE_HOST (and the phone) at it.
#
# Usage:
#   bash infra/scripts/relay-ip.sh [cluster] [service]
# Defaults: firexp-dev-relay-cluster / firexp-dev-relay
set -euo pipefail

CLUSTER="${1:-firexp-dev-relay-cluster}"
SERVICE="${2:-firexp-dev-relay}"
PORT="${RELAY_PORT:-3001}"

TASK=$(aws ecs list-tasks --cluster "$CLUSTER" --service-name "$SERVICE" \
  --query 'taskArns[0]' --output text)

if [[ -z "$TASK" || "$TASK" == "None" ]]; then
  echo "No running task found for service '$SERVICE' in cluster '$CLUSTER'." >&2
  echo "Is the service up? (desiredCount >= 1)" >&2
  exit 1
fi

ENI=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK" \
  --query "tasks[0].attachments[0].details[?name=='networkInterfaceId'].value" \
  --output text)

IP=$(aws ec2 describe-network-interfaces --network-interface-ids "$ENI" \
  --query 'NetworkInterfaces[0].Association.PublicIp' --output text)

echo "Relay public IP : $IP"
echo "HTTP / WS       : http://$IP:$PORT   ws://$IP:$PORT"
echo
echo "Point the clients at it:"
echo "  fire-hack Config.RELAY_HOST / PHONE_HOST = http://$IP:$PORT"
