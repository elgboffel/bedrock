import { it } from "@effect/vitest";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import { ConfigProvider, Effect } from "effect";
import { afterAll, beforeAll, describe, expect } from "vitest";
import { DB, DrizzleLive } from "../client/client";
import { items } from "../schema/schema";
import { runMigrations } from "./migrator";

/**
 * Integration tests for Drizzle migrations and typed queries.
 *
 * Proves the full pipeline: migration -> seed -> typed query -> assert.
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
      ["DB_SSL", "false"],
    ]),
  );

describe("Migrations", () => {
  it.effect("runs migrations and creates the items table", () =>
    Effect.gen(function* () {
      const db = yield* DB;

      // Run migrations
      yield* runMigrations(db);

      // Verify: insert a row via Drizzle typed API
      const inserted = yield* db
        .insert(items)
        .values({ name: "Gravity Boots" })
        .returning();

      expect(inserted).toHaveLength(1);
      expect(inserted[0]?.id).toBeGreaterThan(0);
      expect(inserted[0]?.name).toBe("Gravity Boots");
    }).pipe(
      Effect.provide(DrizzleLive),
      Effect.withConfigProvider(containerConfig()),
      Effect.scoped,
    ),
  );
});

describe("Typed queries", () => {
  it.effect("inserts and selects with full type safety", () =>
    Effect.gen(function* () {
      const db = yield* DB;
      yield* runMigrations(db);

      // Insert
      yield* db.insert(items).values({ name: "Hover Board" });
      yield* db.insert(items).values({ name: "Jet Pack" });

      // Select all
      const all = yield* db.select().from(items);
      expect(all.length).toBeGreaterThanOrEqual(2);

      // Select with filter
      const filtered = yield* db
        .select()
        .from(items)
        .where(eq(items.name, "Jet Pack"));

      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.name).toBe("Jet Pack");
    }).pipe(
      Effect.provide(DrizzleLive),
      Effect.withConfigProvider(containerConfig()),
      Effect.scoped,
    ),
  );

  it.effect("returns empty array when no items match", () =>
    Effect.gen(function* () {
      const db = yield* DB;
      yield* runMigrations(db);

      const result = yield* db
        .select()
        .from(items)
        .where(eq(items.name, "nonexistent"));

      expect(result).toHaveLength(0);
    }).pipe(
      Effect.provide(DrizzleLive),
      Effect.withConfigProvider(containerConfig()),
      Effect.scoped,
    ),
  );
});
