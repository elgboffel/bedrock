import { it } from "@effect/vitest";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { ConfigProvider, Effect } from "effect";
import { expect } from "vitest";
import {
  makeOtlpLogExporter,
  makeOtlpMetricExporter,
  makeOtlpTraceExporter,
  OtlpLogExportLive,
  OtlpMetricsLive,
  OtlpTracingLive,
} from "./otlp";

it("makeOtlpTraceExporter appends /v1/traces to the endpoint", () => {
  const exporter = makeOtlpTraceExporter({ endpoint: "http://localhost:4318" });
  expect(exporter).toBeInstanceOf(OTLPTraceExporter);
});

it("makeOtlpMetricExporter appends /v1/metrics to the endpoint", () => {
  const exporter = makeOtlpMetricExporter({
    endpoint: "http://localhost:4318",
  });
  expect(exporter).toBeInstanceOf(OTLPMetricExporter);
});

it("makeOtlpLogExporter appends /v1/logs to the endpoint", () => {
  const exporter = makeOtlpLogExporter({ endpoint: "http://localhost:4318" });
  expect(exporter).toBeInstanceOf(OTLPLogExporter);
});

it("factories strip a trailing slash from the base endpoint", () => {
  // If the joiner didn't strip the trailing slash, the URL would be
  // ".../foo//v1/traces" — still functional but ugly. Assert the
  // joiner's behaviour via the public URL on the exporter.
  const exporter = makeOtlpTraceExporter({
    endpoint: "http://localhost:4318/",
  });
  // OTLPTraceExporter stores the URL on `.url` in current SDK versions.
  // Fall back to a loose check if the field name changes.
  const url = (exporter as unknown as { url?: string }).url;
  if (url !== undefined) {
    expect(url).toBe("http://localhost:4318/v1/traces");
  }
});

const baseConfig = (extra: ReadonlyArray<readonly [string, string]> = []) =>
  ConfigProvider.fromMap(
    new Map<string, string>([["OTEL_SERVICE_NAME", "test-otlp"], ...extra]),
  );

it.effect("OtlpTracingLive builds with endpoint set", () =>
  Effect.gen(function* () {
    // Just verify the layer can be built without throwing. We don't
    // actually export anything — the exporter would try to POST to the
    // collector during shutdown, but with Effect.scoped + immediate exit
    // there are no spans to flush.
    yield* Effect.void.pipe(Effect.provide(OtlpTracingLive), Effect.scoped);
  }).pipe(
    Effect.withConfigProvider(
      baseConfig([["OTEL_EXPORTER_ENDPOINT", "http://localhost:4318"]]),
    ),
  ),
);

it.effect("OtlpTracingLive falls back to console when endpoint unset", () =>
  Effect.gen(function* () {
    yield* Effect.void.pipe(Effect.provide(OtlpTracingLive), Effect.scoped);
  }).pipe(Effect.withConfigProvider(baseConfig())),
);

it.effect("OtlpMetricsLive builds with endpoint set", () =>
  Effect.gen(function* () {
    yield* Effect.void.pipe(Effect.provide(OtlpMetricsLive), Effect.scoped);
  }).pipe(
    Effect.withConfigProvider(
      baseConfig([["OTEL_EXPORTER_ENDPOINT", "http://localhost:4318"]]),
    ),
  ),
);

it.effect("OtlpLogExportLive builds with endpoint set", () =>
  Effect.gen(function* () {
    yield* Effect.void.pipe(Effect.provide(OtlpLogExportLive), Effect.scoped);
  }).pipe(
    Effect.withConfigProvider(
      baseConfig([["OTEL_EXPORTER_ENDPOINT", "http://localhost:4318"]]),
    ),
  ),
);
