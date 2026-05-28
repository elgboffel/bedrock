import { it } from "@effect/vitest";
import { Cause, ConfigProvider, Effect, Exit } from "effect";
import { describe, expect } from "vitest";
import { DbConfig } from "./config";

describe("DbConfig", () => {
  it.effect(
    "uses defaults for optional fields when only required fields provided",
    () =>
      Effect.gen(function* () {
        const config = yield* DbConfig;

        expect(config.host).toBe("localhost");
        expect(config.port).toBe(5432);
        expect(config.poolSize).toBe(10);
        // Required fields come from the provider
        expect(config.database).toBe("testdb");
        expect(config.username).toBe("testuser");
        expect(config.password).toBe("testpass");
      }).pipe(
        Effect.withConfigProvider(
          ConfigProvider.fromMap(
            new Map([
              ["DB_NAME", "testdb"],
              ["DB_USER", "testuser"],
              ["DB_PASSWORD", "testpass"],
            ]),
          ),
        ),
      ),
  );

  it.effect("reads all fields from environment", () =>
    Effect.gen(function* () {
      const config = yield* DbConfig;

      expect(config.host).toBe("db.example.com");
      expect(config.port).toBe(5433);
      expect(config.database).toBe("mydb");
      expect(config.username).toBe("admin");
      expect(config.password).toBe("secret");
      expect(config.poolSize).toBe(20);
    }).pipe(
      Effect.withConfigProvider(
        ConfigProvider.fromMap(
          new Map([
            ["DB_HOST", "db.example.com"],
            ["DB_PORT", "5433"],
            ["DB_NAME", "mydb"],
            ["DB_USER", "admin"],
            ["DB_PASSWORD", "secret"],
            ["DB_POOL_SIZE", "20"],
          ]),
        ),
      ),
    ),
  );

  it.effect("fails with clear message when DB_NAME is missing", () =>
    Effect.gen(function* () {
      const exit = yield* DbConfig.pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const message = Cause.pretty(exit.cause);
        expect(message).toContain("DB_NAME");
      }
    }).pipe(
      Effect.withConfigProvider(
        ConfigProvider.fromMap(
          new Map([
            ["DB_USER", "testuser"],
            ["DB_PASSWORD", "testpass"],
          ]),
        ),
      ),
    ),
  );

  it.effect("fails with clear message when DB_USER is missing", () =>
    Effect.gen(function* () {
      const exit = yield* DbConfig.pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const message = Cause.pretty(exit.cause);
        expect(message).toContain("DB_USER");
      }
    }).pipe(
      Effect.withConfigProvider(
        ConfigProvider.fromMap(
          new Map([
            ["DB_NAME", "testdb"],
            ["DB_PASSWORD", "testpass"],
          ]),
        ),
      ),
    ),
  );

  it.effect("fails with clear message when DB_PASSWORD is missing", () =>
    Effect.gen(function* () {
      const exit = yield* DbConfig.pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const message = Cause.pretty(exit.cause);
        expect(message).toContain("DB_PASSWORD");
      }
    }).pipe(
      Effect.withConfigProvider(
        ConfigProvider.fromMap(
          new Map([
            ["DB_NAME", "testdb"],
            ["DB_USER", "testuser"],
          ]),
        ),
      ),
    ),
  );
});
