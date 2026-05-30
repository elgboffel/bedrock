#!/usr/bin/env bash
#
# setup-ci-oidc.sh — create the AWS side of GitHub Actions → AWS deploys.
#
# Creates (idempotently):
#   1. A GitHub OIDC identity provider in the AWS account.
#   2. An IAM deploy role that trusts this repo's main + dev branches and the
#      `production` GitHub Environment, assumable only via that OIDC provider.
#   3. Attaches AdministratorAccess to the role (start broad; tighten later —
#      see CI-CD-HANDOFF.md / DEPLOYMENT-HANDOFF.md open items).
#
# Run ONCE per AWS account (not per clone). Re-running is safe: it updates the
# trust policy and re-attaches the policy without erroring.
#
# It prints the role ARN at the end — feed that to setup-ci-github.sh (or it can
# read it back by role name).
#
# Usage:
#   AWS_PROFILE=elgboffel AWS_REGION=eu-north-1 \
#     pnpm ci:setup-oidc
#   # optional overrides:
#   #   GH_REPO=owner/repo  ROLE_NAME=bedrock-ci-deploy  BRANCHES="main dev"

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; NC='\033[0m'
info() { printf "${GREEN}[ci-oidc]${NC} %s\n" "$1"; }
warn() { printf "${YELLOW}[ci-oidc]${NC} %s\n" "$1"; }
fail() { printf "${RED}[ci-oidc]${NC} %s\n" "$1"; exit 1; }

command -v aws > /dev/null 2>&1 || fail "AWS CLI not found. Install it first."

# --- Inputs ----------------------------------------------------------------
GH_REPO="${GH_REPO:-$(git remote get-url origin 2>/dev/null \
  | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')}"
[ -n "$GH_REPO" ] || fail "Could not derive GH_REPO. Set GH_REPO=owner/repo."
ROLE_NAME="${ROLE_NAME:-bedrock-ci-deploy}"
BRANCHES="${BRANCHES:-main dev}"
PROVIDER_HOST="token.actions.githubusercontent.com"

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)" \
  || fail "Cannot reach AWS. Check AWS_PROFILE / aws sso login."
PROVIDER_ARN="arn:aws:iam::${ACCOUNT}:oidc-provider/${PROVIDER_HOST}"

info "Account:  $ACCOUNT"
info "Repo:     $GH_REPO"
info "Role:     $ROLE_NAME"
info "Branches: $BRANCHES (+ environment:production)"

# --- 1. OIDC provider ------------------------------------------------------
if aws iam get-open-id-connect-provider \
     --open-id-connect-provider-arn "$PROVIDER_ARN" > /dev/null 2>&1; then
  info "OIDC provider already exists — reusing."
else
  info "Creating GitHub OIDC provider ..."
  # GitHub's CA thumbprints. AWS validates GitHub's OIDC against its own trust
  # store, but the API still requires a thumbprint argument.
  aws iam create-open-id-connect-provider \
    --url "https://${PROVIDER_HOST}" \
    --client-id-list "sts.amazonaws.com" \
    --thumbprint-list \
      6938fd4d98bab03faadb97b34396831e3780aea1 \
      1c58a3a8518e8759bf075b76b750d4f2df264fcb > /dev/null
  info "OIDC provider created."
fi

# --- 2. Trust policy -------------------------------------------------------
# Build the sub-claim list: one per branch plus the production environment.
SUBS=""
for b in $BRANCHES; do
  SUBS="${SUBS}\"repo:${GH_REPO}:ref:refs/heads/${b}\","
done
SUBS="${SUBS}\"repo:${GH_REPO}:environment:production\""

TRUST="$(mktemp)"
cat > "$TRUST" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Federated": "${PROVIDER_ARN}" },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": { "${PROVIDER_HOST}:aud": "sts.amazonaws.com" },
        "StringLike": { "${PROVIDER_HOST}:sub": [ ${SUBS} ] }
      }
    }
  ]
}
EOF

# --- 3. Role ---------------------------------------------------------------
if aws iam get-role --role-name "$ROLE_NAME" > /dev/null 2>&1; then
  info "Role exists — updating trust policy ..."
  aws iam update-assume-role-policy \
    --role-name "$ROLE_NAME" --policy-document "file://${TRUST}"
else
  info "Creating role ..."
  aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document "file://${TRUST}" \
    --description "GitHub Actions OIDC deploy role for ${GH_REPO} (SST)" > /dev/null
fi

info "Attaching AdministratorAccess (broad; tighten later) ..."
aws iam attach-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess

rm -f "$TRUST"

ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${ROLE_NAME}"
info "Done. Deploy role ARN:"
printf "  %s\n" "$ROLE_ARN"
info "Next: set GitHub repo variables —"
printf "  AWS_DEPLOY_ROLE_ARN=%s pnpm ci:setup-github\n" "$ROLE_ARN"
