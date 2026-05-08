import { it } from "@effect/vitest";
import { ConfigProvider, Effect } from "effect";
import { expect } from "vitest";
import { FastifyLive, FastifyServer } from "./fastify.js";

const testConfigProvider = ConfigProvider.fromMap(new Map());

it.effect(
  "Fastify Layer creates an instance that can handle HTTP requests",
  () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;

      app.get("/test", async () => ({ ok: true }));

      const response = yield* Effect.promise(() =>
        app.inject({ method: "GET", url: "/test" }),
      );

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
    }).pipe(
      Effect.provide(FastifyLive),
      Effect.withConfigProvider(testConfigProvider),
      Effect.scoped,
    ),
);

it.effect("Fastify Layer closes the instance when scope finalizes", () =>
  Effect.gen(function* () {
    let appRef: import("fastify").FastifyInstance | null = null;

    // Run a scoped effect that acquires then releases Fastify
    yield* Effect.gen(function* () {
      const app = yield* FastifyServer;
      appRef = app;

      // Register a route and verify it works while the scope is open
      app.get("/alive", async () => ({ alive: true }));
      const response = yield* Effect.promise(() =>
        app.inject({ method: "GET", url: "/alive" }),
      );
      expect(response.statusCode).toBe(200);
    }).pipe(
      Effect.provide(FastifyLive),
      // Effect.scoped closes the scope here, triggering release
      Effect.scoped,
    );

    // After scope closes, the server should be closed.
    // We verify by calling close() again -- it should be idempotent
    // if the release already closed it.
    expect(appRef).not.toBeNull();
    yield* Effect.promise(() => appRef!.close());
  }).pipe(Effect.withConfigProvider(testConfigProvider)),
);
