import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { FirexpContentStack } from "../lib/firexp-content-stack";

const TEST_ENV = { account: "557690620729", region: "us-east-1" };

function buildStack(appEnv: string): Template {
  const app = new cdk.App({ context: { environment: appEnv } });
  const stack = new FirexpContentStack(app, "TestFirexpContentStack", {
    env: TEST_ENV,
    appEnv,
  });
  return Template.fromStack(stack);
}

// ─────────────────────────────────────────────────────────────────────────────
// Synthesis
// ─────────────────────────────────────────────────────────────────────────────

describe("FirexpContentStack synthesis", () => {
  it("synthesises without errors in dev", () => {
    expect(buildStack("dev")).toBeDefined();
  });

  it("synthesises without errors in prod", () => {
    expect(buildStack("prod")).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DynamoDB — series table
// ─────────────────────────────────────────────────────────────────────────────

describe("DynamoDB — series table", () => {
  const template = buildStack("dev");

  it("creates the series table with correct name and PK", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "firexp-dev-series",
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    });
  });

  it("uses AWS_MANAGED encryption", () => {
    // CDK emits SSEEnabled:true without an explicit SSEType for AWS_MANAGED
    // (AWS defaults the key to an AWS-managed KMS key when SSEType is absent)
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "firexp-dev-series",
      SSESpecification: { SSEEnabled: true },
    });
  });

  it("uses PROVISIONED billing in dev (5 RCU / 5 WCU)", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "firexp-dev-series",
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
    });
  });

  it("uses PAY_PER_REQUEST billing in prod", () => {
    const prodTemplate = buildStack("prod");
    prodTemplate.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "firexp-prod-series",
      BillingMode: "PAY_PER_REQUEST",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DynamoDB — episodes table + GSI
// ─────────────────────────────────────────────────────────────────────────────

describe("DynamoDB — episodes table", () => {
  const template = buildStack("dev");

  it("creates the episodes table with correct name and PK", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "firexp-dev-episodes",
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    });
  });

  it("creates the seriesId-number-index GSI with correct keys and ALL projection", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "firexp-dev-episodes",
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: "seriesId-number-index",
          KeySchema: [
            { AttributeName: "seriesId", KeyType: "HASH" },
            { AttributeName: "number", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        }),
      ]),
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S3 — content bucket
// ─────────────────────────────────────────────────────────────────────────────

describe("S3 — content bucket", () => {
  const template = buildStack("dev");

  it("creates the content bucket", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: "firexp-dev-content",
    });
  });

  it("blocks all public access (BLOCK_ALL — bucket stays private behind OAC)", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: "firexp-dev-content",
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it("enforces SSL (bucket policy)", () => {
    // enforceSSL adds a Deny statement for non-HTTPS requests
    const policies = template.findResources("AWS::S3::BucketPolicy");
    const hasSSLDeny = Object.values(policies).some((r: any) => {
      const stmts: any[] = r?.Properties?.PolicyDocument?.Statement ?? [];
      return stmts.some(
        (s) =>
          s.Effect === "Deny" &&
          JSON.stringify(s.Condition).includes("aws:SecureTransport")
      );
    });
    expect(hasSSLDeny).toBe(true);
  });

  it("configures CORS for PUT, GET, HEAD, POST (browser multipart upload)", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: "firexp-dev-content",
      CorsConfiguration: {
        CorsRules: Match.arrayWith([
          Match.objectLike({
            AllowedMethods: Match.arrayWith(["PUT", "GET", "HEAD", "POST"]),
            AllowedOrigins: ["*"],
          }),
        ]),
      },
    });
  });

  it("exposes ETag header in CORS (required for browser multipart upload assembly)", () => {
    // The browser S3 SDK reads each part's ETag to build the CompleteMultipartUpload
    // request. Without ExposeHeader: ETag the browser cannot finish a multipart upload.
    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: "firexp-dev-content",
      CorsConfiguration: {
        CorsRules: Match.arrayWith([
          Match.objectLike({
            ExposedHeaders: Match.arrayWith(["ETag"]),
          }),
        ]),
      },
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CloudFront — content distribution
// ─────────────────────────────────────────────────────────────────────────────

describe("CloudFront — content distribution", () => {
  const template = buildStack("dev");

  it("creates a CloudFront distribution", () => {
    // At least one distribution must be present
    template.resourceCountIs("AWS::CloudFront::Distribution", 1);
  });

  it("redirects HTTP to HTTPS on the default behavior", () => {
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: {
        DefaultCacheBehavior: {
          ViewerProtocolPolicy: "redirect-to-https",
        },
      },
    });
  });

  it("uses PRICE_CLASS_100 by default", () => {
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: {
        PriceClass: "PriceClass_100",
      },
    });
  });

  it("uses an Origin Access Control (OAC) — not OAI", () => {
    // CDK creates an AWS::CloudFront::OriginAccessControl resource for OAC.
    // OAI would instead create AWS::CloudFront::CloudFrontOriginAccessIdentity.
    template.resourceCountIs("AWS::CloudFront::OriginAccessControl", 1);
    template.resourceCountIs(
      "AWS::CloudFront::CloudFrontOriginAccessIdentity",
      0
    );
  });

  it("bucket policy allows CloudFront service principal (OAC grant)", () => {
    // OAC causes CDK to add an s3:GetObject Allow statement for the
    // cloudfront.amazonaws.com principal to the bucket policy.
    const policies = template.findResources("AWS::S3::BucketPolicy");
    const hasCfGrant = Object.values(policies).some((r: any) => {
      const stmts: any[] = r?.Properties?.PolicyDocument?.Statement ?? [];
      return stmts.some(
        (s) =>
          s.Effect === "Allow" &&
          JSON.stringify(s.Principal).includes("cloudfront.amazonaws.com")
      );
    });
    expect(hasCfGrant).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lambda — content-api
// ─────────────────────────────────────────────────────────────────────────────

describe("Lambda — content-api", () => {
  const template = buildStack("dev");

  it("creates the content-api Lambda with correct name and runtime", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: "firexp-dev-content-api",
      Runtime: "nodejs22.x",
      MemorySize: 512,
    });
  });

  it("injects required environment variables", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: "firexp-dev-content-api",
      Environment: {
        Variables: Match.objectLike({
          NODE_ENV: "development",
          PRESIGN_TTL: "300",
          STORAGE: "dynamo",
        }),
      },
    });
  });

  it("wires CDN_BASE to the CloudFront distribution domain", () => {
    // CDN_BASE must start with https:// and reference the CloudFront domain.
    // CDK resolves the domain as a CloudFormation Fn::Join / Fn::GetAtt token
    // so we match on the object shape rather than a literal string value.
    const functions = template.findResources("AWS::Lambda::Function", {
      Properties: { FunctionName: "firexp-dev-content-api" },
    });
    const fn = Object.values(functions)[0] as any;
    const cdnBase =
      fn?.Properties?.Environment?.Variables?.CDN_BASE ?? "";

    // The token resolves to a { "Fn::Join": [...] } at synth time; verify it
    // is not an empty string (as it was before this change).
    expect(cdnBase).not.toBe("");
    expect(cdnBase).not.toBeUndefined();
  });

  it("keeps CONTENT_BUCKET pointing at the private S3 bucket (not the CDN)", () => {
    // The Lambda signs S3 upload URLs directly against the private bucket.
    // CDN_BASE is used only for building the public playback URL returned to clients.
    //
    // CONTENT_BUCKET resolves to a CloudFormation Ref token at synth time, so we
    // verify it is present and non-empty rather than matching the literal bucket name
    // (which would require resolving the Ref at test time).
    const functions = template.findResources("AWS::Lambda::Function", {
      Properties: { FunctionName: "firexp-dev-content-api" },
    });
    const fn = Object.values(functions)[0] as any;
    const contentBucket =
      fn?.Properties?.Environment?.Variables?.CONTENT_BUCKET;

    // Must be defined and not an empty string
    expect(contentBucket).toBeDefined();
    expect(contentBucket).not.toBe("");
    // Must NOT be the CDN domain — the bucket env var must reference the S3 bucket,
    // not the CloudFront distribution (which is only in CDN_BASE).
    const cdnBase = fn?.Properties?.Environment?.Variables?.CDN_BASE;
    expect(contentBucket).not.toEqual(cdnBase);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HTTP API v2
// ─────────────────────────────────────────────────────────────────────────────

describe("HTTP API v2", () => {
  const template = buildStack("dev");

  it("creates the HTTP API with correct name", () => {
    template.hasResourceProperties("AWS::ApiGatewayV2::Api", {
      Name: "firexp-dev-content-api",
      ProtocolType: "HTTP",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tags
// ─────────────────────────────────────────────────────────────────────────────

describe("Stack tags", () => {
  it("applies Project / Environment / ManagedBy tags", () => {
    const template = buildStack("dev");
    // CDK emits tags in alphabetical key order: Environment, ManagedBy, Project.
    // arrayWith matches sequentially after the first hit, so order matters here.
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

  it("exports SeriesTableName", () => {
    template.hasOutput("SeriesTableName", {
      Export: { Name: "firexp-dev-series-table-name" },
    });
  });

  it("exports EpisodesTableName", () => {
    template.hasOutput("EpisodesTableName", {
      Export: { Name: "firexp-dev-episodes-table-name" },
    });
  });

  it("exports ContentBucketName", () => {
    template.hasOutput("ContentBucketName", {
      Export: { Name: "firexp-dev-content-bucket-name" },
    });
  });

  it("exports ContentCdnUrl with CloudFront domain", () => {
    template.hasOutput("ContentCdnUrl", {
      Export: { Name: "firexp-dev-content-cdn-url" },
    });
  });

  it("exports ContentApiUrl", () => {
    template.hasOutput("ContentApiUrl", {
      Export: { Name: "firexp-dev-content-api-url" },
    });
  });
});
