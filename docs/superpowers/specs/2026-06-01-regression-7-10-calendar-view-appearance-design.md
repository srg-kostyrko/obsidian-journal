# Regressions #7–#10 — Calendar view placement & appearance

Date: 2026-06-01
Branch: `v3-ai`
Tracks: gaps #7, #8, #9, #10 in `docs/2026-06-01-v2-v3-feature-gaps.md`

## Problem

v2 owned a single **global** `calendarView` config (`leaf`, `weeks`, `todayStyle`,
`activeStyle`). v3 replaced the one calendar with **per-view, block-composed**
views (`src/views/`), rendering through shared cells in `src/notes-calendar/`.
Four v2 capabilities were dropped or reduced in the move:

- **#7 sidebar placement** — `ViewHostService.#open` always `getLeaf(true)`
  (main-area tab). No left/right sidebar option.
- **#8 today highlight** — `NotesCalendarCell` never marks the cell covering the
  current date.
- **#9 today/active colors** — no configurable highlight colors; cells emit
  `data-active` with no styling hook.
- **#10 week-number column** — `NotesMonthView`/`NotesWeekView` auto-derive
  `showWeekNumber = scope.week.length > 0`, always on the left. Cannot force-hide,
  and "right" is gone.

Each regression lands in a different place in v3's architecture (decided with the
user): placement is **per-view**, the week column is **per-block**, the highlight
colors are a new **global slice**, and the today marker is a property of the
generic cell.

## Design

### #7 — Per-view leaf placement

`viewSchema` (`src/views/config.ts`) gains a placement field:

```ts
leaf: v.optional(v.picklist(["left", "right", "tab"]), "right"),
```

`v.optional` with a `"right"` fallback means any stored view lacking the field
parses to `right` — the v2 default, and the right choice now that v3 has no
installed base to preserve a `tab` default for. The `viewsCollection` factory and
`defaultCalendarView()` seed both set `leaf: "right"`.

`ViewHostService.#open` honors it (`src/views/view-host.ts`):

```ts
async #open(id: ViewId): Promise<void> {
  const view = this.#getView(id);
  const leaf = this.#leafFor(view?.leaf ?? "right");
  await leaf.setViewState({ type: viewTypeOf(id), active: true });
  this.#app.workspace.revealLeaf(leaf);
}

#leafFor(placement: "left" | "right" | "tab"): WorkspaceLeaf {
  return match(placement)
    .with("left", () => this.#app.workspace.getLeftLeaf(false))
    .with("right", () => this.#app.workspace.getRightLeaf(false))
    .with("tab", () => null)
    .exhaustive()
    ?? this.#app.workspace.getLeaf(true);
}
```

`getLeftLeaf`/`getRightLeaf` can return `null`; the `?? getLeaf(true)` fallback
guarantees a leaf. `revealLeaf` brings a sidebar leaf into focus (sidebars can be
collapsed), matching v2's intent that opening surfaces the calendar.

`ViewEditSubpage.vue` gains an "Open in" `UiDropdown` (left / right / tab) wired
through `viewsService.update`, beside the existing icon / shelf / ribbon rows.

**Delta from v2:** placement applies on open, not via a live watcher. v2's
`placeCalendarView(true)` detached and re-placed the leaf when the global `leaf`
setting changed. Re-placing on every view edit is jarring in v3 (views are edited
field-by-field); the new placement takes effect next time the view is opened.

### #8 — Today highlight on any cell containing today

`NotesCalendarCell.vue` is generic over `Period`, so one rule covers every kind:

```ts
const isToday = computed(() => rawPeriod.value.contains(CalendarDate.today()));
```

```html
:data-today="isToday || null"
```

This marks today's day cell, the week cell covering today, and the current
month/quarter/year header — a small, consistent extension over v2's day-only
highlight, and simpler than special-casing `kind === "day"`.

`CalendarDate.today()` reads `localMoment()` (no DI clock in v3). Like v2, the
marker is not reactive across midnight; it recomputes on navigation/re-render.
Tests mock `localMoment` to pin "today".

### #9 — Global highlight colors

A new sub-feature `src/notes-calendar/appearance/` (own `module.ts`, so it is a
sub-feature per the project's convention):

**Slice** (`appearance/slice.ts`) — reuses `colorSchema`/`ColorSettings` from
`@/decorations` (already the shared color authority; `UiColorSettingsPicker`
depends on it too):

```ts
const styleSchema = v.object({ color: colorSchema, background: colorSchema });

export const appearanceSliceSchema = v.object({
  today: styleSchema,
  active: styleSchema,
});

export const appearanceSlice = defineSlice("appearance", appearanceSliceSchema, {
  today: { color: { type: "theme", name: "text-accent" }, background: { type: "transparent" } },
  active: {
    color: { type: "theme", name: "text-on-accent" },
    background: { type: "theme", name: "interactive-accent" },
  },
});
```

Defaults are ported verbatim from v2 `defaults.ts`.

**Bridge** (`appearance/bridge.ts`) — `CalendarAppearanceBridge`, eager,
structurally identical to the existing `CalendarSettingsBridge`. It `watchEffect`s
the slice and writes four CSS custom properties onto `document.body` via the
reused `colorToString`:

```ts
#sync(state: AppearanceSliceState): void {
  const root = document.body.style;
  root.setProperty("--journal-cell-today-color", colorToString(state.today.color));
  root.setProperty("--journal-cell-today-bg", colorToString(state.today.background));
  root.setProperty("--journal-cell-active-color", colorToString(state.active.color));
  root.setProperty("--journal-cell-active-bg", colorToString(state.active.background));
}
```

On `[Symbol.dispose]` it removes the four properties. Body-level vars are the
honest expression of a _global_ setting (set once, inherited by every calendar
cell wherever rendered); the namespaced names cannot leak into unrelated styles.
This is the chosen mechanism over per-block `v-bind` (which would re-read the
global slice in every block instance).

**Cell styling** — `NotesCalendarCell.vue` gains a scoped style block consuming
the vars, with `[data-today]` placed after `[data-active]` so a cell that is both
today and active resolves to the today colors (today is the stronger signal):

```css
.notes-calendar-cell[data-active] {
  color: var(--journal-cell-active-color);
  background-color: var(--journal-cell-active-bg);
}
.notes-calendar-cell[data-today] {
  color: var(--journal-cell-today-color);
  background-color: var(--journal-cell-today-bg);
}
```

No existing rule styles these cells (`styles.css` has none; the SFC had no style
block), so this is additive — no collision.

**Dashboard block** (`appearance/ui/AppearanceBlock.vue`) — registered via
`defineDashboardBlock({ key: "calendar-appearance", order: 20 })`, ordered after
the `calendar-week` block (order 10). A `UiCollapsibleBlock` with four
`UiSettingRow` + `UiColorSettingsPicker` rows (today text / today background /
active text / active background), reading and writing `slice.state` immutably:

```ts
slice.state = { ...slice.state, today: { ...slice.state.today, color: next } };
```

**Module** (`appearance/module.ts`) registers the slice
(`SliceDefinitionToken`), the dashboard block (`DashboardBlockToken`), and the
eager bridge. Added to `main.ts` after `notesCalendarModule`.

i18n: new messages for the section title and four row labels.

### #10 — Per-block week-number column position

Both `month-calendar` and `week-calendar` block schemas gain:

```ts
weeks: v.optional(v.picklist(["none", "left", "right"]), "left"),
```

`defaultConfig` and the `defaultCalendarView()` seed set `weeks: "left"` (v2's
default). `MonthCalendarBlock.vue`/`WeekCalendarBlock.vue` pass
`:weeks="config.weeks"` down.

`NotesMonthView.vue` / `NotesWeekView.vue` take a `weeks?: "none" | "left" |
"right"` prop (default `"left"`) and replace the journal-derived visibility:

```ts
const showWeekNumber = computed(() => props.weeks !== "none");
```

Decoupling from `scope.week.length` is the v2-faithful behavior: the week-number
cell renders through `weekCell` (a `useNotesCell` over the shelf's week journals).
With no week journal it is simply **inactive** — a non-clickable week-number
label — exactly as v2 displayed it. v3's "hide when no week journal" auto-rule was
a stand-in for the missing setting and is superseded by it.

Position is driven by a `data-weeks` attribute and template order:

- **Month grid** — `data-weeks="left|right"` selects the column template
  (`auto repeat(7,1fr)` vs `repeat(7,1fr) auto`); the week-number cell is rendered
  before the day loop for `left`, after it for `right`.
- **Week row** (flex) — the week-number cell is ordered first (`left`) or last
  (`right`) via `order` / source placement.

`visiblePeriods` (decoration registration) keeps gating the week period on
`showWeekNumber`, which now follows the setting.

## Out of scope

- **Data migration** — per the gap audit, migration is the last, separate step.
  New schema fields use `v.optional(..., default)` so existing dev-vault configs
  parse without it.
- **Auto-open views on startup** — view placement applies when a view is opened
  (command/ribbon); v3 has no auto-open-on-load for views. Startup behavior for
  journals is regression #4, already handled.
- **`activeStyle` on non-calendar surfaces** — v2 also colored custom-interval and
  timeline cells. This port scopes the highlight colors to `NotesCalendarCell`
  (month/week calendar blocks). Extending to other surfaces is follow-up.
- **Live re-placement on leaf-setting change** (#7 delta above).

## Testing

- **#7 `ViewHostService`**: opening a `left`/`right` view requests the
  corresponding sidebar leaf; `tab` uses a new main-area tab; a null sidebar leaf
  falls back to a tab. (Fake workspace; assert which leaf getter was used and that
  `setViewState` ran on it.)
- **#7 `ViewEditSubpage`**: changing "Open in" persists `leaf` via the service.
- **#8 `NotesCalendarCell`**: emits `data-today` when its period contains the
  mocked today, omits it otherwise; a day, a week-containing-today, and a
  non-today cell each behave correctly (one behavior per test).
- **#9 `colorToString`** is already covered. Test `AppearanceBlock` behavior:
  editing a picker writes the new `ColorSettings` to the slice. The bridge's
  body-var side effect is wiring — not separately tested.
- **#10 `NotesMonthView` / `NotesWeekView`**:
  - `weeks: "none"` renders no week-number cell.
  - `weeks: "left"` / `"right"` render the week-number cell and set
    `data-weeks` accordingly.
  - `weeks: "left"` with no week journal still renders the week number, inactive
    (assert label present, `data-active` absent).
