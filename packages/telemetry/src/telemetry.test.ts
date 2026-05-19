import { it } from "@effect/vitest";
import {
  InMemoryLogRecordExporter,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { ConfigProvider, Effect } from "effect";
import { expect } from "vitest";
import { Metrics } from "./metrics.js";
import { makeTelemetryLayer } from "./telemetry.js";

const makeTestTelemetry = () => {
  const spanExporter = new InMemorySpanExporter();
  const metricExporter = new InMemoryMetricExporter(
    AggregationTemporality.CUMULATIVE,
  );
  const logExporter = new InMemoryLogRecordExporter();

  const spanProcessor = new SimpleSpanProcessor(spanExporter);
  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 100,
  });
  const logProcessor = new SimpleLogRecordProcessor(logExporter);

  const layer = makeTelemetryLayer({
    spanProcessor,
    metricReader,
    logProcessor,
  });

  return { spanExporter, metricExporter, logExporter, metricReader, layer };
};

const testConfig = ConfigProvider.fromMap(
  new Map([["OTEL_SERVICE_NAME", "test-telemetry"]]),
);

it.effect(
  "Telemetry Layer composes tracing + metrics + log export together",
  () =>
    Effect.gen(function* () {
      const { spanExporter, metricExporter, logExporter, metricReader, layer } =
        makeTestTelemetry();

      yield* Effect.gen(function* () {
        const metrics = yield* Metrics;

        // Tracing
        yield* Effect.void.pipe(Effect.withSpan("telemetry-test-span"));

        // Metrics
        yield* metrics.counter("telemetry.test.counter", 1);
        yield* Effect.promise(() => metricReader.forceFlush());

        // Logging
        yield* Effect.log("telemetry test log");

        // Verify all three pillars
        const spans = spanExporter.getFinishedSpans();
        expect(
          spans.find((s) => s.name === "telemetry-test-span"),
        ).toBeDefined();

        const exported = metricExporter.getMetrics();
        const allMetrics = exported
          .flatMap((rm) => rm.scopeMetrics)
          .flatMap((sm) => sm.metrics);
        expect(
          allMetrics.find(
            (m) => m.descriptor.name === "telemetry.test.counter",
          ),
        ).toBeDefined();

        const records = logExporter.getFinishedLogRecords();
        expect(records.length).toBeGreaterThan(0);
      }).pipe(Effect.provide(layer), Effect.scoped);
    }).pipe(Effect.withConfigProvider(testConfig)),
);

it.effect("Telemetry Layer provides no-op when disabled", () =>
  Effect.gen(function* () {
    const { spanExporter, metricExporter, logExporter, metricReader, layer } =
      makeTestTelemetry();

    yield* Effect.gen(function* () {
      const metrics = yield* Metrics;

      yield* Effect.void.pipe(Effect.withSpan("nope"));
      yield* metrics.counter("nope", 1);
      yield* Effect.promise(() => metricReader.forceFlush());
      yield* Effect.log("nope");

      expect(spanExporter.getFinishedSpans()).toHaveLength(0);
      expect(metricExporter.getMetrics()).toHaveLength(0);
      expect(logExporter.getFinishedLogRecords()).toHaveLength(0);
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
