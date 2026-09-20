import * as cdk from "aws-cdk-lib";
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import * as path from "path";

// ── Repo root (two levels up from infra/cdk/lib/) ─────────────────────────────
const REPO_ROOT = path.join(__dirname, "..", "..", "..");

// ── Bedrock model IDs ─────────────────────────────────────────────────────────
// Cross-region inference profiles (account-scoped).
// NOTE: IAM permissions alone are NOT sufficient — each model must be
// individually enabled in the AWS Console under:
//   Amazon Bedrock → Model access → Request model access
// Without the console opt-in, Bedrock returns AccessDeniedException at runtime
// even when the IAM policy is correct.
const BEDROCK_MODEL_IDS = [
  "us.anthropic.claude-haiku-4-5-20251001-v1:0", // fast / low-cost (default)
  "us.anthropic.claude-sonnet-4-6",               // higher quality
];

export interface FirexpAiStackProps extends cdk.StackProps {
  /** Deployment stage: "dev" | "prod" (or any custom name). */
  appEnv: string;
}

/**
 * FirexpAiStack
 *
 * Provisions all AWS resources needed by the `prompt-generator` service:
 *   - IAM:          Bedrock invoke policy (inference profiles + foundation models)
 *   - DynamoDB:     firexp-{env}-prompts  (prompt cache with TTL)
 *   - Lambda:       firexp-{env}-prompt-generator  (NodejsFunction)
 *   - HTTP API:     firexp-{env}-prompt-api  (API Gateway v2, HTTP)
 *   - Secrets Mgr:  firexp/{env}/prompt-generator  (gated behind `createSecret`)
 *
 * Bedrock IAM coverage:
 *   • bedrock:InvokeModel + bedrock:InvokeModelWithResponseStream
 *       → inference-profile ARNs  (arn:aws:bedrock:us-east-1:<account>:inference-profile/...)
 *       → foundation-model ARNs   (arn:aws:bedrock:us-east-1::foundation-model/...)
 *   • bedrock:ListFoundationModels + bedrock:GetInferenceProfile + bedrock:ListInferenceProfiles
 *       → "*" (discovery/health — no resource-level condition supported)
 *
 * Feature gates (CDK context):
 *   createLambda  (default true)  — set false to synth without a build artifact
 *   createSecret  (default false) — set true to create the Secrets Manager placeholder
 *
 * Stage is read from CDK context key `environment` (default "dev"):
 *   npx cdk synth -c environment=dev
 *   npx cdk deploy FirexpAiStack -c environment=prod
 */
export class FirexpAiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FirexpAiStackProps) {
    super(scope, id, props);

    const { appEnv } = props;
    const isProd = appEnv === "prod";
    const project = "firexp";
    const prefix = `${project}-${appEnv}`;
    const account = this.account; // resolved at synth time (from env prop)
    const region = this.region;

    // ── Stack-level tags ───────────────────────────────────────────────────────
    cdk.Tags.of(this).add("Project", project);
    cdk.Tags.of(this).add("Environment", appEnv);
    cdk.Tags.of(this).add("ManagedBy", "CDK");

    // ── Feature gates ──────────────────────────────────────────────────────────
    const createLambda =
      (this.node.tryGetContext("createLambda") ?? "true") !== "false";
    const createSecret =
      (this.node.tryGetContext("createSecret") ?? "false") === "true";

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Bedrock IAM — managed policy for invoking Bedrock models
    //
    // ARN shapes:
    //   Inference profile (account-scoped):
    //     arn:aws:bedrock:<region>:<account>:inference-profile/<model-id>
    //   Foundation model (global namespace — no account segment):
    //     arn:aws:bedrock:<region>::foundation-model/<fm-short-id>
    //
    // The foundation-model short ID is derived by stripping the "us." prefix
    // from the cross-region inference profile ID (e.g.
    //   "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    //    → "anthropic.claude-haiku-4-5-20251001-v1:0").
    //
    // We grant InvokeModel on BOTH so callers can address either ARN form.
    // The inference profile internally routes to the foundation model, so both
    // must be allowed.
    // ─────────────────────────────────────────────────────────────────────────

    // Build inference-profile ARNs (account-scoped, region us-east-1).
    const inferenceProfileArns = BEDROCK_MODEL_IDS.map(
      (mid) => `arn:aws:bedrock:${region}:${account}:inference-profile/${mid}`
    );

    // Build foundation-model ARNs (global namespace — no account segment).
    const foundationModelArns = BEDROCK_MODEL_IDS.map((mid) => {
      // Strip "us." prefix to get the underlying foundation-model ID.
      const fmId = mid.replace(/^us\./, "");
      return `arn:aws:bedrock:${region}::foundation-model/${fmId}`;
    });

    const bedrockPolicy = new iam.ManagedPolicy(this, "BedrockPolicy", {
      managedPolicyName: `${prefix}-bedrock-invoke`,
      description:
        "Allow prompt-generator (and content-api recap) to invoke Bedrock inference profiles and their underlying foundation models.",
      statements: [
        // Statement 1 — invoke inference profiles (primary usage path)
        new iam.PolicyStatement({
          sid: "BedrockInvokeInferenceProfiles",
          effect: iam.Effect.ALLOW,
          actions: [
            "bedrock:InvokeModel",
            "bedrock:InvokeModelWithResponseStream",
          ],
          resources: inferenceProfileArns,
        }),
        // Statement 2 — invoke foundation models (required for cross-region routing)
        new iam.PolicyStatement({
          sid: "BedrockInvokeFoundationModels",
          effect: iam.Effect.ALLOW,
          actions: [
            "bedrock:InvokeModel",
            "bedrock:InvokeModelWithResponseStream",
          ],
          resources: foundationModelArns,
        }),
        // Statement 3 — discovery / health-check (read-only, no per-resource scope)
        new iam.PolicyStatement({
          sid: "BedrockDiscovery",
          effect: iam.Effect.ALLOW,
          actions: [
            "bedrock:ListFoundationModels",
            "bedrock:GetInferenceProfile",
            "bedrock:ListInferenceProfiles",
          ],
          resources: ["*"],
        }),
      ],
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. DynamoDB — prompt-cache table
    //
    // Schema:
    //   PK   cacheKey  (String)  — SHA-256 of prompt + model + schema version
    //   TTL  ttl       (Number)  — Unix epoch seconds; DynamoDB auto-deletes
    //
    // Billing: PAY_PER_REQUEST (hackathon/variable traffic).
    // Table name follows the `firexp-{env}-*` convention used by the other tables.
    // ─────────────────────────────────────────────────────────────────────────
    const promptsTable = new dynamodb.Table(this, "PromptsTable", {
      tableName: `${prefix}-prompts`,
      partitionKey: { name: "cacheKey", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,

      encryption: dynamodb.TableEncryption.AWS_MANAGED,

      // TTL: DynamoDB deletes items automatically when `ttl` (a Unix epoch in
      // seconds) is in the past.  The Lambda sets it via CACHE_TTL_SECONDS.
      timeToLiveAttribute: "ttl",

      // PITR in prod; not needed for a cache table in dev.
      pointInTimeRecoverySpecification: isProd
        ? { pointInTimeRecoveryEnabled: true }
        : undefined,

      removalPolicy: isProd
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Secrets Manager — placeholder (gated behind createSecret context)
    //
    // The secret is created EMPTY.  Populate after deploy:
    //   aws secretsmanager put-secret-value \
    //     --secret-id firexp/{env}/prompt-generator \
    //     --secret-string '{"SOME_API_KEY":"value"}'
    //
    // NEVER store plaintext values in CDK code or cdk.json.
    // ─────────────────────────────────────────────────────────────────────────
    let secret: secretsmanager.Secret | undefined;

    if (createSecret) {
      secret = new secretsmanager.Secret(this, "PromptGeneratorSecret", {
        secretName: `${project}/${appEnv}/prompt-generator`,
        description: `Runtime configuration for the ${prefix}-prompt-generator Lambda.`,
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Lambda — prompt-generator
    //
    // NodejsFunction bundles apps/prompt-generator/src/lambda.ts at DEPLOY
    // time via esbuild (not at synth time), so `cdk synth` succeeds even when
    // the app source hasn't been compiled.
    //
    // Entry: apps/prompt-generator/src/lambda.ts  →  export handler
    // Runtime: Node.js 22.x — matches the runtime used in FirexpContentStack.
    // ─────────────────────────────────────────────────────────────────────────
    let promptGeneratorFn: lambdaNodejs.NodejsFunction | undefined;

    if (createLambda) {
      promptGeneratorFn = new lambdaNodejs.NodejsFunction(
        this,
        "PromptGeneratorFn",
        {
          functionName: `${prefix}-prompt-generator`,
          description:
            "Generates narrative prompts using Amazon Bedrock; caches results in DynamoDB.",
          runtime: lambda.Runtime.NODEJS_22_X,
          // Entry: lambda.ts exports `handler` via Hono + hono/aws-lambda handle()
          entry: path.join(
            REPO_ROOT,
            "apps/prompt-generator/src/lambda.ts"
          ),
          handler: "handler",
          memorySize: 512,
          timeout: cdk.Duration.seconds(30),

          // Monorepo bundling: root lockfile + projectRoot for workspace resolution
          projectRoot: REPO_ROOT,
          depsLockFilePath: path.join(REPO_ROOT, "package-lock.json"),

          bundling: {
            minify: isProd,
            sourceMap: !isProd,
            target: "node22",
            // AWS SDK v3 is pre-installed in the Lambda runtime — exclude to shrink bundle
            externalModules: ["@aws-sdk/*"],
          },

          environment: {
            NODE_ENV: isProd ? "production" : "development",
            // Primary Bedrock model — fast / low-cost (override with -c or env)
            BEDROCK_MODEL_ID: BEDROCK_MODEL_IDS[0],
            // DynamoDB prompt-cache table
            PROMPTS_TABLE: promptsTable.tableName,
            // AWS_REGION is injected automatically by the Lambda runtime (reserved);
            // AWS_REGION_NAME is an app-level alias read by the config module for tooling.
            AWS_REGION_NAME: region,
            // Secrets Manager secret ID (empty string when not created)
            SECRET_ID: secret ? secret.secretName : "",
            // Application-level feature flags (sensible defaults; override via env)
            PROMPT_MODE: "ai",
            CACHE_TTL_SECONDS: "3600",
          },
        }
      );

      // ── IAM grants (least-privilege) ───────────────────────────────────────

      // Attach the Bedrock managed policy
      promptGeneratorFn.role!.addManagedPolicy(bedrockPolicy);

      // DynamoDB prompt-cache: read + write (GetItem, PutItem, DeleteItem, UpdateItem)
      promptsTable.grantReadWriteData(promptGeneratorFn);

      // Secrets Manager: read only (conditional)
      if (secret) {
        secret.grantRead(promptGeneratorFn);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. HTTP API v2 — prompt-generator API
    //
    // Matches the pattern used in FirexpContentStack (HttpApi + HttpLambdaIntegration).
    // CORS: '*' origin for the hackathon/dev phase.
    // TODO (prod): restrict allowOrigins to the Fire TV app / dashboard origin.
    // ─────────────────────────────────────────────────────────────────────────
    let promptApi: apigatewayv2.HttpApi | undefined;

    if (createLambda && promptGeneratorFn) {
      promptApi = new apigatewayv2.HttpApi(this, "PromptHttpApi", {
        apiName: `${prefix}-prompt-api`,
        description: "Firexp prompt-generator HTTP API (Bedrock + DynamoDB cache)",
        defaultIntegration: new HttpLambdaIntegration(
          "PromptGeneratorIntegration",
          promptGeneratorFn
        ),
        corsPreflight: {
          allowOrigins: ["*"],
          allowMethods: [
            apigatewayv2.CorsHttpMethod.GET,
            apigatewayv2.CorsHttpMethod.POST,
            apigatewayv2.CorsHttpMethod.OPTIONS,
          ],
          allowHeaders: ["authorization", "content-type"],
        },
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. Stack Outputs (with exportName for cross-stack references / CI scripts)
    // ─────────────────────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, "PromptsTableName", {
      value: promptsTable.tableName,
      description: "DynamoDB prompt-cache table name (PK: cacheKey, TTL: ttl)",
      exportName: `${prefix}-prompts-table-name`,
    });

    new cdk.CfnOutput(this, "BedrockPolicyArn", {
      value: bedrockPolicy.managedPolicyArn,
      description:
        "Bedrock invoke managed policy ARN — attach to other roles (e.g. content-api) if needed",
      exportName: `${prefix}-bedrock-policy-arn`,
    });

    if (promptApi) {
      new cdk.CfnOutput(this, "PromptApiUrl", {
        value: promptApi.apiEndpoint,
        description: "HTTP API v2 endpoint URL for the prompt-generator",
        exportName: `${prefix}-prompt-api-url`,
      });
    }

    if (promptGeneratorFn) {
      new cdk.CfnOutput(this, "PromptGeneratorFunctionName", {
        value: promptGeneratorFn.functionName,
        description: "Lambda function name (prompt-generator)",
        exportName: `${prefix}-prompt-generator-function`,
      });
    }

    if (secret) {
      new cdk.CfnOutput(this, "PromptGeneratorSecretArn", {
        value: secret.secretArn,
        description: "Secrets Manager ARN for the prompt-generator config secret",
        exportName: `${prefix}-prompt-generator-secret-arn`,
      });
    }
  }
}
