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
    // Workspace packages (@repo/*) export raw .ts source files, so they
    // must be bundled inline — Node can't run .ts imports at runtime.
    // noExternal overrides tsdown's auto-external behavior for deps
    // listed in package.json. Their transitive deps (pino, etc.) get
    // bundled too — this is intentional and expected.
    noExternal: [/^@repo\//],
    inlineOnly: false,
  };
});
