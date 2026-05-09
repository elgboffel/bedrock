import { it } from "@effect/vitest";
import { ConfigProvider, Effect } from "effect";
import { describe, expect } from "vitest";
import { effectRoute } from "./effect-route.js";
import { NotFound, Unauthorized } from "./errors.js";
import { FastifyLive, FastifyServer } from "./fastify.js";

const testConfigProvider = ConfigProvider.fromMap(new Map());

describe("effectRoute", () => {
  it.effect("successful Effect produces 200 JSON response", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;

      app.get(
        "/test",
        effectRoute(() => Effect.succeed({ hello: "world" })),
      );

      const response = yield* Effect.promise(() =>
        app.inject({ method: "GET", url: "/test" }),
      );

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ hello: "world" });
    }).pipe(
      Effect.provide(FastifyLive),
      Effect.withConfigProvider(testConfigProvider),
      Effect.scoped,
    ),
  );

  it.effect("typed error produces mapped HTTP response", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;

      app.get(
        "/missing",
        effectRoute(() =>
          Effect.fail(new NotFound({ resource: "Widget(42)" })),
        ),
      );

      app.get(
        "/denied",
        effectRoute(() =>
          Effect.fail(new Unauthorized({ reason: "bad token" })),
        ),
      );

      const notFoundRes = yield* Effect.promise(() =>
        app.inject({ method: "GET", url: "/missing" }),
      );
      expect(notFoundRes.statusCode).toBe(404);
      expect(notFoundRes.json()).toEqual({
        error: "NotFound",
        message: "Widget(42) not found",
      });

      const unauthorizedRes = yield* Effect.promise(() =>
        app.inject({ method: "GET", url: "/denied" }),
      );
      expect(unauthorizedRes.statusCode).toBe(401);
      expect(unauthorizedRes.json()).toEqual({
        error: "Unauthorized",
        message: "bad token",
      });
    }).pipe(
      Effect.provide(FastifyLive),
      Effect.withConfigProvider(testConfigProvider),
      Effect.scoped,
    ),
  );

  it.effect("defect (unexpected throw) produces 500", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;

      app.get(
        "/boom",
        effectRoute(() => Effect.die(new Error("something exploded"))),
      );

      const response = yield* Effect.promise(() =>
        app.inject({ method: "GET", url: "/boom" }),
      );

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        error: "InternalError",
        message: "An unexpected error occurred",
      });
    }).pipe(
      Effect.provide(FastifyLive),
      Effect.withConfigProvider(testConfigProvider),
      Effect.scoped,
    ),
  );
});
