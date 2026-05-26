# Bedrock Monorepo

This is a high-performance monorepo build with **TurboRepo**, **pnpm**, **Fastify**, **Astro**, and **React**. It features a modern toolchain including **Biome**, **Changesets**, **Syncpack**, and **tsup**.

## Prerequisites

- **Node.js**: v18+ (LTS recommended)
- **pnpm**: v9+ (Managed via Corepack or installed globally)

## Getting Started

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Development

Run all applications in development mode with **hot reloading** and **server auto-restart**.

```bash
pnpm dev
```

- **Web App**: [http://localhost:3000](http://localhost:3000) (Fastify proxying to Astro)
- **API**: [http://localhost:3001](http://localhost:3001)

### 3. Build

Build all packages and applications for production.

```bash
pnpm build
```

### 4. Production Start

Run the built production applications.

```bash
pnpm start
```

## Workflows

### Versioning & Publishing (Changesets)

We use [Changesets](https://github.com/changesets/changesets) to manage versions and changelogs.

**When you make a change that needs a version bump:**

1.  Run the changeset wizard:
    ```bash
    pnpm changeset
    ```
2.  Select the packages you modified.
3.  Select the bump type (major/minor/patch).
4.  Write a summary of the changes.

This creates a markdown file in `.changeset/`. Commit this file with your code.

**To release (typically handled by CI):**

1.  Consumes changesets and updates `package.json` versions + `CHANGELOG.md`:
    ```bash
    pnpm changeset version
    ```
2.  Publish to registry:
    ```bash
    pnpm changeset publish
    ```

### Dependency Management (Syncpack)

We use [Syncpack](https://github.com/JamieMason/syncpack) to ensure dependency versions are consistent across the monorepo.

**Check for mismatches:**

```bash
pnpm lint:deps
```

**Fix mismatches automatically:**

```bash
pnpm syncpack fix-mismatches
```

## Project Structure

```
├── apps/
│   ├── web/           # Astro + React + Fastify frontend app
│   └── api/           # Fastify backend API
├── packages/
│   ├── ui/            # Shared React UI component library
│   ├── common/        # Shared utilities and constants
│   └── config/        # Shared configurations (TypeScript, etc.)
├── .changeset/        # Versioning metadata
├── turbo.json         # TurboRepo pipeline configuration
└── package.json       # Root scripts and dev dependencies
```

## Commands Cheatsheet

| Command | Description |
| :--- | :--- |
| `pnpm dev` | Start dev servers for all apps |
| `pnpm build` | Build all apps and packages |
| `pnpm start` | Run production servers |
| `pnpm typecheck` | Run TypeScript checking across the repo |
| `pnpm lint` | Lint code with Biome |
| `pnpm format` | Format code with Biome |
| `pnpm lint:deps` | Check for dependency mismatches |
| `pnpm changeset` | Create a new changeset for versioning |
