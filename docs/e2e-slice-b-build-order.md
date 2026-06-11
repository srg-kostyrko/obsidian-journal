# E2E slice B — build order

Sequencing plan for implementing slice B (see the full design in
`docs/e2e-slice-b-journeys.md`). Slices A/C/D are green; the `journeys` suite is
registered in `wdio.conf.mts` but empty, and there is no `e2e/journeys/` dir,
`e2e-journeys` fixture, or journeys support layer yet.

This doc only fixes **order and dependencies** — each chunk is independently
green-able. Per-test detail stays in the journeys design; per-chunk
implementation detail comes from `writing-plans` when each chunk is started.

## Principles

- **One load-bearing production change, first.** `data-anchor="<ISO>"` on
  `NotesCalendarCell` (it has `data-active` but no `data-anchor`;
  `CalendarMonthView`/`CalendarWeekView` already carry one). It gates every
  cell-click and cell-identity assertion, so it lands in chunk 0.
- **Grow the `e2e-journeys` fixture per chunk**, not rich up front. Each chunk
  adds exactly the journals/notes/decorations/commands its specs need. Accepts
  some fixture churn in exchange for a small first-green; deliberate deviation
  from the design's "deliberately rich" framing.
- **Render seams before config/command seams** — matches the design's priority
  (a) real render, (b) real click path, then the independent settings and
  command seams.
- **Shared support grows in place.** `support/decorations.ts` and
  `support/vault.ts` are authored in chunk 1 and reused by chunk 2.

## Chunks

### Chunk 0 — Infra + canonical journey (also the PR-gate smoke core)

- **Production:** `data-anchor="<ISO>"` on `NotesCalendarCell` — the slice's only
  source edit.
- **Fixture `e2e-journeys` (core):** one journal per period kind
  (day/week/month/quarter/year), each in its own folder; ≥2 shelves with disjoint
  journals. The default calendar view auto-seeds (no `views` key). No
  decorations/commands/custom-view, and no `navBlock` variants yet — nothing
  renders a nav block until chunk 2, so the two `navBlock.type` variants move there.
- **Support:** `support/view.ts` — ribbon open, find/click cell by anchor, read
  `data-active`.
- **Specs:** `view.e2e.ts` part 1 — canonical day journey (cell → create + open +
  live-active) + the 4 non-day period types via the month view's header
  (`header-month`/`header-quarter`/`header-year`) and week-number cells. (v3 has
  no grid-level period switch; `PeriodButtonsItem` is a direct create-shortcut.)
- **Proves:** view-leaf mount, real ribbon click path, cell-click →
  create+open+live-active.

### Chunk 1 — View-leaf decorations

- **Fixture +:** 12 decorations (6 condition, 6 style) + the notes matching each
  condition.
- **Support:** the calendar/view/decoration helpers are colocated under
  `e2e/journeys/` (not `support/`) per the journeys-design layout: `calendar.ts`
  (the `calendarSurface(root)` factory), `view.ts` (moved from `support/`;
  `openCalendarView` + the bound `calendar`), and `decorations.ts` (seeding +
  computed-style readers). The only `support/` change is a folder-aware
  `seedNote`. The factory is built in chunk 1 (ahead of chunk 2's second mount
  root) rather than deferred.
- **Specs:** `view.e2e.ts` part 2 — 6 condition + 6 style decorations +
  interactive shelf-scope.
- **Proves:** plugin `styles.css` surviving Obsidian's real cascade — the thing
  jsdom component tests structurally cannot verify.
- **Caught + fixed a live-update bug** (commit `fa84a023`): the incremental
  decoration path (`use-cell-decorations.ts`) keyed `periodsByAnchor` one-per-anchor,
  so a week/month period whose anchor collides with a visible day cell was
  overwritten by the day period and its decorations never re-rendered on live
  create/edit. Fixed by grouping periods per anchor and re-evaluating all of them.
  Unit suites (single day periods) couldn't see it; the e2e did. This is exactly
  the real-Obsidian seam slice B exists to cover.

### Chunk 2 — Code-block mount context

- **Support:** `journeys/code-blocks.ts` (reading-mode `openInReadingMode`, fenced-content
  builders, block-root selectors scoped to the visible leaf, the
  `timelineCalendar = calendarSurface(TIMELINE_BLOCK)` surface). Chunk 1's decoration
  matrix is extracted into `assertDecorationMatrix(surface)` in `journeys/decorations.ts`
  and the view-leaf spec is retrofitted onto it.
- **Fixture +:** notes embedding `calendar-nav` / `journals-home` /
  `calendar-timeline`; plus the two `navBlock.type` variants (one `existing`, one
  create) on the nav-bearing journals — this is the first chunk that renders a nav
  block.
- **Specs:** `code-blocks.e2e.ts` — fence renders (4, incl. the malformed-fence
  `.code-block-error` case), nav navigation (4: `navBlock.type` × create/existing + day/
  month derivation), nav decorations (2), and the full timeline matrix (13).
- **Surface correction:** the code-block grid is `calendar-timeline`, not `calendar-nav`
  (the journeys-design had these inverted). `calendar-nav` is text rows + `CellDecoration`
  wrappers; it carries its own nav/decoration tests, not the grid matrix.

### Chunk 3 — Settings SPA (independent seam)

- **Fixture +:** two empty shelves (`rename-me`/`delete-me`), `numbering` enabled on
  `monthly` (one source, to surface the sequence-edit row), and a `commands` collection
  (`cmd-edit`/`cmd-delete`). **No new journals** — a 6th would duplicate a write-type and
  break chunk-0's single-journal-per-kind cell-click. Views are left to auto-seed (adding a
  `views` key would suppress the default view and chunk-0's ribbon path).
- **Support:** `support/settings.ts` (open/close the tab — close resets the SPA stack via
  `hide()`; click-by-aria-label / by-text; expand collapsibles; navigate dashboard→shelf→
  journal; drive plugin-dialog-scoped modals) + a widened `support/plugin-data.ts`
  (`StoredSettings` views/commands shape + a generic `waitForSettings` poller).
- **Specs:** `settings.e2e.ts` (single `e2e-journeys` boot; per-`it` distinct entity so the
  accumulating `data.json` is order-independent; per-`it` open/close resets to the dashboard):
  journals (add/rename/delete/edit-frontmatter/edit-sequence), shelves (rename/delete/place),
  views (rename/delete/add-block/add-toolbar-item), decorations (edit/delete), commands
  (edit/delete), nav-row (edit) — 17 `it`s. Plus `settings-first-journal.e2e.ts` (`e2e-empty`
  boot, 1 `it`). Every `it` asserts both halves: persisted `data.json` (polled) + DOM.
- **Surface note:** journals are all shelved in `e2e-journeys`, so the `JournalsDashboardBlock`
  list is empty and journal subpages are reached through `Organize <shelf>` → `Edit <journal>`;
  the block's `+ Create new journal` control still renders for the add flow. Two
  load-bearing findings during build: (a) Obsidian's settings panel is itself a
  `.modal-container`, so modal helpers scope to the non-settings dialog; (b) `AddJournalFlow`
  pushes the new journal's edit subpage on success, so add-journal asserts the name on the
  subpage, not the dashboard.

### Chunk 4 — Command palette + bulk-add

- **Correction — bulk-add is not a palette command.** It is the header button on the
  journal edit subpage (`JournalEditSubpage.vue`, `m.bulk_add_command()` = "Bulk add notes
  to this journal"), so `bulk-add.e2e.ts` reaches `BulkAddFlow` through the chunk-3 settings
  SPA and reuses the `support/settings.ts` dialog driver. Only the per-note commands are
  palette-driven.
- **Support:** `support/commands.ts` grows a palette/suggest driver (`openPalette` via the
  built-in `command-palette:open`; `promptChoose`/`waitForPrompt`/`paletteLists` over the
  shared `.prompt` DOM — `promptItem` chains `$(PROMPT).$(".suggestion-item*=…")` because a
  `*=` text query can't be combined with a descendant prefix). `support/vault.ts` gains
  `openNote`/`closeAllLeaves`/`waitForActiveNote`; `support/settings.ts` gains generic
  `clickDialogButton`/`waitForDialogClosed`/`toggleModalCheckbox`.
- **Fixture:** no `data.json` change — every precondition note (editor note, plain note,
  unconnected note, three indexed adjacents, bulk-add source folders) is runtime-seeded per
  spec (like `seedDecorationFixture`), so chunks 0–3 are untouched.
- **Specs (8 `it`s, all green):** `commands.e2e.ts` — insert-date-link (palette flow-dispatch +
  no-editor `check()` absence), connect-note, open-next/prev + off-journal `check()` absence.
  `bulk-add.e2e.ts` — matching notes attach, an unparseable note is skipped. The per-note
  commands are palette-driven precisely because the palette honors `check()`, which
  `executeCommandById` (slices A/C/D) bypasses.
- **Deliberate deviation — insert-date-link insertion not asserted end-to-end.** Driving a
  choice in the plugin's own `SuggestModal` (the journal picker) is not a reliable
  wdio-obsidian seam: typing filters it, but neither click, Enter, nor ArrowDown→Enter
  propagates the choice into opening the follow-on date-picker modal (the choice resolves as a
  silent cancel; Obsidian's command palette, a different `SuggestModal`, drives fine — that is
  why connect-note/open-next/prev pass). The e2e therefore asserts the **real palette click
  dispatches into `InsertJournalLinkFlow`** (the journal picker opens) and stops there; the
  suggest→date-picker→cursor insertion is jsdom-covered by `insert-journal-link.flow.test.ts`.

### Chunk 5 — CI split

- Wire the chunk-0 happy paths + one code-block render + the add-journal
  round-trip into a thin `journeys-smoke` on the **PR gate**; the full `journeys`
  suite to **nightly** across the version matrix.

## Dependency summary

```
chunk 0  data-anchor + view.ts + fixture core   ──┬─> chunk 1  decorations (view leaf)
                                                   │       │
                                                   │       └─> chunk 2  code-block mount (reuses deco helper)
                                                   ├─> chunk 3  settings SPA      (independent)
                                                   └─> chunk 4  palette + bulk-add (independent; after 3)
chunk 5  CI split  ── after all specs exist
```
