import { SqlClient } from "@effect/sql";
import { it } from "@effect/vitest";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { ConfigProvider, Effect } from "effect";
import { afterAll, beforeAll, describe, expect } from "vitest";
import { PostgresLive } from "./client.js";

/**
 * Integration tests for the Postgres connection Layer.
 *
 * These tests use Testcontainers to spin up a real Postgres instance in
 * Docker. The container is shared across all tests in the suite for speed
 * and torn down after.
 */
let container: Awaited<ReturnType<PostgreSqlContainer["start"]>>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
}, 60_000);

afterAll(async () => {
  await container?.stop();
});

/**
 * Build a ConfigProvider from the running container's connection details.
 */
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

describe("Postgres Layer lifecycle", () => {
  it.effect("acquires a connection and can execute a query", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      // Simple connectivity check — SELECT 1 should return [{result: 1}]
      const rows = yield* sql`SELECT 1 AS result`;

      expect(rows).toHaveLength(1);
      expect(rows[0]?.result).toBe(1);
    }).pipe(
      Effect.provide(PostgresLive),
      Effect.withConfigProvider(containerConfig()),
      Effect.scoped,
    ),
  );

  it.effect("releases the connection pool on scope finalization", () =>
    Effect.gen(function* () {
      // Run a scoped effect that acquires the pool, uses it, then closes.
      // If this completes without error, the pool was properly released.
      let queryWorkedInsideScope = false;

      yield* Effect.scoped(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          const rows = yield* sql`SELECT 42 AS answer`;
          expect(rows[0]?.answer).toBe(42);
          queryWorkedInsideScope = true;
        }).pipe(Effect.provide(PostgresLive)),
      );

      expect(queryWorkedInsideScope).toBe(true);
      // If we reach here, scope finalization (pool close) completed cleanly
    }).pipe(Effect.withConfigProvider(containerConfig())),
  );
});
