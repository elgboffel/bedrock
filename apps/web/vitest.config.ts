import { configDefaults, defineConfig } from "vitest/config";

// Integration tests run separately via vitest.integration.config.ts.
const exclude = [...configDefaults.exclude, "**/*.integration.test.ts"];

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
    },
    // Vitest 4 removed environmentMatchGlobs; map env by directory via projects.
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: [...exclude, "src/browser/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          environment: "jsdom",
          include: ["src/browser/**/*.test.{ts,tsx}"],
          exclude,
        },
      },
    ],
  },
});
