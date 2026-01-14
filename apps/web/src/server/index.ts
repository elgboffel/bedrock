import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyExpress from "@fastify/express";
import fastifyProxy from "@fastify/http-proxy";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function start() {
  const fastify = Fastify({ logger: true });
  const isProduction = process.env.NODE_ENV === "production";

  // Core Fastify routes (API proxied or handled here if needed)
  fastify.get("/health", async () => ({
    status: "ok",
    mode: isProduction ? "prod" : "dev",
  }));

  // Dev-only: Uptime endpoint for client-side reload
  if (!isProduction) {
    const startTime = Date.now();
    fastify.get("/__dev/uptime", async () => ({
      startTime,
    }));
  }

  if (isProduction) {
    // Production: Use Astro Middleware
    await fastify.register(fastifyExpress);
    // Adjusted path: generated relative to dist/server-runner/server.js -> ../server/entry.mjs
    // Actually, Tsup outputs to dist/server-runner. Astro outputs to dist/server.
    // So relative from dist/server-runner/index.js to dist/server/entry.mjs is ../server/entry.mjs
    // BUT we are writing source code here.
    // When built, it runs from dist/server-runner/index.js.
    const { handler } = await import("../../dist/server/entry.mjs");
    await fastify.use(handler);

    // Serve static assets
    await fastify.register(fastifyStatic, {
      root: path.join(__dirname, "../../dist", "client"),
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
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
