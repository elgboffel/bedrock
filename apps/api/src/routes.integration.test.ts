import { it } from "@effect/vitest";
import { DB, DrizzleLive } from "@repo/database/client";
import { runMigrations } from "@repo/database/index";
import { items } from "@repo/database/schema/index";
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
 * stack composes FastifyLive + DrizzleLive so routes can access
 * both the HTTP server and the Drizzle database client.
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
 * Layer stack for integration tests: Fastify + Drizzle.
 * Merging gives the Effect context both FastifyServer and DB.
 */
const TestLayers = Layer.merge(FastifyLive, DrizzleLive);

describe("API database routes", () => {
  it.effect("GET /db/health returns ok when database is reachable", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      const db = yield* DB;

      yield* runMigrations(db);
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

  it.effect("GET /db/items returns items from database after migration", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      const db = yield* DB;

      yield* runMigrations(db);

      // Seed test data via Drizzle typed API
      yield* db
        .insert(items)
        .values([{ name: "Gravity Boots" }, { name: "Hover Board" }]);

      yield* registerRoutes;
      yield* registerDbRoutes;

      const response = yield* Effect.promise(() =>
        app.inject({ method: "GET", url: "/db/items" }),
      );

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveLength(2);
      expect(body[0]).toHaveProperty("id");
      expect(body[0]).toHaveProperty("name");
      expect(body.map((i: { name: string }) => i.name)).toContain(
        "Gravity Boots",
      );
      expect(body.map((i: { name: string }) => i.name)).toContain(
        "Hover Board",
      );
    }).pipe(
      Effect.provide(TestLayers),
      Effect.withConfigProvider(containerConfig()),
      Effect.scoped,
    ),
  );
});
