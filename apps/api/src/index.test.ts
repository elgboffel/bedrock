import { it } from "@effect/vitest";
import { FastifyLive, FastifyServer } from "@repo/server/fastify";
import { ConfigProvider, Effect } from "effect";
import { expect } from "vitest";
import { registerRoutes } from "./routes.js";

const testConfigProvider = ConfigProvider.fromMap(new Map());

it.effect("GET / returns hello world response with common package data", () =>
  Effect.gen(function* () {
    const app = yield* FastifyServer;

    // Register the app's routes on the Fastify instance
    yield* registerRoutes;

    // Test using inject (no real port needed)
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
