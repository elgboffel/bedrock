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
    // Keep node_modules as external — they're available at runtime.
    // Without this, fastify, pino, and the entire Astro SSR output
    // get bundled in, inflating the output from ~2 kB to ~2 MB.
    external: [/node_modules/],
  };
});
