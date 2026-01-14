import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server/index.ts"],
  format: ["esm"],
  clean: true,
  sourcemap: true,
  outDir: "dist/server-runner",
  target: "node18",
  noExternal: ["express"], // Bundle if needed, but usually keep node_modules external for server
});
