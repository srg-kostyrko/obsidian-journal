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
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json-summary", "html"],
      include: ["src/**"],
      exclude: [
        "src/i18n/paraglide/**",
        "**/testing.ts",
        "**/*.testing.ts",
        "**/*.test.ts",
        "**/*.bench.ts",
        // DI wiring. `docs/unit-testing-strategy.md` forbids testing it, so counting it measured
        // lines nobody was permitted to act on — and every module split added a fresh 0% file
        // that dragged the floor down for reasons unrelated to test quality. Safe only because a
        // `module.ts` is assumed to hold wiring only — `src/settings/legacy/module.ts` already
        // breaks that assumption (its `legacyMigrations` array is real behavior with its own
        // test), so a file matching this glob still needs checking for non-wiring exports.
        "src/**/module.ts",
        "src/**/ui-module.ts",
      ],
      // A floor to catch silent deletion during the test-conversion campaign, not a target to
      // chase. Set at the measured value: a PR that lowers coverage edits these numbers in the
      // same diff, where a reviewer sees it. Deliberately not `thresholds.autoUpdate` — an
      // earlier gate in this campaign was deleted because the cheapest route past a failure was
      // regenerating its baseline, which trains reviewers to dismiss it.
      thresholds: {
        // 92.25 -> 92.18, 87.86 -> 87.82, 94.39 -> 94.3: converting the commands service tests
        // onto testContainer left `CommandsRepository.fromParts` (repository.ts:22-42) and
        // `CommandsViewModel.fromRepository` (view-model.ts:11-13) with no caller at all. Both are
        // test-only seeding hatches on this campaign's deletion list, so the drop records them
        // getting closer to deletion rather than a test getting weaker. Same shape as the journals
        // move that took functions from 89.1 to 89.08 one sweep earlier.
        statements: 92.18,
        branches: 87.82,
        // Back up past that 89.08: booting DynamicCommandRegistry through its real module wiring
        // reaches the repository's own error factories, which the hand-built container did not.
        functions: 89.12,
        lines: 94.3,
      },
    },
    projects: [
      {
        plugins: [vue()],
        test: {
          ...base,
          name: "shared",
          isolate: false,
          setupFiles: ["./vitest.setup.ts", "./vitest.setup.shared.ts"],
          include: ["src/**/*.test.ts"],
          exclude: ["**/node_modules/**", "**/dist/**", "src/**/*.isolated.test.ts"],
          benchmark: { include: ["src/**/*.bench.ts"], exclude: ["**/node_modules/**"] },
        },
      },
      {
        plugins: [vue()],
        test: {
          ...base,
          name: "isolated",
          setupFiles: ["./vitest.setup.ts"],
          include: ["src/**/*.isolated.test.ts"],
          exclude: ["**/node_modules/**", "**/dist/**"],
          // Benchmarks belong to the "shared" project; without this they would run once per project.
          benchmark: { include: [] },
        },
      },
    ],
  },
});
