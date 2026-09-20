#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";

import { FirexpContentStack } from "../lib/firexp-content-stack";

const app = new cdk.App();

// Stage is passed at synth/deploy time via: -c environment=prod
// Falls back to "dev" so a bare `cdk synth` always works.
const env = app.node.tryGetContext("environment") ?? "dev";

const AWS_ACCOUNT =
  process.env.AWS_ACCOUNT_ID ??
  process.env.CDK_DEFAULT_ACCOUNT ??
  "557690620729"; // explicit account — always synths even without credentials

const AWS_REGION = process.env.CDK_DEFAULT_REGION ?? "us-east-1";

new FirexpContentStack(app, "FirexpContentStack", {
  env: { account: AWS_ACCOUNT, region: AWS_REGION },
  appEnv: env,
  description: `Firexp content-api stack — ${env}`,
});
