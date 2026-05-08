/**
 * API server entrypoint.
 *
 * This is the main entry point for the API application. It uses Effect
 * to compose all the server infrastructure:
 *
 * - FastifyLive: manages the Fastify server lifecycle (create + close)
 * - PinoLoggerLive: routes Effect.log calls to pino
 * - ServerConfig / LogConfig: validated environment configuration
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

import { NodeRuntime } from "@effect/platform-node";
import { ServerConfig } from "@repo/server/config";
import { FastifyLive, FastifyServer } from "@repo/server/fastify";
import { PinoLoggerLive } from "@repo/server/logger";
import { ConfigProvider, Effect, Layer } from "effect";
import { registerRoutes } from "./routes.js";

/**
 * The main application Effect.
 *
 * Effect.gen is like an async function, but for Effects.
 * `yield*` is like `await` -- it runs an Effect and gives you the result.
 * The difference: Effect tracks errors and dependencies in the type system.
 */
const program = Effect.gen(function* () {
  const app = yield* FastifyServer;
  const config = yield* ServerConfig;

  // Register all API routes
  yield* registerRoutes;

  // Start listening -- this is the only place we call listen()
  yield* Effect.promise(() =>
    app.listen({ port: config.port, host: config.host }),
  );

  yield* Effect.logInfo(
    `API server listening on ${config.host}:${config.port}`,
  );

  // Keep the server running until interrupted (SIGINT/SIGTERM).
  // Effect.never creates an Effect that never completes, so the
  // program stays alive. When a signal arrives, NodeRuntime.runMain
  // interrupts this Effect, which triggers scope finalization
  // (closing Fastify via the Layer's release function).
  yield* Effect.never;
});

/**
 * The application Layer stack.
 *
 * Layers are composed with Layer.merge (provide both) and Layer.provide
 * (wire dependencies). This builds a dependency graph that Effect
 * resolves automatically.
 */
const AppLive = FastifyLive.pipe(Layer.provide(PinoLoggerLive));

/**
 * Run the program.
 *
 * Effect.scoped ensures all acquired resources (Fastify server) are
 * released when the program ends. NodeRuntime.runMain handles signals
 * and process exit.
 */
program.pipe(Effect.provide(AppLive), Effect.scoped, NodeRuntime.runMain);
