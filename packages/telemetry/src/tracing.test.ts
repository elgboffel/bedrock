import { it } from "@effect/vitest";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { ConfigProvider, Effect } from "effect";
import { expect } from "vitest";
import { makeTracingLayer } from "./tracing.js";

/**
 * Helper: creates a tracing layer backed by an in-memory span exporter.
 * Returns both the layer and the exporter so tests can inspect collected spans.
 */
const makeTestTracing = () => {
  const exporter = new InMemorySpanExporter();
  const processor = new SimpleSpanProcessor(exporter);
  const layer = makeTracingLayer(processor);
  return { exporter, layer };
};

const testConfig = ConfigProvider.fromMap(
  new Map([["OTEL_SERVICE_NAME", "test-tracing"]]),
);

it.effect("Tracing Layer initializes and shuts down without errors", () =>
  Effect.gen(function* () {
    const { layer } = makeTestTracing();
    // Just providing the layer and letting the scope close tests lifecycle
    yield* Effect.void.pipe(Effect.provide(layer), Effect.scoped);
  }).pipe(Effect.withConfigProvider(testConfig)),
);

it.effect(
  "Effect.withSpan produces OTel spans when Tracing Layer is active",
  () =>
    Effect.gen(function* () {
      const { exporter, layer } = makeTestTracing();

      yield* Effect.gen(function* () {
        // Run an effect wrapped in a span
        yield* Effect.void.pipe(Effect.withSpan("test-operation"));

        // SimpleSpanProcessor exports synchronously on span end,
        // so spans should be available immediately
        const spans = exporter.getFinishedSpans();
        expect(spans.length).toBeGreaterThanOrEqual(1);

        const span = spans.find((s) => s.name === "test-operation");
        expect(span).toBeDefined();
        expect(span?.resource.attributes["service.name"]).toBe("test-tracing");
      }).pipe(Effect.provide(layer), Effect.scoped);
    }).pipe(Effect.withConfigProvider(testConfig)),
);

it.effect("Effect.withSpan captures nested spans sharing the same trace", () =>
  Effect.gen(function* () {
    const { exporter, layer } = makeTestTracing();

    yield* Effect.gen(function* () {
      yield* Effect.void.pipe(
        Effect.withSpan("child-op"),
        Effect.withSpan("parent-op"),
      );

      const spans = exporter.getFinishedSpans();
      const parent = spans.find((s) => s.name === "parent-op");
      const child = spans.find((s) => s.name === "child-op");
      expect(parent).toBeDefined();
      expect(child).toBeDefined();

      // Both spans should share the same traceId
      expect(child?.spanContext().traceId).toBe(parent?.spanContext().traceId);
    }).pipe(Effect.provide(layer), Effect.scoped);
  }).pipe(Effect.withConfigProvider(testConfig)),
);

it.effect("Tracing Layer produces no spans when OTEL_ENABLED=false", () =>
  Effect.gen(function* () {
    const { exporter, layer } = makeTestTracing();

    yield* Effect.gen(function* () {
      yield* Effect.void.pipe(Effect.withSpan("should-not-appear"));

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(0);
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

it.effect("Tracing Layer runs program normally when disabled", () =>
  Effect.gen(function* () {
    const { layer } = makeTestTracing();

    const result = yield* Effect.succeed("hello").pipe(
      Effect.withSpan("ignored-span"),
      Effect.provide(layer),
      Effect.scoped,
    );
    expect(result).toBe("hello");
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
