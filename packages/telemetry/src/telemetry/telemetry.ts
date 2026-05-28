/**
 * Convenience Telemetry Layer.
 *
 * Composes tracing + metrics + log export into a single Layer for easy
 * consumption by applications. If you need only a subset, import and
 * compose the individual layers from tracing.ts, metrics.ts, log-export.ts.
 *
 * Usage in an app:
 *
 *   import { makeTelemetryLayer } from "@repo/telemetry/telemetry";
 *
 *   const TelemetryLive = makeTelemetryLayer({
 *     spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter()),
 *     metricReader: new PeriodicExportingMetricReader({ exporter: ... }),
 *     logProcessor: new BatchLogRecordProcessor(new OTLPLogExporter()),
 *   });
 *
 *   const AppLive = Layer.merge(FastifyLive, TelemetryLive).pipe(...);
 *
 * For the common OTLP/HTTP case, see `./otlp.js` which provides
 * `OtlpTracingLive`, `OtlpMetricsLive`, `OtlpLogExportLive` Layers
 * pre-wired to TelemetryConfig.
 */
import type { LogRecordProcessor } from "@opentelemetry/sdk-logs";
import type { MetricReader } from "@opentelemetry/sdk-metrics";
import type { SpanProcessor } from "@opentelemetry/sdk-trace-base";
import { Layer } from "effect";
import { makeLogExportLayer } from "../log-export/log-export";
import { makeMetricsLayer } from "../metrics/metrics";
import { makeTracingLayer } from "../tracing/tracing";

/**
 * Options for the combined Telemetry Layer.
 *
 * Each processor/reader determines where the telemetry data goes.
 * In tests, use in-memory variants. In production, use OTLP exporters.
 */
export interface TelemetryOptions {
  readonly spanProcessor: SpanProcessor;
  readonly metricReader: MetricReader;
  readonly logProcessor: LogRecordProcessor;
}

/**
 * Creates a combined Telemetry Layer with tracing, metrics, and log export.
 *
 * How this composes:
 * - TracingLayer: sets Effect's Tracer to produce OTel spans
 * - MetricsLayer: provides the Metrics Tag for custom metric recording
 * - LogExportLayer: adds OTel log export alongside existing loggers
 *
 * All three read TelemetryConfig from the environment and respect the
 * `OTEL_ENABLED` flag (when false, all three become no-ops).
 */
export const makeTelemetryLayer = (options: TelemetryOptions) => {
  const tracingLayer = makeTracingLayer(options.spanProcessor);
  const metricsLayer = makeMetricsLayer(options.metricReader);
  const logExportLayer = makeLogExportLayer(options.logProcessor);

  return Layer.mergeAll(tracingLayer, metricsLayer, logExportLayer);
};
