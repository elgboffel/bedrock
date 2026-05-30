/**
 * Database configuration service.
 *
 * Follows the same composable Config pattern used by ServerConfig and
 * LogConfig in @repo/server. Each field reads from an environment
 * variable via Effect's Config module, which validates types and provides
 * clear error messages when required values are missing.
 *
 * Required fields (no default — app fails fast if missing):
 *   DB_NAME, DB_USER, DB_PASSWORD
 *
 * Optional fields (have sensible defaults):
 *   DB_HOST (localhost), DB_PORT (5432), DB_POOL_SIZE (10), DB_SSL (true)
 */
import { Config, Effect } from "effect";

/**
 * DbConfig -- composable database configuration.
 *
 * Usage:
 *   const config = yield* DbConfig;
 *   // config.host     -> string  (default: "localhost")
 *   // config.port     -> number  (default: 5432)
 *   // config.database -> string  (required)
 *   // config.username -> string  (required)
 *   // config.password -> string  (required)
 *   // config.poolSize -> number  (default: 10)
 */
export const DbConfig = Effect.all({
  host: Config.string("DB_HOST").pipe(Config.withDefault("localhost")),
  port: Config.integer("DB_PORT").pipe(Config.withDefault(5432)),
  database: Config.string("DB_NAME"),
  username: Config.string("DB_USER"),
  password: Config.string("DB_PASSWORD"),
  poolSize: Config.integer("DB_POOL_SIZE").pipe(Config.withDefault(10)),
  /** Enable TLS for the Postgres connection. Defaults to true (safe for RDS).
   *  Set DB_SSL=false for local dev / docker compose. */
  ssl: Config.boolean("DB_SSL").pipe(Config.withDefault(true)),
});
