# Single-direction defined-navigation item

## Problem

The `defined-navigation` toolbar item walks to the nearest note that already
exists, in a direction, from the active note. Its config carries **two
independent booleans** — `previous` and `next` — both defaulting to `true`
(`defined-navigation-item.ts:15-19,28`). So a single item renders **both arrows
at once**, and the config surface is two toggles (`DefinedNavigationItemConfig.vue:36-49`).

This diverges from the sibling navigation `button`, whose direction is a single
config selector: one button per direction, add the item twice to get both arrows
(`2026-07-06-configurable-navigation-button-design.md`). The two-boolean shape
lets a user configure zero arrows (both `false` → an item that renders nothing)
and couples two directions into one widget for no domain reason.

## Goal

Replace the `previous` / `next` boolean pair with a single **direction** config
option, so a `defined-navigation` item shows exactly one arrow. To get both
arrows a user adds the item twice and flips one to Previous — the same model the
navigation `button` already uses.

Confirmed scope decisions:

- **Widget shape:** one button, single `direction` _selected_ in config. No
  grouped two-arrow widget.
- **Value vocabulary:** keep this feature's existing `"previous" | "next"`
  values (the runtime — `navigate()`, `findNearestExisting`,
  `command_open_no_previous/next` — already speaks `previous`/`next`; the button
  keys on `prev`/`next`, a separate vocabulary that is not aligned here).
- **Runtime unchanged:** `navigate()` and `JournalsIndex.findNearestExisting`
  are untouched — this is a config-surface + widget-shape change only.
- **No migration:** v3-ai is pre-release; the only persisted `{ previous, next }`
  shape lives in the e2e fixture, which is rewritten by hand. See "Migration".

## Design

Four source files change, plus messages and tests.

### 1. Schema — `src/views/toolbar-items/defined-navigation/defined-navigation-item.ts`

Replace the two booleans with one picklist:

```ts
const schema = v.object({
  target: v.picklist(DEFINED_NAVIGATION_TARGETS),
  direction: v.picklist(["previous", "next"] as const),
});
```

`defaultConfig` becomes `{ target: "day", direction: "next" }` (matches the
button preset's default direction).

### 2. Item UI — `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.vue`

Collapse the two `v-if` buttons into a single `UiButton` driven by
`config.direction`:

- chevron `‹` when `direction === "previous"`, `›` when `"next"`;
- `:tooltip` = `command_open_previous()` / `command_open_next()`;
- `:data-direction="config.direction"` — **kept**, the e2e selector
  `[data-direction="previous"]` depends on it;
- `:disabled="candidates.length === 0"` — unchanged;
- click / middle-click → `navigate(config.direction, event)`.

`navigate(direction, event)` and `referenceAnchor()` are unchanged.

### 3. Config UI — `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItemConfig.vue`

Replace the two `UiToggle` rows with one `UiDropdown` (Previous / Next), and
drop the `UiToggle` import. The target dropdown stays as-is. The direction row
writes `update({ direction })`.

### 4. i18n — `messages/en.json`

- **Remove** `view_toolbar_defined_navigation_previous` and
  `view_toolbar_defined_navigation_next` (lines 818-819).
- **Add** `view_toolbar_defined_navigation_direction`: `"Direction"`.
- **Add** `view_toolbar_defined_navigation_direction_option` — a match message
  keyed on `direction`: `direction=previous` → `"Previous"`, `direction=next` →
  `"Next"` (same shape as `view_toolbar_button_config_direction_option`; cannot
  literally reuse that message because it keys on `prev`/`next`).
- **Update** `view_toolbar_defined_navigation_description` from
  `"Buttons that jump to the previous/next note that already exists."` to
  `"A button that jumps to the previous or next note that already exists."`
  (singular, matching the one-arrow widget).

### Migration

**None.** v3-ai is pre-release. The only persisted `{ target, previous, next }`
config is the e2e fixture
`e2e/fixtures/e2e-defined-nav/.obsidian/plugins/journals/data.json`, which is
rewritten by hand to `{ "target": "day", "direction": "previous" }`. Narrowing
the schema means valibot would reject any stray old-shape config on load; there
is no such data path outside the fixture.

### Not doing

- **No grouped two-arrow widget.** One button per direction.
- **No migration.** Per the pre-release scope decision.
- **No `navigate()` / `findNearestExisting` runtime change.** Reference
  resolution and existing-only open behavior are already correct.
- **No value-vocabulary alignment with the button** (`prev`/`next`). This
  feature keeps `previous`/`next`.

## Testing

- **`defined-navigation-item.test.ts`** — default expectation becomes
  `{ target: "day", direction: "next" }`; the parse and reject cases use
  `direction` (e.g. parse `{ target: "week", direction: "previous" }`; the
  unknown-target reject case carries a valid `direction`).
- **`DefinedNavigationItem.test.ts`** — each behavior mounts a **single**
  direction item (drop the "both shown" premise). Keep all five behaviors:
  opens the nearest earlier existing note (`direction: "previous"`); disables the
  button when the target resolves no journals; shows a notice when no earlier
  note exists; opens the nearest later existing note (`direction: "next"`); shows
  a notice when no later note exists. The `[data-direction=…]` queries are
  unchanged.
- **`DefinedNavigationItemConfig.test.ts`** — keep the target-dropdown test;
  replace the two toggle tests with direction-dropdown tests (selecting Previous
  / Next emits `onChange` with the updated `direction`). There are now two
  comboboxes (target + direction), so the queries disambiguate by accessible
  name / setting row rather than a bare `getByRole("combobox")`.
- **e2e fixture** — `e2e/fixtures/e2e-defined-nav/.obsidian/plugins/journals/data.json`
  item config becomes `{ "target": "day", "direction": "previous" }`. The e2e
  test file `e2e/journeys/defined-navigation.e2e.ts` is **unchanged** — it only
  ever clicks the previous arrow.

Quality gates (project convention): `npm run test`, `npm run check:types`,
`npm run check:lint`.

**e2e:** the fixture change is runtime-touching, so the wdio suite
(`defined-navigation.e2e.ts`) runs to confirm the single-direction item still
mounts and its previous arrow opens the nearest earlier existing note.
