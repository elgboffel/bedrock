# `@repo/database` — context

Drizzle ORM over `@effect/sql-pg`, exposed as an Effect Layer. Migrations run from
code, not from a separate CLI step. Tests use Testcontainers for real Postgres.

## Vocabulary

- **`DB`** — `Context.Tag` holding a Drizzle database instance. Route bodies and
  services `yield* DB` and then call `db.select() / .insert() / .update()` as normal
  Drizzle, returning Effects.
- **`DrizzleLive`** — Layer providing `DB`. Reads `DbConfig` from env, configures
  `PgClient` from `@effect/sql-pg`, wraps it with `drizzle-orm/effect-postgres`.
- **`DbConfig`** — `Effect.all` config bundle (`DB_HOST`, `DB_PORT`, `DB_NAME`,
  `DB_USER`, `DB_PASSWORD`). Password is `Redacted` so it never leaks to logs.
- **Schema modules** (`src/schema/*.ts`) — Drizzle `pgTable` definitions. Re-export
  from `src/schema/index.ts`. Apps import `from "@repo/database/schema/index"`.
- **`isUniqueViolation(err)`** — sniffs Postgres SQLSTATE `23505` through the
  `cause` / `failure` / `error` chain. Works whether the error comes from raw pg,
  `@effect/sql` `SqlError`, or Drizzle/effect-postgres. Returns
  `{ constraint } | null`.
- **`runMigrations`** — programmatic migrator. Apps call it during boot (or in test
  setup) so migrations aren't a separate deploy step.

## Conventions

- **Table files are flat.** One table per file in `src/schema/`. Unique indexes are
  declared in the table's third-arg callback (`(table) => [uniqueIndex(...)]`), not
  via separate `ALTER TABLE` migrations.
- **Migrations are generated, not handwritten.** Drizzle Kit produces them from the
  schema files; humans review and commit. `drizzle.config.ts` reads from `DB_*` env
  vars and will throw with a clear message if any are unset.
- **Unique-constraint errors are domain errors.** Catch the driver error in the
  route, run `isUniqueViolation`, fail with `ConflictError` from `@repo/server`.
  Don't let raw driver errors reach `mapErrorToHttp`.

## Key invariants

- **Date/time parsing is Drizzle's job, not pg's.** `client.ts` overrides pg's type
  parsers so Drizzle controls how dates come out. Don't add another override layer.
- **`DrizzleLive` is scoped.** The pg pool closes on scope release. Tests must use
  `Effect.scoped` (or `it.scoped`) to avoid leaking connections between cases.

## Testcontainers pattern

Integration tests boot a real Postgres container, run migrations, and provide an
ad-hoc `DrizzleLive` wired to it. See `client.integration.test.ts` and
`migration.integration.test.ts`. Apps reuse this pattern from their own
`vitest.integration.config.ts`.
