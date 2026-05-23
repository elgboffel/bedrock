#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

info()  { printf "${GREEN}[preflight]${NC} %s\n" "$1"; }
warn()  { printf "${YELLOW}[preflight]${NC} %s\n" "$1"; }
fail()  { printf "${RED}[preflight]${NC} %s\n" "$1"; exit 1; }

# 1. Check .env exists
if [ ! -f .env ]; then
  warn ".env not found — copying from .env.example"
  cp .env.example .env
  info "Created .env — edit it if you need custom values"
fi

# 2. Check Docker is running
if ! docker info > /dev/null 2>&1; then
  fail "Docker is not running. Start Docker Desktop and try again."
fi

# 3. Check if Postgres container is running
CONTAINER_NAME="antigravity-postgres"

if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  info "Postgres container is already running"
else
  if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    warn "Postgres container exists but is stopped — starting it"
    docker compose up -d postgres
  else
    info "Starting Postgres container..."
    docker compose up -d postgres
  fi

  # 4. Wait for healthy
  info "Waiting for Postgres to be healthy..."
  RETRIES=30
  until docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null | grep -q "healthy"; do
    RETRIES=$((RETRIES - 1))
    if [ "$RETRIES" -le 0 ]; then
      fail "Postgres did not become healthy in time. Check: docker logs $CONTAINER_NAME"
    fi
    sleep 1
  done
fi

info "Postgres is healthy — ready to dev"
