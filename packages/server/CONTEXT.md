# `@repo/server` — context

Effect-based server infrastructure: Fastify lifecycle, config, logging, route adapter,
and a central HTTP error mapper. Designed so apps compose Layers and write route
bodies as Effects, not async functions.

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
- **`mapErrorToHttp`** — single function from tagged error → `{ status, body }`.
  Unknown tags fall through to a generic 500. Edit this mapping (not the routes) when
  the wire format changes.
- **`parseErrorToValidation`** — translates Effect `ParseError` into a `ValidationError`
  with flat `fields: Record<path, messages[]>`.

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

1. Add a `Data.TaggedError("NewThing")` class to `errors.ts`.
2. Add a mapping entry in `error-mapper.ts` (`defaultMappings`).
3. Throw it from a route body via `yield* new NewThing({ ... })` or `Effect.fail`.
