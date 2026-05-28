import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  output: "server",
  srcDir: "./src/browser",
  adapter: node({
    mode: "middleware",
  }),
  integrations: [react()],
  vite: {
    server: {
      proxy: {
        "/api": {
          target: "http://localhost:3001",
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  },
});
