# Theme color variables by role — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each color field in settings offer only the Obsidian CSS variables suited to it — a text-color field stops listing `background-primary`, a background field stops listing `text-faint`.

**Architecture:** `src/ui/theme-colors.ts` stops being a flat name array and becomes a list of variables each tagged `text`, `background`, or `border`. Four _field roles_ (`text`, `background`, `border`, `fill`) each map to an ordered list of tags they accept. `UiColorSettingsPicker` takes a required `role` prop, asks `themeColorGroupsFor(role)` for its options, and renders `<optgroup>`s only when the result spans more than one tag.

**Tech Stack:** Vue 3.5 SFCs (`<script setup>`, props destructure), Vitest + `@testing-library/vue` + `user-event`, Paraglide JS for i18n, ESLint + `vue-tsc`.

**Spec:** `docs/superpowers/specs/2026-07-30-theme-color-roles-design.md`

## Global Constraints

- Never add `eslint-disable` comments. Fix the code instead.
- `no-non-null-assertion` is ON in production code, OFF in tests. Use `.at(n) ?? fallback` or `?.` rather than `!`.
- `src/i18n/paraglide` is **generated** by `npm run compile:i18n` and is git-ignored. Edit `messages/*.json` only; never stage `src/i18n/paraglide`.
- **Never call `m.*()` at module scope.** `initLocale` runs during plugin `onload`, so a module-scope call freezes to English. Labels must stay wrapped in arrow functions that are invoked at render time — this is why the existing file stores `() => m.ui_theme_color_text_normal()` rather than the string.
- New copy follows §A of `docs/2026-07-13-ux-text-audit.md`: sentence case, en-US.
- Tests are colocated `*.test.ts`, use `@testing-library/vue` with `user-event` (never `@vue/test-utils`, never test-only `data-*` attributes), assert observable outcomes, and cover **one behavior per test** — no "and"/comma-list test names. Express scope with nested `describe()` blocks.
- No `Co-Authored-By` trailer in commit messages. Commit to the current branch (`v3-ai`); do not create a branch.
- Gates before each commit: `npm test`, `npm run check:types`, `npm run check:lint`. These are **npm** scripts, not pnpm.

---

## File Structure

| File                                            | Responsibility                                                                                                                          | Task |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `src/ui/theme-colors.ts`                        | The tagged variable table, the field-role → tag map, and `themeColorGroupsFor` / `themeColorLabel`. Pure data + pure functions, no Vue. | 1    |
| `src/ui/theme-colors.test.ts`                   | _Create._ The tagging and filtering rules — which variable names each field role offers, in which group order.                          | 1    |
| `messages/en.json`                              | Adds `ui_theme_color_group_label`; drops the two `*_rgb` labels.                                                                        | 1    |
| `messages/{de,es,fr,it,ja,ko,pt,ru,uk,zh}.json` | Drop the two `*_rgb` labels.                                                                                                            | 1    |
| `src/ui/UiColorSettingsPicker.vue`              | The `role` prop, `<optgroup>` rendering, and the out-of-role fallback option.                                                           | 2    |
| `src/ui/UiColorSettingsPicker.test.ts`          | The rendering contract: grouping, labels, fallback selectability.                                                                       | 2    |
| 8 call sites (see Task 2)                       | Each declares its field role.                                                                                                           | 2    |
| `docs/manual-testing-checklist-v3.md`           | §12 gains role-filtering checks.                                                                                                        | 3    |

The test split is by responsibility, not duplication: `theme-colors.test.ts` owns _which variables belong to which role_ (pure rules, cheap to enumerate exhaustively), `UiColorSettingsPicker.test.ts` owns _how the picker renders and preserves a value_ (needs a DOM).

---

### Task 1: Tag theme colors with roles

`theme-colors.ts` gains the tagged table and the new API. The picker is **not** touched in this task — `THEME_COLOR_NAMES` stays exported (now derived, 30 entries instead of 32), so everything keeps compiling and the tree stays green.

**Files:**

- Modify: `src/ui/theme-colors.ts` (full rewrite, 81 lines)
- Create: `src/ui/theme-colors.test.ts`
- Modify: `messages/en.json`
- Modify: `messages/de.json`, `es.json`, `fr.json`, `it.json`, `ja.json`, `ko.json`, `pt.json`, `ru.json`, `uk.json`, `zh.json`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces, all from `src/ui/theme-colors.ts`:
  - `export type ThemeColorTag = "background" | "border" | "text"`
  - `export type ThemeColorFieldRole = "text" | "background" | "border" | "fill"`
  - `export interface ThemeColorGroup { readonly tag: ThemeColorTag; readonly names: readonly string[] }`
  - `export function themeColorGroupsFor(role: ThemeColorFieldRole): readonly ThemeColorGroup[]`
  - `export function themeColorLabel(name: string): string` — unchanged signature
  - `export const THEME_COLOR_NAMES: readonly string[]` — kept this task, deleted in Task 2
  - `m.ui_theme_color_group_label({ group })` where `group` is a `ThemeColorTag`

---

- [ ] **Step 1: Add the group-heading message to `messages/en.json`**

Insert immediately after the `"ui_color_theme_variable_label"` entry, matching the existing `ui_color_kind_label` match-block shape:

```json
  "ui_theme_color_group_label": [
    {
      "declarations": ["input group"],
      "selectors": ["group"],
      "match": {
        "group=text": "Text",
        "group=background": "Background",
        "group=border": "Border"
      }
    }
  ],
```

Only `en.json` gets the new key. The other ten locales fall back to English until someone runs `npm run translate:i18n`, which needs a Google API key.

- [ ] **Step 2: Delete the two RGB labels from all eleven locale files**

`--background-modifier-error-rgb` and `--background-modifier-success-rgb` hold bare RGB triples (`255, 82, 82`), so `var(--background-modifier-error-rgb)` is invalid in `color:`, `background-color:` and `border-color:` alike. The variables are being dropped, so their labels lose their only call site.

```bash
node -e '
const fs = require("fs");
const keys = ["ui_theme_color_background_modifier_error_rgb", "ui_theme_color_background_modifier_success_rgb"];
for (const file of fs.readdirSync("messages")) {
  const path = `messages/${file}`;
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  let hit = false;
  for (const key of keys) if (key in data) { delete data[key]; hit = true; }
  if (hit) fs.writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}
'
npx prettier --write "messages/*.json"
npm run compile:i18n
```

- [ ] **Step 3: Write the failing test**

Create `src/ui/theme-colors.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { themeColorGroupsFor, type ThemeColorFieldRole } from "./theme-colors";

function namesFor(role: ThemeColorFieldRole): string[] {
  return themeColorGroupsFor(role).flatMap((group) => [...group.names]);
}

describe("themeColorGroupsFor", () => {
  describe("text fields", () => {
    it("offers a text variable", () => {
      expect(namesFor("text")).toContain("text-normal");
    });

    it("omits a background variable", () => {
      expect(namesFor("text")).not.toContain("background-primary");
    });

    it("omits a border variable", () => {
      expect(namesFor("text")).not.toContain("background-modifier-border");
    });

    it("returns a single group", () => {
      expect(themeColorGroupsFor("text")).toHaveLength(1);
    });
  });

  describe("background fields", () => {
    it("offers a background variable", () => {
      expect(namesFor("background")).toContain("background-primary");
    });

    it("omits a text variable", () => {
      expect(namesFor("background")).not.toContain("text-faint");
    });

    it("returns a single group", () => {
      expect(themeColorGroupsFor("background")).toHaveLength(1);
    });
  });

  describe("border fields", () => {
    it("offers a border variable", () => {
      expect(namesFor("border")).toContain("background-modifier-border-focus");
    });

    it("offers a text variable", () => {
      expect(namesFor("border")).toContain("text-accent");
    });

    it("omits a background variable", () => {
      expect(namesFor("border")).not.toContain("background-primary");
    });

    it("lists the border group before the text group", () => {
      expect(themeColorGroupsFor("border").map((group) => group.tag)).toEqual(["border", "text"]);
    });
  });

  describe("fill fields", () => {
    it("offers a text variable", () => {
      expect(namesFor("fill")).toContain("text-accent");
    });

    it("offers a background variable", () => {
      expect(namesFor("fill")).toContain("background-secondary");
    });

    it("omits a border variable", () => {
      expect(namesFor("fill")).not.toContain("background-modifier-border");
    });

    it("lists the text group before the background group", () => {
      expect(themeColorGroupsFor("fill").map((group) => group.tag)).toEqual(["text", "background"]);
    });
  });

  describe("variables whose name prefix contradicts their role", () => {
    it("offers the selection fill to a background field", () => {
      expect(namesFor("background")).toContain("text-selection");
    });

    it("offers the highlight fill to a background field", () => {
      expect(namesFor("background")).toContain("text-highlight-bg");
    });

    it("withholds the selection fill from a text field", () => {
      expect(namesFor("text")).not.toContain("text-selection");
    });

    it("withholds the border stroke from a background field", () => {
      expect(namesFor("background")).not.toContain("background-modifier-border-hover");
    });
  });

  describe("variables that are not colors", () => {
    it("offers the error RGB triple to no field", () => {
      const roles: ThemeColorFieldRole[] = ["text", "background", "border", "fill"];
      expect(roles.flatMap(namesFor)).not.toContain("background-modifier-error-rgb");
    });

    it("offers the success RGB triple to no field", () => {
      const roles: ThemeColorFieldRole[] = ["text", "background", "border", "fill"];
      expect(roles.flatMap(namesFor)).not.toContain("background-modifier-success-rgb");
    });
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run src/ui/theme-colors.test.ts`
Expected: FAIL — `themeColorGroupsFor` is not exported from `./theme-colors`.

- [ ] **Step 5: Rewrite `src/ui/theme-colors.ts`**

Replace the whole file. Note that every `label` stays an arrow function — see the module-scope locale constraint above.

```ts
import { m } from "@/i18n";

export type ThemeColorTag = "background" | "border" | "text";

export type ThemeColorFieldRole = "text" | "background" | "border" | "fill";

export interface ThemeColorGroup {
  readonly tag: ThemeColorTag;
  readonly names: readonly string[];
}

interface ThemeColor {
  readonly name: string;
  readonly tag: ThemeColorTag;
  readonly label: () => string;
}

// The tag is what the variable is *for*, hand-assigned rather than derived from the name,
// because the prefixes lie in both directions: --text-selection and --text-highlight-bg are
// fills, and every --background-modifier-border* is a stroke. Obsidian's own
// --background-modifier-{error,success}-rgb are bare RGB triples, unusable as var() colors,
// so they are absent entirely.
const THEME_COLORS: readonly ThemeColor[] = [
  { name: "background-primary", tag: "background", label: () => m.ui_theme_color_background_primary() },
  { name: "background-primary-alt", tag: "background", label: () => m.ui_theme_color_background_primary_alt() },
  { name: "background-secondary", tag: "background", label: () => m.ui_theme_color_background_secondary() },
  { name: "background-secondary-alt", tag: "background", label: () => m.ui_theme_color_background_secondary_alt() },
  { name: "background-modifier-hover", tag: "background", label: () => m.ui_theme_color_background_modifier_hover() },
  {
    name: "background-modifier-active-hover",
    tag: "background",
    label: () => m.ui_theme_color_background_modifier_active_hover(),
  },
  { name: "background-modifier-border", tag: "border", label: () => m.ui_theme_color_background_modifier_border() },
  {
    name: "background-modifier-border-hover",
    tag: "border",
    label: () => m.ui_theme_color_background_modifier_border_hover(),
  },
  {
    name: "background-modifier-border-focus",
    tag: "border",
    label: () => m.ui_theme_color_background_modifier_border_focus(),
  },
  { name: "background-modifier-error", tag: "background", label: () => m.ui_theme_color_background_modifier_error() },
  {
    name: "background-modifier-error-hover",
    tag: "background",
    label: () => m.ui_theme_color_background_modifier_error_hover(),
  },
  {
    name: "background-modifier-success",
    tag: "background",
    label: () => m.ui_theme_color_background_modifier_success(),
  },
  {
    name: "background-modifier-message",
    tag: "background",
    label: () => m.ui_theme_color_background_modifier_message(),
  },
  { name: "interactive-normal", tag: "background", label: () => m.ui_theme_color_interactive_normal() },
  { name: "interactive-hover", tag: "background", label: () => m.ui_theme_color_interactive_hover() },
  { name: "interactive-accent", tag: "background", label: () => m.ui_theme_color_interactive_accent() },
  { name: "interactive-accent-hover", tag: "background", label: () => m.ui_theme_color_interactive_accent_hover() },
  { name: "text-normal", tag: "text", label: () => m.ui_theme_color_text_normal() },
  { name: "text-muted", tag: "text", label: () => m.ui_theme_color_text_muted() },
  { name: "text-faint", tag: "text", label: () => m.ui_theme_color_text_faint() },
  { name: "text-on-accent", tag: "text", label: () => m.ui_theme_color_text_on_accent() },
  { name: "text-on-accent-inverted", tag: "text", label: () => m.ui_theme_color_text_on_accent_inverted() },
  { name: "text-success", tag: "text", label: () => m.ui_theme_color_text_success() },
  { name: "text-warning", tag: "text", label: () => m.ui_theme_color_text_warning() },
  { name: "text-error", tag: "text", label: () => m.ui_theme_color_text_error() },
  { name: "text-accent", tag: "text", label: () => m.ui_theme_color_text_accent() },
  { name: "text-accent-hover", tag: "text", label: () => m.ui_theme_color_text_accent_hover() },
  { name: "text-selection", tag: "background", label: () => m.ui_theme_color_text_selection() },
  { name: "text-highlight-bg", tag: "background", label: () => m.ui_theme_color_text_highlight_bg() },
  { name: "caret-color", tag: "text", label: () => m.ui_theme_color_caret_color() },
];

// Tags a field of each role accepts, in the order they are shown. A border reads well in an
// accent or status color — Obsidian draws its own focus rings with --interactive-accent — and a
// decorative mark has no inherent ink-or-surface nature, so those two roles span two tags.
const ROLE_TAGS: Record<ThemeColorFieldRole, readonly ThemeColorTag[]> = {
  text: ["text"],
  background: ["background"],
  border: ["border", "text"],
  fill: ["text", "background"],
};

const LABELS = new Map(THEME_COLORS.map((color) => [color.name, color.label]));

export const THEME_COLOR_NAMES: readonly string[] = THEME_COLORS.map((color) => color.name);

export function themeColorGroupsFor(role: ThemeColorFieldRole): readonly ThemeColorGroup[] {
  return ROLE_TAGS[role].map((tag) => ({
    tag,
    names: THEME_COLORS.filter((color) => color.tag === tag).map((color) => color.name),
  }));
}

// A previously stored variable that is not a known theme color round-trips as its raw name.
export function themeColorLabel(name: string): string {
  return (LABELS.get(name) ?? (() => name))();
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/ui/theme-colors.test.ts`
Expected: PASS, 20 tests.

- [ ] **Step 7: Run the full gates**

```bash
npm test && npm run check:types && npm run check:lint && npm run check:i18n
```

Expected: all pass. `UiColorSettingsPicker.test.ts` still passes untouched — the picker reads `THEME_COLOR_NAMES`, which still exists, and none of its assertions reference a dropped variable.

- [ ] **Step 8: Commit**

```bash
git add src/ui/theme-colors.ts src/ui/theme-colors.test.ts messages/
git commit -m "feat(ui): tag theme color variables by role"
```

---

### Task 2: Filter the picker by field role

**Files:**

- Modify: `src/ui/UiColorSettingsPicker.vue`
- Modify: `src/ui/UiColorSettingsPicker.test.ts`
- Modify: `src/ui/theme-colors.ts` — delete the now-unused `THEME_COLOR_NAMES` export
- Modify (one attribute each): `src/decorations/settings/ui/StyleColor.vue`, `StyleIcon.vue`, `StyleBackground.vue`, `StyleBorderSide.vue`, `StyleShape.vue`, `StyleCorner.vue`, `src/code-blocks/nav/settings/ui/EditNavBlockRowModal.vue`, `src/notes-calendar/appearance/ui/AppearanceBlock.vue`

**Interfaces:**

- Consumes from Task 1: `themeColorGroupsFor`, `themeColorLabel`, `ThemeColorFieldRole`, and `m.ui_theme_color_group_label({ group })`.
- Produces: `UiColorSettingsPicker` with a **required** `role: ThemeColorFieldRole` prop. Required rather than defaulted so a future ninth call site is a type error until it declares its role.

---

- [ ] **Step 1: Write the failing tests**

Replace `src/ui/UiColorSettingsPicker.test.ts` with the following. The `mount` helper gains a `role` parameter defaulting to `"text"`, which keeps every pre-existing case valid — they all use `text-accent`, `text-normal`, or an unknown variable.

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import type { ColorSettings } from "@/decorations";
import { m } from "@/i18n";

import type { ThemeColorFieldRole } from "./theme-colors";
import UiColorSettingsPicker from "./UiColorSettingsPicker.vue";

afterEach(() => cleanup());

function lastEmitted(emitted: ReturnType<typeof render>["emitted"]): ColorSettings | undefined {
  const events = emitted<[ColorSettings]>("update:modelValue");
  return events.at(-1)?.[0];
}

function mount(initial: ColorSettings, role: ThemeColorFieldRole = "text") {
  return render(UiColorSettingsPicker, { props: { modelValue: initial, role } });
}

function themeDropdown(): HTMLSelectElement {
  return screen.getByRole<HTMLSelectElement>("combobox", { name: m.ui_color_theme_variable_label() });
}

describe("UiColorSettingsPicker", () => {
  describe("kind selection", () => {
    it("emits a transparent value when switched to transparent", async () => {
      const { emitted } = mount({ type: "custom", color: "#ff0000" });
      await userEvent.selectOptions(screen.getByRole("combobox"), "transparent");
      expect(lastEmitted(emitted)).toEqual({ type: "transparent" });
    });

    it("emits a theme value with an empty name when switched to theme", async () => {
      const { emitted } = mount({ type: "transparent" });
      await userEvent.selectOptions(screen.getByRole("combobox"), "theme");
      expect(lastEmitted(emitted)).toEqual({ type: "theme", name: "" });
    });

    it("emits a custom value with a default color when switched to custom", async () => {
      const { emitted } = mount({ type: "transparent" });
      await userEvent.selectOptions(screen.getByRole("combobox"), "custom");
      expect(lastEmitted(emitted)).toEqual({ type: "custom", color: "#000000" });
    });
  });

  describe("theme variant", () => {
    it("emits the selected theme variable name when chosen from the dropdown", async () => {
      const { emitted } = mount({ type: "theme", name: "" });
      await userEvent.selectOptions(themeDropdown(), "text-accent");
      expect(lastEmitted(emitted)).toEqual({ type: "theme", name: "text-accent" });
    });

    it("shows the friendly label for a known theme variable option", () => {
      mount({ type: "theme", name: "" });
      const option = screen.getByRole<HTMLOptionElement>("option", { name: m.ui_theme_color_text_normal() });
      expect(option.value).toBe("text-normal");
    });

    it("keeps a previously stored variable selectable even when it is not a known theme color", () => {
      mount({ type: "theme", name: "my-custom-var" });
      expect(themeDropdown().value).toBe("my-custom-var");
    });

    describe("field role", () => {
      it("omits a variable outside the field's role", () => {
        mount({ type: "theme", name: "" }, "text");
        expect(screen.queryByRole("option", { name: m.ui_theme_color_background_primary() })).toBeNull();
      });

      it("offers a variable matching the field's role", () => {
        mount({ type: "theme", name: "" }, "background");
        const option = screen.getByRole<HTMLOptionElement>("option", {
          name: m.ui_theme_color_background_primary(),
        });
        expect(option.value).toBe("background-primary");
      });

      it("renders no group headings for a single-tag role", () => {
        mount({ type: "theme", name: "" }, "text");
        expect(screen.queryAllByRole("group")).toHaveLength(0);
      });

      it("renders a heading for each tag of a two-tag role", () => {
        mount({ type: "theme", name: "" }, "border");
        expect(screen.getByRole("group", { name: m.ui_theme_color_group_label({ group: "border" }) })).toBeTruthy();
      });

      it("keeps a stored variable selected even when the field's role excludes it", () => {
        mount({ type: "theme", name: "background-primary" }, "text");
        expect(themeDropdown().value).toBe("background-primary");
      });

      it("labels a stored variable the field's role excludes with its friendly name", () => {
        mount({ type: "theme", name: "background-primary" }, "text");
        const option = screen.getByRole<HTMLOptionElement>("option", {
          name: m.ui_theme_color_background_primary(),
        });
        expect(option.value).toBe("background-primary");
      });
    });
  });

  describe("custom variant", () => {
    it("emits an updated color when a new color is set", () => {
      const { emitted } = mount({ type: "custom", color: "#000000" });
      const input = document.querySelector<HTMLInputElement>('input[type="color"]')!;
      input.value = "#abcdef";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      expect(lastEmitted(emitted)).toEqual({ type: "custom", color: "#abcdef" });
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/UiColorSettingsPicker.test.ts`
Expected: FAIL — the `field role` cases fail because the picker still renders every variable regardless of `role`.

- [ ] **Step 3: Update the picker**

In `src/ui/UiColorSettingsPicker.vue`, replace the import and the `themeColorNames` line at the top of `<script setup>`:

```ts
import { themeColorGroupsFor, themeColorLabel, type ThemeColorFieldRole } from "./theme-colors";
import UiColorPicker from "./UiColorPicker.vue";
import UiDropdown from "./UiDropdown.vue";

const { role } = defineProps<{ role: ThemeColorFieldRole }>();
const model = defineModel<ColorSettings>({ required: true });

const groups = computed(() => themeColorGroupsFor(role));
const offered = computed(() => new Set(groups.value.flatMap((group) => [...group.names])));
```

The `kind`, `themeName`, and `customColor` computeds are unchanged. Replace the `<UiDropdown>` block inside `<template v-if="model.type === 'theme'">` with:

```vue
<UiDropdown v-model="themeName" class="ui-color-settings-picker__theme" :aria-label="m.ui_color_theme_variable_label()">
        <option value="">{{ m.ui_color_theme_variable_label() }}</option>
        <template v-if="groups.length > 1">
          <optgroup
            v-for="group of groups"
            :key="group.tag"
            :label="m.ui_theme_color_group_label({ group: group.tag })"
          >
            <option v-for="colorName of group.names" :key="colorName" :value="colorName">
              {{ themeColorLabel(colorName) }}
            </option>
          </optgroup>
        </template>
        <template v-else>
          <option v-for="colorName of groups[0]?.names ?? []" :key="colorName" :value="colorName">
            {{ themeColorLabel(colorName) }}
          </option>
        </template>
        <option v-if="themeName && !offered.has(themeName)" :value="themeName">
          {{ themeColorLabel(themeName) }}
        </option>
      </UiDropdown>
```

The trailing `v-if` is the widened escape hatch. It previously read `!themeColorNames.includes(themeName)` ("not a known theme color") and now reads `!offered.has(themeName)` ("not offered by _this_ field"), so one branch covers a variable the plugin never knew, a dropped `*-rgb` entry, and a known variable this role excludes. Rendering it through `themeColorLabel` is what makes a known-but-excluded variable read as "Primary background" rather than `background-primary`.

The `<style scoped>` block is unchanged.

- [ ] **Step 4: Add the `role` attribute to all eight call sites**

Each is a single attribute on an existing `<UiColorSettingsPicker>` tag.

`src/decorations/settings/ui/StyleColor.vue` — `<UiColorSettingsPicker v-model="color" role="text" />`

`src/decorations/settings/ui/StyleIcon.vue` — `<UiColorSettingsPicker v-model="color" role="text" />`
(the glyph is rendered with `color:` in `DecorationIcon.vue`, so it is ink)

`src/decorations/settings/ui/StyleBackground.vue` — `<UiColorSettingsPicker v-model="color" role="background" />`

`src/decorations/settings/ui/StyleBorderSide.vue` — `<UiColorSettingsPicker v-model="color" role="border" />`

`src/decorations/settings/ui/StyleShape.vue` — `<UiColorSettingsPicker v-model="color" role="fill" />`
(`DecorationShape.vue` feeds the same stored value to `background-color` for circles and squares but to `border-*` for the four triangles, so the CSS property says nothing about intent here)

`src/decorations/settings/ui/StyleCorner.vue` — `<UiColorSettingsPicker v-model="color" role="fill" />`
(`DecorationCorner.vue` draws the wedge with `border-top`/`border-left` as a rendering trick, not as a border)

`src/code-blocks/nav/settings/ui/EditNavBlockRowModal.vue` — two pickers, around lines 167 and 171:

```vue
<UiSettingRow :name="m.common_label_text_color()">
      <UiColorSettingsPicker v-model="color" role="text" />
    </UiSettingRow>

<UiSettingRow :name="m.common_label_background_color()">
      <UiColorSettingsPicker v-model="background" role="background" />
    </UiSettingRow>
```

`src/notes-calendar/appearance/ui/AppearanceBlock.vue` — four pickers:

```vue
<UiColorSettingsPicker :model-value="slice.state.today.color" role="text" @update:model-value="setTodayColor" />
...
<UiColorSettingsPicker
  :model-value="slice.state.today.background"
  role="background"
  @update:model-value="setTodayBackground"
/>
...
<UiColorSettingsPicker :model-value="slice.state.active.color" role="text" @update:model-value="setActiveColor" />
...
<UiColorSettingsPicker
  :model-value="slice.state.active.background"
  role="background"
  @update:model-value="setActiveBackground"
/>
```

Let `npx prettier --write` settle the final line wrapping rather than hand-formatting.

- [ ] **Step 5: Delete the now-unused export**

In `src/ui/theme-colors.ts`, remove:

```ts
export const THEME_COLOR_NAMES: readonly string[] = THEME_COLORS.map((color) => color.name);
```

`themeColorGroupsFor` is now the only way out of the module. Confirm nothing else referenced it:

```bash
grep -rn "THEME_COLOR_NAMES" src/
```

Expected: no output.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/ui/UiColorSettingsPicker.test.ts src/ui/theme-colors.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the full gates**

```bash
npm test && npm run check:types && npm run check:lint
```

Expected: all pass. `vue-tsc` is what proves all eight call sites declare a role; a missed one is a missing-required-prop error. The nine `Style*.test.ts` files and `EditNavBlockRowModal.test.ts` mount their own components rather than the picker directly, and none asserts on the theme option list, so none needs changing — if one fails, read it before editing it.

- [ ] **Step 8: Commit**

```bash
git add src/ui/UiColorSettingsPicker.vue src/ui/UiColorSettingsPicker.test.ts src/ui/theme-colors.ts \
  src/decorations/settings/ui/ src/code-blocks/nav/settings/ui/EditNavBlockRowModal.vue \
  src/notes-calendar/appearance/ui/AppearanceBlock.vue
git commit -m "feat(settings): offer only role-appropriate theme colors per color field"
```

---

### Task 3: Record the manual checks

No e2e is added: the change alters dropdown contents only, with no host API and no runtime wiring behind it, and the four decoration-style modals already have e2e coverage that these unit tests do not duplicate. The role filtering is worth a human eye once, so it goes in the manual checklist.

**Files:**

- Modify: `docs/manual-testing-checklist-v3.md` (§12 "Decorations — styles", currently lines 706–742)

**Interfaces:** none.

---

- [ ] **Step 1: Add the checks**

Insert after the existing `- [ ] **Color mode: custom** (hex/rgb) → uses the literal color.` line (currently line 737):

```markdown
- [ ] **color** (text) style, theme mode → the variable list holds only text variables;
      `Primary background` is absent.
- [ ] **background** style, theme mode → the variable list holds only background variables;
      `Normal text` is absent, `Selected text background` is present.
- [ ] **border** style, theme mode → the list is split under **Border** and **Text**
      headings.
- [ ] **shape** style, theme mode → the list is split under **Text** and **Background**
      headings, with no border variables.
- [ ] A decoration saved before this change with an out-of-role variable (e.g. a text color
      of `Primary background`) → reopening it still shows that variable selected under its
      friendly label, and the cell renders exactly as before.
```

- [ ] **Step 2: Commit**

The working tree already contains an unrelated modification to this file from before this work. Stage only if that edit is yours to include; otherwise commit this file alone and mention the pre-existing change.

```bash
git add docs/manual-testing-checklist-v3.md
git commit -m "docs: check theme color role filtering by hand"
```

---

## Self-Review

**Spec coverage.** Role tags → Task 1 Step 5. Dropped RGB entries → Task 1 Steps 2 and 5. Field-role map and group order → Task 1 Step 5 (`ROLE_TAGS`). Eight call-site roles → Task 2 Step 4. Required `role` prop → Task 2 Step 3. `themeColorGroupsFor` and single-vs-multi-group rendering → Task 1 Step 5 and Task 2 Step 3. Widened out-of-role fallback → Task 2 Step 3, tested in Task 2 Step 1. New `ui_theme_color_group_label` and deleted `*_rgb` labels → Task 1 Steps 1–2. Every test named in the spec appears, split across the two test files by responsibility. Manual checklist → Task 3.

**Deviation from the spec, deliberate:** the spec put all tests in `UiColorSettingsPicker.test.ts`. The plan puts the _tagging and filtering rules_ in `theme-colors.test.ts` and the _rendering contract_ in the picker test. This is what lets Task 1 land green and independently reviewable without the required-prop change rippling through eight call sites in the same commit, and it avoids asserting pure data rules through a DOM render. Coverage is the same; nothing is duplicated.

**Placeholders:** none — every code step carries the literal content.

**Type consistency:** `ThemeColorFieldRole`, `ThemeColorTag`, `ThemeColorGroup`, `themeColorGroupsFor`, `themeColorLabel`, and `m.ui_theme_color_group_label({ group })` are spelled identically in Task 1's definitions, Task 2's consumption, and both test files. `THEME_COLOR_NAMES` is created in Task 1 Step 5 and deleted in Task 2 Step 5 — the only intentionally short-lived name.
