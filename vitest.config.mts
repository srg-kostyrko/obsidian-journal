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
        // `src/**/startup-module.ts` joins them for the same reason — a startup module is that
        // same wiring — and carries the same caveat. Unlike the other two it is not avoiding a
        // fresh-0% drag: the one such file today, `src/views/startup-module.ts`, is at 100%, so
        // excluding it removes covered code and nudges the floor down rather than up.
        "src/**/module.ts",
        "src/**/ui-module.ts",
        "src/**/startup-module.ts",
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
        // fromParts -- src/decorations` at the tip returns nothing — but, as of sweep 4,
        // `src/journals/testing.ts`'s `fakeRepo` and `src/shelves/testing.ts`'s `fakeShelvesRepo`
        // both still called `fromParts` directly, and both wrappers were themselves still called
        // from outside decorations — `fakeRepo` from `src/notes-calendar/testing.ts`,
        // `src/views/blocks/custom-intervals/CustomIntervalsBlock.test.ts`,
        // `CustomIntervalsBlock.fixed-scope.test.ts` (both renamed off `.isolated` by sweep 5), and
        // `src/views/view-leaf.test.ts`. Sweep 5 removed all four of those callers (see the
        // `18c0d41a` entry below); `git grep -n "fakeRepo\|fakeShelvesRepo" -- src`, excluding the
        // two fixture definitions themselves, returns nothing at this file's own tip.
        // `JournalsRepository.fromParts`/`ShelvesRepository.fromParts` also had direct callers of
        // their own under `src/views` at that point — `IntervalBlockSection.test.ts`,
        // `ButtonItemConfig.test.ts`, `ShelfSelectorItem.test.ts` — so both methods stayed warm
        // regardless of what decorations itself still called.
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
        //
        // Sweep 6 (settings, templates, ui, logging, i18n) measured its thirteen commits by diffing
        // every file's statement/branch/function/line counts in coverage-summary.json between the
        // merge base (53d976ae) and the sweep's tip, rather than a step-by-step worktree bisection.
        // The merge base itself reproduced this sweep's recorded baseline exactly: 92.2 / 87.92 /
        // 89.7 / 94.22 (11089/12026 statements, 4783/5440 branches, 3964/4419 functions, 9685/10279
        // lines). Diffing every file between that base and the tip turned up exactly four files with
        // any change at all, and nothing added to or removed from the coverage set (`only in base`
        // and `only in tip` both empty, every changed file's own denominator held). That verifies,
        // rather than assumes, the two things this sweep's plan flagged as open questions: the
        // `05c99d24` deletion of `createSettingsService` (49 lines from `src/settings/testing.ts`)
        // moved nothing, because `**/testing.ts` was already excluded before the deletion — there
        // was never a numerator or denominator counting that body to begin with; and moving
        // `UiIcon.test.ts` / `UiCollapsibleBlock.test.ts` out of the isolated project into shared
        // (`b4c95166`) moved nothing on its own either, because `coverage` sits at the top level of
        // `test:`, outside `projects`, so both projects were already counted together — reassigning
        // a file between them changes which setup files load, not what gets instrumented.
        // `0172a4dd`'s split of `loggingModule` into `loggingCoreModule` + `ui-module.ts` also moved
        // nothing by itself: at that point every logging test still built its own hand-rolled
        // `Container`, so nothing yet imported the new `module.ts`.
        //
        // Final tip -> 92.25 / 87.92 / 89.72 / 94.26 (11094/12026, 4783/5440, 3965/4419, 9690/10279).
        // Up net, from two files, both touched by `371522aa` ("move dump-logs and bridge tests onto
        // testContainer()"). First, a deliberate fix: bridge.test.ts's old assertion
        // (`gate.isEnabled("debug") === true`) passed whether or not `LoggingSettingsBridge` ever
        // ran, since the harness's `LogLevelGate` already starts at "debug"; seeding a narrower
        // level and asserting the gate actually narrowed forces the constructor's `watchEffect`
        // callback (`src/logging/settings/bridge.ts:16-18`) to execute for the first time: +1
        // statement, +1 function, +1 line, no branch in it. Second, an incidental side effect on
        // `src/logging/settings/ui/LoggingBlock.vue`: both `dump-logs.flow.test.ts` and
        // `bridge.test.ts` now `import { loggingCoreModule } from "../module"`, and importing
        // anything from `module.ts` runs that file's own top-level `import { loggingUiModule } from
        // "./ui-module"` regardless of which export the test actually uses — `ui-module.ts` imports
        // `LoggingBlock.vue`, and Vue's compiler hoists the SFC's static template nodes (the four
        // `<option>` elements at lines 44-47, none of which read a script-setup binding) to module
        // scope, so they construct once at import time with no mount required: +4 statements, +4
        // lines, 0 functions (a hoisted vnode isn't a declared function), no branches. Neither test
        // registers `loggingUiModule` itself, and the component's own `<script setup>` body
        // (`useService`, the `level` computed, `dump()`) stays at 0% — nothing in this sweep mounts
        // `LoggingBlock.vue`.
        //
        // Branches held in aggregate (4783/5440 at both ends) but not because nothing moved — two
        // files moved by exactly one branch each, in opposite directions, and cancelled. Up:
        // `d0b7de56` ("restore metadata-deferral discriminating order in data-migration-service
        // tests") is this sweep's one deliberate branch gain — routing all nine ordinary migration
        // tests through the same `FakeNoteMetadataService` the three deferral tests already used
        // means a test now supplies a `targetName` whose journal lookup misses, exercising the
        // `undefined` arm of the `configOption?.isSome() === true ? configOption.value : undefined`
        // ternary at `data-migration-service.ts:126` for the first time (that arm's hit count: 0/5 at
        // the base, 1/4 at the tip): +1 branch. Down: `b4c95166` ("un-isolate and de-duplicate the
        // src/ui + src/i18n pure suites") deliberately drops `UiCollapsibleBlock`'s
        // `vi.mock("@/infrastructure/host", () => ({ renderIcon: vi.fn(() => null) }))` — mocking the
        // project's own barrel, banned under this campaign's rule — and nothing else in the suite
        // ever made `renderIcon`/`getIcon` return falsy (the fake obsidian `getIcon` in
        // `__mocks__/obsidian.ts` always returns a real `<svg>`), so the `if (icon)` false arm in
        // `UiIcon.vue:27` (`host.append(icon)`) loses its only exerciser anywhere in the suite: -1
        // branch (5/6 -> 4/6 covered on that file; full-suite hit count on that arm goes 7 -> 0).
        // This is a real loss of discriminating power, not a wash — the aggregate percentage held
        // only because `data-migration-service.ts` happened to gain one elsewhere in the same sweep.
        //
        // Every other file's four counts matched exactly at both ends, so the remaining commits
        // (`4f381fdb`, `32e36215`, `c9364561`, `902eccf3`, `1d2d40e8`, `b97e44e5`, `05c99d24`,
        // `29b0d568`, `d4cc1f2e`, `0172a4dd`, and the eleven files `b4c95166` touched besides
        // UiIcon.vue) are verified flat, including `32e36215`'s 79-call-site conversion of
        // `engine.test.ts` onto `installTestEngine` — the real templates engine it now drives was
        // already fully exercised through the pre-conversion hand-rolled harness — and `29b0d568`'s
        // 52-test conversion of `settings-service.test.ts` off two hand-built container helpers.
        //
        // A fix-wave commit after this sweep (a final whole-branch review's F2) rebuilt "strips all
        // journal keys when the anchor cannot be resolved" (`data-migration-service.test.ts`): the
        // fixture had left "My Journal Month" unregistered, which made `config === undefined` true
        // at the same time as `anchor === undefined`, so deleting `|| anchor === undefined` from the
        // guard at `data-migration-service.ts:130` left the test green — `config === undefined` alone
        // still tripped it. The rebuilt fixture registers the journal and instead gives it a
        // start date CalendarDate.parse rejects, isolating the anchor disjunct (confirmed: the
        // mutant now fails exactly this test). That also moves which branches the test reaches.
        // Up: `#resolveAnchor`'s `!parsed.isOk()` check (`:162`) gains its true arm for the first
        // time in the suite: +1 statement, +1 branch. Down: registering the journal permanently
        // removes the only exerciser of two other arms — the
        // `configOption?.isSome() === true ? configOption.value : undefined` ternary's `undefined`
        // arm at `:126` (the one `d0b7de56` gained, see above) and the
        // `anchor.isSome() ? anchor.value : undefined` ternary's `undefined` arm at `:164` — because
        // the real `CycleService.anchorOf` returns `None` only when the journal itself is
        // unregistered, which this file no longer does anywhere. Net: +1 statement, -1 branch.
        //
        // New tip -> 92.25 / 87.9 / 89.72 / 94.26 (11095/12026, 4782/5440, 3965/4419, 9690/10279).
        //
        // Closing PR (merge base 8a63de66, which reproduced the line above exactly) -> 92.66 / 87.9 / 89.86 /
        // 94.68 (11093/11971, 4782/5440, 3955/4401, 9688/10232). Measured at the tip and diffed per file
        // against the base; ten files differ and no other file moved by so much as one count.
        //
        // Two of the branch's commits move the numbers, and this commit's new exclude removes a tenth file.
        // `0cfc834f` deleted the five `fromParts` constructors (the four repositories, -12 statements / -10
        // lines / -3 functions each, and `shelves/service.ts`, -1 / -1 / -1); `c8585787` deleted the four
        // `fromRepository` view model constructors (-1 / -1 / -1 each). All nine had been dead at the merge
        // base already, which the counts show directly: covered statements and covered lines are unchanged in
        // every one of the nine, so nothing that used to run stopped running. Only totals shrink, so all four
        // percentages rise. `b442f965` and `cbd5a217` touched only `testing.ts` and `*.test.ts` files plus two
        // barrels, and the per-file diff confirms them neutral.
        //
        // Covered functions do fall, by one per file, but that is an artifact of the v8 provider rather than a
        // weaker test: it had counted each dead static's function entry as covered while marking every
        // statement inside that static uncovered. Deleting the static takes the phantom covered entry with it,
        // which is why 18 functions leave the total while only 10 leave the covered count (nine phantoms plus
        // the startup module's genuine one), and the percentage still goes up. No surviving function changed
        // verdict: the ten-function fall is fully accounted for by the nine phantoms and the
        // startup module's own one, leaving no residue for any surviving function.
        //
        // Branches were expected flat and were measured flat per file, not in aggregate: not one of
        // the ten files carries a branch delta in either direction, so no pair of opposite movements
        // is hiding behind the unchanged 4782/5440. Every deleted body was straight-line code.
        //
        // `src/views/startup-module.ts` leaves the set through the new `src/**/startup-module.ts`
        // exclude above. It stood at 100% (2/2 statements, 1/1 functions, 2/2 lines, no branches),
        // so that exclusion removes covered code and costs a sliver of each percentage instead of
        // saving one; it is there to match the `module.ts` and `ui-module.ts` excludes, not to head
        // off a fresh 0% file.
        //
        // Left uncovered on purpose, recorded for Phase 4.5 rather than filled (gate 1): the
        // `invalidUpdateError` arrow bodies in `src/commands/repository.ts:26` and
        // `src/views/repository.ts:24`, which no test on either repository reaches, since neither
        // suite pushes an update through the rejecting path. `src/views/repository.ts` also keeps
        // the pre-existing uncovered `InvalidViewNameError` return at `:31`; this branch did not
        // touch it.
        //
        // Phase 4.5's own closing task re-measured against the merge base with main, `595c2c01`,
        // which reproduced the numbers above exactly: 92.66 / 87.9 / 89.86 / 94.68 (11093/11971
        // statements, 4782/5440 branches, 3955/4401 functions, 9688/10232 lines). Diffing every
        // file's branch numerator and denominator between that base and this tip (`f214a911`)
        // surfaced twelve files that moved; every other file in the coverage set held identical
        // branch counts on both sides, not merely the same rounded percentage, so the aggregate
        // rise below is not hiding a cancellation among files this comment omits.
        //
        // `src/main.ts` 0/4 -> 4/4 (`3b447325`, "cover onload failure, api ordering and unload").
        // `src/api/journals-api.ts` 73/99 -> 82/99, total held (`ade31b23`, probing the three
        // error codes no prior test asserted). `src/code-blocks/nav/settings/ui/EditNavBlockSegmentModal.vue`
        // 54/59 -> 55/59, total held (`7e6164eb`, the code-blocks nav/timeline/home sweep).
        // `src/maintenance/ui/MaintenanceBlock.vue` 0/2 -> 2/2 and
        // `src/views/ui/ConfirmRepositionModal.vue` 0/4 -> 4/4, both their first tests ever
        // (`f214a911`, "cover the remaining zero-coverage surfaces"). `src/notes-calendar/ui/NotesWeekView.vue`
        // 27/28 -> 28/28, total held (`d03fbe68`, the notes-calendar week/cell/timeline sweep).
        // `src/settings/legacy/data-migration-service.ts` 39/52 -> 41/52, total held (`a9079711`,
        // "separate the two data-migration undefined arms"). `src/settings/legacy/journal-conversion.ts`
        // 31/53 -> 52/53, total held — five settings commits (`e771e544`, `20209175`, `e29f011a`,
        // `d3eed9a4`, `3f007cd6`) added targeted tests for the year-reset divisors, the interval
        // frontmatter/ribbon paths and nav block row conversion, closing nearly every
        // previously-untested arm in this one file. `src/ui/UiIcon.vue` 4/6 -> 5/6, total held
        // (`2fcecee6`/`83c63beb`, the icon-null-append assertion and the fake `getIcon` fix it
        // needed). `src/views/service.ts` 32/48 -> 42/48, total held (`05678d2f` and `f214a911`).
        // `src/views/view-host.ts` 28/44 -> 42/44 — branch total held, but this file's own
        // statement/line totals also grew (135->139, 118->122): `699a67bc` is a real bug fix, not a
        // test-only change. The shelf-picker command used to no-op silently when its view had no
        // open leaf; it now shows a notice (`command_view_shelf_needs_open_view` in
        // `messages/en.json`, this phase's one message-key addition), which is a new, testable
        // guard branch. `9ce1e116` then closed the rest of this file's pre-existing guard branches,
        // unrelated to the fix.
        //
        // `src/templates/engine.ts` 161/179 -> 159/177 is the one file where *covered* fell, not
        // just total, and reads differently from "an unreachable branch removed" on a closer look.
        // `dc34311b` deletes `matched.groups ?? {}` — a nullish-coalescing branch whose both arms
        // were already exercised, 2/2 covered — and reads `matched.groups` directly, pushing the
        // one downstream access through `groups?.[...]` instead. That is a real
        // behavior-preserving simplification (the deleted comment already explained the fallback
        // never mattered: the loop that would read it never runs when there are no capture
        // groups), but the optional-chaining replacement does not register as a same-size branch
        // pair under this project's v8 coverage provider, so the file's branch total *and* covered
        // count both drop by two — statements and lines on this file are unchanged, 264/282 and
        // 241/251 on both sides. Nothing that used to be exercised stopped being exercised; the raw
        // branch numbers just do not show "covered unchanged" the way a first read of "removed an
        // unreachable branch" suggests — they show covered falling in step with total.
        //
        // The aggregate below still rises on every one of the four metrics net of that fall: the
        // eleven other files' gains outweigh it. That net rise is exactly why per-file reading
        // matters here — an aggregate-only read would show four clean increases and never surface
        // that one file's branch coverage fell at all.
        //
        // Tip: 93.99 / 89.16 / 90.86 / 95.94 (11256/11975 statements, 4849/5438 branches,
        // 3998/4400 functions, 9821/10236 lines).
        statements: 93.99,
        branches: 89.16,
        functions: 90.86,
        lines: 95.94,
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
