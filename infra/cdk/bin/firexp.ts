#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";

import { FirexpContentStack } from "../lib/firexp-content-stack";
import { FirexpAiStack } from "../lib/firexp-ai-stack";
import { FirexpRelayStack } from "../lib/firexp-relay-stack";
import { FirexpDashboardStack } from "../lib/firexp-dashboard-stack";

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
const contentStack = new FirexpContentStack(app, "FirexpContentStack", {
  env: cdkEnv,
  appEnv: env,
  description: `Firexp content-api stack — ${env}`,
});

// ── AI stack ──────────────────────────────────────────────────────────────────
// Bedrock IAM policy + prompt-cache DynamoDB + prompt-generator Lambda + HTTP API.
// Optional Secrets Manager placeholder (set -c createSecret=true to create it).
//
// The content-api recap endpoint + Nova Canvas cover generation also call Bedrock.
// That Lambda now gets its Bedrock InvokeModel grant IN CODE inside
// FirexpContentStack (see the BedrockInvokeContentApi PolicyStatement), so no
// manual `attach-role-policy` step is required after deploy. FirexpAiStack still
// exports its own managed policy (bedrockPolicy) for any additional roles.
new FirexpAiStack(app, "FirexpAiStack", {
  env: cdkEnv,
  appEnv: env,
  description: `Firexp AI/Bedrock stack (prompt-generator) — ${env}`,
});

// ── Relay stack (WebSocket, ECS Fargate) ────────────────────────────────────────
// Real-time room relay. DEV: single public-IP Fargate task (no ALB, no NAT).
// PROD: ALB + private task. See lib/firexp-relay-stack.ts for the full rationale.
// Fully autonomous: CDK builds/pushes the image (fromAsset) and imports the
// content-api URL from FirexpContentStack automatically. Just:
//   cdk deploy FirexpRelayStack -c environment=<env>
const relayStack = new FirexpRelayStack(app, "FirexpRelayStack", {
  env: cdkEnv,
  appEnv: env,
  description: `Firexp relay stack (WebSocket, ECS Fargate) — ${env}`,
});
// The relay imports the content-api URL export, so content must deploy first.
relayStack.addDependency(contentStack);

// ── Dashboard stack (React CMS on S3 + CloudFront) ──────────────────────────────
// Gated behind `-c dashboard=true` because it uploads apps/content-dashboard/dist,
// which must be built (with the deployed content-api URL) before deploying:
//   VITE_CONTENT_API_URL=<content-api>/api/v1 npm run build -w content-dashboard
//   cdk deploy FirexpDashboardStack -c dashboard=true
if ((app.node.tryGetContext("dashboard") ?? "false") === "true") {
  new FirexpDashboardStack(app, "FirexpDashboardStack", {
    env: cdkEnv,
    appEnv: env,
    description: `Firexp dashboard (CMS) static hosting — ${env}`,
  });
}
