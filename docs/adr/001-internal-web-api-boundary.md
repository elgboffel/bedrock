# ADR-001: Internal web→backend communication boundary

**Status:** Accepted  
**Date:** 2026-05-29  
**Deciders:** Project maintainers  

## Context

The bedrock monorepo has a `web` app (Astro + React, Fastify front-door) and an
`api` app (Fastify + Effect). They share `@repo/*` packages but are decoupled at
the package level — `web` never imports `api`. The **runtime** boundary between
them was unprotected: no caller auth, no header hygiene, api publicly reachable.

Because this is a bedrock (canonical example for future projects), whatever
pattern ships here becomes "the way". More public web apps and more private
backends will be added. The model must be safe, legible, and enforceable by
construction.

## Decision

Introduce a layered, defense-in-depth boundary. Five layers; L3 (mTLS)
intentionally deferred.

### L1 — Network isolation

Both apps deploy as Fargate Services in a single VPC. Public ALB per **web app
only**; backends have **no load balancer** — only Cloud Map private DNS. A
`PrivateBackend` SST factory enforces **source-SG ingress**: a backend accepts
its port only from its declared callers' Security Groups, no VPC-wide fallback.

### L2 — Per-backend shared secret

One `sst.Secret` per backend, distributed to callers via SST `link`. A reusable
`internal-auth` Effect Layer (`@repo/server`) registers a Fastify `onRequest`
hook that rejects requests lacking a valid `x-internal-auth` token with a bare
`401`. Comparison is constant-time (`crypto.timingSafeEqual` on SHA-256 digests).
**Fail-closed**: missing token config aborts boot.

Accepts both a current and a previous token for zero-downtime rotation (see
[Rotation runbook](#zero-downtime-token-rotation-runbook) below).

### L3 — mTLS (deferred)

Intentionally omitted while all traffic stays within a single VPC. Revisit only
if traffic crosses trust boundaries (cross-region, cross-cloud, untrusted
network).

### L4 — Proxy header hygiene (denylist)

A pure function `rewriteProxyHeaders` (`@repo/server/internal-proxy-headers`)
rewrites headers at the web→api proxy boundary:

- **Strips** entire `x-internal-*` and `x-user-*` namespaces (prevents browser
  forgery of internal or identity headers).
- **Re-authors** `x-forwarded-for` / `x-forwarded-proto` from actual client info.
- **Drops** `cookie`, `authorization` (web-as-boundary — end-user credentials
  never reach a backend), and hop-by-hop headers.
- **Forwards** everything else (denylist model — legitimate headers like `range`,
  `accept-encoding` pass without per-header maintenance).
- **Injects** `x-internal-auth` last (cannot be overridden).

Consumed by `@fastify/http-proxy`'s `rewriteRequestHeaders` in
`apps/web/src/server/plugins/plugins.ts`.

### L5 — Server-to-server typed client

`InternalClient` (`@repo/server/internal-client`) is a `@repo/contracts`-typed
client for server-to-server calls. Used by **both** web SSR **and**
backend→backend callers. Reads the target's private URL + token from config and
injects `x-internal-auth`.

**Server-only by construction**: lives in `@repo/server` (Node/crypto deps), so
any browser island importing it breaks the bundler. The browser fetches
`/api/*` through web's proxy instead.

### Identity model — web-as-boundary

Backends trust network + token and receive already-resolved identity via
web-authored `x-user-*` headers. Browser-supplied `x-user-*` is stripped at L4
so it cannot be forged. Backends do not re-implement end-user auth (no JWT/session
verification). The exact `x-user-*` field set is deferred until a backend needs
identity.

### Config flow — SST `link` → env → Effect `Config`

SST maps `link` outputs (secrets, resource URLs) into each Fargate Service's
`environment`. All application code reads config via Effect `Config` from env
vars. Shared packages (`@repo/server`, `@repo/database`, etc.) import **no SST
SDK** — compose, SST, and local dev look identical from the code's perspective.

Key config: `InternalAuthConfig` in `@repo/server/config` declares
`INTERNAL_AUTH_TOKEN` (required), `INTERNAL_AUTH_PREVIOUS_TOKEN` (optional, for
rotation), and `INTERNAL_AUTH_HEADER` (default `x-internal-auth`).

## Consequences

- Adding a new private backend = one `PrivateBackend` factory call + routes.
  No hand-copied security wiring.
- Local dev and tests exercise the **same** auth path as production — no bypass
  flag. `.env.example` ships `dev-insecure-token`; `docker-compose.yml` puts api
  on an internal network with no published port.
- Token rotation is a zero-downtime 3-step runbook (below).
- Browser-forged internal/identity headers are impossible by construction (L4).
- Future backends share the pattern; future web apps each get their own public
  ALB and can be authorized callers of any backend.

## Alternatives considered

- **Allowlist model for proxy headers** — rejected; requires ongoing maintenance
  as new legitimate headers appear. Denylist forwards unknown headers safely.
- **Per-edge tokens** (one secret per caller→callee pair) — rejected as
  over-engineering while the system has few services. One secret per backend is
  sufficient.
- **Lambda runtime** — rejected; persistent Fargate process preserves warm DB
  pool and long-running connection model.
- **API Gateway / ALB in front of backends** — rejected; adds cost and latency
  for internal-only traffic. Cloud Map private DNS is simpler.

---

## Zero-downtime token rotation runbook

Rotate a backend's `INTERNAL_AUTH_TOKEN` with zero dropped requests using the
dual-token acceptance window built into `internal-auth`.

### Prerequisites

- The backend's `internal-auth` Layer accepts both `token` (current) and
  `previousToken` (optional) from `InternalAuthConfig`.
- SST `sst.Secret` values can be updated via `sst secret set`.

### Steps

**Step 1 — Deploy backend accepting current + new token**

```bash
# Set the NEW token as current, keep the OLD token as previous
sst secret set ApiInternalAuthToken "new-secret-value"
sst secret set ApiInternalAuthPreviousToken "old-secret-value"
sst deploy
```

After this deploy, the backend accepts **both** tokens. Existing callers still
send the old token — requests succeed.

**Step 2 — Deploy callers sending the new token**

```bash
# Callers read the same secret via `link`. Once the secret value is updated
# and callers are redeployed, they start sending the new token.
sst deploy   # redeploys web (and any other callers)
```

After this deploy, all callers send the new token. The backend still accepts
both — zero interruption during rolling deploy.

**Step 3 — Drop the old token**

```bash
# Remove the previous token so only the new token is accepted
sst secret remove ApiInternalAuthPreviousToken
sst deploy
```

After this deploy, the backend accepts only the new token. Rotation complete.

### Verification

- Monitor for `401` responses during each step. There should be **zero**.
- After step 3, manually test with the old token to confirm rejection.

### Local dev

For local/compose rotation, update `INTERNAL_AUTH_TOKEN` and
`INTERNAL_AUTH_PREVIOUS_TOKEN` in `.env` and restart services.
