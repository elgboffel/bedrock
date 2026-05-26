# `@repo/telemetry` — context

OpenTelemetry tracing, metrics, and log export as composable Effect Layers. One
config envelope drives all three. Tests use in-memory exporters; production uses
OTLP/HTTP via the helpers in `otlp.ts`.

## Vocabulary

- **`TelemetryConfig`** — single config bundle. `OTEL_SERVICE_NAME` (required),
  `OTEL_EXPORTER_ENDPOINT` (optional base URL), `OTEL_SAMPLING_RATE` (0–1,
  default 1.0), `OTEL_ENABLED` (default true). When `OTEL_ENABLED=false`, all three
  Layers become no-ops.
- **Three pillar Layers** built from low-level constructors:
  - **`makeTracingLayer(spanProcessor)`** — wraps `@effect/opentelemetry`'s NodeSdk
    so `Effect.withSpan` produces real OTel spans.
  - **`makeMetricsLayer(metricReader)`** — provides the `Metrics` Tag exposing
    `counter`, `histogram`, `gauge` methods.
  - **`makeLogExportLayer(logProcessor)`** — adds an OTel logger *alongside* the
    existing Effect logger (it does not replace pino).
- **`makeTelemetryLayer({ spanProcessor, metricReader, logProcessor })`** —
  convenience that composes all three into one Layer.
- **Console-default Layers** (`TracingLive`) — pre-wired with `ConsoleSpanExporter`
  for dev. Use the OTLP equivalents below in real apps.
- **OTLP/HTTP helpers** (`./otlp.js`):
  - **Factories**: `makeOtlpTraceExporter`, `makeOtlpMetricExporter`,
    `makeOtlpLogExporter`. Take `{ endpoint }` (base URL), append the signal path
    (`/v1/traces` etc.), return a raw OTel exporter.
  - **Layers**: `OtlpTracingLive`, `OtlpMetricsLive`, `OtlpLogExportLive`.
    Read `TelemetryConfig` and branch: endpoint set → batch processor + OTLP exporter,
    endpoint unset → console fallback, `OTEL_ENABLED=false` → no-op.
- **`Metrics`** — `Context.Tag` for the metrics service. `yield* Metrics` then call
  `metrics.counter("http.requests", 1, { method: "GET" })`.

## Key invariants

- **`OTEL_ENABLED=false` must short-circuit cleanly.** Each `make*Layer` checks the
  config and returns an empty / no-op Layer when disabled. Don't add side effects
  outside that check.
- **The OTel log Layer adds; it does not replace.** Pino remains the primary logger.
  Stacking two OTel log Layers would duplicate exports.
- **`Effect.scoped` flushes spans/metrics.** The Node SDK shuts down on scope
  release, which is when buffered telemetry actually leaves the process. A program
  that doesn't end its scope will appear to "lose" the last batch.

## Pick the right entry point

| Situation | Use |
| --- | --- |
| Production app, OTLP collector available | `OtlpTracingLive` / `OtlpMetricsLive` / `OtlpLogExportLive` from `./otlp.js`. |
| Production app, custom exporter (Jaeger, etc.) | `makeTracingLayer(new BatchSpanProcessor(yourExporter))`. |
| Tests | `makeTracingLayer(new SimpleSpanProcessor(new InMemorySpanExporter()))` — see `*.test.ts` for the full pattern. |
| Quick dev with stdout spans | `TracingLive` (console exporter). |

## Gotchas

- `TelemetryConfig` is `Effect.all`, not a Layer. It's read inside `yield*` at Layer
  construction time. No need to provide it explicitly — Effect's Config reads from
  env via `ConfigProvider`.
- OTLP exporters POST to `{endpoint}/v1/<signal>`. The factories strip a single
  trailing slash from the base; don't pass already-suffixed URLs.
