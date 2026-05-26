import { it } from "@effect/vitest";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { ConfigProvider, Effect } from "effect";
import { expect } from "vitest";
import { Metrics, makeMetricsLayer } from "./metrics.js";

/**
 * Helper: creates a metrics layer backed by in-memory exporter.
 * Uses a short export interval to avoid needing to wait.
 */
const makeTestMetrics = () => {
  const exporter = new InMemoryMetricExporter(
    AggregationTemporality.CUMULATIVE,
  );
  const reader = new PeriodicExportingMetricReader({
    exporter,
    exportIntervalMillis: 100,
  });
  const layer = makeMetricsLayer(reader);
  return { exporter, reader, layer };
};

const testConfig = ConfigProvider.fromMap(
  new Map([["OTEL_SERVICE_NAME", "test-metrics"]]),
);

it.effect("Metrics Layer initializes and shuts down without errors", () =>
  Effect.gen(function* () {
    const { layer } = makeTestMetrics();
    yield* Effect.void.pipe(Effect.provide(layer), Effect.scoped);
  }).pipe(Effect.withConfigProvider(testConfig)),
);

it.effect("Metrics counter records a value", () =>
  Effect.gen(function* () {
    const { exporter, reader, layer } = makeTestMetrics();

    yield* Effect.gen(function* () {
      const metrics = yield* Metrics;

      yield* metrics.counter("test.requests", 1);
      yield* metrics.counter("test.requests", 3);

      // Force a collection cycle so metrics are exported
      yield* Effect.promise(() => reader.forceFlush());

      const exported = exporter.getMetrics();
      expect(exported.length).toBeGreaterThan(0);

      const scopeMetrics = exported.flatMap((rm) => rm.scopeMetrics);
      const metricData = scopeMetrics.flatMap((sm) => sm.metrics);
      const counter = metricData.find(
        (m) => m.descriptor.name === "test.requests",
      );
      expect(counter).toBeDefined();
    }).pipe(Effect.provide(layer), Effect.scoped);
  }).pipe(Effect.withConfigProvider(testConfig)),
);

it.effect("Metrics histogram records a value", () =>
  Effect.gen(function* () {
    const { exporter, reader, layer } = makeTestMetrics();

    yield* Effect.gen(function* () {
      const metrics = yield* Metrics;

      yield* metrics.histogram("test.latency", 42.5);
      yield* metrics.histogram("test.latency", 100.0);

      yield* Effect.promise(() => reader.forceFlush());

      const exported = exporter.getMetrics();
      const scopeMetrics = exported.flatMap((rm) => rm.scopeMetrics);
      const metricData = scopeMetrics.flatMap((sm) => sm.metrics);
      const histogram = metricData.find(
        (m) => m.descriptor.name === "test.latency",
      );
      expect(histogram).toBeDefined();
    }).pipe(Effect.provide(layer), Effect.scoped);
  }).pipe(Effect.withConfigProvider(testConfig)),
);

it.effect("Metrics gauge records a value", () =>
  Effect.gen(function* () {
    const { exporter, reader, layer } = makeTestMetrics();

    yield* Effect.gen(function* () {
      const metrics = yield* Metrics;

      yield* metrics.gauge("test.connections", 5);

      yield* Effect.promise(() => reader.forceFlush());

      const exported = exporter.getMetrics();
      const scopeMetrics = exported.flatMap((rm) => rm.scopeMetrics);
      const metricData = scopeMetrics.flatMap((sm) => sm.metrics);
      const gauge = metricData.find(
        (m) => m.descriptor.name === "test.connections",
      );
      expect(gauge).toBeDefined();
    }).pipe(Effect.provide(layer), Effect.scoped);
  }).pipe(Effect.withConfigProvider(testConfig)),
);

it.effect("Metrics Layer provides no-op service when disabled", () =>
  Effect.gen(function* () {
    const { exporter, reader, layer } = makeTestMetrics();

    yield* Effect.gen(function* () {
      const metrics = yield* Metrics;

      // Should not throw even when disabled
      yield* metrics.counter("ignored", 1);
      yield* metrics.histogram("ignored", 10);
      yield* metrics.gauge("ignored", 5);

      yield* Effect.promise(() => reader.forceFlush());

      const exported = exporter.getMetrics();
      expect(exported).toHaveLength(0);
    }).pipe(Effect.provide(layer), Effect.scoped);
  }).pipe(
    Effect.withConfigProvider(
      ConfigProvider.fromMap(
        new Map([
          ["OTEL_SERVICE_NAME", "test"],
          ["OTEL_ENABLED", "false"],
        ]),
      ),
    ),
  ),
);
