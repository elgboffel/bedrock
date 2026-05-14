import { SqlClient } from "@effect/sql";
import { it } from "@effect/vitest";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { ConfigProvider, Effect } from "effect";
import { afterAll, beforeAll, describe, expect } from "vitest";
import { PostgresLive } from "./client.js";
import { ItemRepository } from "./repository.js";

/**
 * Integration tests for the repository pattern.
 *
 * Demonstrates the recommended way to structure data access:
 * - Repositories are plain objects with methods that return Effects
 * - They depend on SqlClient from the Effect context
 * - They compose naturally with the Layer system
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

describe("Repository pattern", () => {
  it.effect("creates a table and inserts/reads a record", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const repo = yield* ItemRepository;

      // Create the items table (in real apps, use migrations)
      yield* sql`
        CREATE TABLE IF NOT EXISTS items (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL
        )
      `;

      // Insert an item using the repository
      const inserted = yield* repo.create("Gravity Boots");

      expect(inserted.id).toBeGreaterThan(0);
      expect(inserted.name).toBe("Gravity Boots");

      // Read it back
      const found = yield* repo.findById(inserted.id);

      expect(found).not.toBeNull();
      expect(found!.name).toBe("Gravity Boots");
    }).pipe(
      Effect.provide(PostgresLive),
      Effect.withConfigProvider(containerConfig()),
      Effect.scoped,
    ),
  );

  it.effect("returns null when item not found", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const repo = yield* ItemRepository;

      yield* sql`
        CREATE TABLE IF NOT EXISTS items (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL
        )
      `;

      const found = yield* repo.findById(99999);
      expect(found).toBeNull();
    }).pipe(
      Effect.provide(PostgresLive),
      Effect.withConfigProvider(containerConfig()),
      Effect.scoped,
    ),
  );
});
