/**
 * OTLP/HTTP exporter factories and convenience Layers.
 *
 * The base package exposes Layer constructors (`makeTracingLayer`,
 * `makeMetricsLayer`, `makeLogExportLayer`) that take a SpanProcessor /
 * MetricReader / LogRecordProcessor argument. Tests pass in-memory
 * exporters; production apps need OTLP exporters. This module is the
 * "production preset": thin factories around the three OTLP/HTTP
 * exporter packages plus three ready-to-use Layers that read
 * TelemetryConfig and pick the right processor automatically.
 *
 * Two layers of API:
 *
 * 1. Factories (`makeOtlp*Exporter`) — return raw OTel exporter
 *    instances. Use these if you want to configure your own
 *    SpanProcessor / MetricReader / LogRecordProcessor.
 *
 * 2. Layers (`Otlp*Live`) — full Effect Layers wired to TelemetryConfig.
 *    Branch on `OTEL_EXPORTER_ENDPOINT`:
 *    - endpoint set:   BatchProcessor + OTLP exporter
 *    - endpoint unset: Console exporter (dev default)
 *    - OTEL_ENABLED=false: no-op (handled by underlying make*Layer)
 *
 * For apps/api, swap `TracingLive` from `./tracing.js` for `OtlpTracingLive`
 * here and the dep is wired.
 */
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import {
  BatchLogRecordProcessor,
  ConsoleLogRecordExporter,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import {
  ConsoleMetricExporter,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { Effect, Layer } from "effect";
import { TelemetryConfig } from "./config.js";
import { makeLogExportLayer } from "./log-export.js";
import { makeMetricsLayer } from "./metrics.js";
import { makeTracingLayer } from "./tracing.js";

/**
 * Options for the OTLP exporter factories.
 *
 * `endpoint` is the base URL of the OTel collector (e.g.
 * "http://localhost:4318"). The factories append the signal-specific
 * path (`/v1/traces`, `/v1/metrics`, `/v1/logs`).
 *
 * This matches the semantics of `OTEL_EXPORTER_OTLP_ENDPOINT` in the
 * OTel spec — a single base URL covers all three signals.
 */
export interface OtlpExporterOptions {
  readonly endpoint: string;
}

const joinPath = (base: string, path: string) =>
  `${base.replace(/\/$/, "")}${path}`;

/**
 * Creates an OTLP/HTTP trace exporter pointed at `{endpoint}/v1/traces`.
 *
 * Wrap in a BatchSpanProcessor before passing to `makeTracingLayer`.
 */
export const makeOtlpTraceExporter = ({ endpoint }: OtlpExporterOptions) =>
  new OTLPTraceExporter({ url: joinPath(endpoint, "/v1/traces") });

/**
 * Creates an OTLP/HTTP metric exporter pointed at `{endpoint}/v1/metrics`.
 *
 * Wrap in a PeriodicExportingMetricReader before passing to `makeMetricsLayer`.
 */
export const makeOtlpMetricExporter = ({ endpoint }: OtlpExporterOptions) =>
  new OTLPMetricExporter({ url: joinPath(endpoint, "/v1/metrics") });

/**
 * Creates an OTLP/HTTP log exporter pointed at `{endpoint}/v1/logs`.
 *
 * Wrap in a BatchLogRecordProcessor before passing to `makeLogExportLayer`.
 */
export const makeOtlpLogExporter = ({ endpoint }: OtlpExporterOptions) =>
  new OTLPLogExporter({ url: joinPath(endpoint, "/v1/logs") });

/**
 * Tracing Layer that auto-selects OTLP or Console based on config.
 *
 * - `OTEL_EXPORTER_ENDPOINT` set → BatchSpanProcessor + OTLP exporter
 * - `OTEL_EXPORTER_ENDPOINT` unset → SimpleSpanProcessor + Console exporter
 * - `OTEL_ENABLED=false` → no-op (delegated to `makeTracingLayer`)
 */
export const OtlpTracingLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const config = yield* TelemetryConfig;
    const processor = config.exporterEndpoint
      ? new BatchSpanProcessor(
          makeOtlpTraceExporter({ endpoint: config.exporterEndpoint }),
        )
      : new SimpleSpanProcessor(new ConsoleSpanExporter());
    return makeTracingLayer(processor);
  }),
);

/**
 * Metrics Layer that auto-selects OTLP or Console based on config.
 *
 * Always uses a PeriodicExportingMetricReader (10s interval); only the
 * underlying exporter changes.
 */
export const OtlpMetricsLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const config = yield* TelemetryConfig;
    const exporter = config.exporterEndpoint
      ? makeOtlpMetricExporter({ endpoint: config.exporterEndpoint })
      : new ConsoleMetricExporter();
    const reader = new PeriodicExportingMetricReader({
      exporter,
      exportIntervalMillis: 10_000,
    });
    return makeMetricsLayer(reader);
  }),
);

/**
 * Log-export Layer that auto-selects OTLP or Console based on config.
 *
 * - endpoint set   → BatchLogRecordProcessor + OTLP exporter
 * - endpoint unset → SimpleLogRecordProcessor + Console exporter
 */
export const OtlpLogExportLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const config = yield* TelemetryConfig;
    const processor = config.exporterEndpoint
      ? new BatchLogRecordProcessor(
          makeOtlpLogExporter({ endpoint: config.exporterEndpoint }),
        )
      : new SimpleLogRecordProcessor(new ConsoleLogRecordExporter());
    return makeLogExportLayer(processor);
  }),
);
