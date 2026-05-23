# ---------------------------------------------------------------------------
# Stage 1: deps — install all workspace dependencies
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps

RUN corepack enable && corepack prepare pnpm@10.14.0 --activate

WORKDIR /app

# Copy lockfile and workspace structure for pnpm install
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/common/package.json ./packages/common/
COPY packages/database/package.json ./packages/database/
COPY packages/server/package.json ./packages/server/
COPY packages/telemetry/package.json ./packages/telemetry/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/ui/package.json ./packages/ui/

RUN pnpm install --frozen-lockfile --ignore-scripts

# ---------------------------------------------------------------------------
# Stage 2: build — astro build + tsdown bundle
# ---------------------------------------------------------------------------
FROM deps AS build

WORKDIR /app

# Copy all source (deps already in node_modules from previous stage)
COPY . .

# Build scoped to the web app (turbo handles dependency graph)
# This runs: astro build && tsdown
# Output:
#   dist/server/entry.mjs  — Astro SSR handler
#   dist/client/           — static assets (JS, CSS, images)
#   dist/server-runner/    — tsdown-bundled Fastify server entry
RUN pnpm turbo build --filter=web

# Deploy creates a self-contained directory with flat node_modules
# (production deps only, no symlinks — ideal for Docker)
RUN pnpm deploy --filter=web --prod --legacy /app/deployed

# ---------------------------------------------------------------------------
# Stage 3: runtime — minimal production image
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser

WORKDIR /app

# Copy production node_modules from pnpm deploy output
COPY --from=build /app/deployed/node_modules ./node_modules

# Copy all build output:
# - dist/server-runner/  — Fastify server entry (tsdown bundle)
# - dist/server/         — Astro SSR handler (entry.mjs)
# - dist/client/         — static assets served by @fastify/static
COPY --from=build /app/apps/web/dist ./dist

USER appuser

EXPOSE 3000

ENV NODE_ENV=production
ENV SERVER_PORT=3000

CMD ["node", "dist/server-runner/index.mjs"]
