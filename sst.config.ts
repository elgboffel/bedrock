/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "bedrock",
      // Protect production data; non-prod stages tear down cleanly.
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      // Region comes from the environment so `sst:bootstrap` (and CI) can set it
      // without editing this file. Matches the actual account region.
      providers: {
        aws: { region: (process.env.AWS_REGION ?? "eu-north-1") as aws.Region },
      },
    };
  },
  async run() {
    const { appendSecurityGroup, callerSecurityGroup } = await import(
      "./infra/caller"
    );
    const { PrivateBackend } = await import("./infra/private-backend");

    // --- Network -----------------------------------------------------------
    // Managed NAT gateway in production (HA, ~$32/mo); cheap EC2 NAT instance
    // (~$3-4/mo, single AZ, no HA) for dev and other non-prod stages.
    const vpc = new sst.aws.Vpc("Vpc", {
      nat: $app.stage === "production" ? "managed" : "ec2",
    });
    const cluster = new sst.aws.Cluster("Cluster", { vpc });

    // --- Database (RDS Postgres) ------------------------------------------
    const db = new sst.aws.Postgres("Db", {
      vpc,
      // Production: sized for real traffic with automated backups.
      // Non-prod: smallest instance, minimal retention (torn down nightly anyway).
      ...($app.stage === "production"
        ? { instance: "t4g.medium", storage: "50 GB" }
        : { instance: "t4g.micro" }),
    });

    // App reads discrete DB_* vars (see packages/database/src/config/config.ts).
    const dbEnv = {
      DB_HOST: db.host,
      DB_PORT: $interpolate`${db.port}`,
      DB_NAME: db.database,
      DB_USER: db.username,
      DB_PASSWORD: db.password,
      // RDS connections use TLS; local dev overrides to false via .env.
      DB_SSL: "true",
    };

    // --- Secrets (ADR-001 L2: one token per backend) -----------------------
    const apiToken = new sst.Secret("ApiInternalAuthToken");
    const apiPrevToken = new sst.Secret("ApiInternalAuthPreviousToken", "");

    // --- web caller identity SG -------------------------------------------
    // web must be a member of a stable SG so api can allow it as a source.
    const webSg = callerSecurityGroup("Web", vpc);

    // --- api: private backend, SG-locked to web ---------------------------
    const api = PrivateBackend("Api", {
      vpc,
      cluster,
      port: 3001,
      cpu: $app.stage === "production" ? "0.5 vCPU" : "0.25 vCPU",
      memory: $app.stage === "production" ? "1 GB" : "0.5 GB",
      image: { dockerfile: "apps/api/Dockerfile", context: "." },
      link: [db, apiToken, apiPrevToken],
      callers: [{ securityGroupId: webSg.id }],
      environment: {
        ...dbEnv,
        SERVER_PORT: "3001",
        OTEL_SERVICE_NAME: "bedrock-api",
        INTERNAL_AUTH_TOKEN: apiToken.value,
        INTERNAL_AUTH_PREVIOUS_TOKEN: apiPrevToken.value,
      },
    });

    // --- web: public front-door -------------------------------------------
    const web = new sst.aws.Service("Web", {
      cluster,
      cpu: $app.stage === "production" ? "0.5 vCPU" : "0.25 vCPU",
      memory: $app.stage === "production" ? "1 GB" : "0.5 GB",
      image: { dockerfile: "apps/web/Dockerfile", context: "." },
      link: [api.service, apiToken],
      // ECS container-level health check — catches crash-loops before the ALB
      // health check does, and works even when no ALB is attached.
      health: {
        command: [
          "CMD-SHELL",
          "curl -f http://localhost:3000/health || exit 1",
        ],
        startPeriod: "60 seconds",
        timeout: "5 seconds",
        interval: "30 seconds",
        retries: 3,
      },
      loadBalancer: {
        // TODO(https): Add "443/https" + a domain once an ACM cert exists.
        // HTTP-only is NOT suitable for production — user traffic is unencrypted.
        ports: [{ listen: "80/http", forward: "3000/http" }],
        health: {
          "3000/http": {
            path: "/health",
            interval: "30 seconds",
            healthyThreshold: 2,
            unhealthyThreshold: 3,
          },
        },
      },
      environment: {
        SERVER_PORT: "3000",
        OTEL_SERVICE_NAME: "bedrock-web",
        API_URL: $interpolate`http://${api.service.service}:3001`,
        INTERNAL_AUTH_TOKEN: apiToken.value,
      },
      transform: {
        // Append the caller identity SG; keep the default SG so the ALB can
        // still reach web's tasks.
        service: appendSecurityGroup(webSg.id),
      },
    });

    return { web: web.url };
  },
});
