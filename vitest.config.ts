import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  resolve: { conditions: ["browser", "development"] },
  test: {
    environmentMatchGlobs: [["test/frontend/**/*.tsx", "jsdom"]],
  },
});
