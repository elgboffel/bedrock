/**
 * API server entrypoint.
 *
 * Uses Effect to compose server infrastructure:
 * - FastifyLive: Fastify server lifecycle (create + close)
 * - DrizzleLive: Drizzle ORM database client (connection pool + typed queries)
 * - OtlpTracingLive: OpenTelemetry tracing (OTLP/HTTP when
 *   OTEL_EXPORTER_ENDPOINT is set, console otherwise)
 *
 * NodeRuntime.runMain handles SIGINT/SIGTERM and process exit.
 */

import { NodeRuntime } from "@effect/platform-node";
import { DrizzleLive } from "@repo/database/client";
import { ServerConfig } from "@repo/server/config";
import { FastifyLive, FastifyServer } from "@repo/server/fastify";
import { LoggerLive } from "@repo/server/logger";
import { RouteRunnerLive } from "@repo/server/route-runner";
import { OtlpTracingLive } from "@repo/telemetry/otlp";
import { Effect, Layer } from "effect";
import { registerRoutes } from "./routes/routes";

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
 * - FastifyLive: Fastify server with acquireRelease lifecycle
 * - DrizzleLive: Drizzle ORM client (reads DbConfig from env)
 * - OtlpTracingLive: OpenTelemetry tracing (OTLP/HTTP when
 *   OTEL_EXPORTER_ENDPOINT is set, ConsoleSpanExporter otherwise)
 */
const AppLive = Layer.mergeAll(
  FastifyLive,
  DrizzleLive,
  OtlpTracingLive,
  RouteRunnerLive,
);

/**
 * Run the program.
 *
 * Effect.scoped ensures all acquired resources (Fastify server) are
 * released when the program ends. NodeRuntime.runMain handles signals
 * and process exit.
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
