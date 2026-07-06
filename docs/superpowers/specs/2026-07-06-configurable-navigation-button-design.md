# Configurable navigation button (direction + granularity)

## Problem

The `button` toolbar item's `navigate-step` action steps the view's `refDate`
by a period (`direction` × `unit` × `amount`). The schema already carries all
three fields (`button-config.ts:15-20`), but **there is no config UI for them**:
`ButtonItemConfig.vue` gates its settings block on `periodAction`, which is
`null` for a `navigate-step` action (`ButtonItemConfig.vue:31-34,81`). So the
only settings a user can edit on a navigation button are icon/label/tooltip —
direction and granularity are frozen at whatever seeded the item.

Because direction and granularity can't be edited, the item ships as **two
separate presets** — "Navigate previous month" and "Navigate next month"
(`button-item.ts:29-40`) — each baking in a fixed direction and `unit: "month"`.
A user who wants to step by week/quarter/year, or flip a button's direction,
has no path short of hand-editing JSON.

## Goal

Make a navigation button fully configurable in the editor: expose **direction**
(Previous / Next) and **granularity** (Week / Month / Quarter / Year) as
selectors, and collapse the two month presets into **one** "Navigate" preset.

Confirmed scope decisions:

- **Widget shape:** one button, single direction _selected_ in config (not a
  grouped two-arrow stepper). To get both arrows a user adds the item twice and
  flips one to Previous.
- **Granularity set:** `week | month | quarter | year` — **`day` is dropped**
  from the step-unit picklist (it stays available for `pick-date`/`current`
  levels, which is a separate field).
- **Amount:** stays in the schema with its default of `1`; **no UI** is added
  for it. Every step is one unit unless a stored config says otherwise.
- **Runtime unchanged:** `ButtonItem.vue`'s click handling is untouched — this
  is a config-surface change only.
- **Default Calendar view untouched:** `src/views/default-view.ts` and its e2e
  fixture (`data.json:713-773`) are not modified. Its four nav buttons
  (prev-year, prev-month, next-month, next-year, all `month`/`year`) remain
  valid and simply become editable. See "Not doing".

## Design

Four source files change, plus messages and tests.

### 1. Schema + appearance — `src/views/toolbar-items/button/button-config.ts`

Introduce a narrower picklist for the step unit; leave `levelField` (day…year)
untouched for the `pick-date`/`current` variants:

```ts
const stepUnitField = v.picklist(["week", "month", "quarter", "year"] as const);
```

Use `stepUnitField` for `navigate-step`'s `unit` (currently `unitField` at
`button-config.ts:18`). `unitField` is only referenced by `navigate-step`, so it
is replaced by `stepUnitField` (removed if it has no other consumer).

Update `resolveButtonAppearance`'s navigate-step arms to drop `"day"` from the
`P.union`s so the match stays exhaustive over the four units
(`button-config.ts:75,83`):

```ts
.with({ type: "navigate-step", direction: "prev", unit: P.union("week", "month") }, ...icons.nav.prev)
.with({ type: "navigate-step", direction: "prev", unit: P.union("quarter", "year") }, ...icons.nav.prevLeap)
.with({ type: "navigate-step", direction: "next", unit: P.union("week", "month") }, ...icons.nav.next)
.with({ type: "navigate-step", direction: "next", unit: P.union("quarter", "year") }, ...icons.nav.nextLeap)
```

Icon/tooltip resolution is otherwise unchanged; the config UI reads placeholders
from `resolveButtonAppearance`, so changing direction/granularity live-updates
the shown chevron and tooltip.

Add a `ButtonStepUnit` type (`"week" | "month" | "quarter" | "year"`) alongside
the existing `ButtonLevel`, for the config component's dropdown list.

### 2. Config UI — `src/views/toolbar-items/button/ui/ButtonItemConfig.vue`

Add a `stepAction` computed mirroring the existing `periodAction`:

```ts
const stepAction = computed(() => (props.config.action.type === "navigate-step" ? props.config.action : null));
```

Add a `<template v-if="stepAction">` block (sibling of the existing
`v-if="periodAction"` block) with two `UiSettingRow`s, both `UiDropdown` — the
same primitive the "Behavior" selector already uses:

- **Direction** — options Previous / Next, writing
  `update({ action: { ...stepAction, direction } })`.
- **Granularity** — options Week / Month / Quarter / Year, writing
  `update({ action: { ...stepAction, unit } })`.

The shared icon/label/tooltip rows stay at the top and already resolve
placeholders for navigate-step, so no change there.

### 3. Presets — `src/views/toolbar-items/button/button-item.ts`

Replace the two presets (`prev_month`, `next_month`, `button-item.ts:29-40`)
with **one**:

```ts
{
  label: m.view_toolbar_button_preset_navigate(),
  defaultConfig: { action: { type: "navigate-step", direction: "next", unit: "month", amount: 1 } },
},
```

The `pick_date` and `today` presets are unchanged.

### 4. i18n — `messages/en.json`

- **Remove** `view_toolbar_button_preset_prev_month` and
  `view_toolbar_button_preset_next_month` (lines 824-825).
- **Add** `view_toolbar_button_preset_navigate`: `"Navigate by step"`.
- **Add** `view_toolbar_button_config_direction_label`: `"Direction"`.
- **Add** `view_toolbar_button_config_direction_option` — a match message keyed
  on `direction`: `direction=prev` → `"Previous"`, `direction=next` → `"Next"`
  (same shape as `view_toolbar_button_config_mode_option`).
- **Add** `view_toolbar_button_config_granularity_label`: `"Granularity"`.
- **Reuse** `view_toolbar_button_config_level_option({ level })` for the
  granularity dropdown's option labels (it already renders week/month/quarter/
  year; the `day` case simply isn't offered).

### Migration

**None required.** Narrowing the step-unit picklist to exclude `day` can only
break persisted config if a stored `navigate-step` has `unit: "day"`. No shipped
default, preset, or prior config UI ever produced that (confirmed: defaults use
`month`/`year`; `unit: "day"` navigate-steps exist only in test files). This is
recorded as an explicit assumption — if a `day` navigate-step were somehow
persisted, valibot would reject it on load; there is no such data path.

### Not doing

- **No change to the default Calendar view or its e2e fixture.** Making buttons
  editable does not require re-seeding the shipped layout; its `month`/`year`
  buttons stay valid. Simplifying that layout (e.g. dropping the year buttons)
  is a separable defaults/UX decision and would be a shrink of shipped
  functionality — explicitly out of scope.
- **No grouped two-arrow stepper.** The chosen model is one button per
  direction.
- **No amount UI.** The field stays in the schema at default `1`.
- **No `ButtonItem.vue` runtime change.** Click behavior is already correct.

## Testing

- **`button-config.test.ts`** — extend the `resolveButtonAppearance` coverage so
  each direction × granularity (week/month → single chevron; quarter/year →
  double chevron) maps to the expected icon and tooltip. Remove/repoint any
  existing `unit: "day"` navigate-step case, since `day` is no longer a valid
  step unit (`button-config.test.ts:66,98`).
- **`ButtonItemConfig.test.ts`** — component tests (@testing-library/vue +
  user-event) that, for a navigate-step config: selecting a Direction emits
  `onChange` with the updated `direction`; selecting a Granularity emits
  `onChange` with the updated `unit`; the icon/tooltip placeholder reflects the
  current selection. One behavior per test.
- **`ButtonItem.test.ts`** — existing navigate-step step tests are unaffected
  (runtime unchanged); adjust only if a literal uses `unit: "day"`.

Quality gates (project convention): `npm run test`, `npm run check:types`,
`npm run check:lint`.

**e2e:** No new e2e. This change adds editor config controls only; runtime
navigation is unchanged and already covered. The default view (which the e2e
journeys exercise) is untouched, so no fixture drift.
