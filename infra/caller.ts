/// <reference path="../.sst/platform/config.d.ts" />

/**
 * Caller-side security-group helpers for the internal web→backend boundary
 * (see docs/adr/001-internal-web-api-boundary.md, L1).
 *
 * A `PrivateBackend` only accepts traffic from declared callers' security
 * groups. For that to work a caller (e.g. the public `web` service) must be a
 * *member* of a stable, identifiable security group that the backend's ingress
 * rule can reference. These helpers create that SG and attach it to a service
 * without disturbing the service's existing networking (e.g. its ALB wiring).
 */

/** A security group whose only purpose is to identify a caller as an ingress source. */
export function callerSecurityGroup(name: string, vpc: sst.aws.Vpc) {
  // Egress open (callers reach backends, the DB, OTLP, etc.). No ingress rules:
  // this SG is used purely as a *source* reference, not to admit traffic.
  return new aws.ec2.SecurityGroup(`${name}SecurityGroup`, {
    vpcId: vpc.id,
    description: `SST caller identity SG for ${name}`,
    egress: [
      { fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: ["0.0.0.0/0"] },
    ],
  });
}

/**
 * A `transform.service` callback that *appends* `securityGroupId` to a
 * service's task network configuration, preserving the SST-managed default SG
 * (so ALB→task and DB access keep working) while adding the caller identity SG.
 */
export function appendSecurityGroup(securityGroupId: $util.Input<string>) {
  return (svcArgs: { networkConfiguration?: any }): undefined => {
    const nc = svcArgs.networkConfiguration as {
      securityGroups: $util.Input<$util.Input<string>[]>;
    };
    svcArgs.networkConfiguration = {
      ...nc,
      securityGroups: $resolve([nc.securityGroups, securityGroupId]).apply(
        ([existing, extra]) => [...existing, extra],
      ),
    };
    return undefined;
  };
}
