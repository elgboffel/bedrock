import { it } from "@effect/vitest";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { ConfigProvider, Effect } from "effect";
import { afterAll, beforeAll, describe, expect } from "vitest";
import { DB, DrizzleLive } from "./client";

/**
 * Integration tests for the Drizzle + Effect Layer.
 *
 * Uses Testcontainers to spin up a real Postgres 16 instance.
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

describe("Drizzle Layer lifecycle", () => {
  it.effect("acquires a Drizzle instance and executes a query", () =>
    Effect.gen(function* () {
      const db = yield* DB;

      const result = yield* db.execute<{ result: number }>(
        sql`SELECT 1 AS result`,
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.result).toBe(1);
    }).pipe(
      Effect.provide(DrizzleLive),
      Effect.withConfigProvider(containerConfig()),
      Effect.scoped,
    ),
  );

  it.effect("releases resources on scope finalization", () =>
    Effect.gen(function* () {
      let queryWorkedInsideScope = false;

      yield* Effect.scoped(
        Effect.gen(function* () {
          const db = yield* DB;
          const result = yield* db.execute<{ answer: number }>(
            sql`SELECT 42 AS answer`,
          );
          expect(result[0]?.answer).toBe(42);
          queryWorkedInsideScope = true;
        }).pipe(Effect.provide(DrizzleLive)),
      );

      expect(queryWorkedInsideScope).toBe(true);
    }).pipe(Effect.withConfigProvider(containerConfig())),
  );
});
