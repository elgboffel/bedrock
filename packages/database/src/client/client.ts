/**
 * Drizzle + Effect PostgreSQL connection Layer.
 *
 * Provides a managed Drizzle ORM instance via Effect's Layer system.
 * Uses `drizzle-orm/effect-postgres` for native Effect integration
 * with `@effect/sql-pg` as the underlying driver.
 *
 * Usage:
 *
 *   import { DB, DrizzleLive } from "@repo/database/client";
 *   import { items } from "@repo/database/schema";
 *
 *   const program = Effect.gen(function* () {
 *     const db = yield* DB;
 *     const rows = yield* db.select().from(items);
 *   });
 *
 *   program.pipe(Effect.provide(DrizzleLive), Effect.scoped, ...);
 */

import { PgClient } from "@effect/sql-pg";
import * as PgDrizzle from "drizzle-orm/effect-postgres";
import { Context, Effect, Layer, Redacted } from "effect";
import { types } from "pg";
import { DbConfig } from "../config/config";
import { schema } from "../schema/schema";

/** The Drizzle database instance type. */
type DrizzleDatabase = Effect.Effect.Success<
  ReturnType<typeof PgDrizzle.makeWithDefaults<typeof schema>>
>;

/** Effect Tag for dependency injection of the Drizzle instance. */
export class DB extends Context.Tag("DB")<DB, DrizzleDatabase>() {}

/**
 * Internal Layer: configures `@effect/sql-pg` PgClient from DbConfig.
 *
 * Overrides pg's type parser for date/time types so Drizzle handles
 * parsing instead of the pg driver.
 */
const PgClientLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const config = yield* DbConfig;

    return PgClient.layer({
      host: config.host,
      port: config.port,
      database: config.database,
      username: config.username,
      password: Redacted.make(config.password),
      maxConnections: config.poolSize,
      // When SSL is enabled, use `rejectUnauthorized: false` so RDS's
      // AWS-issued certificate (not in Node's default CA store) is accepted.
      // Traffic is still encrypted — this only skips CA chain verification.
      // To pin the RDS CA, set DB_SSL_CA to the path of the AWS RDS CA bundle.
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      types: {
        getTypeParser: (typeId: number, format: string | undefined) => {
          // Let Drizzle handle date/time parsing instead of pg driver
          if (
            [1184, 1114, 1082, 1186, 1231, 1115, 1185, 1187, 1182].includes(
              typeId,
            )
          ) {
            return (val: string) => val;
          }
          return types.getTypeParser(
            typeId,
            format as "text" | "binary" | undefined,
          );
        },
      },
    });
  }),
);

/**
 * Internal Layer: creates the Drizzle instance from PgClient.
 */
const DBLive = Layer.effect(
  DB,
  Effect.gen(function* () {
    return yield* PgDrizzle.makeWithDefaults({ schema });
  }),
);

/**
 * DrizzleLive — full Layer providing a managed Drizzle instance.
 *
 * Composes PgClient (connection pool) with Drizzle ORM.
 * Reads DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD from environment.
 */
export const DrizzleLive = Layer.provideMerge(DBLive, PgClientLive);
