import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    // Integration tests run separately via vitest.integration.config.ts.
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts"],
    environmentMatchGlobs: [["src/browser/**", "jsdom"]],
    coverage: {
      provider: "v8",
    },
  },
});
