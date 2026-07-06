# Single-direction defined-navigation item Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `defined-navigation` toolbar item's `previous`/`next` boolean pair with a single `direction` config option, so one item renders exactly one arrow (add the item twice to get both).

**Architecture:** The item's config schema is a valibot object whose inferred type flows into the widget SFC, the config SFC, and every test. Because `DefinedNavigationConfig` is shared by both SFCs, the schema change and both SFCs must land together to keep `check:types` green — this is one atomic task. The runtime (`navigate()`, `JournalsIndex.findNearestExisting`) is untouched.

**Tech Stack:** TypeScript, Vue 3 SFCs, valibot schemas, paraglide i18n (`m.*`), vitest + @testing-library/vue + @testing-library/user-event, WebdriverIO e2e.

## Global Constraints

- Value vocabulary for this feature stays `"previous" | "next"` (the sibling `button` uses `prev`/`next`; do **not** align them here).
- Quality gates run as npm scripts (not pnpm): `npm run test`, `npm run check:types`, `npm run check:lint`.
- Editing `messages/en.json` requires regenerating paraglide output (`npm run compile:i18n`) before `check:types`/`test` see the new `m.*` accessors — the `src/i18n/paraglide/` dir is gitignored/generated.
- No migration: v3-ai is pre-release; the only persisted old-shape config is the e2e fixture, rewritten by hand in this task.
- Spec: `docs/superpowers/specs/2026-07-06-defined-navigation-single-direction-design.md`.
- Project conventions (memory): inline `m.*()` in templates (no `computed` wrapper); one behavior per test; black-box assertions; no eslint-disable.

---

### Task 1: Single-direction schema, widget, config UI, and fixture

**Files:**

- Modify: `src/views/toolbar-items/defined-navigation/defined-navigation-item.ts`
- Modify: `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.vue`
- Modify: `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItemConfig.vue`
- Modify: `messages/en.json` (lines 815-819 block)
- Modify: `src/views/toolbar-items/defined-navigation/defined-navigation-item.test.ts`
- Modify: `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.test.ts`
- Modify: `src/views/toolbar-items/defined-navigation/DefinedNavigationItemConfig.test.ts`
- Modify: `e2e/fixtures/e2e-defined-nav/.obsidian/plugins/journals/data.json`

**Interfaces:**

- Consumes: `defineToolbarItem<T>`, `DEFINED_NAVIGATION_TARGETS`, `m.*` messages, `UiButton`, `UiDropdown`, `UiSettingRow`, `JournalsIndex.findNearestExisting`, `OpenDateFlow` — all unchanged.
- Produces: `DefinedNavigationConfig = { target: (typeof DEFINED_NAVIGATION_TARGETS)[number]; direction: "previous" | "next" }` and `DefinedNavigationConfigChange = (next: DefinedNavigationConfig) => void`. The `previous`/`next` boolean fields are removed.

- [ ] **Step 1: Update the item unit test to the new schema/default (failing)**

Replace the whole body of `src/views/toolbar-items/defined-navigation/defined-navigation-item.test.ts` with:

```ts
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { definedNavigationItem } from "./defined-navigation-item";

describe("definedNavigationItem", () => {
  it("defaults to walking daily notes in the next direction", () => {
    expect(definedNavigationItem.defaultConfig).toEqual({ target: "day", direction: "next" });
  });

  it("parses a valid config", () => {
    const result = v.safeParse(definedNavigationItem.schema, { target: "week", direction: "previous" });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown target", () => {
    const result = v.safeParse(definedNavigationItem.schema, { target: "decade", direction: "next" });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown direction", () => {
    const result = v.safeParse(definedNavigationItem.schema, { target: "day", direction: "sideways" });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the item unit test to verify it fails**

Run: `npm run test -- src/views/toolbar-items/defined-navigation/defined-navigation-item.test.ts`
Expected: FAIL — `defaultConfig` still equals `{ target: "day", previous: true, next: true }`, and the `direction` parse cases fail because the schema has no `direction` field.

- [ ] **Step 3: Change the schema and default config**

In `src/views/toolbar-items/defined-navigation/defined-navigation-item.ts`, replace the `schema` object and `defaultConfig`:

```ts
const schema = v.object({
  target: v.picklist(DEFINED_NAVIGATION_TARGETS),
  direction: v.picklist(["previous", "next"] as const),
});
```

and

```ts
  defaultConfig: { target: "day", direction: "next" },
```

Leave the imports, `DEFINED_NAVIGATION_TARGETS` re-export, exported types, and `defineToolbarItem` call otherwise unchanged.

- [ ] **Step 4: Run the item unit test to verify it passes**

Run: `npm run test -- src/views/toolbar-items/defined-navigation/defined-navigation-item.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Update i18n messages**

In `messages/en.json`, replace this block (currently lines 815-819):

```json
  "view_toolbar_defined_navigation_label": "Defined-note navigation",
  "view_toolbar_defined_navigation_description": "Buttons that jump to the previous/next note that already exists.",
  "view_toolbar_defined_navigation_target": "Walk which notes",
  "view_toolbar_defined_navigation_previous": "Show previous button",
  "view_toolbar_defined_navigation_next": "Show next button",
```

with:

```json
  "view_toolbar_defined_navigation_label": "Defined-note navigation",
  "view_toolbar_defined_navigation_description": "A button that jumps to the previous or next note that already exists.",
  "view_toolbar_defined_navigation_target": "Walk which notes",
  "view_toolbar_defined_navigation_direction": "Direction",
  "view_toolbar_defined_navigation_direction_option": [
    {
      "declarations": ["input direction"],
      "selectors": ["direction"],
      "match": {
        "direction=previous": "Previous",
        "direction=next": "Next"
      }
    }
  ],
```

Then regenerate paraglide output:

Run: `npm run compile:i18n`
Expected: completes without error; `m.view_toolbar_defined_navigation_direction` and `m.view_toolbar_defined_navigation_direction_option` now exist, and the two removed accessors are gone.

- [ ] **Step 6: Rewrite the widget SFC to a single direction-driven button**

Replace the entire `<template>` block of `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.vue` with:

```html
<template>
  <UiButton
    flat
    :tooltip="config.direction === 'previous' ? m.command_open_previous() : m.command_open_next()"
    :disabled="candidates.length === 0"
    :data-direction="config.direction"
    @click="(event: MouseEvent) => navigate(config.direction, event)"
    @auxclick.middle.prevent="(event: MouseEvent) => navigate(config.direction, event)"
  >
    {{ config.direction === "previous" ? "‹" : "›" }}
  </UiButton>
</template>
```

Leave the `<script setup>` block unchanged — `navigate(direction, event)`, `referenceAnchor()`, `candidates`, and all imports (including `m`) are still used as-is.

- [ ] **Step 7: Update the widget component test to single-direction mounts**

Replace each `mountItem(...)` config literal in `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.test.ts` so every mount carries a single `direction` instead of `previous`/`next`:

- "opens the nearest earlier existing note when the previous button is clicked" → mount config `{ target: "day", direction: "previous" }`.
- "disables the previous button when the target resolves no journals" → `{ target: "day", direction: "previous" }`.
- "shows a notice when no earlier note exists" → `{ target: "day", direction: "previous" }`.
- "opens the nearest later existing note when the next button is clicked" → `{ target: "day", direction: "next" }`.
- "shows a notice when no later note exists" → `{ target: "day", direction: "next" }`.

All other test code (the `[data-direction='previous']` / `[data-direction='next']` queries, entries, SCOPE, assertions) stays exactly as-is. Only the config object passed to `mountItem` changes.

- [ ] **Step 8: Run the widget component test to verify it passes**

Run: `npm run test -- src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.test.ts`
Expected: PASS (5 tests). Each single-direction mount renders exactly its one arrow, and the existing `[data-direction=…]` lookups still resolve.

- [ ] **Step 9: Rewrite the config SFC — swap two toggles for one direction dropdown**

Replace the entire contents of `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItemConfig.vue` with:

```html
<script setup lang="ts">
  import { m } from "@/i18n";
  import UiDropdown from "@/ui/UiDropdown.vue";
  import UiSettingRow from "@/ui/UiSettingRow.vue";

  import { DEFINED_NAVIGATION_TARGETS } from "../defined-navigation-targets";

  import type { DefinedNavigationConfig, DefinedNavigationConfigChange } from "../defined-navigation-item";

  const props = defineProps<{
    config: DefinedNavigationConfig;
    onChange: DefinedNavigationConfigChange;
  }>();

  const targets = DEFINED_NAVIGATION_TARGETS;
  const directions = ["previous", "next"] as const;

  const update = (patch: Partial<DefinedNavigationConfig>): void => props.onChange({ ...props.config, ...patch });
</script>

<template>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_defined_navigation_target() }}</template>
    <UiDropdown
      :model-value="config.target"
      @update:model-value="
        (value: string | undefined) => value && update({ target: value as DefinedNavigationConfig['target'] })
      "
    >
      <option v-for="target of targets" :key="target" :value="target">
        {{ m.command_write_type_option({ writeType: target }) }}
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

- [ ] **Step 10: Rewrite the config component test for the direction dropdown**

Replace the whole body of `src/views/toolbar-items/defined-navigation/DefinedNavigationItemConfig.test.ts` with:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import DefinedNavigationItemConfig from "./ui/DefinedNavigationItemConfig.vue";

import type { DefinedNavigationConfig, DefinedNavigationConfigChange } from "./defined-navigation-item";

function mountConfig(config: DefinedNavigationConfig, onChange: DefinedNavigationConfigChange) {
  return render(DefinedNavigationItemConfig, { props: { config, onChange } });
}

// Dropdowns render in order: target, direction.
afterEach(() => cleanup());

describe("DefinedNavigationItemConfig", () => {
  it("emits onChange with the chosen target when the target dropdown changes", async () => {
    const onChange = vi.fn();
    mountConfig({ target: "day", direction: "next" }, onChange);
    const [targetDropdown] = screen.getAllByRole("combobox");
    await userEvent.selectOptions(targetDropdown, "week");
    expect(onChange).toHaveBeenCalledWith({ target: "week", direction: "next" });
  });

  it("emits onChange with previous when the direction dropdown selects previous", async () => {
    const onChange = vi.fn();
    mountConfig({ target: "day", direction: "next" }, onChange);
    const [, directionDropdown] = screen.getAllByRole("combobox");
    await userEvent.selectOptions(directionDropdown, "previous");
    expect(onChange).toHaveBeenCalledWith({ target: "day", direction: "previous" });
  });

  it("emits onChange with next when the direction dropdown selects next", async () => {
    const onChange = vi.fn();
    mountConfig({ target: "day", direction: "previous" }, onChange);
    const [, directionDropdown] = screen.getAllByRole("combobox");
    await userEvent.selectOptions(directionDropdown, "next");
    expect(onChange).toHaveBeenCalledWith({ target: "day", direction: "next" });
  });
});
```

- [ ] **Step 11: Run the config component test to verify it passes**

Run: `npm run test -- src/views/toolbar-items/defined-navigation/DefinedNavigationItemConfig.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 12: Update the e2e fixture to a single-direction item**

In `e2e/fixtures/e2e-defined-nav/.obsidian/plugins/journals/data.json`, change the defined-navigation item's config (currently line 37) from:

```json
                "config": { "target": "day", "previous": true, "next": true }
```

to:

```json
                "config": { "target": "day", "direction": "previous" }
```

(`previous`, because `e2e/journeys/defined-navigation.e2e.ts` only ever clicks the previous arrow — that test file is unchanged.)

- [ ] **Step 13: Run the full unit gates**

Run: `npm run test`
Expected: PASS (whole suite).

Run: `npm run check:types`
Expected: PASS — no references to `config.previous` / `config.next` remain, and the new `m.*` accessors resolve.

Run: `npm run check:lint`
Expected: PASS.

- [ ] **Step 14: Run the e2e journey (runtime-touching fixture change)**

Run the wdio suite for the defined-navigation journey per the project's e2e command (e.g. `npm run test:e2e` filtered to `defined-navigation`, or the full e2e run if no filter exists).
Expected: PASS — the single `direction: "previous"` item mounts in the live leaf, and clicking its previous arrow opens the nearest earlier existing note (`day/2030-10-10.md`).

- [ ] **Step 15: Commit**

```bash
git add src/views/toolbar-items/defined-navigation messages/en.json e2e/fixtures/e2e-defined-nav
git commit -m "feat(views): make defined-navigation a single-direction item"
```

---

## Self-Review

**Spec coverage:**

- Schema single `direction` picklist + default `next` → Steps 1-4. ✓
- Widget renders one direction-driven button, keeps `data-direction` → Steps 6-8. ✓
- Config UI: two toggles → one direction dropdown, target dropdown kept → Steps 9-11. ✓
- i18n: remove `_previous`/`_next`, add `_direction` + `_direction_option` match message, singular description → Step 5. ✓
- No migration; e2e fixture rewritten by hand to single-direction → Step 12. ✓
- Tests: item unit (default/parse/reject), widget component (5 behaviors), config component (target + two direction), e2e file unchanged → Steps 1,7,10,12,14. ✓
- Runtime `navigate()`/`findNearestExisting` untouched → Step 6 leaves `<script setup>` intact. ✓
- Quality gates test/check:types/check:lint + e2e → Steps 13-14. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full content. ✓

**Type consistency:** `DefinedNavigationConfig` is `{ target, direction }` everywhere (schema Step 3, widget Step 6, config Step 9, all tests). Direction values are `"previous" | "next"` consistently, including the i18n match keys `direction=previous`/`direction=next` and the SFC `directions` list. Message accessor `view_toolbar_defined_navigation_direction_option` used identically in the config SFC and defined in en.json. ✓
