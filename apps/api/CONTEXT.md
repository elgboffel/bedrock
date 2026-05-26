# `apps/api` — context

Fastify-based HTTP API. The entrypoint is a single Effect program composed from
Layers; route bodies are Effects, decoded via `routeWithSchema` and failure-mapped
via the central HTTP mapper from `@repo/server`.

## Layout

```
src/
├── index.ts                     ← entrypoint: AppLive + program + NodeRuntime.runMain
└── routes/
    ├── index.ts                 ← barrel: registers every domain's routes
    ├── health/
    │   ├── health.routes.ts
    │   └── health.routes.test.ts
    └── items/
        ├── items.routes.ts
        └── items.routes.integration.test.ts
```

## Layer stack (in `index.ts`)

```ts
const AppLive = Layer.mergeAll(
  FastifyLive,
  DrizzleLive,
  OtlpTracingLive,
  RouteRunnerLive,
).pipe(Layer.provide(PinoLoggerLive));
```

- **`PinoLoggerLive`** is provided last so it's available to everything above.
- **`RouteRunnerLive`** must come after the logger + tracer so the captured runtime
  carries those fiber refs.
- **`OtlpTracingLive`** auto-switches between OTLP/HTTP and console based on
  `OTEL_EXPORTER_ENDPOINT`.

## Add a new domain

1. **Contract.** Add request/response Schemas to `@repo/contracts/<domain>.ts`.
2. **Schema.** Add a Drizzle table to `@repo/database/src/schema/<domain>.ts` and
   re-export from `schema/index.ts`. Generate a migration with Drizzle Kit.
3. **Routes.** Create `src/routes/<domain>/<domain>.routes.ts` exporting a
   `registerXxxRoutes` Effect. Inside, `yield* FastifyServer`, `yield* DB`,
   `yield* RouteRunner`, then register handlers via `route` / `routeWithSchema`.
4. **Barrel.** Add `yield* registerXxxRoutes` in `src/routes/index.ts`.
5. **Tests.** Mirror the layout from `items/` — unit tests with mocked `DB`,
   integration tests with Testcontainers.

## Route handler conventions

- **Decode-on-entry.** Use `routeWithSchema({ params, query, body }, handler)` so
  invalid inputs become `ValidationError` before the body runs.
- **Wrap each handler in `Effect.withSpan("METHOD /path")`** for tracing.
- **Use tagged errors.** `Effect.fail(new NotFound({ resource: "..." }))`,
  never `reply.code(404).send(...)`. The adapter knows what to do.
- **Sniff DB driver errors at the source.** Catch `EffectDrizzleQueryError`, run
  `isUniqueViolation`, fail with `ConflictError`. Don't let raw driver errors
  reach the mapper.

## Testing

- **Unit (`*.test.ts`)**: build a Layer stack with mocked `DB` (in-memory or
  vitest stubs) and call routes via `app.inject(...)`.
- **Integration (`*.integration.test.ts`)**: Testcontainers Postgres, real
  `DrizzleLive`, real Fastify. Run via `pnpm test:integration`.

## Gotchas

- `NodeRuntime.runMain` already wires SIGINT/SIGTERM to scope interruption. Do not
  add `process.on("SIGINT", ...)`.
- `Effect.never` at the end of `program` is what keeps the server alive after
  `listen()` resolves. Without it the scope would close immediately.
