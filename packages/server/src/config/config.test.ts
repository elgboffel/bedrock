import { it } from "@effect/vitest";
import { ConfigProvider, Effect, Option } from "effect";
import { expect } from "vitest";
import {
  ApiConfig,
  InternalAuthConfig,
  LogConfig,
  ServerConfig,
} from "./config";

it.effect(
  "ServerConfig loads default port 3000 and host 0.0.0.0 when no env vars set",
  () =>
    Effect.gen(function* () {
      const config = yield* ServerConfig;
      expect(config.port).toBe(3000);
      expect(config.host).toBe("0.0.0.0");
    }).pipe(
      // Provide an empty ConfigProvider so no real env vars leak in
      Effect.withConfigProvider(ConfigProvider.fromMap(new Map())),
    ),
);

it.effect(
  "ServerConfig reads SERVER_PORT and SERVER_HOST from environment",
  () =>
    Effect.gen(function* () {
      const config = yield* ServerConfig;
      expect(config.port).toBe(8080);
      expect(config.host).toBe("127.0.0.1");
    }).pipe(
      Effect.withConfigProvider(
        ConfigProvider.fromMap(
          new Map([
            ["SERVER_PORT", "8080"],
            ["SERVER_HOST", "127.0.0.1"],
          ]),
        ),
      ),
    ),
);

it.effect("LogConfig loads default logLevel 'info' when no env vars set", () =>
  Effect.gen(function* () {
    const config = yield* LogConfig;
    expect(config.logLevel).toBe("info");
  }).pipe(Effect.withConfigProvider(ConfigProvider.fromMap(new Map()))),
);

it.effect("LogConfig reads LOG_LEVEL from environment", () =>
  Effect.gen(function* () {
    const config = yield* LogConfig;
    expect(config.logLevel).toBe("debug");
  }).pipe(
    Effect.withConfigProvider(
      ConfigProvider.fromMap(new Map([["LOG_LEVEL", "debug"]])),
    ),
  ),
);

it.effect(
  "ApiConfig loads default apiUrl http://localhost:3001 when no env vars set",
  () =>
    Effect.gen(function* () {
      const config = yield* ApiConfig;
      expect(config.apiUrl).toBe("http://localhost:3001");
    }).pipe(Effect.withConfigProvider(ConfigProvider.fromMap(new Map()))),
);

it.effect("ApiConfig reads API_URL from environment", () =>
  Effect.gen(function* () {
    const config = yield* ApiConfig;
    expect(config.apiUrl).toBe("https://api.example.com");
  }).pipe(
    Effect.withConfigProvider(
      ConfigProvider.fromMap(new Map([["API_URL", "https://api.example.com"]])),
    ),
  ),
);

it.effect(
  "InternalAuthConfig reads token, previous token, and header from env",
  () =>
    Effect.gen(function* () {
      const config = yield* InternalAuthConfig;
      expect(config.token).toBe("my-secret");
      expect(Option.getOrNull(config.previousToken)).toBe("old-secret");
      expect(config.headerName).toBe("x-custom-auth");
    }).pipe(
      Effect.withConfigProvider(
        ConfigProvider.fromMap(
          new Map([
            ["INTERNAL_AUTH_TOKEN", "my-secret"],
            ["INTERNAL_AUTH_PREVIOUS_TOKEN", "old-secret"],
            ["INTERNAL_AUTH_HEADER", "x-custom-auth"],
          ]),
        ),
      ),
    ),
);

it.effect(
  "InternalAuthConfig uses default header and no previous token when not set",
  () =>
    Effect.gen(function* () {
      const config = yield* InternalAuthConfig;
      expect(config.token).toBe("tok");
      expect(Option.isNone(config.previousToken)).toBe(true);
      expect(config.headerName).toBe("x-internal-auth");
    }).pipe(
      Effect.withConfigProvider(
        ConfigProvider.fromMap(new Map([["INTERNAL_AUTH_TOKEN", "tok"]])),
      ),
    ),
);

it.effect("InternalAuthConfig fails when INTERNAL_AUTH_TOKEN is missing", () =>
  Effect.gen(function* () {
    const exit = yield* InternalAuthConfig.pipe(Effect.exit);
    expect(exit._tag).toBe("Failure");
  }).pipe(Effect.withConfigProvider(ConfigProvider.fromMap(new Map()))),
);
