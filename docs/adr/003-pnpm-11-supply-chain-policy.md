# ADR-003: Upgrade to pnpm 11 + supply-chain policy

**Status:** Accepted
**Date:** 2026-05-30
**Deciders:** Project maintainers

## Context

The "everything to latest" pass deferred the pnpm 10 → 11 bump (see
`UPGRADE-HANDOFF.md`, Track A). pnpm 11.5 ships two opt-out-by-default behaviours
that need an explicit decision rather than ad-hoc CI breakage:

1. **`minimumReleaseAge`** — refuses lockfile entries published within a cutoff
   window, **on by default in pnpm 11**. It rejects then-fresh lockfile entries.
   The policy is *desirable* (shrinks the npm-substitution / compromised-publish
   attack window) but it verifies the whole committed lockfile on frozen install,
   so it cannot be on while the lockfile still holds sub-cutoff pins.
2. **Build-script approval** — native/postinstall scripts (`esbuild`, `sharp`,
   `@parcel/watcher`, `msgpackr-extract`, `msw`, `protobufjs`, `cpu-features`,
   `ssh2`) trigger an interactive `pnpm approve-builds` prompt, which is
   non-deterministic in CI.

## Decision

- Pin `packageManager` to `pnpm@11.5.0`. pnpm self-activates this version; no
  corepack fight needed.
- **Opt OUT of `minimumReleaseAge` for now** (`minimumReleaseAge: 0`). pnpm 11
  turns this on by default at 1440 (24h) and verifies it against *every* lockfile
  entry on `--frozen-lockfile` (not just newly-resolved ones). Our lockfile is
  fresh from the "everything to latest" pass, so it contains ~13 pins published
  within the last 24h (`@aws-sdk/*`, `@inquirer/*`, `rolldown-plugin-dts`, …).
  Leaving the default on therefore makes a clean CI install fail with
  `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` until those deps age out — transient
  breakage we will not ship. `0` restores pnpm-10 parity (no such check existed),
  so this is *not* a security regression versus the prior baseline.
- Pin build-script decisions via pnpm 11's **`allowBuilds`** map, each set to
  `false`. The pnpm-10 green baseline never ran any of these postinstalls — the
  binaries come from prebuilt platform `optionalDependencies` — so `false` matches
  the known-good baseline. An *explicit* decision (true/false) is required: on a
  fresh install pnpm otherwise appends an `allowBuilds` template to
  `pnpm-workspace.yaml` and exits non-zero (`ERR_PNPM_IGNORED_BUILDS`).
  (`ignoredBuiltDependencies` is **not** a recognised key in pnpm 11.5 — don't use
  it; it silently fails to silence the error.)

## Consequences

- A clean `pnpm install --frozen-lockfile` is deterministic in CI: EXIT 0, no
  interactive prompt, no policy failure, and `pnpm-workspace.yaml` is not mutated.
- The lockfile did not change under pnpm 11, so no `node_modules` purge was needed.
- Full gate (`lint`, `lint:deps`, `typecheck`, `build`, `test`,
  `test:integration`) green on pnpm 11.5.0 / Node 25 from a clean install.
- CI's `pnpm/action-setup@v4` reads `packageManager` — no workflow edit required.
- If a future dep genuinely needs its build script run, flip its `allowBuilds`
  entry to `true` and re-verify the gate.

## Follow-up

- **Re-enable `minimumReleaseAge: 1440`** in a separate change once the lockfile
  has settled (all pins older than the cutoff). The policy is desirable; it just
  cannot be introduced in the same commit that freshens the lockfile. Verify with
  a clean `rm -rf node_modules && pnpm install --frozen-lockfile` before merging.
