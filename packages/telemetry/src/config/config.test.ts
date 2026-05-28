import { it } from "@effect/vitest";
import { ConfigProvider, Effect } from "effect";
import { expect } from "vitest";
import { TelemetryConfig } from "./config";

it.effect(
  "TelemetryConfig loads defaults: samplingRate 1.0, enabled true when only serviceName set",
  () =>
    Effect.gen(function* () {
      const config = yield* TelemetryConfig;
      expect(config.serviceName).toBe("test-service");
      expect(config.samplingRate).toBe(1.0);
      expect(config.enabled).toBe(true);
    }).pipe(
      Effect.withConfigProvider(
        ConfigProvider.fromMap(
          new Map([["OTEL_SERVICE_NAME", "test-service"]]),
        ),
      ),
    ),
);

it.effect("TelemetryConfig reads all values from environment", () =>
  Effect.gen(function* () {
    const config = yield* TelemetryConfig;
    expect(config.serviceName).toBe("my-api");
    expect(config.exporterEndpoint).toBe("http://localhost:4318");
    expect(config.samplingRate).toBe(0.5);
    expect(config.enabled).toBe(false);
  }).pipe(
    Effect.withConfigProvider(
      ConfigProvider.fromMap(
        new Map([
          ["OTEL_SERVICE_NAME", "my-api"],
          ["OTEL_EXPORTER_ENDPOINT", "http://localhost:4318"],
          ["OTEL_SAMPLING_RATE", "0.5"],
          ["OTEL_ENABLED", "false"],
        ]),
      ),
    ),
  ),
);

it.effect("TelemetryConfig fails when OTEL_SERVICE_NAME is missing", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      TelemetryConfig.pipe(
        Effect.withConfigProvider(ConfigProvider.fromMap(new Map())),
      ),
    );
    expect(exit._tag).toBe("Failure");
  }),
);

it.effect("TelemetryConfig rejects samplingRate outside 0-1 range", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      TelemetryConfig.pipe(
        Effect.withConfigProvider(
          ConfigProvider.fromMap(
            new Map([
              ["OTEL_SERVICE_NAME", "test"],
              ["OTEL_SAMPLING_RATE", "1.5"],
            ]),
          ),
        ),
      ),
    );
    expect(exit._tag).toBe("Failure");
  }),
);

it.effect("TelemetryConfig rejects negative samplingRate", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      TelemetryConfig.pipe(
        Effect.withConfigProvider(
          ConfigProvider.fromMap(
            new Map([
              ["OTEL_SERVICE_NAME", "test"],
              ["OTEL_SAMPLING_RATE", "-0.1"],
            ]),
          ),
        ),
      ),
    );
    expect(exit._tag).toBe("Failure");
  }),
);

it.effect("TelemetryConfig exporterEndpoint is undefined when not set", () =>
  Effect.gen(function* () {
    const config = yield* TelemetryConfig;
    expect(config.exporterEndpoint).toBeUndefined();
  }).pipe(
    Effect.withConfigProvider(
      ConfigProvider.fromMap(new Map([["OTEL_SERVICE_NAME", "test-service"]])),
    ),
  ),
);
