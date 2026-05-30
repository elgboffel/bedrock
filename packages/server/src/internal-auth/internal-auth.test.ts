import { it } from "@effect/vitest";
import { ConfigProvider, Effect, Layer } from "effect";
import { describe, expect } from "vitest";
import { FastifyLive, FastifyServer } from "../fastify/fastify";
import { InternalAuthLive, withInternalAuth } from "./internal-auth";

const TEST_TOKEN = "test-secret-token";
const TEST_PREV_TOKEN = "old-secret-token";

const authConfig = (opts?: { prev?: string; header?: string }) =>
  ConfigProvider.fromMap(
    new Map([
      ["INTERNAL_AUTH_TOKEN", TEST_TOKEN],
      ...(opts?.prev
        ? [["INTERNAL_AUTH_PREVIOUS_TOKEN", opts.prev] as const]
        : []),
      ...(opts?.header ? [["INTERNAL_AUTH_HEADER", opts.header] as const] : []),
    ]),
  );

/** Minimal route so we have something behind the auth hook. */
const registerTestRoute = Effect.gen(function* () {
  const app = yield* FastifyServer;
  app.get("/items", async () => ({ ok: true }));
  app.get("/health", async () => ({ status: "ok" }));
});

const TestLayers = InternalAuthLive.pipe(Layer.provideMerge(FastifyLive));

describe("internal-auth Layer", () => {
  it.effect("rejects request without token with bare 401", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      yield* registerTestRoute;

      const res = yield* Effect.promise(() =>
        app.inject({ method: "GET", url: "/items" }),
      );

      expect(res.statusCode).toBe(401);
      expect(res.body).toBe("");
    }).pipe(
      Effect.provide(TestLayers),
      Effect.withConfigProvider(authConfig()),
      Effect.scoped,
    ),
  );

  it.effect("accepts request with valid current token", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      yield* registerTestRoute;

      const res = yield* Effect.promise(() =>
        app.inject({
          method: "GET",
          url: "/items",
          headers: withInternalAuth(TEST_TOKEN),
        }),
      );

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    }).pipe(
      Effect.provide(TestLayers),
      Effect.withConfigProvider(authConfig()),
      Effect.scoped,
    ),
  );

  it.effect("accepts request with previous (rotated) token", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      yield* registerTestRoute;

      const res = yield* Effect.promise(() =>
        app.inject({
          method: "GET",
          url: "/items",
          headers: withInternalAuth(TEST_PREV_TOKEN),
        }),
      );

      expect(res.statusCode).toBe(200);
    }).pipe(
      Effect.provide(TestLayers),
      Effect.withConfigProvider(authConfig({ prev: TEST_PREV_TOKEN })),
      Effect.scoped,
    ),
  );

  it.effect("rejects request with wrong token", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      yield* registerTestRoute;

      const res = yield* Effect.promise(() =>
        app.inject({
          method: "GET",
          url: "/items",
          headers: withInternalAuth("wrong-token"),
        }),
      );

      expect(res.statusCode).toBe(401);
      expect(res.body).toBe("");
    }).pipe(
      Effect.provide(TestLayers),
      Effect.withConfigProvider(authConfig()),
      Effect.scoped,
    ),
  );

  it.effect("duplicate auth header (string[]) -> bare 401, no 500", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      yield* registerTestRoute;

      const res = yield* Effect.promise(() =>
        app.inject({
          method: "GET",
          url: "/items",
          headers: { "x-internal-auth": [TEST_TOKEN, TEST_TOKEN] },
        }),
      );

      expect(res.statusCode).toBe(401);
      expect(res.body).toBe("");
    }).pipe(
      Effect.provide(TestLayers),
      Effect.withConfigProvider(authConfig()),
      Effect.scoped,
    ),
  );

  it.effect("mixed-case INTERNAL_AUTH_HEADER still authenticates", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      yield* registerTestRoute;

      const res = yield* Effect.promise(() =>
        app.inject({
          method: "GET",
          url: "/items",
          headers: { "x-internal-auth": TEST_TOKEN },
        }),
      );

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    }).pipe(
      Effect.provide(TestLayers),
      Effect.withConfigProvider(authConfig({ header: "X-Internal-Auth" })),
      Effect.scoped,
    ),
  );

  it.effect("/health?x=1 (query string) still bypasses auth", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      yield* registerTestRoute;

      const res = yield* Effect.promise(() =>
        app.inject({ method: "GET", url: "/health?x=1" }),
      );

      expect(res.statusCode).toBe(200);
    }).pipe(
      Effect.provide(TestLayers),
      Effect.withConfigProvider(authConfig()),
      Effect.scoped,
    ),
  );

  it.effect("/health bypasses auth without token", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      yield* registerTestRoute;

      const res = yield* Effect.promise(() =>
        app.inject({ method: "GET", url: "/health" }),
      );

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: "ok" });
    }).pipe(
      Effect.provide(TestLayers),
      Effect.withConfigProvider(authConfig()),
      Effect.scoped,
    ),
  );

  it.effect("fails to build when token config is missing (fail-closed)", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      app.get("/items", async () => ({ ok: true }));

      // Attempt to build the auth layer with no token configured
      const exit = yield* Effect.gen(function* () {
        yield* Effect.provide(
          Effect.gen(function* () {
            // This should never execute
            yield* FastifyServer;
          }),
          InternalAuthLive,
        );
      }).pipe(Effect.exit);

      expect(exit._tag).toBe("Failure");
    }).pipe(
      Effect.provide(FastifyLive),
      Effect.withConfigProvider(ConfigProvider.fromMap(new Map())),
      Effect.scoped,
    ),
  );
});
