# Toolbar item appearance defaults — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a toolbar item's `icon`, `label`, and `tooltip` ordinary stored values seeded from its action at creation time, so a user can clear the icon and get a button with no icon.

**Architecture:** `resolveButtonAppearance` / `resolveDefinedNavigationAppearance` stay the single definition of what each action looks like, but move from being read at render time to being called once at creation time through `buttonConfigFor(action)` / `definedNavigationConfigFor(target, direction)`. The render sites then read the config directly, so an empty string means "nothing". The two config editors stop using placeholders, show the stored value, and gain a per-field reset control; those three rows are identical in both editors and become one shared component.

**Tech Stack:** TypeScript, Vue 3 SFCs (`<script setup>`), valibot schemas, paraglide i18n (`m.*`), vitest + @testing-library/vue + @testing-library/user-event, WebdriverIO for e2e.

**Spec:** `docs/superpowers/specs/2026-07-29-toolbar-item-appearance-defaults-design.md`

## Global Constraints

- Commands: `npm test`, `npm run check:types`, `npm run check:lint` (npm, not pnpm). Run all three before the final commit.
- Commit to the current branch (`v3-ai`). Never create a branch. Never add a `Co-Authored-By` trailer.
- Never use `eslint-disable` comments. Fix the code instead.
- New user-facing strings are authored in `messages/en.json` and compiled with `npm run compile:i18n`. `src/i18n/paraglide` is generated and git-ignored — never stage it.
- Copy follows §A of `docs/2026-07-13-ux-text-audit.md`: sentence case, en-US.
- Icons are referenced through `src/ui/icons.ts` (`icons.action.*`), never as bare string literals in authored code.
- Tests: one behavior per test, no "and"/comma-list test names, scope expressed with nested `describe` blocks. Vue components are tested with `@testing-library/vue` + `user-event` — no `@vue/test-utils`, no CSS-class queries, no test-only `data-*` attributes.
- Vue props are declared inline: `defineProps<{ ... }>()`.
- Do not wrap `m.*()` calls in `computed()` unless the arguments contain reactive data.

---

### Task 1: Seed helpers and the shared appearance type

**Files:**

- Create: `src/views/toolbar-items/appearance.ts`
- Modify: `src/views/toolbar-items/button/button-config.ts:46-52`
- Modify: `src/views/toolbar-items/defined-navigation/defined-navigation-config.ts:18-28`
- Test: `src/views/toolbar-items/button/button-config.test.ts`
- Test: `src/views/toolbar-items/defined-navigation/defined-navigation-item.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces:
  - `interface ToolbarItemAppearance { readonly icon?: string; readonly label?: string; readonly tooltip?: string }` exported from `src/views/toolbar-items/appearance.ts`
  - `buttonConfigFor(action: ButtonAction): ButtonConfig` exported from `button-config.ts`
  - `definedNavigationConfigFor(target: DefinedNavigationConfig["target"], direction: DefinedNavigationConfig["direction"]): DefinedNavigationConfig` exported from `defined-navigation-config.ts`
  - `resolveButtonAppearance` and `resolveDefinedNavigationAppearance` keep their names and behavior; only their declared return type changes to `ToolbarItemAppearance`.

Note on the type: `tooltip` becomes optional. Both resolvers still always set it, but the same type now also describes the stored overrides, where every field can be absent. `ToolbarItemDefinition.summary` is already typed `(config) => string | undefined`, so nothing downstream needs widening.

- [ ] **Step 1: Write the failing tests for `buttonConfigFor`**

Append to `src/views/toolbar-items/button/button-config.test.ts`. The file already imports `m`, `icons`, `describe`, `expect`, `it` — add `buttonConfigFor` to the existing import from `./button-config`.

```ts
describe("buttonConfigFor", () => {
  it("seeds the icon from the action", () => {
    const config = buttonConfigFor({ type: "navigate-step", direction: "next", unit: "month", amount: 1 });
    expect(config.icon).toBe(icons.nav.next);
  });

  it("seeds the label from the action", () => {
    const config = buttonConfigFor({ type: "current", mode: "create", levels: ["day"] });
    expect(config.label).toBe(m.common_label_today());
  });

  it("seeds the tooltip from the action", () => {
    const config = buttonConfigFor({ type: "pick-date", mode: "navigate", levels: ["day"] });
    expect(config.tooltip).toBe(m.common_pick_a_date());
  });

  it("leaves the label unset for an action that has no default label", () => {
    const config = buttonConfigFor({ type: "pick-date", mode: "navigate", levels: ["day"] });
    expect(config.label).toBeUndefined();
  });

  it("carries the action it was given", () => {
    const action = { type: "current", mode: "create", levels: ["day"] } as const;
    expect(buttonConfigFor(action).action).toEqual(action);
  });
});
```

- [ ] **Step 2: Write the failing tests for `definedNavigationConfigFor`**

Append to `src/views/toolbar-items/defined-navigation/defined-navigation-item.test.ts`, which already holds the `resolveDefinedNavigationAppearance` describe block. Add `definedNavigationConfigFor` to the existing import from `./defined-navigation-config`.

```ts
describe("definedNavigationConfigFor", () => {
  it("seeds the left chevron label for the previous direction", () => {
    expect(definedNavigationConfigFor("day", "previous").label).toBe("‹");
  });

  it("seeds the right chevron label for the next direction", () => {
    expect(definedNavigationConfigFor("day", "next").label).toBe("›");
  });

  it("seeds the tooltip from the direction", () => {
    expect(definedNavigationConfigFor("day", "next").tooltip).toBe(m.command_open_next());
  });

  it("carries the target it was given", () => {
    expect(definedNavigationConfigFor("week", "next").target).toBe("week");
  });
});
```

- [ ] **Step 3: Run both test files to verify they fail**

Run: `npx vitest run src/views/toolbar-items/button/button-config.test.ts src/views/toolbar-items/defined-navigation/defined-navigation-item.test.ts`
Expected: FAIL — `buttonConfigFor is not a function` / `definedNavigationConfigFor is not a function` (or a TS resolution error on the import).

- [ ] **Step 4: Create the shared appearance type**

Create `src/views/toolbar-items/appearance.ts`:

```ts
export interface ToolbarItemAppearance {
  readonly icon?: string;
  readonly label?: string;
  readonly tooltip?: string;
}
```

- [ ] **Step 5: Point `button-config.ts` at the shared type and add the helper**

In `src/views/toolbar-items/button/button-config.ts`, delete the local `ButtonAppearance` interface (lines 46-50), add the import, change the resolver's return type, and append the helper:

```ts
import type { ToolbarItemAppearance } from "../appearance";

// ...

export function resolveButtonAppearance(action: ButtonAction): ToolbarItemAppearance {
  // body unchanged
}

export function buttonConfigFor(action: ButtonAction): ButtonConfig {
  return { action, ...resolveButtonAppearance(action) };
}
```

- [ ] **Step 6: Do the same in `defined-navigation-config.ts`**

Delete the local `DefinedNavigationAppearance` interface (lines 18-22) and append the helper:

```ts
import type { ToolbarItemAppearance } from "../appearance";

// ...

export function resolveDefinedNavigationAppearance(config: DefinedNavigationConfig): ToolbarItemAppearance {
  // body unchanged
}

export function definedNavigationConfigFor(
  target: DefinedNavigationConfig["target"],
  direction: DefinedNavigationConfig["direction"],
): DefinedNavigationConfig {
  return { target, direction, ...resolveDefinedNavigationAppearance({ target, direction }) };
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/views/toolbar-items/`
Expected: PASS.

- [ ] **Step 8: Typecheck**

Run: `npm run check:types`
Expected: clean. `ButtonAppearance` and `DefinedNavigationAppearance` had no importers outside their own files, so nothing else refers to them.

- [ ] **Step 9: Commit**

```bash
git add src/views/toolbar-items/appearance.ts src/views/toolbar-items/button/button-config.ts src/views/toolbar-items/button/button-config.test.ts src/views/toolbar-items/defined-navigation/defined-navigation-config.ts src/views/toolbar-items/defined-navigation/defined-navigation-item.test.ts
git commit -m "feat(views): add toolbar item appearance seed helpers"
```

---

### Task 2: Seed every creation site

**Files:**

- Modify: `src/views/toolbar-items/button/button-item.ts:15-37`
- Modify: `src/views/toolbar-items/defined-navigation/defined-navigation-item.ts:18`
- Modify: `src/views/default-view.ts:45-89`
- Test: `src/views/default-view.test.ts`

**Interfaces:**

- Consumes: `buttonConfigFor(action)` and `definedNavigationConfigFor(target, direction)` from Task 1.
- Produces: every stored toolbar item created by the plugin now carries `icon` / `label` / `tooltip` alongside its action. `v3-to-v4.ts` needs no change — `reshapeViews` does `structuredClone(defaultCalendarView())` and inherits the seeding.

- [ ] **Step 1: Write the failing test**

Append to `src/views/default-view.test.ts`, inside the existing top-level `describe`. It already has an `itemsOf(n)` helper and imports `icons`:

```ts
it("seeds the pick-date button with its action's icon", () => {
  const pick = itemsOf(0).find((item) => item.key === "button");
  expect((pick!.config as { icon?: string }).icon).toBe(icons.action.pickDate);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/views/default-view.test.ts`
Expected: FAIL — received `undefined`.

- [ ] **Step 3: Seed the button item's default and presets**

In `src/views/toolbar-items/button/button-item.ts`, import `buttonConfigFor` from `./button-config` and wrap all four action literals:

```ts
  defaultConfig: buttonConfigFor({ type: "current", mode: "create", levels: ["day"] }),
  component: ButtonItem,
  configComponent: ButtonItemConfig,
  summary: (config) => resolveButtonAppearance(config.action).tooltip,
  presets: [
    {
      label: m.view_toolbar_button_preset_pick_date(),
      description: m.view_toolbar_button_preset_pick_date_description(),
      defaultConfig: buttonConfigFor({ type: "pick-date", mode: "navigate", levels: ["day"] }),
    },
    {
      label: m.view_toolbar_button_preset_open_note(),
      description: m.view_toolbar_button_preset_open_note_description(),
      defaultConfig: buttonConfigFor({ type: "current", mode: "create", levels: ["day"] }),
    },
    {
      label: m.view_toolbar_button_preset_navigate(),
      description: m.view_toolbar_button_preset_navigate_description(),
      defaultConfig: buttonConfigFor({ type: "navigate-step", direction: "next", unit: "month", amount: 1 }),
    },
  ],
```

`summary` keeps calling `resolveButtonAppearance`: it answers "what does this button do" for the edit-modal title, which is a question about the action, not about the appearance the user chose.

- [ ] **Step 4: Seed the defined-navigation default**

In `src/views/toolbar-items/defined-navigation/defined-navigation-item.ts`, import `definedNavigationConfigFor` from `./defined-navigation-config` and replace line 18:

```ts
  defaultConfig: definedNavigationConfigFor("day", "next"),
```

- [ ] **Step 5: Seed the six default-view buttons**

In `src/views/default-view.ts`, add `import { buttonConfigFor } from "./toolbar-items/button/button-config";` and wrap each button config:

```ts
            {
              id: ITEM_PICK_DATE,
              key: "button",
              config: buttonConfigFor({ type: "pick-date", mode: "create", levels: ["day"] }),
            },
            {
              id: ITEM_CURRENT,
              key: "button",
              config: buttonConfigFor({ type: "current", mode: "navigate", levels: ["day"] }),
            },
```

and in the nav toolbar:

```ts
            {
              id: ITEM_PREV_YEAR,
              key: "button",
              config: buttonConfigFor({ type: "navigate-step", direction: "prev", unit: "year", amount: 1 }),
            },
            {
              id: ITEM_PREV_MONTH,
              key: "button",
              config: buttonConfigFor({ type: "navigate-step", direction: "prev", unit: "month", amount: 1 }),
            },
```

```ts
            {
              id: ITEM_NEXT_MONTH,
              key: "button",
              config: buttonConfigFor({ type: "navigate-step", direction: "next", unit: "month", amount: 1 }),
            },
            {
              id: ITEM_NEXT_YEAR,
              key: "button",
              config: buttonConfigFor({ type: "navigate-step", direction: "next", unit: "year", amount: 1 }),
            },
```

Leave `shelf-selector`, `spacer`, and `period-buttons` items untouched — they have no appearance fields.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/views/ src/settings/legacy/`
Expected: PASS. `default-view.test.ts` and `v3-to-v4.test.ts` look items up by `key` and by action type rather than by whole-config equality, so the extra fields do not disturb them.

- [ ] **Step 7: Commit**

```bash
git add src/views/toolbar-items/button/button-item.ts src/views/toolbar-items/defined-navigation/defined-navigation-item.ts src/views/default-view.ts src/views/default-view.test.ts
git commit -m "feat(views): seed toolbar item appearance at creation"
```

---

### Task 3: Render from the config, and repair the stale fixtures

**Files:**

- Modify: `src/views/toolbar-items/button/ui/ButtonItem.vue:20,38-41,167-173`
- Modify: `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.vue:16,32-34,67-80`
- Test: `src/views/toolbar-items/button/ButtonItem.test.ts:105-127`
- Test: `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.test.ts:217-236`
- Modify: `e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json`
- Modify: `e2e/fixtures/e2e-defined-nav/.obsidian/plugins/journals/data.json`

**Interfaces:**

- Consumes: configs seeded by Task 2.
- Produces: `ButtonItem.vue` and `DefinedNavigationItem.vue` no longer import their resolver. `config.icon === ""` renders no icon; `config.icon === undefined` renders no icon too.

- [ ] **Step 1: Rewrite the affected `ButtonItem` rendering tests**

In `src/views/toolbar-items/button/ButtonItem.test.ts`, add `buttonConfigFor` to the existing import from `./button-config` and replace the whole `describe("rendering defaults", ...)` block (lines 105-127) with:

```ts
describe("rendering", () => {
  it("renders the seeded label for a current[day] button", () => {
    const { result } = mountItem(buttonConfigFor({ type: "current", mode: "create", levels: ["day"] }));
    expect(result.getByText("Today")).toBeTruthy();
  });

  it("renders a custom label in place of the seeded one", () => {
    const { result } = mountItem({
      ...buttonConfigFor({ type: "current", mode: "create", levels: ["day"] }),
      label: "Right now",
    });
    expect(result.getByText("Right now")).toBeTruthy();
  });

  it("uses the configured tooltip as the button aria-label", () => {
    const { result } = mountItem({
      ...buttonConfigFor({ type: "current", mode: "create", levels: ["day"] }),
      tooltip: "Jump to today",
    });
    expect(result.getByLabelText("Jump to today")).toBeTruthy();
  });

  it("falls back to the tooltip text when the icon is cleared", () => {
    const { result } = mountItem({
      ...buttonConfigFor({ type: "pick-date", mode: "navigate", levels: ["day"] }),
      icon: "",
    });
    expect(result.getByText(m.common_pick_a_date())).toBeTruthy();
  });

  it("shows no text while the seeded icon is present", () => {
    const { result } = mountItem(buttonConfigFor({ type: "pick-date", mode: "navigate", levels: ["day"] }));
    expect(result.queryByText(m.common_pick_a_date())).toBeNull();
  });
});
```

The last two are the observable proof that the icon is gone: `UiIcon` renders through Obsidian's `renderIcon`, which produces nothing under the test mock, so the icon itself cannot be asserted directly. The `v-else-if="!icon"` branch is the visible consequence.

Make sure `m` is imported in this file; add `import { m } from "@/i18n";` if it is not.

- [ ] **Step 2: Rewrite the affected `DefinedNavigationItem` rendering tests**

In `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.test.ts`, add `import { definedNavigationConfigFor } from "../defined-navigation-config";` and replace lines 217-236 with:

```ts
it("renders the seeded chevron label", () => {
  const { result } = mountItem(definedNavigationConfigFor("day", "next"));
  expect(result.getByText("›")).toBeTruthy();
});

it("renders a custom label in place of the chevron", () => {
  const { result } = mountItem({ ...definedNavigationConfigFor("day", "next"), label: "Older" });
  expect(result.getByText("Older")).toBeTruthy();
});

it("renders no chevron when the label is cleared", () => {
  const { result } = mountItem({ ...definedNavigationConfigFor("day", "next"), label: "" });
  expect(result.queryByText("›")).toBeNull();
});

it("uses the seeded tooltip as the button aria-label", () => {
  const { result } = mountItem(definedNavigationConfigFor("day", "previous"));
  expect(result.getByLabelText(m.command_open_previous())).toBeTruthy();
});

it("uses a custom tooltip as the button aria-label", () => {
  const { result } = mountItem({ ...definedNavigationConfigFor("day", "next"), tooltip: "Jump back" });
  expect(result.getByLabelText("Jump back")).toBeTruthy();
});
```

- [ ] **Step 3: Run both test files to verify the new expectations fail**

Run: `npx vitest run src/views/toolbar-items/button/ButtonItem.test.ts src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.test.ts`
Expected: FAIL — "renders no chevron when the label is cleared" and "falls back to the tooltip text when the icon is cleared" fail, because the resolver fallback still supplies the chevron and the icon.

- [ ] **Step 4: Read the config directly in `ButtonItem.vue`**

Delete the `appearance`, `icon`, `label`, and `tooltip` computeds (lines 38-41) and drop `resolveButtonAppearance` from the import on line 20, leaving `import type { ButtonAction, ButtonConfig, ButtonLevel } from "../button-config";`. Also drop the now-unused `computed` import if nothing else in the file uses it (it does not).

Replace the template:

```vue
<template>
  <UiButton flat :tooltip="config.tooltip || undefined" @click="onClick" @auxclick.middle.prevent="onClick">
    <UiIcon v-if="config.icon" :name="config.icon" />
    <span v-if="config.label">{{ config.label }}</span>
    <span v-else-if="!config.icon">{{ config.tooltip }}</span>
  </UiButton>
</template>
```

`|| undefined` keeps an emptied tooltip from leaving `aria-label=""` on the button.

- [ ] **Step 5: Read the config directly in `DefinedNavigationItem.vue`**

Delete the `appearance`, `icon`, `label`, and `tooltip` computeds (lines 32-34) and change line 16 to `import type { DefinedNavigationConfig } from "../defined-navigation-config";`. Keep the `computed` import — `candidates` still uses it.

Replace the template's `UiButton`:

```vue
<UiButton
  flat
  :tooltip="config.tooltip || undefined"
  :disabled="candidates.length === 0"
  :data-direction="config.direction"
  @click="(event: MouseEvent) => navigate(config.direction, event)"
  @auxclick.middle.prevent="(event: MouseEvent) => navigate(config.direction, event)"
>
    <UiIcon v-if="config.icon" :name="config.icon" />
    <span v-if="config.label">{{ config.label }}</span>
    <span v-else-if="!config.icon">{{ config.tooltip }}</span>
  </UiButton>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/views/`
Expected: PASS.

- [ ] **Step 7: Repair `e2e-journeys`**

These fixtures are pinned at `"version": 4` and will never re-run the migration, so their bare configs would now render nothing and every e2e selector that finds those buttons by tooltip would fail. Add the appearance each action resolves to, matching `resolveButtonAppearance` exactly.

In `e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json`, add these keys to each item's `config` object, beside its existing `action`:

| item id                                | add                                                   |
| -------------------------------------- | ----------------------------------------------------- |
| `e3c4d5f6-3a4b-4c7d-9e8f-0a1b2c3d4e5f` | `"icon": "crosshair", "tooltip": "Pick a date"`       |
| `f4d5e6a7-4b5c-4d8e-8f9a-1b2c3d4e5f6a` | `"label": "Today", "tooltip": "Today"`                |
| `a9d0e1f2-0c1d-4e2f-9a3b-4c5d6e7f8a9b` | `"label": "This week", "tooltip": "This week"`        |
| `a5e6f7b8-5c6d-4e9f-9a0b-2c3d4e5f6a7b` | `"icon": "chevrons-left", "tooltip": "Previous year"` |
| `b6f7a8c9-6d7e-4f0a-8b1c-3d4e5f6a7b8c` | `"icon": "chevron-left", "tooltip": "Previous month"` |
| `d8b9c0e1-8f9a-4b2c-8d3e-5f6a7b8c9d0e` | `"icon": "chevron-right", "tooltip": "Next month"`    |
| `e9c0d1f2-9a0b-4c3d-9e4f-6a7b8c9d0e1f` | `"icon": "chevrons-right", "tooltip": "Next year"`    |

For example, the first one becomes:

```json
{
  "id": "e3c4d5f6-3a4b-4c7d-9e8f-0a1b2c3d4e5f",
  "key": "button",
  "config": {
    "action": { "type": "pick-date", "mode": "navigate", "levels": ["day"] },
    "icon": "crosshair",
    "tooltip": "Pick a date"
  }
}
```

Preserve the file's existing indentation and key order; only add keys.

- [ ] **Step 8: Repair `e2e-defined-nav`**

In `e2e/fixtures/e2e-defined-nav/.obsidian/plugins/journals/data.json`, the single `defined-navigation` item `b3c4d5e6-2f3a-4b4c-8d5e-6f7a8b9c0d1e` (`target: "day"`, `direction: "previous"`) gains:

```json
        "label": "‹",
        "tooltip": "Open previous note"
```

- [ ] **Step 9: Verify the fixtures still parse**

Run: `python3 -c "import json; [json.load(open(p)) for p in ['e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json','e2e/fixtures/e2e-defined-nav/.obsidian/plugins/journals/data.json']]"`
Expected: no output, exit 0.

- [ ] **Step 10: Commit**

```bash
git add src/views/toolbar-items/button/ui/ButtonItem.vue src/views/toolbar-items/button/ButtonItem.test.ts src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.vue src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.test.ts e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json e2e/fixtures/e2e-defined-nav/.obsidian/plugins/journals/data.json
git commit -m "feat(views): render toolbar item appearance from its config"
```

---

### Task 4: The shared appearance rows

**Files:**

- Modify: `src/ui/icons.ts:16`
- Modify: `messages/en.json:1033`
- Create: `src/views/toolbar-items/ui/ToolbarAppearanceRows.vue`
- Test: `src/views/toolbar-items/ui/ToolbarAppearanceRows.test.ts`

**Interfaces:**

- Consumes: `ToolbarItemAppearance` from Task 1.
- Produces: `ToolbarAppearanceRows` with props `{ value: ToolbarItemAppearance; appearance: ToolbarItemAppearance; onChange: (patch: ToolbarItemAppearance) => void }`. `value` is the stored config (extra keys are ignored — a `ButtonConfig` may be passed whole). `appearance` is what the current action resolves to. `onChange` receives a partial patch of the three fields only.

- [ ] **Step 1: Add the reset icon**

In `src/ui/icons.ts`, add to the `action` group:

```ts
    reset: "rotate-ccw",
```

- [ ] **Step 2: Add the message**

In `messages/en.json`, insert alphabetically between `view_toolbar_appearance_label_label` and `view_toolbar_appearance_tooltip_label`:

```json
  "view_toolbar_appearance_reset": "Reset to default",
```

- [ ] **Step 3: Compile the messages**

Run: `npm run compile:i18n`
Expected: success. `src/i18n/paraglide` is git-ignored; do not stage it.

- [ ] **Step 4: Write the failing test**

Create `src/views/toolbar-items/ui/ToolbarAppearanceRows.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { InputSuggestService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";

import ToolbarAppearanceRows from "./ToolbarAppearanceRows.vue";

import type { ToolbarItemAppearance } from "../appearance";

function mountRows(
  value: ToolbarItemAppearance,
  appearance: ToolbarItemAppearance,
  onChange: (patch: ToolbarItemAppearance) => void,
) {
  const container = new Container();
  container.register(InputSuggestService).useValue(new FakeInputSuggestService() as unknown as InputSuggestService);
  return render(ToolbarAppearanceRows, {
    props: { value, appearance, onChange },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

// Inputs render in order: icon, label, tooltip. So do the reset buttons.
const seeded: ToolbarItemAppearance = { icon: "crosshair", tooltip: "Pick a date" };

const resetButtons = (): HTMLElement[] => screen.getAllByRole("button", { name: m.view_toolbar_appearance_reset() });

afterEach(() => cleanup());

describe("ToolbarAppearanceRows", () => {
  it("shows the stored icon in the icon field", () => {
    mountRows(seeded, seeded, vi.fn());
    const [iconInput] = screen.getAllByRole("textbox");
    expect((iconInput as HTMLInputElement).value).toBe("crosshair");
  });

  it("emits the typed icon", async () => {
    const onChange = vi.fn();
    mountRows(seeded, seeded, onChange);
    const [iconInput] = screen.getAllByRole("textbox");
    await userEvent.clear(iconInput);
    await userEvent.type(iconInput, "star");
    expect(onChange).toHaveBeenLastCalledWith({ icon: "star" });
  });

  it("emits an empty icon when the icon field is emptied", async () => {
    const onChange = vi.fn();
    mountRows(seeded, seeded, onChange);
    const [iconInput] = screen.getAllByRole("textbox");
    await userEvent.clear(iconInput);
    expect(onChange).toHaveBeenLastCalledWith({ icon: "" });
  });

  it("emits the typed label", async () => {
    const onChange = vi.fn();
    mountRows(seeded, seeded, onChange);
    const [, labelInput] = screen.getAllByRole("textbox");
    await userEvent.type(labelInput, "Now");
    expect(onChange).toHaveBeenLastCalledWith({ label: "Now" });
  });

  it("emits the typed tooltip", async () => {
    const onChange = vi.fn();
    mountRows({ icon: "crosshair" }, { icon: "crosshair" }, onChange);
    const [, , tooltipInput] = screen.getAllByRole("textbox");
    await userEvent.type(tooltipInput, "Go");
    expect(onChange).toHaveBeenLastCalledWith({ tooltip: "Go" });
  });

  it("disables the reset control while the value matches the default", () => {
    mountRows(seeded, seeded, vi.fn());
    expect((resetButtons()[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables the reset control for a field that is unset and has no default", () => {
    mountRows(seeded, seeded, vi.fn());
    expect((resetButtons()[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables the reset control once the value differs from the default", () => {
    mountRows({ ...seeded, icon: "star" }, seeded, vi.fn());
    expect((resetButtons()[0] as HTMLButtonElement).disabled).toBe(false);
  });

  it("enables the reset control when the value has been cleared", () => {
    mountRows({ ...seeded, icon: "" }, seeded, vi.fn());
    expect((resetButtons()[0] as HTMLButtonElement).disabled).toBe(false);
  });

  it("restores the default when the reset control is pressed", async () => {
    const onChange = vi.fn();
    mountRows({ ...seeded, icon: "star" }, seeded, onChange);
    await userEvent.click(resetButtons()[0]);
    expect(onChange).toHaveBeenLastCalledWith({ icon: "crosshair" });
  });

  it("restores the current action's default rather than the stored one", async () => {
    const onChange = vi.fn();
    mountRows(
      { icon: "chevron-right", tooltip: "Next month" },
      { icon: "chevron-left", tooltip: "Previous month" },
      onChange,
    );
    await userEvent.click(resetButtons()[0]);
    expect(onChange).toHaveBeenLastCalledWith({ icon: "chevron-left" });
  });

  it("empties a field whose default is unset when reset is pressed", async () => {
    const onChange = vi.fn();
    mountRows({ ...seeded, label: "Mine" }, seeded, onChange);
    await userEvent.click(resetButtons()[1]);
    expect(onChange).toHaveBeenLastCalledWith({ label: "" });
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npx vitest run src/views/toolbar-items/ui/ToolbarAppearanceRows.test.ts`
Expected: FAIL — cannot resolve `./ToolbarAppearanceRows.vue`.

- [ ] **Step 6: Write the component**

Create `src/views/toolbar-items/ui/ToolbarAppearanceRows.vue`:

```vue
<script setup lang="ts">
import { m } from "@/i18n";
import { icons } from "@/ui/icons";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconSuggest from "@/ui/UiIconSuggest.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

import type { ToolbarItemAppearance } from "../appearance";

type AppearanceField = keyof ToolbarItemAppearance;

const props = defineProps<{
  value: ToolbarItemAppearance;
  appearance: ToolbarItemAppearance;
  onChange: (patch: ToolbarItemAppearance) => void;
}>();

// An action with no default for a field resolves it to undefined while the stored value is
// "", so both sides are normalized — otherwise reset would never settle into its disabled state.
const isDefault = (field: AppearanceField): boolean => (props.value[field] ?? "") === (props.appearance[field] ?? "");

const set = (field: AppearanceField, next: string | undefined): void => props.onChange({ [field]: next ?? "" });

const reset = (field: AppearanceField): void => set(field, props.appearance[field]);
</script>

<template>
  <UiSettingRow>
    <template #name>{{ m.common_label_icon() }}</template>
    <UiIconSuggest
      :model-value="value.icon ?? ''"
      @update:model-value="(next: string | undefined) => set('icon', next)"
    />
    <UiIconButton
      :icon="icons.action.reset"
      :tooltip="m.view_toolbar_appearance_reset()"
      :disabled="isDefault('icon')"
      @click="reset('icon')"
    />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_appearance_label_label() }}</template>
    <UiTextInput
      :model-value="value.label ?? ''"
      @update:model-value="(next: string | undefined) => set('label', next)"
    />
    <UiIconButton
      :icon="icons.action.reset"
      :tooltip="m.view_toolbar_appearance_reset()"
      :disabled="isDefault('label')"
      @click="reset('label')"
    />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_appearance_tooltip_label() }}</template>
    <UiTextInput
      :model-value="value.tooltip ?? ''"
      @update:model-value="(next: string | undefined) => set('tooltip', next)"
    />
    <UiIconButton
      :icon="icons.action.reset"
      :tooltip="m.view_toolbar_appearance_reset()"
      :disabled="isDefault('tooltip')"
      @click="reset('tooltip')"
    />
  </UiSettingRow>
</template>
```

No `:placeholder` anywhere — the field shows the value itself, which is the entire point of the change.

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run src/views/toolbar-items/ui/ToolbarAppearanceRows.test.ts`
Expected: PASS.

- [ ] **Step 8: Typecheck and lint**

Run: `npm run check:types && npm run check:lint`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add src/ui/icons.ts messages/en.json src/views/toolbar-items/ui/ToolbarAppearanceRows.vue src/views/toolbar-items/ui/ToolbarAppearanceRows.test.ts
git commit -m "feat(views): add shared toolbar appearance rows with reset"
```

---

### Task 5: Wire both config editors to the shared rows

**Files:**

- Modify: `src/views/toolbar-items/button/ui/ButtonItemConfig.vue:1-19,86-109`
- Modify: `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItemConfig.vue:1-30`
- Test: `src/views/toolbar-items/button/ButtonItemConfig.test.ts:47-93`
- Test: `src/views/toolbar-items/defined-navigation/DefinedNavigationItemConfig.test.ts:59-104`

**Interfaces:**

- Consumes: `ToolbarAppearanceRows` from Task 4.
- Produces: both editors delegate their icon/label/tooltip rows; their own tests keep only the action-specific rows (mode, levels, journal, target, direction).

- [ ] **Step 1: Delete the relocated tests from `ButtonItemConfig.test.ts`**

Remove the four top-level `it` blocks at lines 47-81 ("emits onChange with the new icon…", "…new label…", "…new tooltip…", "clears the field (sets undefined) when input is emptied") and the whole `describe("default display", …)` block at lines 83-93. Their replacements live in `ToolbarAppearanceRows.test.ts`. Drop any import left unused by the deletion (`icons` becomes unused; `m` is still used elsewhere in the file — check before removing).

- [ ] **Step 2: Delete the relocated tests from `DefinedNavigationItemConfig.test.ts`**

Remove the six `it` blocks at lines 59-104 ("emits onChange with the new icon…", "…new label…", "…new tooltip…", "clears the label (sets undefined)…", "shows the chevron as the label-field placeholder", "shows the default tooltip as the tooltip-field placeholder"). Drop `m` from the imports if nothing else uses it.

- [ ] **Step 3: Add a test that each editor renders the shared rows**

The relocated coverage must not simply vanish — each editor still owes proof that it wires the rows to its own resolver. Append to `src/views/toolbar-items/button/ButtonItemConfig.test.ts`:

```ts
it("shows the action's seeded icon in the icon field", () => {
  mountConfig(buttonConfigFor({ type: "pick-date", mode: "navigate", levels: ["day"] }), vi.fn());
  const [iconInput] = screen.getAllByRole("textbox");
  expect((iconInput as HTMLInputElement).value).toBe(icons.action.pickDate);
});

it("emits the full config when an appearance field changes", async () => {
  const onChange = vi.fn();
  mountConfig(baseConfig, onChange);
  const [iconInput] = screen.getAllByRole("textbox");
  await userEvent.type(iconInput, "star");
  expect(onChange).toHaveBeenLastCalledWith({ ...baseConfig, icon: "star" });
});
```

adding `buttonConfigFor` to the import from `./button-config` and keeping `icons` imported. And to `src/views/toolbar-items/defined-navigation/DefinedNavigationItemConfig.test.ts`:

```ts
it("shows the direction's seeded label in the label field", () => {
  mountConfig(definedNavigationConfigFor("day", "next"), vi.fn());
  const [, labelInput] = screen.getAllByRole("textbox");
  expect((labelInput as HTMLInputElement).value).toBe("›");
});

it("emits the full config when an appearance field changes", async () => {
  const onChange = vi.fn();
  const config = definedNavigationConfigFor("day", "next");
  mountConfig(config, onChange);
  const [, labelInput] = screen.getAllByRole("textbox");
  await userEvent.clear(labelInput);
  expect(onChange).toHaveBeenLastCalledWith({ ...config, label: "" });
});
```

adding `import { definedNavigationConfigFor } from "./defined-navigation-config";`.

- [ ] **Step 4: Run both files to verify the new tests fail**

Run: `npx vitest run src/views/toolbar-items/button/ButtonItemConfig.test.ts src/views/toolbar-items/defined-navigation/DefinedNavigationItemConfig.test.ts`
Expected: FAIL — the icon field still renders `""` with the value as a placeholder, so the value assertions fail.

- [ ] **Step 5: Wire `ButtonItemConfig.vue`**

Replace the three appearance `UiSettingRow`s (lines 86-109) with:

```vue
<ToolbarAppearanceRows :value="config" :appearance="appearance" :on-change="update" />
```

Add `import ToolbarAppearanceRows from "../../ui/ToolbarAppearanceRows.vue";` and remove the now-unused `UiIconSuggest` and `UiTextInput` imports. Keep `UiDropdown`, `UiSettingRow`, and `UiToggleGroup` — the action rows still use them. Keep the `appearance` computed, and replace its comment (lines 31-32) with one that explains what it is now for:

```ts
// What the current action would look like — the source the per-field reset restores from.
const appearance = computed(() => resolveButtonAppearance(props.config.action));
```

`update` already has the signature the rows need: `(patch: Partial<ButtonConfig>) => void`, and `ToolbarItemAppearance` is assignable to `Partial<ButtonConfig>`.

- [ ] **Step 6: Wire `DefinedNavigationItemConfig.vue`**

Replace its three appearance `UiSettingRow`s with the same line, add the import (`../../ui/ToolbarAppearanceRows.vue`), and remove the unused `UiIconSuggest` / `UiTextInput` imports. Keep `UiDropdown` and `UiSettingRow`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/views/`
Expected: PASS.

- [ ] **Step 8: Run the full gate**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all clean.

- [ ] **Step 9: Commit**

```bash
git add src/views/toolbar-items/button/ui/ButtonItemConfig.vue src/views/toolbar-items/button/ButtonItemConfig.test.ts src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItemConfig.vue src/views/toolbar-items/defined-navigation/DefinedNavigationItemConfig.test.ts
git commit -m "refactor(views): share the toolbar appearance rows between item editors"
```

---

### Task 6: Documentation and end-to-end verification

**Files:**

- Modify: `docs/manual-testing-checklist-v3.md` (Views section)

**Interfaces:**

- Consumes: everything above.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the manual checklist rows**

In the Views section of `docs/manual-testing-checklist-v3.md`, following the formatting of the rows already there, add:

- Add a toolbar button from the "Pick a date" preset, clear its icon, and confirm the button renders without one after closing the editor.
- Press the icon field's reset control and confirm the crosshair returns.

- [ ] **Step 2: Run the e2e suites that touch the repaired fixtures**

Run: `npm run test:e2e:integration`
Expected: PASS. `e2e/integration/re-enable.e2e.ts` uses `e2e-journeys`.

- [ ] **Step 3: Run the journeys suite**

Run: `npm run build && npx wdio run ./wdio.conf.mts --suite journeys`
Expected: PASS, except the two `commands.e2e.ts` connect-note failures that predate this work and have been stale since the `971a8c27` DatePicker refactor. If anything else fails, the fixture repair in Task 3 is wrong — compare the failing selector against the table in that task.

- [ ] **Step 4: Commit**

```bash
git add docs/manual-testing-checklist-v3.md
git commit -m "docs: note the toolbar appearance reset in the manual checklist"
```

---

## Self-Review

**Spec coverage**

| Spec section                                                                                          | Task                                                          |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `buttonConfigFor` / `definedNavigationConfigFor` beside their resolvers                               | Task 1                                                        |
| `ToolbarItemAppearance` replaces the two local appearance types                                       | Task 1                                                        |
| Seeding at `button-item.ts`, `defined-navigation-item.ts`, `default-view.ts`; `v3-to-v4.ts` unchanged | Task 2                                                        |
| Render sites read the config, `:tooltip="… \|\| undefined"`                                           | Task 3                                                        |
| `summary` keeps using the resolver                                                                    | Task 2, Step 3                                                |
| Two stale fixtures repaired                                                                           | Task 3, Steps 7-8                                             |
| Editor shows values, no placeholders                                                                  | Task 4, Step 6                                                |
| Reset control always visible, disabled when unchanged, normalized comparison                          | Task 4                                                        |
| `icons.action.reset`, `view_toolbar_appearance_reset`                                                 | Task 4, Steps 1-3                                             |
| Three rows become one component                                                                       | Tasks 4-5                                                     |
| Accepted edge (all three cleared)                                                                     | Task 3, Step 1 — the tooltip-text fallback is kept and tested |
| Testing plan                                                                                          | Tasks 1, 3, 4, 5                                              |
| Manual checklist                                                                                      | Task 6                                                        |

**Type consistency**

`ToolbarItemAppearance` is defined once in Task 1 and used with the same field names (`icon`, `label`, `tooltip`) in Tasks 4 and 5. `buttonConfigFor(action)` and `definedNavigationConfigFor(target, direction)` keep their signatures across Tasks 2, 3, and 5. The `ToolbarAppearanceRows` prop names (`value`, `appearance`, `onChange`) match between its definition in Task 4 and both call sites in Task 5.
