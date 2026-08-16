# CLAUDE.md

Working notes for AI agents and new contributors. Two parts: where the
authoritative docs live, and the traps that none of them cover.

## Where things are documented

Each subject below has exactly one owner. Read the owner — this file does not
restate it.

| Document                                                               | Owns                                                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [`CONTEXT.md`](CONTEXT.md)                                             | domain vocabulary — periods, journals, shelves, decorations                                      |
| [`docs/architecture.md`](docs/architecture.md)                         | code layout, DI, `Result`/`Option`, dates and union dispatch, schemas, i18n, testing conventions |
| [`docs/e2e-testing-strategy.md`](docs/e2e-testing-strategy.md)         | the e2e layer — runner, fixtures, selectors, execution model                                     |
| [`docs/i18n-glossary.md`](docs/i18n-glossary.md)                       | translation terms, and the `check:i18n` rules that `scripts/check-i18n-glossary.mjs` enforces    |
| [`docs/2026-07-13-ux-text-audit.md`](docs/2026-07-13-ux-text-audit.md) | user-facing copy style — sentence case, error grammar, en-US                                     |
| [`docs/manual-testing-checklist.md`](docs/manual-testing-checklist.md) | the manual verification pass                                                                     |
| [`docs/releasing.md`](docs/releasing.md)                               | how a version reaches the community store                                                        |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)                                   | setup, quality gates, commit and PR conventions                                                  |

**If a rule belongs to one of those documents, it goes there, not here.** This
file carries only what has no other home.

## Specs and plans

Design specs and implementation plans are written to `.superpowers/specs/` and
`.superpowers/plans/`, which are git-ignored. They are working artifacts, not
repository content — `docs/superpowers/` was retired on 2026-08-13 and is
ignored to keep it retired. Earlier specs remain in git history:

```bash
SHA=$(git log --all --diff-filter=D --format=%H -1 -- docs/superpowers)
git ls-tree -r --name-only "$SHA^" -- docs/superpowers   # 202 files
git show "$SHA^:docs/superpowers/specs/<name>.md"
```

`--all` is load-bearing: without it, history simplification prunes the deleting
commit and the lookup silently returns nothing, reading as "unrecoverable".

`src/_old-code/` is gone the same way, and it was what nearly every deleted spec
cited for "v2 did X". Since the v3 merge `main` **is** v3 — the last v2 release
is the `2.1.10` tag, so check such a claim there:

```bash
git show 2.1.10:src/journals/journal.ts
git grep <term> 2.1.10 -- src
```

## Standing rules

Project-wide decisions with no other home. They decide what counts as a bug.

- **v3 has shipped.** `3.0.0` was tagged on 2026-08-14 — `manifest.json` reads
  3.0.0 and `CHANGELOG.md` carries a dated `[3.0.0]` section. People now run v3,
  so a shape written by 3.0.x is data someone owns: a gap found in it needs a
  repair path, not a documented note. This inverts the pre-release rule, and
  decisions in git history that accepted a v3-era gap were made under that older
  rule — they are not precedent for a gap found today.
- **A missing v2 behavior is a bug report, not a settled decision.** The port is
  finished and `src/_old-code/` is gone, but v2 users upgrade into v3 and report
  what they lost. Check the claim against the v2 source at the `2.1.10` tag
  before answering, and treat a real gap as a defect unless it appears under
  "Deliberate non-bugs" below. One deviation _was_ opted into: the v1 → v2
  migration runs non-interactively in v3, recorded in the migration section of
  [`docs/manual-testing-checklist.md`](docs/manual-testing-checklist.md).
  Settled decisions that merely _read_ as regressions are under "Deliberate
  non-bugs" below; none of those is a dropped v2 feature.

## Traps

Behavior that is expensive to rediscover and invisible in the code that depends
on it.

### Boot and lifecycle

- A boot-time whole-vault note walk must wait for layout-ready (the file list)
  **and** for every note to resolve in `metadataCache`, re-checking on each
  `resolved` batch. Waiting on only one skips notes while still clearing its
  markers.
- The `onLayoutReady` `appStartup` guard gates the startup _note_ only. View
  auto-open must run unconditionally.

### Vue and reactivity

- `JournalsIndex` is **not** Vue-reactive. A computed reading it must call
  `useIndexVersion()` or it caches "not connected" forever. A regression test
  must register the entry _after_ mount and emit `entryChanged`; one that seeds
  the index before mount passes with the bridge deleted.
- `toRaw` is shallow. Config editors embed reactive proxies at depth via spread,
  so cloning a view config needs a deep strip (`cloneFnJSON`) or it throws
  `DataCloneError`. Reproducible only through a reactive store.
- The `useService(token)` rule in [`CONTEXT.md`](CONTEXT.md) bans composables
  that reach `App`/`Plugin` from arbitrary component depth, not composables in
  components. Don't read it as a ban on DI composables and build Vue inject keys
  as an indirection layer over DI; inject keys are for what is genuinely scoped
  to the mount tree.
- Declare prop shapes inline in `defineProps<{...}>()`. A named `XxxProps`
  interface used once adds indirection without information; reserve one for a
  type that is reused or large enough that inlining hurts.

### Obsidian API

- Obsidian calls `SuggestModal.onClose` **before** `onChooseSuggestion` on a
  mouse pick. Defer cancel verdicts a microtask.
- `Menu` has two renderings and they invert the pick/hide order. The DOM menu
  runs the item callback and _then_ `hide()`; the native (Electron) menu hides
  on `menu-will-close` and only then lets the pick cross IPC, with **no signal
  that no pick is coming**. So under the native rendering a close is not a
  cancel, and any "no pick by the time we hid" verdict fires on every pick.
  Obsidian defaults `nativeMenus` **on for macOS** (`null` config → `true`) and
  off elsewhere, so this is invisible on Linux and Windows. Do not "fix" it by
  forcing `setUseNativeMenu(false)` — that trades the platform's own menu for
  determinism the design does not need. A close may only _start_ the wait for a
  pick (`NATIVE_PICK_DELIVERY_GRACE_MS` in `workspace-service.ts`): a late
  cancel is free because `Flows` logs `UserAborted` and shows nothing and no
  caller reacts to it, while a dropped pick costs a note. Menus whose items only
  run side effects (`openPathsMenu`) are order-independent and need none of
  this. e2e drives both renderings on every OS; see the menu section of
  [`docs/e2e-testing-strategy.md`](docs/e2e-testing-strategy.md).
- `focusLeaf` calls `app.setting.close()`, and `setViewState({ active: true })`
  reaches it. `revealLeaf()` alone does not, so a leaf placed as a side effect
  of a settings interaction is placed then revealed, never activated.
- `getLeavesOfType` is `iterateAllLeaves` underneath, so it spans **popout windows**
  and sidebars. Any "is this note already open" reuse that then focuses the match
  must be pinned to one window, or opening a note drags the user into whichever
  window happens to hold it. The focused window is
  `workspace.containerEl.win.activeWindow` — same value as the `activeWindow`
  global but reachable through the injected `App`, where the global is not
  fakeable and `workspace.activeLeaf` is deprecated. e2e can drive it:
  `containerEl.win.focus()` moves `activeWindow` inside the WDIO harness, which
  a leaf merely becoming active does not.
- `app.metadataTypeManager` is undocumented and its shape changed at Obsidian
  1.9: property entries lost their `type` field in favor of `widget`, and
  `getPropertyInfo` now returns a fallback object instead of null, so it can no
  longer signal "never seen". Read `getAllProperties()` instead, try both field
  and method spellings, and prefer the user-assigned type over the inferred one.
  Unit tests mirror the fake, so only an e2e that picks a _number_ property
  catches a registry rename.

### Settings and schema

- A user-clearable collection field with a schema `minLength` wipes the **whole
  entity** on reload: the parse fails and the entity resets to defaults. Relax
  the schema and fall back on read, or coerce on write. A live instance is
  believed unfixed — `journalConfigSchema.dateFormat` is bound to a clearable
  input in `NoteCreationSection.vue`.
- The `@/journals` barrel re-exports settings flows that import
  `settings/ui/modals.ts`. Anything under `src/journals/settings/ui/` that
  `modals.ts` reaches must import services from their own submodules
  (`@/journals/cycle`, `@/journals/journals-index`), or `import-x/no-cycle`
  errors. Same shape for `@/decorations`, where the barrel leaves
  `createCellDecorationScope` undefined. Tests may use the barrel — they never
  import `modals.ts`.
- A settings frame stores its subpage's props, so a subpage identified by entity
  name holds a name that stops resolving the moment the entity is renamed. Its
  missing-entity guard reads that as a deletion and pops to the dashboard.
  Subscribe to the repository's synchronous `renamed` event and call
  `nav.replace({ <name>: newName })`; tapping the rename flow's result runs a
  microtask too late. Calling `nav.replace` straight off a reactive-destructured
  prop is fine (`JournalEditSubpage.vue`); `nav.push` is not. `vue/no-mutating-props`
  matches the mutating-array-method names, so `push` on a prop-derived object
  reads as a mutation of the prop — alias it as `const nav = props.nav`, the way
  `ShelfEditSubpage.vue` does. View-edit is id-keyed and immune.
- A toolbar item that has an **appearance resolver** splits its schema, inferred
  config types, and that resolver into `<x>-config.ts`, leaving `<x>-item.ts`
  with only the `defineToolbarItem()` wiring: the item file imports the `.vue`
  components, so a view importing the resolver back from it would close a
  runtime import cycle (`src/views/default-view.ts` reaches `buttonConfigFor`
  through `button-config.ts` for exactly that reason). Items with no resolver —
  `period-buttons`, `shelf-selector`, `spacer` — declare their schema inline in
  `<x>-item.ts`. That is the current shape, not an oversight: split when a
  resolver appears, not on principle.

### Lint and tooling

- `parserOptions.extraFileExtensions` must hold the **same value for every
  linted file**, `.vue` or not. typescript-eslint pushes it into the project
  service per file, and any change from the previous file's value calls
  TypeScript's `reloadProjects()`, rebuilding every open program from scratch.
  Declaring it only on the `**/*.vue` block turned each `.ts`/`.vue`
  alternation into a full reload — 42 rebuilds across `src/journals` alone, and
  an uncached `check:lint` of 11 minutes against 1 minute once hoisted to the
  shared block. `TIMING=all` does not show this: rule time was 65s of that 660s,
  and the rest sat in parsing and module resolution.
- `no-non-null-assertion` is on in production source (including `.vue`
  `<script setup>`) and off in tests. Use `.at()` with a `??` fallback; a config
  carve-out silences the rule just as much as an inline disable.
- `compile:i18n` and the Vite plugin both pass
  `--output-structure locale-modules`. The default `message-modules` emits one
  module per message, which dominates unit-suite wall clock through every test
  file that touches `@/i18n`. A bare `npx paraglide-js compile` silently
  restores it.
- Never reformat `messages/*.json` — edit them line-wise. They sit outside the
  prettier glob on purpose, so a `JSON.stringify` round-trip rewrites all eleven
  files end to end. Check `git diff --stat -- messages/` before committing.
- `Promise.withResolvers<void>()` fails `no-invalid-void-type` in production
  source — the rule permits `void` on type-reference generics but its matcher
  does not cover call-expression type arguments. Use the
  `new Promise<void>((resolve) => ...)` longhand. The rule is off in test files,
  and non-void type arguments are fine everywhere.
- Never write requirement or design section numbers in comments ("Satisfies
  Requirement 5.3", "(Requirement 2.5)"), in source, in tests, or in
  `describe()` labels. Bare numbers point nowhere and rot on renumbering.
- Default to no comments. Delete anything that describes _what_ the code does;
  keep only _why_ — non-obvious edge cases, invariants, workarounds, surprising
  host behavior. JSDoc on an exported API is one short line of intent, never a
  paragraph or a file-header narrative.

### e2e traps and harness limits

- `browser.executeObsidian` returns `undefined` as **null** — the WebDriver wire
  serializes it. A poll predicate guarding only on `undefined` therefore receives
  `null` and throws out of `waitUntil` instead of retrying, turning "not parsed
  yet" into a hard failure on whichever combo happens to be slow. `waitForState`
  guards both; anything hand-rolling a `waitUntil` must too.
- Obsidian's own markup drifts across the supported range, so a selector can
  encode a version floor tighter than `manifest.minAppVersion`. The settings
  sidebar entry is the known case: `data-setting-id` and
  `.vertical-tab-nav-item-title` are 1.12+, absent at the 1.8 floor. Reach
  registry objects (`app.setting.pluginTabs`) rather than newer chrome. The
  cached asars under `.obsidian-cache/obsidian-app/` settle such a question
  directly — `npx asar extract` one and grep `app.js`.
- Obsidian's editor zoom scales authored pixels (3px renders as 2.66667px).
  Assert widths through the rounding reader and colors via `getCSSProperty`
  parsed hex, from a custom hex fixture rather than a theme variable.
- A test that opens `mode=window` must call `closePopoutWindows()`, or the
  popout steals the next test's modals.
- Assert user-facing copy through `m.some_key()` imported from the generated
  paraglide messages (`../../src/i18n/paraglide/messages.js`), with an args
  object for interpolation, so a reword becomes a typecheck failure instead of
  silent drift. `tsconfig.e2e.json` needs `allowJs` **and** an explicit
  `include` entry for the generated `.js`; it is a composite project, so without
  the entry TS6307 fires on every file in it. The suite does **not** follow this
  uniformly — four of sixty-one e2e files import `m`, while selectors and a
  number of assertions retype the literal. Import for new assertions; treat the
  retyped literals as known debt, not as the pattern.
- e2e helpers also drive settings through visible tooltips and button labels, so
  renaming a message can break e2e with no unit-test failure. Grep `e2e/` for
  the old literal when changing one.
- `browser.setWindowSize` is unsupported and `app.emulateMobile(true)` reloads
  the app and detaches `executeObsidian`. Exercise responsive reflow by forcing
  a width on the block root through `browser.execute`.
- Per [`docs/e2e-testing-strategy.md`](docs/e2e-testing-strategy.md)'s
  `reloadObsidian` behavior, notes written with `seedNote` do not survive a
  reboot. Seed-then-reload therefore cannot stage a note that must already
  exist at boot; it has to ship in the fixture.
- Cold-boot metadata races cannot be reproduced in e2e: fresh fixture notes fire
  `metadataCache` "changed", which live listeners catch, masking the bug. Test
  these at unit level by faking `getFileCache` to return null until "resolved".
- The junit reporter writes a fixed filename, so after a full-suite run the
  report holds only the last spec file. Locate a failure through
  `e2e/.reports/screenshots/` — one PNG per failing test, named for the test
  title.
- A live `npm run dev` rebuilds the same bundle the suite loads, so reverting a
  fix to prove a spec goes red races the watcher and can pass with the bug
  supposedly reinstated. Pause the watcher around any revert-and-verify window.
- Confirm a suspected regression by running the single spec at a base commit in
  a scratch `git worktree`, never through `git stash` — stash cannot revert
  work that is already committed. `npm run build` first; a stale bundle has
  caused a misdiagnosis before.
- A config-editor modal that auto-opens over the view-editor subpage sits under
  the `UiIconSuggest` dropdown, which refocuses in a microtask. A physical WDIO
  click hits the overlay instead of Save and the close hangs — dispatch the
  click through `browser.execute`.
- An e2e proving a "target a specific journal" feature must pin a target whose
  result **differs** from what the default path resolves. A pin that agrees with
  shelf scope passes even with the feature code deleted.
- Pin Templater to 2.18.0. From 2.21 it declares `minAppVersion: 1.13.0`, so on
  stable Obsidian it lands in `enabledPlugins` but never instantiates:
  `getPlugin("templater-obsidian")` returns null and `<% %>` passes through
  literally with nothing failing loudly.

### UI conventions

- Modal forms are composed entirely from `UiSettingRow`: one row per field, its
  errors in the `#description` slot as
  `<span v-for="error of errorBag.<field>" class="<feature>-form-error">`
  (`journal-`, `shelf-`, `view-`, `command-`, `bulk-add-`, `nav-` — every site
  conforms), and
  the action buttons in their own `controls-only` row rather than a bespoke
  wrapper. `errorBag.<field>` is iterated directly — `v-for` over `undefined`
  renders nothing, so no `?? []`.
- Join a human-readable name list with `formatConjunction` from `@/i18n`, never
  `.join(" and ")` — separator and placement vary by locale and item count. The
  joined value goes into the message as a parameter; only the joining is code.
  Add a disjunction variant rather than hardcoding "or".
- Add a notice or a tooltip only when the outcome is otherwise invisible; the
  dividing line is visibility, not the action's importance. The per-surface
  rulings this generalizes from are recorded in
  [`docs/2026-07-13-ux-text-audit.md`](docs/2026-07-13-ux-text-audit.md) (D3,
  F1) — don't re-propose the items trimmed there.
- Authored icons come from the `as const` `icons` map in `src/ui/icons.ts`, keyed by
  domain (`icons.action.edit`, `icons.entity.shelf`), never a bare Lucide
  literal. User-entered icon fields stay free-form strings, and the renderer
  keeps a `(name: string)` signature so it handles both.

### Unit-suite gotchas

- No `simulate*Error` queues in fakes. A test that needs an error path uses
  `vi.spyOn` with `mockReturnValueOnce`; a baked-in queue adds a parallel state
  machine — typed buffers, ordering, drain semantics — to every fake.
- Skip tests whose only assertion is the framework's own contract: `instanceof`
  on an error subclass that just calls `super()`, Promise thenable behavior, Vue
  lifecycle, vee-validate, moment locale switching. Ask what application
  behavior would break the test; if the answer is "only if Vue breaks", delete
  it.
- No wrappers around `expect()` chains, and no test-local re-implementations of
  library factories. A narrowing helper that returns the inner value and prints
  the actual `Err` earns its place; one that hides a matcher does not.
- The unit suite runs `isolate: false` in a shared vitest project, so workers
  reuse one module registry across files. A test that reaches past its own file
  through a process-global belongs in `*.isolated.test.ts` — `vi.mock`
  (eslint-enforced) and rewriting moment's global locale are the two known
  kinds. The resulting flake surfaces as a nondeterministic count in a
  _different_ file than the polluting one.

### Performance

- The custom-cycle walk [`CONTEXT.md`](CONTEXT.md) describes under `anchorOf`
  has a cost the definition doesn't mention: `pathForDate` calls `anchorOf`
  first, so a loop over N anchors is quadratic on custom-interval journals.
  When you already hold a canonical anchor, render through `buildMetadata` →
  `pathFor` instead.

### Commands and flows

- `CommandRegistration.check` is a listing predicate only — it filters the
  palette. A ribbon click and a bound hotkey reach `execute` unconditionally, so
  re-adding an `if (!check()) return` guard makes the press vanish with no
  feedback. Every command owns its own dead-end message. `NoApplicableJournals`
  is a benign flow error that the flow layer logs and shows nothing for, so a
  caller that needs the user to know must notice it itself.
- A flow that opens a modal keeps its cheap existence guard **before** the
  `attempt.in` block. Moving it inside as a leading `yield*` opens the modal one
  microtask later, and every flow test that grabs the modal synchronously after
  invoking then fails. Read the option's `.value` after `isNone()` narrows it —
  the cast the restructure was meant to remove was never needed.

### Calendar periods

- `CycleService` (`startOf`, `endOf`, `defaultEndOf`, …) and the free
  `periodOfKind` in `src/calendar/period.ts` all answer for the week grid
  installed in moment _right now_; nothing in that layer knows the grid an
  anchor was written under. Any decision that compares data written under the
  old grid must be computed **before** the calendar slice is written — in
  `WeekPresetService`'s snapshot, the one place straddling both grids — and
  carried forward as a resolved value, never re-derived downstream.
- The week-preset change and the notes it invalidates move together, and
  `WeekPresetApplier` (`WeekPresetService`, behind `WeekPresetApplierToken`) is
  the only thing that writes the **week grid** (`mode`/`dow`/`doy`) — the one
  other slice write, `CalendarWeekBlock.vue`'s "apply globally" toggle, sets
  `global` in place, and `global` only decides whether `applyWeekConfig` also
  patches the global moment locale; `CUSTOM_LOCALE`, the locale `localMoment()`
  reads, gets the same `{dow, doy}` either way, so the grid does not move. The
  applier snapshots every weekly note's
  `(weekYear, weekOfYear, endDate)` under the old grid, writes the slice, awaits
  a `nextTick` so the settings bridge's `watchEffect` has installed the new grid,
  then re-anchors through `NoteConnectionService.reanchorAll`. Setting
  `calendarSlice.state` directly is the trap: the grid moves, the notes keep a
  frontmatter date that is no longer their week's start, the parser rejects it as
  non-canonical, and they fall out of `JournalsIndex` — the calendar reads "no
  note" over untouched files. Even on the supported path a shorter year can
  collapse two weeks onto one anchor; the loser keeps its old date rather than
  overwriting the winner, and that count reaches the user as a notice.

### Decorations and nav blocks

- The decoration engine models a custom interval as a "day"-kind period at its
  start anchor, which collides with the genuine day cell at that anchor. The
  month and week grids do not resolve this by excluding custom journals: they
  pass the full shelf scope and filter each binding so a custom journal
  contributes only its offset-condition decorations, which mark single days.
  Everything else it defines renders in the interval list. The fixed-only scope
  survives in exactly one consumer, `PeriodButtonsItem.vue`.
- Whole-block nav decoration draws only on the current journal's own
  decorations — the _Whole block decoration_ setting in
  [`README.md`](README.md#navigation-blocks) describes it, and
  `navBlockDecorationScope` (`decoration-scopes.ts`) is the one map it reads.
  Per-segment decoration is scoped differently and is the part no doc states,
  and unlike the block it is not one scope: a segment linked `none`, or an
  unshifted `self`, decorates as every journal of the same write type in
  scope — the owning shelf's journals, or all journals when the journal is on
  no shelf, the pre-existing v2-inherited shape
  (`segmentDecorationCell` in `src/code-blocks/nav/segment-decoration.ts`).
  Every other link — `journal`, a fixed-period kind, or a shifted `self` —
  decorates from its **resolved link target** instead: the journal(s) the
  segment actually opens, not the host. Both outcomes then split across two
  provide/inject maps, `navSegmentFixedScope` and `navSegmentIntervalScope`,
  because a custom journal's interval is a "day"-kind period at its start
  anchor and would otherwise collide with the genuine day cell there — the
  same reason the month/week grids above keep custom intervals out of the
  fixed scope. The block scope and the none/self per-segment scope both come
  from v2. The symmetry between them is tempting and wrong: don't "correct"
  the none/self per-segment scope to the block's narrower current-journal-only
  scope to match it — the shelf-grouped same-write-type set is deliberate and
  still applies. `NavBlock` is shared with the custom-interval view, so the
  scope reaching its `CellDecoration` for the block-level draw arrives as a
  `blockScope` prop (`navSegmentIntervalScope`, for `CustomIntervalsBlock`)
  and is never hardcoded inside it.
- A segment's decoration period comes from `segmentDecorationCell`
  (`src/code-blocks/nav/segment-decoration.ts`), and any period it can return
  must also be registered in the matching `useCellDecorations` call for that
  scope kind, or `CellDecoration` renders nothing on the cache miss —
  silently, no error thrown. `CustomIntervalsBlock.vue` hits this directly:
  `intervalBlock` segments are edited through the same segment editor as
  `navBlock`'s, so one can carry any link kind — a non-self link resolves to a
  **fixed**-period target, which the interval-scope `useCellDecorations` call
  there does not register. It needs its own fixed-scope call alongside the
  interval one, registering only the fixed cells (filtered by
  `cell.scopeKind === "fixed"`), or those segments paint nothing.

### Deliberate non-bugs

Settled decisions that read as regressions. Don't "fix" them; changing any needs
the maintainer's opt-in.

- Startup never re-places a restored view leaf — a leaf dragged elsewhere keeps
  its position, and the dragged layout wins over the setting. A view on the
  "wrong side" is a stale `workspace.json`; check where the leaf sits in the
  workspace tree before touching the view host.
- The seeded default Calendar view's missing ribbon icon is deliberate — see
  `src/views/default-view.ts` and the first-run step in
  [`docs/manual-testing-checklist.md`](docs/manual-testing-checklist.md).
  Fixtures with no persisted `views` key get that seed, so an e2e must open the
  view by command; a ribbon click works only on a fixture that pins it on.
- No `SelfWriteGuard` e2e exists. Against real Obsidian, guard-on and guard-off
  converge to byte-identical frontmatter; the only divergent case is a
  non-deterministic race, so the test would be a tautology or a flake. Unit
  tests cover the guard.
- Three nav consumers compute a journal's shelf scope and their off-shelf
  fallbacks differ on purpose. A write-type link row means "open the journal of
  this kind in my scope", so it falls back to _all_ journals; a "journal" link
  row means "link to a shelf-mate", so its target picker falls back to _empty_.
  Both fallbacks are tested. Do not fuse the consumers behind a shared
  shelf-mates helper. The consequence — an off-shelf journal cannot author a
  "journal"-link row at all — is an open product question, not a code bug, and
  changing it is a deliberate behavior change.
