# Per-journal interval-block editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users edit each custom journal's `intervalBlock` rows from settings, by generalizing the existing `navBlock` row editor.

**Architecture:** Extract the per-row editor body from `NavBlockSection.vue` into a field-agnostic `NavBlockRowsEditor.vue` (in `code-blocks/nav/settings/ui/`). Make the edit-row flow field-aware. `NavBlockSection.vue` becomes a thin wrapper with full controls; a new `IntervalBlockSection.vue` (in views) wraps the same editor with a subset of controls, gated to custom-write journals, and registers as a journal edit section.

**Tech Stack:** Vue 3.5 SFCs (reactive props destructure), valibot schemas, paraglide i18n (`messages/en.json` → `compile:i18n`), DI multi-tokens, `@testing-library/vue` + `user-event`, vitest.

---

## Context the implementer needs

- **The schema is shared.** `intervalBlock` and `navBlock` on `JournalConfig` are both `navBlockSchema` (`src/journals/config.ts:102`). `config.navBlock` and `config.intervalBlock` are interchangeable for editing.
- **Sections receive only `journalName`.** `JournalEditSubpage.vue:448` renders each registered section as `<component :is="section.component" :journal-name="journalName" />`. That is why each field needs its own wrapper component.
- **The dependency direction views → code-blocks/nav already exists** (`CustomIntervalsBlock.vue:5-6`). Importing `NavBlockRowsEditor` from views is fine. Do NOT move the editor into `journals/` (would risk a cycle through `NavBlockRow`).
- **i18n workflow:** edit `messages/en.json`, then run `npm run compile:i18n` to regenerate `src/i18n/paraglide/`. Only then are new `m.*` keys available to TypeScript.
- **Quality gates (run before every commit that touches code):** `npm run test`, `npm run check:types`, `npm run check:lint`. There is no e2e suite.
- **Conventions:** inline `m.*()` in templates (no `computed` wrapper); inline `defineProps<{...}>()` with reactive destructure + defaults; one behavior per test; assert observable outcomes; testing-library queries (no CSS-class / `data-*` selectors).

---

## File structure

**Create:**

- `src/code-blocks/nav/settings/ui/NavBlockRowsEditor.vue` — field-agnostic editor (mode/use-defaults optional)
- `src/code-blocks/nav/settings/ui/NavBlockRowsEditor.test.ts` — covers the intervalBlock field + subset controls
- `src/views/blocks/custom-intervals/ui/IntervalBlockSection.vue` — custom-only wrapper for `intervalBlock`
- `src/views/blocks/custom-intervals/ui/IntervalBlockSection.test.ts` — gating behavior

**Modify:**

- `src/code-blocks/nav/settings/flows/edit-nav-row.flow.ts` — add `field` param
- `src/code-blocks/nav/settings/flows/edit-nav-row.flow.test.ts` — add intervalBlock write-back test
- `src/code-blocks/nav/settings/ui/NavBlockSection.vue` — becomes a thin wrapper
- `src/code-blocks/nav/settings/ui/NavBlockSection.test.ts` — updated i18n keys + `field` in invoke assertions
- `messages/en.json` — rename shared row keys to `block_rows_*`, reword empty, add interval title
- `src/views/module.ts` — register `IntervalBlockSection` as a `JournalEditSectionToken`

---

## Task 1: Make the edit-row flow field-aware

**Files:**

- Modify: `src/code-blocks/nav/settings/flows/edit-nav-row.flow.ts`
- Test: `src/code-blocks/nav/settings/flows/edit-nav-row.flow.test.ts`

- [ ] **Step 1: Add the failing test for intervalBlock write-back**

In `edit-nav-row.flow.test.ts`, add the import and a builder near the existing `buildJournal`, then a test inside the `describe("EditNavBlockRowFlow", ...)` block:

```ts
// add to the import from "@/calendar" (create the import line if absent):
import type { AnchorString } from "@/calendar";

function buildCustomJournal(name: string, rows: NavBlockRow[]): JournalConfig {
  const base = journalDefaultsFor(
    { type: "custom", every: "day", duration: 1, anchorDate: "2026-01-01" as AnchorString },
    name,
  );
  return { ...base, intervalBlock: { ...base.intervalBlock, rows } };
}
```

```ts
it("appends to intervalBlock rows when the field is intervalBlock", async () => {
  const { flows, modals, storage } = build({ custom: buildCustomJournal("custom", [sampleRow]) });
  const promise = flows.invoke(EditNavBlockRowFlow, { journalName: "custom", field: "intervalBlock" });
  modals.lastOpen<{ journalName: string }, { row: NavBlockRow }>().submit({ row: sampleRow });
  const result = await promise;
  expect(result.kind === "ok" && result.value.index).toBe(1);
  expect(storage.custom?.intervalBlock.rows.length).toBe(2);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- edit-nav-row.flow`
Expected: FAIL — the new test fails because the flow always writes `navBlock`, and `intervalBlock.rows.length` stays `1`. (TypeScript will also flag `field` as an unknown property — that is part of the failure.)

- [ ] **Step 3: Generalize the flow**

In `edit-nav-row.flow.ts`, replace the params interface and the `execute` body. Full new file content:

```ts
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt } from "@/infrastructure/result";
import { JournalsRepository, UnknownJournalError, toJournalFlowError, type NavBlockRow } from "@/journals";

import { UnknownNavRowError, toNavRowFlowError } from "../errors";
import { editNavBlockRowModal } from "../ui/modals";

export interface EditNavBlockRowParameters {
  journalName: string;
  field?: "navBlock" | "intervalBlock";
  rowIndex?: number;
}

export interface EditNavBlockRowResult {
  row: NavBlockRow;
  index: number;
}

export class EditNavBlockRowFlow implements Flow<EditNavBlockRowParameters, EditNavBlockRowResult, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #repository = inject(JournalsRepository);

  execute(parameters: EditNavBlockRowParameters): AsyncResult<EditNavBlockRowResult, FlowError> {
    const field = parameters.field ?? "navBlock";
    const configOption = this.#repository.get(parameters.journalName);
    if (configOption.isNone()) {
      return AsyncResult.err(toJournalFlowError(new UnknownJournalError(parameters.journalName)));
    }
    const config = configOption.getOr(undefined as never);
    const rowIndex = parameters.rowIndex;
    const isEdit = rowIndex !== undefined;
    if (isEdit && (rowIndex < 0 || rowIndex >= config[field].rows.length)) {
      return AsyncResult.err(toNavRowFlowError(new UnknownNavRowError(parameters.journalName, rowIndex)));
    }
    const existing = isEdit ? config[field].rows[rowIndex] : undefined;
    return attempt.in(this, async function* (this: EditNavBlockRowFlow) {
      const submitted = yield* this.#modals
        .open(editNavBlockRowModal, { journalName: parameters.journalName, row: existing })
        .mapErr(() => new UserAborted("edit-nav-block-row-modal"));
      const nextRows = isEdit
        ? config[field].rows.map((r, i) => (i === rowIndex ? submitted.row : r))
        : [...config[field].rows, submitted.row];
      const nextBlock = { ...config[field], rows: nextRows };
      this.#repository.update(
        parameters.journalName,
        field === "navBlock" ? { navBlock: nextBlock } : { intervalBlock: nextBlock },
      );
      const newIndex = isEdit ? rowIndex : config[field].rows.length;
      return { row: submitted.row, index: newIndex };
    });
  }
}
```

(The `field === "navBlock" ? {...} : {...}` ternary keeps the repository patch typed as `Partial<JournalConfig>` — a computed `{ [field]: ... }` key would produce a string index signature that does not assign cleanly.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- edit-nav-row.flow`
Expected: PASS — all existing tests plus the new intervalBlock test pass. (Existing tests omit `field`, so they exercise the `"navBlock"` default.)

- [ ] **Step 5: Type-check**

Run: `npm run check:types`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/code-blocks/nav/settings/flows/edit-nav-row.flow.ts src/code-blocks/nav/settings/flows/edit-nav-row.flow.test.ts
git commit -m "feat(nav-settings): make edit-row flow field-aware (navBlock | intervalBlock)"
```

---

## Task 2: Rename shared row i18n keys and add the interval title

**Files:**

- Modify: `messages/en.json`

This is a pure i18n change done before the component refactor so the new keys exist when the editor references them. The old shared row keys are renamed (delete + add); nav-specific keys (`title`, `mode_label`, `mode_option`, `use_defaults`) stay.

- [ ] **Step 1: Confirm the shared keys are only used by NavBlockSection**

Run: `grep -rn "nav_block_section_\(decorate_whole_label\|empty\|add_row\|edit_tooltip\|delete_tooltip\|move_up_tooltip\|move_down_tooltip\)" src/`
Expected: matches only in `src/code-blocks/nav/settings/ui/NavBlockSection.vue` and `NavBlockSection.test.ts`. (Both are updated in Task 3.)

- [ ] **Step 2: Edit `messages/en.json`**

Replace these seven entries (currently lines ~67-74):

```json
  "nav_block_section_decorate_whole_label": "Decorate whole block",
  "nav_block_section_use_defaults": "Use defaults for {writeType}",
  "nav_block_section_empty": "No rows. Add one or use the defaults above.",
  "nav_block_section_add_row": "Add row",
  "nav_block_section_edit_tooltip": "Edit row",
  "nav_block_section_delete_tooltip": "Delete row",
  "nav_block_section_move_up_tooltip": "Move up",
  "nav_block_section_move_down_tooltip": "Move down",
```

with (note `nav_block_section_use_defaults` is KEPT; the other six are renamed and `empty` is reworded):

```json
  "nav_block_section_use_defaults": "Use defaults for {writeType}",
  "block_rows_decorate_whole_label": "Decorate whole block",
  "block_rows_empty": "No rows yet. Add one.",
  "block_rows_add_row": "Add row",
  "block_rows_edit_tooltip": "Edit row",
  "block_rows_delete_tooltip": "Delete row",
  "block_rows_move_up_tooltip": "Move up",
  "block_rows_move_down_tooltip": "Move down",
  "interval_block_section_title": "Calendar interval rows",
```

Leave `nav_block_section_title`, `nav_block_section_mode_label`, and `nav_block_section_mode_option` unchanged.

- [ ] **Step 3: Recompile i18n**

Run: `npm run compile:i18n`
Expected: completes without error; `m.block_rows_add_row`, `m.block_rows_empty`, …, and `m.interval_block_section_title` now exist.

- [ ] **Step 4: Commit**

```bash
git add messages/en.json src/i18n/paraglide
git commit -m "i18n: neutralize shared block-row labels, add interval section title"
```

(If `src/i18n/paraglide` is gitignored, `git add` simply adds nothing there — that is fine.)

---

## Task 3: Extract `NavBlockRowsEditor` and reduce `NavBlockSection` to a wrapper

**Files:**

- Create: `src/code-blocks/nav/settings/ui/NavBlockRowsEditor.vue`
- Create: `src/code-blocks/nav/settings/ui/NavBlockRowsEditor.test.ts`
- Modify: `src/code-blocks/nav/settings/ui/NavBlockSection.vue`
- Modify: `src/code-blocks/nav/settings/ui/NavBlockSection.test.ts`

- [ ] **Step 1: Create the field-agnostic editor**

Create `src/code-blocks/nav/settings/ui/NavBlockRowsEditor.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";

import { Clock, type AnchorString } from "@/calendar";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { JournalsViewModel, journalDefaultsFor, type JournalConfig } from "@/journals";
import UiButton from "@/ui/UiButton.vue";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { periodForJournal } from "../../period-for-journal";
import NavBlockRow from "../../ui/NavBlockRow.vue";
import { EditNavBlockRowFlow } from "../flows/edit-nav-row.flow";

const {
  journalName,
  field,
  title,
  icon,
  mode = false,
  useDefaults = false,
} = defineProps<{
  journalName: string;
  field: "navBlock" | "intervalBlock";
  title: string;
  icon: string;
  mode?: boolean;
  useDefaults?: boolean;
}>();

const flows = useService(Flows);
const journalsVM = useService(JournalsViewModel);

const config = computed<JournalConfig | undefined>(() => journalsVM.getJournal(journalName).getOr(undefined as never));
const expanded = ref(false);

const todayAnchor = computed(() => Clock.now().format("YYYY-MM-DD") as AnchorString);
const previewPeriod = computed(() =>
  config.value ? periodForJournal(config.value.write, todayAnchor.value) : undefined,
);

function applyDefaults(): void {
  if (!config.value) return;
  config.value[field].rows = journalDefaultsFor(config.value.write, config.value.name)[field].rows;
}

function add(): void {
  void flows.invoke(EditNavBlockRowFlow, { journalName, field });
}
function edit(index: number): void {
  void flows.invoke(EditNavBlockRowFlow, { journalName, field, rowIndex: index });
}
function remove(index: number): void {
  config.value?.[field].rows.splice(index, 1);
}
function moveUp(index: number): void {
  const rows = config.value?.[field].rows;
  if (!rows || index <= 0) return;
  [rows[index - 1], rows[index]] = [rows[index], rows[index - 1]];
}
function moveDown(index: number): void {
  const rows = config.value?.[field].rows;
  if (!rows || index >= rows.length - 1) return;
  [rows[index], rows[index + 1]] = [rows[index + 1], rows[index]];
}
</script>

<template>
  <UiCollapsibleBlock v-if="config" v-model:expanded="expanded">
    <template #trigger>
      <span class="journal-section-heading">
        <UiIcon :name="icon" />
        <span>{{ title }}</span>
        <span class="count">{{ config[field].rows.length }}</span>
      </span>
    </template>
    <template #controls>
      <UiButton @click="add">{{ m.block_rows_add_row() }}</UiButton>
    </template>

    <UiSettingRow v-if="mode" :name="m.nav_block_section_mode_label()">
      <UiDropdown v-model="config[field].type">
        <option value="create">{{ m.nav_block_section_mode_option({ kind: "create" }) }}</option>
        <option value="existing">{{ m.nav_block_section_mode_option({ kind: "existing" }) }}</option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow :name="m.block_rows_decorate_whole_label()">
      <UiToggle v-model="config[field].decorateWholeBlock" />
    </UiSettingRow>

    <UiSettingRow v-if="useDefaults && config[field].rows.length === 0" controls-only>
      <UiButton @click="applyDefaults">
        {{ m.nav_block_section_use_defaults({ writeType: config.write.type }) }}
      </UiButton>
    </UiSettingRow>

    <UiSettingRow v-if="config[field].rows.length === 0" no-controls>
      <template #description>{{ m.block_rows_empty() }}</template>
    </UiSettingRow>

    <UiSettingRow v-for="(row, index) of config[field].rows" :key="index">
      <template #description>
        <div class="nav-row-preview">
          <NavBlockRow
            :journal="config"
            :row="row"
            :ref-date="todayAnchor"
            :period="previewPeriod!"
            :prevent-navigation="true"
          />
        </div>
      </template>
      <UiIconButton v-if="index > 0" icon="arrow-up" :tooltip="m.block_rows_move_up_tooltip()" @click="moveUp(index)" />
      <UiIconButton
        v-if="index < config[field].rows.length - 1"
        icon="arrow-down"
        :tooltip="m.block_rows_move_down_tooltip()"
        @click="moveDown(index)"
      />
      <UiIconButton icon="pencil" :tooltip="m.block_rows_edit_tooltip()" @click="edit(index)" />
      <UiIconButton icon="trash" :tooltip="m.block_rows_delete_tooltip()" @click="remove(index)" />
    </UiSettingRow>
  </UiCollapsibleBlock>
</template>

<style scoped>
.journal-section-heading {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2-2);
  font-weight: var(--font-semibold);
}
.count {
  font-weight: normal;
  color: var(--text-muted);
}
.nav-row-preview {
  display: flex;
  justify-content: center;
  max-width: 240px;
  margin: 0 auto;
}
</style>
```

- [ ] **Step 2: Replace `NavBlockSection.vue` with a thin wrapper**

Overwrite `src/code-blocks/nav/settings/ui/NavBlockSection.vue` entirely:

```vue
<script setup lang="ts">
import { m } from "@/i18n";

import NavBlockRowsEditor from "./NavBlockRowsEditor.vue";

const { journalName } = defineProps<{ journalName: string }>();
</script>

<template>
  <NavBlockRowsEditor
    :journal-name="journalName"
    field="navBlock"
    :title="m.nav_block_section_title()"
    icon="signpost-big"
    mode
    use-defaults
  />
</template>
```

- [ ] **Step 3: Update `NavBlockSection.test.ts` for renamed keys and the `field` argument**

In `src/code-blocks/nav/settings/ui/NavBlockSection.test.ts`, apply these replacements (the mount helper and imports stay the same):

- `m.nav_block_section_empty()` → `m.block_rows_empty()`
- `m.nav_block_section_add_row()` → `m.block_rows_add_row()`
- `m.nav_block_section_edit_tooltip()` → `m.block_rows_edit_tooltip()`
- `m.nav_block_section_delete_tooltip()` → `m.block_rows_delete_tooltip()`
- `m.nav_block_section_move_up_tooltip()` → `m.block_rows_move_up_tooltip()`
- `m.nav_block_section_move_down_tooltip()` → `m.block_rows_move_down_tooltip()`
- Leave `m.nav_block_section_title()` and `m.nav_block_section_use_defaults({ writeType: "day" })` unchanged.

Then update the two invoke assertions to include `field: "navBlock"`:

```ts
expect(invoke).toHaveBeenCalledWith(EditNavBlockRowFlow, { journalName: "daily", field: "navBlock", rowIndex: 0 });
```

```ts
expect(invoke).toHaveBeenCalledWith(EditNavBlockRowFlow, { journalName: "daily", field: "navBlock" });
```

- [ ] **Step 4: Write the editor test (intervalBlock + subset controls)**

Create `src/code-blocks/nav/settings/ui/NavBlockRowsEditor.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

import { Calendar, type AnchorString } from "@/calendar";
import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { WorkspaceService } from "@/infrastructure/host";
import {
  CycleService,
  JournalsIndex,
  JournalsRepository,
  JournalsViewModel,
  journalDefaultsFor,
  type JournalConfig,
  type JournalsEvents,
  type NavBlockRow,
} from "@/journals";
import { ShelvesRepository, type ShelvesEvents } from "@/shelves";
import { TemplateEngine } from "@/templates";

import { EditNavBlockRowFlow } from "../flows/edit-nav-row.flow";

import NavBlockRowsEditor from "./NavBlockRowsEditor.vue";

afterEach(() => cleanup());

const TITLE = "Interval rows";

function buildCustomJournal(name: string, rows: NavBlockRow[]): JournalConfig {
  const base = journalDefaultsFor(
    { type: "custom", every: "day", duration: 1, anchorDate: "2026-01-01" as AnchorString },
    name,
  );
  return { ...base, intervalBlock: { ...base.intervalBlock, rows } };
}

function mount(rows: NavBlockRow[]) {
  const container = new Container();
  const storage = reactive<Record<string, JournalConfig>>({ daily: buildCustomJournal("daily", rows) });
  const repo = JournalsRepository.fromParts(storage, createNanoEvents<JournalsEvents>());
  const shelvesRepo = ShelvesRepository.fromParts(
    reactive({ home: { name: "home", journals: ["daily"] } }),
    createNanoEvents<ShelvesEvents>(),
  );
  const invoke = vi.fn();
  container.register(JournalsRepository).useValue(repo);
  container.register(JournalsViewModel).useValue(JournalsViewModel.fromRepository(repo));
  container.register(ShelvesRepository).useValue(shelvesRepo);
  container.register(Flows).useValue({ invoke } as unknown as Flows);
  container.register(Calendar).useValue(new Calendar());
  container.register(TemplateEngine).useClass(TemplateEngine);
  container.register(CycleService).useClass(CycleService);
  container.register(JournalsIndex).useClass(JournalsIndex);
  container.register(WorkspaceService).useValue({} as WorkspaceService);
  render(NavBlockRowsEditor, {
    props: { journalName: "daily", field: "intervalBlock", title: TITLE, icon: "list" },
    global: {
      plugins: [{ install: (app) => provideInjectorOnApp(app, container) }],
    },
  });
  return { storage, invoke };
}

const sampleRow: NavBlockRow = {
  template: "{{date:YYYY}}",
  fontSize: 1,
  bold: false,
  italic: false,
  color: { type: "theme", name: "text-normal" },
  background: { type: "transparent" },
  link: "none",
  journal: "",
  addDecorations: false,
};

describe("NavBlockRowsEditor", () => {
  it("hides the mode dropdown when mode is not enabled", async () => {
    mount([sampleRow]);
    await userEvent.click(screen.getByText(TITLE));
    expect(screen.queryByText(m.nav_block_section_mode_label())).toBeNull();
  });

  it("hides the use-defaults button when useDefaults is not enabled", async () => {
    mount([]);
    await userEvent.click(screen.getByText(TITLE));
    expect(screen.queryByText(m.nav_block_section_use_defaults({ writeType: "custom" }))).toBeNull();
  });

  it("invokes the flow with the intervalBlock field when 'add row' is clicked", async () => {
    const { invoke } = mount([sampleRow]);
    await userEvent.click(screen.getByText(TITLE));
    await userEvent.click(screen.getByText(m.block_rows_add_row()));
    expect(invoke).toHaveBeenCalledWith(EditNavBlockRowFlow, { journalName: "daily", field: "intervalBlock" });
  });

  it("invokes the flow with the intervalBlock field and rowIndex when edit is clicked", async () => {
    const { invoke } = mount([sampleRow]);
    await userEvent.click(screen.getByText(TITLE));
    await userEvent.click(screen.getByLabelText(m.block_rows_edit_tooltip()));
    expect(invoke).toHaveBeenCalledWith(EditNavBlockRowFlow, {
      journalName: "daily",
      field: "intervalBlock",
      rowIndex: 0,
    });
  });

  it("removes a row from intervalBlock when its delete button is clicked", async () => {
    const { storage } = mount([sampleRow, { ...sampleRow, template: "{{date:MM}}" }]);
    await userEvent.click(screen.getByText(TITLE));
    const deleteButtons = screen.getAllByLabelText(m.block_rows_delete_tooltip());
    await userEvent.click(deleteButtons[0]);
    expect(storage.daily?.intervalBlock.rows.map((r) => r.template)).toEqual(["{{date:MM}}"]);
  });

  it("toggles decorateWholeBlock on intervalBlock", async () => {
    const { storage } = mount([sampleRow]);
    await userEvent.click(screen.getByText(TITLE));
    await userEvent.click(screen.getByRole("checkbox"));
    expect(storage.daily?.intervalBlock.decorateWholeBlock).toBe(true);
  });
});
```

- [ ] **Step 5: Run the affected tests**

Run: `npm run test -- NavBlockRowsEditor NavBlockSection`
Expected: PASS — both suites green.

- [ ] **Step 6: Type-check and lint**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/code-blocks/nav/settings/ui/NavBlockRowsEditor.vue \
        src/code-blocks/nav/settings/ui/NavBlockRowsEditor.test.ts \
        src/code-blocks/nav/settings/ui/NavBlockSection.vue \
        src/code-blocks/nav/settings/ui/NavBlockSection.test.ts
git commit -m "refactor(nav-settings): extract field-agnostic NavBlockRowsEditor"
```

---

## Task 4: Add the interval-block section and register it

**Files:**

- Create: `src/views/blocks/custom-intervals/ui/IntervalBlockSection.vue`
- Create: `src/views/blocks/custom-intervals/ui/IntervalBlockSection.test.ts`
- Modify: `src/views/module.ts`

- [ ] **Step 1: Write the gating test**

Create `src/views/blocks/custom-intervals/ui/IntervalBlockSection.test.ts`:

```ts
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

import { Calendar, type AnchorString } from "@/calendar";
import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { WorkspaceService } from "@/infrastructure/host";
import {
  CycleService,
  JournalsIndex,
  JournalsRepository,
  JournalsViewModel,
  journalDefaultsFor,
  type JournalConfig,
  type JournalsEvents,
  type JournalWrite,
} from "@/journals";
import { ShelvesRepository, type ShelvesEvents } from "@/shelves";
import { TemplateEngine } from "@/templates";

import IntervalBlockSection from "./IntervalBlockSection.vue";

afterEach(() => cleanup());

function mount(write: JournalWrite) {
  const container = new Container();
  const storage = reactive<Record<string, JournalConfig>>({ j: journalDefaultsFor(write, "j") });
  const repo = JournalsRepository.fromParts(storage, createNanoEvents<JournalsEvents>());
  const shelvesRepo = ShelvesRepository.fromParts(
    reactive({ home: { name: "home", journals: ["j"] } }),
    createNanoEvents<ShelvesEvents>(),
  );
  container.register(JournalsRepository).useValue(repo);
  container.register(JournalsViewModel).useValue(JournalsViewModel.fromRepository(repo));
  container.register(ShelvesRepository).useValue(shelvesRepo);
  container.register(Flows).useValue({ invoke: vi.fn() } as unknown as Flows);
  container.register(Calendar).useValue(new Calendar());
  container.register(TemplateEngine).useClass(TemplateEngine);
  container.register(CycleService).useClass(CycleService);
  container.register(JournalsIndex).useClass(JournalsIndex);
  container.register(WorkspaceService).useValue({} as WorkspaceService);
  render(IntervalBlockSection, {
    props: { journalName: "j" },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

describe("IntervalBlockSection", () => {
  it("renders the interval editor for a custom-write journal", () => {
    mount({ type: "custom", every: "day", duration: 1, anchorDate: "2026-01-01" as AnchorString });
    expect(screen.getByText(m.interval_block_section_title())).toBeTruthy();
  });

  it("renders nothing for a fixed-write journal", () => {
    mount({ type: "day" });
    expect(screen.queryByText(m.interval_block_section_title())).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- IntervalBlockSection`
Expected: FAIL — `IntervalBlockSection.vue` does not exist (import error).

- [ ] **Step 3: Create the section component**

Create `src/views/blocks/custom-intervals/ui/IntervalBlockSection.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";

import NavBlockRowsEditor from "@/code-blocks/nav/settings/ui/NavBlockRowsEditor.vue";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { JournalsViewModel, type JournalConfig } from "@/journals";

const { journalName } = defineProps<{ journalName: string }>();

const journalsVM = useService(JournalsViewModel);
const config = computed<JournalConfig | undefined>(() => journalsVM.getJournal(journalName).getOr(undefined as never));
const isCustom = computed(() => config.value?.write.type === "custom");
</script>

<template>
  <NavBlockRowsEditor
    v-if="isCustom"
    :journal-name="journalName"
    field="intervalBlock"
    :title="m.interval_block_section_title()"
    icon="list"
  />
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- IntervalBlockSection`
Expected: PASS.

- [ ] **Step 5: Register the section in the views module**

In `src/views/module.ts`, add to the existing import from `@/journals` (or create the import) and register the section. Add this import near the other `@/...` imports:

```ts
import { JournalEditSectionToken, defineJournalEditSection } from "@/journals";
```

Add this import near the other relative imports:

```ts
import IntervalBlockSection from "./blocks/custom-intervals/ui/IntervalBlockSection.vue";
```

Inside `register(c)`, after the `SubpageToken` registration, add:

```ts
c.register(JournalEditSectionToken).useValue(
  defineJournalEditSection({ key: "interval-block", order: 41, component: IntervalBlockSection }),
);
```

- [ ] **Step 6: Verify the module still type-checks and the views suite passes**

Run: `npm run check:types && npm run test -- views`
Expected: no type errors; views tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/views/blocks/custom-intervals/ui/IntervalBlockSection.vue \
        src/views/blocks/custom-intervals/ui/IntervalBlockSection.test.ts \
        src/views/module.ts
git commit -m "feat(views): per-journal interval-block editor section (custom journals)"
```

---

## Task 5: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all green. If lint flags an unused old i18n key or import, remove it and re-run.

- [ ] **Step 2: Confirm no stale references to renamed keys remain**

Run: `grep -rn "nav_block_section_\(decorate_whole_label\|empty\|add_row\|edit_tooltip\|delete_tooltip\|move_up_tooltip\|move_down_tooltip\)" src/ messages/`
Expected: no matches.

- [ ] **Step 3: Commit if Step 1 required any fixes**

```bash
git add -A
git commit -m "chore(views): finalize interval-block editor"
```

(If Steps 1-2 produced no changes, skip this commit.)

---

## Self-review notes (already applied)

- **Spec coverage:** shared editor extraction (Task 3), field-aware flow (Task 1), subset controls via optional `mode`/`useDefaults` props (Task 3), custom-only gating (Task 4), placement in `code-blocks/nav/settings/` (Task 3), i18n neutralization + interval title (Task 2), views-module registration (Task 4), all four test files (Tasks 1, 3, 4). Out-of-scope items (v2 migration, `config.journals` selector) are intentionally not tasks.
- **Type consistency:** flow param `field?: "navBlock" | "intervalBlock"` and editor prop `field: "navBlock" | "intervalBlock"` match; `EditNavBlockRowFlow` invoke payloads carry `field` everywhere it is asserted; `journalDefaultsFor(write, name)` signature matches all call sites.
- **No placeholders:** every code and command step is concrete.

```

```
