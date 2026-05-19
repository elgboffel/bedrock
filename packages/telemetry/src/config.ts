/**
 * Telemetry configuration service.
 *
 * Follows the same composable Config pattern used by ServerConfig and
 * LogConfig in @repo/server. Each field reads from an environment
 * variable via Effect's Config module, which validates types and provides
 * clear error messages when required values are missing or invalid.
 *
 * Required fields (no default — app fails fast if missing):
 *   OTEL_SERVICE_NAME
 *
 * Optional fields (have sensible defaults):
 *   OTEL_EXPORTER_ENDPOINT (undefined — no OTLP export unless set)
 *   OTEL_SAMPLING_RATE     (1.0 — sample every trace in dev)
 *   OTEL_ENABLED           (true — telemetry on by default)
 */
import { Config, Effect, Option } from "effect";

/**
 * TelemetryConfig -- composable telemetry configuration.
 *
 * Usage:
 *   const config = yield* TelemetryConfig;
 *   // config.serviceName        -> string  (required)
 *   // config.exporterEndpoint   -> string | undefined
 *   // config.samplingRate       -> number  (0-1, default 1.0)
 *   // config.enabled            -> boolean (default true)
 *
 * The sampling rate controls what fraction of traces are recorded.
 * 1.0 means "keep every trace" (good for dev), 0.1 means "keep 10%"
 * (common in high-traffic production). Values outside 0-1 are rejected
 * at startup with a clear error message.
 */
export const TelemetryConfig = Effect.all({
  serviceName: Config.string("OTEL_SERVICE_NAME"),
  exporterEndpoint: Config.string("OTEL_EXPORTER_ENDPOINT").pipe(
    Config.option,
    Config.map(Option.getOrUndefined),
  ),
  samplingRate: Config.number("OTEL_SAMPLING_RATE").pipe(
    Config.withDefault(1.0),
    Config.validate({
      message: "Sampling rate must be between 0 and 1",
      validation: (n) => n >= 0 && n <= 1,
    }),
  ),
  enabled: Config.boolean("OTEL_ENABLED").pipe(Config.withDefault(true)),
});
