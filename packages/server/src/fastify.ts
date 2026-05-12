/**
 * Fastify server managed as an Effect Layer.
 *
 * This module wraps Fastify's lifecycle in Effect's resource management
 * system using `acquireRelease`. This means:
 *
 * - The Fastify instance is created when the Layer is built (acquire).
 * - When the Effect scope ends (e.g. the program shuts down), Fastify is
 *   automatically closed (release). No manual signal handlers needed.
 *
 * The Fastify instance is exposed through a "Tag" -- Effect's way of
 * doing dependency injection. Any Effect that needs Fastify declares it
 * as a requirement in its type signature (the R parameter), and the
 * Layer system provides it automatically.
 *
 * Example:
 *   const myEffect = Effect.gen(function* () {
 *     const app = yield* FastifyServer;  // gets the Fastify instance
 *     app.get("/hello", async () => ({ hello: "world" }));
 *   });
 */
import { Context, Effect, Layer } from "effect";
import Fastify, { type FastifyInstance } from "fastify";
import { LogConfig, ServerConfig } from "./config.js";

/**
 * Tag for the Fastify instance.
 *
 * In Effect, a Tag is like a typed key for dependency injection.
 * When you write `yield* FastifyServer`, Effect looks up this Tag
 * in the current context and gives you the FastifyInstance.
 */
export class FastifyServer extends Context.Tag("FastifyServer")<
  FastifyServer,
  FastifyInstance
>() {}

/**
 * Layer that manages the Fastify server lifecycle.
 *
 * - acquire: creates a Fastify instance with pino logging configured
 *   from LogConfig, but does NOT call listen() -- that's the app's job.
 * - release: calls fastify.close() to gracefully shut down.
 *
 * This is a "scoped" Layer, meaning the release runs when the
 * enclosing Effect.scoped boundary ends.
 */
export const FastifyLive = Layer.scoped(
  FastifyServer,
  Effect.gen(function* () {
    const serverConfig = yield* ServerConfig;
    const logConfig = yield* LogConfig;

    /**
     * Effect.acquireRelease takes two functions:
     * - acquire: runs once to create the resource
     * - release: runs once when the scope closes (cleanup)
     *
     * This replaces the manual try/catch + process.on("SIGINT") pattern.
     */
    const app = yield* Effect.acquireRelease(
      // Acquire: create the Fastify instance
      Effect.sync(() =>
        Fastify({
          logger: {
            level: logConfig.logLevel,
            ...(logConfig.prettyPrint
              ? { transport: { target: "pino-pretty" } }
              : {}),
          },
        }),
      ),
      // Release: close the Fastify instance gracefully.
      // Note: wrapping with async/await ensures a real Promise, since some
      // Fastify methods return PromiseLike with one-shot .then() behavior.
      (app) =>
        Effect.promise(async () => {
          await app.close();
        }).pipe(
          Effect.tap(() => Effect.logInfo("Fastify server closed gracefully")),
        ),
    );

    return app;
  }),
);
