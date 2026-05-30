#!/usr/bin/env bash
#
# setup-ci-github.sh — set the GitHub side of the CI deploy.
#
# Sets the repo variables the workflow reads:
#   - AWS_DEPLOY_ROLE_ARN  (the IAM role from setup-ci-oidc.sh)
#   - AWS_REGION
# Optionally creates the `production` GitHub Environment (the prod-deploy gate;
# add a required reviewer in the repo UI afterwards — the API can't set humans
# as reviewers without their user IDs).
#
# These are GitHub *variables*, not secrets — the role ARN and region are not
# sensitive (the role only works when assumed via OIDC from this repo).
#
# Usage:
#   AWS_DEPLOY_ROLE_ARN=arn:aws:iam::123:role/bedrock-ci-deploy \
#   AWS_REGION=eu-north-1 \
#     pnpm ci:setup-github
#   # If AWS_DEPLOY_ROLE_ARN is omitted, it is derived from ROLE_NAME via AWS.

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; NC='\033[0m'
info() { printf "${GREEN}[ci-github]${NC} %s\n" "$1"; }
warn() { printf "${YELLOW}[ci-github]${NC} %s\n" "$1"; }
fail() { printf "${RED}[ci-github]${NC} %s\n" "$1"; exit 1; }

command -v gh > /dev/null 2>&1 || fail "GitHub CLI (gh) not found. brew install gh"
gh auth status > /dev/null 2>&1 || fail "Not logged in to gh. Run: gh auth login"

# --- Inputs ----------------------------------------------------------------
GH_REPO="${GH_REPO:-$(git remote get-url origin 2>/dev/null \
  | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')}"
[ -n "$GH_REPO" ] || fail "Could not derive GH_REPO. Set GH_REPO=owner/repo."
AWS_REGION="${AWS_REGION:-eu-north-1}"
ROLE_NAME="${ROLE_NAME:-bedrock-ci-deploy}"

# Derive the role ARN from AWS if not given.
if [ -z "${AWS_DEPLOY_ROLE_ARN:-}" ]; then
  command -v aws > /dev/null 2>&1 || fail "AWS_DEPLOY_ROLE_ARN unset and AWS CLI missing."
  ACCOUNT="$(aws sts get-caller-identity --query Account --output text)" \
    || fail "AWS_DEPLOY_ROLE_ARN unset and cannot reach AWS to derive it."
  AWS_DEPLOY_ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${ROLE_NAME}"
  info "Derived role ARN: $AWS_DEPLOY_ROLE_ARN"
fi

info "Repo:   $GH_REPO"
info "Region: $AWS_REGION"

# --- Repo variables --------------------------------------------------------
info "Setting repo variable AWS_DEPLOY_ROLE_ARN ..."
gh variable set AWS_DEPLOY_ROLE_ARN --repo "$GH_REPO" --body "$AWS_DEPLOY_ROLE_ARN"
info "Setting repo variable AWS_REGION ..."
gh variable set AWS_REGION --repo "$GH_REPO" --body "$AWS_REGION"

# --- production environment (optional gate) --------------------------------
info "Ensuring 'production' GitHub Environment exists ..."
if gh api -X PUT "repos/${GH_REPO}/environments/production" > /dev/null 2>&1; then
  info "'production' environment present."
  warn "Add a REQUIRED REVIEWER in the repo UI:"
  warn "  Settings → Environments → production → Required reviewers."
  warn "  (API can't set reviewers without their numeric user IDs.)"
else
  warn "Could not create 'production' environment (private repo without"
  warn "GitHub Pro / org may block Environments). Skipped — prod gate optional"
  warn "for the dev-stage test."
fi

info "Done. Current repo variables:"
gh variable list --repo "$GH_REPO"
