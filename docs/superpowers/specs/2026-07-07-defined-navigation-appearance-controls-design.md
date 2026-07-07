# Defined-note navigation: appearance controls (Icon / Label / Tooltip)

## Problem

The **Defined-note navigation** toolbar item (`src/views/toolbar-items/defined-navigation/`)
is a button that jumps to the previous or next note that already exists. Unlike every
**Button** toolbar item, it exposes no presentational controls: its view hardcodes a
`‹` / `›` chevron and a direction-based tooltip, and its config modal offers only the
behavioral **Target** and **Direction** dropdowns.

Button items expose three shared appearance controls — **Icon**, **Label**, **Tooltip** —
each with a placeholder showing the resolved default. The defined-navigation item should
gain the same three controls, so it can be customized like any other button.

## Goal

Give the defined-navigation item parity with button items on the Icon / Label / Tooltip
appearance controls, following the button item's existing pattern, with **zero visual
regression** when the new fields are left blank.

Non-goals: no shared appearance-fields component (only two consumers; defer until a third),
no `summary` field, no changes to button items or to defined-navigation behavior
(target/direction, `findNearestExisting`, `existingOnly`, disabled state, open modes).

## Design

### 1. Schema — `defined-navigation-item.ts`

Add three optional presentational fields to the schema, mirroring `buttonItemConfigSchema`:

```ts
const schema = v.object({
  target: v.picklist(DEFINED_NAVIGATION_TARGETS),
  direction: v.picklist(["previous", "next"] as const),
  icon: v.optional(v.string()),
  label: v.optional(v.string()),
  tooltip: v.optional(v.string()),
});
```

`target` + `direction` remain the item's behavior controls. `defaultConfig`
(`{ target: "day", direction: "next" }`) is unchanged — the new fields are absent by default.

### 2. Appearance resolver — new `resolveDefinedNavigationAppearance(config)`

Alongside the schema, mirroring `resolveButtonAppearance`. Returns the current baked-in look
as the defaults, so blank fields reproduce today's appearance exactly:

```ts
export interface DefinedNavigationAppearance {
  readonly icon?: string;
  readonly label?: string;
  readonly tooltip: string;
}

export function resolveDefinedNavigationAppearance(config: DefinedNavigationConfig): DefinedNavigationAppearance {
  return config.direction === "previous"
    ? { label: "‹", tooltip: m.command_open_previous() }
    : { label: "›", tooltip: m.command_open_next() };
}
```

- `icon`: `undefined` (no default icon — the chevron is a label glyph, per the "keep the
  current chevron" decision).
- `label`: `"‹"` / `"›"` — the current chevron content.
- `tooltip`: `command_open_previous()` / `command_open_next()` — the current tooltip.

### 3. View — `DefinedNavigationItem.vue`

Replace the hardcoded chevron and inline tooltip with the button item's rendering pattern:

```ts
const appearance = computed(() => resolveDefinedNavigationAppearance(props.config));
const icon = computed(() => props.config.icon ?? appearance.value.icon);
const label = computed(() => props.config.label ?? appearance.value.label);
const tooltip = computed(() => props.config.tooltip ?? appearance.value.tooltip);
```

Template mirrors `ButtonItem.vue`:

```html
<UiButton
  flat
  :tooltip="tooltip"
  :disabled="candidates.length === 0"
  :data-direction="config.direction"
  @click="(event) => navigate(config.direction, event)"
  @auxclick.middle.prevent="(event) => navigate(config.direction, event)"
>
  <UiIcon v-if="icon" :name="icon" />
  <span v-if="label">{{ label }}</span>
  <span v-else-if="!icon">{{ tooltip }}</span>
</UiButton>
```

`disabled`, `data-direction`, the click/auxclick handlers, `candidates`, `referenceAnchor`,
and `navigate()` are untouched. With defaults, `label` falls back to the chevron glyph →
identical current look. The previous direct use of `m.command_open_previous/next()` for the
tooltip moves into the resolver.

### 4. Config — `DefinedNavigationItemConfig.vue`

Prepend three `UiSettingRow`s before the Target and Direction rows, exactly like
`ButtonItemConfig.vue`:

- **Icon** → `UiIconSuggest`, `:placeholder="appearance.icon"`
- **Label** → `UiTextInput`, `:placeholder="appearance.label"`
- **Tooltip** → `UiTextInput`, `:placeholder="appearance.tooltip"`

`appearance = computed(() => resolveDefinedNavigationAppearance(props.config))`. Each field
normalizes empty string to `undefined` on change (`value || undefined`), matching the button
config. The existing Target + Direction rows are unchanged and follow the appearance rows.

### 5. i18n — `messages/en.json`

- Icon row reuses the existing generic `common_label_icon()` ("Icon").
- Add two generic keys for the other two rows and use them in the defined-navigation config:
  - `view_toolbar_appearance_label_label`: `"Label"`
  - `view_toolbar_appearance_tooltip_label`: `"Tooltip"`

Button items keep their existing `view_toolbar_button_config_label_label` /
`view_toolbar_button_config_tooltip_label` keys; migrating button to the generic keys is out
of scope.

## Testing

Runtime-touching change → quality gates `test` / `check:types` / `check:lint` plus the wdio
e2e suite.

- **`defined-navigation-item.test.ts`** (or a colocated `*.test.ts`): unit test
  `resolveDefinedNavigationAppearance` — `previous` yields the `‹` label + previous tooltip;
  `next` yields the `›` label + next tooltip; both yield no default icon.
- **`DefinedNavigationItemConfig.test.ts`** (@testing-library/vue + user-event): the Icon,
  Label, and Tooltip rows render; editing each emits the patched config; blank fields show the
  resolved defaults as placeholders.
- **`DefinedNavigationItem.test.ts`**: a configured icon/label overrides the chevron in the
  rendered button; leaving the fields blank keeps the chevron and the direction tooltip.
- Existing **`e2e/journeys/defined-navigation.e2e.ts`** covers the runtime behavior; extend
  only if a black-box gap appears for the new controls.

## Decisions (resolved)

- **Controls:** all three — Icon + Label + Tooltip (full button parity).
- **Blank-field default:** keep the current `‹` / `›` chevron and direction tooltip, surfaced
  as placeholders — zero visual regression.
- **No shared appearance-fields component:** two consumers, self-contained items; extraction
  would be a pass-through layer. Defer until a third consumer appears. Button and
  defined-navigation are distinct domain concepts that merely share appearance markup.
- **No `summary` field:** not a control, out of the ask.
