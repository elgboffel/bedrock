# Context map

Bedrock TypeScript monorepo: **Fastify + Effect** API and an **Astro + React** web app
sharing schemas and infra. Effect Layers manage server, DB, and telemetry lifecycles.
Tagged domain errors are mapped centrally to HTTP. Drizzle + Postgres backs persistence.
OpenTelemetry tracing, metrics, and log export are wired through a single config envelope.

This repo is a **bedrock** — a working example future projects copy. Patterns here
should read as "the canonical way", not "one option among many".

## Contexts

| Path | One-liner |
| --- | --- |
| [`packages/server/CONTEXT.md`](packages/server/CONTEXT.md) | Effect Layers for Fastify, Pino, config, RouteRunner; tagged errors + central HTTP mapper. |
| [`packages/database/CONTEXT.md`](packages/database/CONTEXT.md) | Drizzle + `@effect/sql-pg` Layer, schema conventions, unique-violation sniffing, testcontainers. |
| [`packages/contracts/CONTEXT.md`](packages/contracts/CONTEXT.md) | HTTP DTOs as Effect Schemas — shared between API and web. No runtime, no DB types. |
| [`packages/telemetry/CONTEXT.md`](packages/telemetry/CONTEXT.md) | Tracing / metrics / log-export Layers; OTLP factories; `TelemetryConfig` envelope. |
| [`apps/api/CONTEXT.md`](apps/api/CONTEXT.md) | Fastify Effect API: route module layout and how to add a new domain. |
| [`apps/web/CONTEXT.md`](apps/web/CONTEXT.md) | Astro SSR + React islands behind a Fastify proxy; shared contracts; dev/prod boot. |

## Trivial scaffolding (no `CONTEXT.md`)

These exist but are too thin to warrant a context doc — they hold no vocabulary worth
glossarising. If they grow, add a `CONTEXT.md` here.

- `packages/common/` — placeholder utility module (`sayHello`, a constant).
- `packages/ui/` — single `Button` component placeholder.
- `packages/typescript-config/` — shared `tsconfig` presets only.

## Cross-cutting decisions

System-wide ADRs would live in `docs/adr/` (not created yet). Context-scoped ADRs
would live in `<context>/docs/adr/`. Create lazily when a real decision needs recording.
