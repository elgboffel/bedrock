# Single-VM Topology — Handoff (exploration, not built)

A **reference variant** of the bedrock that runs the whole stack on one cheap
virtual machine (EC2 / DigitalOcean droplet / any VPS) via `docker compose`,
instead of the canonical managed AWS topology (Fargate + RDS + ALB).

> **Status:** *exploration only — nothing built.* This document captures the
> decision shape and the work involved so a future session can pick it up. The
> canonical topology (`sst.config.ts`, `infra/`, `DEPLOYMENT-HANDOFF.md`) stays
> the default and is **not** touched by this.

## Why this exists / why it's separate

The managed topology (`DEPLOYMENT-HANDOFF.md`) is the **canonical** path — a
bedrock teaches "the one way", not a menu. But early-stage / cost-sensitive
projects may want a ~$15/mo single box instead of ~$60/mo of managed services.

We deliberately reject **two co-equal paths in one repo** (forks the user's
day-one decision, doubles the maintained surface, and splits the security model
— see below). Instead this variant lives as a **separate branch**, so each
artifact stays internally canonical.

### The decision that frames everything

**Is this variant *living* (always-green, co-evolves with app code) or
*reference* (a good point-in-time starting point)?**

A bedrock's audience **copies once, then diverges.** That argues for
**reference-grade**: a branch that's a solid starting point, allowed to lag
`main` slightly, re-synced on demand — *not* a fork with permanent cross-repo
sync cost. This handoff assumes reference-grade. If someone later wants it
living/first-class, revisit (submodule/overlay to single-source app code; a
full fork is heavy machinery for a 5% variation).

## What actually differs (small surface)

The product is **identical** in both worlds. Only the **deploy layer** changes:

| File / concern | Managed (canonical) | Single-VM (this variant) |
| --- | --- | --- |
| Runtime | Fargate ×2 services | `docker compose` on one host |
| DB | RDS Postgres | `postgres:16` container (or managed DB addon) |
| Front door | public ALB | host port `:80/:443` → web `:3000` |
| api isolation | dedicated SG, source-locked (ADR-001) | compose `internal` bridge network |
| Secrets | SST `link` → SSM → env | `.env` on the box / VM secret store |
| IaC | `sst.config.ts` + `infra/` | provision script + `docker-compose.prod.yml` |
| Migrations | SST Task / CI step | `drizzle migrate` on the box |

**Crucial caveat — ADR-001 is weaker here.** The web→api boundary
(`docs/adr/001-internal-web-api-boundary.md`) relies on network isolation
(L1: per-backend SG ingress). On a single VM, web + api share a host and the
compose `internal` network — the L1 network layer collapses to a docker bridge.
**L2 (per-backend token), L4 (proxy header denylist), L5 (typed client) still
hold**; only L1 degrades. Any single-VM deploy doc must say this loudly — it is
a *different security posture*, not just a cheaper one. This is also why
shipping the variant at all is a judgement call: does a weaker-boundary example
dilute the lesson, even on a separate branch?

## Already in place (most of the work is done)

`docker-compose.yml` **already is** this topology:

- `postgres` — `postgres:16-alpine`, healthcheck, `pgdata` volume.
- `api` — built from `apps/api/Dockerfile`, `expose: 3001` (not published →
  not reachable from outside the box), on the `internal` bridge network.
- `web` — built from `apps/web/Dockerfile`, `ports: 3000:3000`, reaches api at
  `http://api:3001`, carries `INTERNAL_AUTH_TOKEN`.

So the dev-grade single-VM stack runs today with `docker compose up`. The
variant work is **hardening it for a remote, internet-facing box** + provisioning.

## What it would take (the branch work)

Create branch `topology/single-vm` off `main`. Then:

### 1. A production compose overlay — `docker-compose.prod.yml`

- Replace `build:` with **pulled images** (`image: <registry>/bedrock-api:<tag>`)
  so the box doesn't compile — build+push in CI, pull on the host. Or keep
  `build:` if building on the box is acceptable (slower, needs source on host).
- Drop dev port publishing for `postgres` (`5432` should **not** be public).
- Pin `restart: always`, set resource limits, log rotation
  (`logging: { driver: json-file, options: { max-size, max-file } }`).
- Env from a root `.env` on the box (real secrets, **not** the
  `dev-insecure-token`) — generate `INTERNAL_AUTH_TOKEN` with
  `openssl rand -hex 32`, mirror the secret model from `DEPLOYMENT-HANDOFF.md` §4.

### 2. TLS / front door

Compose `web` listens `:3000`. For the internet you need `:443` + a cert:

- Add a reverse proxy container — **Caddy** (auto-Let's-Encrypt, simplest) or
  Traefik/nginx — terminating TLS on `:443`, proxying to `web:3000`. Caddy = a
  few lines + a domain.
- Point DNS A record at the box's static/elastic IP.

### 3. Box provisioning

- **EC2:** `t4g.small` (~$12/mo) + Elastic IP, security group allowing only
  `:80/:443` (and `:22` from your IP). User-data installs Docker + compose,
  clones/pulls, `docker compose -f docker-compose.prod.yml up -d`.
- **DO droplet:** same idea, the user's existing platform.
- Keep it scriptable: a `tooling/scripts/provision-vm.sh` (cloud-init / user-data)
  so the box is reproducible, not a hand-built pet.

### 4. Database durability (the real ops cost you take on)

Single container Postgres means **you own backups**. Either:

- `pg_dump` cron → off-box storage (S3/Spaces), tested restore, **or**
- use a managed DB addon (RDS / DO Managed Postgres) and point `DB_HOST` at it —
  partially defeats the cost goal but keeps backups managed.

State this trade-off explicitly: cheapest = self-managed Postgres = you are the
DBA.

### 5. Migrations

`drizzle migrate` run on the box after deploy (`packages/database` owns
`drizzle.config.ts`). A one-liner in the deploy script:
`docker compose run --rm api pnpm --filter @repo/database migrate` (or equivalent
once a migrate script exists).

### 6. Deploy flow

- CI builds + pushes images (reuse the existing Dockerfiles).
- Deploy = SSH to box → `docker compose pull && docker compose up -d` →
  run migrations. Brief downtime on `web` restart (acceptable for this tier;
  call it out vs the managed path's rolling deploy).
- Optional: `watchtower` or a tiny webhook for pull-on-push.

### 7. Docs + ADR

- `SINGLE-VM-DEPLOY.md` on the branch — the operational how-to, mirroring
  `DEPLOYMENT-HANDOFF.md`'s shape, **headlining the ADR-001 L1 caveat**.
- An ADR recording: *single canonical managed topology on `main`; single-VM as a
  reference branch variant; explicitly weaker network boundary; reference-grade
  not living.* So the **why** is captured, not folded silently into tooling.

## Explicitly NOT doing

- **Not** branching infra choice inside `bootstrap` — bootstrap stays dumb
  (gen types, check creds, write env). Topology is picked by *which branch you
  copy*, not a prompt.
- **Not** a full fork — reference branch, re-synced on demand.
- **Not** touching `main`'s `sst.config.ts` / `infra/`.

## Open questions to resolve before building

1. Living vs reference — confirmed reference here; re-confirm before investing.
2. Is single-VM a **supported product** or a **nice-to-have example**? Drives how
   much polish (provision script, CI, TLS automation) is worth it.
3. Does the weaker ADR-001 boundary make this a **worse teaching artifact**? If
   yes, maybe it stays a doc-only recipe, not a maintained branch.
4. Self-managed Postgres backups vs managed DB addon — which default?
5. Registry for images on the VM path — GHCR? ECR? DO Container Registry?

## Cost sketch (single VM, 24/7, flat)

| Item | ~$/mo |
| --- | --- |
| `t4g.small` (or DO droplet) | ~$12 |
| EBS / disk (~20–30 GB) | ~$2–3 |
| Elastic IP (attached) | $0 |
| Backups to object storage | ~$1 |
| **Total** | **~$15** flat |

vs managed dev ~$60/mo. The flat low cost is the entire point of this variant —
paid for with the ops you take on (patching, backups, weaker isolation,
downtime-on-deploy).
