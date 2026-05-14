/**
 * Database-backed API routes.
 *
 * These routes depend on SqlClient from the Effect context, which is
 * provided by PostgresLive in the Layer stack. They're separated from
 * the non-DB routes so that unit tests (which don't spin up a database)
 * can test the other routes independently.
 *
 * The SqlClient is yielded once in the outer Effect.gen and captured
 * via closure by each route handler. This is necessary because
 * effectRoute runs handlers with Effect.runPromiseExit (no context),
 * so handlers must have R = never.
 */

import { SqlClient } from "@effect/sql";
import { effectRoute } from "@repo/server/effect-route";
import { FastifyServer } from "@repo/server/fastify";
import { Effect } from "effect";

/**
 * Register database-backed routes on the Fastify instance.
 *
 * Requires both FastifyServer and SqlClient in the Effect context.
 */
export const registerDbRoutes = Effect.gen(function* () {
  const app = yield* FastifyServer;
  const sql = yield* SqlClient.SqlClient;

  /**
   * GET /db/health -- verifies database connectivity.
   *
   * Runs a simple SELECT 1 query through the SQL client. If the database
   * is reachable, returns { status: "ok", timestamp }. If the query fails,
   * effectRoute catches the error and returns a 500.
   *
   * This demonstrates the full database-to-HTTP pipeline:
   *   PostgresLive -> SqlClient -> route handler -> effectRoute -> HTTP
   */
  app.get(
    "/db/health",
    effectRoute(() =>
      Effect.gen(function* () {
        yield* sql`SELECT 1`;
        return { status: "ok" as const, timestamp: new Date().toISOString() };
      }),
    ),
  );
});
