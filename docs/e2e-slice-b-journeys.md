# E2E slice B — full user journeys

Implementation plan for slice B of the e2e roadmap (see
`docs/e2e-testing-strategy.md`). Slices A (integration), C (migration), and D
(interop) are green; the `journeys` suite is registered in `wdio.conf.mts` but
empty. This is its design.

## Thesis — the seam slice B adds

Slice A asserts only vault frontmatter; it never renders a pixel. Slice B's
justifying seam is **our real-DOM surfaces rendering inside a real Obsidian
process, plus the real trigger path into them** — none reachable by
`__mocks__/obsidian.ts`. Two sub-seams, in priority order:

- **(a) real render** — our Vue surfaces mount in real Obsidian containers and
  paint the right state. Primary.
- **(b) real click path** — a ribbon/cell/palette click dispatches through
  Obsidian's own event handling into the plugin (vs. `executeCommandById`, which
  A/C/D use to bypass the UI).

Cross-step persistence ("reopen, still correct") is **not** a slice-B seam: the
active-state assertion below proves live reactivity immediately, so a
teardown→remount replay would add nothing.

### The two mount-context seams (this is the whole de-duplication argument)

Every calendar-bearing surface renders the **same** components
(`NotesCalendarCell` + `useCellDecorations` + `useNotesCell`). What differs is
only **how Vue is mounted**:

1. **View-leaf mount** — `createApp` on `ItemView.contentEl` (`view-leaf.ts`).
2. **Code-block mount** — `VueCodeBlockHost` as a `MarkdownRenderChild` via the
   markdown post-processor (`code-block-service.ts`). **`calendar-nav` and
   `calendar-timeline` share this exact path.**

Therefore decoration rendering is tested **once per mount context**. The code-block
mount's `NotesCalendarCell` grid is **`calendar-timeline` (`mode: month`)** — it embeds
the same `NotesMonthView` as the view leaf — so the full decoration matrix re-runs there
(re-rooted via `calendarSurface`). `calendar-nav` is a **different** surface: it renders
text rows (`NavBlock`/`NavBlockRow`) with `CellDecoration` wrappers and a write-type-
filtered scope, so it gets its **own** targeted tests (fence render, `navBlock.type`
navigation, `periodForJournal` derivation, and the whole-block decoration path) rather
than the grid matrix.

## Fixtures (2)

Per-spec-file `reloadObsidian` in `before` (settings must be present at
`onload`; matches slice A). `resetVault` only _within_ a file to wipe note
mutations between its tests. Settings flows are config-only — they need no
`resetVault`.

### `e2e-journeys` (new) — deliberately rich, not minimal

`data.json` seeds:

- **One journal per period kind** — `day`, `week`, `month`, `quarter`, `year`
  (one each, so a cell-click never hits the multi-journal suggester picker).
- **Two `navBlock.type` variants** — one journal with `navBlock.type: "existing"`
  (navigate-only) and one that creates, to drive the two nav-click cases.
- **≥2 shelves with disjoint journals** (shelf A ⊇ {X}, shelf B ⊇ {Y}) for both
  shelf-scoping tests.
- **Decorations** arranged so each decoration test isolates exactly one
  decoration on a distinct cell:
  - 6 _condition_ decorations (`title`, `tag`, `property`, `has-note`,
    `has-open-task`, `all-tasks-completed`), each carrying a constant **corner**
    marker style so the assertion is element presence.
  - 6 _style_ decorations (`background`, `color`, `border`, `shape`, `corner`,
    `icon`). Decorations are **per-journal scoped** and same-kind journals share a
    grid cell, so isolation is by **crafted condition per cell**, not distinct
    journal: each decoration is wired to a journal + condition that exactly one
    seeded note matches (style decos use a unique inline tag per day cell; the
    `background` style rides the yearly `has-note` on the year header). Any empty
    day cell is the universal control.
- **Seeded commands** (for edit/delete-command flows) and **one custom view**
  beyond the auto-seeded default (for edit-name/delete/add-block flows).

Vault notes: dated notes per journal type; notes carrying a `tag` / open task /
completed tasks / frontmatter property / title pattern (for the decoration
conditions); a connected journal note embedding ` ```calendar-nav ` plus notes
with ` ```journals-home ` and ` ```calendar-timeline `; an unconnected note (for
connect-note); adjacent journal entries (for open-next/prev); a note openable in
the editor (for insert-link).

### `e2e-empty` (reuse)

No journals; the views collection auto-seeds the default calendar view
(`views/config.ts`). Used only for the empty→first-journal settings path.

## Spec inventory

All under `e2e/journeys/`, suite `journeys`. ≈60–65 `it`s, ~6 boots.

### `view.e2e.ts` (boot `e2e-journeys`)

- **Canonical day journey** (1, multi-step — the one sanctioned non-atomic
  journey): ribbon-click "Open Calendar" → month grid renders → click the day
  cell (by `data-anchor`) → assert **(i)** day note created with attached journal
  frontmatter (reuse `waitForJournalFrontmatter`), **(ii)** note opened in the
  active leaf, **(iii)** the clicked cell flips to `data-active` **immediately**
  (live `ActiveEntryViewModel` reactivity off the real active-leaf event — no
  remount).
- **Other period types** (4): the month view surfaces each non-day period as its
  own cell — month/quarter/year as header cells (`data-testid` `header-month` /
  `header-quarter` / `header-year`, the last gated on a quarter journal in scope)
  and week as the week-number cell (`data-testid="week-number-cell"`). Click each
  → correct-type note created. (v3 has no grid-level switch; `PeriodButtonsItem`
  is a direct create-shortcut, not a grid mode — the header/week cells already
  carry production `data-testid` hooks, so only the day cell needs `data-anchor`.)
- **Condition decorations** (6, one behavior each): seed a note matching
  condition X → its cell renders the decoration; a control cell does not.
- **Style decorations** (6, one behavior each): assert the **computed**
  (post-cascade) style via the brittleness-contained helper — this is the only
  thing jsdom component tests structurally can't verify (plugin `styles.css`
  surviving Obsidian's real cascade, `!important` + CSS vars resolving).
- **Interactive shelf-scope** (1): click shelf-selector → pick shelf A from the
  real Obsidian `Menu` → X's cell stays decorated, **Y's loses its decoration**.

### `code-blocks.e2e.ts` (boot `e2e-journeys`)

- **Fence renders** (3): `journals-home`, `calendar-nav`, `calendar-timeline`
  each render real content **and not** the `renderError` fallback (per-processor
  registration seam — the only thing that differs between nav and timeline).
- **Nav navigation** (4) on `calendar-nav`: `create`-type offers the next period with no
  neighbour and **creates+opens** the next-day note on click (day-period derivation);
  `existing`-type **hides** the next button with no neighbour and **navigates** to the
  adjacent existing month note on click (month-period derivation). The two
  `navBlock.type` branches are the discriminator.
- **Nav decorations** (2) on `calendar-nav`: a `decorateWholeBlock` host matching a corner
  condition renders `.nav-view > .nav-block .decoration-corner`; a color condition's
  computed hex survives the real cascade. (The nav decoration path is `CellDecoration` on
  text rows — distinct from the grid; it is **not** the 12-matrix.)
- **Timeline decorations** (13) on `calendar-timeline` (`mode: month`): the full 6
  condition + 6 style + 1 control matrix, re-run on the code-block grid via the shared
  `assertDecorationMatrix` runner.
- **Out of scope for nav:** cross-journal shelf re-scoping (a grid concept; covered by the
  view-leaf shelf-scope test and the timeline matrix). A nav renders only its host
  journal's own prev/current/next periods.

### `settings.e2e.ts` (boot `e2e-journeys`, single boot)

Every config flow, **order-independent on a distinct (pre-seeded or
uniquely-named) entity** so in-memory `data.json` accumulation is harmless and
no per-`it` reboot is needed. Nested `describe` per entity:

- **Journals**: add, rename, delete, edit-frontmatter-field, edit-sequence-property
- **Shelves**: edit-name, delete, place-journal
- **Views**: edit-name, delete, add-block, add-toolbar-item
- **Decorations**: edit, delete
- **Commands**: edit, delete
- **Nav-row**: edit

Each `it` drives the real subpage-nav SPA (`SubpageNav.push(...)` → entity edit
subpage) and asserts **both** the contract halves: change **persisted to
`data.json`** (poll the plugin's saved data via `executeObsidian` + `waitUntil`,
not node `fs`) **and** the list/subpage DOM reflects it.

### `settings-first-journal.e2e.ts` (boot `e2e-empty`)

- (1): empty vault → "Add journal" → modal → submit → first journal persisted and
  the dashboard's empty state replaced by the new row.

### `bulk-add.e2e.ts` (boot `e2e-journeys`)

Its own journey (not settings — it's a vault-scan + 2-modal seam closer to
slice A): invoke bulk-add for a journal → configure modal → `BulkAddService.plan()`
scans the real vault for matching notes → process modal → assert the matched
notes attach (frontmatter). ~2–3 `it`s.

### `commands.e2e.ts` (boot `e2e-journeys`)

Palette-triggered (the real click path for command-only features) — and the
palette honors `check()`, which `executeCommandById` bypasses. A
`support/commands.ts` helper opens the palette (the one sanctioned
`executeCommandById('command-palette:open')` on Obsidian's _own_ built-in, as
setup), types the command, asserts it is listed, runs it.

- **insert-date-link**: editor focused at a known cursor → palette-invoke → pick
  date in modal → assert the journal link landed at the cursor + cursor advanced
  (real CodeMirror editor/cursor seam). Also assert it is **absent** with no
  active editor (`check()`).
- **connect-note**: unconnected note → palette-invoke → pick journal → frontmatter
  attached.
- **open-next / open-prev**: journal note with seeded adjacent entries →
  palette-invoke → the adjacent note becomes active. Absent on a non-journal note
  (`check()`).

## Selectors

Default role/text. Sanctioned `data-*` escape hatch in **our** markup only where
role/text genuinely can't pin the element:

- **Cell identity**: a day number repeats across outside-month spill, so role/text
  can't disambiguate. **Production change**: add `data-anchor="<ISO>"` to
  `NotesCalendarCell`, emitting the period's `anchor` (the calendar views already
  carry `data-anchor`; `CalendarWeekView` uses `.anchor`, the right rule for a cell
  polymorphic across all period kinds). This is the only production edit slice B
  requires.
- **Obsidian chrome** (ribbon, palette, `Menu`, settings modal) never gets a
  hook — role/text/ARIA only.

## Support layer

E2E helpers are **plain functions, never page-object classes.** Navigation is a
one-level push/pop stack (`SettingsUiService`), selectors are handled by functions
returning lazy wdio locators, and classes would clash with the codebase's
functional style. The single stateful exception is the calendar root-binding
factory below — and it's a closure, not a class.

### Layout — colocation, not a central junk drawer

`support/` holds **only cross-slice surface drivers** (helpers used by ≥2 slices).
Slice-specific helpers live **in their slice folder**. An import from `../support`
versus a sibling import then signals shared-vs-local at a glance.

- `support/wait.ts` — the one polling primitive (below).
- `support/vault.ts` — `createNote`/`renameNote`, `frontmatterOf`/`contentOf`,
  `activeNotePath`, their `waitFor*` wrappers; (slice B) seed notes with
  tags/tasks/properties/title.
- `support/plugin-data.ts` — read persisted `data.json`, `journalNamesOf`/`*KeysOf`,
  `waitForSettingsVersion`; (slice B) navigate settings subpages, read list rows.
- `support/editor.ts` — `cursorOf`, `editorValue`, `waitForCursorLine`.
- `support/commands.ts` — `runCommand` (`executeCommandById`) and (slice B) the
  command-palette driver.
- `e2e/migration/` — `waitForMigrated*` legacy-schema pollers, colocated with the
  migration specs; they change with the migration schema, not vault mechanics.
- `e2e/journeys/` — the calendar factory, decorations, view, and code-block helpers
  (below), colocated with the journey specs.

There is **no `templater.ts`**: Templater interop drives the same command / editor /
vault surfaces as everything else, and the `<%`-evaluated assertions live in the
spec predicates. A slice-named helper bag (`migration.ts`, `templater.ts`) is the
anti-pattern this layout removes — each was several surfaces in a trench coat.

### One polling primitive

No fixed sleeps; every wait polls real state until it converges. All `waitFor*`
helpers are thin wrappers over a single primitive:

```ts
function waitForState<T>(
  read: () => Promise<T | undefined>,
  predicate: (value: T) => boolean,
  timeoutMsg: string,
): Promise<void>;
```

Semantic names survive (`waitForMigratedNote`, `waitForJournalFrontmatter`,
`waitForCursorLine`) — they keep the predicate out of the spec (Authoring
convention #7) — but their bodies collapse to one line each. DOM pollers
(`data-active`, persisted `data.json`) build on the same primitive.

### Calendar surface — the one root-bound factory

`NotesCalendarCell` renders in two mount contexts (view leaf, code block). A
factory binds the mount root **once** so cell-finding isn't re-threaded through
every call:

```ts
const cal = calendarSurface(root); // root = view-leaf contentEl OR code-block el
cal.cell(anchor); // scoped locator by data-anchor
cal.waitForActive(anchor); // over waitForState
```

Each context's spec constructs it against its own root and shares every method.
Everywhere else uses **plain functions with explicit args** — a bound object for a
single-context surface is ceremony.

### Decoration helper — contained brittleness

A **context-free** helper, fed an already-located cell, so it needs no root binding
(rgb normalizes the same in either mount context):

```ts
expectCellStyle(cal.cell(anchor), kind, expected); // factory finds, helper asserts
```

It normalizes computed `background-color`/`color`/border before comparing, plus
element-presence checks for `icon`/`shape`/`corner` (`DecorationIcon` etc.).
Cell-finding (context-bound, on the factory) and style-normalization (context-free)
change for different reasons, so they stay separate.

## CI placement — split

- **PR gate** — a thin `journeys-smoke` (~3–5 highest-signal happy paths: the
  canonical view journey, one code-block render, the add-journal round-trip),
  latest/latest. The per-PR guard that core journeys still work.
- **Nightly** — the full `journeys` suite across the version matrix. The 24-`it`
  decoration matrix, full settings coverage, and command journeys are largely
  **drift-detection** (does our DOM survive Obsidian's cascade / real modal
  stacking) — nightly's job, and where flake is triaged without blocking merges.

Keeps the gate fast and credible (the doc's explicit value) while keeping
per-PR signal on the core flows.

## Explicitly out of scope

- **Pure-date decoration conditions** (`date`, `weekday`, `offset`) — computed
  from the cell's period, no Obsidian dependency; they'd pass against the mock.
  Unit-tested.
- **`calendar-nav` grid decorations/clicks** — `calendar-nav` is text rows, not a
  `NotesCalendarCell` grid; the grid matrix runs on `calendar-timeline`.
- **The three nav-key aliases** (`journal-nav`/`calendar-nav`/`interval-nav`) —
  one component, one registration loop; testing all three re-tests the wiring.
- **Per-style element/inline-style rendering** — already in `CellDecoration.test.ts`
  / `derive-styles.test.ts`; e2e asserts only the computed post-cascade value.
- **Reopen/persistence replay** — superseded by the immediate `data-active`
  assertion.
- **Mobile** — Electron e2e is desktop-only (see strategy doc).

## Verify on implementation

- `reloadObsidian` re-reads `data.json` at `onload`; `resetVault` does not reload
  plugin settings (no `data.json` watcher exists) — confirm the reset/reload split
  holds in practice.
- Settings persistence timing: `saveData` is async — poll, never sleep.
- Command-palette helper: confirm typing filters to our command and Enter runs the
  highlighted entry across the version matrix.
