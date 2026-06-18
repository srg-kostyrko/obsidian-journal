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

Constraint from the user: the navigation controls **must stay in the configurable toolbar** —
they cannot move into the month grid's header the way v2 did, because users configure them.

## Goal

Make the seeded default calendar view reproduce v2's two-row, aligned layout _using only the
configurable toolbar_, and stop the month grid from duplicating the toolbar's period buttons —
without removing any configurability.

## Approach

Three cohesive changes:

1. A new composable `spacer` toolbar item that consumes horizontal slack, giving the toolbar the
   alignment primitive it currently lacks.
2. The default preset restructured into **two** toolbar blocks (already supported — blocks are
   keyed by id, no key-uniqueness constraint), using spacers to reproduce v2's alignment.
3. A `showHeading` toggle on the month-calendar block, defaulting on, but **off** in the default
   view so the grid no longer duplicates the toolbar's period buttons.

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

## 3. Month-calendar `showHeading` toggle

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

## Verification

- `npm run test`, `npm run check:types`, `npm run check:lint`.
- **Unit** (`MonthCalendarBlock.test.ts`, @testing-library/vue): the heading cells
  (`data-testid="header-month"` / `header-year`) are absent when `showHeading: false` and present
  when `true`. One focused behavior per test. No unit test for the spacer itself — a trivial
  empty-div component.
- **e2e** (v3-ai wdio suite, runtime-touching): the default calendar view renders two toolbar
  rows; the shelf sits at the left of row 1 while Today sits near its right edge; the period
  buttons are horizontally centered in row 2; and the month grid shows **no** month/year heading.
  Assert positions/structure rather than exact pixels (stays black-box; dodges the editor-zoom
  rounding gotcha).
