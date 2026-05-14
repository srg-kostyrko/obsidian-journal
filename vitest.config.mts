import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "happy-dom",
    alias: {
      obsidian: new URL("./__mocks__/obsidian.ts", import.meta.url).pathname,
      "@": new URL("./src", import.meta.url).pathname,
    },
    exclude: ["**/node_modules/**", "**/dist/**", "src/_old-code/**"],
  },
});
