/**
 * Tracing Layer for OpenTelemetry.
 *
 * This module wraps @effect/opentelemetry's NodeSdk into a Layer that
 * bridges Effect's built-in tracing with OpenTelemetry. When this Layer
 * is active, every `Effect.withSpan("name")` call produces a real OTel
 * span that can be exported to Jaeger, Grafana, Honeycomb, etc.
 *
 * How it works under the hood:
 * 1. Effect has a built-in Tracer abstraction (Effect.withSpan creates spans)
 * 2. @effect/opentelemetry provides a Tracer implementation backed by OTel
 * 3. NodeSdk.layer wires this up: it creates a TracerProvider, sets Effect's
 *    Tracer to the OTel-backed one, and manages shutdown (flushing spans)
 *
 * Two ways to use:
 * - makeTracingLayer(processor): bring your own SpanProcessor (for tests/custom)
 * - TracingLive: auto-configures from TelemetryConfig (for production apps)
 */
import { NodeSdk } from "@effect/opentelemetry";
import {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { Effect, Layer } from "effect";
import { TelemetryConfig } from "./config.js";

/**
 * Creates a Tracing Layer with a custom SpanProcessor.
 *
 * Use this in tests with InMemorySpanExporter to verify spans are produced,
 * or in production with a custom exporter setup.
 *
 * Example (test):
 *   const exporter = new InMemorySpanExporter();
 *   const layer = makeTracingLayer(new SimpleSpanProcessor(exporter));
 *
 * When OTEL_ENABLED=false, returns a no-op layer (NodeSdk.layerEmpty)
 * that satisfies the type requirements without producing any spans.
 */
export const makeTracingLayer = (spanProcessor: SpanProcessor) =>
  Layer.unwrapEffect(
    Effect.gen(function* () {
      const config = yield* TelemetryConfig;

      if (!config.enabled) {
        return NodeSdk.layerEmpty;
      }

      return NodeSdk.layer(() => ({
        resource: { serviceName: config.serviceName },
        spanProcessor,
      }));
    }),
  );

/**
 * Default Tracing Layer for production apps.
 *
 * Auto-configures from TelemetryConfig:
 * - Uses ConsoleSpanExporter (prints spans to stdout as JSON)
 * - When OTEL_EXPORTER_ENDPOINT is set, apps should use `OtlpTracingLive`
 *   from `./otlp.js`, which switches to OTLP/HTTP automatically
 *
 * Compose into your app's Layer stack:
 *   const AppLive = Layer.merge(FastifyLive, TracingLive).pipe(...);
 *
 * Then use Effect.withSpan in your handlers:
 *   Effect.succeed(data).pipe(Effect.withSpan("GET /items"))
 */
export const TracingLive = makeTracingLayer(
  new SimpleSpanProcessor(new ConsoleSpanExporter()),
);
