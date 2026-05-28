/**
 * Logger configuration for Effect.
 *
 * `LoggerLive` replaces Effect's default logger with `Logger.json`, which
 * emits newline-delimited JSON to stdout. Suitable for shipping straight
 * to log aggregators (Loki / Elasticsearch / Datadog) -- no third-party
 * logging backend (pino / winston / bunyan) required.
 *
 * Apps provide `LoggerLive` directly to the program (not merged into
 * the AppLive stack) so the FiberRef-based logger replacement applies
 * to the program's fiber, not just to layer construction.
 *
 * Apps must also pass `disablePrettyLogger: true` to `NodeRuntime.runMain`,
 * otherwise NodeRuntime auto-swaps `Logger.defaultLogger` for
 * `Logger.prettyLoggerDefault` at startup, which silently breaks our
 * `Logger.replace(defaultLogger, ...)` (the remove half becomes a no-op)
 * and produces duplicate log lines.
 */
import { Logger } from "effect";

export const LoggerLive = Logger.json;
