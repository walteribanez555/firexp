import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import { Construct } from "constructs";
import * as path from "path";

const REPO_ROOT = path.join(__dirname, "..", "..", "..");
const DASHBOARD_DIST = path.join(REPO_ROOT, "apps/content-dashboard/dist");

export interface FirexpDashboardStackProps extends cdk.StackProps {
  /** Deployment stage: "dev" | "prod". */
  appEnv: string;
}

/**
 * FirexpDashboardStack — hosts the content CMS (React SPA) on S3 + CloudFront,
 * mirroring the media hosting pattern in FirexpContentStack: a PRIVATE S3 bucket
 * (BlockPublicAccess.BLOCK_ALL) fronted by CloudFront with Origin Access Control
 * (OAC, SigV4). The built `apps/content-dashboard/dist` is uploaded via a
 * BucketDeployment (which also invalidates the distribution on each deploy).
 *
 * The SPA bakes VITE_CONTENT_API_URL at BUILD time, so the dist must be built
 * with the deployed content-api URL BEFORE deploying this stack. It is therefore
 * gated behind `-c dashboard=true` (so `cdk synth --all` in CI doesn't require a
 * built dist), and deployed after the content stack in the pipeline:
 *   VITE_CONTENT_API_URL=<content-api>/api/v1 npm run build -w content-dashboard
 *   cdk deploy FirexpDashboardStack -c dashboard=true
 */
export class FirexpDashboardStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FirexpDashboardStackProps) {
    super(scope, id, props);

    const { appEnv } = props;
    const isProd = appEnv === "prod";
    const project = "firexp";
    const prefix = `${project}-${appEnv}`;

    cdk.Tags.of(this).add("Project", project);
    cdk.Tags.of(this).add("Environment", appEnv);
    cdk.Tags.of(this).add("ManagedBy", "CDK");

    // Private bucket — never public; only CloudFront (OAC) can read it.
    const bucket = new s3.Bucket(this, "DashboardBucket", {
      bucketName: `${prefix}-dashboard`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
    });

    const distribution = new cloudfront.Distribution(this, "DashboardDistribution", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      // SPA client-side routing: serve index.html for unknown paths / 403 from S3.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html", ttl: cdk.Duration.minutes(5) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html", ttl: cdk.Duration.minutes(5) },
      ],
    });

    // Upload the built SPA and invalidate the cache on every deploy.
    new s3deploy.BucketDeployment(this, "DeployDashboard", {
      sources: [s3deploy.Source.asset(DASHBOARD_DIST)],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ["/*"],
      prune: true,
    });

    new cdk.CfnOutput(this, "DashboardUrl", {
      value: `https://${distribution.distributionDomainName}`,
      description: "Content CMS (dashboard) URL",
      exportName: `${prefix}-dashboard-url`,
    });
    new cdk.CfnOutput(this, "DashboardBucketName", {
      value: bucket.bucketName,
      exportName: `${prefix}-dashboard-bucket`,
    });
  }
}
