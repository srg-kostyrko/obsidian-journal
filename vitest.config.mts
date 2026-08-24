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
        // Measured at each step of this sweep rather than reasoned about — two earlier versions of
        // this comment narrated the wrong cause. Merge base (fa6aeacf): 92.25 / 87.86 / 89.08 / 94.39.
        //
        // Shelves (400479de) -> 92.26 / 87.86 / 89.10 / 94.39. `buildShelf` had no callers at all
        // before this sweep and is now the shelf fixture everywhere, so `shelvesCollection`'s
        // defaultItem factory (shelves/config.ts:19) runs for the first time: +1 function, +1
        // statement. Nothing attributed this step before, which is how the statements clause used
        // to read 92.25 -> 92.18 straight past a measured 92.26.
        //
        // Commands (b374d993) -> 92.18 / 87.82 / 89.12 / 94.30. Down: `CommandsRepository.fromParts`
        // (repository.ts:22-42) and `CommandsViewModel.fromRepository` (view-model.ts:11-13) lost
        // their last call sites, so their bodies stop executing (-10 statements, -10 lines between
        // them). Both are test-only seeding hatches on this campaign's deletion list, so that part
        // records them getting closer to deletion rather than a test getting weaker. The two
        // branches are not that: the converted shelf-rename and shelf-delete tests seed only
        // commands that match, so the skip arm of the loop in `#onShelfRenamed` (:265) and
        // `#onShelfDeleted` (:273) is never taken. Up: command-registry.test.ts boots the whole
        // `commandsModule`, whose UI half calls `defineShelfEditSection`
        // (shelves/ui/shelf-edit-section.ts:11) — that, not anything under src/commands, is the +1
        // function. Functions inside commands/repository.ts net zero across this step: the
        // `fromParts` clone's `unknownEntityError` arrow (:39) goes cold exactly as the real class
        // field (:49) comes alive.
        //
        // Maintenance (b01967b1) -> 92.19 / 87.82 / 89.12 / 94.31. `MaintenanceSubpage.test.ts`
        // boots `maintenanceUiModule` instead of hand-registered stubs, so `maintenance-subpage.ts:5`'s
        // `defineSubpage(...)` call executes — one statement and line, no branches or functions in it.
        //
        // The commands component step (d8d38490), both module splits and the api step (ed62898c)
        // moved no number.
        //
        // Shelf cascade re-seed -> 92.19 / 87.86 / 89.12 / 94.31. The Commands step above lost two
        // branches because its converted shelf-rename and shelf-delete tests seeded only a command
        // matching the shelf being renamed or deleted, so the skip arm of the loop in
        // `#onShelfRenamed` (:265) and `#onShelfDeleted` (:273) was never taken. Both tests now also
        // seed a non-matching command (a different shelf, and a non-shelf target) and assert it is
        // left alone, exercising that arm again and restoring the two branches.
        statements: 92.19,
        branches: 87.86,
        functions: 89.12,
        lines: 94.31,
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
