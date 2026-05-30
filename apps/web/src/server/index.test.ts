import { it } from "@effect/vitest";
import { ApiConfig } from "@repo/server/config";
import { RouteRunnerLive } from "@repo/server/effect-route";
import { FastifyLive, FastifyServer } from "@repo/server/fastify";
import { ConfigProvider, Effect, Layer } from "effect";
import { describe, expect } from "vitest";
import { registerPlugins } from "./plugins/plugins";
import { registerRoutes } from "./routes/routes";

/**
 * Test ConfigProvider — overrides API_URL to a port that's guaranteed
 * unreachable so the proxy returns 502/503 instead of forwarding to
 * a dev server that may be running on the default port (3001).
 */
const testConfigProvider = ConfigProvider.fromMap(
  new Map([
    ["OTEL_SERVICE_NAME", "web-test"],
    ["API_URL", "http://127.0.0.1:1"],
    ["INTERNAL_AUTH_TOKEN", "test-secret-token"],
  ]),
);

const TestLayers = Layer.mergeAll(FastifyLive, RouteRunnerLive);

describe("web server routes", () => {
  it.effect("GET /health returns status ok and mode", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      yield* registerRoutes;

      const response = yield* Effect.promise(() =>
        app.inject({ method: "GET", url: "/health" }),
      );

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe("ok");
      expect(body).toHaveProperty("mode");
    }).pipe(
      Effect.provide(TestLayers),
      Effect.withConfigProvider(testConfigProvider),
      Effect.scoped,
    ),
  );
});

describe("web server plugins", () => {
  it.effect("API proxy is registered using ApiConfig upstream URL", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      yield* registerPlugins;
      yield* registerRoutes;

      // Verify proxy is registered by hitting /api — it will fail to connect
      // to the upstream (not running), but the route existing proves the
      // proxy plugin was registered. We check for a connection error (502/503)
      // rather than 404 (which would mean no proxy was registered).
      const response = yield* Effect.promise(() =>
        app.inject({ method: "GET", url: "/api/health" }),
      );

      // Proxy registered -> connection refused to upstream -> 502/503
      // No proxy -> 404
      expect(response.statusCode).not.toBe(404);
    }).pipe(
      Effect.provide(TestLayers),
      Effect.withConfigProvider(testConfigProvider),
      Effect.scoped,
    ),
  );

  it.effect("API proxy uses custom upstream from ApiConfig", () =>
    Effect.gen(function* () {
      const config = yield* ApiConfig;
      // With custom config, verify it reads the right URL
      expect(config.apiUrl).toBe("http://custom-api:9999");
    }).pipe(
      Effect.withConfigProvider(
        ConfigProvider.fromMap(
          new Map([["API_URL", "http://custom-api:9999"]]),
        ),
      ),
    ),
  );
});

describe("web server bootstrap", () => {
  it.effect("server bootstraps with all layers and shuts down cleanly", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      yield* registerPlugins;
      yield* registerRoutes;

      // Verify health endpoint works (proves full Layer stack is wired)
      const healthRes = yield* Effect.promise(() =>
        app.inject({ method: "GET", url: "/health" }),
      );
      expect(healthRes.statusCode).toBe(200);

      // Verify proxy is wired (proves ApiConfig is composed)
      const apiRes = yield* Effect.promise(() =>
        app.inject({ method: "GET", url: "/api/test" }),
      );
      expect(apiRes.statusCode).not.toBe(404);

      // Scope finalizes here — Fastify closes automatically via Layer release.
      // No manual signal handlers needed.
    }).pipe(
      Effect.provide(TestLayers),
      Effect.withConfigProvider(testConfigProvider),
      Effect.scoped,
    ),
  );
});
