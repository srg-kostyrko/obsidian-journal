import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

const base = {
  environment: "happy-dom" as const,
  alias: {
    obsidian: new URL("./__mocks__/obsidian.ts", import.meta.url).pathname,
    "@": new URL("./src", import.meta.url).pathname,
  },
};

// Workers reuse one module registry across the files they run, which is what keeps the suite fast:
// the import graph is paid once per worker instead of once per file. The cost is that a file can
// reach the next one through anything process-global — a `vi.mock` factory replaces the module for
// every later file in the worker, and rewriting moment's *global* locale leaves the next file on a
// different week grid. A test that does either names itself `*.isolated.test.ts` and runs in its
// own registry instead.
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [vue()],
        test: {
          ...base,
          name: "shared",
          isolate: false,
          setupFiles: ["./vitest.setup.ts", "./vitest.setup.shared.ts"],
          include: ["src/**/*.test.ts"],
          exclude: ["**/node_modules/**", "**/dist/**", "src/_old-code/**", "src/**/*.isolated.test.ts"],
          benchmark: { include: ["src/**/*.bench.ts"], exclude: ["**/node_modules/**", "src/_old-code/**"] },
        },
      },
      {
        plugins: [vue()],
        test: {
          ...base,
          name: "isolated",
          setupFiles: ["./vitest.setup.ts"],
          include: ["src/**/*.isolated.test.ts"],
          exclude: ["**/node_modules/**", "**/dist/**", "src/_old-code/**"],
          // Benchmarks belong to the "shared" project; without this they would run once per project.
          benchmark: { include: [] },
        },
      },
    ],
  },
});
