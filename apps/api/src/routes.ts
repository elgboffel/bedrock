/**
 * API route registration.
 *
 * Routes are defined as an Effect that requires a FastifyServer in its
 * context (the R type parameter). When this Effect runs, it registers
 * all routes on the Fastify instance.
 *
 * This separation from index.ts allows routes to be tested independently
 * using Fastify's inject() method without starting a real server.
 *
 * Each route handler uses `effectRoute` -- the adapter that converts
 * Effect-returning functions into Fastify handlers. This means:
 * - Success values become 200 JSON responses
 * - Typed errors (like NotFound) become appropriate HTTP error responses
 * - Unexpected defects become generic 500 responses
 */

import { COMMON_CONSTANT, sayHello } from "@repo/common/utils";
import { effectRoute } from "@repo/server/effect-route";
import { NotFound } from "@repo/server/errors";
import { FastifyServer } from "@repo/server/fastify";
import { Effect } from "effect";

/**
 * Simple in-memory "database" for demonstrating typed error handling.
 * In a real app, this would be a database query via an Effect service.
 */
const items: Record<string, { id: string; name: string }> = {
  "1": { id: "1", name: "Gravity Boots" },
  "2": { id: "2", name: "Hover Board" },
};

/**
 * Registers all API routes on the Fastify instance.
 *
 * The `yield* FastifyServer` line tells Effect: "I need the FastifyServer
 * service to run." Effect's type system tracks this requirement -- if you
 * forget to provide the FastifyLive Layer, you'll get a compile error.
 */
export const registerRoutes = Effect.gen(function* () {
  const app = yield* FastifyServer;

  /**
   * GET / -- basic health/info endpoint.
   *
   * Uses effectRoute to wrap the handler. The Effect.succeed call means
   * this route can never fail with a typed error -- it always returns 200.
   */
  app.get(
    "/",
    effectRoute(() =>
      Effect.succeed({
        hello: "world 2",
        common: sayHello("API"),
        constant: COMMON_CONSTANT,
      }),
    ),
  );

  /**
   * GET /item/:id -- demonstrates typed error handling.
   *
   * If the item exists, returns it as 200 JSON.
   * If not, fails with NotFound -- which effectRoute maps to a 404 response.
   * This proves the full typed-error-to-HTTP pipeline end-to-end.
   */
  app.get(
    "/item/:id",
    effectRoute((request) => {
      const { id } = request.params as { id: string };
      const item = items[id];

      if (item) {
        return Effect.succeed(item);
      }

      return Effect.fail(new NotFound({ resource: `Item(${id})` }));
    }),
  );
});
