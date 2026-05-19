import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/server",
  "packages/database",
  "packages/telemetry",
  "apps/api",
  "apps/web",
]);
