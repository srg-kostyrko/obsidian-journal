# v3 UI Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port 13 Obsidian-styled Vue primitives from v2 (`src/_old-code/components/`) into `src/ui/` and add a `renderIcon` helper to the host module so `src/ui/` never imports from `"obsidian"` directly.

**Architecture:** All primitives live flat under `src/ui/` (no barrel). Each primitive renders Obsidian's native CSS classes; styling reuses v2's scoped `<style>` blocks. `UiIcon` reaches `getIcon` via a one-line `renderIcon` re-export from `@/infrastructure/host`, which is the only module allowed to import from `"obsidian"`. Five primitives carry colocated `*.test.ts` files (the ones with real behavior beyond template); the rest are intentionally untested per "no trivial tests" memory.

**Tech Stack:** Vue 3.5 SFCs (`<script setup lang="ts">`), `defineModel`/`defineProps`/`defineEmits`, `@vueuse/core` (`onClickOutside`), vitest + happy-dom, `@testing-library/vue` + `@testing-library/user-event`, Obsidian `getIcon`.

**Spec:** `docs/superpowers/specs/2026-05-14-v3-ui-primitives-design.md`

**Conventions reaffirmed from project memory:**

- Per-task verification: `npm run test`, `npm run check:types`, `npm run check:lint`.
- One behavior per test; nested `describe()` blocks for scope; black-box assertions; no `data-test-*` attrs.
- `@testing-library/vue` + `@testing-library/user-event` for component tests (no `@vue/test-utils` class-selector queries).
- Inline `defineProps<{...}>()`; no separate `XxxProps` interface unless reused.
- No JSDoc on prop interfaces; no WHAT comments. WHY comments only when non-obvious.

---

### Task 1: Add `renderIcon` to infrastructure/host

**Files:**

- Create: `src/infrastructure/host/internal/icons.ts`
- Modify: `src/infrastructure/host/index.ts`

This task adds the seam that `UiIcon` will consume. No dedicated test — `renderIcon` is a one-line re-export and is covered by `UiIcon.test.ts` in Task 9.

- [ ] **Step 1: Create the helper file**

Write to `src/infrastructure/host/internal/icons.ts`:

```ts
import { getIcon } from "obsidian";

export function renderIcon(name: string): SVGSVGElement | null {
  return getIcon(name);
}
```

- [ ] **Step 2: Re-export from the host barrel**

Open `src/infrastructure/host/index.ts`. After the existing `WorkspaceService` export (line 17), add:

```ts
export { renderIcon } from "./internal/icons";
```

The full diff context (existing line 17 is `export { WorkspaceService } from "./internal/workspace-service";`):

```ts
export { NotesService } from "./internal/notes-service";
export { PluginData } from "./internal/plugin-data";
export { WorkspaceService } from "./internal/workspace-service";
export { renderIcon } from "./internal/icons";
```

- [ ] **Step 3: Verify the build**

Run: `npm run check:types`
Expected: PASS (no new type errors).

Run: `npm run check:lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/infrastructure/host/internal/icons.ts src/infrastructure/host/index.ts
git commit -m "feat(host): add renderIcon re-export for src/ui consumers"
```

---

### Task 2: `UiButton`

**Files:**

- Create: `src/ui/UiButton.vue`

No test (pure passthrough — class-toggle wrapper).

- [ ] **Step 1: Create the SFC**

Write to `src/ui/UiButton.vue`:

```vue
<script setup lang="ts">
defineProps<{
  disabled?: boolean;
  cta?: boolean;
  warning?: boolean;
  flat?: boolean;
  type?: "button" | "submit" | "reset";
  tooltip?: string;
}>();
</script>

<template>
  <button
    :class="{ 'mod-cta': cta, 'mod-warning': warning, 'clickable-icon': flat && !cta }"
    :disabled="disabled"
    :type="type ?? 'button'"
    :aria-label="tooltip"
  >
    <slot />
  </button>
</template>

<style scoped>
button {
  cursor: pointer;
}
button:disabled {
  cursor: not-allowed;
}
</style>
```

- [ ] **Step 2: Verify**

Run: `npm run check:types`
Expected: PASS.

Run: `npm run check:lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/ui/UiButton.vue
git commit -m "feat(ui): add UiButton primitive"
```

---

### Task 3: `UiTextInput`

**Files:**

- Create: `src/ui/UiTextInput.vue`

No test (defineModel passthrough).

- [ ] **Step 1: Create the SFC**

Write to `src/ui/UiTextInput.vue`:

```vue
<script setup lang="ts">
defineProps<{
  placeholder?: string;
  disabled?: boolean;
}>();

const model = defineModel<string>();
</script>

<template>
  <input v-model="model" type="text" :placeholder="placeholder" :disabled="disabled" spellcheck="false" />
</template>
```

- [ ] **Step 2: Verify**

Run: `npm run check:types`
Expected: PASS.

Run: `npm run check:lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/ui/UiTextInput.vue
git commit -m "feat(ui): add UiTextInput primitive"
```

---

### Task 4: `UiNumberInput`

**Files:**

- Create: `src/ui/UiNumberInput.vue`

No test (defineModel passthrough).

- [ ] **Step 1: Create the SFC**

Write to `src/ui/UiNumberInput.vue`:

```vue
<script setup lang="ts">
defineProps<{
  placeholder?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  narrow?: boolean;
}>();

const model = defineModel<number>();
</script>

<template>
  <input
    v-model="model"
    type="number"
    :class="{ 'narrow-input': narrow }"
    :placeholder="placeholder"
    :disabled="disabled"
    :min="min"
    :max="max"
    spellcheck="false"
  />
</template>

<style scoped>
.narrow-input {
  width: 60px;
}
</style>
```

- [ ] **Step 2: Verify**

Run: `npm run check:types`
Expected: PASS.

Run: `npm run check:lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/ui/UiNumberInput.vue
git commit -m "feat(ui): add UiNumberInput primitive"
```

---

### Task 5: `UiToggle` (TDD)

**Files:**

- Create: `src/ui/UiToggle.vue`
- Test: `src/ui/UiToggle.test.ts`

- [ ] **Step 1: Write the failing test**

Write to `src/ui/UiToggle.test.ts`:

```ts
import { render } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { defineComponent, ref } from "vue";

import UiToggle from "./UiToggle.vue";

function renderHarness(initial: boolean, disabled = false) {
  const model = ref(initial);
  const Host = defineComponent({
    components: { UiToggle },
    props: { disabled: Boolean },
    setup() {
      return { model };
    },
    template: `<UiToggle v-model="model" :disabled="disabled" />`,
  });
  const utils = render(Host, { props: { disabled } });
  return { ...utils, model };
}

describe("UiToggle", () => {
  describe("click toggles the v-model", () => {
    it("flips false to true", async () => {
      const { container, model } = renderHarness(false);
      const target = container.querySelector(".checkbox-container");
      expect(target).not.toBeNull();
      await userEvent.click(target!);
      expect(model.value).toBe(true);
    });

    it("flips true to false", async () => {
      const { container, model } = renderHarness(true);
      const target = container.querySelector(".checkbox-container");
      await userEvent.click(target!);
      expect(model.value).toBe(false);
    });
  });

  it("does not toggle when disabled", async () => {
    const { container, model } = renderHarness(false, true);
    const target = container.querySelector(".checkbox-container");
    await userEvent.click(target!);
    expect(model.value).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm run test -- src/ui/UiToggle.test.ts`
Expected: FAIL (module `./UiToggle.vue` not found).

- [ ] **Step 3: Create the SFC**

Write to `src/ui/UiToggle.vue`:

```vue
<script setup lang="ts">
const props = defineProps<{
  disabled?: boolean;
  tooltip?: string;
}>();

const model = defineModel<boolean>();

function toggle() {
  if (props.disabled) return;
  model.value = !model.value;
}
</script>

<template>
  <div
    class="checkbox-container"
    :class="{ 'is-enabled': model, 'is-disabled': disabled }"
    :aria-label="tooltip"
    @click="toggle"
  >
    <input type="checkbox" tabindex="0" />
  </div>
</template>
```

> **Note:** This differs from v2 in one detail — v2 had `@click="model = !model"` inline with no `disabled` guard, even though it set `is-disabled`. v3 honors the prop so the disabled-no-toggle test pins behavior.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm run test -- src/ui/UiToggle.test.ts`
Expected: PASS (3 tests, 1 describe with 2 nested).

- [ ] **Step 5: Verify types and lint**

Run: `npm run check:types`
Expected: PASS.

Run: `npm run check:lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/UiToggle.vue src/ui/UiToggle.test.ts
git commit -m "feat(ui): add UiToggle primitive with click-toggle behavior"
```

---

### Task 6: `UiDropdown`

**Files:**

- Create: `src/ui/UiDropdown.vue`

No test (defineModel passthrough).

- [ ] **Step 1: Create the SFC**

Write to `src/ui/UiDropdown.vue`:

```vue
<script setup lang="ts">
defineProps<{
  disabled?: boolean;
}>();
const model = defineModel<string>();
</script>

<template>
  <select v-model="model" class="dropdown" :disabled="disabled">
    <slot />
  </select>
</template>
```

- [ ] **Step 2: Verify**

Run: `npm run check:types`
Expected: PASS.

Run: `npm run check:lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/ui/UiDropdown.vue
git commit -m "feat(ui): add UiDropdown primitive"
```

---

### Task 7: `UiColorPicker`

**Files:**

- Create: `src/ui/UiColorPicker.vue`

No test (defineModel passthrough).

- [ ] **Step 1: Create the SFC**

Write to `src/ui/UiColorPicker.vue`:

```vue
<script setup lang="ts">
defineProps<{
  disabled?: boolean;
}>();

const model = defineModel<string>();
</script>

<template>
  <input v-model="model" type="color" :disabled="disabled" spellcheck="false" />
</template>
```

- [ ] **Step 2: Verify**

Run: `npm run check:types`
Expected: PASS.

Run: `npm run check:lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/ui/UiColorPicker.vue
git commit -m "feat(ui): add UiColorPicker primitive"
```

---

### Task 8: `UiIcon` (TDD, depends on Task 1)

**Files:**

- Create: `src/ui/UiIcon.vue`
- Test: `src/ui/UiIcon.test.ts`

This task pins the v3 refinement: `UiIcon` calls `renderIcon` from `@/infrastructure/host` (not `getIcon` from `"obsidian"`) and uses `replaceChildren()` (standard DOM, supported by happy-dom) rather than v2's `element.empty()` (an Obsidian-runtime HTMLElement extension that does not exist in happy-dom or Vue typings).

- [ ] **Step 1: Write the failing test**

Write to `src/ui/UiIcon.test.ts`:

```ts
import { render } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { renderIcon } from "@/infrastructure/host";

import UiIcon from "./UiIcon.vue";

vi.mock("@/infrastructure/host", () => ({
  renderIcon: vi.fn(),
}));

const mockRenderIcon = vi.mocked(renderIcon);

function makeSvg(label: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("data-label", label);
  return svg;
}

describe("UiIcon", () => {
  it("appends the icon returned by renderIcon on mount", () => {
    const svg = makeSvg("search");
    mockRenderIcon.mockReturnValueOnce(svg);

    const { container } = render(UiIcon, { props: { name: "search" } });

    expect(mockRenderIcon).toHaveBeenCalledWith("search");
    expect(container.querySelector("svg[data-label='search']")).not.toBeNull();
  });

  it("replaces the icon when the name prop changes", async () => {
    mockRenderIcon.mockReturnValueOnce(makeSvg("first")).mockReturnValueOnce(makeSvg("second"));

    const { container, rerender } = render(UiIcon, { props: { name: "first" } });
    expect(container.querySelector("svg[data-label='first']")).not.toBeNull();

    await rerender({ name: "second" });
    await nextTick();

    expect(container.querySelector("svg[data-label='first']")).toBeNull();
    expect(container.querySelector("svg[data-label='second']")).not.toBeNull();
  });

  it("clears the span when the name prop becomes empty", async () => {
    mockRenderIcon.mockReturnValueOnce(makeSvg("present"));

    const { container, rerender } = render(UiIcon, { props: { name: "present" } });
    expect(container.querySelector("svg[data-label='present']")).not.toBeNull();

    await rerender({ name: "" });
    await nextTick();

    expect(container.querySelector("svg")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm run test -- src/ui/UiIcon.test.ts`
Expected: FAIL (module `./UiIcon.vue` not found).

- [ ] **Step 3: Create the SFC**

Write to `src/ui/UiIcon.vue`:

```vue
<script setup lang="ts">
import { onMounted, ref, watch } from "vue";

import { renderIcon } from "@/infrastructure/host";

const props = defineProps<{
  name: string;
  tooltip?: string;
}>();

const element = ref<HTMLSpanElement>();

onMounted(() => {
  watch(
    () => props.name,
    (name) => placeIcon(name),
    { immediate: true },
  );
});

function placeIcon(name: string): void {
  const host = element.value;
  if (!host) return;
  host.replaceChildren();
  if (!name) return;
  const icon = renderIcon(name);
  if (icon) host.append(icon);
}
</script>

<template>
  <span ref="element" :aria-label="tooltip"></span>
</template>

<style scoped>
span {
  display: inline-flex;
  align-items: center;
}
</style>
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm run test -- src/ui/UiIcon.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify types and lint**

Run: `npm run check:types`
Expected: PASS.

Run: `npm run check:lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/UiIcon.vue src/ui/UiIcon.test.ts
git commit -m "feat(ui): add UiIcon primitive via host renderIcon seam"
```

---

### Task 9: `UiIconButton` (depends on Tasks 2 and 8)

**Files:**

- Create: `src/ui/UiIconButton.vue`

No test (trivial composition).

- [ ] **Step 1: Create the SFC**

Write to `src/ui/UiIconButton.vue`:

```vue
<script setup lang="ts">
import UiButton from "./UiButton.vue";
import UiIcon from "./UiIcon.vue";

defineProps<{
  icon: string;
  tooltip?: string;
}>();
</script>

<template>
  <UiButton :tooltip="tooltip" flat class="icon-button">
    <UiIcon :name="icon" />
  </UiButton>
</template>

<style scoped>
.icon-button {
  padding: var(--size-4-1) var(--size-4-2);
}
</style>
```

- [ ] **Step 2: Verify**

Run: `npm run check:types`
Expected: PASS.

Run: `npm run check:lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/ui/UiIconButton.vue
git commit -m "feat(ui): add UiIconButton primitive"
```

---

### Task 10: `UiSettingRow` (TDD)

**Files:**

- Create: `src/ui/UiSettingRow.vue`
- Test: `src/ui/UiSettingRow.test.ts`

This task pins the v3 refinement: `description` is a named slot, not a prop. `name` remains both prop and slot (slot overrides prop). `controlsOnly` and `noControls` are pinned by tests.

- [ ] **Step 1: Write the failing test**

Write to `src/ui/UiSettingRow.test.ts`:

```ts
import { render } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import UiSettingRow from "./UiSettingRow.vue";

describe("UiSettingRow", () => {
  describe("name", () => {
    it("renders the name prop in .setting-item-name", () => {
      const { container } = render(UiSettingRow, { props: { name: "Title" } });
      expect(container.querySelector(".setting-item-name")?.textContent?.trim()).toBe("Title");
    });

    it("renders the #name slot in place of the prop", () => {
      const { container } = render(UiSettingRow, {
        props: { name: "Prop" },
        slots: { name: "Slotted" },
      });
      expect(container.querySelector(".setting-item-name")?.textContent?.trim()).toBe("Slotted");
    });
  });

  it("renders the #description slot in .setting-item-description", () => {
    const { container } = render(UiSettingRow, {
      slots: { description: "<em>Note</em>" },
    });
    const desc = container.querySelector(".setting-item-description");
    expect(desc?.querySelector("em")?.textContent).toBe("Note");
  });

  it("hides the info block when controlsOnly is true", () => {
    const { container } = render(UiSettingRow, {
      props: { controlsOnly: true, name: "Title" },
      slots: { default: "<button>Go</button>" },
    });
    expect(container.querySelector(".setting-item-info")).toBeNull();
    expect(container.querySelector(".setting-item-control button")).not.toBeNull();
  });

  it("hides the control area when noControls is true", () => {
    const { container } = render(UiSettingRow, {
      props: { noControls: true, name: "Title" },
      slots: { default: "<button>Hidden</button>" },
    });
    expect(container.querySelector(".setting-item-control")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm run test -- src/ui/UiSettingRow.test.ts`
Expected: FAIL (module `./UiSettingRow.vue` not found).

- [ ] **Step 3: Create the SFC**

Write to `src/ui/UiSettingRow.vue`:

```vue
<script setup lang="ts">
defineProps<{
  name?: string;
  heading?: boolean;
  controlsOnly?: boolean;
  noControls?: boolean;
}>();
</script>

<template>
  <div class="setting-item" :class="{ 'setting-item--heading': heading }">
    <div v-if="!controlsOnly" class="setting-item-info">
      <div class="setting-item-name">
        <slot name="name">{{ name ?? "" }}</slot>
      </div>
      <div class="setting-item-description">
        <slot name="description" />
      </div>
    </div>
    <div v-if="!noControls" class="setting-item-control">
      <slot />
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm run test -- src/ui/UiSettingRow.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Verify types and lint**

Run: `npm run check:types`
Expected: PASS.

Run: `npm run check:lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/UiSettingRow.vue src/ui/UiSettingRow.test.ts
git commit -m "feat(ui): add UiSettingRow with slot-based description"
```

---

### Task 11: `UiFormErrors`

**Files:**

- Create: `src/ui/UiFormErrors.vue`

No test (pure template iteration over a prop).

- [ ] **Step 1: Create the SFC**

Write to `src/ui/UiFormErrors.vue`:

```vue
<script setup lang="ts">
defineProps<{
  errors?: string[];
}>();
</script>

<template>
  <ul v-if="errors && errors.length > 0" class="journal-errors">
    <li v-for="error in errors" :key="error">{{ error }}</li>
  </ul>
</template>

<style scoped>
.journal-errors {
  color: var(--text-error);
}
</style>
```

> **Note:** v2 rendered the `<ul>` whenever `errors` was truthy (so an empty array still produced an empty list). v3 guards on `errors.length > 0` so the DOM stays clean when no errors are present. This is consistent with the "Modal form layout via UiSettingRow" memory: callers pass `errorBag.field` directly without `?? []` because the component handles absence itself.

- [ ] **Step 2: Verify**

Run: `npm run check:types`
Expected: PASS.

Run: `npm run check:lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/ui/UiFormErrors.vue
git commit -m "feat(ui): add UiFormErrors primitive"
```

---

### Task 12: `UiIconedRow` (depends on Task 8)

**Files:**

- Create: `src/ui/UiIconedRow.vue`

No test (pure layout).

- [ ] **Step 1: Create the SFC**

Write to `src/ui/UiIconedRow.vue`:

```vue
<script setup lang="ts">
import UiIcon from "./UiIcon.vue";

defineProps<{ icon: string }>();
</script>

<template>
  <div class="iconed-row">
    <UiIcon :name="icon" />
    <div>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.iconed-row {
  display: flex;
  align-items: center;
  gap: var(--size-2-2);
}
</style>
```

- [ ] **Step 2: Verify**

Run: `npm run check:types`
Expected: PASS.

Run: `npm run check:lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/ui/UiIconedRow.vue
git commit -m "feat(ui): add UiIconedRow primitive"
```

---

### Task 13: `UiCollapsibleBlock` (TDD, depends on Task 8)

**Files:**

- Create: `src/ui/UiCollapsibleBlock.vue`
- Test: `src/ui/UiCollapsibleBlock.test.ts`

This task pins the v3 behavior change vs v2: `defaultExpanded` is forwarded as the `expanded` model's default via `defineModel(..., { default: () => props.defaultExpanded ?? false })`. When the parent does not bind `v-model:expanded`, the default kicks in; when the parent does bind, the parent wins. v2 unconditionally wrote `expanded.value = true` during setup if `defaultExpanded` was true — that path is removed.

- [ ] **Step 1: Write the failing test**

Write to `src/ui/UiCollapsibleBlock.test.ts`:

```ts
import { render } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";

import { renderIcon } from "@/infrastructure/host";

import UiCollapsibleBlock from "./UiCollapsibleBlock.vue";

vi.mock("@/infrastructure/host", () => ({
  renderIcon: vi.fn(() => null),
}));

function makeUncontrolledHarness(defaultExpanded?: boolean) {
  const Host = defineComponent({
    components: { UiCollapsibleBlock },
    props: { defaultExpanded: { type: Boolean, default: undefined } },
    template: `
      <UiCollapsibleBlock :default-expanded="defaultExpanded">
        <template #trigger>Title</template>
        <div data-testid="body">Body</div>
      </UiCollapsibleBlock>
    `,
  });
  return render(Host, { props: { defaultExpanded } });
}

function makeControlledHarness(initial: boolean, defaultExpanded?: boolean) {
  const expanded = ref(initial);
  const Host = defineComponent({
    components: { UiCollapsibleBlock },
    props: { defaultExpanded: { type: Boolean, default: undefined } },
    setup() {
      return { expanded };
    },
    template: `
      <UiCollapsibleBlock v-model:expanded="expanded" :default-expanded="defaultExpanded">
        <template #trigger>Title</template>
        <template #controls>
          <button data-testid="ctrl" @click="$event => null">Ctrl</button>
        </template>
        <div data-testid="body">Body</div>
      </UiCollapsibleBlock>
    `,
  });
  const utils = render(Host, { props: { defaultExpanded } });
  return { ...utils, expanded };
}

describe("UiCollapsibleBlock", () => {
  describe("initial state", () => {
    it("is collapsed when neither v-model nor defaultExpanded is provided", () => {
      const { queryByTestId } = makeUncontrolledHarness();
      expect(queryByTestId("body")).toBeNull();
    });

    it("starts expanded when only defaultExpanded is true", () => {
      const { queryByTestId } = makeUncontrolledHarness(true);
      expect(queryByTestId("body")).not.toBeNull();
    });

    it("respects v-model=false even when defaultExpanded is true", () => {
      const { queryByTestId } = makeControlledHarness(false, true);
      expect(queryByTestId("body")).toBeNull();
    });
  });

  describe("interaction", () => {
    it("flips the model when the trigger is clicked", async () => {
      const { container, expanded } = makeControlledHarness(false);
      const trigger = container.querySelector(".collapsible-trigger");
      expect(trigger).not.toBeNull();
      await userEvent.click(trigger!);
      expect(expanded.value).toBe(true);
    });

    it("does not flip the model when clicking inside #controls", async () => {
      const { getByTestId, expanded } = makeControlledHarness(false);
      await userEvent.click(getByTestId("ctrl"));
      expect(expanded.value).toBe(false);
    });

    it("does not render the default slot while collapsed", () => {
      const { queryByTestId } = makeControlledHarness(false);
      expect(queryByTestId("body")).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm run test -- src/ui/UiCollapsibleBlock.test.ts`
Expected: FAIL (module `./UiCollapsibleBlock.vue` not found).

- [ ] **Step 3: Create the SFC**

Write to `src/ui/UiCollapsibleBlock.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";

import UiIcon from "./UiIcon.vue";

const props = defineProps<{ defaultExpanded?: boolean }>();
const expanded = defineModel<boolean>("expanded", { default: () => props.defaultExpanded ?? false });

const icon = computed(() => (expanded.value ? "chevron-down" : "chevron-right"));

function toggle() {
  expanded.value = !expanded.value;
}
</script>

<template>
  <div class="collapsible-root" :data-open="expanded || null">
    <div class="collapsible-trigger" @click="toggle">
      <UiIcon :name="icon" />
      <span class="collapsible-trigger-text">
        <slot name="trigger" />
      </span>
      <span class="collapsible-trigger-controls" @click.stop>
        <slot name="controls" />
      </span>
    </div>
    <template v-if="expanded">
      <slot />
    </template>
  </div>
</template>

<style scoped>
.collapsible-root {
  padding-bottom: var(--size-2-2);
  margin-top: var(--size-2-2);
  margin-bottom: var(--size-4-2);
}
.collapsible-root[data-open] {
  border-bottom: 1px solid var(--color-accent);
}
.collapsible-trigger {
  cursor: pointer;
  display: flex;
  align-items: center;
  border-top: 1px solid var(--color-accent);
  border-bottom: 1px solid var(--color-accent);
  gap: 4px;
  padding-top: var(--size-2-2);
  padding-bottom: var(--size-2-2);
  min-height: 38px;
}
.collapsible-trigger-text {
  flex-grow: 1;
}
</style>
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm run test -- src/ui/UiCollapsibleBlock.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Verify types and lint**

Run: `npm run check:types`
Expected: PASS.

Run: `npm run check:lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/UiCollapsibleBlock.vue src/ui/UiCollapsibleBlock.test.ts
git commit -m "feat(ui): add UiCollapsibleBlock with defineModel default"
```

---

### Task 14: `UiButtonDropdown` (TDD, depends on Task 2)

**Files:**

- Create: `src/ui/UiButtonDropdown.vue`
- Test: `src/ui/UiButtonDropdown.test.ts`

- [ ] **Step 1: Write the failing test**

Write to `src/ui/UiButtonDropdown.test.ts`:

```ts
import { render } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import UiButtonDropdown from "./UiButtonDropdown.vue";

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];

describe("UiButtonDropdown", () => {
  it("starts with the popout closed", () => {
    const { container } = render(UiButtonDropdown, {
      props: { options: OPTIONS },
      slots: { default: "Open" },
    });
    expect(container.querySelector(".button-dropdown-popout")).toBeNull();
  });

  it("opens the popout when the trigger is clicked", async () => {
    const { container, getByRole } = render(UiButtonDropdown, {
      props: { options: OPTIONS },
      slots: { default: "Open" },
    });
    await userEvent.click(getByRole("button", { name: "Open" }));
    expect(container.querySelector(".button-dropdown-popout")).not.toBeNull();
  });

  it("emits select with the option's value when an option is clicked", async () => {
    const { emitted, getByRole } = render(UiButtonDropdown, {
      props: { options: OPTIONS },
      slots: { default: "Open" },
    });
    await userEvent.click(getByRole("button", { name: "Open" }));
    await userEvent.click(getByRole("button", { name: "Beta" }));

    expect(emitted("select")).toEqual([["b"]]);
  });

  it("closes the popout after selecting an option", async () => {
    const { container, getByRole } = render(UiButtonDropdown, {
      props: { options: OPTIONS },
      slots: { default: "Open" },
    });
    await userEvent.click(getByRole("button", { name: "Open" }));
    await userEvent.click(getByRole("button", { name: "Alpha" }));

    expect(container.querySelector(".button-dropdown-popout")).toBeNull();
  });

  it("closes the popout when clicking outside, without emitting", async () => {
    const { baseElement, container, emitted, getByRole } = render(UiButtonDropdown, {
      props: { options: OPTIONS },
      slots: { default: "Open" },
    });
    await userEvent.click(getByRole("button", { name: "Open" }));

    const outside = document.createElement("button");
    outside.textContent = "outside";
    baseElement.appendChild(outside);
    await userEvent.click(outside);

    expect(container.querySelector(".button-dropdown-popout")).toBeNull();
    expect(emitted("select")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm run test -- src/ui/UiButtonDropdown.test.ts`
Expected: FAIL (module `./UiButtonDropdown.vue` not found).

- [ ] **Step 3: Create the SFC**

Write to `src/ui/UiButtonDropdown.vue`:

```vue
<script setup lang="ts">
import { onClickOutside } from "@vueuse/core";
import { ref } from "vue";

import UiButton from "./UiButton.vue";

defineProps<{
  options: { value: string; label: string }[];
}>();
const emit = defineEmits<(event: "select", value: string) => void>();

const isOpen = ref(false);
const popoutRef = ref<HTMLElement>();

onClickOutside(popoutRef, () => {
  isOpen.value = false;
});

function open() {
  isOpen.value = true;
}
function select(value: string) {
  isOpen.value = false;
  emit("select", value);
}
</script>

<template>
  <div class="button-dropdown">
    <UiButton @click="open"><slot /></UiButton>
    <div v-if="isOpen" ref="popoutRef" class="button-dropdown-popout">
      <UiButton
        v-for="option in options"
        :key="option.value"
        flat
        class="button-dropdown-option"
        @click="select(option.value)"
      >
        {{ option.label }}
      </UiButton>
    </div>
  </div>
</template>

<style scoped>
.button-dropdown {
  position: relative;
  display: inline-block;
}
.button-dropdown-popout {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 1000;
  box-shadow: var(--shadow-l);
  background-color: var(--modal-background);
  border-radius: var(--radius-s);
  border: var(--modal-border-width) solid var(--modal-border-color);
  padding: var(--size-2-2);
}
.button-dropdown-option {
  width: 100%;
}
</style>
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm run test -- src/ui/UiButtonDropdown.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Verify types and lint**

Run: `npm run check:types`
Expected: PASS.

Run: `npm run check:lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/UiButtonDropdown.vue src/ui/UiButtonDropdown.test.ts
git commit -m "feat(ui): add UiButtonDropdown with click-outside dismiss"
```

---

### Task 15: Final full-suite verification

**Files:** none

This task confirms the whole set integrates cleanly.

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: PASS. All new test files (UiToggle, UiIcon, UiSettingRow, UiCollapsibleBlock, UiButtonDropdown — 22 tests across 5 files) and all pre-existing tests pass.

- [ ] **Step 2: Run typecheck across the whole project**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 3: Run lint across the whole project**

Run: `npm run check:lint`
Expected: PASS.

- [ ] **Step 4 (only if any of the above fails): Fix and re-run**

Address any failure at its root cause. Do not skip, silence, or `--no-verify`. Re-run the three commands until clean. No commit needed unless a fix was made; if a fix was made, commit it with a `fix(ui): …` message describing the issue, then re-run.

---

## Self-Review

**Spec coverage:**

- 13 primitives → Tasks 2–14 (one per primitive). ✓
- `renderIcon` re-export → Task 1. ✓
- Behavior tests for `UiToggle`, `UiIcon`, `UiSettingRow`, `UiCollapsibleBlock`, `UiButtonDropdown` → Tasks 5, 8, 10, 13, 14. ✓
- `UiSettingRow` description-slot refinement → Task 10 tests + impl. ✓
- `UiCollapsibleBlock` defineModel-default refinement → Task 13 tests pin the v-model=false vs defaultExpanded=true case. ✓
- `UiButtonDropdown` dead `popoutPosition` removal → Task 14 SFC omits it. ✓
- "Only `infrastructure/host/**` imports `obsidian`" rule → Task 1 puts `getIcon` import inside host; no `src/ui/` file imports `obsidian`. ✓
- v2 `element.empty()` → swapped for `element.replaceChildren()` in Task 8 (noted in plan as a happy-dom-compatibility refinement; the spec is silent on the exact API but mentions the v2 method by name — the substitution is a mechanical equivalent).
- v2 `UiToggle` lacked a disabled-toggle guard; v3 adds it (noted inline in Task 5).
- `UiFormErrors` empty-array suppression — Task 11 guards on `errors.length > 0` (the spec says "renders when errors is non-empty"; v2 emitted an empty `<ul>` on empty array — Task 11 calls out the deviation).

**Placeholder scan:** No "TBD"/"TODO"/"similar to" placeholders. Every code step has full source.

**Type consistency:**

- `renderIcon(name: string): SVGSVGElement | null` — same shape in Task 1 (impl), Task 8 (mock + consumer).
- `expanded` is `defineModel<boolean>("expanded", { default: () => props.defaultExpanded ?? false })` in Task 13 impl and tested via `v-model:expanded` in the harness.
- `select` emit is `(event: "select", value: string) => void` in Task 14 impl and asserted via `emitted("select")` in the test.
- Option type `{ value: string; label: string }` consistent between Task 14 impl and test fixture.
