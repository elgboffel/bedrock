import { it } from "@effect/vitest";
import { DB, DrizzleLive } from "@repo/database/client";
import { runMigrations } from "@repo/database/migrator";
import { items } from "@repo/database/schema";
import { FastifyLive, FastifyServer } from "@repo/server/fastify";
import { InternalAuthLive, withInternalAuth } from "@repo/server/internal-auth";
import { RouteRunnerLive } from "@repo/server/route-runner";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { ConfigProvider, Effect, Layer } from "effect";
import { afterAll, beforeAll, describe, expect } from "vitest";
import { registerItemRoutes } from "./items";

let container: Awaited<ReturnType<PostgreSqlContainer["start"]>>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
}, 60_000);

afterAll(async () => {
  await container?.stop();
});

const TEST_TOKEN = "test-integration-token";

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

describe("Item routes", () => {
  it.effect("GET /items returns items from database", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      const db = yield* DB;

      yield* runMigrations(db);
      yield* db
        .insert(items)
        .values([{ name: "Gravity Boots" }, { name: "Hover Board" }]);
      yield* registerItemRoutes;

      const response = yield* Effect.promise(() =>
        app.inject({
          method: "GET",
          url: "/items",
          headers: withInternalAuth(TEST_TOKEN),
        }),
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

  it.effect("GET /items/:id returns item when found", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      const db = yield* DB;

      yield* runMigrations(db);
      const [inserted] = yield* db
        .insert(items)
        .values({ name: `Test Item ${Date.now()}` })
        .returning();
      yield* registerItemRoutes;

      const response = yield* Effect.promise(() =>
        app.inject({
          method: "GET",
          url: `/items/${inserted.id}`,
          headers: withInternalAuth(TEST_TOKEN),
        }),
      );

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: inserted.id,
        name: inserted.name,
      });
    }).pipe(
      Effect.provide(TestLayers),
      Effect.withConfigProvider(containerConfig()),
      Effect.scoped,
    ),
  );

  it.effect("GET /items/:id returns 404 when not found", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      const db = yield* DB;

      yield* runMigrations(db);
      yield* registerItemRoutes;

      const response = yield* Effect.promise(() =>
        app.inject({
          method: "GET",
          url: "/items/999",
          headers: withInternalAuth(TEST_TOKEN),
        }),
      );

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: "NotFound",
        message: "Item(999) not found",
      });
    }).pipe(
      Effect.provide(TestLayers),
      Effect.withConfigProvider(containerConfig()),
      Effect.scoped,
    ),
  );

  it.effect("POST /items creates an item", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      const db = yield* DB;

      yield* runMigrations(db);
      yield* registerItemRoutes;

      const response = yield* Effect.promise(() =>
        app.inject({
          method: "POST",
          url: "/items",
          payload: { name: "New Widget" },
          headers: withInternalAuth(TEST_TOKEN),
        }),
      );

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ name: "New Widget" });
      expect(response.json()).toHaveProperty("id");
    }).pipe(
      Effect.provide(TestLayers),
      Effect.withConfigProvider(containerConfig()),
      Effect.scoped,
    ),
  );

  it.effect("POST /items with empty body returns 400 with field details", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      const db = yield* DB;

      yield* runMigrations(db);
      yield* registerItemRoutes;

      const response = yield* Effect.promise(() =>
        app.inject({
          method: "POST",
          url: "/items",
          payload: {},
          headers: withInternalAuth(TEST_TOKEN),
        }),
      );

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBe("ValidationError");
      expect(body.details?.fields?.name).toBeDefined();
      expect(body.details.fields.name.length).toBeGreaterThan(0);
    }).pipe(
      Effect.provide(TestLayers),
      Effect.withConfigProvider(containerConfig()),
      Effect.scoped,
    ),
  );

  it.effect("GET /items/abc returns 400 with id field details", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      const db = yield* DB;

      yield* runMigrations(db);
      yield* registerItemRoutes;

      const response = yield* Effect.promise(() =>
        app.inject({
          method: "GET",
          url: "/items/abc",
          headers: withInternalAuth(TEST_TOKEN),
        }),
      );

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBe("ValidationError");
      expect(body.details?.fields).toBeDefined();
      expect(Object.keys(body.details.fields)).toContain("id");
    }).pipe(
      Effect.provide(TestLayers),
      Effect.withConfigProvider(containerConfig()),
      Effect.scoped,
    ),
  );

  it.effect("POST /items with duplicate name returns 409", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      const db = yield* DB;

      yield* runMigrations(db);
      yield* registerItemRoutes;

      const first = yield* Effect.promise(() =>
        app.inject({
          method: "POST",
          url: "/items",
          payload: { name: "Unique Widget" },
          headers: withInternalAuth(TEST_TOKEN),
        }),
      );
      expect(first.statusCode).toBe(201);

      const second = yield* Effect.promise(() =>
        app.inject({
          method: "POST",
          url: "/items",
          payload: { name: "Unique Widget" },
          headers: withInternalAuth(TEST_TOKEN),
        }),
      );
      expect(second.statusCode).toBe(409);
      const body = second.json();
      expect(body.error).toBe("ConflictError");
      expect(body.message).toBe("Item already exists");
      expect(body.details?.detail).toContain("items_name_unique");
    }).pipe(
      Effect.provide(TestLayers),
      Effect.withConfigProvider(containerConfig()),
      Effect.scoped,
    ),
  );
});
