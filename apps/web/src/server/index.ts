import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyExpress from "@fastify/express";
import fastifyProxy from "@fastify/http-proxy";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function start() {
  const isProduction = process.env.NODE_ENV === "production";
  const fastify = Fastify({
    logger: {
      level: isProduction ? "info" : "debug",
      serializers: {
        req(req) {
          return {
            method: req.method,
            url: req.url,
            hostname: req.hostname,
            remoteAddress: req.ip,
            remotePort: req.socket.remotePort,
          };
        },
      },
      ...(!isProduction && {
        transport: {
          target: "pino-pretty",
          options: {
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        },
      }),
    },
  });

  // Core Fastify routes (API proxied or handled here if needed)
  fastify.get("/health", async () => ({
    status: "ok",
    mode: isProduction ? "prod" : "dev",
  }));

  // Proxy /api/* to the API server on port 3001
  await fastify.register(async (scope) => {
    await scope.register(fastifyProxy, {
      upstream: "http://localhost:3001",
      prefix: "/api",
      rewritePrefix: "/",
      http2: false,
    });
  });

  if (isProduction) {
    // Production: Use Astro Middleware
    await fastify.register(fastifyExpress);
    // Resolve at runtime relative to dist/server-runner/ -> dist/server/entry.mjs
    const astroEntryPath = path.join(__dirname, "../server/entry.mjs");
    const { handler } = await import(/* @vite-ignore */ astroEntryPath);
    await fastify.use(handler);

    // Serve static assets
    await fastify.register(fastifyStatic, {
      root: path.join(__dirname, "../client"),
    });
  } else {
    // Development: Proxy to Astro Dev Server (HMR support)
    // We assume 'pnpm astro dev' is running or we spawn it.
    // Spawning it keeps the "single entry point" feel.
    console.log("Starting Astro Dev Server...");
    const { spawn } = await import("node:child_process");
    const astro = spawn("pnpm", ["astro", "dev"], {
      stdio: "inherit",
      shell: true,
    });

    // Cleanup astro process on exit
    process.on("SIGINT", () => astro.kill());
    process.on("SIGTERM", () => astro.kill());

    // Register Proxy
    await fastify.register(fastifyProxy, {
      upstream: "http://localhost:4321",
      prefix: "/",
      http2: false,
    });
  }

  try {
    const address = await fastify.listen({ port: 3000, host: "0.0.0.0" });
    console.log(`Fastify server running on ${address}`);
    if (!isProduction)
      console.log("Proxying to Astro at http://localhost:4321");

    const listeners = ["SIGINT", "SIGTERM", "SIGHUP"];
    for (const signal of listeners) {
      process.on(signal, async () => {
        fastify.log.info(`[${signal}] received, shutting down cleanly...`);
        await fastify.close();
        process.exit(0);
      });
    }
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
