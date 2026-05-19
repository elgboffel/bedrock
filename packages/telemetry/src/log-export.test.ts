import { it } from "@effect/vitest";
import {
  InMemoryLogRecordExporter,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { ConfigProvider, Effect } from "effect";
import { expect } from "vitest";
import { makeLogExportLayer } from "./log-export.js";

/**
 * Helper: creates a log export layer backed by an in-memory exporter.
 */
const makeTestLogExport = () => {
  const exporter = new InMemoryLogRecordExporter();
  const processor = new SimpleLogRecordProcessor(exporter);
  const layer = makeLogExportLayer(processor);
  return { exporter, layer };
};

const testConfig = ConfigProvider.fromMap(
  new Map([["OTEL_SERVICE_NAME", "test-logs"]]),
);

it.effect("Log Export Layer initializes and shuts down without errors", () =>
  Effect.gen(function* () {
    const { layer } = makeTestLogExport();
    yield* Effect.void.pipe(Effect.provide(layer), Effect.scoped);
  }).pipe(Effect.withConfigProvider(testConfig)),
);

it.effect("Effect.log produces OTel log records when layer is active", () =>
  Effect.gen(function* () {
    const { exporter, layer } = makeTestLogExport();

    yield* Effect.gen(function* () {
      yield* Effect.log("hello from telemetry test");

      const records = exporter.getFinishedLogRecords();
      expect(records.length).toBeGreaterThan(0);

      const record = records.find(
        (r) =>
          r.body !== undefined &&
          String(r.body).includes("hello from telemetry test"),
      );
      expect(record).toBeDefined();
    }).pipe(Effect.provide(layer), Effect.scoped);
  }).pipe(Effect.withConfigProvider(testConfig)),
);

it.effect("Log Export Layer provides no-op when disabled", () =>
  Effect.gen(function* () {
    const { exporter, layer } = makeTestLogExport();

    yield* Effect.gen(function* () {
      yield* Effect.log("should not appear");

      const records = exporter.getFinishedLogRecords();
      expect(records).toHaveLength(0);
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
