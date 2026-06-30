import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  root: "src/frontend",
  server: {
    host: "127.0.0.1",
    port: 4173,
    proxy: {
      "/api": "http://127.0.0.1:4318",
      "/healthz": "http://127.0.0.1:4318",
      "/refresh": "http://127.0.0.1:4318",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
