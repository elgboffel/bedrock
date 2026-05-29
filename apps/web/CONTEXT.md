# `apps/web` — context

Astro for SSR + React for interactive islands, served behind a Fastify front-door
that proxies `/api/*` to `apps/api`. Effect manages the Fastify lifecycle and (in
dev) spawns the Astro dev server as a managed subprocess.

## Layout

Follows the repo-wide **folder-per-module** convention. Inside `src/server/`,
every module sits at `<name>/<name>.ts` with its paired test alongside. The
entrypoint (`server/index.ts` + `server/index.test.ts`) is the layout-rule
exception — a folder that contains both `index.ts` and `index.test.ts`
counts as an **entrypoint folder** and escapes the no-`index.ts` rule.
See `.scratch/folder-per-module-layout/PRD.md`.

```
src/
├── server/                       ← Fastify front-door (Node)
│   ├── index.ts                  ← entrypoint: AppLive + program
│   ├── index.test.ts             ← bootstrap test (alongside entrypoint)
│   ├── plugins/
│   │   └── plugins.ts            ← proxy / static / SSR middleware
│   ├── routes/
│   │   └── routes.ts             ← health + any non-Astro routes
│   └── astro-dev/
│       ├── astro-dev.ts          ← AstroDevLive: dev-mode subprocess Layer
│       └── astro-dev.test.ts
└── browser/                      ← Astro + React
    ├── pages/                    ← .astro pages (SSR)
    └── components/               ← React islands (.tsx)
```

## Boot flow

- **Dev**: `concurrently` runs `tsdown --watch` (bundles the server) and
  `nodemon` (runs the server). The server program provides `AstroDevLive`,
  which spawns `astro dev` as a managed subprocess — killed automatically on
  scope release.
- **Prod**: `astro build` produces static + SSR assets; `tsdown` bundles the
  server. The server serves built assets via `@fastify/static` and proxies
  `/api/*` upstream.

## Layer stack

```ts
Layer.mergeAll(FastifyLive, TracingLive, RouteRunnerLive)
  .pipe(Layer.provide(PinoLoggerLive))
  // + AstroDevLive in dev
```

`ApiConfig` (`API_URL`, default `http://localhost:3001`) feeds the proxy upstream
in `plugins/plugins.ts`.

## Internal boundary (web→api proxy)

The `/api/*` proxy is the security boundary between the public internet and
private backends. See [ADR-001](../../docs/adr/001-internal-web-api-boundary.md).

- **Header rewriting** — `plugins.ts` uses `rewriteProxyHeaders`
  (`@repo/server/internal-proxy-headers`) in `@fastify/http-proxy`'s
  `rewriteRequestHeaders`. This strips `x-internal-*` / `x-user-*` namespaces
  (prevents browser forgery), drops `cookie` / `authorization` (web-as-boundary),
  re-authors `x-forwarded-*`, and injects `x-internal-auth`.
- **Token injection** — the proxy reads `InternalAuthConfig` and injects the
  shared secret automatically. The browser never holds the token.
- **SSR / server-to-server** — SSR code calls api directly via `InternalClient`
  (`@repo/server/internal-client`), bypassing the proxy. The client injects
  `x-internal-auth` and decodes responses against `@repo/contracts` Schemas.
  It is **server-only** (Node/crypto deps prevent browser import).
- **Browser path** — React islands `fetch('/api/...')` through the proxy. They
  never use `InternalClient`.

## Shared types

- **Request/response shapes** come from `@repo/contracts`. Components type their
  fetch responses against the same Schemas the API decodes against — drift is
  caught at compile time.
- **UI helpers** from `@repo/ui` (placeholder `Button` for now).
- **Generic helpers** from `@repo/common`.

## React-island conventions

- **Per-island providers.** `QueryProvider.tsx` wraps an island in TanStack
  Query. Each interactive component is its own island; don't try to share a
  React tree across Astro pages.
- **Fetch through the proxy.** Components hit `/api/...` (same origin), not the
  API directly. The Fastify proxy handles upstream routing, header rewriting,
  and token injection. Never import `InternalClient` in a React island.

## Fastify quirk: `register()` returns a one-shot PromiseLike

`app.register()` returns a `FastifyInstance` that is `PromiseLike` but whose
`.then` is consumed on first read. `Effect.promise(() => app.register(...))` will
fail on the *second* call with `evaluate(...).then is not a function`. Wrap with
an `async` IIFE (`async () => await app.register(...)`) to produce a real Promise.
The `fastifyOp` helper in `server/index.ts` exists for exactly this.

## Gotchas

- The Astro dev server is **only** present in dev (controlled by `NODE_ENV`). In
  prod, static assets are served from disk. Don't add code paths that assume the
  dev server is running.
- `apps/web` runs Fastify too — it is a node app, not a static site. Both
  `apps/api` and `apps/web` use the same `@repo/server` Fastify Layer.
