import { defineConfig, type InlineConfig, type UserConfig } from "tsdown";

export default defineConfig((options: InlineConfig): UserConfig => {
  const isDev = !!options.watch || process.env.NODE_ENV === "development";

  return {
    entry: ["src/index.ts"],
    format: "esm",
    dts: !isDev,
    clean: !isDev,
    treeshake: !isDev,
    sourcemap: true,
    outDir: "dist",
    noExternal: ["@repo/common"],
  };
});
