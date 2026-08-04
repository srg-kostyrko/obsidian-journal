# Decoration Style Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the decoration style form with a canvas where you click a region of a cell preview to place a style there, and fix the defaults that make a freshly added style invisible.

**Architecture:** A decoration holds at most one style of each type — a cap that already exists in the editor and existed in v2 — so it is a record of six optional slots rather than a list. A layer strip gates which regions of one large cell preview accept a click; the cell always renders the whole decoration. Because each layer has at most one occupant, "selected" means "the active layer's occupant", and no separate selection state is needed except which border side is being edited.

**Tech Stack:** Vue 3 SFCs with `<script setup>`, vee-validate + valibot via `@vee-validate/valibot`, ts-pattern for union dispatch, vitest + `@testing-library/vue` + `@testing-library/user-event`, paraglide i18n, WebdriverIO for e2e.

**Design:** [docs/superpowers/specs/2026-08-04-decoration-style-canvas-design.md](../specs/2026-08-04-decoration-style-canvas-design.md)

## Global Constraints

- **No schema change.** `src/decorations/config.ts` is not modified by any task. `styles` stays `JournalDecorationStyle[]`; only the values a _new_ style arrives with change.
- **Tests are colocated** as `<name>.test.ts` beside the implementation file. No top-level `mocks/` or `fixtures/` folders.
- **Vue component tests use `@testing-library/vue` + `@testing-library/user-event`.** No `@vue/test-utils`, no CSS-class queries, and no test-only `data-*` attributes — query by role and accessible name. Every clickable canvas region is a real `<button type="button">` with an `aria-label`, which is what makes this possible.
- **One behaviour per test.** No "and" or comma-lists in test names.
- **Never use `eslint-disable` comments.** Fix the code instead.
- **`no-non-null-assertion` is on in production code** (off in tests). Use `.at(i) ?? fallback`, never `arr[i]!`.
- **Discriminated-union dispatch uses `match().with().exhaustive()`** from ts-pattern, not `switch`.
- **Authored icons come from `src/ui/icons.ts`** (grouped `icons.*`), never bare string literals. The _stored_ icon name inside a decoration is user data and stays a free-form string.
- **New i18n strings** go in `messages/en.json` following `docs/2026-07-13-ux-text-audit.md` §A (sentence case, en-US). Run `npm run compile:i18n` after editing. **Never stage `src/i18n/paraglide`** — it is generated and git-ignored.
- **Prefer field initializers** (`readonly #x = inject(...)`) over constructor-body assignment.
- **Inline `defineProps<{...}>()`** in SFCs; no named `XxxProps` interface unless reused.
- **Do not wrap `m.*()` in `computed()`** unless the arguments include reactive data — inline it in the template.
- **Modal fields wrap in `UiSettingRow`**; field errors go in the `#description` slot.
- Gates, run from the controller rather than a subagent (they background past a subagent's timeout): `npm run test`, `npm run check:types`, `npm run check:lint`, `npm run test:e2e`.

---

## File Structure

**Created**

| File                                                       | Responsibility                                                                                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/decorations/style-slots.ts`                           | Pure lookup of a style by type within a `styles` array. The only place that knows duplicates resolve to the last.                       |
| `src/decorations/style-slots.test.ts`                      | Its tests.                                                                                                                              |
| `src/decorations/settings/ui/use-style-slots.ts`           | Binds the lookup to a vee-validate field array — add, put, remove, occupancy. The only place that knows `styles` is stored as an array. |
| `src/decorations/settings/ui/use-style-slots.test.ts`      | Its tests.                                                                                                                              |
| `src/decorations/settings/ui/DecorationLayerStrip.vue`     | The six chips, their occupancy badges, and which layer is active.                                                                       |
| `src/decorations/settings/ui/DecorationLayerStrip.test.ts` | Its tests.                                                                                                                              |
| `src/decorations/settings/ui/DecorationCanvas.vue`         | Composes strip + preview cell + the active layer's region overlay + the inspector.                                                      |
| `src/decorations/settings/ui/DecorationCanvas.test.ts`     | Its tests.                                                                                                                              |
| `src/decorations/settings/ui/CanvasRegionWhole.vue`        | One region covering the cell (background) or the numeral (color).                                                                       |
| `src/decorations/settings/ui/CanvasRegionSlots.vue`        | The 3×3 mark slots, for shape and icon.                                                                                                 |
| `src/decorations/settings/ui/CanvasRegionSlots.test.ts`    | Its tests.                                                                                                                              |
| `src/decorations/settings/ui/CanvasRegionCorners.vue`      | The four corner regions.                                                                                                                |
| `src/decorations/settings/ui/CanvasRegionBorder.vue`       | The ring when linked, the four edges when per side.                                                                                     |
| `src/decorations/settings/ui/CanvasRegionBorder.test.ts`   | Its tests.                                                                                                                              |

**Modified**

| File                                                  | Change                                                                      |
| ----------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/decorations/defaults.ts`                         | Every style arrives with a visible theme color.                             |
| `src/decorations/defaults.test.ts`                    | Assertions move to resolved output.                                         |
| `src/decorations/settings/ui/StyleShape.vue`          | Loses its placement row.                                                    |
| `src/decorations/settings/ui/StyleIcon.vue`           | Loses its placement row.                                                    |
| `src/decorations/settings/ui/StyleCorner.vue`         | Loses its placement row.                                                    |
| `src/decorations/settings/ui/StyleBorder.vue`         | Becomes the linked/per-side control plus one side's fields.                 |
| `src/decorations/settings/ui/StyleBorderSide.vue`     | Loses its `show` row and the `v-if` gating its fields.                      |
| `src/decorations/settings/ui/EditDecorationModal.vue` | Two panes; the style list and `addStyleOptions` are replaced by the canvas. |
| `messages/en.json`                                    | Three new keys; `decoration_border_mode_label` rewords.                     |
| `CHANGELOG.md`                                        | A `Fixed` entry for the suppression bug.                                    |
| `e2e/journeys/decorations.ts`                         | One journey covering authoring through the canvas.                          |

**Deleted**

| File                                            | Reason                                     |
| ----------------------------------------------- | ------------------------------------------ |
| `src/decorations/settings/ui/StyleItem.vue`     | Its dispatch is the layer strip's job now. |
| `src/decorations/settings/ui/StyleItem.test.ts` | With it.                                   |

---

## Task 1: Style slot lookup

**Files:**

- Create: `src/decorations/style-slots.ts`
- Test: `src/decorations/style-slots.test.ts`

**Interfaces:**

- Consumes: `JournalDecorationStyle` from `./config`.
- Produces:
  - `type StyleSlotKey = JournalDecorationStyle["type"]`
  - `type StyleFor<K extends StyleSlotKey> = Extract<JournalDecorationStyle, { type: K }>`
  - `function slotIndex(styles: readonly JournalDecorationStyle[], type: StyleSlotKey): number` — `-1` when absent
  - `function slotOf<K extends StyleSlotKey>(styles: readonly JournalDecorationStyle[], type: K): StyleFor<K> | undefined`
  - `function occupiedSlots(styles: readonly JournalDecorationStyle[]): ReadonlySet<StyleSlotKey>`
  - `const STYLE_SLOT_KEYS: readonly StyleSlotKey[]` — display order for the strip

- [ ] **Step 1: Write the failing tests**

Create `src/decorations/style-slots.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { defaultStyle } from "./defaults";
import { occupiedSlots, slotIndex, slotOf } from "./style-slots";

import type { JournalDecorationStyle } from "./config";

describe("slotIndex", () => {
  it("finds the position of a style by its type", () => {
    const styles: JournalDecorationStyle[] = [defaultStyle("background"), defaultStyle("shape")];
    expect(slotIndex(styles, "shape")).toBe(1);
  });

  it("reports an absent type as -1", () => {
    expect(slotIndex([defaultStyle("background")], "icon")).toBe(-1);
  });

  // Unreachable from the editor and from v2, but a hand-edited data.json can hold duplicates.
  // The cascade resolves exclusive properties last-wins, so the editor agrees with it.
  it("resolves a duplicated type to the last occurrence", () => {
    const styles: JournalDecorationStyle[] = [
      { ...defaultStyle("corner"), placement: "top-left" },
      { ...defaultStyle("corner"), placement: "bottom-right" },
    ];
    expect(slotIndex(styles, "corner")).toBe(1);
  });
});

describe("slotOf", () => {
  it("returns the style occupying a slot", () => {
    const shape = defaultStyle("shape");
    expect(slotOf([defaultStyle("background"), shape], "shape")).toBe(shape);
  });

  it("returns undefined for an empty slot", () => {
    expect(slotOf([], "border")).toBeUndefined();
  });
});

describe("occupiedSlots", () => {
  it("reports every type present", () => {
    const styles = [defaultStyle("background"), defaultStyle("icon")];
    expect(occupiedSlots(styles)).toEqual(new Set(["background", "icon"]));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/decorations/style-slots.test.ts`
Expected: FAIL — `Failed to resolve import "./style-slots"`.

- [ ] **Step 3: Write the implementation**

Create `src/decorations/style-slots.ts`:

```ts
import type { JournalDecorationStyle } from "./config";

export type StyleSlotKey = JournalDecorationStyle["type"];

export type StyleFor<K extends StyleSlotKey> = Extract<JournalDecorationStyle, { type: K }>;

// Display order of the layer strip. Fills and strokes first, then the marks that sit on top.
export const STYLE_SLOT_KEYS: readonly StyleSlotKey[] = ["background", "color", "border", "shape", "icon", "corner"];

// A duplicated type resolves to the last, matching the cascade's last-wins rule for exclusive
// properties. Only a hand-edited data.json can produce one.
export function slotIndex(styles: readonly JournalDecorationStyle[], type: StyleSlotKey): number {
  return styles.findLastIndex((style) => style.type === type);
}

export function slotOf<K extends StyleSlotKey>(
  styles: readonly JournalDecorationStyle[],
  type: K,
): StyleFor<K> | undefined {
  const index = slotIndex(styles, type);
  return index === -1 ? undefined : (styles.at(index) as StyleFor<K>);
}

export function occupiedSlots(styles: readonly JournalDecorationStyle[]): ReadonlySet<StyleSlotKey> {
  return new Set(styles.map((style) => style.type));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/decorations/style-slots.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/decorations/style-slots.ts src/decorations/style-slots.test.ts
git commit -m "feat(decorations): look up a decoration style by its slot"
```

---

## Task 2: Visible defaults

Fixes the correctness bug: under the last-wins cascade a transparent default does not sit invisibly, it _cancels_ a broader scope's value. This task ships user-visible value on its own.

**Files:**

- Modify: `src/decorations/defaults.ts:13-59`
- Modify: `src/decorations/defaults.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Consumes: `resolveCell` from `./resolve-cell` — existing code, unchanged by this plan.
- Produces: `defaultStyle(type)` returns styles whose resolved output is visible. Signature unchanged.

- [ ] **Step 1: Rewrite the failing tests**

Replace the whole of `src/decorations/defaults.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { defaultCondition, defaultStyle } from "./defaults";
import { resolveCell } from "./resolve-cell";

// Assertions go through resolveCell rather than reading the style object, because "renders
// something" is the behaviour. Reading defaultStyle().color would have passed against the
// transparent defaults this replaces.
describe("defaultStyle", () => {
  it("resolves a new background to a visible color", () => {
    expect(resolveCell([defaultStyle("background")]).background).toBe("var(--interactive-accent)");
  });

  it("resolves a new text color to something other than the inherited one", () => {
    expect(resolveCell([defaultStyle("color")]).textColor).toBe("var(--text-accent)");
  });

  it("resolves a new border to a visible stroke on every side", () => {
    const { border } = resolveCell([defaultStyle("border")]);
    expect(border).toEqual({
      top: "1px solid var(--text-accent)",
      right: "1px solid var(--text-accent)",
      bottom: "1px solid var(--text-accent)",
      left: "1px solid var(--text-accent)",
    });
  });

  it("resolves a new shape to a visible mark", () => {
    const { marks } = resolveCell([defaultStyle("shape")]);
    expect(marks.center_bottom.at(0)?.color).toEqual({ type: "theme", name: "text-accent" });
  });

  it("resolves a new corner to a visible triangle", () => {
    const { corners } = resolveCell([defaultStyle("corner")]);
    expect(corners.at(0)?.color).toEqual({ type: "theme", name: "text-accent" });
  });

  it("gives a new icon a glyph to render", () => {
    expect(defaultStyle("icon").icon).not.toBe("");
  });

  it("resolves a new icon to a visible color", () => {
    const { marks } = resolveCell([defaultStyle("icon")]);
    expect(marks.center_top.at(0)?.color).toEqual({ type: "theme", name: "text-accent" });
  });

  it("defaults a shape style to a circle at the bottom", () => {
    const style = defaultStyle("shape");
    expect(style.shape).toBe("circle");
    expect(style.placement_y).toBe("bottom");
  });
});

describe("defaultCondition", () => {
  it("points a new offset condition at the interval's first day", () => {
    expect(defaultCondition("offset")).toEqual({ type: "offset", offset: 1 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/decorations/defaults.test.ts`
Expected: FAIL — background resolves to `"transparent"`, textColor to `"var(--text-normal)"`, border to `1px solid transparent` on `left` and `"none"` elsewhere.

- [ ] **Step 3: Write the implementation**

In `src/decorations/defaults.ts`, replace lines 13-20 (the color constants and `defaultBorderSide`):

```ts
// Every slot arrives visible. Under the last-wins cascade a transparent value is a declaration
// that cancels a broader scope's, not an absence, so an invisible default silently switches off
// a vault-wide rule. Theme variables rather than hex so a decoration follows the user's theme.
const accentFill: ColorSettings = { type: "theme", name: "interactive-accent" };
const accentInk: ColorSettings = { type: "theme", name: "text-accent" };
const defaultBorderSide = (): BorderSide => ({
  show: true,
  width: 1,
  color: accentInk,
  style: "solid",
});
```

Then replace the six `.with(...)` arms of `defaultStyle`:

```ts
    .with("background", () => ({ type: "background", color: accentFill }))
    .with("color", () => ({ type: "color", color: accentInk }))
    .with("border", () => ({
      type: "border",
      border: "uniform",
      left: defaultBorderSide(),
      right: defaultBorderSide(),
      top: defaultBorderSide(),
      bottom: defaultBorderSide(),
    }))
    .with("shape", () => ({
      type: "shape",
      size: 0.4,
      shape: "circle",
      color: accentInk,
      placement_x: "center",
      placement_y: "bottom",
    }))
    .with("corner", () => ({ type: "corner", placement: "top-left", color: accentInk }))
    .with("icon", () => ({
      type: "icon",
      // A stored icon name is user data typed into UiIconSuggest, so it stays a free-form
      // string rather than coming from src/ui/icons.ts.
      icon: "star",
      placement_x: "center",
      placement_y: "top",
      color: accentInk,
      size: 0.5,
    }))
```

`transparentColor` and `textNormalColor` are now unreferenced — delete both declarations, or `check:lint` will fail on the unused bindings. All four border sides now ship `show: true`, which also retires the mismatch where uniform mode edited `top` while the data set `left`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/decorations/defaults.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Check nothing downstream asserted the old defaults**

Run: `npx vitest run src/decorations`
Expected: PASS. If `EditDecorationModal.test.ts` or `DecorationPreview.test.ts` asserted a transparent default, re-point the assertion at the new value rather than restoring the old one.

- [ ] **Step 6: Add the changelog entry**

In `CHANGELOG.md`, under `## [Unreleased]` → `### Bug Fixes`, append:

```markdown
- Adding a background or corner to a decoration no longer silently cancels a vault-wide or shelf rule; new styles now arrive with a visible color instead of a transparent one.
```

- [ ] **Step 7: Commit**

```bash
git add src/decorations/defaults.ts src/decorations/defaults.test.ts CHANGELOG.md
git commit -m "fix(decorations): give every new style a visible color"
```

---

## Task 3: Slot binding composable

**Files:**

- Create: `src/decorations/settings/ui/use-style-slots.ts`
- Test: `src/decorations/settings/ui/use-style-slots.test.ts`

**Interfaces:**

- Consumes: `slotIndex`, `occupiedSlots`, `StyleSlotKey`, `StyleFor` from `../../style-slots`; `defaultStyle` from `../../defaults`.
- Produces: `useStyleSlots(name: string, current: () => readonly JournalDecorationStyle[])` returning
  - `get<K extends StyleSlotKey>(type: K): StyleFor<K> | undefined`
  - `put<K extends StyleSlotKey>(type: K, style: StyleFor<K>): void`
  - `add<K extends StyleSlotKey>(type: K): StyleFor<K>`
  - `remove(type: StyleSlotKey): void`
  - `occupied: ComputedRef<ReadonlySet<StyleSlotKey>>`

- [ ] **Step 1: Write the failing tests**

Create `src/decorations/settings/ui/use-style-slots.test.ts`:

```ts
import { cleanup, render } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationSchema, type JournalDecoration } from "@/decorations";

import { useStyleSlots } from "./use-style-slots";

afterEach(() => cleanup());

function mount(initial: JournalDecoration) {
  const exposed = {} as {
    values: JournalDecoration;
    slots: ReturnType<typeof useStyleSlots>;
  };
  const Host = defineComponent({
    setup() {
      const form = useForm<JournalDecoration>({
        initialValues: initial,
        validationSchema: toTypedSchema(decorationSchema),
      });
      exposed.values = form.values;
      exposed.slots = useStyleSlots("styles", () => form.values.styles);
      return () => h("div");
    },
  });
  render(Host);
  return exposed;
}

const empty: JournalDecoration = { mode: "and", conditions: [], styles: [] };

describe("useStyleSlots", () => {
  it("appends a style when its slot is empty", async () => {
    const host = mount({ ...empty });
    host.slots.add("shape");
    await Promise.resolve();
    expect(host.values.styles.map((s) => s.type)).toEqual(["shape"]);
  });

  it("replaces in place rather than appending when the slot is occupied", async () => {
    const host = mount({ ...empty });
    host.slots.add("shape");
    await Promise.resolve();
    const shape = host.slots.get("shape");
    if (shape === undefined) throw new Error("expected a shape");
    host.slots.put("shape", { ...shape, placement_x: "left" });
    await Promise.resolve();
    expect(host.values.styles).toHaveLength(1);
  });

  it("keeps the position of other styles when one is replaced", async () => {
    const host = mount({ ...empty });
    host.slots.add("background");
    host.slots.add("shape");
    await Promise.resolve();
    const shape = host.slots.get("shape");
    if (shape === undefined) throw new Error("expected a shape");
    host.slots.put("shape", { ...shape, placement_x: "left" });
    await Promise.resolve();
    expect(host.values.styles.map((s) => s.type)).toEqual(["background", "shape"]);
  });

  it("empties a slot on remove", async () => {
    const host = mount({ ...empty });
    host.slots.add("corner");
    await Promise.resolve();
    host.slots.remove("corner");
    await Promise.resolve();
    expect(host.values.styles).toEqual([]);
  });

  it("reports which slots are occupied", async () => {
    const host = mount({ ...empty });
    host.slots.add("icon");
    await Promise.resolve();
    expect(host.slots.occupied.value).toEqual(new Set(["icon"]));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/decorations/settings/ui/use-style-slots.test.ts`
Expected: FAIL — `Failed to resolve import "./use-style-slots"`.

- [ ] **Step 3: Write the implementation**

Create `src/decorations/settings/ui/use-style-slots.ts`:

```ts
import { useFieldArray } from "vee-validate";
import { computed, type ComputedRef } from "vue";

import { defaultStyle } from "../../defaults";
import { occupiedSlots, slotIndex, type StyleFor, type StyleSlotKey } from "../../style-slots";

import type { JournalDecorationStyle } from "../../config";

export interface StyleSlots {
  get: <K extends StyleSlotKey>(type: K) => StyleFor<K> | undefined;
  put: <K extends StyleSlotKey>(type: K, style: StyleFor<K>) => void;
  add: <K extends StyleSlotKey>(type: K) => StyleFor<K>;
  remove: (type: StyleSlotKey) => void;
  occupied: ComputedRef<ReadonlySet<StyleSlotKey>>;
}

// The only place that knows a decoration stores its styles as an array. Editing in place by
// index rather than rebuilding the array keeps the stored order, which is observable: a shape
// and an icon sharing one placement render in array order.
export function useStyleSlots(name: string, current: () => readonly JournalDecorationStyle[]): StyleSlots {
  const array = useFieldArray<JournalDecorationStyle>(name);

  function get<K extends StyleSlotKey>(type: K): StyleFor<K> | undefined {
    const index = slotIndex(current(), type);
    return index === -1 ? undefined : (current().at(index) as StyleFor<K>);
  }

  function put<K extends StyleSlotKey>(type: K, style: StyleFor<K>): void {
    const index = slotIndex(current(), type);
    if (index === -1) array.push(style);
    else array.update(index, style);
  }

  function add<K extends StyleSlotKey>(type: K): StyleFor<K> {
    const style = defaultStyle(type);
    put(type, style);
    return style;
  }

  function remove(type: StyleSlotKey): void {
    const index = slotIndex(current(), type);
    if (index !== -1) array.remove(index);
  }

  return { get, put, add, remove, occupied: computed(() => occupiedSlots(current())) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/decorations/settings/ui/use-style-slots.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/decorations/settings/ui/use-style-slots.ts src/decorations/settings/ui/use-style-slots.test.ts
git commit -m "feat(decorations): bind decoration style slots to the edit form"
```

---

## Task 4: Layer strip

**Files:**

- Create: `src/decorations/settings/ui/DecorationLayerStrip.vue`
- Test: `src/decorations/settings/ui/DecorationLayerStrip.test.ts`

**Interfaces:**

- Consumes: `STYLE_SLOT_KEYS`, `StyleSlotKey` from `../../style-slots`.
- Produces: `<DecorationLayerStrip v-model="activeLayer" :occupied="Set<StyleSlotKey>" />`. `defineModel<StyleSlotKey>()`. Each chip is a `<button type="button">` whose accessible name is `m.decoration_layer_chip_label({ type, state })`, with `aria-pressed` reflecting the active layer.

- [ ] **Step 1: Add the chip label key**

Occupancy goes in the accessible name rather than a `data-*` attribute: the Global Constraints forbid test-only `data-*` hooks, and putting the state in the name also tells a screen reader which layers hold something — today the dot would convey that visually only.

In `messages/en.json`, add:

```json
"decoration_layer_chip_label": [
  {
    "declarations": ["input type", "input state"],
    "selectors": ["type", "state"],
    "match": {
      "type=background,state=empty": "Background",
      "type=background,state=occupied": "Background, in use",
      "type=color,state=empty": "Color",
      "type=color,state=occupied": "Color, in use",
      "type=border,state=empty": "Border",
      "type=border,state=occupied": "Border, in use",
      "type=shape,state=empty": "Shape",
      "type=shape,state=occupied": "Shape, in use",
      "type=icon,state=empty": "Icon",
      "type=icon,state=occupied": "Icon, in use",
      "type=corner,state=empty": "Corner",
      "type=corner,state=occupied": "Corner, in use"
    }
  }
]
```

Run: `npm run compile:i18n`

- [ ] **Step 2: Write the failing tests**

Create `src/decorations/settings/ui/DecorationLayerStrip.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import type { StyleSlotKey } from "../../style-slots";

import DecorationLayerStrip from "./DecorationLayerStrip.vue";

afterEach(() => cleanup());

function renderStrip(modelValue: StyleSlotKey, occupied: StyleSlotKey[] = []) {
  return render(DecorationLayerStrip, { props: { modelValue, occupied: new Set(occupied) } });
}

describe("DecorationLayerStrip", () => {
  it("offers a chip for every style slot", () => {
    renderStrip("background");
    expect(screen.getAllByRole("button")).toHaveLength(6);
  });

  it("marks the active layer as pressed", () => {
    renderStrip("shape");
    expect(screen.getByRole("button", { name: "Shape" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("emits the chosen layer when a chip is clicked", async () => {
    const { emitted } = renderStrip("background");
    await userEvent.click(screen.getByRole("button", { name: "Corner" }));
    expect(emitted("update:modelValue")).toEqual([["corner"]]);
  });

  it("names an occupied chip as in use", () => {
    renderStrip("background", ["icon"]);
    expect(screen.getByRole("button", { name: "Icon, in use" })).toBeTruthy();
  });

  it("names an empty chip by its layer alone", () => {
    renderStrip("background", ["icon"]);
    expect(screen.getByRole("button", { name: "Corner" })).toBeTruthy();
  });
});
```

Note the third test queries `{ name: "Corner" }` while the corner slot is empty, so it keeps working — an occupied chip would be named "Corner, in use" and would not match.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/decorations/settings/ui/DecorationLayerStrip.test.ts`
Expected: FAIL — cannot resolve `./DecorationLayerStrip.vue`.

- [ ] **Step 4: Write the implementation**

Create `src/decorations/settings/ui/DecorationLayerStrip.vue`:

```vue
<script setup lang="ts">
import { m } from "@/i18n";

import { STYLE_SLOT_KEYS, type StyleSlotKey } from "../../style-slots";

defineProps<{ occupied: ReadonlySet<StyleSlotKey> }>();
const active = defineModel<StyleSlotKey>({ required: true });
</script>

<template>
  <div class="layer-strip">
    <button
      v-for="key of STYLE_SLOT_KEYS"
      :key="key"
      type="button"
      class="layer-chip"
      :aria-pressed="active === key"
      :aria-label="m.decoration_layer_chip_label({ type: key, state: occupied.has(key) ? 'occupied' : 'empty' })"
      @click="active = key"
    >
      {{ m.decoration_style_type_label({ type: key }) }}
      <span v-if="occupied.has(key)" class="layer-badge" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.layer-strip {
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-2-2);
}
.layer-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2-1);
  border-radius: var(--radius-l);
  padding: var(--size-2-1) var(--size-4-2);
}
.layer-chip[aria-pressed="true"] {
  background-color: var(--interactive-accent);
  color: var(--text-on-accent);
}
.layer-badge {
  width: var(--size-2-1);
  height: var(--size-2-1);
  border-radius: 50%;
  background-color: currentColor;
}
</style>
```

The visible label stays `decoration_style_type_label` so the chip reads the same as everywhere else; `aria-label` carries the longer name, and the dot is `aria-hidden` because the name already says it.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/decorations/settings/ui/DecorationLayerStrip.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/decorations/settings/ui/DecorationLayerStrip.vue src/decorations/settings/ui/DecorationLayerStrip.test.ts messages/en.json
git commit -m "feat(decorations): add the decoration layer strip"
```

---

## Task 5: Mark slot regions

**Files:**

- Create: `src/decorations/settings/ui/CanvasRegionSlots.vue`
- Test: `src/decorations/settings/ui/CanvasRegionSlots.test.ts`
- Modify: `messages/en.json`

**Interfaces:**

- Consumes: `Placement` from `../../resolve-cell`.
- Produces: `<CanvasRegionSlots :occupied="Placement | undefined" @choose="(placement: Placement) => void" />`. Nine `<button type="button">` laid out 3×3, each named `m.decoration_canvas_slot_label({ slot })`. Emits `choose` with the clicked placement whether the slot is empty or occupied — the parent decides between add and move, because only it knows whether the layer's slot is filled.

- [ ] **Step 1: Add the i18n key**

In `messages/en.json`, add:

```json
"decoration_canvas_slot_label": [
  {
    "declarations": ["input slot"],
    "selectors": ["slot"],
    "match": {
      "slot=left_top": "Top left",
      "slot=center_top": "Top center",
      "slot=right_top": "Top right",
      "slot=left_middle": "Middle left",
      "slot=center_middle": "Center",
      "slot=right_middle": "Middle right",
      "slot=left_bottom": "Bottom left",
      "slot=center_bottom": "Bottom center",
      "slot=right_bottom": "Bottom right"
    }
  }
]
```

Run: `npm run compile:i18n`

- [ ] **Step 2: Write the failing tests**

Create `src/decorations/settings/ui/CanvasRegionSlots.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import CanvasRegionSlots from "./CanvasRegionSlots.vue";

afterEach(() => cleanup());

describe("CanvasRegionSlots", () => {
  it("offers a region for every placement", () => {
    render(CanvasRegionSlots, { props: {} });
    expect(screen.getAllByRole("button")).toHaveLength(9);
  });

  it("emits the placement that was clicked", async () => {
    const { emitted } = render(CanvasRegionSlots, { props: {} });
    await userEvent.click(screen.getByRole("button", { name: "Bottom center" }));
    expect(emitted("choose")).toEqual([["center_bottom"]]);
  });

  it("marks the occupied placement as pressed", () => {
    render(CanvasRegionSlots, { props: { occupied: "left_top" } });
    expect(screen.getByRole("button", { name: "Top left" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("leaves the other placements unpressed", () => {
    render(CanvasRegionSlots, { props: { occupied: "left_top" } });
    expect(screen.getByRole("button", { name: "Center" }).getAttribute("aria-pressed")).toBe("false");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/decorations/settings/ui/CanvasRegionSlots.test.ts`
Expected: FAIL — cannot resolve `./CanvasRegionSlots.vue`.

- [ ] **Step 4: Write the implementation**

Create `src/decorations/settings/ui/CanvasRegionSlots.vue`:

```vue
<script setup lang="ts">
import { m } from "@/i18n";

import type { BorderSideName, Placement } from "../../resolve-cell";

defineProps<{ occupied?: Placement }>();
defineEmits<{ choose: [placement: Placement] }>();

const PLACEMENTS: readonly Placement[] = [
  "left_top",
  "center_top",
  "right_top",
  "left_middle",
  "center_middle",
  "right_middle",
  "left_bottom",
  "center_bottom",
  "right_bottom",
];
</script>

<template>
  <div class="slot-grid">
    <button
      v-for="placement of PLACEMENTS"
      :key="placement"
      type="button"
      class="slot"
      :aria-label="m.decoration_canvas_slot_label({ slot: placement })"
      :aria-pressed="occupied === placement"
      @click="$emit('choose', placement)"
    />
  </div>
</template>

<style scoped>
.slot-grid {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
}
.slot {
  border: 1px dashed var(--background-modifier-border);
  background-color: transparent;
  box-shadow: none;
}
.slot:hover {
  background-color: var(--background-modifier-hover);
}
.slot[aria-pressed="true"] {
  border: 2px solid var(--interactive-accent);
}
</style>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/decorations/settings/ui/CanvasRegionSlots.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/decorations/settings/ui/CanvasRegionSlots.vue src/decorations/settings/ui/CanvasRegionSlots.test.ts messages/en.json
git commit -m "feat(decorations): add the mark slot regions to the style canvas"
```

---

## Task 6: Whole-cell and corner regions

**Files:**

- Create: `src/decorations/settings/ui/CanvasRegionWhole.vue`
- Create: `src/decorations/settings/ui/CanvasRegionCorners.vue`
- Test: `src/decorations/settings/ui/CanvasRegionCorners.test.ts`

**Interfaces:**

- Produces:
  - `<CanvasRegionWhole :label="string" :occupied="boolean" @choose="() => void" />` — one button filling the cell.
  - `<CanvasRegionCorners :occupied="JournalDecorationCorner['placement'] | undefined" @choose="(placement) => void" />` — four buttons named by `m.decoration_corner_placement_label({ placement })`.

`CanvasRegionWhole` gets no test of its own — it is a single button with a label and a click, and a test would assert Vue's own behaviour. Its click path is covered through `DecorationCanvas.test.ts` in Task 8.

- [ ] **Step 1: Add the region label key**

Regions must not share an accessible name with the layer chip that reveals them, or `getByRole("button", { name: "Background" })` matches two elements and throws. The chips keep `decoration_style_type_label`; the whole-cell and ring regions get their own names.

In `messages/en.json`, add:

```json
"decoration_canvas_region_label": [
  {
    "declarations": ["input type"],
    "selectors": ["type"],
    "match": {
      "type=background": "Cell background",
      "type=color": "Cell text",
      "type=border": "Cell outline"
    }
  }
]
```

Run: `npm run compile:i18n`

The nine mark slots and the four corners need no such treatment — their names ("Bottom center", "Top left") collide with no chip, and slots and corners never render at the same time.

- [ ] **Step 2: Write the failing tests**

Create `src/decorations/settings/ui/CanvasRegionCorners.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import CanvasRegionCorners from "./CanvasRegionCorners.vue";

afterEach(() => cleanup());

describe("CanvasRegionCorners", () => {
  it("offers a region for every corner", () => {
    render(CanvasRegionCorners, { props: {} });
    expect(screen.getAllByRole("button")).toHaveLength(4);
  });

  it("emits the corner that was clicked", async () => {
    const { emitted } = render(CanvasRegionCorners, { props: {} });
    await userEvent.click(screen.getByRole("button", { name: "Bottom right" }));
    expect(emitted("choose")).toEqual([["bottom-right"]]);
  });

  it("marks the occupied corner as pressed", () => {
    render(CanvasRegionCorners, { props: { occupied: "top-right" } });
    expect(screen.getByRole("button", { name: "Top right" }).getAttribute("aria-pressed")).toBe("true");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/decorations/settings/ui/CanvasRegionCorners.test.ts`
Expected: FAIL — cannot resolve `./CanvasRegionCorners.vue`.

- [ ] **Step 4: Write both components**

Create `src/decorations/settings/ui/CanvasRegionWhole.vue`:

```vue
<script setup lang="ts">
defineProps<{ label: string; occupied: boolean }>();
defineEmits<{ choose: [] }>();
</script>

<template>
  <button type="button" class="whole-region" :aria-label="label" :aria-pressed="occupied" @click="$emit('choose')" />
</template>

<style scoped>
.whole-region {
  position: absolute;
  inset: 0;
  background-color: transparent;
  box-shadow: none;
  border: 1px dashed var(--background-modifier-border);
}
.whole-region:hover {
  background-color: var(--background-modifier-hover);
}
.whole-region[aria-pressed="true"] {
  border: 2px solid var(--interactive-accent);
}
</style>
```

Create `src/decorations/settings/ui/CanvasRegionCorners.vue`:

```vue
<script setup lang="ts">
import { m } from "@/i18n";

import type { JournalDecorationCorner } from "../../config";

type Placement = JournalDecorationCorner["placement"];

defineProps<{ occupied?: Placement }>();
defineEmits<{ choose: [placement: Placement] }>();

const PLACEMENTS: readonly Placement[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
</script>

<template>
  <div class="corner-regions">
    <button
      v-for="placement of PLACEMENTS"
      :key="placement"
      type="button"
      class="corner"
      :class="`corner-${placement}`"
      :aria-label="m.decoration_corner_placement_label({ placement })"
      :aria-pressed="occupied === placement"
      @click="$emit('choose', placement)"
    />
  </div>
</template>

<style scoped>
.corner-regions {
  position: absolute;
  inset: 0;
}
.corner {
  position: absolute;
  width: 33%;
  height: 33%;
  background-color: transparent;
  box-shadow: none;
  border: 1px dashed var(--background-modifier-border);
}
.corner:hover {
  background-color: var(--background-modifier-hover);
}
.corner[aria-pressed="true"] {
  border: 2px solid var(--interactive-accent);
}
.corner-top-left {
  top: 0;
  left: 0;
}
.corner-top-right {
  top: 0;
  right: 0;
}
.corner-bottom-left {
  bottom: 0;
  left: 0;
}
.corner-bottom-right {
  bottom: 0;
  right: 0;
}
</style>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/decorations/settings/ui/CanvasRegionCorners.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add src/decorations/settings/ui/CanvasRegionWhole.vue src/decorations/settings/ui/CanvasRegionCorners.vue src/decorations/settings/ui/CanvasRegionCorners.test.ts messages/en.json
git commit -m "feat(decorations): add the whole-cell and corner regions to the style canvas"
```

---

## Task 7: Border regions and modes

The one layer that can occupy several regions at once, because a border style carries four side objects rather than one placement field. In per-side mode a click therefore **adds** a side rather than moving one.

**Files:**

- Create: `src/decorations/settings/ui/CanvasRegionBorder.vue`
- Test: `src/decorations/settings/ui/CanvasRegionBorder.test.ts`
- Modify: `messages/en.json`

**Interfaces:**

- Consumes: `BorderSide`, `JournalDecorationBorder` from `../../config`.
- Produces: `<CanvasRegionBorder :border="JournalDecorationBorder | undefined" :active-side="BorderSideName" @choose-ring="() => void" @choose-side="(side: BorderSideName) => void" />`. Renders one ring button when `border?.border === "uniform"` or the slot is empty, four edge buttons otherwise.
- `BorderSideName` is **exported from `src/decorations/resolve-cell.ts`**, where it already exists as `keyof CellBorder` — add the `export` keyword to the existing declaration at line 54. Do not re-declare it in an SFC: a named type export from a `.vue` file is invisible to typescript-eslint, whose ambient `*.vue` shim declares only a default export, so importing one fails lint even though `vue-tsc` accepts it.

- [ ] **Step 1: Reword the mode labels**

In `messages/en.json`, change `decoration_border_mode_label`'s match values:

```json
"decoration_border_mode_label": [
  {
    "declarations": ["input mode"],
    "selectors": ["mode"],
    "match": { "mode=uniform": "Linked", "mode=different": "Per side" }
  }
]
```

Run: `npm run compile:i18n`

- [ ] **Step 2: Write the failing tests**

Create `src/decorations/settings/ui/CanvasRegionBorder.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { defaultStyle } from "../../defaults";

import CanvasRegionBorder from "./CanvasRegionBorder.vue";

afterEach(() => cleanup());

const linked = defaultStyle("border");
const perSide = { ...defaultStyle("border"), border: "different" as const };

describe("CanvasRegionBorder", () => {
  describe("when the slot is empty", () => {
    it("offers a single ring region", () => {
      render(CanvasRegionBorder, { props: { activeSide: "top" } });
      expect(screen.getAllByRole("button")).toHaveLength(1);
    });
  });

  describe("when linked", () => {
    it("offers a single ring region", () => {
      render(CanvasRegionBorder, { props: { border: linked, activeSide: "top" } });
      expect(screen.getAllByRole("button")).toHaveLength(1);
    });

    it("emits the ring when it is clicked", async () => {
      const { emitted } = render(CanvasRegionBorder, { props: { border: linked, activeSide: "top" } });
      await userEvent.click(screen.getByRole("button", { name: "Cell outline" }));
      expect(emitted("chooseRing")).toHaveLength(1);
    });
  });

  describe("when per side", () => {
    it("offers a region for every side", () => {
      render(CanvasRegionBorder, { props: { border: perSide, activeSide: "top" } });
      expect(screen.getAllByRole("button")).toHaveLength(4);
    });

    it("emits the side that was clicked", async () => {
      const { emitted } = render(CanvasRegionBorder, { props: { border: perSide, activeSide: "top" } });
      await userEvent.click(screen.getByRole("button", { name: "Bottom" }));
      expect(emitted("chooseSide")).toEqual([["bottom"]]);
    });

    it("marks a shown side as pressed", () => {
      const border = { ...perSide, left: { ...perSide.left, show: true } };
      render(CanvasRegionBorder, { props: { border, activeSide: "top" } });
      expect(screen.getByRole("button", { name: "Left" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("marks a hidden side as unpressed", () => {
      const border = { ...perSide, right: { ...perSide.right, show: false } };
      render(CanvasRegionBorder, { props: { border, activeSide: "top" } });
      expect(screen.getByRole("button", { name: "Right" }).getAttribute("aria-pressed")).toBe("false");
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/decorations/settings/ui/CanvasRegionBorder.test.ts`
Expected: FAIL — cannot resolve `./CanvasRegionBorder.vue`.

- [ ] **Step 4: Write the implementation**

Create `src/decorations/settings/ui/CanvasRegionBorder.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";

import type { JournalDecorationBorder } from "../../config";
import type { BorderSideName } from "../../resolve-cell";

const props = defineProps<{ border?: JournalDecorationBorder; activeSide: BorderSideName }>();
defineEmits<{ chooseRing: []; chooseSide: [side: BorderSideName] }>();

const SIDES: readonly BorderSideName[] = ["top", "right", "bottom", "left"];

// An empty slot shows the ring, so the first click creates a linked border — the common case.
const linked = computed(() => props.border === undefined || props.border.border === "uniform");
</script>

<template>
  <div class="border-regions">
    <button
      v-if="linked"
      type="button"
      class="ring"
      :aria-label="m.decoration_canvas_region_label({ type: 'border' })"
      :aria-pressed="border !== undefined"
      @click="$emit('chooseRing')"
    />
    <template v-else>
      <button
        v-for="side of SIDES"
        :key="side"
        type="button"
        class="edge"
        :class="[`edge-${side}`, { 'edge-active': side === activeSide }]"
        :aria-label="m.decoration_border_side_label({ side })"
        :aria-pressed="border?.[side].show === true"
        @click="$emit('chooseSide', side)"
      />
    </template>
  </div>
</template>

<style scoped>
.border-regions {
  position: absolute;
  inset: 0;
}
.ring {
  position: absolute;
  inset: calc(-1 * var(--size-2-2));
  background-color: transparent;
  box-shadow: none;
  border: 1px dashed var(--background-modifier-border);
}
.ring[aria-pressed="true"] {
  border: 2px solid var(--interactive-accent);
}
.edge {
  position: absolute;
  background-color: transparent;
  box-shadow: none;
  border: 1px dashed var(--background-modifier-border);
}
.edge[aria-pressed="true"] {
  border-color: var(--interactive-accent);
}
.edge-active {
  border: 2px solid var(--interactive-accent);
}
.edge-top,
.edge-bottom {
  left: 15%;
  right: 15%;
  height: var(--size-4-3);
}
.edge-top {
  top: calc(-1 * var(--size-2-2));
}
.edge-bottom {
  bottom: calc(-1 * var(--size-2-2));
}
.edge-left,
.edge-right {
  top: 15%;
  bottom: 15%;
  width: var(--size-4-3);
}
.edge-left {
  left: calc(-1 * var(--size-2-2));
}
.edge-right {
  right: calc(-1 * var(--size-2-2));
}
</style>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/decorations/settings/ui/CanvasRegionBorder.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/decorations/settings/ui/CanvasRegionBorder.vue src/decorations/settings/ui/CanvasRegionBorder.test.ts messages/en.json
git commit -m "feat(decorations): add the border regions to the style canvas"
```

---

## Task 8: The canvas

Composes everything and owns the interaction rules: click empty to create, click another region to move, and the border exception where a click adds a side.

**Files:**

- Create: `src/decorations/settings/ui/DecorationCanvas.vue`
- Test: `src/decorations/settings/ui/DecorationCanvas.test.ts`
- Modify: `messages/en.json`

**Interfaces:**

- Consumes: `useStyleSlots` (Task 3), `DecorationLayerStrip` (Task 4), `CanvasRegionSlots` (Task 5), `CanvasRegionWhole` + `CanvasRegionCorners` (Task 6), `CanvasRegionBorder` + `BorderSideName` (Task 7), `DecorationPreview` from `../../ui/DecorationPreview.vue`, the trimmed `Style*.vue` leaves (Task 9 trims them; this task consumes their current props, which do not change).
- Produces: `<DecorationCanvas name="styles" :styles="values.styles" />`. Owns `activeLayer` and `activeSide` refs. No emits — it writes through the form.

- [ ] **Step 1: Add the empty-state hint key**

In `messages/en.json`, add:

```json
"decoration_canvas_empty_hint": [
  {
    "declarations": ["input type"],
    "selectors": ["type"],
    "match": {
      "type=background": "Click the cell to add a background.",
      "type=color": "Click the number to set a text color.",
      "type=border": "Click the outline to add a border.",
      "type=shape": "Click a position to add a shape.",
      "type=icon": "Click a position to add an icon.",
      "type=corner": "Click a corner to add a triangle."
    }
  }
],
"decoration_canvas_remove_label": "Remove"
```

Run: `npm run compile:i18n`

- [ ] **Step 2: Write the failing tests**

Create `src/decorations/settings/ui/DecorationCanvas.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationSchema, type JournalDecoration } from "@/decorations";

import DecorationCanvas from "./DecorationCanvas.vue";

afterEach(() => cleanup());

function mount(styles: JournalDecoration["styles"] = []) {
  const exposed = {} as { values: JournalDecoration };
  const Host = defineComponent({
    setup() {
      const form = useForm<JournalDecoration>({
        initialValues: { mode: "and", conditions: [], styles },
        validationSchema: toTypedSchema(decorationSchema),
      });
      exposed.values = form.values;
      return () => h(DecorationCanvas, { name: "styles", styles: form.values.styles });
    },
  });
  render(Host);
  return exposed;
}

describe("DecorationCanvas", () => {
  it("creates a background when the empty cell is clicked", async () => {
    const host = mount();
    await userEvent.click(screen.getByRole("button", { name: "Cell background" }));
    expect(host.values.styles.map((s) => s.type)).toEqual(["background"]);
  });

  it("creates a shape at the position that was clicked", async () => {
    const host = mount();
    await userEvent.click(screen.getByRole("button", { name: "Shape" }));
    await userEvent.click(screen.getByRole("button", { name: "Top left" }));
    expect(host.values.styles.at(0)).toMatchObject({
      type: "shape",
      placement_x: "left",
      placement_y: "top",
    });
  });

  it("moves an existing shape rather than adding a second", async () => {
    const host = mount();
    await userEvent.click(screen.getByRole("button", { name: "Shape" }));
    await userEvent.click(screen.getByRole("button", { name: "Top left" }));
    await userEvent.click(screen.getByRole("button", { name: "Bottom right" }));
    expect(host.values.styles).toHaveLength(1);
  });

  it("places the moved shape at the new position", async () => {
    const host = mount();
    await userEvent.click(screen.getByRole("button", { name: "Shape" }));
    await userEvent.click(screen.getByRole("button", { name: "Top left" }));
    await userEvent.click(screen.getByRole("button", { name: "Bottom right" }));
    expect(host.values.styles.at(0)).toMatchObject({ placement_x: "right", placement_y: "bottom" });
  });

  it("moves an existing corner rather than adding a second", async () => {
    const host = mount();
    await userEvent.click(screen.getByRole("button", { name: "Corner" }));
    await userEvent.click(screen.getByRole("button", { name: "Top left" }));
    await userEvent.click(screen.getByRole("button", { name: "Bottom right" }));
    expect(host.values.styles).toHaveLength(1);
  });

  it("empties the slot when the layer is removed", async () => {
    const host = mount();
    await userEvent.click(screen.getByRole("button", { name: "Cell background" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(host.values.styles).toEqual([]);
  });

  it("shows a hint while the active layer is empty", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Icon" }));
    expect(screen.getByText("Click a position to add an icon.")).toBeTruthy();
  });

  it("only exposes the active layer's regions", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Corner" }));
    expect(screen.queryByRole("button", { name: "Middle left" })).toBeNull();
  });

  describe("border", () => {
    it("creates a linked border when the ring is clicked", async () => {
      const host = mount();
      await userEvent.click(screen.getByRole("button", { name: "Border" }));
      await userEvent.click(screen.getByRole("button", { name: "Cell outline" }));
      expect(host.values.styles.at(0)).toMatchObject({ type: "border", border: "uniform" });
    });

    it("switches the stored mode when per side is chosen", async () => {
      const host = mount();
      await userEvent.click(screen.getByRole("button", { name: "Border" }));
      await userEvent.click(screen.getByRole("button", { name: "Cell outline" }));
      await userEvent.click(screen.getByRole("radio", { name: "Per side" }));
      expect(host.values.styles.at(0)).toMatchObject({ border: "different" });
    });

    it("turns a hidden side on when its edge is clicked", async () => {
      const host = mount([
        {
          type: "border",
          border: "different",
          top: { show: false, width: 1, color: { type: "transparent" }, style: "solid" },
          right: { show: false, width: 1, color: { type: "transparent" }, style: "solid" },
          bottom: { show: false, width: 1, color: { type: "transparent" }, style: "solid" },
          left: { show: true, width: 1, color: { type: "theme", name: "text-accent" }, style: "solid" },
        },
      ]);
      await userEvent.click(screen.getByRole("button", { name: "Border, in use" }));
      await userEvent.click(screen.getByRole("button", { name: "Top" }));
      const border = host.values.styles.at(0);
      expect(border?.type === "border" && border.top.show).toBe(true);
    });

    it("empties the border slot when the last shown side is removed", async () => {
      const host = mount([
        {
          type: "border",
          border: "different",
          top: { show: false, width: 1, color: { type: "transparent" }, style: "solid" },
          right: { show: false, width: 1, color: { type: "transparent" }, style: "solid" },
          bottom: { show: false, width: 1, color: { type: "transparent" }, style: "solid" },
          left: { show: true, width: 1, color: { type: "theme", name: "text-accent" }, style: "solid" },
        },
      ]);
      await userEvent.click(screen.getByRole("button", { name: "Border, in use" }));
      await userEvent.click(screen.getByRole("button", { name: "Left" }));
      await userEvent.click(screen.getByRole("button", { name: "Remove" }));
      expect(host.values.styles).toEqual([]);
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/decorations/settings/ui/DecorationCanvas.test.ts`
Expected: FAIL — cannot resolve `./DecorationCanvas.vue`.

- [ ] **Step 4: Write the implementation**

Create `src/decorations/settings/ui/DecorationCanvas.vue`:

```vue
<script setup lang="ts">
import { match } from "ts-pattern";
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { icons } from "@/ui/icons";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { defaultStyle } from "../../defaults";
import DecorationPreview from "../../ui/DecorationPreview.vue";

import CanvasRegionBorder from "./CanvasRegionBorder.vue";
import CanvasRegionCorners from "./CanvasRegionCorners.vue";
import CanvasRegionSlots from "./CanvasRegionSlots.vue";
import CanvasRegionWhole from "./CanvasRegionWhole.vue";
import DecorationLayerStrip from "./DecorationLayerStrip.vue";
import StyleBackground from "./StyleBackground.vue";
import StyleBorder from "./StyleBorder.vue";
import StyleColor from "./StyleColor.vue";
import StyleCorner from "./StyleCorner.vue";
import StyleIcon from "./StyleIcon.vue";
import StyleShape from "./StyleShape.vue";
import { useStyleSlots } from "./use-style-slots";

import type { JournalDecorationCorner, JournalDecorationShape, JournalDecorationStyle } from "../../config";
import type { BorderSideName, Placement } from "../../resolve-cell";
import type { StyleSlotKey } from "../../style-slots";

const props = defineProps<{ name: string; styles: readonly JournalDecorationStyle[] }>();

const slots = useStyleSlots(props.name, () => props.styles);
const activeLayer = ref<StyleSlotKey>("background");
const activeSide = ref<BorderSideName>("top");

const previewDay = new Date().getDate();

const slotIndexOfActive = computed(() => props.styles.findLastIndex((s) => s.type === activeLayer.value));
const activeName = computed(() => `${props.name}.${slotIndexOfActive.value}`);
const isOccupied = computed(() => slotIndexOfActive.value !== -1);

const markPlacement = computed<Placement | undefined>(() => {
  const style = slots.get(activeLayer.value);
  if (style === undefined) return undefined;
  if (style.type !== "shape" && style.type !== "icon") return undefined;
  return `${style.placement_x}_${style.placement_y}`;
});

const cornerPlacement = computed<JournalDecorationCorner["placement"] | undefined>(
  () => slots.get("corner")?.placement,
);

const wholeRegionLabel = computed(() =>
  activeLayer.value === "color"
    ? m.decoration_canvas_region_label({ type: "color" })
    : m.decoration_canvas_region_label({ type: "background" }),
);

// Splitting the Placement string would need a cast back to the two literal unions, so the
// mapping is spelled out instead.
const MARK_PLACEMENTS: Record<
  Placement,
  { x: JournalDecorationShape["placement_x"]; y: JournalDecorationShape["placement_y"] }
> = {
  left_top: { x: "left", y: "top" },
  left_middle: { x: "left", y: "middle" },
  left_bottom: { x: "left", y: "bottom" },
  center_top: { x: "center", y: "top" },
  center_middle: { x: "center", y: "middle" },
  center_bottom: { x: "center", y: "bottom" },
  right_top: { x: "right", y: "top" },
  right_middle: { x: "right", y: "middle" },
  right_bottom: { x: "right", y: "bottom" },
};

// Marks and corners each hold one occupant, so a click on another region moves it rather than
// adding a second. Border is the exception and is handled by chooseSide.
//
// Each handler performs exactly ONE write. An add()-then-put() pair would be wrong: `styles`
// arrives as a prop, and put() re-reads it to find the slot's index, so within one handler the
// second call can still see the pre-add array and push a duplicate. Building the finished style
// from `get() ?? defaultStyle()` and writing once sidesteps the ordering entirely.
function chooseMark(placement: Placement): void {
  const layer = activeLayer.value;
  if (layer !== "shape" && layer !== "icon") return;
  const { x, y } = MARK_PLACEMENTS[placement];
  const style = slots.get(layer) ?? defaultStyle(layer);
  slots.put(layer, { ...style, placement_x: x, placement_y: y });
}

function chooseCorner(placement: JournalDecorationCorner["placement"]): void {
  const style = slots.get("corner") ?? defaultStyle("corner");
  slots.put("corner", { ...style, placement });
}

function chooseWhole(): void {
  const layer = activeLayer.value;
  if (layer !== "background" && layer !== "color") return;
  if (slots.get(layer) === undefined) slots.add(layer);
}

function chooseRing(): void {
  if (slots.get("border") === undefined) slots.add("border");
}

function chooseSide(side: BorderSideName): void {
  activeSide.value = side;
  const border = slots.get("border");
  if (border === undefined) return;
  if (border[side].show) return;
  slots.put("border", { ...border, [side]: { ...border[side], show: true } });
}

// A border with every side hidden would be a filled slot declaring nothing at all, which is
// exactly what an empty slot means. Emptying it keeps the two states distinct.
function removeActive(): void {
  const layer = activeLayer.value;
  if (layer !== "border") {
    slots.remove(layer);
    return;
  }
  const border = slots.get("border");
  if (border === undefined) return;
  if (border.border === "uniform") {
    slots.remove("border");
    return;
  }
  const next = { ...border, [activeSide.value]: { ...border[activeSide.value], show: false } };
  const anyShown = (["top", "right", "bottom", "left"] as const).some((side) => next[side].show);
  if (anyShown) slots.put("border", next);
  else slots.remove("border");
}
</script>

<template>
  <div class="decoration-canvas">
    <DecorationLayerStrip v-model="activeLayer" :occupied="slots.occupied.value" />

    <div class="stage">
      <div class="cell">
        <DecorationPreview :styles="styles">{{ previewDay }}</DecorationPreview>
        <CanvasRegionWhole
          v-if="activeLayer === 'background' || activeLayer === 'color'"
          :label="wholeRegionLabel"
          :occupied="isOccupied"
          @choose="chooseWhole()"
        />
        <CanvasRegionSlots
          v-else-if="activeLayer === 'shape' || activeLayer === 'icon'"
          :occupied="markPlacement"
          @choose="chooseMark"
        />
        <CanvasRegionCorners v-else-if="activeLayer === 'corner'" :occupied="cornerPlacement" @choose="chooseCorner" />
        <CanvasRegionBorder
          v-else
          :border="slots.get('border')"
          :active-side="activeSide"
          @choose-ring="chooseRing"
          @choose-side="chooseSide"
        />
      </div>
    </div>

    <div class="inspector">
      <template v-if="isOccupied">
        <StyleBackground v-if="activeLayer === 'background'" :name="activeName" />
        <StyleColor v-else-if="activeLayer === 'color'" :name="activeName" />
        <StyleShape v-else-if="activeLayer === 'shape'" :name="activeName" />
        <StyleIcon v-else-if="activeLayer === 'icon'" :name="activeName" />
        <StyleCorner v-else-if="activeLayer === 'corner'" :name="activeName" />
        <StyleBorder v-else :name="activeName" :side="activeSide" />
        <UiSettingRow controls-only>
          <UiIconButton
            :icon="icons.action.delete"
            :aria-label="m.decoration_canvas_remove_label()"
            @click="removeActive()"
          />
        </UiSettingRow>
      </template>
      <UiSettingRow v-else no-controls>
        <template #description>
          {{ m.decoration_canvas_empty_hint({ type: activeLayer }) }}
        </template>
      </UiSettingRow>
    </div>
  </div>
</template>

<style scoped>
.decoration-canvas {
  display: flex;
  flex-direction: column;
  gap: var(--size-4-2);
}
.stage {
  display: flex;
  justify-content: center;
  padding: var(--size-4-4);
}
.cell {
  position: relative;
  width: 180px;
  height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-ui-larger);
}
</style>
```

`DecorationLayerStrip` needs importing alongside the others — add `import DecorationLayerStrip from "./DecorationLayerStrip.vue";` in the import block.

The `chooseMark` destructuring above is awkward TypeScript. Replace it with an explicit lookup rather than fighting the inference:

```ts
const MARK_PLACEMENTS: Record<
  Placement,
  { x: JournalDecorationShape["placement_x"]; y: JournalDecorationShape["placement_y"] }
> = {
  left_top: { x: "left", y: "top" },
  left_middle: { x: "left", y: "middle" },
  left_bottom: { x: "left", y: "bottom" },
  center_top: { x: "center", y: "top" },
  center_middle: { x: "center", y: "middle" },
  center_bottom: { x: "center", y: "bottom" },
  right_top: { x: "right", y: "top" },
  right_middle: { x: "right", y: "middle" },
  right_bottom: { x: "right", y: "bottom" },
};

function chooseMark(placement: Placement): void {
  const layer = activeLayer.value;
  if (layer !== "shape" && layer !== "icon") return;
  const { x, y } = MARK_PLACEMENTS[placement];
  const style = slots.get(layer) ?? slots.add(layer);
  slots.put(layer, { ...style, placement_x: x, placement_y: y });
}
```

Import `JournalDecorationShape` as a type for that record.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/decorations/settings/ui/DecorationCanvas.test.ts`
Expected: PASS, 12 tests. The two mode tests depend on Task 9's `StyleBorder` exposing a `Linked`/`Per side` radio group — if Task 9 has not run yet, mark those two `it.todo` and restore them in Task 9's step 6.

- [ ] **Step 6: Commit**

```bash
git add src/decorations/settings/ui/DecorationCanvas.vue src/decorations/settings/ui/DecorationCanvas.test.ts messages/en.json
git commit -m "feat(decorations): add the decoration style canvas"
```

---

## Task 9: Trim the inspectors

Every control the canvas now owns comes out of the leaves.

**Files:**

- Modify: `src/decorations/settings/ui/StyleShape.vue` (drop the placement row)
- Modify: `src/decorations/settings/ui/StyleIcon.vue` (drop the placement row)
- Modify: `src/decorations/settings/ui/StyleCorner.vue` (drop the placement row)
- Modify: `src/decorations/settings/ui/StyleBorder.vue` (mode becomes a radio group; renders one side)
- Modify: `src/decorations/settings/ui/StyleBorderSide.vue` (drop `show` and its `v-if`)
- Modify: the four corresponding `.test.ts` files
- Delete: `src/decorations/settings/ui/StyleItem.vue`, `StyleItem.test.ts`

**Interfaces:**

- Consumes: `BorderSideName` from `../../resolve-cell`.
- Produces: `StyleBorder` gains a required `side: BorderSideName` prop and renders `StyleBorderSide` for that side only. Its mode control is a radio group named by `m.decoration_style_border_mode_label()` with options `m.decoration_border_mode_label({ mode })`.

- [ ] **Step 1: Write the failing test for the border mode control**

Replace the body of `src/decorations/settings/ui/StyleBorder.test.ts`'s `describe` with tests that mount `StyleBorder` with `:name="'s'"` and `:side="'top'"` inside the same `useForm` host pattern used by `StyleBackground.test.ts`:

```ts
describe("StyleBorder", () => {
  it("switches the stored mode to per side", async () => {
    const host = mount({ ...defaultStyle("border") });
    await userEvent.click(screen.getByRole("radio", { name: "Per side" }));
    expect(host.values.s.border).toBe("different");
  });

  it("turns every side on when switching back to linked", async () => {
    const host = mount({
      ...defaultStyle("border"),
      border: "different",
      top: { show: false, width: 1, color: { type: "transparent" }, style: "solid" },
    });
    await userEvent.click(screen.getByRole("radio", { name: "Linked" }));
    expect(host.values.s.top.show).toBe(true);
  });

  it("edits only the named side", async () => {
    const host = mount({ ...defaultStyle("border"), border: "different" });
    await userEvent.clear(screen.getByRole("spinbutton"));
    await userEvent.type(screen.getByRole("spinbutton"), "4");
    expect(host.values.s.top.width).toBe(4);
    expect(host.values.s.left.width).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/decorations/settings/ui/StyleBorder.test.ts`
Expected: FAIL — no radio role; `StyleBorder` renders a `<select>` and four side sections.

- [ ] **Step 3: Rewrite StyleBorder.vue**

```vue
<script setup lang="ts">
import { useField } from "vee-validate";
import { watch } from "vue";

import { m } from "@/i18n";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import StyleBorderSide from "./StyleBorderSide.vue";

import type { BorderSide, JournalDecorationBorder } from "../../config";
import type { BorderSideName } from "../../resolve-cell";

const { name, side } = defineProps<{ name: string; side: BorderSideName }>();
const { value: mode } = useField<JournalDecorationBorder["border"]>(`${name}.border`);
const { value: top } = useField<BorderSide>(`${name}.top`);
const { value: bottom } = useField<BorderSide>(`${name}.bottom`);
const { value: left } = useField<BorderSide>(`${name}.left`);
const { value: right } = useField<BorderSide>(`${name}.right`);

// Linked means one border around the cell, which is what the stored "uniform" mode already
// means — resolveCell copies `left` to all four sides. Keeping the four in step while linked
// makes switching to per side a no-op on the data.
//
// The watcher must not write `top`, which it also watches, or every edit re-triggers it. The
// "turn every side on" half of linking therefore lives in setMode, which runs once per click.
watch(
  [top, mode],
  () => {
    if (mode.value !== "uniform") return;
    bottom.value = { ...top.value };
    left.value = { ...top.value };
    right.value = { ...top.value };
  },
  { deep: true },
);

function setMode(next: JournalDecorationBorder["border"]): void {
  if (next === "uniform" && !top.value.show) top.value = { ...top.value, show: true };
  mode.value = next;
}
</script>

<template>
  <UiSettingRow :name="m.decoration_style_border_mode_label()">
    <label>
      <input type="radio" :checked="mode === 'uniform'" @change="setMode('uniform')" />
      {{ m.decoration_border_mode_label({ mode: "uniform" }) }}
    </label>
    <label>
      <input type="radio" :checked="mode === 'different'" @change="setMode('different')" />
      {{ m.decoration_border_mode_label({ mode: "different" }) }}
    </label>
  </UiSettingRow>
  <StyleBorderSide :name="`${name}.${mode === 'uniform' ? 'top' : side}`" />
</template>
```

- [ ] **Step 4: Trim StyleBorderSide.vue**

Delete the `show` field, its `UiSettingRow`, and the `<template v-if="show">` wrapper — the three remaining rows (width, color, style) become the whole template. Remove the now-unused `UiToggle` import and the `useField<boolean>` for `show`.

- [ ] **Step 5: Trim the three placement rows**

In `StyleShape.vue` and `StyleIcon.vue`, delete the final `UiSettingRow` for placement and the two `useField` calls for `placement_x` and `placement_y`. In `StyleCorner.vue`, delete the placement `UiSettingRow` and its `useField`. Remove `UiDropdown` imports where nothing else uses them.

Update the three `.test.ts` files: delete any test asserting a placement dropdown. Do not replace them — placement is now the canvas's behaviour and is covered by `DecorationCanvas.test.ts`.

- [ ] **Step 6: Delete StyleItem**

```bash
git rm src/decorations/settings/ui/StyleItem.vue src/decorations/settings/ui/StyleItem.test.ts
```

If Task 8 marked two border tests `it.todo`, restore them now.

- [ ] **Step 7: Run the decorations suite**

Run: `npx vitest run src/decorations`
Expected: PASS. `EditDecorationModal.test.ts` will still fail — it renders the old style list. Task 10 rewrites it.

- [ ] **Step 8: Commit**

```bash
git add -A src/decorations/settings/ui
git commit -m "refactor(decorations): move placement and border mode out of the style inspectors"
```

---

## Task 10: Two-pane modal

**Files:**

- Modify: `src/decorations/settings/ui/EditDecorationModal.vue`
- Modify: `src/decorations/settings/ui/EditDecorationModal.test.ts`

**Interfaces:**

- Consumes: `DecorationCanvas` (Task 8).
- Produces: no API change. `defineProps<{ decoration?: JournalDecoration; conditionTypes: readonly JournalDecorationCondition["type"][] }>()` and the `useModal<{ decoration: JournalDecoration }>()` contract are untouched, so `modals.ts` and every caller stay as they are.

- [ ] **Step 1: Write the failing tests**

Add to `src/decorations/settings/ui/EditDecorationModal.test.ts`, keeping the existing condition tests:

```ts
it("keeps the submit button disabled until the decoration has a style", async () => {
  renderModal();
  await userEvent.click(screen.getByRole("button", { name: "Add condition" }));
  expect((screen.getByRole("button", { name: "Create" }) as HTMLButtonElement).disabled).toBe(true);
});

it("enables submit once a condition and a style are present", async () => {
  renderModal();
  await userEvent.click(screen.getByRole("button", { name: "Add condition" }));
  await userEvent.click(screen.getByRole("option", { name: "Has note" }));
  await userEvent.click(screen.getByRole("button", { name: "Background" }));
  expect((screen.getByRole("button", { name: "Create" }) as HTMLButtonElement).disabled).toBe(false);
});

it("no longer offers an add-style dropdown", () => {
  renderModal();
  expect(screen.queryByRole("button", { name: "Add style" })).toBeNull();
});
```

Match the existing file's rendering helper rather than introducing a second one.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/decorations/settings/ui/EditDecorationModal.test.ts`
Expected: FAIL — the add-style dropdown is still rendered.

- [ ] **Step 3: Rewrite the modal**

In `src/decorations/settings/ui/EditDecorationModal.vue`:

Delete `addStyleOptions`, `addStyle`, `previewDay`, the `styles` field array, and the `DecorationPreview`, `UiButtonDropdown` (styles only) and `StyleItem` imports. `defaultStyle` is no longer imported here. Keep `conditions`, `mode`, `incomplete` and `onSubmit` exactly as they are.

Add `import DecorationCanvas from "./DecorationCanvas.vue";`.

Replace everything between the mode row and the footer with:

```vue
    <div class="edit-decoration-panes">
      <div class="pane-conditions">
        <UiSettingRow :name="m.decoration_modal_mode_label()">
          <UiDropdown v-model="mode">
            <option value="and">{{ m.decoration_modal_mode_option({ kind: "and" }) }}</option>
            <option value="or">{{ m.decoration_modal_mode_option({ kind: "or" }) }}</option>
          </UiDropdown>
        </UiSettingRow>
        <UiSettingRow>
          <UiButtonDropdown :options="addConditionOptions" @select="addCondition">
            {{ m.decoration_modal_add_condition() }}
          </UiButtonDropdown>
        </UiSettingRow>
        <UiSettingRow v-if="values.conditions.length === 0" no-controls>
          <template #description>{{ m.decoration_modal_no_conditions() }}</template>
        </UiSettingRow>
        <div v-for="(condition, i) of values.conditions" :key="i" class="condition-row">
          <span v-if="i > 0" class="mode-hint">{{ m.decoration_describe_mode({ kind: mode }) }}</span>
          <UiSettingRow :name="m.decoration_condition_type_short({ type: condition.type })">
            <ConditionItem :name="`conditions.${i}`" :condition="condition" />
            <UiIconButton :icon="icons.action.delete" @click="conditions.remove(i)" />
          </UiSettingRow>
        </div>
      </div>
      <div class="pane-canvas">
        <DecorationCanvas name="styles" :styles="values.styles" />
      </div>
    </div>
```

Replace the `.preview-grid` and `.preview` rules with:

```css
.edit-decoration-panes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--size-4-4);
  align-items: start;
}
.pane-canvas {
  border-left: 1px solid var(--background-modifier-border);
  padding-left: var(--size-4-4);
}
@media (width <= 700px) {
  .edit-decoration-panes {
    grid-template-columns: 1fr;
  }
  .pane-canvas {
    border-left: none;
    border-top: 1px solid var(--background-modifier-border);
    padding-left: 0;
    padding-top: var(--size-4-4);
  }
}
```

- [ ] **Step 4: Widen the modal**

`editDecorationModal` in `src/decorations/settings/ui/modals.ts` already declares `width: 800`. Two panes plus a 180px canvas and its inspector are cramped at that width; raise it:

```ts
export const editDecorationModal = defineModal<{ decoration: JournalDecoration }>()({
  component: EditDecorationModal,
  title: ({ decoration }: EditDecorationModalProps) => (decoration ? m.decoration_edit() : m.decoration_add()),
  width: 900,
});
```

That is the only change to this file. The `700px` breakpoint in the SFC handles narrow windows and phones, where the declared width does not apply.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/decorations`
Expected: PASS across the whole decorations suite.

- [ ] **Step 6: Run the full gates**

```bash
npm run test
npm run check:types
npm run check:lint
```

Expected: all pass. Run these from the controller, not a subagent — they background past a subagent's timeout.

- [ ] **Step 7: Commit**

```bash
git add src/decorations/settings/ui/EditDecorationModal.vue src/decorations/settings/ui/EditDecorationModal.test.ts src/decorations/settings/ui/modals.ts
git commit -m "feat(decorations): lay the decoration editor out in two panes"
```

---

## Task 11: End-to-end journey

`__mocks__/obsidian.ts` is our own stand-in, so unit tests prove nothing about the modal inside real Obsidian. This journey authors a decoration entirely through canvas clicks and asserts the calendar renders it.

**Files:**

- Modify: `e2e/journeys/decorations.ts`

- [ ] **Step 1: Read the existing journeys**

Run: `sed -n '1,80p' e2e/journeys/decorations.ts`

Follow the file's existing helpers for opening settings, reaching a journal's decorations section and reading a cell — do not introduce a second way of doing any of them.

- [ ] **Step 2: Write the journey**

Append a journey that:

1. Opens the journal's decorations section and clicks "Add decoration".
2. Adds a `has-note` condition.
3. Clicks the **Background** layer chip, then the cell region, then sets a custom hex distinct from any theme value — `#8844ff`.
4. Clicks the **Shape** layer chip, then the **Bottom center** region.
5. Saves, closes settings, and asserts the decorated day cell's `background-color` is `#8844ff` via `getCSSProperty("background-color").parsed.hex`.

Assert color rather than width — editor zoom rescales authored pixel values (a 3px border reads as 2.66667px). Use a custom hex rather than a theme variable so the assertion cannot pass against a themed default.

Where the icon layer is involved, click programmatically through `browser.execute` — `UiIconSuggest`'s overlay swallows WDIO clicks on anything beneath it.

- [ ] **Step 3: Run the e2e suite**

Run: `npm run test:e2e`
Expected: the new journey passes. The nav-template integration failure is a known baseline — verify any other regression against a base-commit worktree rather than `git stash`.

- [ ] **Step 4: Commit**

```bash
git add e2e/journeys/decorations.ts
git commit -m "test(e2e): author a decoration through the style canvas"
```

---

## Self-Review Notes

**Spec coverage.** Six-slot model → Tasks 1, 3. Canvas and layer strip → Tasks 4-8. Region table → Tasks 5, 6, 7. Interaction rule and the border exception → Task 8. Border linked/per-side mapping → Tasks 7, 9. Defaults → Task 2. Two-pane shell → Task 10. Testing section → the test steps throughout plus Task 11. Rollout → Task 2's changelog step.

**Deliberately absent items** in the spec need no tasks: duplicate-type repair is covered by `slotIndex` resolving to the last (Task 1), the period-aware preview and the corner size field are explicitly not built.

**Known deviation from the spec's wording.** The spec calls the first two layers "fill" and "text"; the implementation labels them Background and Color by reusing `decoration_style_type_label`, so the canvas and the breakdown modal shipped in piece 2 name the same things identically. The slot keys in code are the stored type names throughout.
