import {
  Logger as OtelLogger,
  Resource as OtelResource,
} from "@effect/opentelemetry";
import type { LogRecordProcessor } from "@opentelemetry/sdk-logs";
import { Effect, Layer } from "effect";
import { TelemetryConfig } from "../config/config";

/**
 * Creates a Log Export Layer that bridges Effect's Logger to OTel.
 *
 * When active, Effect.log/logDebug/logInfo/etc. calls are also sent
 * to OpenTelemetry's log export pipeline, so application logs appear
 * alongside traces and metrics in the observability backend.
 *
 * This uses `Logger.layerLoggerAdd` which ADDS the OTel logger alongside
 * the existing Effect logger(s). It does NOT replace them.
 *
 * The LogRecordProcessor determines where logs go:
 * - In tests: InMemoryLogRecordExporter + SimpleLogRecordProcessor
 * - In production: OTLPLogExporter + BatchLogRecordProcessor
 *
 * When `OTEL_ENABLED=false`, provides Layer.empty (no OTel log export).
 */
export const makeLogExportLayer = (logProcessor: LogRecordProcessor) =>
  Layer.unwrapEffect(
    Effect.gen(function* () {
      const config = yield* TelemetryConfig;

      if (!config.enabled) {
        return Layer.empty;
      }

      const resourceLayer = OtelResource.layer({
        serviceName: config.serviceName,
      });

      // layerLoggerProvider creates the OTel LoggerProvider from the processor
      // layerLoggerAdd adds the OTel logger alongside existing Effect loggers
      return OtelLogger.layerLoggerAdd.pipe(
        Layer.provide(OtelLogger.layerLoggerProvider(logProcessor)),
        Layer.provide(resourceLayer),
      );
    }),
  );
