/** Web server route registration. Routes are registered as an Effect that requires FastifyServer + RouteRunner. */

import { FastifyServer } from "@repo/server/fastify";
import { RouteRunner } from "@repo/server/route-runner";
import { Effect } from "effect";

/** Registers all web server routes. */
export const registerRoutes = Effect.gen(function* () {
  const app = yield* FastifyServer;
  const { route } = yield* RouteRunner;

  app.get(
    "/health",
    route(() =>
      Effect.succeed({
        status: "ok",
        mode:
          process.env.NODE_ENV === "production" ? "production" : "development",
      }),
    ),
  );
});
