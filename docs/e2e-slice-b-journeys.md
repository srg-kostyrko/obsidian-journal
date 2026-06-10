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

Therefore decoration rendering and cell-click dispatch are tested **once per
mount context** (view leaf, and `calendar-nav` for the code-block context) — not
once per surface. Re-running them on `calendar-timeline` would re-test the
identical `VueCodeBlockHost` mount and is forbidden by "don't test the wiring."

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
    `has-open-task`, `all-tasks-completed`), each with a constant **icon** style.
  - 6 _style_ decorations (`background`, `color`, `border`, `shape`, `corner`,
    `icon`) on a constant simple condition (`has-note`), each targeting a
    distinct journal/cell so they don't stack.
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
- **Other period types** (4): switch level via the toolbar period-buttons →
  grid renders that period → click cell → correct-type note created.
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
- **Nav click** (2) on `calendar-nav` only: existing-note cell → opens (no
  create); empty cell → creates+opens+active. Proves clicks inside a
  `MarkdownRenderChild` reach `OpenDateFlow`. The existing-vs-create choice for
  adjacent nav is the journal's `navBlock.type`.
- **Condition decorations** (6) + **style decorations** (6) on `calendar-nav` —
  the code-block mount context. **Not** repeated on timeline.
- **Mode-derivation** (2): `calendar-nav` in a daily note shows day-level nav; in
  a monthly note shows month-level (proves the host-connection read against the
  real index). Full per-type derivation is pure `match(write.type)` — unit-tested.
- **Derived shelf-scope** (1): nav in a note belonging to journal X (shelf A)
  scopes its calendar to shelf A, excluding Y.

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
  `NotesCalendarCell` (mirroring `CalendarMonthView`, which already carries it).
  This is the only production edit slice B requires.
- **Obsidian chrome** (ribbon, palette, `Menu`, settings modal) never gets a
  hook — role/text/ARIA only.

## Decoration helper — contained brittleness

`support/decorations.ts` exposes intent-level assertions and hides the
rgb/color-string normalization the computed-style assertions need:

- `expectCellStyle(anchor, kind, expected)` — normalizes computed
  `background-color`/`color`/border values before comparing.
- element-presence checks for `icon`/`shape`/`corner` (`DecorationIcon` etc.).

## Support layer

Continue the existing plain-function style (`support/vault.ts`,
`migration.ts`, `templater.ts`); one module per surface, specs read as intent:

- `support/commands.ts` — command-palette driver.
- `support/view.ts` — ribbon open, find/click cell by anchor, read `data-active`.
- `support/code-blocks.ts` — open a note in reading mode, locate a rendered
  block, assert not-error.
- `support/decorations.ts` — the helper above + condition-note seeding.
- `support/settings.ts` — open settings tab via API, navigate subpages, poll
  persisted `data.json`, read list rows.
- extend `support/vault.ts` — seed notes with tags/tasks/properties/title.

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
- **`calendar-timeline` decorations/clicks** — identical `VueCodeBlockHost` mount
  - `NotesCalendarCell` as `calendar-nav`; covered there.
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
