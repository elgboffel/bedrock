import { it } from "@effect/vitest";
import { ConfigProvider, Effect } from "effect";
import { expect } from "vitest";
import { ApiConfig, LogConfig, ServerConfig } from "./config.js";

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

it.effect(
  "LogConfig loads default logLevel 'info' and prettyPrint false when no env vars set",
  () =>
    Effect.gen(function* () {
      const config = yield* LogConfig;
      expect(config.logLevel).toBe("info");
      expect(config.prettyPrint).toBe(false);
    }).pipe(Effect.withConfigProvider(ConfigProvider.fromMap(new Map()))),
);

it.effect("LogConfig reads LOG_LEVEL and LOG_PRETTY from environment", () =>
  Effect.gen(function* () {
    const config = yield* LogConfig;
    expect(config.logLevel).toBe("debug");
    expect(config.prettyPrint).toBe(true);
  }).pipe(
    Effect.withConfigProvider(
      ConfigProvider.fromMap(
        new Map([
          ["LOG_LEVEL", "debug"],
          ["LOG_PRETTY", "true"],
        ]),
      ),
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
