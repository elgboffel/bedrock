/**
 * Web server route registration.
 *
 * Routes are defined as an Effect that requires FastifyServer in its
 * context. When this Effect runs, it registers all routes on the
 * Fastify instance.
 *
 * Each route handler uses `effectRoute` — the adapter that converts
 * Effect-returning functions into Fastify handlers. This means:
 * - Success values become 200 JSON responses
 * - Typed errors become appropriate HTTP error responses
 * - Unexpected defects become generic 500 responses
 */

import { effectRoute } from "@repo/server/effect-route";
import { FastifyServer } from "@repo/server/fastify";
import { Effect } from "effect";

/**
 * Register all web server routes.
 *
 * This is an Effect so it can access the FastifyServer from context,
 * keeping route registration composable and testable.
 */
export const registerRoutes = Effect.gen(function* () {
  const app = yield* FastifyServer;

  // Health check endpoint — returns server status and current mode.
  // Uses effectRoute so it follows the same pattern as all other routes.
  app.get(
    "/health",
    effectRoute(() =>
      Effect.succeed({
        status: "ok",
        mode:
          process.env.NODE_ENV === "production" ? "production" : "development",
      }),
    ),
  );
});
