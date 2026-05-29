import { it } from "@effect/vitest";
import { DB, DrizzleLive } from "@repo/database/client";
import { runMigrations } from "@repo/database/migrator";
import { FastifyLive, FastifyServer } from "@repo/server/fastify";
import { InternalAuthLive, withInternalAuth } from "@repo/server/internal-auth";
import { RouteRunnerLive } from "@repo/server/route-runner";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { ConfigProvider, Effect, Layer } from "effect";
import { afterAll, beforeAll, describe, expect } from "vitest";
import { registerHealthRoutes } from "./health";

let container: Awaited<ReturnType<PostgreSqlContainer["start"]>>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
}, 60_000);

afterAll(async () => {
  await container?.stop();
});

const TEST_TOKEN = "test-health-token";

const containerConfig = () =>
  ConfigProvider.fromMap(
    new Map([
      ["DB_HOST", container.getHost()],
      ["DB_PORT", container.getPort().toString()],
      ["DB_NAME", container.getDatabase()],
      ["DB_USER", container.getUsername()],
      ["DB_PASSWORD", container.getPassword()],
      ["INTERNAL_AUTH_TOKEN", TEST_TOKEN],
    ]),
  );

const TestLayers = Layer.mergeAll(
  DrizzleLive,
  RouteRunnerLive,
  InternalAuthLive,
).pipe(Layer.provideMerge(FastifyLive));

describe("Health routes", () => {
  it.effect("GET / returns hello world response with common package data", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      yield* registerHealthRoutes;

      const response = yield* Effect.promise(() =>
        app.inject({
          method: "GET",
          url: "/",
          headers: withInternalAuth(TEST_TOKEN),
        }),
      );

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.hello).toBe("world 2");
      expect(body.common).toBe("Hello from Common, API!");
      expect(body.constant).toBe(42);
    }).pipe(
      Effect.provide(TestLayers),
      Effect.withConfigProvider(containerConfig()),
      Effect.scoped,
    ),
  );

  it.effect("GET /health returns ok when database is reachable", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      const db = yield* DB;

      yield* runMigrations(db);
      yield* registerHealthRoutes;

      const response = yield* Effect.promise(() =>
        app.inject({ method: "GET", url: "/health" }),
      );

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe("ok");
      expect(body).toHaveProperty("timestamp");
    }).pipe(
      Effect.provide(TestLayers),
      Effect.withConfigProvider(containerConfig()),
      Effect.scoped,
    ),
  );
});
