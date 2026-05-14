import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/server",
  "packages/database",
  "apps/api",
  "apps/web",
]);
