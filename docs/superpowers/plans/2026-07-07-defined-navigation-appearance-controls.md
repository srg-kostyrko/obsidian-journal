# Defined-note navigation appearance controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Defined-note navigation toolbar item the same Icon / Label / Tooltip appearance controls that every Button toolbar item has, with zero visual regression when the fields are blank.

**Architecture:** Add three optional presentational fields to the item's valibot schema, a `resolveDefinedNavigationAppearance` resolver (mirroring `resolveButtonAppearance`) that returns today's chevron/tooltip as defaults, then wire those into the view (render like `ButtonItem.vue`) and the config modal (three `UiSettingRow`s like `ButtonItemConfig.vue`).

**Tech Stack:** TypeScript, Vue 3 SFCs, valibot, ts-pattern, Paraglide i18n, Vitest + @testing-library/vue + @testing-library/user-event.

**Spec:** `docs/superpowers/specs/2026-07-07-defined-navigation-appearance-controls-design.md`

## Global Constraints

- Test commands are **npm** scripts: `npm run test`, `npm run check:types`, `npm run check:lint`. Runtime-touching change → also the wdio e2e (`npm run test:e2e`).
- New i18n keys require regenerating Paraglide output: `npm run compile:i18n` (source is `messages/en.json`; only locale is `en`).
- Colocate `*.test.ts` beside the implementation. Component tests use @testing-library/vue + user-event (no `@vue/test-utils`, no CSS-class or test-only `data-*` queries).
- Inline `defineProps<{...}>()` in SFCs. Field labels/action buttons wrap in `UiSettingRow`.
- Do not change defined-navigation behavior (`target`/`direction`, `findNearestExisting`, `existingOnly`, disabled state, open modes) or any Button item.
- Match existing file style exactly; no `eslint-disable`.

---

### Task 1: Schema fields + appearance resolver

**Files:**

- Modify: `src/views/toolbar-items/defined-navigation/defined-navigation-item.ts`
- Test: `src/views/toolbar-items/defined-navigation/defined-navigation-item.test.ts`

**Interfaces:**

- Consumes: existing `DefinedNavigationConfig`, `m.command_open_previous()`, `m.command_open_next()`.
- Produces:
  - `DefinedNavigationConfig` gains optional `icon?: string`, `label?: string`, `tooltip?: string`.
  - `interface DefinedNavigationAppearance { readonly icon?: string; readonly label?: string; readonly tooltip: string }`
  - `resolveDefinedNavigationAppearance(config: DefinedNavigationConfig): DefinedNavigationAppearance` — `previous` → `{ label: "‹", tooltip: m.command_open_previous() }`, `next` → `{ label: "›", tooltip: m.command_open_next() }` (no `icon` key).

- [ ] **Step 1: Write the failing tests**

Append to `src/views/toolbar-items/defined-navigation/defined-navigation-item.test.ts`. Add `m` to the imports and a new import for the resolver:

```ts
import { m } from "@/i18n";

import { definedNavigationItem, resolveDefinedNavigationAppearance } from "./defined-navigation-item";
```

(Replace the existing `import { definedNavigationItem } from "./defined-navigation-item";` line with the one above, and add the `m` import next to the other imports.)

Add these tests inside the file:

```ts
it("parses a config with icon, label, and tooltip", () => {
  const result = v.safeParse(definedNavigationItem.schema, {
    target: "day",
    direction: "next",
    icon: "star",
    label: "Older",
    tooltip: "Jump back",
  });
  expect(result.success).toBe(true);
});

describe("resolveDefinedNavigationAppearance", () => {
  it("uses the left chevron and open-previous tooltip for previous", () => {
    expect(resolveDefinedNavigationAppearance({ target: "day", direction: "previous" })).toEqual({
      label: "‹",
      tooltip: m.command_open_previous(),
    });
  });

  it("uses the right chevron and open-next tooltip for next", () => {
    expect(resolveDefinedNavigationAppearance({ target: "day", direction: "next" })).toEqual({
      label: "›",
      tooltip: m.command_open_next(),
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/views/toolbar-items/defined-navigation/defined-navigation-item.test.ts`
Expected: FAIL — `resolveDefinedNavigationAppearance` is not exported / not a function.

- [ ] **Step 3: Implement the schema fields and resolver**

Edit `src/views/toolbar-items/defined-navigation/defined-navigation-item.ts`. Add the three optional fields to `schema`:

```ts
const schema = v.object({
  target: v.picklist(DEFINED_NAVIGATION_TARGETS),
  direction: v.picklist(["previous", "next"] as const),
  icon: v.optional(v.string()),
  label: v.optional(v.string()),
  tooltip: v.optional(v.string()),
});
```

Then, after the `DefinedNavigationConfigChange` type alias and before `export const definedNavigationItem`, add:

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

The file already imports `m` from `@/i18n` and `icons` from `@/ui/icons`; no new imports needed. `defaultConfig` stays `{ target: "day", direction: "next" }` (new fields absent).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/views/toolbar-items/defined-navigation/defined-navigation-item.test.ts`
Expected: PASS (all tests, including the pre-existing ones).

- [ ] **Step 5: Typecheck**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/views/toolbar-items/defined-navigation/defined-navigation-item.ts \
        src/views/toolbar-items/defined-navigation/defined-navigation-item.test.ts
git commit -m "feat(views): add appearance fields and resolver to defined-navigation item"
```

---

### Task 2: Render appearance in the view

**Files:**

- Modify: `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.vue`
- Test: `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.test.ts`

**Interfaces:**

- Consumes: `resolveDefinedNavigationAppearance`, `DefinedNavigationConfig` from `../defined-navigation-item`; existing `UiButton`; new `UiIcon` from `@/ui/UiIcon.vue`.
- Produces: no new exports. The button now renders `config.icon ?? appearance.icon` as an icon, `config.label ?? appearance.label` as text, and uses `config.tooltip ?? appearance.tooltip` as the tooltip/aria-label. A custom `label` replaces the chevron; the chevron remains the default. (Consistent with `ButtonItem.vue`: an icon coexists with a default label rather than replacing it.)

- [ ] **Step 1: Write the failing tests**

Append these tests to the `describe("DefinedNavigationItem", ...)` block in `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.test.ts` (the file already imports `m` and defines `mountItem`):

```ts
it("renders the right chevron when no label is configured", () => {
  const { result } = mountItem({ target: "day", direction: "next" });
  expect(result.getByText("›")).toBeTruthy();
});

it("renders a custom label in place of the chevron", () => {
  const { result } = mountItem({ target: "day", direction: "next", label: "Older" });
  expect(result.getByText("Older")).toBeTruthy();
  expect(result.queryByText("›")).toBeNull();
});

it("uses the direction default tooltip as the button aria-label", () => {
  const { result } = mountItem({ target: "day", direction: "previous" });
  expect(result.getByLabelText(m.command_open_previous())).toBeTruthy();
});

it("uses a custom tooltip as the button aria-label", () => {
  const { result } = mountItem({ target: "day", direction: "next", tooltip: "Jump back" });
  expect(result.getByLabelText("Jump back")).toBeTruthy();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.test.ts`
Expected: FAIL — the current view renders the chevron via a raw expression (no `<span>` wrapping "Older") and ignores `config.label`/`config.tooltip`, so the label/aria assertions fail.

- [ ] **Step 3: Update the view**

Edit `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.vue`.

The file already imports `{ computed }` from `vue` and `UiButton`. **Keep** the `import { m } from "@/i18n";` line — `m` is still used inside `navigate()` for the no-previous/no-next notices. Add `UiIcon` next to the `UiButton` import:

```ts
import UiIcon from "@/ui/UiIcon.vue";
```

Change the config-type import to also bring in the resolver — replace the existing `import type { DefinedNavigationConfig } from "../defined-navigation-item";` line with:

```ts
import { resolveDefinedNavigationAppearance, type DefinedNavigationConfig } from "../defined-navigation-item";
```

After the `const scope = useShelfScope(...)` line, add:

```ts
const appearance = computed(() => resolveDefinedNavigationAppearance(props.config));
const icon = computed(() => props.config.icon ?? appearance.value.icon);
const label = computed(() => props.config.label ?? appearance.value.label);
const tooltip = computed(() => props.config.tooltip ?? appearance.value.tooltip);
```

Replace the `<template>` button with:

```html
<template>
  <UiButton
    flat
    :tooltip="tooltip"
    :disabled="candidates.length === 0"
    :data-direction="config.direction"
    @click="(event: MouseEvent) => navigate(config.direction, event)"
    @auxclick.middle.prevent="(event: MouseEvent) => navigate(config.direction, event)"
  >
    <UiIcon v-if="icon" :name="icon" />
    <span v-if="label">{{ label }}</span>
    <span v-else-if="!icon">{{ tooltip }}</span>
  </UiButton>
</template>
```

`candidates`, `referenceAnchor`, and `navigate()` are unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.test.ts`
Expected: PASS (new tests plus all six pre-existing navigation tests).

- [ ] **Step 5: Typecheck**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.vue \
        src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.test.ts
git commit -m "feat(views): render icon/label/tooltip in defined-navigation item"
```

---

### Task 3: i18n keys + config modal controls

**Files:**

- Modify: `messages/en.json`
- Modify: `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItemConfig.vue`
- Test: `src/views/toolbar-items/defined-navigation/DefinedNavigationItemConfig.test.ts`

**Interfaces:**

- Consumes: `resolveDefinedNavigationAppearance` from `../defined-navigation-item`; `UiIconSuggest`, `UiTextInput`, `UiSettingRow`; new keys `m.view_toolbar_appearance_label_label()`, `m.view_toolbar_appearance_tooltip_label()`, existing `m.common_label_icon()`.
- Produces: config modal renders Icon / Label / Tooltip rows (in that order) before Target and Direction. Each emits an `onChange` patch that adds the field (empty string → `undefined`).

- [ ] **Step 1: Add the i18n keys**

In `messages/en.json`, immediately after the line `"view_toolbar_button_config_tooltip_label": "Tooltip",` (line ~858), add:

```json
  "view_toolbar_appearance_label_label": "Label",
  "view_toolbar_appearance_tooltip_label": "Tooltip",
```

- [ ] **Step 2: Compile i18n**

Run: `npm run compile:i18n`
Expected: regenerates `src/i18n/paraglide/messages.js`; `m.view_toolbar_appearance_label_label` and `m.view_toolbar_appearance_tooltip_label` now exist.

- [ ] **Step 3: Write the failing tests**

Replace the `mountConfig` helper in `src/views/toolbar-items/defined-navigation/DefinedNavigationItemConfig.test.ts` so it provides `InputSuggestService` (required by `UiIconSuggest`), and add the new imports at the top:

```ts
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { InputSuggestService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";
import { m } from "@/i18n";
```

New `mountConfig`:

```ts
function mountConfig(config: DefinedNavigationConfig, onChange: DefinedNavigationConfigChange) {
  const container = new Container();
  container.register(InputSuggestService).useValue(new FakeInputSuggestService() as unknown as InputSuggestService);
  return render(DefinedNavigationItemConfig, {
    props: { config, onChange },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}
```

Add these tests to the `describe("DefinedNavigationItemConfig", ...)` block. Textboxes render in order: icon, label, tooltip.

```ts
it("emits onChange with the new icon when the icon input changes", async () => {
  const onChange = vi.fn();
  mountConfig({ target: "day", direction: "next" }, onChange);
  const [iconInput] = screen.getAllByRole("textbox");
  await userEvent.clear(iconInput);
  await userEvent.type(iconInput, "star");
  expect(onChange).toHaveBeenLastCalledWith({ target: "day", direction: "next", icon: "star" });
});

it("emits onChange with the new label when the label input changes", async () => {
  const onChange = vi.fn();
  mountConfig({ target: "day", direction: "next" }, onChange);
  const [, labelInput] = screen.getAllByRole("textbox");
  await userEvent.clear(labelInput);
  await userEvent.type(labelInput, "Older");
  expect(onChange).toHaveBeenLastCalledWith({ target: "day", direction: "next", label: "Older" });
});

it("emits onChange with the new tooltip when the tooltip input changes", async () => {
  const onChange = vi.fn();
  mountConfig({ target: "day", direction: "next" }, onChange);
  const [, , tooltipInput] = screen.getAllByRole("textbox");
  await userEvent.clear(tooltipInput);
  await userEvent.type(tooltipInput, "Jump");
  expect(onChange).toHaveBeenLastCalledWith({ target: "day", direction: "next", tooltip: "Jump" });
});

it("clears the label (sets undefined) when the label input is emptied", async () => {
  const onChange = vi.fn();
  mountConfig({ target: "day", direction: "next", label: "Older" }, onChange);
  const [, labelInput] = screen.getAllByRole("textbox");
  await userEvent.clear(labelInput);
  expect(onChange).toHaveBeenLastCalledWith({ target: "day", direction: "next", label: undefined });
});

it("shows the chevron as the label-field placeholder", () => {
  mountConfig({ target: "day", direction: "next" }, vi.fn());
  expect(screen.getByPlaceholderText("›")).toBeTruthy();
});

it("shows the default tooltip as the tooltip-field placeholder", () => {
  mountConfig({ target: "day", direction: "next" }, vi.fn());
  expect(screen.getByPlaceholderText(m.command_open_next())).toBeTruthy();
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm run test -- src/views/toolbar-items/defined-navigation/DefinedNavigationItemConfig.test.ts`
Expected: FAIL — no textbox inputs exist yet (only the two dropdowns), so `getAllByRole("textbox")` is empty.

- [ ] **Step 5: Add the appearance rows to the config component**

Replace `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItemConfig.vue` with:

```html
<script setup lang="ts">
  import { computed } from "vue";

  import { m } from "@/i18n";
  import UiDropdown from "@/ui/UiDropdown.vue";
  import UiIconSuggest from "@/ui/UiIconSuggest.vue";
  import UiSettingRow from "@/ui/UiSettingRow.vue";
  import UiTextInput from "@/ui/UiTextInput.vue";

  import { DEFINED_NAVIGATION_TARGETS } from "../defined-navigation-targets";
  import {
    resolveDefinedNavigationAppearance,
    type DefinedNavigationConfig,
    type DefinedNavigationConfigChange,
  } from "../defined-navigation-item";

  const props = defineProps<{
    config: DefinedNavigationConfig;
    onChange: DefinedNavigationConfigChange;
  }>();

  const targets = DEFINED_NAVIGATION_TARGETS;
  const directions = ["previous", "next"] as const;

  const appearance = computed(() => resolveDefinedNavigationAppearance(props.config));

  const update = (patch: Partial<DefinedNavigationConfig>): void => props.onChange({ ...props.config, ...patch });
</script>

<template>
  <UiSettingRow>
    <template #name>{{ m.common_label_icon() }}</template>
    <UiIconSuggest
      :model-value="config.icon ?? ''"
      :placeholder="appearance.icon"
      @update:model-value="(value: string | undefined) => update({ icon: value || undefined })"
    />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_appearance_label_label() }}</template>
    <UiTextInput
      :model-value="config.label ?? ''"
      :placeholder="appearance.label"
      @update:model-value="(value: string | undefined) => update({ label: value || undefined })"
    />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_appearance_tooltip_label() }}</template>
    <UiTextInput
      :model-value="config.tooltip ?? ''"
      :placeholder="appearance.tooltip"
      @update:model-value="(value: string | undefined) => update({ tooltip: value || undefined })"
    />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_defined_navigation_target() }}</template>
    <UiDropdown
      :model-value="config.target"
      @update:model-value="
        (value: string | undefined) => value && update({ target: value as DefinedNavigationConfig['target'] })
      "
    >
      <option v-for="target of targets" :key="target" :value="target">
        {{ target === "active" ? m.view_toolbar_defined_navigation_target_active() : m.command_write_type_option({
        writeType: target }) }}
      </option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_defined_navigation_direction() }}</template>
    <UiDropdown
      :model-value="config.direction"
      @update:model-value="
        (value: string | undefined) => value && update({ direction: value as DefinedNavigationConfig['direction'] })
      "
    >
      <option v-for="direction of directions" :key="direction" :value="direction">
        {{ m.view_toolbar_defined_navigation_direction_option({ direction }) }}
      </option>
    </UiDropdown>
  </UiSettingRow>
</template>
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test -- src/views/toolbar-items/defined-navigation/DefinedNavigationItemConfig.test.ts`
Expected: PASS (new appearance tests plus the four pre-existing target/direction tests — the two comboboxes are still index `[0]=target`, `[1]=direction`).

- [ ] **Step 7: Full gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add messages/en.json src/i18n/paraglide \
        src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItemConfig.vue \
        src/views/toolbar-items/defined-navigation/DefinedNavigationItemConfig.test.ts
git commit -m "feat(views): add icon/label/tooltip controls to defined-navigation config"
```

---

### Final verification (runtime)

- [ ] **Run the defined-navigation e2e journey** (runtime-touching change):

Run: `npm run test:e2e -- --spec ./e2e/journeys/defined-navigation.e2e.ts`
Expected: PASS. If the journey has no coverage gap for the new controls it needs no edits; add a case only if a black-box gap appears (e.g. a configured label/icon showing on the toolbar button).

## Notes on decisions already made

- All three controls (Icon + Label + Tooltip); blank fields keep the current `‹`/`›` chevron and direction tooltip as placeholders — zero visual regression.
- No shared appearance-fields component (two consumers; defer). No `summary` field.
- An icon and the default chevron label coexist (matches `ButtonItem.vue`); only a custom `label` replaces the chevron. This is why the view test asserts label-replacement, not icon-replacement.
