# Upgrade Handoff — pnpm 11, Vitest 4, @effect/vitest

Goal: finish the two upgrades deliberately deferred during the "everything to
latest" pass (see `git log` around the `chore(deps)` commits). Both are *blocked
on external constraints*, not on effort — this doc records the exact blockers so
the next session doesn't re-discover them.

Current state (pinned, all green):

- Node **24.16.0** (Volta pin + CI), pnpm **10.34.1** (`packageManager`).
- TypeScript **6**, Astro **6**, Vitest **3** (latest 3.x), `@effect/vitest`
  **^0.29.0**, Effect **^3.21.2**.
- `pnpm lint / lint:deps / typecheck / build / test / test:integration` all pass.

There are two independent tracks. Do them separately.

---

## Track A — pnpm 10 → 11 ✅ DONE (2026-05-30)

**Outcome:** on `pnpm@11.5.0` / Node 25. `packageManager` bumped (pnpm
self-activates — no corepack fight). Build scripts pinned via pnpm 11's
`allowBuilds` map (all `false`). `minimumReleaseAge` is **explicitly disabled**
(`0`) for now — pnpm 11 defaults it to 1440 (24h) and verifies the *whole*
committed lockfile on `--frozen-lockfile`, which fails a clean CI install while the
just-bumped lockfile still holds sub-24h pins. Re-enabling 1440 is a tracked
follow-up (see ADR-003) once the lockfile settles. Lockfile unchanged, no
`node_modules` purge. Clean-install full gate green. CI `pnpm/action-setup@v4`
reads `packageManager` — no workflow edit. **Track B below still pending (waits on
Effect 4 stable).**

<details><summary>Original deferral notes (kept for history)</summary>

**Why deferred:** pnpm 11.5 ships a new **`minimumReleaseAge`** supply-chain
policy on by default. On the upgrade day it rejected the (then-fresh) lockfile
entries:

```
[ERR ...] <pkg>@x was published within the minimumReleaseAge cutoff ...
The lockfile contains entries that the active policies reject.
```

Also hit: the repo's bundled corepack (0.14.1) is too old for Node 24/25
(`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`), and pnpm 11 wants to **purge and
rebuild `node_modules`** (different store layout) which needs a TTY or `CI=true`.

**This is not a real blocker — it's transient + config.** The fresh-package
rejection ages out on its own (packages older than the cutoff pass). The policy
is *desirable* to keep.

### Steps

1. Get a modern pnpm 11. Don't fight the old corepack — either:
   - `npm i -g pnpm@latest` (then `pnpm -v` ≥ 11.5), or
   - update corepack first: `npm i -g corepack@latest && corepack enable`.
2. Set `packageManager` in root `package.json` to the chosen `pnpm@11.x`.
3. Decide the supply-chain policy explicitly (don't just let it block CI). In
   `pnpm-workspace.yaml` (pnpm 11 reads settings there) set a sane window, e.g.
   `minimumReleaseAge: 1440` (24h) and an allowlist if a just-published internal
   dep must be installed immediately. Document the choice in an ADR.
4. Regenerate the lockfile: `CI=true pnpm install` (the `CI=true` allows the
   one-time `node_modules` purge non-interactively). Commit `pnpm-lock.yaml`
   **last**, on its own (`chore(deps): update lockfile`).
5. Re-run the full gate: `pnpm lint && pnpm lint:deps && pnpm typecheck &&
   pnpm build && pnpm test && pnpm test:integration`.
6. CI uses `pnpm/action-setup@v4` which reads `packageManager` — no workflow
   edit needed, but confirm the `ci` + `integration` jobs go green on the PR.

### Watch-outs

- **Build-scripts approval.** pnpm 10.34 already prompts `pnpm approve-builds`
  (esbuild/sst native postinstalls). pnpm 11 keeps this. Pin the allowlist via
  `onlyBuiltDependencies` in `pnpm-workspace.yaml` so CI is deterministic and the
  prompt disappears. (This is a good idea regardless of the pnpm bump.)
- `--frozen-lockfile` in CI will fail if the lockfile wasn't regenerated under
  pnpm 11 — step 4 is mandatory before pushing.

</details>

---

## Track B — Vitest 3 → 4 (blocked by Effect 4)

**Why deferred — the hard gate:** Vitest 4 is only supported by
`@effect/vitest@4.x`, which is still **beta** and, critically, peers
**`effect ^4.0.0-beta`**:

```
@effect/vitest@4.0.0-beta.74 peerDependencies:
  vitest: "^3.0.0 || ^4.0.0"
  effect: "^4.0.0-beta.74"
```

The repo is on `effect ^3.21.2`. So **Vitest 4 ⇒ @effect/vitest 4 ⇒ Effect 4**.
`@effect/vitest` is imported in every test package (`import { it } from
"@effect/vitest"`), so there's no partial path. **Do not bump Vitest 4 until the
repo migrates to Effect 4 (currently beta) — treat this as an Effect-4 migration,
not a Vitest one.** Revisit when `effect@4` and `@effect/vitest@4` go stable.

### Second, smaller blocker (will bite during the Effect-4 migration)

Vitest 4 **drops the transitive `@types/node`** that Vitest 3 used to provide.
Packages that use Node globals (`process`, `Buffer`, `node:*`) but don't declare
`@types/node` directly then fail typecheck with:

```
TS2591: Cannot find name 'process'. ... add 'node' to the types field ...
```

Turbo's typecheck cache **masks this** — force with `turbo typecheck --force`.
Affected last time: `@repo/server`, `@repo/telemetry`, `@repo/layout-lint`.

Fix when it lands:
1. Add `@types/node` as an explicit `devDependency` to every package that uses
   Node built-ins.
2. For minimal tsconfigs where auto-`@types` inclusion still misbehaves, set
   `compilerOptions.types: ["node"]` (already done for `tooling/layout-lint`).

### What's already Vitest-4-ready

- `apps/web/vitest.config.ts` was migrated off the removed `environmentMatchGlobs`
  to **`projects`** (node + jsdom by directory) — works on 3.2+ *and* 4. No
  rework needed there.
- `tsdown` is already on 0.22.

### Steps (only once Effect 4 is stable)

1. Migrate the codebase to `effect@4` (separate, large effort — its own handoff).
2. Bump `@effect/vitest` → `^4`, `vitest` → `^4` across the 6 test packages
   (`apps/api`, `apps/web`, `packages/database`, `packages/server`,
   `packages/telemetry`, `tooling/layout-lint`).
3. Apply the `@types/node` fix above.
4. `turbo typecheck --force` + full test run, both unit and integration.

---

## Quick reference — the 6 test packages

```
apps/api  apps/web  packages/database  packages/server
packages/telemetry  tooling/layout-lint
```

## Suggested order

Track A (pnpm 11) is **done** (see ADR-003). Track B waits on the Effect 4 stable
release; don't start it speculatively against betas.
