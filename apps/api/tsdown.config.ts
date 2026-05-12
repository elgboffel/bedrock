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
    // Workspace packages (@repo/*) export raw .ts source files, so they
    // must be bundled inline — Node can't run .ts imports at runtime.
    noExternal: [/^@repo\//],
    inlineOnly: false,
  };
});
