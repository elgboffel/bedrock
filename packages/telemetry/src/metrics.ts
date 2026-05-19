/**
 * Metrics Layer for OpenTelemetry.
 *
 * Provides a `Metrics` service Tag for recording custom OpenTelemetry
 * metrics (counters, histograms, gauges) from within Effect programs.
 *
 * How it works:
 * 1. MeterProvider is created from @opentelemetry/sdk-metrics with a
 *    MetricReader (determines where metrics are exported)
 * 2. A Meter is created from the provider, scoped to the service name
 * 3. The Metrics Tag wraps the Meter in an Effect-friendly interface
 * 4. On scope finalization, the MeterProvider is shut down (flushes data)
 *
 * Two ways to use:
 * - makeMetricsLayer(reader): bring your own MetricReader (for tests/custom)
 * - Import and compose with your app's Layer stack
 *
 * Example:
 *   const metrics = yield* Metrics;
 *   yield* metrics.counter("http.requests", 1, { method: "GET" });
 *   yield* metrics.histogram("http.latency", 42.5);
 */
import type { Attributes } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { MeterProvider, type MetricReader } from "@opentelemetry/sdk-metrics";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { Context, Effect, Layer } from "effect";
import { TelemetryConfig } from "./config.js";

/**
 * The MetricsService interface provides methods to record custom
 * OpenTelemetry metrics (counters, histograms, gauges).
 *
 * Counters track cumulative values that only go up (e.g. request count).
 * Histograms track distributions (e.g. response latency).
 * Gauges track current values that can go up or down (e.g. active connections).
 */
export interface MetricsService {
  readonly counter: (
    name: string,
    value?: number,
    attributes?: Attributes,
  ) => Effect.Effect<void>;
  readonly histogram: (
    name: string,
    value: number,
    attributes?: Attributes,
  ) => Effect.Effect<void>;
  readonly gauge: (
    name: string,
    value: number,
    attributes?: Attributes,
  ) => Effect.Effect<void>;
}

/**
 * Tag for the Metrics service.
 *
 * In Effect, a Tag is a typed key for dependency injection.
 * When you write `yield* Metrics`, Effect looks up this Tag
 * in the current context and gives you the MetricsService.
 */
export class Metrics extends Context.Tag("@repo/telemetry/Metrics")<
  Metrics,
  MetricsService
>() {}

/** No-op metrics service used when telemetry is disabled. */
const noopMetrics: MetricsService = {
  counter: () => Effect.void,
  histogram: () => Effect.void,
  gauge: () => Effect.void,
};

/**
 * Creates a Metrics Layer backed by the given MetricReader.
 *
 * The MetricReader determines where metrics go:
 * - In tests: InMemoryMetricExporter + PeriodicExportingMetricReader
 * - In production: OTLPMetricExporter + PeriodicExportingMetricReader
 *
 * When `OTEL_ENABLED=false`, provides a no-op service that silently
 * discards all recorded metrics.
 */
export const makeMetricsLayer = (metricReader: MetricReader) =>
  Layer.unwrapEffect(
    Effect.gen(function* () {
      const config = yield* TelemetryConfig;

      if (!config.enabled) {
        return Layer.succeed(Metrics, noopMetrics);
      }

      const resource = resourceFromAttributes({
        [ATTR_SERVICE_NAME]: config.serviceName,
      });

      const meterProvider = new MeterProvider({
        resource,
        readers: [metricReader],
      });

      const meter = meterProvider.getMeter(config.serviceName);

      const service: MetricsService = {
        counter: (name, value = 1, attributes) =>
          Effect.sync(() => {
            meter.createCounter(name).add(value, attributes);
          }),
        histogram: (name, value, attributes) =>
          Effect.sync(() => {
            meter.createHistogram(name).record(value, attributes);
          }),
        gauge: (name, value, attributes) =>
          Effect.sync(() => {
            meter.createGauge(name).record(value, attributes);
          }),
      };

      return Layer.scoped(
        Metrics,
        Effect.acquireRelease(Effect.succeed(service), () =>
          Effect.promise(() => meterProvider.shutdown()),
        ),
      );
    }),
  );
