#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";

import { FirexpContentStack } from "../lib/firexp-content-stack";
import { FirexpAiStack } from "../lib/firexp-ai-stack";
import { FirexpRelayStack } from "../lib/firexp-relay-stack";

const app = new cdk.App();

// Stage is passed at synth/deploy time via: -c environment=prod
// Falls back to "dev" so a bare `cdk synth` always works.
const env = app.node.tryGetContext("environment") ?? "dev";

const AWS_ACCOUNT =
  process.env.AWS_ACCOUNT_ID ??
  process.env.CDK_DEFAULT_ACCOUNT ??
  "557690620729"; // explicit account — always synths even without credentials

const AWS_REGION = process.env.CDK_DEFAULT_REGION ?? "us-east-1";

const cdkEnv = { account: AWS_ACCOUNT, region: AWS_REGION };

// ── Content stack ─────────────────────────────────────────────────────────────
// DynamoDB (series/episodes/sessions) + S3 + CloudFront (OAC) + content-api
// Lambda + HTTP API.
new FirexpContentStack(app, "FirexpContentStack", {
  env: cdkEnv,
  appEnv: env,
  description: `Firexp content-api stack — ${env}`,
});

// ── AI stack ──────────────────────────────────────────────────────────────────
// Bedrock IAM policy + prompt-cache DynamoDB + prompt-generator Lambda + HTTP API.
// Optional Secrets Manager placeholder (set -c createSecret=true to create it).
//
// NOTE: the content-api recap endpoint (apps/content-api/src/modules/sessions)
// also calls Bedrock (ConverseCommand). The Bedrock managed policy exported from
// FirexpAiStack can be attached to the content-api Lambda's role after deploy:
//   aws iam attach-role-policy \
//     --role-name <content-api-role> \
//     --policy-arn <firexp-dev-bedrock-policy-arn>
// Or use the BedrockPolicyArn CfnOutput to pass it to the content-api stack.
new FirexpAiStack(app, "FirexpAiStack", {
  env: cdkEnv,
  appEnv: env,
  description: `Firexp AI/Bedrock stack (prompt-generator) — ${env}`,
});

// ── Relay stack (WebSocket, ECS Fargate) ────────────────────────────────────────
// Real-time room relay. DEV: single public-IP Fargate task (no ALB, no NAT).
// PROD: ALB + private task. See lib/firexp-relay-stack.ts for the full rationale.
// Pass the deployed content-api URL so the relay can forward sessions:
//   cdk deploy FirexpRelayStack -c contentApiUrl=https://xxxx.execute-api...
new FirexpRelayStack(app, "FirexpRelayStack", {
  env: cdkEnv,
  appEnv: env,
  description: `Firexp relay stack (WebSocket, ECS Fargate) — ${env}`,
});
