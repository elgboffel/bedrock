# ---------------------------------------------------------------------------
# Stage 1: deps — install all workspace dependencies
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps

RUN corepack enable && corepack prepare pnpm@10.14.0 --activate

WORKDIR /app

# Copy lockfile and workspace structure for pnpm install
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/common/package.json ./packages/common/
COPY packages/database/package.json ./packages/database/
COPY packages/server/package.json ./packages/server/
COPY packages/telemetry/package.json ./packages/telemetry/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/ui/package.json ./packages/ui/

RUN pnpm install --frozen-lockfile --ignore-scripts

# ---------------------------------------------------------------------------
# Stage 2: build — bundle with tsdown via turbo
# ---------------------------------------------------------------------------
FROM deps AS build

WORKDIR /app

# Copy all source (deps already in node_modules from previous stage)
COPY . .

# Build scoped to the api app (turbo handles dependency graph)
RUN pnpm turbo build --filter=api

# Deploy creates a self-contained directory with flat node_modules
# (production deps only, no symlinks — ideal for Docker)
RUN pnpm deploy --filter=api --prod --legacy /app/deployed

# ---------------------------------------------------------------------------
# Stage 3: runtime — minimal production image
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser

WORKDIR /app

# Copy production node_modules from pnpm deploy output
COPY --from=build /app/deployed/node_modules ./node_modules

# Copy built bundle
COPY --from=build /app/apps/api/dist ./dist

USER appuser

EXPOSE 3001

ENV NODE_ENV=production
ENV SERVER_PORT=3001

CMD ["node", "dist/index.mjs"]
