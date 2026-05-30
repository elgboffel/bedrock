# ADR-002: Merge `route-runner` into `effect-route`

**Status:** Accepted
**Date:** 2026-05-30
**Deciders:** Project maintainers

## Context

`@repo/server` exposed two adjacent modules for the HTTP route adapter:

- `effect-route` — the pure factory `createEffectRoute(runtime)` returning
  `{ route, routeWithSchema }`, plus `withStatus` / `created` success helpers. No
  dependency on Effect's `Context` / `Layer`; it is a plain function over a captured
  `Runtime`.
- `route-runner` — a `Context.Tag` (`RouteRunner`) and `Layer` (`RouteRunnerLive`)
  whose only job was `createEffectRoute(yield* Effect.runtime())`.

Applying the deletion test to the **module boundary** (not the Tag): removing the
separate `route-runner/` folder pushes nothing meaningful to callers — they only swap
an import path. The Tag wraps a factory from the *same package*, so a dedicated module
for it reads as a shallow pass-through.

The one substantive argument for a separate module was that `RouteRunner` localizes a
load-bearing invariant: the captured runtime must carry the logger and tracer fiber
refs, so `RouteRunnerLive` must be provided **after** `LoggerLive` + the tracing Layer.
But both "keep" and "merge" retain the Tag and Layer — merging only relocates them.
The invariant is localized just as well co-located with the factory it wraps.

Because this is a bedrock ("the canonical way"), a folder-per-Tag that wraps a
same-package factory is the kind of ceremony future projects would cargo-cult.

## Decision

Fold `route-runner` into `effect-route`. The `RouteRunner` Tag and `RouteRunnerLive`
Layer now live at the bottom of `src/effect-route/effect-route.ts`, directly below
`createEffectRoute`. The whole route-adapter vocabulary — `route`, `routeWithSchema`,
`withStatus`, `created`, `RouteRunner`, `RouteRunnerLive` — imports from a single path,
`@repo/server/effect-route`. The `@repo/server/route-runner` subpath is removed.

The captured-runtime invariant is documented in the `RouteRunnerLive` doc comment
(next to the capture) and in `@repo/server/CONTEXT.md`.

## Consequences

- One import path for route-adapter concerns; no shallow pass-through module.
- `effect-route.ts` now imports `Context` / `Layer` in addition to `Effect` / `Runtime`
  / `Schema`. The "pure factory vs. Effect wiring" split is no longer a *module*
  boundary — it remains a *section* boundary within one file.
- The layer-order invariant lives beside the code that depends on it, reducing the
  chance of providing `RouteRunnerLive` before the logger/tracer Layers.
- Callers updated: `apps/api` (index, routes, health, items) and `apps/web`
  (index, routes) plus their tests. All route tests pass.
