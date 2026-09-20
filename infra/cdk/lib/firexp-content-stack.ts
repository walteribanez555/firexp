import * as cdk from "aws-cdk-lib";
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import * as path from "path";

// ── Repo root (two levels up from infra/cdk/lib/) ─────────────────────────────
// Used for NodejsFunction projectRoot + depsLockFilePath so the bundler
// resolves the monorepo workspace and uses the root lockfile.
// __dirname is always available here (CJS output — no "type":"module" in package.json).
const REPO_ROOT = path.join(__dirname, "..", "..", "..");

export interface FirexpContentStackProps extends cdk.StackProps {
  /** Deployment stage: "dev" | "prod" (or any custom name). */
  appEnv: string;
}

/**
 * FirexpContentStack
 *
 * Provisions all AWS resources needed by the `content-api` service:
 *   - DynamoDB:  firexp-{env}-series  /  firexp-{env}-episodes  (+ GSI)
 *   - S3:        firexp-{env}-content  (video bucket, presigned PUT/GET)
 *   - Lambda:    firexp-{env}-content-api  (NodejsFunction → apps/content-api)
 *   - HTTP API:  firexp-{env}-content-api  (API Gateway v2, CORS preflight)
 *
 * Stage is read from CDK context key `environment` (default "dev"):
 *   npx cdk synth -c environment=dev
 *   npx cdk deploy FirexpContentStack -c environment=prod
 */
export class FirexpContentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FirexpContentStackProps) {
    super(scope, id, props);

    const { appEnv } = props;
    const isProd = appEnv === "prod";
    const project = "firexp";
    const prefix = `${project}-${appEnv}`;

    // ── Stack-level tags ───────────────────────────────────────────────────────
    // Mirrors the team convention: Project / Environment / ManagedBy:CDK
    cdk.Tags.of(this).add("Project", project);
    cdk.Tags.of(this).add("Environment", appEnv);
    cdk.Tags.of(this).add("ManagedBy", "CDK");

    // ── Feature gate ──────────────────────────────────────────────────────────
    // Set `createLambda: false` in cdk.json context (or -c createLambda=false)
    // to deploy tables + bucket without the Lambda + API (e.g. first-time bootstrap).
    const createLambda =
      (this.node.tryGetContext("createLambda") ?? "true") !== "false";

    // ─────────────────────────────────────────────────────────────────────────
    // 1. DynamoDB — series table
    //
    // Access patterns:
    //   PK  id  → get/put series by unique ID
    // ─────────────────────────────────────────────────────────────────────────
    const seriesTable = new dynamodb.Table(this, "SeriesTable", {
      tableName: `${prefix}-series`,
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },

      billingMode: isProd
        ? dynamodb.BillingMode.PAY_PER_REQUEST
        : dynamodb.BillingMode.PROVISIONED,
      readCapacity: isProd ? undefined : 5,
      writeCapacity: isProd ? undefined : 5,

      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      // PITR (point-in-time recovery) enabled in prod to protect catalogue data
      pointInTimeRecoverySpecification: isProd
        ? { pointInTimeRecoveryEnabled: true }
        : undefined,

      removalPolicy: isProd
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. DynamoDB — episodes table
    //
    // Access patterns:
    //   PK  id               → get episode by unique ID
    //   GSI seriesId-number  → list all episodes for a series, ordered by number
    // ─────────────────────────────────────────────────────────────────────────
    const episodesTable = new dynamodb.Table(this, "EpisodesTable", {
      tableName: `${prefix}-episodes`,
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },

      billingMode: isProd
        ? dynamodb.BillingMode.PAY_PER_REQUEST
        : dynamodb.BillingMode.PROVISIONED,
      readCapacity: isProd ? undefined : 5,
      writeCapacity: isProd ? undefined : 5,

      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: isProd
        ? { pointInTimeRecoveryEnabled: true }
        : undefined,

      removalPolicy: isProd
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // GSI: list episodes by series, ordered numerically
    episodesTable.addGlobalSecondaryIndex({
      indexName: "seriesId-number-index",
      partitionKey: { name: "seriesId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "number", type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. DynamoDB — sessions table (single-table design)
    //
    // Access patterns:
    //   PK=SESSION#<roomCode>  SK=META          → session metadata
    //   PK=SESSION#<roomCode>  SK=DECISION#...  → per-room decision log
    //   PK=AGG#<episodeId>#<decisionId>  SK=OPTION#<optionId> → aggregated counts
    //
    //   GSI byEpisode: PK=episodeId, SK=startedAt → list sessions for a creator dashboard
    // ─────────────────────────────────────────────────────────────────────────
    const sessionsTable = new dynamodb.Table(this, "SessionsTable", {
      tableName: `${prefix}-sessions`,
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey:      { name: "SK", type: dynamodb.AttributeType.STRING },

      billingMode: isProd
        ? dynamodb.BillingMode.PAY_PER_REQUEST
        : dynamodb.BillingMode.PROVISIONED,
      readCapacity:  isProd ? undefined : 5,
      writeCapacity: isProd ? undefined : 5,

      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: isProd
        ? { pointInTimeRecoveryEnabled: true }
        : undefined,

      removalPolicy: isProd
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // GSI: list sessions by episode for creator analytics (sparse — only META items have episodeId)
    sessionsTable.addGlobalSecondaryIndex({
      indexName: "byEpisode",
      partitionKey: { name: "episodeId", type: dynamodb.AttributeType.STRING },
      sortKey:      { name: "startedAt", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 4. S3 — content bucket (video assets)
    //
    // Videos are NOT served directly from S3 — the Lambda generates presigned
    // GET URLs (TTL: PRESIGN_TTL env var, default 300 s).
    // A CDN (CloudFront) can be placed in front for production; that is NOT
    // provisioned here to keep the initial stack minimal — add when needed.
    // ─────────────────────────────────────────────────────────────────────────
    const contentBucket = new s3.Bucket(this, "ContentBucket", {
      bucketName: `${prefix}-content`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,

      removalPolicy: isProd
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      // autoDeleteObjects requires a custom resource Lambda — safe to enable in dev/staging
      autoDeleteObjects: !isProd,

      cors: [
        {
          // Browser multipart upload support: PUT (upload parts), GET (presigned GETs),
          // HEAD (check existence), POST (initiate/complete multipart upload).
          // exposeHeaders MUST include ETag so the browser can read each part's
          // ETag from the CompleteMultipartUpload response — without it the S3
          // SDK cannot assemble the final object and uploads silently fail.
          //
          // allowedOrigins: ['*'] is intentional for dev/hackathon.
          // TODO (prod hardening): replace '*' with the dashboardOrigins context var
          //   (npx cdk synth -c dashboardOrigins=https://dashboard.firexp.io) or the
          //   CloudFront distribution domain once a custom domain is attached.
          allowedMethods: [
            s3.HttpMethods.PUT,
            s3.HttpMethods.GET,
            s3.HttpMethods.HEAD,
            s3.HttpMethods.POST,
          ],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          exposedHeaders: ["ETag"],
          maxAge: 3000,
        },
      ],
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 4. CloudFront — CDN distribution in front of the private content bucket
    //
    // Origin Access Control (OAC) — the modern successor to OAI — is used here.
    // CDK >= 2.116 ships S3BucketOrigin.withOriginAccessControl(), which:
    //   • Creates an OAC of type S3 (SigV4 signing, ALWAYS sign)
    //   • Adds the required bucket policy statement that allows
    //     cloudfront.amazonaws.com → s3:GetObject conditioned on the
    //     distribution ARN (more secure than OAI which grants s3:GetObject to
    //     the global CloudFront service principal without condition).
    //
    // Why OAC over OAI:
    //   • OAI is a legacy feature; AWS recommends OAC for all new distributions.
    //   • OAC supports SSE-KMS-encrypted buckets; OAI does not.
    //   • OAC uses SigV4 request signing (stronger than OAI's canonical URL).
    //
    // PriceClass: read from context key `cdnPriceClass` (default PRICE_CLASS_100).
    //   PRICE_CLASS_100  → US, CA, EU, Israel (cheapest; good enough for Fire TV launch)
    //   PRICE_CLASS_200  → PRICE_CLASS_100 + more APAC + Middle East + Africa
    //   PRICE_CLASS_ALL  → all edge locations worldwide
    //   Override at synth time: npx cdk synth -c cdnPriceClass=PRICE_CLASS_ALL
    //
    // Custom domain / ACM cert: not provisioned here.
    //   To add: set `domainNames` + `certificate` on the Distribution (uncomment below).
    //   The cert MUST be in us-east-1 regardless of the stack region.
    //
    //   Example (add after priceClass):
    //     domainNames: ['cdn.firexp.io'],
    //     certificate: acm.Certificate.fromCertificateArn(this, 'Cert', 'arn:aws:acm:...'),
    // ─────────────────────────────────────────────────────────────────────────

    const cdnPriceClassStr =
      (this.node.tryGetContext("cdnPriceClass") as string | undefined) ??
      "PRICE_CLASS_100";
    const cdnPriceClass =
      cloudfront.PriceClass[cdnPriceClassStr as keyof typeof cloudfront.PriceClass] ??
      cloudfront.PriceClass.PRICE_CLASS_100;

    const contentDistribution = new cloudfront.Distribution(
      this,
      "ContentDistribution",
      {
        // OAC: CDK creates the OriginAccessControl resource and wires the
        // bucket policy automatically via S3BucketOrigin.withOriginAccessControl().
        defaultBehavior: {
          origin: origins.S3BucketOrigin.withOriginAccessControl(contentBucket),
          // GET and HEAD only — videos are read-only via the CDN.
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          // CachingOptimized: AWS managed policy tuned for static/media assets
          // (compresses text, long TTL, no cookies/query strings in cache key).
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          compress: true,
        },

        priceClass: cdnPriceClass,

        // Minimum TLS 1.2 across all viewer connections
        minimumProtocolVersion:
          cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,

        // Access logging disabled by default (no log bucket provisioned here).
        // Enable in prod by creating an S3 log bucket and setting enableLogging: true.
        enableLogging: false,

        comment: `${prefix}-content CDN — private S3 bucket served via OAC`,
      }
    );

    // ─────────────────────────────────────────────────────────────────────────
    // 6. Lambda — content-api
    //
    // NodejsFunction bundles apps/content-api/src/index.ts at DEPLOY time via
    // esbuild (not at synth time), so `cdk synth` succeeds even when the app
    // source hasn't been compiled yet.  The projectRoot + depsLockFilePath
    // anchors esbuild to the monorepo root so workspace symlinks resolve.
    //
    // bundling.externalModules: ['@aws-sdk/*'] — the Lambda runtime already
    // ships AWS SDK v3, so we exclude it to keep the bundle small.
    // ─────────────────────────────────────────────────────────────────────────
    let contentApiFn: lambdaNodejs.NodejsFunction | undefined;

    if (createLambda) {
      contentApiFn = new lambdaNodejs.NodejsFunction(this, "ContentApiFn", {
        functionName: `${prefix}-content-api`,
        description: "Firexp content-api — series/episode CRUD + presigned S3 URLs",
        runtime: lambda.Runtime.NODEJS_22_X,
        // Entry path is relative to the monorepo root for consistency with
        // how fraud-detector and redcard resolve their app entries.
        entry: path.join(REPO_ROOT, "apps/content-api/src/index.ts"),
        handler: "handler",
        memorySize: 512,
        timeout: cdk.Duration.seconds(30),

        // Monorepo bundling: point esbuild at the repo root so it can resolve
        // workspace packages (e.g. @fire-stick/types) via the root lockfile.
        projectRoot: REPO_ROOT,
        depsLockFilePath: path.join(REPO_ROOT, "package-lock.json"),

        bundling: {
          // Minify only in prod to keep dev bundles readable in CloudWatch
          minify: isProd,
          sourceMap: !isProd,
          target: "node22",
          // AWS SDK v3 is pre-installed in the Lambda runtime — exclude to shrink bundle
          externalModules: ["@aws-sdk/*"],
        },

        environment: {
          NODE_ENV: isProd ? "production" : "development",
          // AWS_REGION is injected automatically by the Lambda runtime; listed
          // here for explicitness in case local tooling needs it.
          AWS_REGION_NAME: this.region,
          SERIES_TABLE:   seriesTable.tableName,
          EPISODES_TABLE: episodesTable.tableName,
          SESSIONS_TABLE: sessionsTable.tableName,
          CONTENT_BUCKET: contentBucket.bucketName,
          // CDN_BASE: CloudFront distribution URL — the Lambda uses this to build
          // public video URLs that route through the CDN instead of S3 directly.
          // The bucket remains private; only CloudFront (via OAC) can read it.
          CDN_BASE: `https://${contentDistribution.distributionDomainName}`,
          // Presigned URL TTL in seconds (5 min default)
          PRESIGN_TTL: "300",
          // Storage backend selector — "dynamo" is the only supported value now
          STORAGE: "dynamo",
        },
      });

      // ── IAM grants (least-privilege via grant* helpers) ──────────────────────
      seriesTable.grantReadWriteData(contentApiFn);
      episodesTable.grantReadWriteData(contentApiFn);
      sessionsTable.grantReadWriteData(contentApiFn);
      // grantReadWrite covers s3:GetObject, s3:PutObject, s3:DeleteObject —
      // all needed for presigned URL generation and direct Lambda operations.
      contentBucket.grantReadWrite(contentApiFn);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. HTTP API v2 (only created when Lambda exists)
    //
    // Uses the L2 HttpApi construct (same pattern as redcard) with
    // HttpLambdaIntegration as the default route — all methods/paths
    // are forwarded to the Lambda (the app router handles routing internally).
    //
    // CORS: '*' origin is intentional for the hackathon/dev phase.
    // TODO (prod hardening): restrict allowOrigins to the Fire TV app origin or
    //   the dashboard CloudFront URL.
    // ─────────────────────────────────────────────────────────────────────────
    let httpApi: apigatewayv2.HttpApi | undefined;

    if (createLambda && contentApiFn) {
      httpApi = new apigatewayv2.HttpApi(this, "ContentHttpApi", {
        apiName: `${prefix}-content-api`,
        description: "Firexp content-api HTTP API (series, episodes, presigned URLs)",
        defaultIntegration: new HttpLambdaIntegration(
          "ContentApiIntegration",
          contentApiFn
        ),
        corsPreflight: {
          // TODO (prod): restrict to Fire TV app/dashboard origin
          allowOrigins: ["*"],
          allowMethods: [
            apigatewayv2.CorsHttpMethod.GET,
            apigatewayv2.CorsHttpMethod.POST,
            apigatewayv2.CorsHttpMethod.PUT,
            apigatewayv2.CorsHttpMethod.DELETE,
            apigatewayv2.CorsHttpMethod.OPTIONS,
          ],
          allowHeaders: ["authorization", "content-type"],
        },
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 8. Stack Outputs (with exportName for cross-stack references / CI scripts)
    // ─────────────────────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, "SeriesTableName", {
      value: seriesTable.tableName,
      description: "DynamoDB series table name",
      exportName: `${prefix}-series-table-name`,
    });

    new cdk.CfnOutput(this, "EpisodesTableName", {
      value: episodesTable.tableName,
      description: "DynamoDB episodes table (with seriesId-number-index GSI)",
      exportName: `${prefix}-episodes-table-name`,
    });

    new cdk.CfnOutput(this, "SessionsTableName", {
      value: sessionsTable.tableName,
      description: "DynamoDB sessions table (single-table: SESSION#, AGG#; byEpisode GSI)",
      exportName: `${prefix}-sessions-table-name`,
    });

    new cdk.CfnOutput(this, "ContentBucketName", {
      value: contentBucket.bucketName,
      description: "S3 bucket for video content (private — access via CloudFront OAC only)",
      exportName: `${prefix}-content-bucket-name`,
    });

    new cdk.CfnOutput(this, "ContentCdnUrl", {
      value: `https://${contentDistribution.distributionDomainName}`,
      description:
        "CloudFront CDN URL for video content — use this for public video playback URLs. " +
        "The S3 bucket is private; only CloudFront (via OAC) can read it.",
      exportName: `${prefix}-content-cdn-url`,
    });

    if (httpApi) {
      new cdk.CfnOutput(this, "ContentApiUrl", {
        value: httpApi.apiEndpoint,
        description:
          "HTTP API v2 endpoint URL — point the dashboard/Fire TV app here",
        exportName: `${prefix}-content-api-url`,
      });
    }

    if (contentApiFn) {
      new cdk.CfnOutput(this, "ContentApiFunctionName", {
        value: contentApiFn.functionName,
        description: "Lambda function name (content-api)",
        exportName: `${prefix}-content-api-function`,
      });
    }
  }
}
