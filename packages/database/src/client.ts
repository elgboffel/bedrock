/**
 * PostgreSQL connection Layer.
 *
 * This module wraps `@effect/sql-pg` into a Layer that reads connection
 * settings from DbConfig and manages the pool lifecycle:
 *
 * - On acquisition: creates a connection pool, validates connectivity
 * - On release (scope finalization): drains and closes the pool
 *
 * The Layer provides two tags in the Effect context:
 *
 * 1. `SqlClient` (from @effect/sql) — the generic SQL client interface.
 *    Use this in most code: `const sql = yield* SqlClient.SqlClient`
 *
 * 2. `PgClient` (from @effect/sql-pg) — PostgreSQL-specific extensions
 *    (LISTEN/NOTIFY, JSON columns). Only use when you need PG features.
 *
 * How to use in your code:
 *
 *   import { SqlClient } from "@effect/sql";
 *
 *   const getUsers = Effect.gen(function* () {
 *     const sql = yield* SqlClient.SqlClient;
 *     return yield* sql`SELECT * FROM users`;
 *   });
 *
 *   // Provide the Layer in your app's Layer stack:
 *   program.pipe(Effect.provide(PostgresLive), ...);
 */

import { PgClient } from "@effect/sql-pg";
import { Config, Effect, Layer, Redacted } from "effect";
import { DbConfig } from "./config.js";

/**
 * PostgresLive — Layer providing a managed PostgreSQL connection pool.
 *
 * How this works:
 * 1. `Layer.unwrapEffect` takes an Effect that produces a Layer.
 * 2. Inside, we read DbConfig to get connection settings.
 * 3. We pass those settings to `PgClient.layer` which creates the pool.
 * 4. PgClient.layer uses acquireRelease internally — pool is created on
 *    scope open and drained/closed on scope finalization.
 *
 * The resulting Layer's error channel includes ConfigError (from reading
 * DbConfig) and SqlError (from connecting to the database).
 */
export const PostgresLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const config = yield* DbConfig;

    return PgClient.layer({
      host: config.host,
      port: config.port,
      database: config.database,
      username: config.username,
      password: Redacted.make(config.password),
      maxConnections: config.poolSize,
    });
  }),
);
