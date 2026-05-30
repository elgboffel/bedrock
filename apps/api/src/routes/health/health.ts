import { COMMON_CONSTANT, sayHello } from "@repo/common/utils";
import { DB } from "@repo/database/client";
import { RouteRunner } from "@repo/server/effect-route";
import { FastifyServer } from "@repo/server/fastify";
import { sql } from "drizzle-orm";
import { Effect } from "effect";

export const registerHealthRoutes = Effect.gen(function* () {
  const app = yield* FastifyServer;
  const db = yield* DB;
  const { route } = yield* RouteRunner;

  app.get(
    "/",
    route(() =>
      Effect.succeed({
        hello: "world 2",
        common: sayHello("API"),
        constant: COMMON_CONSTANT,
      }).pipe(Effect.withSpan("GET /")),
    ),
  );

  app.get(
    "/health",
    route(() =>
      Effect.gen(function* () {
        yield* db.execute(sql`SELECT 1`);
        return { status: "ok" as const, timestamp: new Date().toISOString() };
      }).pipe(Effect.withSpan("GET /health")),
    ),
  );
});
