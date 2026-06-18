# Default calendar view: v2 button layout fidelity

## Problem

The v3 default calendar view replicates v2's controls but presents them differently:

- **Arrangement.** v2 split its controls across two rows — a top header (`space-between`:
  shelf selector on the left, pick-date + Today on the right) and a navigation row embedded in
  the month grid's `#header` slot (prev-year / prev-month, centered month/quarter/year period
  badges, next-month / next-year). v3 flattens all of this into a single left-aligned
  `flex-wrap` toolbar strip above the month grid.
- **Duplication.** The month grid (`NotesMonthView`) renders its own default header with
  clickable month / quarter / year cells. With the toolbar now carrying period buttons for the
  same periods, the grid heading duplicates them.
- **Decoration regression (discovered during planning).** The "duplication" is not symmetric.
  v2's period header buttons (`NotesCalendarButton` → `CalendarDecoration`) rendered journal
  decorations (corners, background, borders, icons). v3's toolbar `period-buttons` are plain
  `UiButton`s with **no** decorations — only the grid header's `NotesCalendarCell`s are
  decorated. So hiding the grid header to remove the duplication would silently drop decorated
  month/quarter/year badges, which is a v2 regression. The faithful fix must first make the
  toolbar period-buttons decorated, after which the grid header is genuinely redundant.

Constraint from the user: the navigation controls **must stay in the configurable toolbar** —
they cannot move into the month grid's header the way v2 did, because users configure them.

## Goal

Make the seeded default calendar view reproduce v2's two-row, aligned layout _using only the
configurable toolbar_, and stop the month grid from duplicating the toolbar's period buttons —
without removing any configurability.

## Approach

Four cohesive changes:

1. A new composable `spacer` toolbar item that consumes horizontal slack, giving the toolbar the
   alignment primitive it currently lacks.
2. The default preset restructured into **two** toolbar blocks (already supported — blocks are
   keyed by id, no key-uniqueness constraint), using spacers to reproduce v2's alignment.
3. Toolbar `period-buttons` made decorated (reusing the existing `CellDecoration` +
   `useCellDecorations` engine), restoring v2's decorated period badges so the grid header
   becomes genuinely redundant.
4. A `showHeading` toggle on the month-calendar block, defaulting on, but **off** in the default
   view so the grid no longer duplicates the (now-decorated) toolbar period buttons.

Rejected alternatives: block-level `justify`/grouping config (more schema surface, less
composable than a reusable spacer); regroup-only with no spacer (only a partial match — rows stay
left-aligned, no right-pinned actions or centered periods).

## 1. New toolbar item: `spacer`

A fifth registered toolbar item whose only job is to consume horizontal space.

- **`src/views/toolbar-items/spacer/spacer-item.ts`**

  ```ts
  const schema = v.object({});

  export const spacerItem = defineToolbarItem({
    key: "spacer",
    label: m.view_toolbar_spacer_label(),
    description: m.view_toolbar_spacer_description(),
    schema,
    defaultConfig: {},
    component: SpacerItem,
  });
  ```

  No `configComponent` (nothing to configure), no icon.

- **`src/views/toolbar-items/spacer/ui/SpacerItem.vue`** — renders a single `<div>` styled
  `flex: 1 1 0; min-width: 0`. With `flex-basis: 0` it grows to fill slack but never forces a
  wrap, and is invisible when there is no slack.

  ```vue
  <script setup lang="ts">
  import type { BlockInstanceId } from "../../../config";
  defineProps<{ instanceId: BlockInstanceId; config: Record<string, never> }>();
  </script>
  <template><div class="jv-toolbar-spacer" /></template>
  <style scoped>
  .jv-toolbar-spacer {
    flex: 1 1 0;
    min-width: 0;
  }
  </style>
  ```

- **Wire-up** in `src/views/module.ts`: import `spacerItem` and
  `c.register(ToolbarItemDefinitionToken).useValue(spacerItem);`.

- **i18n** in `messages/en.json`:
  ```json
  "view_toolbar_spacer_label": "Spacer",
  "view_toolbar_spacer_description": "Flexible gap that pushes neighbouring items apart."
  ```

`ToolbarBlock.vue` CSS is unchanged (keeps `flex-wrap`; the spacer's `flex-basis: 0` means it
does not trigger wrapping).

## 2. Default preset: two toolbar blocks

`src/views/default-view.ts` replaces the single toolbar block with two, stacked above the
month-calendar block. Final block order:

```
toolbar (actions) -> toolbar (navigation) -> month-calendar -> divider -> custom-intervals
```

- **Block 1 — actions row** (reproduces v2's `space-between` header):

  ```
  shelf-selector  ·  ⟨spacer⟩  ·  pick-date  ·  today
  ```

  Shelf pinned left; pick-date + Today pushed to the right edge.

- **Block 2 — navigation row** (reproduces v2's centered `.month-header`):
  ```
  ‹‹ prev-year  ·  ‹ prev-month  ·  ⟨spacer⟩  ·  [month / quarter / year]  ·  ⟨spacer⟩  ·  next-month ›  ·  next-year ››
  ```
  Two equal spacers center the period buttons while pinning prev/next nav to the edges.

New constants required: a second toolbar-block UUID (e.g. `TOOLBAR_NAV_BLOCK_ID`) and three
spacer instance UUIDs. All existing toolbar items (pick-date, current/Today, navigate-step
buttons, period-buttons, shelf-selector) are reused unchanged — the Today button already renders
the "Today" text, matching v2.

## 3. Decorate toolbar period-buttons (v2 parity)

`PeriodButtonsItem.vue` keeps its `UiButton` badges (button styling + click/active logic
unchanged) but its label is wrapped so each badge renders journal decorations, exactly as v2
nested `CalendarDecoration` inside its `CalendarButton`.

- At setup, call `useCellDecorations(() => badges.value.map((b) => b.period), () => scope.all.value)`.
  This is the same call `NotesMonthView` makes; it `provide()`s the `CellDecorationMapKey` map that
  `CellDecoration` reads.
- In the template, wrap each badge's label: `<CellDecoration :period="badge.period">{{ badge.label }}</CellDecoration>`
  inside the existing `UiButton`. `CellDecoration` renders the background, border, corners, icons,
  and shapes for that period from the injected map.
- Keep `data-period` and `data-active` on the `UiButton` (e2e + active styling depend on them).

No new schema, config, or i18n — purely a rendering change reusing `@/decorations`. Net effect: a
month/quarter/year/week journal decoration now shows on the toolbar period button, matching v2.

## 4. Month-calendar `showHeading` toggle

- **Schema** (`src/views/blocks/month-calendar/month-calendar-block.ts`): add
  `showHeading: v.optional(v.boolean(), true)`.

  _Optional-with-default `true`_ rather than a bare required `v.boolean()` (as custom-intervals'
  `hideEmpty` is): month-calendar configs are already persisted in existing users' views, so a
  required field would fail validation on stored configs that lack it. Optional+default keeps old
  views valid and preserves their current behavior (heading shown).

  `defaultConfig` gains `showHeading: true`.

- **Plumbing**: `MonthCalendarBlock.vue` passes `:show-header="config.showHeading"` into
  `NotesMonthView`. `NotesMonthView.vue` gains a `showHeader` prop (default `true`) and wraps its
  header: `<div class="notes-month-view__header" v-if="showHeader">…</div>`. The default keeps all
  other `NotesMonthView` callers unaffected.

- **Config editor** (`src/views/blocks/month-calendar/ui/MonthCalendarBlockConfig.vue`): add a
  `UiSettingRow` + `UiToggle` row, mirroring the `hideEmpty` pattern:

  ```vue
  <UiSettingRow>
    <template #name>{{ m.view_block_config_show_heading_label() }}</template>
    <UiToggle
      :model-value="config.showHeading"
      @update:model-value="(value: boolean | undefined) => update({ showHeading: value ?? false })"
    />
  </UiSettingRow>
  ```

- **i18n** in `messages/en.json`:

  ```json
  "view_block_config_show_heading_label": "Show month/year heading"
  ```

- **Default view** (`src/views/default-view.ts`): the month-calendar block config sets
  `showHeading: false`, so the seeded default suppresses the grid heading and relies on the
  toolbar's period buttons.

## Scope & migration

- The default view is seeded only on **fresh install**. These changes affect newly-seeded vaults
  only; existing users keep their current view and can rebuild it using the now-available spacer.
  No migration runs — consistent with how presets work, and it avoids clobbering user
  customizations.
- The `showHeading` schema field is optional with a `true` default, so already-persisted
  month-calendar block configs remain valid and unchanged in behavior.

## Editor behavior (known minor)

In the view editor each item shows as a `ToolbarItemFrame` with a live preview. A spacer's preview
is an empty `flex:1` div, so it appears as an empty frame — still draggable/removable via the
frame's grip and delete button, and added via the picker's "Spacer" label. Deliberately **not**
gold-plating with an editor-only placeholder visual (YAGNI).

## e2e constraint: the shared decoration matrix

`assertDecorationMatrix` (`e2e/journeys/decorations.ts`) is mount-context-agnostic: it runs
against **both** the calendar view leaf (`view.e2e.ts`) and the calendar-timeline code block
(`code-blocks.e2e.ts`). It asserts decorations on the grid's `header-month` / `header-quarter` /
`header-year` cells. The timeline code block has no toolbar, so those assertions **cannot** be
repointed to toolbar period buttons. The grid header therefore stays a first-class, kept feature;
only the default _preset_ hides it.

The `e2e-journeys` fixture currently has **no `views` key**, so it renders the auto-seeded default.
If the default hides the header, the journeys view leaf loses the cells that the matrix and ~6
other tests (header-click creation, `headerMonthAnchor` nav detection, live-edit month-header,
shelf-scope `header-year`) depend on.

Resolution: **pin a header-on view in the journeys fixture.** Pre-seed
`e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json` with an explicit calendar view
(`views` dict keyed by id — same shape as `e2e-views`) that uses the new two-toolbar + spacer
layout but sets `month-calendar` `showHeading: true`, named `Calendar` with `showInRibbon: true`
(so `[aria-label="Open Calendar"]` still resolves). This keeps the matrix and all existing journeys
tests valid and decoupled from the preset's cosmetic choice. Precedent: `e2e-views`,
`e2e-defined-nav`, `e2e-startup-view` already pin their own views.

## Verification

- `npm run test`, `npm run check:types`, `npm run check:lint`.
- **Unit** — `NotesMonthView.test.ts` (@testing-library/vue, existing harness): a new `showHeader`
  describe — the default header row is absent when `showHeader: false` and present (default) when
  omitted. The `MonthCalendarBlock` → `NotesMonthView` prop pass-through is thin wiring, not
  separately tested. `PeriodButtonsItem` decoration is covered by e2e (decoration rendering needs
  the real `@/decorations` cascade); no unit test for the spacer — a trivial empty-div component.
- **e2e, existing journeys suite** — unchanged behavior, guaranteed by pinning the header-on view
  (above). Existing toolbar selectors (`${TOOLBAR} [data-period]`, `[aria-label=...]`) still match
  because the descendant combinator spans both toolbar rows.
- **e2e, new coverage:**
  - On the journeys (header-on, decorated period-buttons) view: a seeded month note's decoration
    renders on the toolbar `[data-period="month"]` button (`.decoration-corner` present) — proves
    the v2-parity decoration fix.
  - On a fresh-seed fixture (auto-seeded real default, e.g. a `views`-less vault): the leaf renders
    **two** `.journal-view-toolbar` rows, the three `.jv-toolbar-spacer` elements are present, and
    the grid shows **no** `.notes-month-view__header`. Assert structure/presence, not exact pixels
    (black-box; dodges the editor-zoom rounding gotcha).
