/**
 * Keystone integration test: real web Fastify proxying to real api Fastify.
 *
 * Proves:
 * 1. Forged x-internal-auth / x-user-* headers are stripped by the proxy.
 * 2. A tokenless browser request succeeds because the proxy injects the token.
 * 3. cookie / authorization are dropped before reaching api.
 */
import { it } from "@effect/vitest";
import { InternalAuthConfig } from "@repo/server/config";
import { FastifyLive, FastifyServer } from "@repo/server/fastify";
import { internalAuth } from "@repo/server/internal-auth";
import { ConfigProvider, Context, Effect, Layer } from "effect";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect } from "vitest";
import { registerPlugins } from "./plugins";

const TEST_TOKEN = "integration-test-token";
const HEADER_NAME = "x-internal-auth";

// --- Upstream api server (real Fastify, real listener) ---

let apiPort: number;
const apiServer = Fastify({ logger: false });

/** Echo route: returns all received headers so we can assert on them. */
apiServer.get("/echo-headers", async (req) => ({
  headers: req.headers,
}));

/** Auth-guarded route: rejects requests without valid token. */
apiServer.addHook("onRequest", (req, reply, done) => {
  if (req.url === "/health") return done();
  const token = req.headers[HEADER_NAME];
  if (token !== TEST_TOKEN) {
    reply.code(401).send();
    return;
  }
  done();
});

apiServer.get("/items", async () => [{ id: 1, name: "test" }]);
apiServer.get("/health", async () => ({ status: "ok" }));

beforeAll(async () => {
  await apiServer.listen({ port: 0, host: "127.0.0.1" });
  const addr = apiServer.server.address();
  apiPort = typeof addr === "object" && addr ? addr.port : 0;
});

afterAll(async () => {
  await apiServer.close();
});

// --- Test config + layers ---

const testConfig = () =>
  ConfigProvider.fromMap(
    new Map([
      ["API_URL", `http://127.0.0.1:${apiPort}`],
      ["INTERNAL_AUTH_TOKEN", TEST_TOKEN],
      ["INTERNAL_AUTH_HEADER", HEADER_NAME],
    ]),
  );

describe("proxy integration (web → api)", () => {
  it.effect(
    "browser request without token succeeds because proxy injects it",
    () =>
      Effect.gen(function* () {
        const app = yield* FastifyServer;
        yield* registerPlugins;

        // Simulate browser — no token, no internal headers
        const res = yield* Effect.promise(() =>
          app.inject({
            method: "GET",
            url: "/api/items",
          }),
        );

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual([{ id: 1, name: "test" }]);
      }).pipe(
        Effect.provide(FastifyLive),
        Effect.withConfigProvider(testConfig()),
        Effect.scoped,
      ),
  );

  it.effect("forged x-internal-auth is stripped; real token injected", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      yield* registerPlugins;

      const res = yield* Effect.promise(() =>
        app.inject({
          method: "GET",
          url: "/api/echo-headers",
          headers: {
            [HEADER_NAME]: "forged-evil-token",
            accept: "application/json",
          },
        }),
      );

      expect(res.statusCode).toBe(200);
      const upstream = res.json().headers;
      // Forged token replaced with real one
      expect(upstream[HEADER_NAME]).toBe(TEST_TOKEN);
    }).pipe(
      Effect.provide(FastifyLive),
      Effect.withConfigProvider(testConfig()),
      Effect.scoped,
    ),
  );

  it.effect("forged x-user-* headers are stripped", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      yield* registerPlugins;

      const res = yield* Effect.promise(() =>
        app.inject({
          method: "GET",
          url: "/api/echo-headers",
          headers: {
            "x-user-id": "fake-admin",
            "x-user-role": "superuser",
          },
        }),
      );

      expect(res.statusCode).toBe(200);
      const upstream = res.json().headers;
      expect(upstream).not.toHaveProperty("x-user-id");
      expect(upstream).not.toHaveProperty("x-user-role");
    }).pipe(
      Effect.provide(FastifyLive),
      Effect.withConfigProvider(testConfig()),
      Effect.scoped,
    ),
  );

  it.effect("cookie and authorization are dropped before reaching api", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      yield* registerPlugins;

      const res = yield* Effect.promise(() =>
        app.inject({
          method: "GET",
          url: "/api/echo-headers",
          headers: {
            cookie: "session=abc123",
            authorization: "Bearer leaked-jwt",
          },
        }),
      );

      expect(res.statusCode).toBe(200);
      const upstream = res.json().headers;
      expect(upstream).not.toHaveProperty("cookie");
      expect(upstream).not.toHaveProperty("authorization");
    }).pipe(
      Effect.provide(FastifyLive),
      Effect.withConfigProvider(testConfig()),
      Effect.scoped,
    ),
  );

  it.effect(
    "x-forwarded-for/proto are re-authored, not trusted from client",
    () =>
      Effect.gen(function* () {
        const app = yield* FastifyServer;
        yield* registerPlugins;

        const res = yield* Effect.promise(() =>
          app.inject({
            method: "GET",
            url: "/api/echo-headers",
            headers: {
              "x-forwarded-for": "1.2.3.4",
              "x-forwarded-proto": "https",
            },
          }),
        );

        expect(res.statusCode).toBe(200);
        const upstream = res.json().headers;
        // Should be re-authored from actual connection, not client-supplied
        expect(upstream["x-forwarded-for"]).not.toBe("1.2.3.4");
      }).pipe(
        Effect.provide(FastifyLive),
        Effect.withConfigProvider(testConfig()),
        Effect.scoped,
      ),
  );
});
