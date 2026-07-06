# Week calendar block: hideable month/year header

## Problem

The **month** calendar block has a `showHeading` option that toggles its
month/quarter/year header row on and off. The **week** calendar block renders
the equivalent header unconditionally — there is no way to hide it. This makes
the week block feel asymmetric and forces the header on users who embed a week
block where the surrounding note already provides that context.

## Goal

Add a `showHeading` option to the week calendar block that toggles its
month/quarter/year header row, mirroring the month block's existing behavior,
option name, and i18n label exactly. The option defaults to `true`, preserving
the current always-visible behavior.

Scope decision (confirmed with user): a **single** toggle that hides the whole
header row as one unit — not separate month-vs-year toggles. This matches the
month block's single-toggle pattern.

## Design

The change mirrors the month block across four source files plus their tests.

### 1. Schema + defaults — `src/views/blocks/week-calendar/week-calendar-block.ts`

Add `showHeading` to the block schema and default config, exactly as the month
block declares it:

```ts
const schema = v.object({
  ...calendarBlockBaseSchema,
  showHeading: v.optional(v.boolean(), true),
});
```

and in `defaultConfig`, add `showHeading: true`.

`WeekCalendarConfig` is inferred from the schema, so no separate type change is
needed.

### 2. Shared view prop + guard — `src/notes-calendar/ui/NotesWeekView.vue`

The week view currently uses a plain `defineProps`. Convert it to
`withDefaults` (mirroring `NotesMonthView.vue:12-22`) and add a
`showHeader?: boolean` prop defaulting to `true`:

```ts
const props = withDefaults(
  defineProps<{
    shelf: string | null;
    week: WeekPeriod;
    weeks?: "none" | "left" | "right";
    hiddenWeekdays?: readonly number[];
    showHeader?: boolean;
  }>(),
  { weeks: undefined, hiddenWeekdays: undefined, showHeader: true },
);
```

Wrap the existing `<div class="notes-week-view__header">` (currently lines
57-69) in `v-if="showHeader"`, matching `NotesMonthView.vue:100`.

The header's period cells (`monthPeriod`, `quarterPeriod`, `yearPeriod`) remain
in `allPeriods` for decoration purposes regardless of `showHeader`, matching the
month view — hiding the header is a purely visual concern and does not change
which periods participate in decorations.

### 3. Renderer wiring — `src/views/blocks/week-calendar/ui/WeekCalendarBlock.vue`

Pass the config through to the shared view:

```vue
<NotesWeekView ... :show-header="config.showHeading" />
```

### 4. Config UI — `src/views/blocks/week-calendar/ui/WeekCalendarBlockConfig.vue`

Add a `UiSettingRow` + `UiToggle` after `CalendarBlockConfigFields`, reusing the
existing i18n key `m.view_block_config_show_heading_label()` — identical markup
to `MonthCalendarBlockConfig.vue:20-26`. Import `m`, `UiSettingRow`, `UiToggle`.

### Not doing

- **No change to `calendarBlockBaseSchema`.** `showHeading` stays per-block, the
  same way the month block keeps it out of the shared base. Promoting it to the
  base is a larger, separate decision and is not warranted by this change alone.
- **No new i18n key.** The existing `view_block_config_show_heading_label` is
  reused verbatim.
- **No granular per-cell toggles.** Explicitly out of scope per the confirmed
  single-toggle decision.

## Testing

Mirror the month block's existing unit tests for the week block:

- **`week-calendar-block.test.ts`** — add a test that `showHeading` defaults to
  `true` when omitted (mirrors `month-calendar-block.test.ts:36`).
- **`NotesWeekView.test.ts`** — add tests that the header row is hidden when
  `showHeader` is `false` and rendered when `showHeader` is omitted (mirrors
  `NotesMonthView.test.ts:198,204`).
- **`WeekCalendarBlockConfig.test.ts`** — add a test that toggling the heading
  control emits a config change with the updated `showHeading` (mirrors
  `MonthCalendarBlockConfig.test.ts`). Existing config tests that build a
  `WeekCalendarConfig` literal must add `showHeading` to satisfy the type.

Quality gates (per project convention): `npm run test`, `npm run check:types`,
`npm run check:lint`.

**e2e:** No existing e2e asserts on `showHeading` for the month block (the
header toggle is covered at the unit level only). This change touches runtime
rendering but only gates an existing element behind a `v-if`; a black-box e2e
that toggles a `v-if` would be low-value and has no month-block precedent to
mirror. No new e2e is added.
