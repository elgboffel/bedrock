# Dev Deploy Hardening — Handoff

Context for continuing the AWS/CI deploy work in a fresh session. Focus: the
auto dev-deploy lifecycle is wired, the **orphaned-resource problem has been
root-caused and fixed**, but a **first fully-green deploy has not happened yet**.

/ Author note: written after a session that stood up AWS from scratch, wired
GitHub Actions → SST, hit several first-deploy bugs, and cleaned up the mess.

## TL;DR state

- AWS account live: `438740432282`, region **eu-north-1**, SSO profile `elgboffel`.
- CI deploy path (OIDC role + GitHub vars + prod reviewer gate) is **set up and
  verified**.
- Dev lifecycle in `.github/workflows/ci.yml`: push to `dev` → auto deploy →
  1h timed teardown → nightly + manual backstop.
- **All AWS resources currently removed — $0/hr running.** (Tag Editor may still
  *display* terminated/stale ARNs for hours; ignore — service consoles are truth.)
- **No successful deploy yet.** Several config bugs were fixed (below); next step
  is one clean deploy.
- **8 local commits are NOT pushed** (`main` ahead of `origin/main`). `origin/dev`
  is behind local `dev`. Push before relying on CI.

## What caused resources to be created on failures (THE thing to not repeat)

Root cause was **`cancel-in-progress: true` at workflow level killing `sst deploy`
mid-flight.** Sequence: deploy creates RDS → a new push cancels the job before SST
flushes state → next run doesn't know RDS exists → creates a second one → orphan.
Same kill also left the SST **state lock** held. Result we saw: 2 RDS, 2 ALBs,
duplicate stuck resources, and "concurrent update / locked" errors.

> A *clean* `sst deploy` error does NOT orphan — Pulumi records what it made and
> the next run reconciles. Only **cancellation mid-write** orphans. So the rule
> is: never cancel a deploy.

### Fix applied (commit `8c692a2`)

Concurrency moved from workflow-level to **per-job** in `ci.yml`:

| Job | `cancel-in-progress` | Why |
| --- | --- | --- |
| `ci`, `integration` | `true` | cheap tests — cancel superseded runs |
| `deploy` (prod) | **`false`** | never kill a deploy; serialize instead |
| `deploy-dev` | **`false`** | new push QUEUES behind running deploy |
| `teardown-dev` | `true` | safe — almost always mid-`sleep` |
| `nightly-teardown-dev` | `false` | shares teardown group; let backstop finish |

Net: pushing to `dev` while a deploy runs now **waits** instead of killing it →
no orphans, no stale lock. Trade-off: rapid dev pushes serialize (acceptable).

### Layered safeguards now in place

1. **Don't cancel deploys** (per-job concurrency) — stops orphans/locks at source.
2. **Defensive `pnpm sst unlock --stage dev`** before `deploy-dev` (commit
   `a0bad2a`, `continue-on-error`) — clears a stale lock from any *other* hard
   failure. dev only; never prod.
3. **Timed (1h) + nightly (02:00 UTC) + manual teardown** — dev can't linger.
4. **Required reviewer on `production` environment** (GitHub setting, reviewer =
   `elgboffel`) — an accidental push to `main` pauses for approval, never
   auto-deploys.

## First-deploy bugs fixed this session (all committed)

| Commit | Fix |
| --- | --- |
| `d94970f` | SG **GroupDescription** must be ASCII — removed em dash `—`. |
| `85d82c3` | SG **ingress rule description** charset — `>` is invalid; `->` → `to`. |
| `83eb1e5` | Root `deploy` script shadowed pnpm's built-in `pnpm deploy` used in app Dockerfiles → renamed to `deploy:sst`. |
| `d76a658` | Per-stage NAT: `managed` in production, cheap `ec2` for non-prod. |
| `306d4bc` | Scripts to automate the AWS OIDC role + GitHub vars. |

> If a future SG description regresses, the allowed charset is:
> `a-zA-Z0-9. _-:/()#,@[]+=&;{}!$*` (no `>`, no non-ASCII). See
> `infra/private-backend.ts`.

## AWS / CI setup that already exists (don't redo)

- **OIDC provider** `token.actions.githubusercontent.com` in the account.
- **IAM role** `bedrock-ci-deploy`, `AdministratorAccess` (broad — tighten later),
  trust scoped to `repo:elgboffel/bedrock` branches `main` + `dev` and
  `environment:production`.
- **GitHub repo variables**: `AWS_DEPLOY_ROLE_ARN`, `AWS_REGION=eu-north-1`.
- **`production` environment** with required reviewer.
- Recreate/repair via `pnpm ci:setup-oidc` and `pnpm ci:setup-github`
  (`tooling/scripts/setup-ci-*.sh`) — both idempotent.

## NEXT STEPS (in order)

1. **Push the unpushed work** so CI has the fixes:
   ```bash
   git push origin main
   git push origin dev
   ```
2. **Re-set the dev secret** — `sst remove` deleted it:
   ```bash
   set -a && source sst.env.local && set +a
   pnpm sst secret set ApiInternalAuthToken "$(openssl rand -hex 32)" --stage dev
   ```
3. **Get ONE clean deploy** — recommend **local first** for fast feedback before
   trusting CI:
   ```bash
   pnpm sst deploy --stage dev      # watch it go green end-to-end
   ```
   Then verify the `web` URL responds and `/api/health` proxies `200`
   (DEPLOYMENT-HANDOFF.md §6). Then teardown: `pnpm sst remove --stage dev`.
4. **Then** push `dev` and confirm the full CI loop: deploy → ~1h → teardown,
   and that a second quick push *queues* (doesn't cancel) the first deploy.

## Known open items (carried over)

- [ ] **First fully-green deploy** — not achieved yet; do step 3 above.
- [ ] **DB migration runner** — Drizzle migrations are NOT run by SST, and the
      dev DB is wiped every teardown (`removal: "remove"` for non-prod). The app
      will boot against an empty schema until this is wired. **Do before relying
      on dev.** See DEPLOYMENT-HANDOFF.md "Database migrations".
- [ ] HTTPS/domain on the web ALB (currently `80/http`).
- [ ] Tighten `bedrock-ci-deploy` IAM off `AdministratorAccess`.
- [ ] If a deploy ever leaves orphans again: cleanup recipe is — disable RDS
      deletion protection + `delete-db-instance --skip-final-snapshot`, delete
      orphan ALB, wait for RDS gone, then `sst remove --stage dev`, then verify
      with per-service `describe-*` (NOT the lagging Tag Editor).

## Useful facts / gotchas

- **Region matters in the console** — set top-right to *Europe (Stockholm)*; an
  empty dashboard usually = wrong region.
- **Tag Editor lags** — lists destroyed ARNs for hours. Trust `aws ... describe-*`
  per service, or the service consoles, for ground truth.
- **Terminated EC2** = already gone, $0, auto-reaped ~1h; can't re-terminate.
- Intended always-present (free/pennies): ECR `sst-asset`, `/sst/*` SSM params,
  `sst-state-*` / `sst-asset-*` S3 buckets. Do **not** delete.
- Local creds: `set -a && source sst.env.local && set +a` (profile/region/stage).
  If SSO expired: `aws sso login --profile elgboffel`.

## Related docs

- `CI-CD-HANDOFF.md` — original CI design.
- `DEPLOYMENT-HANDOFF.md` — AWS + SST operational how-to (architecture, secrets,
  verify, stages, migrations).
- `SINGLE-VM-TOPOLOGY-HANDOFF.md` — the cheap single-VM variant (exploration).
