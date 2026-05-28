# `@repo/database` — context

Drizzle ORM over `@effect/sql-pg`, exposed as an Effect Layer. Migrations run from
code, not from a separate CLI step. Tests use Testcontainers for real Postgres.

## Vocabulary

- **Folder-per-module layout** — each non-test module lives at
  `src/<name>/<name>.ts` with its paired test alongside. Tables live one level
  deeper at `src/schema/<table>/<table>.ts`. No `index.ts` barrels anywhere.
  Consumers import via the subpath `@repo/database/<name>`, which the `exports`
  wildcard (`./*` → `./src/*/*.ts`) resolves to the module file.
- **Aggregator module** — named replacement for a barrel. `src/schema/schema.ts`
  imports each table module by name and re-exports them as a typed `schema` record
  passed to Drizzle's `makeWithDefaults`. Adding a new table means importing it
  in `schema.ts` and listing it in the object — explicit, not glob-driven.
- **`DB`** — `Context.Tag` holding a Drizzle database instance. Route bodies and
  services `yield* DB` and then call `db.select() / .insert() / .update()` as normal
  Drizzle, returning Effects.
- **`DrizzleLive`** — Layer providing `DB`. Reads `DbConfig` from env, configures
  `PgClient` from `@effect/sql-pg`, wraps it with `drizzle-orm/effect-postgres`.
- **`DbConfig`** — `Effect.all` config bundle (`DB_HOST`, `DB_PORT`, `DB_NAME`,
  `DB_USER`, `DB_PASSWORD`). Password is `Redacted` so it never leaks to logs.
- **Schema modules** (`src/schema/<table>/<table>.ts`) — Drizzle `pgTable`
  definitions, one table per folder. The `schema` aggregator at
  `src/schema/schema.ts` collects them; apps import
  `from "@repo/database/schema"`.
- **`isUniqueViolation(err)`** — sniffs Postgres SQLSTATE `23505` through the
  `cause` / `failure` / `error` chain. Works whether the error comes from raw pg,
  `@effect/sql` `SqlError`, or Drizzle/effect-postgres. Returns
  `{ constraint } | null`.
- **`runMigrations`** — programmatic migrator. Apps call it during boot (or in test
  setup) so migrations aren't a separate deploy step.

## Conventions

- **One table per folder.** Each table lives at `src/schema/<table>/<table>.ts`
  and is registered in `src/schema/schema.ts`. Unique indexes are declared in the
  table's third-arg callback (`(table) => [uniqueIndex(...)]`), not via separate
  `ALTER TABLE` migrations.
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
ad-hoc `DrizzleLive` wired to it. See `client/client.integration.test.ts` and
`migrator/migrator.integration.test.ts`. Apps reuse this pattern from their own
`vitest.integration.config.ts`.
