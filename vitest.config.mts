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
        //
        // Sweep 2 (calendar) measured each of its nine commits in a scratch worktree rather than
        // reasoning about the total. Base (db945149): 92.19 / 87.86 / 89.12 / 94.31, matching the
        // numbers above exactly. The module split (42d61ff8), both `installTestCalendar`-triple
        // cleanups (a6a95c4b, 5bd27bee), the dead-container deletion (d8bfc762) and the DatePicker
        // staging (8d134fbb) moved nothing.
        //
        // Bridge and CalendarWeekBlock staging (6a94e0d6) -> 92.20 / 87.86 / 89.15 / 94.32. Up:
        // `CalendarWeekBlock.test.ts` swapped its hand-built `ModalService` stub for
        // `harness.modals`, the real fake — which actually invokes a modal descriptor's `title`
        // resolver instead of short-circuiting past it. `weekPresetPickerModal`'s `title` arrow
        // (calendar/settings/ui/modals.ts:10) goes from 0% to 100% function coverage: +1 function,
        // +1 statement, +1 line. No branches in it, so branches held.
        //
        // Fresh-install carve-out (d3f7f65a) -> 92.20 / 87.86 / 89.15 / 94.32, numerators and
        // denominators both up: 11062/11997 -> 11064/11999 statements, 4771/5430 -> 4773/5432
        // branches, 9674/10256 -> 9675/10257 lines. `parseSliceValue`'s new
        // `if (raw === undefined) return ...` (settings-service.ts:365) adds one statement for the
        // guard and one for the return, and one branch point with both arms exercised elsewhere in
        // the suite (the fresh-install arm was already covered before the calendar suite touched
        // it) — a rise, not the branch-drop pattern to watch for. Percentages hold because the new
        // code is fully covered. `184da953` (dropping the now-unneeded guard-dodge seeds) and
        // `8915a293` (lint-selector arming) moved nothing further; the branch was already covered
        // without them.
        //
        // Sweep 3 (code-blocks, notes-calendar) measured each of its fifteen commits in a scratch
        // worktree against 56e817b0, the parent of the sweep's first commit. That base measured
        // 92.23 / 87.86 / 89.15 / 94.35 (11067/11999 statements, 4773/5432 branches, 3928/4406
        // functions, 9678/10257 lines) — three statements and three lines above the prior sweep's
        // recorded end state, from 56e817b0 itself rather than from any of the fifteen: its
        // testing.test.ts loads the full `codeBlocksModule` to prove the leaked-host-state guard
        // sees a `CodeBlockDefinitionToken`, so `home-block.ts`, `nav-block.ts` and
        // `timeline-block.ts` each run their module-level `defineCodeBlock(...)` call for the first
        // time. That guard commit sits outside the fifteen this sweep owns, so the number above is
        // reported rather than reasoned past.
        //
        // All three module splits (b2d84892, 4d0d4448, 23031276) moved nothing: every file each one
        // touches — `module.ts` and the new `ui-module.ts` alike — is already outside the DI-wiring
        // exclude glob, so neither half was ever counted regardless of what still loads it. The
        // buildNavSegment fixture (8e4ac100) moved nothing either: its `v.parse` call lives in the
        // excluded testing.ts, and the schema object it parses against was already built at import
        // time. No `Repository.fromParts`/`ViewModel.fromRepository` hatch exists under
        // src/code-blocks or src/notes-calendar, so the six deleted `Fake*` classes had none of that
        // shape to retire — where a conversion replaced one with a real service, the code paths that
        // service now exercises were already covered elsewhere in the suite. c7a07480, 391ca873,
        // bf98fd9a, d7cfa119, 8dc1975e, 6dbeea60, e7c97b0d, 15a866d6 and e3ecfa93 each measured flat
        // too, verified per file and not just in aggregate.
        //
        // NavigationCodeBlock onto testContainer (0de4fd78) -> 92.25 / 87.86 / 89.19 / 94.37. Up:
        // deleting the test's six hand-rolled Fake* classes for testContainer's real WorkspaceService
        // means the test now drives the real `NoteMetadataService.onResolved`
        // (infrastructure/host/internal/note-metadata-service.ts:36) and disposes it, so the method
        // and its `offref` disposer arrow both run for the first time: +3 statements, +2 functions,
        // +2 lines. Neither has a branch in it, so branches held.
        //
        // Timeline mode/quarter/calendar onto testContainer (77ec7660) -> 92.30 / 87.90 / 89.28 /
        // 94.41. Up: this commit drops the `vi.mock` of `@/calendar`, so the real
        // `useResolvedTimelineNavigation` (calendar/timeline-navigation.ts) and
        // `useResolvedWeekPlacement` (calendar/week-placement.ts) run for the first time in place of
        // the mocked stand-ins: +6 statements, +2 branches, +4 functions, +4 lines — the one branch
        // rise this sweep produced, not a drop.
        //
        // Sweep 4 (decorations) measured its thirteen commits, plus the merge base (e6b38e6f), in a
        // scratch worktree — base: 92.3 / 87.9 / 89.28 / 94.41 (11076/11999 statements, 4775/5432
        // branches, 3934/4406 functions, 9684/10257 lines). e6b38e6f is the merge commit that
        // landed sweep 3, so this is sweep 3's own end state, not an independently-measured match.
        // Every one of the thirteen commits (417b3b82, 1a3acf43, a5dd2eb3, 8e43c34c, 9a4efd30,
        // f03bd784, 0085d899, a0e7d475, dfb31bd4, bc76c89a, 1c927395, ff1b68ac, 9a97fb28) measured
        // the identical numerator and denominator on all four metrics, not merely the same rounded
        // percentage; f03bd784 and 9a97fb28 were re-measured with the vite transform cache cleared
        // to rule out a stale-transform artifact, and the numbers held.
        //
        // The two moves this sweep's own plan predicted were checked, not assumed, and neither
        // happened, for reasons found rather than guessed. `f03bd784` ("move core service tests onto
        // testContainer") was expected to move `NoteMetadataService.get`
        // (infrastructure/host/internal/note-metadata-service.ts) and `NoteSizeService.#fill`
        // (infrastructure/host/internal/note-size-service.ts) from cold to warm the way sweep 2's
        // NavigationCodeBlock step moved `NoteMetadataService.onResolved` — but per-file
        // coverage-summary.json shows both already at 100%/97.82% lines at the merge base, before
        // decorations' own conversion touched them: every sweep before this one (journals, calendar,
        // shelves, commands, code-blocks, notes-calendar) had already driven testContainer through
        // this shared infrastructure, and decorations, swept last, had nothing left to warm. The
        // predicted fall from `JournalsRepository.fromParts` / `ShelvesRepository.fromParts` losing
        // their last decorations callers didn't happen because they never lost their last callers,
        // full stop: decorations' own call sites (decorations-store.test.ts,
        // gather-bindings.test.ts, match-service.test.ts, the delete/edit-decoration flow tests,
        // DecorationsSection.test.ts, and the three modal tests) are gone by 9a97fb28 — `git grep
        // fromParts -- src/decorations` at the tip returns nothing — but `src/journals/testing.ts`'s
        // `fakeRepo` and `src/shelves/testing.ts`'s `fakeShelvesRepo` both still call `fromParts`
        // directly, and both wrappers are themselves still called from outside decorations —
        // `fakeRepo` from `src/notes-calendar/testing.ts`,
        // `src/views/blocks/custom-intervals/CustomIntervalsBlock.test.ts`,
        // `CustomIntervalsBlock.fixed-scope.test.ts` (both renamed off `.isolated` by sweep 5), and
        // `src/views/view-leaf.test.ts`.
        // `JournalsRepository.fromParts`/`ShelvesRepository.fromParts` also have direct callers of
        // their own under `src/views` — `IntervalBlockSection.test.ts`, `ButtonItemConfig.test.ts`,
        // `ShelfSelectorItem.test.ts` — so both methods stayed warm regardless of what decorations
        // itself still calls.
        //
        // Sweep 5 (views) measured its seventeen commits in a single scratch worktree, checked out
        // in sequence from 78340ab8 with one `npm ci`/`compile:i18n` pair. The merge base itself
        // reproduced exactly: 92.3 / 87.9 / 89.28 / 94.41 (11076/11999 statements, 4775/5432
        // branches, 3934/4406 functions, 9684/10257 lines), matching this sweep's plan.
        //
        // `9390a918` (split viewsModule into core/ui/startup halves) -> 92.29 / 87.9 / 89.26 /
        // 94.39 (11076/12001, 4775/5432, 3934/4407, 9684/10259). Down, but not a test regression:
        // the new `src/views/startup-module.ts` holds nothing but a
        // `.register().useClass().eager()` call — the same shape `module.ts`/`ui-module.ts`
        // already get excluded for — but its name matches neither pattern in the exclude glob
        // above, so it starts as two fresh 0%-covered statements/lines and one 0%-covered
        // function, exactly the "fresh 0% file" cost the sweep-3 paragraph above warns a module
        // split can add. `module.ts` and `ui-module.ts` themselves stayed excluded and moved
        // nothing.
        //
        // `8d913c14`, `88eee894`, `d6412d31` and `88216c07` (dropping the global-duplicate
        // afterEach/installTestCalendar boilerplate; moving the config editors and modal tests
        // onto testContainer; the ButtonItemConfig import fix) each measured identical to the
        // commit before it.
        //
        // `b4410edb` (repository, view-model and toolbar-items-service onto testContainer) -> 92.3
        // / 87.9 / 89.28 / 94.4 (11077/12001, 4775/5432, 3935/4407, 9685/10259). Up net, but this
        // is where `ViewsViewModel.fromRepository` (view-model.ts:11-13) loses its last caller:
        // `view-model.test.ts` used to hand-build a repo via `ViewsRepository.fromParts` and call
        // `ViewsViewModel.fromRepository(repo)` directly; converted, it resolves `ViewsViewModel`
        // through `testContainer`, which constructs it directly and never calls the static factory
        // (-1 statement, -1 line). Two rises outweigh it: `startup-module.ts` goes from 0/2 to 1/2
        // covered statements — testContainer now boots the eager `ViewHostService` registration
        // for the first time this sweep (+1 statement, +1 line) — and the real
        // `ToolbarItemsService` exercises `spacer-item.ts`'s definition for the first time (+1
        // statement, +1 function, +1 line).
        //
        // `9e9f3511` (service.test.ts onto testContainer) -> 92.3 / 87.9 / 89.28 / 94.41
        // (11078/12001, 4775/5432, 3935/4407, 9686/10259). Up: the real `ViewsService`, resolved
        // through `testContainer` instead of a hand-built container, drives one more
        // `ViewsRepository` method body for the first time (repository.ts: 21/27 -> 22/27
        // statements, 19/21 -> 20/21 lines).
        //
        // `dd316484` (view-host onto testContainer) -> 92.31 / 87.9 / 89.31 / 94.42 (11079/12001,
        // 4775/5432, 3936/4407, 9687/10259). Up: `startup-module.ts` reaches full coverage (1/2 ->
        // 2/2 statements, 0/1 -> 1/1 functions, 1/2 -> 2/2 lines) once `view-host.test.ts`
        // resolves the real `ViewHostService` through the startup module instead of registering it
        // by hand.
        //
        // `d23afae6` (view-leaf onto testContainer) measured flat despite replacing five
        // `ViewsRepository.fromParts` calls and one `ShelvesRepository.fromParts` call with
        // testContainer: both methods still had other live callers at this point (the
        // not-yet-converted view flow tests, `IntervalBlockSection.test.ts`,
        // `ButtonItemConfig.test.ts`, `ShelfSelectorItem.test.ts`), so their bodies kept executing
        // regardless of what view-leaf itself stopped calling.
        //
        // `1b388451` (the five view flows onto testContainer) -> 92.24 / 87.9 / 89.33 / 94.33
        // (11070/12001, 4775/5432, 3937/4407, 9678/10259). Down net, and this is where
        // `ViewsRepository.fromParts` (repository.ts:20-40) loses its own last caller: the five
        // flow tests turn out to have been its only remaining callers repo-wide — `grep -rn
        // "ViewsRepository.fromParts" src` returns nothing once they convert (-10 statements, -10
        // lines). A second, smaller fall rides along: two of the converted tests used to call
        // their local `build()` helper with no `raw` argument, leaving `viewsCollection` with no
        // persisted "views" key and triggering its `seed` factory (config.ts:66) to populate the
        // default calendar view; the conversion follows this sweep's seed-explicitly convention
        // and passes `data: { views: … }` on every call, so `seed` never runs again (-1 statement,
        // -1 function, -1 line). Two rises partly offset both: `markdown-template-block.ts` and
        // `period-buttons-item.ts` each gain one statement/function/line as the real block and
        // toolbar-item definitions `viewsCoreModule` registers run for these flows for the first
        // time.
        //
        // `6080aa3f` and `e561da04` (views/ui component tests onto testContainer; real
        // ViewHostService in ViewEditSubpage tests) both measured flat.
        //
        // `58ade0cb` (blocks and toolbar-item UI tests onto testContainer) -> 92.23 / 87.9 / 89.33
        // / 94.32 (11069/12001, 4775/5432, 3937/4407, 9677/10259). Down:
        // `JournalsViewModel.fromRepository` (journals/view-model.ts:11-13) loses its last caller.
        // `IntervalBlockSection.test.ts` used to build `JournalsRepository`/`ShelvesRepository`
        // via `fromParts` and call `JournalsViewModel.fromRepository(repo)` directly; converted
        // alongside `ShelfSelectorItem.test.ts`, `MarkdownTemplateBlock.test.ts` and
        // `ToolbarBlock.test.ts`, it now resolves `JournalsViewModel` through `testContainer` (-1
        // statement, -1 line). No caller of `JournalsViewModel.fromRepository` remains anywhere in
        // `src` after this commit.
        //
        // `42b8b064` (the shelf-scope five onto testContainer, dropping `.isolated` from their
        // filenames) -> 92.29 / 87.9 / 89.49 / 94.34 (11076/12001, 4775/5432, 3944/4407,
        // 9679/10259). Up: replacing the fake shelf scope with the real one in
        // `CustomIntervalsBlock.vue`, `ButtonItem.vue`, `ExistingNavigationItem.vue` and
        // `PeriodButtonsItem.vue` drives statement and function paths inside those components that
        // the fakes never reached (+7 statements, +7 functions, +2 lines; branches held).
        //
        // `f563663e` (un-isolating the four remaining `vi.mock` files, also dropping `.isolated`)
        // -> 92.35 / 87.9 / 89.65 / 94.39 (11083/12001, 4775/5432, 3951/4407, 9684/10259). Up:
        // dropping the `vi.mock` lets the real block and toolbar-item definitions run in place of
        // the mocked stand-ins — `divider-block.ts`, `toolbar-block.ts`, `week-calendar-block.ts`,
        // `existing-navigation-item.ts`, `MonthCalendarBlock.vue` and `WeekCalendarBlock.vue` each
        // gain coverage (+7 statements, +7 functions, +5 lines).
        //
        // `18c0d41a` (use-follow-active-note onto testContainer, retiring the notes-calendar
        // fakes) -> 92.18 / 87.9 / 89.65 / 94.2 (11063/12001, 4775/5432, 3951/4407, 9664/10259).
        // This is the sweep's central predicted fall. The commit deletes
        // `buildNotesCalendarHarness` from `src/notes-calendar/testing.ts`, which was the last
        // surviving caller of `JournalsRepository.fromParts` (through `fakeRepo`) and of
        // `ShelvesRepository.fromParts` (through `fakeShelvesRepo`) anywhere outside the two
        // fixtures themselves: `journals/repository.ts` drops 51/53 -> 41/53 statements and 40/40
        // -> 30/40 lines, `shelves/repository.ts` drops 48/50 -> 38/50 statements and 39/39 ->
        // 29/39 lines — each exactly the ten-line body of its own `fromParts`. Verified, not
        // assumed: `grep -rn "\.fromParts(" src` at this commit returns only
        // `src/journals/testing.ts:18` and `src/shelves/testing.ts:13`, and neither `fakeRepo` nor
        // `fakeShelvesRepo` has any remaining caller, so both bodies are fully dead rather than
        // merely thinner. One clause of this sweep's own plan does not hold, though: `testing.ts`
        // files are already excluded from coverage (`"**/testing.ts"` above), so
        // `notes-calendar/testing.ts` was never counted before its deletion, and deleting it moves
        // nothing on its own — both repository files keep the same statement/line totals before
        // and after this commit, and only their covered counts fall. The plan's expectation that
        // the file deletion itself "moves the denominator" does not hold.
        //
        // `0d248459` (arming the campaign lint selectors for `src/views`, the tip of this sweep)
        // measured flat, as expected for a lint-only change.
        //
        // No branch moved at any of the seventeen commits: 4775/5432 held from the merge base
        // straight through to the tip, so every fall recorded above is a statement/function/line
        // change with a named, verified cause, never an unattributed branch regression.
        //
        // As of this tip, all five `fromParts` methods (`JournalsRepository`, `ShelvesRepository`,
        // `ViewsRepository`, `CommandsRepository`, `ShelvesService`) and all four `fromRepository`
        // methods (`JournalsViewModel`, `ShelvesViewModel`, `ViewsViewModel`, `CommandsViewModel`)
        // have zero executing callers: `grep -rn "\.fromRepository(" src` (excluding the `static
        // fromRepository` declarations themselves) returns nothing, and `grep -rn "\.fromParts("
        // src` returns only the two deprecated-fixture call sites named above. Four of the nine —
        // `CommandsRepository.fromParts`, `ShelvesService.fromParts`,
        // `CommandsViewModel.fromRepository`, `ShelvesViewModel.fromRepository` — were already
        // dead before this sweep started, their per-file counts identical at the merge base and at
        // this tip. This sweep is responsible for killing the other five:
        // `ViewsRepository.fromParts`/`ViewsViewModel.fromRepository` (by `b4410edb` and
        // `1b388451`) and
        // `JournalsRepository.fromParts`/`ShelvesRepository.fromParts`/`JournalsViewModel.fromRepository`
        // (by `58ade0cb` and `18c0d41a`). All nine remain on the closing PR's deletion list; none
        // of this sweep's own tests calls any of them any longer.
        statements: 92.18,
        branches: 87.9,
        functions: 89.65,
        lines: 94.2,
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
