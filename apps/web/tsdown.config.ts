import { defineConfig, type InlineConfig, type UserConfig } from "tsdown";

export default defineConfig((options: InlineConfig): UserConfig => {
  const isDev = !!options.watch || process.env.NODE_ENV === "development";

  return {
    entry: ["src/server/index.ts"],
    format: "esm",
    clean: !isDev,
    treeshake: !isDev,
    sourcemap: true,
    outDir: "dist/server-runner",
    target: "node18",
  };
});
