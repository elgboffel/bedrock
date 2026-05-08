/**
 * Composable configuration services for server applications.
 *
 * Effect's Config module provides declarative, validated configuration
 * that reads from environment variables (by default) and fails fast
 * with clear error messages when required values are missing or invalid.
 *
 * Each config is defined as an Effect that, when run, produces a typed
 * configuration object. Configs can be composed -- an app only pulls in
 * the config pieces it needs.
 */
import { Config, Effect } from "effect";

/**
 * ServerConfig provides the basic server binding settings.
 *
 * - SERVER_PORT: port number to listen on (default: 3000)
 * - SERVER_HOST: host/IP to bind to (default: "0.0.0.0")
 *
 * Usage:
 *   const config = yield* ServerConfig;
 *   // config.port  -> number
 *   // config.host  -> string
 */
export const ServerConfig = Effect.all({
  port: Config.integer("SERVER_PORT").pipe(Config.withDefault(3000)),
  host: Config.string("SERVER_HOST").pipe(Config.withDefault("0.0.0.0")),
});

/**
 * LogConfig provides logging configuration.
 *
 * - LOG_LEVEL: log level string (default: "info")
 * - LOG_PRETTY: enable pretty-printing (default: false)
 *
 * In production, you'll typically leave prettyPrint false for structured
 * JSON output. In development, set LOG_PRETTY=true for human-readable logs.
 */
export const LogConfig = Effect.all({
  logLevel: Config.string("LOG_LEVEL").pipe(Config.withDefault("info")),
  prettyPrint: Config.boolean("LOG_PRETTY").pipe(Config.withDefault(false)),
});
