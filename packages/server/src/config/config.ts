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
 */
export const LogConfig = Effect.all({
  logLevel: Config.string("LOG_LEVEL").pipe(Config.withDefault("info")),
});

/**
 * ApiConfig provides the upstream API server URL.
 *
 * - API_URL: full URL of the API server (default: "http://localhost:3001")
 *
 * Used by the web server to proxy /api/* requests to the API server,
 * replacing the previously hardcoded URL.
 *
 * - API_TIMEOUT_MS: per-request timeout for the internal client (default: 10000)
 */
export const ApiConfig = Effect.all({
  apiUrl: Config.string("API_URL").pipe(
    Config.withDefault("http://localhost:3001"),
  ),
  timeoutMs: Config.integer("API_TIMEOUT_MS").pipe(Config.withDefault(10000)),
});

/**
 * InternalAuthConfig provides internal service-to-service auth settings.
 *
 * - INTERNAL_AUTH_TOKEN: shared secret token (required — fail-closed)
 * - INTERNAL_AUTH_PREVIOUS_TOKEN: previous token for zero-downtime rotation (optional)
 * - INTERNAL_AUTH_HEADER: header name carrying the token (default: "x-internal-auth")
 */
/** Minimum length for the shared secret — rejects trivially weak tokens. */
const MIN_TOKEN_LENGTH = 16;

export const InternalAuthConfig = Effect.all({
  token: Config.string("INTERNAL_AUTH_TOKEN").pipe(
    Config.validate({
      message: `INTERNAL_AUTH_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters`,
      validation: (value) => value.length >= MIN_TOKEN_LENGTH,
    }),
  ),
  previousToken: Config.option(Config.string("INTERNAL_AUTH_PREVIOUS_TOKEN")),
  headerName: Config.string("INTERNAL_AUTH_HEADER").pipe(
    Config.withDefault("x-internal-auth"),
  ),
});
