# `@repo/contracts` — context

HTTP DTOs as Effect Schemas, shared between `apps/api` and `apps/web`. The wire
format lives here so both sides agree by construction.

## What belongs here

- **HTTP request/response shapes** — `CreateItem`, `Item`, `ItemIdParams`, etc.
  Defined as `Schema.Struct` so they can decode incoming payloads, encode outgoing
  ones, and emit TypeScript types via `typeof X.Type`.
- **Path-param coercions** — e.g. `ItemIdParams` uses `Schema.NumberFromString`
  because route params arrive as strings.
- **Shared brand types** that are part of the wire contract (none yet).

## What does NOT belong here

- **No runtime** beyond `effect/Schema`. No DB calls, no Fastify, no React.
- **No database row types.** DB rows are Drizzle's job. If the API shape happens to
  match a DB row today, define it independently here anyway — that coincidence won't
  hold forever.
- **No business logic.** Validators here only check shape, not invariants like "name
  must be unique". Uniqueness is a DB concern (`ConflictError`).
- **No internal helpers.** If a helper is only used by `apps/api`, put it there.

## Conventions

- One file per domain (`items.ts`, future `users.ts`, etc.). Each exports
  `<Entity>`, `Create<Entity>`, `<Entity>IdParams`, and so on as needed.
- Export both the schema (`export const Foo = ...`) and the type
  (`export type Foo = typeof Foo.Type`) so consumers don't have to compute the type.
- Use the strictest base schema possible — `Schema.NonEmptyString` over
  `Schema.String`, `Schema.Number` (not `string`) for numeric ids.

## Used by

- `apps/api/src/routes/*` — passed to `routeWithSchema({ params, body })` for
  decode-on-entry.
- `apps/web/src/browser/components/*` — used to type fetch responses and to validate
  form input before POSTing.
