import { it } from "@effect/vitest";
import { PostgresLive } from "@repo/database/client";
import { FastifyLive, FastifyServer } from "@repo/server/fastify";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { ConfigProvider, Effect, Layer } from "effect";
import { afterAll, beforeAll, describe, expect } from "vitest";
import { registerDbRoutes } from "./db-routes.js";
import { registerRoutes } from "./routes.js";

/**
 * Integration tests for API routes that use the database.
 *
 * A real Postgres container is spun up via Testcontainers. The Layer
 * stack composes FastifyLive + PostgresLive so routes can access
 * both the HTTP server and the database.
 */
let container: Awaited<ReturnType<PostgreSqlContainer["start"]>>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
}, 60_000);

afterAll(async () => {
  await container?.stop();
});

const containerConfig = () =>
  ConfigProvider.fromMap(
    new Map([
      ["DB_HOST", container.getHost()],
      ["DB_PORT", container.getPort().toString()],
      ["DB_NAME", container.getDatabase()],
      ["DB_USER", container.getUsername()],
      ["DB_PASSWORD", container.getPassword()],
    ]),
  );

/**
 * Layer stack for integration tests: Fastify + Postgres.
 * Merging gives the Effect context both FastifyServer and SqlClient.
 */
const TestLayers = Layer.merge(FastifyLive, PostgresLive);

describe("API database routes", () => {
  it.effect("GET /db/health returns ok when database is reachable", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      yield* registerRoutes;
      yield* registerDbRoutes;

      const response = yield* Effect.promise(() =>
        app.inject({ method: "GET", url: "/db/health" }),
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
