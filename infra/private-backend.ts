/// <reference path="../.sst/platform/config.d.ts" />

/**
 * PrivateBackend — a private Fargate service reachable only by declared callers.
 *
 * Implements ADR-001 L1 (network isolation, source-SG ingress):
 *   - No load balancer. Discovery via Cloud Map private DNS only.
 *   - A dedicated security group that *replaces* the permissive VPC default SG
 *     (which allows VPC-wide ingress). The backend's port is opened **only** to
 *     each declared caller's security group — no VPC-wide fallback.
 *
 * Adding a new private backend is one factory call: pass the callers and you
 * get an SG-locked service. Egress stays open so the backend can reach the DB,
 * the OTLP collector, etc. (the RDS instance sits on the VPC default SG, which
 * admits the VPC CIDR, so the backend still reaches Postgres from its VPC IP).
 */

export interface Caller {
  /** The caller's security group id — used as the ingress *source*. */
  securityGroupId: $util.Input<string>;
}

export interface PrivateBackendArgs {
  vpc: sst.aws.Vpc;
  cluster: sst.aws.Cluster;
  /** Container/listen port the backend serves on. */
  port: number;
  /** vCPU allocation (e.g. "0.25 vCPU", "0.5 vCPU"). */
  cpu?: string;
  /** Memory allocation (e.g. "0.5 GB", "1 GB"). */
  memory?: string;
  /** Docker image build inputs. */
  image: { dockerfile: string; context: string };
  /** SST resources linked into the service (secrets, db, ...). */
  link?: $util.Input<any>[];
  /** Environment variables injected into the task. */
  environment?: Record<string, $util.Input<string>>;
  /** Callers allowed to reach `port` via source-SG ingress. */
  callers: Caller[];
}

export function PrivateBackend(name: string, args: PrivateBackendArgs) {
  // Dedicated SG: egress open, **no ingress by default**. Replacing the VPC
  // default SG removes its VPC-wide ingress fallback.
  const securityGroup = new aws.ec2.SecurityGroup(`${name}SecurityGroup`, {
    vpcId: args.vpc.id,
    description: `SST PrivateBackend ${name} - source-SG ingress only`,
    egress: [
      { fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: ["0.0.0.0/0"] },
    ],
  });

  // Source-SG ingress: open the service port only to each caller's SG.
  args.callers.forEach((caller, i) => {
    new aws.vpc.SecurityGroupIngressRule(`${name}Ingress${i}`, {
      securityGroupId: securityGroup.id,
      ipProtocol: "tcp",
      fromPort: args.port,
      toPort: args.port,
      referencedSecurityGroupId: caller.securityGroupId,
      description: `Allow caller ${i} to ${name}:${args.port}`,
    });
  });

  const service = new sst.aws.Service(name, {
    cluster: args.cluster,
    cpu: args.cpu,
    memory: args.memory,
    image: args.image,
    link: args.link,
    serviceRegistry: { port: args.port }, // Cloud Map DNS, no ALB
    environment: args.environment,
    // ECS container-level health check — no ALB on private backends, so this
    // is the only mechanism to detect crash-looping containers.
    health: {
      command: [
        "CMD-SHELL",
        `curl -f http://localhost:${args.port}/health || exit 1`,
      ],
      startPeriod: "60 seconds",
      timeout: "5 seconds",
      interval: "30 seconds",
      retries: 3,
    },
    transform: {
      // Replace the permissive default VPC SG with our locked-down SG.
      // (At build time `networkConfiguration` is a plain object literal.)
      service: (svcArgs): undefined => {
        (
          svcArgs.networkConfiguration as { securityGroups: unknown }
        ).securityGroups = [securityGroup.id];
        return undefined;
      },
    },
  });

  return { service, securityGroup };
}
