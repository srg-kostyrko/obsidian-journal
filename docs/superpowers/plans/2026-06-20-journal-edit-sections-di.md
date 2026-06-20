# Journal Edit Sections → DI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the five hardcoded sections of the journal settings subpage into `JournalEditSection`s registered through `JournalEditSectionToken`, so the subpage is a header plus one sorted `v-for`, the Shelf section sorts first, and the Shelf section hides when no shelves exist.

**Architecture:** Each core section becomes a self-contained `.vue` component under `src/journals/settings/ui/sections/` that takes a `journalName` prop, resolves its own `config` via `JournalsViewModel`, owns its `expanded` ref, and recomputes its own derived values. The journals module registers these into the same `JournalEditSectionToken` the external feature modules already use. All section `order` values are renumbered with gaps of 10.

**Tech Stack:** Vue 3 `<script setup>` SFCs, valibot-inferred config types, custom DI (`useService`/`Container`), Vitest + @testing-library/vue + user-event.

## Global Constraints

- Commands are npm: `npm test`, `npm run check:types`, `npm run check:lint`. Run all three after the final task; run `npm test -- --run <pattern>` per task.
- Tests colocate as `*.test.ts` beside the implementation. One behavior per test; subject+verb behavior names; nested `describe()` for scope (no dashes/colons).
- Component tests use @testing-library/vue + user-event; query by visible text/label, never by CSS class or test-only `data-*`.
- No wiring/DI-registration tests. No barrel-shape tests.
- Inline `defineProps<{...}>()` in SFCs; no named `XxxProps` interface.
- Do not wrap `m.*()` in `computed()` unless args include reactive data.
- Commit to the current branch (`v3-ai`). No new branches. No `Co-Authored-By` trailer.
- Errors (if any) live in the feature's `errors.ts`, never inline.

## Convention used in this plan

Several template blocks move **verbatim** from the current `src/journals/settings/ui/JournalEditSubpage.vue`. Where a step says _"move template lines N–M verbatim"_, copy those exact lines from the pre-refactor file unchanged into the new component's `<template>`. The `<script setup>` and `<style>` blocks below are the genuinely rewritten code and are given in full.

Line numbers below refer to the **pre-refactor** `JournalEditSubpage.vue` (491 lines). As you remove blocks the numbers shift, so extract sections **bottom-up within each task by anchoring on the unique `v-model:expanded` ref name**, not by re-counting lines.

---

## Task 1: Renumber existing section orders

Pure renumber so the gaps `20–60` are free for the core sections and Shelf sorts first. No behavior change.

**Files:**

- Modify: `src/shelves/module.ts` (shelf `order: 5` → `10`)
- Modify: `src/commands/module.ts` (journal `order: 10` → `70`; leave the `ShelfEditSectionToken` order untouched)
- Modify: `src/code-blocks/nav/settings/module.ts` (`order: 40` → `80`)
- Modify: `src/views/module.ts` (`interval-block` `order: 41` → `90`)
- Modify: `src/decorations/settings/module.ts` (`order: 50` → `100`)

**Interfaces:**

- Produces: final `JournalEditSection` order map — Shelf 10, NoteCreation 20, Templates 30, Timeline 40, Sequence 50, Frontmatter 60, Commands 70, Nav 80, Interval 90, Decorations 100.

- [ ] **Step 1: Edit the five module files**

In `src/shelves/module.ts`:

```ts
c.register(JournalEditSectionToken).useValue(
  defineJournalEditSection({ key: "shelf", component: JournalShelfSection, order: 10 }),
);
```

In `src/commands/module.ts` (only the `JournalEditSectionToken` one):

```ts
c.register(JournalEditSectionToken).useValue(
  defineJournalEditSection({ key: "commands", component: JournalCommandsSection, order: 70 }),
);
```

In `src/code-blocks/nav/settings/module.ts`:

```ts
      defineJournalEditSection({ key: "nav-block", order: 80, component: NavBlockSection }),
```

In `src/views/module.ts`:

```ts
      defineJournalEditSection({ key: "interval-block", order: 90, component: IntervalBlockSection }),
```

In `src/decorations/settings/module.ts`:

```ts
      defineJournalEditSection({ key: "decorations", order: 100, component: DecorationsSection }),
```

- [ ] **Step 2: Verify nothing asserts the old numbers**

Run: `grep -rn "order: 5\b\|order: 40\b\|order: 41\b\|order: 50\b" src/ --include=*.ts | grep -i editsection`
Expected: no matches.

- [ ] **Step 3: Typecheck**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/shelves/module.ts src/commands/module.ts src/code-blocks/nav/settings/module.ts src/views/module.ts src/decorations/settings/module.ts
git commit -m "refactor(journals): renumber edit-section orders with gaps"
```

---

## Task 2: Hide Shelf section when no shelves exist

Independent of the extraction. Adds a domain query and gates the component.

**Files:**

- Modify: `src/shelves/service.ts` (add `hasShelves()`)
- Test: `src/shelves/service.test.ts` (add `hasShelves` describe)
- Modify: `src/shelves/ui/JournalShelfSection.vue` (gate with `v-if`)
- Test: `src/shelves/ui/JournalShelfSection.test.ts` (add hidden-when-empty test)

**Interfaces:**

- Produces: `ShelvesService.hasShelves(): boolean`.

- [ ] **Step 1: Write the failing service test**

Add inside `describe("ShelvesService", () => { ... })` in `src/shelves/service.test.ts`:

```ts
describe("hasShelves", () => {
  it("returns false when no shelves exist", () => {
    const { service } = setup({ shelves: {} });
    expect(service.hasShelves()).toBe(false);
  });

  it("returns true when at least one shelf exists", () => {
    const { service } = setup({ shelves: { Personal: shelf("Personal") } });
    expect(service.hasShelves()).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- --run src/shelves/service.test.ts`
Expected: FAIL — `service.hasShelves is not a function`.

- [ ] **Step 3: Implement `hasShelves`**

In `src/shelves/service.ts`, add after `shelfOf`:

```ts
  hasShelves(): boolean {
    return !this.#shelves.find().ids().next().done;
  }
```

(`find().ids()` returns a single-use iterator; `.next().done === false` means at least one id exists, avoiding materializing the list.)

- [ ] **Step 4: Run the service test**

Run: `npm test -- --run src/shelves/service.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing component test**

Add inside `describe("JournalShelfSection", ...)` in `src/shelves/ui/JournalShelfSection.test.ts`:

```ts
it("renders nothing when no shelves exist", async () => {
  const { container } = await setup({});
  mount(container, "daily");
  expect(screen.queryByText(m.common_label_shelf())).toBeNull();
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm test -- --run src/shelves/ui/JournalShelfSection.test.ts`
Expected: FAIL — the heading still renders.

- [ ] **Step 7: Gate the section**

In `src/shelves/ui/JournalShelfSection.vue` script, add after `currentShelf`:

```ts
const hasShelves = computed(() => shelvesService.hasShelves());
```

Wrap the root element:

```vue
<template>
  <UiCollapsibleBlock v-if="hasShelves" v-model:expanded="expanded"></UiCollapsibleBlock>
</template>
```

(`computed` is already imported.)

- [ ] **Step 8: Run the component test**

Run: `npm test -- --run src/shelves/ui/JournalShelfSection.test.ts`
Expected: PASS (existing tests seed a shelf, so they still pass).

- [ ] **Step 9: Commit**

```bash
git add src/shelves/service.ts src/shelves/service.test.ts src/shelves/ui/JournalShelfSection.vue src/shelves/ui/JournalShelfSection.test.ts
git commit -m "feat(shelves): hide journal shelf section when no shelves exist"
```

---

## Task 3: Extract NoteCreationSection

**Files:**

- Create: `src/journals/settings/ui/sections/NoteCreationSection.vue`
- Create: `src/journals/settings/ui/sections/NoteCreationSection.test.ts`
- Modify: `src/journals/module.ts` (register section)
- Modify: `src/journals/settings/ui/JournalEditSubpage.vue` (remove inline block + now-dead script)
- Modify: `src/journals/settings/ui/JournalEditSubpage.test.ts` (move note-creation tests out)

**Interfaces:**

- Consumes: `JournalEditSectionToken`, `defineJournalEditSection` from `./settings/ui/journal-edit-section`.
- Produces: `NoteCreationSection` default export; registered with `key: "note-creation", order: 20`.

- [ ] **Step 1: Create the component**

`src/journals/settings/ui/sections/NoteCreationSection.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { icons } from "@/ui/icons";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { JournalsViewModel } from "../../../view-model";
import DateFormatPreview from "../DateFormatPreview.vue";
import FolderInput from "../FolderInput.vue";
import FolderPathPreview from "../FolderPathPreview.vue";
import NoteNamePreview from "../NoteNamePreview.vue";
import { useAutoCreateOnEnable } from "../use-auto-create-on-enable";
import { useInvertibilityCheck } from "../use-invertibility-check";
import { extractFromDateFormat, extractFromNameTemplate } from "../use-folder-extractor";
import VariableReferenceHint from "../VariableReferenceHint.vue";

import type { JournalConfig } from "../../../config";

const { journalName } = defineProps<{ journalName: string }>();

const journalsVM = useService(JournalsViewModel);
const config = computed<JournalConfig | undefined>(() => journalsVM.getJournal(journalName).getOr(undefined as never));
useAutoCreateOnEnable(config);

const expanded = ref(true);

const hasCycle = computed(() => config.value !== undefined && config.value.write.type !== "day");
const numberingVariableNames = computed<readonly string[]>(() =>
  config.value?.numbering.enabled ? config.value.numbering.sources.map((source) => source.variable) : [],
);

const nameTemplateRef = computed(() => config.value?.nameTemplate ?? "");
const invertibility = useInvertibilityCheck(nameTemplateRef);

function applyNameTemplateRecommendation(): void {
  if (config.value) extractFromNameTemplate(config.value);
}
function applyDateFormatRecommendation(): void {
  if (config.value) extractFromDateFormat(config.value);
}
</script>

<template>
  <!-- move template lines 185–261 verbatim (the <UiCollapsibleBlock v-model:expanded="noteCreationOpen"> … </UiCollapsibleBlock> block), then rename v-model:expanded="noteCreationOpen" to v-model:expanded="expanded" -->
</template>

<style scoped>
.journal-section-heading {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2-2);
  font-weight: var(--font-semibold);
}
.journal-hint {
  color: var(--text-warning);
}
.journal-recommendation {
  color: var(--text-warning);
  padding: var(--size-2-2) 0;
}
</style>
```

Then paste lines 185–261 into the `<template>` and change the single `v-model:expanded="noteCreationOpen"` to `v-model:expanded="expanded"`.

- [ ] **Step 2: Register the section**

In `src/journals/module.ts`:

- Add imports at top:

```ts
import { JournalEditSectionToken, defineJournalEditSection } from "./settings/ui/journal-edit-section";
import NoteCreationSection from "./settings/ui/sections/NoteCreationSection.vue";
```

- Add inside `register(c)`:

```ts
c.register(JournalEditSectionToken).useValue(
  defineJournalEditSection({ key: "note-creation", order: 20, component: NoteCreationSection }),
);
```

- [ ] **Step 3: Remove the inline block from the subpage**

In `JournalEditSubpage.vue`:

- Delete the `<UiCollapsibleBlock v-model:expanded="noteCreationOpen"> … </UiCollapsibleBlock>` block (template lines 185–261).
- Delete now-unused script: `const noteCreationOpen = ref(true)`; `useAutoCreateOnEnable(config)`; `hasCycle`/`numberingVariableNames` **only if no remaining inline section uses them** (Templates still uses both until Task 4 — keep them for now); `nameTemplateRef`, `invertibility`, `applyNameTemplateRecommendation`, `applyDateFormatRecommendation`, and the `useInvertibilityCheck`, `extractFrom*`, `NoteNamePreview`, `FolderPathPreview`, `DateFormatPreview` imports if unused elsewhere.
- Let `npm run check:lint` (no-unused) be the authority on which imports/consts to drop.

- [ ] **Step 4: Write the section test**

`src/journals/settings/ui/sections/NoteCreationSection.test.ts` — use the lightweight single-section harness (mirrors `DecorationsSection.test.ts`):

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, describe, expect, it } from "vitest";
import { reactive } from "vue";

import { installTestCalendar } from "@/calendar/testing";
import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { NotesService, TemplaterService } from "@/infrastructure/host";
import { FakeNotesService, FakeTemplaterService } from "@/infrastructure/host/testing";
import {
  JournalsRepository,
  JournalsViewModel,
  NotePathService,
  journalDefaultsFor,
  type JournalConfig,
  type JournalsEvents,
} from "@/journals";
import { AutoCreateService } from "@/journals/notes/auto-create";
import { TemplateEngine } from "@/templates";
import { installTestEngine } from "@/templates/testing";

import NoteCreationSection from "./NoteCreationSection.vue";

let teardown: () => void;
beforeEach(() => {
  ({ teardown } = installTestCalendar());
});
afterEach(() => {
  teardown();
  cleanup();
});

function mount(overrides: Partial<JournalConfig> = {}) {
  const container = new Container();
  const storage = reactive<Record<string, JournalConfig>>({
    daily: { ...journalDefaultsFor({ type: "day" }, "daily"), ...overrides },
  });
  const repo = JournalsRepository.fromParts(storage, createNanoEvents<JournalsEvents>());
  container.register(JournalsRepository).useValue(repo);
  container.register(JournalsViewModel).useValue(JournalsViewModel.fromRepository(repo));
  container.register(NotePathService).useClass(NotePathService);
  container.register(TemplateEngine).useValue(installTestEngine());
  container.register(TemplaterService).useValue(new FakeTemplaterService() as unknown as TemplaterService);
  container.register(NotesService).useValue(new FakeNotesService() as unknown as NotesService);
  container
    .register(AutoCreateService)
    .useValue({ createCurrent: () => Promise.resolve() } as unknown as AutoCreateService);
  render(NoteCreationSection, {
    props: { journalName: "daily" },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
  return { storage };
}

describe("NoteCreationSection", () => {
  it("persists nameTemplate edits to the journal config", async () => {
    const { storage } = mount();
    const input = screen.getByDisplayValue("{{date}}");
    await userEvent.clear(input);
    await userEvent.type(input, "log-{{date}}");
    expect(storage.daily?.nameTemplate).toBe("log-{{date}}");
  });

  it("shows the move-to-folder recommendation when nameTemplate contains a slash", async () => {
    mount({ nameTemplate: "logs/{{date}}" });
    expect(screen.getByText(m.journal_edit_move_to_folder_recommendation_name_template())).toBeTruthy();
  });

  it("moves the path prefix from nameTemplate to folder when the recommendation is applied", async () => {
    const { storage } = mount({ nameTemplate: "logs/{{date}}", folder: "" });
    await userEvent.click(screen.getByText(m.journal_edit_move_to_folder_apply_link()));
    expect(storage.daily?.folder).toContain("logs");
    expect(storage.daily?.nameTemplate).not.toContain("logs/");
  });
});
```

Then **relocate** the remaining note-creation assertions currently in `JournalEditSubpage.test.ts` (`describe("note creation collapsible")` cases: renders the five fields, auto-create confirmation skip wording, invertibility warning, live note-name preview, plus the top-level `persists changes to dateFormat`, the two dateFormat move-to-folder cases) into this file, adapting them to the lightweight `mount` above (no `nav`, query by visible text). Drop any that only re-assert framework behavior.

- [ ] **Step 5: Run the section test**

Run: `npm test -- --run src/journals/settings/ui/sections/NoteCreationSection.test.ts`
Expected: PASS.

- [ ] **Step 6: Delete the moved tests from the subpage test**

Remove the relocated cases from `JournalEditSubpage.test.ts` (the entire `describe("note creation collapsible")`, the `persists changes to dateFormat` test, and the two dateFormat move-to-folder tests).

- [ ] **Step 7: Run subpage + section tests**

Run: `npm test -- --run src/journals/settings/ui/`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/journals/module.ts src/journals/settings/ui/sections/NoteCreationSection.vue src/journals/settings/ui/sections/NoteCreationSection.test.ts src/journals/settings/ui/JournalEditSubpage.vue src/journals/settings/ui/JournalEditSubpage.test.ts
git commit -m "refactor(journals): extract NoteCreationSection as a DI edit section"
```

---

## Task 4: Extract TemplatesSection

**Files:**

- Create: `src/journals/settings/ui/sections/TemplatesSection.vue`
- Create: `src/journals/settings/ui/sections/TemplatesSection.test.ts`
- Modify: `src/journals/module.ts`
- Modify: `src/journals/settings/ui/JournalEditSubpage.vue`
- Modify: `src/journals/settings/ui/JournalEditSubpage.test.ts`

**Interfaces:**

- Produces: `TemplatesSection` registered with `key: "templates", order: 30`.

- [ ] **Step 1: Create the component**

`src/journals/settings/ui/sections/TemplatesSection.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiFileInput from "@/ui/UiFileInput.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { JournalsViewModel } from "../../../view-model";
import CodeBlockReferenceHint from "../CodeBlockReferenceHint.vue";
import TemplatePathPreview from "../TemplatePathPreview.vue";
import TemplaterSupportHint from "../TemplaterSupportHint.vue";
import VariableReferenceHint from "../VariableReferenceHint.vue";

import type { JournalConfig } from "../../../config";

const { journalName } = defineProps<{ journalName: string }>();

const journalsVM = useService(JournalsViewModel);
const config = computed<JournalConfig | undefined>(() => journalsVM.getJournal(journalName).getOr(undefined as never));

const expanded = ref(false);

const hasCycle = computed(() => config.value !== undefined && config.value.write.type !== "day");
const numberingVariableNames = computed<readonly string[]>(() =>
  config.value?.numbering.enabled ? config.value.numbering.sources.map((source) => source.variable) : [],
);

function addTemplate(): void {
  if (!config.value) return;
  config.value.templates.push("");
  expanded.value = true;
}
function removeTemplate(index: number): void {
  if (!config.value) return;
  config.value.templates.splice(index, 1);
}
</script>

<template>
  <!-- move template lines 263–304 verbatim, renaming v-model:expanded="templatesOpen" to "expanded" -->
</template>

<style scoped>
.grow {
  flex-grow: 1;
}
</style>
```

Paste lines 263–304 into `<template>` and rename `templatesOpen` → `expanded`.

- [ ] **Step 2: Register**

In `src/journals/module.ts` add import and registration:

```ts
import TemplatesSection from "./settings/ui/sections/TemplatesSection.vue";
```

```ts
c.register(JournalEditSectionToken).useValue(
  defineJournalEditSection({ key: "templates", order: 30, component: TemplatesSection }),
);
```

- [ ] **Step 3: Remove from subpage**

Delete the templates `<UiCollapsibleBlock>` block, `templatesOpen`, `addTemplate`, `removeTemplate`, and now-unused `hasCycle`/`numberingVariableNames`/`VariableReferenceHint`/`UiFileInput`/`UiIconedRow`/`CodeBlockReferenceHint`/`TemplaterSupportHint`/`TemplatePathPreview` imports (lint confirms).

- [ ] **Step 4: Write the section test**

`src/journals/settings/ui/sections/TemplatesSection.test.ts` — reuse the lightweight `mount` shape from Task 3 (only `JournalsRepository`/`JournalsViewModel` + a `Flows`/host fakes as needed; templates section needs `InputSuggestService` fake for `UiFileInput` — register `FakeInputSuggestService`). Relocate from `JournalEditSubpage.test.ts` `describe("templates collapsible")`:

```ts
describe("TemplatesSection", () => {
  it("renders the section heading with the template count", async () => {
    mount({ templates: ["a.md", "b.md"] });
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("appends an empty entry when Add template is clicked", async () => {
    const { storage } = mount({ templates: [] });
    await userEvent.click(screen.getByText(m.journal_edit_template_add_button()));
    expect(storage.daily?.templates).toEqual([""]);
  });

  it("removes an entry when its trash button is clicked", async () => {
    const { storage } = mount({ templates: ["a.md"] });
    await userEvent.click(screen.getByLabelText(m.journal_edit_template_remove_tooltip()));
    expect(storage.daily?.templates).toEqual([]);
  });
});
```

Also relocate "renders the template path preview only when the path contains a variable" if it still reflects observable behavior.

- [ ] **Step 5: Run the section test**

Run: `npm test -- --run src/journals/settings/ui/sections/TemplatesSection.test.ts`
Expected: PASS.

- [ ] **Step 6: Delete moved tests from subpage test**

Remove `describe("templates collapsible")` from `JournalEditSubpage.test.ts`.

- [ ] **Step 7: Run dir tests**

Run: `npm test -- --run src/journals/settings/ui/`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/journals/module.ts src/journals/settings/ui/sections/TemplatesSection.vue src/journals/settings/ui/sections/TemplatesSection.test.ts src/journals/settings/ui/JournalEditSubpage.vue src/journals/settings/ui/JournalEditSubpage.test.ts
git commit -m "refactor(journals): extract TemplatesSection as a DI edit section"
```

---

## Task 5: Extract TimelineSection

**Files:**

- Create: `src/journals/settings/ui/sections/TimelineSection.vue`
- Create: `src/journals/settings/ui/sections/TimelineSection.test.ts`
- Modify: `src/journals/module.ts`, `JournalEditSubpage.vue`, `JournalEditSubpage.test.ts`

**Interfaces:**

- Produces: `TimelineSection` registered with `key: "timeline", order: 40`.

- [ ] **Step 1: Create the component**

`src/journals/settings/ui/sections/TimelineSection.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";

import { CalendarDate, OpenInterval, type AnchorString } from "@/calendar";
import { DatePicker, type Picking } from "@/calendar/ui";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { icons } from "@/ui/icons";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { JournalsViewModel } from "../../../view-model";
import { useAnchorField } from "../use-anchor-field";

import type { JournalConfig, TimelineEnd } from "../../../config";

const { journalName } = defineProps<{ journalName: string }>();

const journalsVM = useService(JournalsViewModel);
const config = computed<JournalConfig | undefined>(() => journalsVM.getJournal(journalName).getOr(undefined as never));

const expanded = ref(false);

const startPicking = computed<Picking>(() =>
  config.value?.write.type === "custom" ? "day" : (config.value?.write.type ?? "day"),
);

const startAnchorRef = computed<AnchorString>({
  get: () => config.value?.timeline.start ?? ("" as AnchorString),
  set: (v) => {
    if (config.value) config.value.timeline.start = v;
  },
});
const startModel = useAnchorField({ anchor: startAnchorRef, picking: startPicking });

const endAnchorRef = computed<AnchorString>({
  get: () => (config.value?.timeline.end.kind === "date" ? config.value.timeline.end.date : ("" as AnchorString)),
  set: (v) => {
    if (config.value?.timeline.end.kind === "date") config.value.timeline.end.date = v;
  },
});
const endModel = useAnchorField({ anchor: endAnchorRef, picking: startPicking });

const endBounds = computed<OpenInterval | undefined>(() => {
  const start = config.value?.timeline.start;
  return start ? OpenInterval.from(CalendarDate.fromAnchor(start)) : undefined;
});

function clearStart(): void {
  if (config.value && config.value.write.type !== "custom") {
    startModel.value = null;
  }
}
function setEndKind(kind: TimelineEnd["kind"]): void {
  if (!config.value) return;
  if (kind === "never") config.value.timeline.end = { kind: "never" };
  else if (kind === "date") config.value.timeline.end = { kind: "date", date: "" as never };
  else config.value.timeline.end = { kind: "repeats", count: 1 };
}
</script>

<template>
  <!-- move template lines 306–356 verbatim, renaming v-model:expanded="timelineOpen" to "expanded" -->
</template>

<style scoped>
.journal-section-heading {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2-2);
  font-weight: var(--font-semibold);
}
.journal-hint {
  color: var(--text-warning);
}
</style>
```

Paste lines 306–356 and rename `timelineOpen` → `expanded`.

- [ ] **Step 2: Register**

```ts
import TimelineSection from "./settings/ui/sections/TimelineSection.vue";
```

```ts
c.register(JournalEditSectionToken).useValue(
  defineJournalEditSection({ key: "timeline", order: 40, component: TimelineSection }),
);
```

- [ ] **Step 3: Remove from subpage**

Delete the timeline block and the start/end anchor script (`startPicking`, `startAnchorRef`, `startModel`, `endAnchorRef`, `endModel`, `endBounds`, `clearStart`, `setEndKind`) plus now-unused calendar imports. Keep `startPicking`-equivalent only if Sequence still needs it inline (it does until Task 6 — Sequence's `numberingAnchorModel` uses `startPicking`; keep a local `startPicking` in the subpage until Task 6 removes Sequence).

- [ ] **Step 4: Write the section test**

`src/journals/settings/ui/sections/TimelineSection.test.ts` — needs `FakeModalService` (DatePicker opens a modal) and `Calendar`/test calendar. Relocate from `JournalEditSubpage.test.ts`: `describe("timeline.start DatePicker")`, `describe("timeline.end.date DatePicker")`, `describe("repeats end mode")`. Mount harness mirrors Task 3 plus:

```ts
container.register(ModalService).useValue(fakeModalService as unknown as ModalService);
container.register(Calendar).useValue(new Calendar());
```

Example relocated case:

```ts
it("writes the picked date to timeline.start", async () => {
  const { storage } = mount({ timeline: { start: "" as AnchorString, end: { kind: "never" } } });
  await userEvent.click(screen.getByText(m.journal_edit_start_writing_label()));
  // open picker, submit via fakeModalService.lastOpen(...).submit(DayPeriod.containing(date("2025-03-15")))
  await waitFor(() => expect(storage.daily?.timeline.start).toBe("2025-03-15"));
});
```

(Reuse the exact submit mechanics from the current subpage test.)

- [ ] **Step 5: Run the section test**

Run: `npm test -- --run src/journals/settings/ui/sections/TimelineSection.test.ts`
Expected: PASS.

- [ ] **Step 6: Delete moved tests from subpage test**

Remove the three relocated `describe` blocks.

- [ ] **Step 7: Run dir tests**

Run: `npm test -- --run src/journals/settings/ui/`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/journals/module.ts src/journals/settings/ui/sections/TimelineSection.vue src/journals/settings/ui/sections/TimelineSection.test.ts src/journals/settings/ui/JournalEditSubpage.vue src/journals/settings/ui/JournalEditSubpage.test.ts
git commit -m "refactor(journals): extract TimelineSection as a DI edit section"
```

---

## Task 6: Extract SequenceSection

**Files:**

- Create: `src/journals/settings/ui/sections/SequenceSection.vue`
- Create: `src/journals/settings/ui/sections/SequenceSection.test.ts`
- Modify: `src/journals/module.ts`, `JournalEditSubpage.vue`, `JournalEditSubpage.test.ts`

**Interfaces:**

- Produces: `SequenceSection` registered with `key: "sequence", order: 50`.

- [ ] **Step 1: Create the component**

`src/journals/settings/ui/sections/SequenceSection.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";

import { type AnchorString } from "@/calendar";
import { DatePicker, type Picking } from "@/calendar/ui";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { icons } from "@/ui/icons";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { EditSequencePropertyFlow } from "../../flows/edit-sequence-property.flow";
import { JournalsViewModel } from "../../../view-model";
import { useAnchorField } from "../use-anchor-field";

import type { JournalConfig, NumberingReset } from "../../../config";

const { journalName } = defineProps<{ journalName: string }>();

const flows = useService(Flows);
const journalsVM = useService(JournalsViewModel);
const config = computed<JournalConfig | undefined>(() => journalsVM.getJournal(journalName).getOr(undefined as never));

const expanded = ref(false);

const startPicking = computed<Picking>(() =>
  config.value?.write.type === "custom" ? "day" : (config.value?.write.type ?? "day"),
);
const numberingAnchorRef = computed<AnchorString>({
  get: () => config.value?.numbering.anchorDate ?? ("" as AnchorString),
  set: (v) => {
    if (config.value) config.value.numbering.anchorDate = v;
  },
});
const numberingAnchorModel = useAnchorField({ anchor: numberingAnchorRef, picking: startPicking });

function onSequenceToggle(value: boolean | undefined): void {
  if (!config.value) return;
  config.value.numbering.enabled = value ?? false;
  if (value && config.value.numbering.sources.length === 0) {
    config.value.numbering.sources.push({
      variable: "index",
      frontmatterKey: "journal-index",
      anchorValue: 1,
      reset: { kind: "never" },
    });
  }
}
function setResetKind(kind: NumberingReset["kind"]): void {
  const source = config.value?.numbering.sources[0];
  if (!source) return;
  source.reset = kind === "never" ? { kind: "never" } : { kind: "after", count: 2 };
}
function editSequenceKey(): void {
  void flows.invoke(EditSequencePropertyFlow, { journalName, sourceIndex: 0 });
}
</script>

<template>
  <!-- move template lines 358–417 verbatim, renaming v-model:expanded="sequenceOpen" to "expanded" -->
</template>

<style scoped>
.journal-section-heading {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2-2);
  font-weight: var(--font-semibold);
}
</style>
```

Paste lines 358–417 and rename `sequenceOpen` → `expanded`.

- [ ] **Step 2: Register**

```ts
import SequenceSection from "./settings/ui/sections/SequenceSection.vue";
```

```ts
c.register(JournalEditSectionToken).useValue(
  defineJournalEditSection({ key: "sequence", order: 50, component: SequenceSection }),
);
```

- [ ] **Step 3: Remove from subpage**

Delete the sequence block and `startPicking`, `numberingAnchorRef`, `numberingAnchorModel`, `onSequenceToggle`, `setResetKind`, `editSequenceKey`, the `EditSequencePropertyFlow` import, and (now finally) the local `startPicking`/`useAnchorField`/`DatePicker`/`Picking` imports left over from Task 5.

- [ ] **Step 4: Write the section test**

`src/journals/settings/ui/sections/SequenceSection.test.ts` — needs `NumberingService`-free; mount harness from Task 3 plus `FakeModalService` (numbering anchor picker) and a spied `Flows` for `editSequenceKey`. Relocate from `JournalEditSubpage.test.ts`: `materializes the default source when sequential numbers is toggled on`, `hides the allow-before toggle when start date is set`, `invokes EditSequencePropertyFlow when the sequence property pencil is clicked`, `describe("numbering anchor DatePicker")`.

```ts
it("materializes the default source when sequential numbers is toggled on", async () => {
  const { storage } = mount({
    numbering: { enabled: false, anchorDate: "2024-01-01", allowBefore: false, sources: [] },
  });
  await userEvent.click(screen.getByText(m.journal_edit_section_sequential_numbers()));
  await userEvent.click(screen.getByRole("checkbox"));
  expect(storage.daily?.numbering.sources).toHaveLength(1);
  expect(storage.daily?.numbering.enabled).toBe(true);
});
```

- [ ] **Step 5: Run the section test**

Run: `npm test -- --run src/journals/settings/ui/sections/SequenceSection.test.ts`
Expected: PASS.

- [ ] **Step 6: Delete moved tests from subpage test**

Remove the relocated cases/blocks.

- [ ] **Step 7: Run dir tests**

Run: `npm test -- --run src/journals/settings/ui/`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/journals/module.ts src/journals/settings/ui/sections/SequenceSection.vue src/journals/settings/ui/sections/SequenceSection.test.ts src/journals/settings/ui/JournalEditSubpage.vue src/journals/settings/ui/JournalEditSubpage.test.ts
git commit -m "refactor(journals): extract SequenceSection as a DI edit section"
```

---

## Task 7: Extract FrontmatterSection

**Files:**

- Create: `src/journals/settings/ui/sections/FrontmatterSection.vue`
- Create: `src/journals/settings/ui/sections/FrontmatterSection.test.ts`
- Modify: `src/journals/module.ts`, `JournalEditSubpage.vue`, `JournalEditSubpage.test.ts`

**Interfaces:**

- Produces: `FrontmatterSection` registered with `key: "frontmatter", order: 60`.

- [ ] **Step 1: Create the component**

`src/journals/settings/ui/sections/FrontmatterSection.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { icons } from "@/ui/icons";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { EditFrontmatterFieldFlow } from "../../flows/edit-frontmatter-field.flow";
import { JournalsViewModel } from "../../../view-model";

import type { JournalConfig } from "../../../config";

const { journalName } = defineProps<{ journalName: string }>();

const flows = useService(Flows);
const journalsVM = useService(JournalsViewModel);
const config = computed<JournalConfig | undefined>(() => journalsVM.getJournal(journalName).getOr(undefined as never));

const expanded = ref(false);

function editFm(fieldName: "dateField" | "startDateField" | "endDateField"): void {
  void flows.invoke(EditFrontmatterFieldFlow, { journalName, fieldName });
}
</script>

<template>
  <!-- move template lines 419–463 verbatim, renaming v-model:expanded="frontmatterOpen" to "expanded" -->
</template>

<style scoped>
.journal-section-heading {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2-2);
  font-weight: var(--font-semibold);
}
</style>
```

Paste lines 419–463 and rename `frontmatterOpen` → `expanded`.

- [ ] **Step 2: Register**

```ts
import FrontmatterSection from "./settings/ui/sections/FrontmatterSection.vue";
```

```ts
c.register(JournalEditSectionToken).useValue(
  defineJournalEditSection({ key: "frontmatter", order: 60, component: FrontmatterSection }),
);
```

- [ ] **Step 3: Remove from subpage**

Delete the frontmatter block, `frontmatterOpen`, `editFm`, and the `EditFrontmatterFieldFlow` import.

- [ ] **Step 4: Write the section test**

`src/journals/settings/ui/sections/FrontmatterSection.test.ts` — mount harness from Task 3 plus a spied `Flows`. Relocate `invokes EditFrontmatterFieldFlow when the date-field pencil is clicked`:

```ts
it("invokes EditFrontmatterFieldFlow when the date-field pencil is clicked", async () => {
  const { flows } = mount();
  await userEvent.click(screen.getByText(m.journal_edit_section_frontmatter()));
  await userEvent.click(screen.getByLabelText(`${m.journal_fm_field_label({ field: "dateField" })} edit`));
  expect(flows.invoke).toHaveBeenCalledWith(EditFrontmatterFieldFlow, { journalName: "daily", fieldName: "dateField" });
});
```

- [ ] **Step 5: Run the section test**

Run: `npm test -- --run src/journals/settings/ui/sections/FrontmatterSection.test.ts`
Expected: PASS.

- [ ] **Step 6: Delete moved tests from subpage test**

Remove the relocated case.

- [ ] **Step 7: Run dir tests**

Run: `npm test -- --run src/journals/settings/ui/`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/journals/module.ts src/journals/settings/ui/sections/FrontmatterSection.vue src/journals/settings/ui/sections/FrontmatterSection.test.ts src/journals/settings/ui/JournalEditSubpage.vue src/journals/settings/ui/JournalEditSubpage.test.ts
git commit -m "refactor(journals): extract FrontmatterSection as a DI edit section"
```

---

## Task 8: Finalize subpage + ordering test + full gates

By now `JournalEditSubpage.vue` should contain only the `config` guard, the `nav.back()` watch, the heading row, and the `v-for`. Verify and add an ordering test.

**Files:**

- Modify: `src/journals/settings/ui/JournalEditSubpage.vue` (final shape + dead-style cleanup)
- Modify: `src/journals/settings/ui/JournalEditSubpage.test.ts` (ordering test)

- [ ] **Step 1: Confirm the subpage final shape**

`JournalEditSubpage.vue` `<template>` should be:

```vue
<template>
  <div v-if="config">
    <UiSettingRow heading>
      <template #name>{{ m.journal_edit_header_title({ name: journalName, writing }) }}</template>
      <UiButton @click="bulkAdd">{{ m.bulk_add_command() }}</UiButton>
      <UiIconButton :icon="icons.action.edit" :tooltip="m.journal_edit_rename_tooltip()" @click="rename" />
      <UiIconButton :icon="icons.nav.back" :tooltip="m.journal_edit_back_tooltip()" @click="nav.back()" />
    </UiSettingRow>

    <component :is="section.component" v-for="section in editSections" :key="section.key" :journal-name="journalName" />
  </div>
</template>
```

Script keeps: `flows`, `journalsVM`, `editSections`, `config`, the `watchEffect` guard, `writing`, `rename`, `bulkAdd`. Remove the `.journal-section-heading`/`.journal-hint`/`.journal-recommendation`/`.journal-form-error`/`.grow` scoped styles if no longer referenced (only ones still used by the trimmed template stay — likely none; delete the `<style>` block if empty).

- [ ] **Step 2: Run lint to catch any dead imports/consts**

Run: `npm run check:lint`
Expected: PASS (fix any `no-unused` findings by deleting the dead symbol).

- [ ] **Step 3: Add the ordering test**

Replace the single extension-sections test in `JournalEditSubpage.test.ts` with one asserting registered order:

```ts
describe("JournalEditSubpage section ordering", () => {
  it("renders registered sections in ascending order", async () => {
    const { container } = await setup();
    const make = (label: string) => defineComponent({ setup: () => () => h("div", label) });
    container
      .register(JournalEditSectionToken)
      .useValue(defineJournalEditSection({ key: "b", order: 20, component: make("B") }));
    container
      .register(JournalEditSectionToken)
      .useValue(defineJournalEditSection({ key: "a", order: 10, component: make("A") }));
    mount(container, "daily");
    const a = screen.getByText("A");
    const b = screen.getByText("B");
    expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
```

Keep the header/guard tests (`renders the header`, `calls nav.back when the back button is clicked`, `invokes RenameJournalFlow`, `invokes BulkAddFlow`, `calls nav.back when the underlying journal disappears`). Everything else should already be relocated.

- [ ] **Step 4: Run the subpage test**

Run: `npm test -- --run src/journals/settings/ui/JournalEditSubpage.test.ts`
Expected: PASS.

- [ ] **Step 5: Full gates**

Run: `npm test -- --run && npm run check:types && npm run check:lint`
Expected: all PASS.

- [ ] **Step 6: Manual sanity (optional but recommended)**

Open the journal settings subpage for a journal with at least one shelf: Shelf is the first block, followed by Note Creation → … → Decorations. For a vault with no shelves, the Shelf block is absent and Note Creation is first.

- [ ] **Step 7: Commit**

```bash
git add src/journals/settings/ui/JournalEditSubpage.vue src/journals/settings/ui/JournalEditSubpage.test.ts
git commit -m "refactor(journals): reduce edit subpage to header plus sorted sections"
```

---

## Self-review notes

- **Spec coverage:** uniform DI sections (Tasks 3–8), journals registers its own core sections (Tasks 3–7 module edits), gap-of-10 ordering with Shelf first (Task 1 + per-task orders), hide Shelf when empty (Task 2), tests co-located per section + subpage test shrunk to ordering/header/guard (each task's test steps + Task 8). All spec sections map to tasks.
- **Type consistency:** every new component exposes the same prop `{ journalName: string }` and resolves `config` identically; `hasShelves(): boolean` is defined in Task 2 and consumed only there; registration `key`/`order` values match the spec's order table.
- **Known intermediate state:** during Tasks 3–7 the not-yet-extracted core sections remain inline above the `v-for`, so on-screen order is only fully correct after Task 7; every commit stays green because no test asserts cross-section order until Task 8. This is called out intentionally, not a placeholder.
