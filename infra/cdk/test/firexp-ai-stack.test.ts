import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { FirexpAiStack } from "../lib/firexp-ai-stack";

const TEST_ENV = { account: "557690620729", region: "us-east-1" };

function buildStack(
  appEnv: string,
  extraContext: Record<string, string> = {}
): Template {
  const app = new cdk.App({
    context: { environment: appEnv, ...extraContext },
  });
  const stack = new FirexpAiStack(app, "TestFirexpAiStack", {
    env: TEST_ENV,
    appEnv,
  });
  return Template.fromStack(stack);
}

// ─────────────────────────────────────────────────────────────────────────────
// Synthesis
// ─────────────────────────────────────────────────────────────────────────────

describe("FirexpAiStack synthesis", () => {
  it("synthesises without errors in dev", () => {
    expect(buildStack("dev")).toBeDefined();
  });

  it("synthesises without errors in prod", () => {
    expect(buildStack("prod")).toBeDefined();
  });

  it("synthesises with createLambda=false (no build artifact needed)", () => {
    expect(buildStack("dev", { createLambda: "false" })).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bedrock IAM — managed policy
// ─────────────────────────────────────────────────────────────────────────────

describe("Bedrock IAM — managed policy", () => {
  const template = buildStack("dev");

  it("creates the Bedrock managed policy with the correct name", () => {
    template.hasResourceProperties("AWS::IAM::ManagedPolicy", {
      ManagedPolicyName: "firexp-dev-bedrock-invoke",
    });
  });

  it("allows InvokeModel + InvokeModelWithResponseStream on inference-profile ARNs", () => {
    // The policy document is embedded in the ManagedPolicy resource.
    const policies = template.findResources("AWS::IAM::ManagedPolicy");
    const haiku = "us.anthropic.claude-haiku-4-5-20251001-v1:0";
    const hasInferenceProfileGrant = Object.values(policies).some((r: any) => {
      const stmts: any[] = r?.Properties?.PolicyDocument?.Statement ?? [];
      return stmts.some(
        (s) =>
          s.Sid === "BedrockInvokeInferenceProfiles" &&
          s.Effect === "Allow" &&
          s.Action?.includes("bedrock:InvokeModel") &&
          s.Action?.includes("bedrock:InvokeModelWithResponseStream") &&
          JSON.stringify(s.Resource).includes(haiku)
      );
    });
    expect(hasInferenceProfileGrant).toBe(true);
  });

  it("allows InvokeModel + InvokeModelWithResponseStream on foundation-model ARNs", () => {
    const policies = template.findResources("AWS::IAM::ManagedPolicy");
    // Foundation model ID strips the "us." prefix
    const haikuFm = "anthropic.claude-haiku-4-5-20251001-v1:0";
    const hasFoundationModelGrant = Object.values(policies).some((r: any) => {
      const stmts: any[] = r?.Properties?.PolicyDocument?.Statement ?? [];
      return stmts.some(
        (s) =>
          s.Sid === "BedrockInvokeFoundationModels" &&
          s.Effect === "Allow" &&
          JSON.stringify(s.Resource).includes("foundation-model") &&
          JSON.stringify(s.Resource).includes(haikuFm)
      );
    });
    expect(hasFoundationModelGrant).toBe(true);
  });

  it("allows Bedrock discovery actions on * resources", () => {
    const policies = template.findResources("AWS::IAM::ManagedPolicy");
    const hasDiscovery = Object.values(policies).some((r: any) => {
      const stmts: any[] = r?.Properties?.PolicyDocument?.Statement ?? [];
      return stmts.some(
        (s) =>
          s.Sid === "BedrockDiscovery" &&
          s.Effect === "Allow" &&
          s.Action?.includes("bedrock:ListFoundationModels") &&
          s.Action?.includes("bedrock:GetInferenceProfile") &&
          s.Action?.includes("bedrock:ListInferenceProfiles") &&
          s.Resource === "*"
      );
    });
    expect(hasDiscovery).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DynamoDB — prompt-cache table
// ─────────────────────────────────────────────────────────────────────────────

describe("DynamoDB — prompt-cache table", () => {
  const template = buildStack("dev");

  it("creates the prompts table with correct name and PK (cacheKey)", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "firexp-dev-prompts",
      KeySchema: [{ AttributeName: "cacheKey", KeyType: "HASH" }],
    });
  });

  it("uses PAY_PER_REQUEST billing", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "firexp-dev-prompts",
      BillingMode: "PAY_PER_REQUEST",
    });
  });

  it("enables TTL on the `ttl` attribute", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "firexp-dev-prompts",
      TimeToLiveSpecification: {
        AttributeName: "ttl",
        Enabled: true,
      },
    });
  });

  it("uses AWS_MANAGED encryption", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "firexp-dev-prompts",
      SSESpecification: { SSEEnabled: true },
    });
  });

  it("uses prod table name in prod env", () => {
    const prodTemplate = buildStack("prod");
    prodTemplate.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "firexp-prod-prompts",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lambda — prompt-generator
// ─────────────────────────────────────────────────────────────────────────────

describe("Lambda — prompt-generator", () => {
  const template = buildStack("dev");

  it("creates the prompt-generator Lambda with correct name and runtime", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: "firexp-dev-prompt-generator",
      Runtime: "nodejs22.x",
      MemorySize: 512,
    });
  });

  it("injects BEDROCK_MODEL_ID, PROMPTS_TABLE, AWS_REGION_NAME env vars", () => {
    // AWS_REGION is a reserved Lambda runtime variable and cannot be set manually.
    // The stack uses AWS_REGION_NAME as an explicit alias for tooling/local use.
    template.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: "firexp-dev-prompt-generator",
      Environment: {
        Variables: Match.objectLike({
          BEDROCK_MODEL_ID: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
          AWS_REGION_NAME: "us-east-1",
          PROMPT_MODE: "ai",
          CACHE_TTL_SECONDS: "3600",
        }),
      },
    });
  });

  it("PROMPTS_TABLE env var is set (resolves to the table name)", () => {
    const functions = template.findResources("AWS::Lambda::Function", {
      Properties: { FunctionName: "firexp-dev-prompt-generator" },
    });
    const fn = Object.values(functions)[0] as any;
    const promptsTable =
      fn?.Properties?.Environment?.Variables?.PROMPTS_TABLE;
    expect(promptsTable).toBeDefined();
    expect(promptsTable).not.toBe("");
  });

  it("does not create a Lambda when createLambda=false", () => {
    const noLambdaTemplate = buildStack("dev", { createLambda: "false" });
    // When createLambda=false, no Lambda functions should be synthesised
    // (the esbuild NodejsFunction custom-resource helper is also absent).
    const functions = noLambdaTemplate.findResources("AWS::Lambda::Function");
    const names: string[] = Object.values(functions)
      .map((r: any) => r?.Properties?.FunctionName)
      .filter(Boolean);
    expect(names).not.toContain("firexp-dev-prompt-generator");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HTTP API v2 — prompt-api
// ─────────────────────────────────────────────────────────────────────────────

describe("HTTP API v2 — prompt-api", () => {
  const template = buildStack("dev");

  it("creates the HTTP API with correct name and protocol", () => {
    template.hasResourceProperties("AWS::ApiGatewayV2::Api", {
      Name: "firexp-dev-prompt-api",
      ProtocolType: "HTTP",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Secrets Manager — conditional
// ─────────────────────────────────────────────────────────────────────────────

describe("Secrets Manager — placeholder secret", () => {
  it("does NOT create a secret by default (createSecret=false)", () => {
    const template = buildStack("dev");
    template.resourceCountIs("AWS::SecretsManager::Secret", 0);
  });

  it("creates the secret when createSecret=true", () => {
    const template = buildStack("dev", { createSecret: "true" });
    template.hasResourceProperties("AWS::SecretsManager::Secret", {
      Name: "firexp/dev/prompt-generator",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stack tags
// ─────────────────────────────────────────────────────────────────────────────

describe("Stack tags", () => {
  it("applies Project / Environment / ManagedBy:CDK tags", () => {
    const template = buildStack("dev");
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      Tags: Match.arrayWith([
        Match.objectLike({ Key: "Environment", Value: "dev" }),
        Match.objectLike({ Key: "ManagedBy", Value: "CDK" }),
        Match.objectLike({ Key: "Project", Value: "firexp" }),
      ]),
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CfnOutputs
// ─────────────────────────────────────────────────────────────────────────────

describe("CloudFormation Outputs", () => {
  const template = buildStack("dev");

  it("exports PromptsTableName", () => {
    template.hasOutput("PromptsTableName", {
      Export: { Name: "firexp-dev-prompts-table-name" },
    });
  });

  it("exports BedrockPolicyArn", () => {
    template.hasOutput("BedrockPolicyArn", {
      Export: { Name: "firexp-dev-bedrock-policy-arn" },
    });
  });

  it("exports PromptApiUrl", () => {
    template.hasOutput("PromptApiUrl", {
      Export: { Name: "firexp-dev-prompt-api-url" },
    });
  });

  it("exports PromptGeneratorFunctionName", () => {
    template.hasOutput("PromptGeneratorFunctionName", {
      Export: { Name: "firexp-dev-prompt-generator-function" },
    });
  });

  it("does not export secret ARN when createSecret=false (default)", () => {
    const outputs = template.findOutputs("PromptGeneratorSecretArn");
    expect(Object.keys(outputs)).toHaveLength(0);
  });

  it("exports PromptGeneratorSecretArn when createSecret=true", () => {
    const secretTemplate = buildStack("dev", { createSecret: "true" });
    secretTemplate.hasOutput("PromptGeneratorSecretArn", {
      Export: { Name: "firexp-dev-prompt-generator-secret-arn" },
    });
  });
});
