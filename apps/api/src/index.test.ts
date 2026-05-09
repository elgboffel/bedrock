import { it } from "@effect/vitest";
import { FastifyLive, FastifyServer } from "@repo/server/fastify";
import { ConfigProvider, Effect } from "effect";
import { describe, expect } from "vitest";
import { registerRoutes } from "./routes.js";

const testConfigProvider = ConfigProvider.fromMap(new Map());

describe("API routes", () => {
  it.effect("GET / returns hello world response with common package data", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      yield* registerRoutes;

      const response = yield* Effect.promise(() =>
        app.inject({ method: "GET", url: "/" }),
      );

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.hello).toBe("world 2");
      expect(body.common).toBe("Hello from Common, API!");
      expect(body.constant).toBe(42);
    }).pipe(
      Effect.provide(FastifyLive),
      Effect.withConfigProvider(testConfigProvider),
      Effect.scoped,
    ),
  );

  it.effect("GET /item/:id returns item when found", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      yield* registerRoutes;

      const response = yield* Effect.promise(() =>
        app.inject({ method: "GET", url: "/item/1" }),
      );

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ id: "1", name: "Gravity Boots" });
    }).pipe(
      Effect.provide(FastifyLive),
      Effect.withConfigProvider(testConfigProvider),
      Effect.scoped,
    ),
  );

  it.effect("GET /item/:id returns 404 when not found", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      yield* registerRoutes;

      const response = yield* Effect.promise(() =>
        app.inject({ method: "GET", url: "/item/999" }),
      );

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: "NotFound",
        message: "Item(999) not found",
      });
    }).pipe(
      Effect.provide(FastifyLive),
      Effect.withConfigProvider(testConfigProvider),
      Effect.scoped,
    ),
  );
});
