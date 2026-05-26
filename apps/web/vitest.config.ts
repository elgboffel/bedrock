import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environmentMatchGlobs: [["src/browser/**", "jsdom"]],
    coverage: {
      provider: "v8",
    },
  },
});
