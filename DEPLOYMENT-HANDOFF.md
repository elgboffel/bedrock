# Deployment Handoff — AWS + SST

How to stand up the AWS account and wire SST so this monorepo deploys to
Fargate. This is the canonical deploy path for the bedrock; future projects copy
it.

The runtime topology and security model are decided in
[`docs/adr/001-internal-web-api-boundary.md`](docs/adr/001-internal-web-api-boundary.md).
This document is the **operational how-to** for that ADR — read the ADR first
for the *why*.

> **Status:** SST is **installed** and the deploy config is **scaffolded** in the
> repo (`sst.config.ts`, `infra/`). It typechecks and bundles, but has **not yet
> been deployed against a live AWS account** — sections 1, 4 and the open-items
> checklist are what remains. Treat the live deploy as the first real test.

## Target architecture

```
                 Internet
                    │
              ┌─────▼─────┐   public ALB (web only)
              │    web    │   Fargate Service · port 3000
              │ Astro SSR │   Fastify front-door + proxy
              └─────┬─────┘
                    │  Cloud Map private DNS + x-internal-auth token
              ┌─────▼─────┐   no load balancer
              │    api    │   Fargate Service · port 3001
              │ Fastify+  │   source-SG ingress only
              │  Effect   │
              └─────┬─────┘
                    │
              ┌─────▼─────┐
              │ Postgres  │   RDS (or Aurora Serverless v2)
              └───────────┘
```

- **One VPC.** web is public (ALB), api is private (Cloud Map DNS, no LB).
- **api ingress is source-SG locked** — accepts :3001 only from web's security
  group, not VPC-wide.
- **Secrets flow via SST `link`** → injected as env vars → read by Effect
  `Config`. No application package imports the SST SDK.
- Both apps already ship production **Dockerfiles** (`apps/{api,web}/Dockerfile`)
  using multi-stage builds + `pnpm deploy --prod`. SST builds these images and
  pushes to ECR.

## Prerequisites

- An AWS account (or a dedicated sub-account per stage; see "Stages").
- AWS CLI v2 installed and able to reach the account.
- Docker running locally (SST builds the app images).
- Node 22 + pnpm 10.14.0 (already pinned via Volta / `packageManager`).

## 1. AWS account setup

### 1.1 Create a deploy IAM principal

Do **not** deploy as the root user. Create an admin-capable principal for SST.

Preferred: **IAM Identity Center (SSO)** with an `AdministratorAccess`
permission set, then:

```bash
aws configure sso
# profile name e.g. bedrock-dev
export AWS_PROFILE=bedrock-dev
aws sts get-caller-identity   # sanity check
```

Fallback (long-lived keys, less preferred): create an IAM user with
`AdministratorAccess`, generate an access key, and `aws configure --profile bedrock-dev`.

> SST/Pulumi needs broad permissions (VPC, ECS, ECR, RDS, ELB, IAM, Secrets
> Manager, CloudWatch, Route53/Cloud Map). Start with admin; tighten later with a
> scoped policy once the resource set is stable.

### 1.2 Pick a region and confirm quotas

```bash
export AWS_REGION=eu-west-1   # or your choice; keep it consistent per stage
```

Default Fargate / VPC / EIP quotas are fine for a single VPC with two services.

### 1.3 (Optional) S3 + state

SST v3 (ion) stores state in a bootstrapped S3 bucket + DynamoDB table it
creates automatically on first run. Nothing to pre-create — `sst deploy` handles
bootstrap. Just make sure the principal can create those.

## 2. Bootstrap a fresh clone

SST is already a dependency (`sst ^4`). But `.sst/` (the generated provider
types, including `config.d.ts` that `sst.config.ts` references) is **gitignored
and not present on a fresh clone** — and nothing regenerates it automatically on
`git clone` or `pnpm install`. Until a `sst` command runs, `sst.config.ts` +
`infra/` won't typecheck and editors will flag the missing reference.

Run the bootstrap script once after cloning:

```bash
pnpm sst:bootstrap
```

It (`tooling/scripts/sst-bootstrap.sh`):

1. Runs `sst install` to generate `.sst/` so the config + `infra/` typecheck.
2. Checks the AWS CLI and that your chosen **profile** can reach an account
   (offers `aws configure sso` / `aws configure` if not).
3. Writes your non-secret choices (**profile, region, stage**) to a gitignored
   `sst.env.local` you can `source` before sst commands.
4. Optionally generates + stores `ApiInternalAuthToken` in SST for a stage.

It **never** writes AWS keys into the repo — credentials stay in `~/.aws`, SST
secrets stay in AWS SSM. In CI (`CI=1`) it runs only step 1.

```bash
# after bootstrap, load the chosen profile/region/stage:
set -a && source sst.env.local && set +a
```

The region is read from `AWS_REGION` (default `eu-west-1`) in `sst.config.ts`,
so bootstrap/CI set it without editing the config. Committed files:
`sst.config.ts`, `infra/`, `tooling/scripts/sst-bootstrap.sh`.

## 3. `sst.config.ts` + `infra/` (scaffolded)

The config is committed at `sst.config.ts` and reconstructs the ADR-001
architecture. Key pieces:

1. **VPC** — `new sst.aws.Vpc("Vpc", { nat: "managed" })`, one per stage.
2. **Postgres** — `new sst.aws.Postgres("Db", { vpc })`, RDS, linked to api.
3. **Secrets** — `ApiInternalAuthToken` + `ApiInternalAuthPreviousToken`
   (`sst.Secret`, one token per backend per ADR-001 L2).
4. **api** — created via the `PrivateBackend` factory: private `serviceRegistry`
   service, **no** load balancer, SG-locked to web only.
5. **web** — public `sst.aws.Service` with an ALB; joins a caller identity SG so
   api's ingress rule can reference it.

> **Note — SST requires dynamic imports in `sst.config.ts`.** Top-level
> `import` is rejected by SST's loader; the `infra/` helpers are pulled in with
> `await import(...)` inside `run()`.

### `infra/private-backend.ts` — the `PrivateBackend` factory (ADR-001 L1)

This is the construct future backends reuse — "one factory call + routes", no
hand-copied security wiring. It:

- creates a **dedicated security group** with open egress and **no ingress**,
  which **replaces** the SST/VPC default SG on the task. (Verified from the SST
  source: the default VPC SG admits the whole VPC CIDR — that is exactly the
  "VPC-wide fallback" ADR-001 forbids, so it must be replaced, not appended.)
- adds one `aws.vpc.SecurityGroupIngressRule` per caller, opening the service
  port **only** from that caller's security group.
- creates the `sst.aws.Service` with `serviceRegistry: { port }` (Cloud Map
  DNS, no ALB) and swaps in the locked-down SG via `transform.service`.

The backend still reaches Postgres: RDS sits on the VPC default SG which admits
the VPC CIDR, and the backend task keeps a VPC-internal IP, so egress→DB works
without punching an SG hole.

### `infra/caller.ts` — caller identity SG

`callerSecurityGroup()` mints a stable, egress-only SG and `appendSecurityGroup()`
is a `transform.service` callback that **appends** it to a service's task SGs
(keeping the default SG so the ALB→task and DB wiring stay intact). web uses
both so it can be named as an ingress source by `PrivateBackend`.

> **DB env vs `DATABASE_URL`:** the app reads discrete
> `DB_HOST/PORT/NAME/USER/PASSWORD` (see `.env.example` and
> `packages/database/src/config/config.ts`). The config maps the linked Postgres
> resource's getters to those env vars. If you'd rather use a single URL, add a
> `DATABASE_URL` Config to `@repo/database` first — don't diverge env shape
> silently.

## 4. Set secrets

`pnpm sst:bootstrap` can do this for you (step 4). To do it manually per stage,
before the first deploy:

```bash
# generate a strong token
export TOK=$(openssl rand -hex 32)

pnpm sst secret set ApiInternalAuthToken "$TOK" --stage dev
# previous token starts empty; only set during rotation
```

Never reuse the `.env` `dev-insecure-token` in any deployed stage — it is
intentionally insecure and for local compose only.

## 5. Deploy

```bash
# personal/dev stage (defaults to your username if --stage omitted)
pnpm sst deploy --stage dev

# production
pnpm sst deploy --stage production
```

First deploy provisions VPC + RDS and is slow (~10–20 min, mostly RDS). It
prints `web` URL on success. The api has **no** public URL by design.

### Database migrations

Drizzle migrations are **not** run by SST. After a deploy that changes schema,
run migrations against the stage DB. Options:

- a one-off SST `Task` / `sst shell` running the drizzle migrate command, or
- a CI step with tunneled DB access.

Wire this explicitly before relying on it — `packages/database` owns the drizzle
config (`drizzle.config.ts`).

## 6. Verify

- `curl https://<web-url>/` → web responds.
- `curl https://<web-url>/api/health` → proxied to api, `200`.
- api is **not** reachable from the internet (no ALB, private SG).
- Watch CloudWatch logs for both services; confirm **zero** `401`s (token wired
  correctly) and OTLP export if `OTEL_EXPORTER_ENDPOINT` is set.

## 7. Stages & teardown

- `dev` (or per-developer) and `production` are separate SST stages → separate
  VPC/DB/services. `removal: "retain"` protects production data; non-prod stages
  fully remove on `sst remove`.

```bash
pnpm sst remove --stage dev    # tears down a non-prod stage
```

## Token rotation

Zero-downtime rotation uses the dual-token window in `internal-auth`. The full
3-step runbook lives in
[ADR-001 → Zero-downtime token rotation runbook](docs/adr/001-internal-web-api-boundary.md#zero-downtime-token-rotation-runbook).

## Validating the config locally

No AWS account needed to confirm the config parses and typechecks:

```bash
# bundles + evaluates the config; fails only at AWS auth (expected)
npx sst diff --stage <name>
```

A clean run reaches `aws: failed to get shared config profile ...` — that means
the config and `infra/` loaded successfully and only credentials are missing.

## Open items / decide before production

- [ ] **First live deploy** — nothing here has touched real AWS yet.
- [ ] HTTPS: ACM cert + custom domain on the web ALB (currently `80/http`).
- [x] `PrivateBackend` factory implemented (`infra/private-backend.ts`) and api
      wired onto it in `sst.config.ts`.
- [ ] Confirm the `transform.service` SG swap/append behaves as intended on a
      real deploy (SG membership + ingress) — it is source-verified but untested live.
- [ ] DB migration runner wired (SST Task or CI step).
- [ ] Lock down RDS too if needed — it currently sits on the VPC default SG
      (VPC-CIDR ingress). ADR-001 scopes only the web→api boundary.
- [ ] OTLP collector endpoint (`OTEL_EXPORTER_ENDPOINT`) for the deployed stages.
- [ ] Tighten the deploy IAM policy from `AdministratorAccess` to a scoped set.
- [ ] CI deploy (GitHub Actions OIDC → AWS, no long-lived keys).

> SST API surface (`sst.aws.Service`, `sst.aws.Postgres`, etc.) tracks the
> installed SST version (currently **sst ^4**). If a future upgrade changes the
> API, treat the committed `sst.config.ts` + `infra/` as the intent and adjust —
> the **architecture** (one VPC, public web ALB, private SG-locked api, linked
> secrets) is the contract, not the exact symbol names.
