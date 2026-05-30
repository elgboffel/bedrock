/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "bedrock",
      // Protect production data; non-prod stages tear down cleanly.
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      // Region comes from the environment so `sst:bootstrap` (and CI) can set it
      // without editing this file. Defaults to eu-west-1.
      providers: {
        aws: { region: (process.env.AWS_REGION ?? "eu-west-1") as aws.Region },
      },
    };
  },
  async run() {
    const { appendSecurityGroup, callerSecurityGroup } = await import(
      "./infra/caller"
    );
    const { PrivateBackend } = await import("./infra/private-backend");

    // --- Network -----------------------------------------------------------
    const vpc = new sst.aws.Vpc("Vpc", { nat: "managed" });
    const cluster = new sst.aws.Cluster("Cluster", { vpc });

    // --- Database (RDS Postgres) ------------------------------------------
    const db = new sst.aws.Postgres("Db", { vpc });

    // App reads discrete DB_* vars (see packages/database/src/config/config.ts).
    const dbEnv = {
      DB_HOST: db.host,
      DB_PORT: $interpolate`${db.port}`,
      DB_NAME: db.database,
      DB_USER: db.username,
      DB_PASSWORD: db.password,
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
      image: { dockerfile: "apps/web/Dockerfile", context: "." },
      link: [api.service, apiToken],
      loadBalancer: {
        // Add "443/https" + a domain once an ACM cert exists.
        ports: [{ listen: "80/http", forward: "3000/http" }],
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
