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

- **Support:** `support/code-blocks.ts` — reading-mode render, locate block,
  assert not the `renderError` fallback.
- **Fixture +:** notes embedding `calendar-nav` / `journals-home` /
  `calendar-timeline`; plus the two `navBlock.type` variants (one `existing`, one
  create) on the nav-bearing journals — this is the first chunk that renders a nav
  block.
- **Specs:** `code-blocks.e2e.ts` — fence renders (3), nav click (2),
  condition+style decorations on `calendar-nav` (12), mode-derivation (2),
  derived shelf-scope (1).
- Reuses chunk 1's decoration helper. Decorations/clicks are **not** repeated on
  `calendar-timeline` (identical `VueCodeBlockHost` mount).

### Chunk 3 — Settings SPA (independent seam)

- **Fixture +:** seeded commands + one custom view (beyond the auto-seeded
  default).
- **Support:** `support/settings.ts` — open settings tab via API, navigate the
  subpage SPA, poll persisted `data.json`, read list rows.
- **Specs:** `settings.e2e.ts` (journals/shelves/views/decorations/commands/
  nav-row flows) + `settings-first-journal.e2e.ts` (boot `e2e-empty`).
- **Proves:** subpage-nav SPA + async `saveData` persistence round-trip.

### Chunk 4 — Command palette + bulk-add

- **Support:** `support/commands.ts` — command-palette driver.
- **Fixture +:** unconnected note, adjacent journal entries, editor-openable
  note.
- **Specs:** `commands.e2e.ts` (insert-date-link, connect-note, open-next/prev +
  `check()` absence) + `bulk-add.e2e.ts` (vault-scan + 2-modal).

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
