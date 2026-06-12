# e2e coverage for journal-view gaps

## Problem

The `src/views` feature (configurable view leaf with blocks and toolbar items) is
well covered by unit/component tests, and its core view-leaf seam is covered by e2e
(`view.e2e.ts`): ribbon → mount, `month-calendar` cell-click → note create/open,
decorations matrix, live re-decoration, shelf re-scoping. The four view-management
flows are covered by `settings.e2e.ts`.

Several capabilities mount but are never asserted, or do not appear in any opened
view at all, so they have **no end-to-end coverage** (unit tests only):

1. **`week-calendar` block** — never mounted in e2e.
2. **`markdown-template` block** — never mounted in e2e.
3. **`custom-intervals` block** — present in the default view, but renders empty
   because the `e2e-journeys` fixture has no `custom`-write journal; nothing asserts it.
4. **`divider` block** — mounts in the default view; no assertion.
5. **Toolbar `button` items** (`pick-date`, `current`, `navigate-step`) — mount in the
   default view but are never clicked. View-level navigation is untested.
6. **`period-buttons` toolbar item** — mounts; never driven.

## Goal

Close every gap with e2e tests, driving real interactions where the seam is distinct
from already-covered code, and asserting render where the new coverage is the wiring
itself.

## Fixture strategy

The default view is auto-seeded by `viewsCollection` (`src/views/config.ts:53`), and
the seed runs **only when the `views` key is absent** from `data.json`
(`settings-service.ts:186`). Adding a `views` key to `e2e-journeys/data.json` would
suppress the seed and delete the default Calendar view that the existing tests open.
Therefore:

- **`e2e-journeys/data.json`**: add **one `custom`-write journal** (`sprint`) carrying
  the default `intervalBlock` rows. Adding a journal does **not** add a `views` key, so
  the default-view auto-seed is preserved. This unblocks the `custom-intervals` and
  toolbar tests, which run against the seeded default view.
- **New fixture `e2e-views`**: minimal `data.json` with `journals: { daily, weekly }`
  and a single `views` entry — a `"Blocks"` view (`showInRibbon: true`,
  `leaf: "right"`) holding `[week-calendar, markdown-template, divider]`. This fixture
  never opens the default Calendar view, so the default view need not be reproduced here.

A view's ribbon/command name is `Open ${view.name}` (`view-host.ts:98`), so the
"Blocks" view opens via `[aria-label="Open Blocks"]`.

## Test inventory

### A. Toolbar — `view.e2e.ts`, fixture `e2e-journeys`, default view

Buttons render `UiButton` with `aria-label` set to the tooltip. Confirmed strings:
`"Pick a date"`, `"Today"`, `"Previous month"`, `"Next month"`, `"Previous year"`,
`"Next year"`.

- **navigate-step**: click `[aria-label="Next month"]` → assert the `header-month`
  cell's `data-anchor` advances one month; click `[aria-label="Previous month"]` →
  assert it returns. Proves the toolbar → `viewContext.refDate` → calendar re-window
  seam (no other test drives navigation at the view level).
- **period-buttons**: click `.journal-view-toolbar [data-period="month"]` → assert a
  monthly note is created/opened and `data-active` flips to `true`.
- **current**: click `[aria-label="Today"]` → assert today's day note is created/opened.
- **pick-date** (modal): seed a day note first; click `[aria-label="Pick a date"]` →
  the date-picker modal (`.date-picker-modal`) opens; click
  `[data-testid="month-cell"][data-anchor=<seeded day>]` → assert that existing note
  opens. The default view's pick-date button is `mode: "navigate"` (existing-only), so
  a pre-seeded note is the observable outcome.

### B. Blocks — new `view-blocks.e2e.ts`, fixture `e2e-views`, "Blocks" view

- **week-calendar** (render + interaction): assert `.notes-week-view` renders with its
  header and week-number cells; then click a day cell
  (`.notes-week-view__row [data-anchor=<day>]`, excluding the `week-number-cell`) and
  assert a daily note is created/opened. The day-cell→`OpenDateFlow` path runs through
  `NotesCalendarCell` mounted in the _week_ layout — a distinct mount from the month
  grid, so the click is non-redundant.
- **markdown-template** (render): seed a template note; point the block's `templatePath`
  at it; assert `.journal-view-markdown-template` renders the templated text and shows
  neither `__empty` nor `__error`.
- **divider** (render): assert `.journal-view-divider[role="separator"]` renders.

### C. custom-intervals — `view.e2e.ts`, fixture `e2e-journeys`, default view

Seed a `sprint` note dated in the current month; wait for it to be indexed; open the
default view → assert a `.journal-view-custom-intervals [data-journal="sprint"]` section
with an `__entry` renders.

## Deliberate scope calls

- **custom-intervals is render-only.** Its entries are `NavBlockRow`s whose
  click→open/create seam is already covered by the nav block in `code-blocks.e2e.ts`.
  Re-driving it would re-test a shared seam. The new coverage is that the block wires
  journals → index → sections inside a view leaf.
- **week-calendar interaction is kept** because its mount of `NotesCalendarCell` in the
  week layout is distinct from the month grid.

## New / changed support code

- `e2e/journeys/calendar.ts`: generalize `calendarSurface` (or add `weekCalendarSurface`)
  so a week-view day-cell scope is addressable; the current helper hardcodes
  `.notes-month-view__day`.
- `e2e/journeys/view.ts`: add `openBlocksView()` alongside `openCalendarView()`.
- `e2e/fixtures/e2e-views/.obsidian/plugins/journals/data.json`: new fixture config.
- `e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json`: add the `sprint`
  custom journal.

## Verification

Per project quality gates: `npm run test`, `npm run check:types`, `npm run check:lint`,
and the wdio e2e suite for the touched/new specs.
