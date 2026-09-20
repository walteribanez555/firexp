import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as logs from "aws-cdk-lib/aws-logs";
import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import { Construct } from "constructs";
import * as path from "path";

// Repo root (two levels up from infra/cdk/lib/) — the Docker build context.
const REPO_ROOT = path.join(__dirname, "..", "..", "..");

export interface FirexpRelayStackProps extends cdk.StackProps {
  /** Deployment stage: "dev" | "prod" (or any custom name). */
  appEnv: string;
}

/**
 * FirexpRelayStack — the real-time WebSocket relay on ECS Fargate.
 *
 * Fully autonomous: `cdk deploy FirexpRelayStack` builds the relay image from
 * apps/relay/Dockerfile (ContainerImage.fromAsset → cdk-assets builds & pushes
 * to the bootstrap ECR at deploy time) and wires the content-api URL from the
 * FirexpContentStack export automatically. No manual docker build/push, no ECR
 * repo to manage, no multi-phase deploy. Docker must be running on the deploy
 * host (or CI runner) — that is the only manual prerequisite for a container.
 *
 * The relay keeps room state IN MEMORY (a "dumb forwarder" with a RoomState per
 * room), so it runs as a SINGLE task. Horizontal scaling would split a room's
 * TV and phones across tasks and break it; that needs shared pub/sub (e.g.
 * ElastiCache) and is intentionally out of scope.
 *
 * ── Topology decision: DEV vs PROD ────────────────────────────────────────────
 * DEV  (appEnv !== "prod")  — cost-optimised for testing/development:
 *   • VPC with PUBLIC subnets only, natGateways: 0            (no NAT ≈ save $32/mo)
 *   • 1 Fargate task with a public IP (assignPublicIp)        (no ALB   ≈ save $16/mo)
 *   • Reached directly by its (ephemeral) public IP — see infra/scripts/relay-ip.sh
 *   • Plain ws:// (no managed TLS). Fine for the emulator / LAN / dev.
 *   → ~$9/mo running 24/7, or ~$0 with desiredCount 0.
 *
 * PROD (appEnv === "prod") — durable and load-balanced:
 *   • VPC with 1 NAT gateway + private subnets for the task
 *   • Application Load Balanced Fargate Service (stable DNS, health checks,
 *     WebSocket-friendly idle timeout, deploy circuit breaker)
 *   • Still a single task (state-in-memory); add TLS (ACM cert + 443) + a
 *     domain for wss:// before shipping to real audiences.
 *   → ALB + NAT + Fargate ≈ ~$57/mo.
 */
export class FirexpRelayStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FirexpRelayStackProps) {
    super(scope, id, props);

    const { appEnv } = props;
    const isProd = appEnv === "prod";
    const project = "firexp";
    const prefix = `${project}-${appEnv}`;
    const RELAY_PORT = 3001;

    cdk.Tags.of(this).add("Project", project);
    cdk.Tags.of(this).add("Environment", appEnv);
    cdk.Tags.of(this).add("ManagedBy", "CDK");

    // content-api URL the relay forwards to. Auto-wired from the content stack's
    // export; override with `-c contentApiUrl=...` if needed. Base origin, WITHOUT
    // the /api/v1 prefix (the relay adds it).
    const contentApiUrl =
      (this.node.tryGetContext("contentApiUrl") as string | undefined) ??
      cdk.Fn.importValue(`${prefix}-content-api-url`);

    // ── VPC — NAT only in prod ────────────────────────────────────────────────
    const vpc = new ec2.Vpc(this, "Vpc", {
      vpcName: `${prefix}-vpc`,
      maxAzs: 2,
      // DEV: 0 NAT — the task runs in a public subnet and egresses via the IGW.
      // PROD: 1 NAT — the task runs private, behind the ALB.
      natGateways: isProd ? 1 : 0,
    });

    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc,
      clusterName: `${prefix}-relay-cluster`,
    });

    const logGroup = new logs.LogGroup(this, "RelayLogs", {
      logGroupName: `/ecs/${project}/relay/${appEnv}`,
      retention: isProd ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // ── Image built & published by CDK at deploy time (no manual push) ─────────
    const image = ecs.ContainerImage.fromAsset(REPO_ROOT, {
      file: "apps/relay/Dockerfile",
      target: "relay",
      platform: Platform.LINUX_ARM64, // Graviton — cheaper; built once at deploy
    });
    const containerEnv: Record<string, string> = {
      NODE_ENV: isProd ? "production" : "development",
      PORT: String(RELAY_PORT),
      CONTENT_API_URL: contentApiUrl,
    };

    // Graviton runtime for the task.
    const runtimePlatform = {
      cpuArchitecture: ecs.CpuArchitecture.ARM64,
      operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
    };

    if (isProd) {
      // ── PROD: ALB + private task ────────────────────────────────────────────
      const service = new ecsPatterns.ApplicationLoadBalancedFargateService(
        this,
        "RelayService",
        {
          cluster,
          serviceName: `${prefix}-relay`,
          desiredCount: 1, // state-in-memory → single task (see class doc)
          cpu: 512,
          memoryLimitMiB: 1024,
          runtimePlatform,
          publicLoadBalancer: true,
          listenerPort: 80,
          protocol: elbv2.ApplicationProtocol.HTTP, // TODO: 443 + ACM cert for wss://
          // WebSocket connections are long-lived; the default 60s ALB idle
          // timeout would drop them. The app also sends ping/pong.
          idleTimeout: cdk.Duration.hours(1),
          circuitBreaker: { enable: true, rollback: true },
          minHealthyPercent: 100,
          taskImageOptions: {
            image,
            containerName: "relay",
            containerPort: RELAY_PORT,
            environment: containerEnv,
            logDriver: ecs.LogDrivers.awsLogs({
              streamPrefix: `${prefix}-relay`,
              logGroup,
            }),
          },
        }
      );

      service.targetGroup.configureHealthCheck({
        path: "/health",
        healthyHttpCodes: "200",
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
      });
      // Drop in-flight WS fast on deploy; the phone reconnects (backoff + viewerId).
      service.targetGroup.setAttribute(
        "deregistration_delay.timeout_seconds",
        "30"
      );

      new cdk.CfnOutput(this, "RelayLoadBalancerDns", {
        value: service.loadBalancer.loadBalancerDnsName,
        description: "Relay ALB DNS - point clients at ws://<dns> (add TLS for wss)",
        exportName: `${prefix}-relay-lb-dns`,
      });
    } else {
      // ── DEV: single public-IP Fargate task, no ALB, no NAT ──────────────────
      const taskDef = new ecs.FargateTaskDefinition(this, "RelayTask", {
        cpu: 256,
        memoryLimitMiB: 512,
        family: `${prefix}-relay`,
        runtimePlatform,
      });
      taskDef.addContainer("relay", {
        image,
        environment: containerEnv,
        portMappings: [{ containerPort: RELAY_PORT }],
        logging: ecs.LogDrivers.awsLogs({
          streamPrefix: `${prefix}-relay`,
          logGroup,
        }),
      });

      const sg = new ec2.SecurityGroup(this, "RelaySg", {
        vpc,
        // GroupDescription must be ASCII-only (EC2 rejects non-ASCII like em-dashes).
        description: "Relay WS - inbound relay port from anywhere (dev)",
        allowAllOutbound: true,
      });
      sg.addIngressRule(
        ec2.Peer.anyIpv4(),
        ec2.Port.tcp(RELAY_PORT),
        "relay websocket (dev)"
      );

      const service = new ecs.FargateService(this, "RelayService", {
        cluster,
        serviceName: `${prefix}-relay`,
        taskDefinition: taskDef,
        desiredCount: 1,
        assignPublicIp: true,
        vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
        securityGroups: [sg],
        circuitBreaker: { enable: true, rollback: true },
        // Stop the old task before starting the new one: the relay is a single
        // stateful writer, so we never want two tasks with divergent room state.
        // Brief downtime on deploy is fine — the phone reconnects (backoff + viewerId).
        minHealthyPercent: 0,
      });

      new cdk.CfnOutput(this, "RelayClusterName", {
        value: cluster.clusterName,
        exportName: `${prefix}-relay-cluster-name`,
      });
      new cdk.CfnOutput(this, "RelayServiceName", {
        value: service.serviceName,
        exportName: `${prefix}-relay-service-name`,
      });
      new cdk.CfnOutput(this, "RelayDiscovery", {
        value: `bash infra/scripts/relay-ip.sh ${cluster.clusterName} ${service.serviceName}`,
        description:
          "The dev task's public IP is ephemeral - run this to resolve the current relay IP.",
      });
    }
  }
}
