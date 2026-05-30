# `@repo/server` — context

Effect-based server infrastructure: Fastify lifecycle, config, logging, route adapter,
and a central HTTP error mapper. Designed so apps compose Layers and write route
bodies as Effects, not async functions.

## Layout

This package follows the repo-wide **folder-per-module** convention: every module
lives at `src/<name>/<name>.ts` with its paired test at `src/<name>/<name>.test.ts`.
The `exports` map `"./*": "./src/*/*.ts"` makes the convention structurally
unavoidable — `@repo/server/fastify` resolves to `src/fastify/fastify.ts` and a
misplaced file simply fails to import. The layout-rule script (`@repo/layout-lint`)
backs this up in `turbo check`. See `.scratch/folder-per-module-layout/PRD.md` and
`CONTEXT-MAP.md` for the wider rationale.

## Vocabulary

- **`FastifyServer`** — `Context.Tag` holding the `FastifyInstance`. Apps `yield*` it
  to register routes. Backed by `FastifyLive`, a Layer that creates the instance on
  acquire and `app.close()`s it on scope release.
- **`FastifyLive`** — Layer providing `FastifyServer`. Reads `LogConfig` so Fastify's
  built-in pino logger is consistent with the rest of the app.
- **`ServerConfig` / `LogConfig`** — `Effect.all`-style config bundles read from env
  via `Config.string` / `Config.boolean`. Composable: an app's own config can extend
  the same pattern.
- **`PinoLoggerLive`** — routes `Effect.log*` calls to pino. Replaces Effect's default
  logger; do not stack it twice.
- **`RouteRunner`** — Tag carrying `{ route, routeWithSchema }` helpers built from
  the ambient runtime. The Layer (`RouteRunnerLive`) captures the runtime via
  `Effect.runtime()` so route bodies inherit logger, tracer, and other fiber refs.
- **`route` / `routeWithSchema`** — adapters that turn an Effect-returning function
  into a Fastify handler. `routeWithSchema` decodes `params` / `query` / `body` via
  Effect Schemas before invoking the body; decode failures become `ValidationError`.
- **Tagged domain errors** — `NotFound`, `Unauthorized`, `ValidationError`,
  `ConflictError`, `InternalError` (all `Data.TaggedError`). Route bodies `Effect.fail`
  these; the adapter catches them.
- **`mapErrorToHttp`** — single function from tagged error → `{ status, body }`,
  backed by a typed `ErrorRegistry` keyed by the tagged-error union. The registry
  forces a mapping for every tag (forget one → compile error, not a runtime 500)
  and types each mapper's `error` as the exact variant. Unknown (non-domain) tags
  fall through to a generic 500. Edit this mapping (not the routes) when the wire
  format changes.
- **`parseErrorToValidation`** — translates Effect `ParseError` into a `ValidationError`
  with flat `fields: Record<path, messages[]>`.
- **`internal-credential`** — the single owner of the internal service-to-service
  credential invariant ("header `x-internal-auth` carries the shared token"). Exposes
  `DEFAULT_INTERNAL_AUTH_HEADER`, `injectCredential` (produce the header for outgoing /
  proxied calls), and `makeVerifier` (a `CredentialVerifier` doing timing-safe SHA-256
  comparison with previous-token rotation, plus the normalized `headerKey`). The three
  adapters at this seam — `internal-client`, `internal-proxy-headers`, `internal-auth`
  — are thin over it; none re-derives the header name or the comparison rule. Rename the
  header or change the comparison here, not in three places.

## Key invariants

- **Layer order matters.** Apps must provide `PinoLoggerLive` (and a tracing Layer)
  *before* `RouteRunnerLive` so the captured runtime carries the right fiber refs.
- **Routes never call `reply.send` for errors.** They `Effect.fail(new TaggedError(...))`
  and let the adapter + mapper produce the response. This keeps the wire format in one
  file.
- **Fastify lifecycle is scoped.** `Effect.scoped` on the program is what closes the
  server cleanly. Don't add manual `SIGINT` handlers — `NodeRuntime.runMain` already
  interrupts the scope on signals.
- **`Effect.die` for unexpected.** Drizzle defects and similar should `Effect.die` (or
  `Effect.catchAllDefect` at the boundary). Tagged errors are reserved for the
  domain-level outcomes the mapper knows about.

## Gotchas

- `RouteRunner` is built by capturing the runtime at Layer construction time. If you
  provide a different logger / tracer further down the stack, the route handlers will
  not see it. Re-build `RouteRunnerLive` after any change to ambient services.
- `parseErrorToValidation` returns paths joined with `.`. If you switch to `/` or
  another separator, update both the helper and any client that assumes the format.

## Add a new error type

1. Add a `Data.TaggedError("NewThing")` class to `errors/errors.ts`.
2. Add `NewThing` to the `DomainError` union in `error-mapper/error-mapper.ts`.
   The `ErrorRegistry` mapped type now requires a `NewThing` entry — TypeScript
   fails `turbo check` until you add it, so it can't silently fall through to 500.
3. Add the `NewThing` mapping entry in `defaultMappings`. Its `error` argument is
   already typed as the new variant — read fields directly, no `as` cast.
4. Throw it from a route body via `yield* new NewThing({ ... })` or `Effect.fail`.
