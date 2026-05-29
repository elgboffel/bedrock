# `apps/api` — context

Fastify-based HTTP API. The entrypoint is a single Effect program composed from
Layers; route bodies are Effects, decoded via `routeWithSchema` and failure-mapped
via the central HTTP mapper from `@repo/server`.

## Layout

Follows the repo-wide **folder-per-module** convention. The `routes/` subtree
uses the folder path to encode the role (`routes/<domain>/<domain>.ts`), so the
`.routes.ts` filename suffix has been dropped — the folder already says it.
`routes/routes.ts` is a **named aggregator module** (not a barrel) composing
every domain's registration Effect into one `registerRoutes` value.

`src/index.ts` is a runtime entrypoint (`NodeRuntime.runMain`), not a barrel,
and is the one allowed `index.ts` under `src/` per the layout-rule script.

```
src/
├── index.ts                     ← entrypoint: AppLive + program + NodeRuntime.runMain
└── routes/
    ├── routes.ts                ← named aggregator: registerRoutes
    ├── health/
    │   ├── health.ts
    │   └── health.test.ts
    └── items/
        ├── items.ts
        └── items.integration.test.ts
```

See `.scratch/folder-per-module-layout/PRD.md` for the wider rationale.

## Layer stack (in `index.ts`)

```ts
const AppLive = Layer.mergeAll(
  DrizzleLive,
  OtlpTracingLive,
  RouteRunnerLive,
  InternalAuthLive,
).pipe(Layer.provideMerge(FastifyLive));
```

- **`InternalAuthLive`** — registers a Fastify `onRequest` hook that rejects
  requests without a valid `x-internal-auth` token (bare `401`). `/health`
  bypasses. Fail-closed: missing `INTERNAL_AUTH_TOKEN` aborts boot. See
  [ADR-001](../../docs/adr/001-internal-web-api-boundary.md) for the full
  boundary design.
- **`PinoLoggerLive`** is provided via `LoggerLive` directly to the program (not
  merged into `AppLive`) so the FiberRef-based logger replacement applies to the
  program's fiber.
- **`RouteRunnerLive`** must come after the logger + tracer so the captured runtime
  carries those fiber refs.
- **`OtlpTracingLive`** auto-switches between OTLP/HTTP and console based on
  `OTEL_EXPORTER_ENDPOINT`.

## Add a new domain

1. **Contract.** Add request/response Schemas to
   `@repo/contracts/src/<domain>/<domain>.ts`.
2. **Schema.** Add a Drizzle table at
   `@repo/database/src/schema/<domain>/<domain>.ts` and aggregate it into
   `schema/schema.ts`. Generate a migration with Drizzle Kit.
3. **Routes.** Create `src/routes/<domain>/<domain>.ts` exporting a
   `register<Domain>Routes` Effect. Inside, `yield* FastifyServer`,
   `yield* DB`, `yield* RouteRunner`, then register handlers via
   `route` / `routeWithSchema`.
4. **Aggregator.** Import the new `register<Domain>Routes` in
   `src/routes/routes.ts` and add a `yield*` line.
5. **Tests.** Mirror the layout from `items/` — unit tests with mocked `DB`,
   integration tests with Testcontainers. Files are named
   `<domain>.test.ts` / `<domain>.integration.test.ts` (no `.routes` infix).

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

## Expose a new private backend

When a second backend (e.g. `apps/billing`) is needed:

1. **SST factory.** Add a `PrivateBackend` call in `sst.config.ts`:
   ```ts
   const billing = PrivateBackend("billing", {
     port: 3002,
     allowedCallers: [web],   // source-SG ingress
   });
   ```
   This creates: Fargate Service (no ALB), Cloud Map private DNS,
   `sst.Secret` for the backend's auth token, `link` wiring to callers,
   and source-SG ingress rules.

2. **`InternalAuthLive` in the Layer stack.** The new backend's `index.ts`
   adds `InternalAuthLive` to its `AppLive` exactly like `apps/api` does.
   The `internal-auth` Layer reads `InternalAuthConfig` from env
   (`INTERNAL_AUTH_TOKEN`), which SST populates via `link`.

3. **Routes.** Create route modules under `src/routes/` following the same
   folder-per-module pattern as `apps/api`.

4. **Callers.** Web SSR or other backends call the new backend via
   `InternalClient` (`@repo/server/internal-client`), which reads the
   target's URL + token from config and injects `x-internal-auth`.

5. **`allowedCallers` controls who can connect.** Only the Security Groups
   of declared callers are granted ingress to the backend's port. No
   VPC-wide fallback — a compromised service elsewhere can't reach it.

No security-critical wiring is hand-copied. The `PrivateBackend` factory
encodes the entire pattern. See [ADR-001](../../docs/adr/001-internal-web-api-boundary.md)
for rationale and the rotation runbook.

## Gotchas

- `NodeRuntime.runMain` already wires SIGINT/SIGTERM to scope interruption. Do not
  add `process.on("SIGINT", ...)`.
- `Effect.never` at the end of `program` is what keeps the server alive after
  `listen()` resolves. Without it the scope would close immediately.
