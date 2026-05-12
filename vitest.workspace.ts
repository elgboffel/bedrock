import { defineWorkspace } from "vitest/config";

export default defineWorkspace(["packages/server", "apps/api", "apps/web"]);
