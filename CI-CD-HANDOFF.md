# CI/CD Handoff — GitHub Actions + SST deploy

Goal: add GitHub Actions that run **lint → typecheck → tests → build** on every
PR/push, then **deploy with SST** only when those checks pass on `main`.

This is a *to-build* handoff — nothing here exists yet. Pick it up in a fresh
session. The deploy half builds on `DEPLOYMENT-HANDOFF.md` (read that first).

## Current state (facts gathered)

- **No `.github/` exists yet** — clean slate.
- Root scripts already cover everything CI needs:
  - `pnpm lint` (Turbo → Biome), `pnpm lint:deps` (syncpack),
    `pnpm typecheck` (Turbo → tsc/astro), `pnpm build` (Turbo), `pnpm test`
    (Turbo → vitest).
  - `pnpm check` = `biome check . && turbo typecheck check`.
- **Tests need Docker.** The default vitest include (`src/**/*.test.ts`) also
  matches the `*.integration.test.ts` files, which use **testcontainers**
  (Postgres). So `pnpm test` spins up Docker. `ubuntu-latest` ships Docker, so
  this works on GitHub-hosted runners — the test job just pulls `postgres:16`.
  - Integration tests live in `apps/api` and `packages/database`
    (`test:integration` scripts, `vitest.integration.config.ts`, 60s timeouts).
- Toolchain pins: Node **22.22.0** (Volta in root `package.json`), pnpm
  **10.14.0** (`packageManager`).
- SST is installed (`sst ^4`); deploy config is committed (`sst.config.ts`,
  `infra/`). Region is env-driven via `AWS_REGION` (default `eu-west-1`).

## Design — one workflow, two gated jobs

`.github/workflows/ci.yml`:

```
on: pull_request + push to main
  job ci:      install → lint → lint:deps → typecheck → build → test
  job deploy:  needs: ci, runs only on push to main → sst deploy
```

A single `needs: ci` gives "checks first, deploy only if green" without a second
`workflow_run` workflow. Keep it one file.

## Decisions (recommended defaults chosen — change if needed)

1. **AWS auth = OIDC role assumption** (no long-lived keys). This was already the
   open item in `DEPLOYMENT-HANDOFF.md`. Requires one-time AWS setup (below).
   - Alternative rejected: `AWS_ACCESS_KEY_ID/SECRET` as GH secrets — long-lived
     creds, not fit for a "canonical" repo.
2. **Deploy trigger = push to `main`, gated behind a GitHub Environment with a
   required reviewer.** Every merge *proposes* a prod deploy; a human clicks
   approve before it runs.
   - Alternatives: auto-deploy on main (no gate) / `workflow_dispatch`-only.
3. **Integration tests run in CI** (Docker is available). One test job, no split.

> If the person picking this up disagrees with 1 or 2, those are the only real
> branch points — the rest of the plan is mechanical.

## Prerequisite — must happen BEFORE CI can deploy

CI cannot bootstrap from nothing. A human must, once per account/stage, run from
their machine (see `DEPLOYMENT-HANDOFF.md`):

```bash
pnpm sst:bootstrap                 # AWS profile/region, generates .sst
pnpm sst secret set ApiInternalAuthToken "$(openssl rand -hex 32)" --stage production
pnpm sst deploy --stage production # first deploy creates VPC/RDS/state
```

SST state (S3/DynamoDB), secrets (SSM), and the RDS instance must exist before
the deploy job runs. CI deploys *updates*, it does not bootstrap.

## One-time AWS setup for OIDC

1. Create the GitHub OIDC identity provider in the AWS account
   (`token.actions.githubusercontent.com`, audience `sts.amazonaws.com`).
2. Create an IAM **deploy role** trusting that provider, scoped to this repo
   (`repo:<org>/<repo>:ref:refs/heads/main` and/or the `production`
   environment). Start with broad perms (SST needs VPC/ECS/ECR/RDS/ELB/IAM/
   Secrets/CloudWatch), tighten later.
3. Note the role ARN. Put it in a GitHub repo **variable** `AWS_DEPLOY_ROLE_ARN`
   (or secret) and set `AWS_REGION` as a repo variable.
4. Create a GitHub **Environment** named `production` with a required reviewer.

## Implementation steps (for the new session)

1. Add `.github/workflows/ci.yml` with the structure below.
2. Use `pnpm/action-setup` (reads `packageManager`) + `actions/setup-node@v4`
   with `node-version: 22.22.0` and `cache: pnpm`.
3. `pnpm install --frozen-lockfile`, then run the check steps.
4. Deploy job: `aws-actions/configure-aws-credentials@v4` with
   `role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}` + `permissions: id-token: write`,
   then `pnpm sst deploy --stage production`.
5. Verify a PR runs the `ci` job only; a push to `main` runs `ci` then waits on
   the `production` environment approval before `deploy`.
6. Update `DEPLOYMENT-HANDOFF.md`: tick the "CI deploy (OIDC)" open item and
   link to this workflow. Consider a short ADR for the OIDC + gated-deploy call.

## Starter `ci.yml` (draft — verify action versions)

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22.22.0
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm lint:deps
      - run: pnpm typecheck
      - run: pnpm build
      - run: pnpm test # testcontainers: Docker is available on ubuntu-latest

  deploy:
    needs: ci
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    environment: production # required-reviewer gate
    permissions:
      id-token: write # OIDC
      contents: read
    env:
      AWS_REGION: ${{ vars.AWS_REGION }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22.22.0
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}
      - run: pnpm sst deploy --stage production
```

## Open questions / watch-outs

- **`pnpm build` before `pnpm test`?** Turbo's `test` task already
  `dependsOn: ["^build"]`, so test builds deps as needed. Keeping an explicit
  `build` step first surfaces build breaks earlier and warms the Turbo cache.
- **Integration-test flakiness/timeouts** under load — default unit config has a
  5s `testTimeout`; the dedicated integration config bumps to 60s. Confirm the
  testcontainers tests actually pass under the *default* config in CI, or split
  them into their own `test:integration` step/job.
- **Turbo remote cache** (Vercel or self-hosted) is optional; skip for v1.
- **Concurrency**: add a `concurrency` group to cancel superseded PR runs.
- **Cost/safety**: the gated `production` environment is the guardrail against
  an accidental prod deploy on every merge.
