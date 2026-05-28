/**
 * Web server entrypoint.
 *
 * This is the main entry point for the web application. It uses Effect
 * to compose all the server infrastructure:
 *
 * - FastifyLive: manages the Fastify server lifecycle (create + close)
 * - ServerConfig / LogConfig / ApiConfig: validated environment configuration
 * - registerPlugins: registers proxy, static, and SSR middleware
 * - registerRoutes: registers the health endpoint and other routes
 *
 * In development mode, the Astro dev server is managed as a Command Layer —
 * it spawns on startup and is killed automatically on shutdown.
 *
 * NodeRuntime.runMain is the top-level runner that:
 * 1. Executes the Effect program
 * 2. Handles SIGINT/SIGTERM signals automatically
 * 3. Exits the process with the appropriate code on completion
 *
 * This replaces the previous pattern of:
 *   async function start() { try { ... } catch { process.exit(1) } }
 *   process.on("SIGINT", ...)
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import fastifyExpress from "@fastify/express";
import fastifyProxy from "@fastify/http-proxy";
import fastifyStatic from "@fastify/static";
import { ServerConfig } from "@repo/server/config";
import { FastifyLive, FastifyServer } from "@repo/server/fastify";
import { LoggerLive } from "@repo/server/logger";
import { RouteRunnerLive } from "@repo/server/route-runner";
import { TracingLive } from "@repo/telemetry/tracing";
import { Effect, Layer } from "effect";
import { AstroDevLive } from "./astro-dev/astro-dev";
import { registerPlugins } from "./plugins/plugins";
import { registerRoutes } from "./routes/routes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";

/**
 * Wrap a Fastify operation in a real Promise.
 *
 * Fastify's .register() and similar methods return a FastifyInstance which
 * is PromiseLike (has .then) but NOT a real Promise. Worse, .then is a
 * one-shot: after the first .then() call, it's removed from the instance.
 * Effect.promise calls .then() internally, which consumes it — so subsequent
 * Effect.promise(() => app.register(...)) calls fail with
 * "evaluate(...).then is not a function".
 *
 * Wrapping with async/await produces a real Promise that Effect.promise
 * can always call .then() on safely.
 */
const fastifyOp = <T>(fn: () => PromiseLike<T>): Effect.Effect<T> =>
  Effect.promise(async () => await fn());

/**
 * The main application Effect.
 *
 * Effect.gen is like an async function, but for Effects.
 * `yield*` is like `await` — it runs an Effect and gives you the result.
 */
const program = Effect.gen(function* () {
  const app = yield* FastifyServer;
  const config = yield* ServerConfig;

  // Register API proxy plugin (uses ApiConfig for upstream URL)
  yield* registerPlugins;

  if (isProduction) {
    // Production: register Astro SSR middleware and static file serving.
    // @fastify/express provides Express middleware compatibility so we can
    // mount Astro's SSR handler directly.
    yield* fastifyOp(() => app.register(fastifyExpress));
    const astroEntryPath = path.join(__dirname, "../server/entry.mjs");
    const { handler } = yield* Effect.promise(
      () => import(/* @vite-ignore */ astroEntryPath),
    );
    yield* fastifyOp(() => app.use(handler));

    // Serve Astro's built client-side assets (JS, CSS, images)
    yield* fastifyOp(() =>
      app.register(fastifyStatic, {
        root: path.join(__dirname, "../client"),
      }),
    );
  } else {
    // Development: proxy all non-API requests to the Astro dev server
    // running on port 4321. The Astro dev process itself is managed by
    // the AstroDevLive Layer (started automatically, killed on shutdown).
    yield* fastifyOp(() =>
      app.register(fastifyProxy, {
        upstream: "http://localhost:4321",
        prefix: "/",
        http2: false,
      }),
    );
  }

  // Register routes (health endpoint, etc.)
  yield* registerRoutes;

  // Start listening for requests
  yield* Effect.promise(() =>
    app.listen({ port: config.port, host: config.host }),
  );

  yield* Effect.logInfo(
    `Web server listening on ${config.host}:${config.port}`,
  );

  // Keep the server running until interrupted (SIGINT/SIGTERM).
  // Effect.never creates an Effect that never completes. When a signal
  // arrives, NodeRuntime.runMain interrupts this Effect, which triggers
  // scope finalization (closing Fastify, killing Astro dev process).
  yield* Effect.never;
});

/**
 * The application Layer stack.
 *
 * In development mode, we include the AstroDevLive Layer which manages
 * the Astro dev child process. In production, we skip it since Astro
 * is handled as SSR middleware instead.
 *
 * Layer composition:
 * - FastifyLive: Fastify server with acquireRelease lifecycle
 * - TracingLive: OpenTelemetry tracing (Effect.withSpan -> OTel spans)
 * - NodeContext.layer: provides CommandExecutor for child processes
 *
 * Set OTEL_SERVICE_NAME=web in environment for proper span attribution.
 */
const BaseLayers = Layer.mergeAll(FastifyLive, TracingLive, RouteRunnerLive);

const AppLive = isProduction
  ? BaseLayers
  : Layer.merge(BaseLayers, AstroDevLive).pipe(
      Layer.provide(NodeContext.layer),
    );

/**
 * Run the program.
 *
 * Effect.scoped ensures all acquired resources (Fastify server, child
 * processes) are released when the program ends. NodeRuntime.runMain
 * handles signals and process exit — no manual process.on or process.exit.
 */
// LoggerLive is provided directly to the program (not merged into AppLive)
// so the FiberRef-based logger replacement applies to the program's fiber.
//
// `disablePrettyLogger: true` stops NodeRuntime from auto-swapping the
// default logger for `Logger.prettyLoggerDefault` at startup. Without
// this, our `Logger.replace(defaultLogger, ...)` inside LoggerLive becomes
// a no-op remove + add, leaving both loggers active and producing
// duplicate output.
program.pipe(
  Effect.provide(AppLive),
  Effect.provide(LoggerLive),
  Effect.scoped,
  (effect) => NodeRuntime.runMain(effect, { disablePrettyLogger: true }),
);
