import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { FirexpRelayStack } from "../lib/firexp-relay-stack";

const TEST_ENV = { account: "557690620729", region: "us-east-1" };

function buildStack(appEnv: string): Template {
  const app = new cdk.App({ context: { environment: appEnv } });
  const stack = new FirexpRelayStack(app, "TestFirexpRelayStack", {
    env: TEST_ENV,
    appEnv,
  });
  return Template.fromStack(stack);
}

describe("FirexpRelayStack synthesis", () => {
  it("synthesises in dev and prod", () => {
    expect(buildStack("dev")).toBeDefined();
    expect(buildStack("prod")).toBeDefined();
  });
});

describe("shared resources", () => {
  it("creates an ECR repo, cluster and Fargate service", () => {
    const t = buildStack("dev");
    t.resourceCountIs("AWS::ECR::Repository", 1);
    t.resourceCountIs("AWS::ECS::Cluster", 1);
    t.resourceCountIs("AWS::ECS::Service", 1);
    t.hasResourceProperties("AWS::ECR::Repository", {
      RepositoryName: "firexp-dev-relay",
    });
  });
});

describe("DEV topology (cost-optimised)", () => {
  const t = buildStack("dev");

  it("has NO NAT gateway (public subnets only)", () => {
    t.resourceCountIs("AWS::EC2::NatGateway", 0);
  });

  it("has NO load balancer", () => {
    t.resourceCountIs("AWS::ElasticLoadBalancingV2::LoadBalancer", 0);
  });

  it("assigns a public IP to the task", () => {
    t.hasResourceProperties("AWS::ECS::Service", {
      NetworkConfiguration: {
        AwsvpcConfiguration: { AssignPublicIp: "ENABLED" },
      },
    });
  });

  it("opens the relay port to the world", () => {
    t.hasResourceProperties("AWS::EC2::SecurityGroup", {
      SecurityGroupIngress: Match.arrayWith([
        Match.objectLike({ FromPort: 3001, ToPort: 3001, CidrIp: "0.0.0.0/0" }),
      ]),
    });
  });
});

describe("PROD topology (durable)", () => {
  const t = buildStack("prod");

  it("provisions a NAT gateway", () => {
    t.resourceCountIs("AWS::EC2::NatGateway", 1);
  });

  it("provisions an application load balancer", () => {
    t.hasResourceProperties("AWS::ElasticLoadBalancingV2::LoadBalancer", {
      Type: "application",
    });
  });

  it("health-checks /health on the target group", () => {
    t.hasResourceProperties("AWS::ElasticLoadBalancingV2::TargetGroup", {
      HealthCheckPath: "/health",
    });
  });
});
