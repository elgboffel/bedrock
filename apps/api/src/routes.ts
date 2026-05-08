/**
 * API route registration.
 *
 * Routes are defined as an Effect that requires a FastifyServer in its
 * context (the R type parameter). When this Effect runs, it registers
 * all routes on the Fastify instance.
 *
 * This separation from index.ts allows routes to be tested independently
 * using Fastify's inject() method without starting a real server.
 */

import { COMMON_CONSTANT, sayHello } from "@repo/common/utils";
import { FastifyServer } from "@repo/server/fastify";
import { Effect } from "effect";

/**
 * Registers all API routes on the Fastify instance.
 *
 * The `yield* FastifyServer` line tells Effect: "I need the FastifyServer
 * service to run." Effect's type system tracks this requirement -- if you
 * forget to provide the FastifyLive Layer, you'll get a compile error.
 */
export const registerRoutes = Effect.gen(function* () {
  const app = yield* FastifyServer;

  app.get("/", async (_request, _reply) => {
    return {
      hello: "world 2",
      common: sayHello("API"),
      constant: COMMON_CONSTANT,
    };
  });
});
