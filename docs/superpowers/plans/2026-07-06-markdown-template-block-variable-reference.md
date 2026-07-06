# Markdown template block variable reference — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Markdown template block's "Template file" setting a "Supported variables." link that opens a block-scoped reference modal, matching the other templates' UX.

**Architecture:** Lift three already-journal-neutral primitives (`VariableChip`, `DateModificationsModal`, `I18nWithSlot`) out of `src/journals/settings/ui/` into shared homes, then add a new self-contained variables modal owned by the markdown-template block that reuses them. No `views → journals` coupling; no journal-only variables shown.

**Tech Stack:** Vue 3 `<script setup>` SFCs, Awilix-style DI (`@/infrastructure/di`), `ModalService` (`@/infrastructure/host/modals`), Paraglide i18n (`messages/en.json` → `npm run compile:i18n`), Vitest + `@testing-library/vue` + `@testing-library/user-event`.

## Global Constraints

- Quality gates after every task: `npm run test`, `npm run check:types`, `npm run check:lint` (npm, not pnpm). Runtime-touching UI change → run the wdio e2e suite once at the end (see final verification).
- `defineModal()` may appear only in a `**/ui/modals.ts` file (eslint `no-restricted-syntax`).
- Never use `eslint-disable`; never add a `Co-Authored-By` trailer; commit to the current branch `v3-ai` (do not branch).
- Shared UI is imported by **direct path** (e.g. `@/templates/ui/VariableChip.vue`), never through the `templates` engine barrel (`src/templates/index.ts`).
- After any edit to `messages/en.json`, run `npm run compile:i18n` before type-checking (the `m.*` functions are generated; `src/i18n/paraglide/` is git-ignored).
- `en.json` is the source locale; other locales fall back to it, so new keys go only in `en.json`.
- Vue imports follow eslint `import-x/order`: internal `@/**` group (alphabetized) → sibling `./` → parent `../` → `import type` last.

---

### Task 1: Relocate shared primitives to neutral homes

Pure refactor — no behavior change. The relocated tests are the regression guard. Keep every intermediate import resolvable, run the suite once, commit once.

**Files:**

- Move: `src/journals/settings/ui/I18nWithSlot.vue` → `src/ui/I18nWithSlot.vue`
- Move: `src/journals/settings/ui/i18n-with-slot.ts` → `src/ui/i18n-with-slot.ts`
- Move: `src/journals/settings/ui/I18nWithSlot.test.ts` → `src/ui/I18nWithSlot.test.ts`
- Move: `src/journals/settings/ui/VariableChip.vue` → `src/templates/ui/VariableChip.vue`
- Move: `src/journals/settings/ui/VariableChip.test.ts` → `src/templates/ui/VariableChip.test.ts`
- Move: `src/journals/settings/ui/DateModificationsModal.vue` → `src/templates/ui/DateModificationsModal.vue`
- Move: `src/journals/settings/ui/DateModificationsModal.test.ts` → `src/templates/ui/DateModificationsModal.test.ts`
- Create: `src/templates/ui/modals.ts`
- Modify: `src/journals/settings/ui/modals.ts` (remove `dateModificationsModal` + its import)
- Modify: `src/journals/settings/ui/VariableReferenceModal.vue` (import paths)
- Modify: `src/journals/settings/ui/TemplaterSupportHint.vue` (import path)
- Modify: `src/journals/settings/ui/VariableReferenceHint.vue` (import path)
- Modify: `src/journals/settings/ui/VariableReferenceHint.test.ts` (import path)

**Interfaces:**

- Produces: `@/templates/ui/VariableChip.vue` (default export; prop `name: string`), `@/templates/ui/DateModificationsModal.vue` (default export; no props), `@/templates/ui/modals.ts` → `export const dateModificationsModal` (a `defineModal()` handle opened with `{}` props), `@/ui/I18nWithSlot.vue` (default export; prop `message: I18nMessageFn`), `@/ui/i18n-with-slot.ts` → `export type I18nMessageFn`.

- [ ] **Step 1: Move the files with git (history-preserving)**

Run:

```bash
cd /home/ruyu/projects/obsidian-journal
mkdir -p src/templates/ui
git mv src/journals/settings/ui/I18nWithSlot.vue src/ui/I18nWithSlot.vue
git mv src/journals/settings/ui/i18n-with-slot.ts src/ui/i18n-with-slot.ts
git mv src/journals/settings/ui/I18nWithSlot.test.ts src/ui/I18nWithSlot.test.ts
git mv src/journals/settings/ui/VariableChip.vue src/templates/ui/VariableChip.vue
git mv src/journals/settings/ui/VariableChip.test.ts src/templates/ui/VariableChip.test.ts
git mv src/journals/settings/ui/DateModificationsModal.vue src/templates/ui/DateModificationsModal.vue
git mv src/journals/settings/ui/DateModificationsModal.test.ts src/templates/ui/DateModificationsModal.test.ts
```

`I18nWithSlot.vue` imports `./i18n-with-slot` and `I18nWithSlot.test.ts` imports `./I18nWithSlot.vue`; both counterparts moved together, so those relative imports stay valid. `VariableChip.test.ts` and `DateModificationsModal.test.ts` likewise import `./<component>.vue` siblings that moved with them.

- [ ] **Step 2: Fix imports inside the moved `DateModificationsModal.vue`**

In `src/templates/ui/DateModificationsModal.vue`, replace the import block:

```vue
import { m } from "@/i18n"; import I18nWithSlot from "./I18nWithSlot.vue"; import VariableChip from
"./VariableChip.vue";
```

with:

```vue
import { m } from "@/i18n"; import I18nWithSlot from "@/ui/I18nWithSlot.vue"; import VariableChip from
"./VariableChip.vue";
```

(`VariableChip` is now a sibling in `src/templates/ui/`; `I18nWithSlot` moved to `@/ui/`.)

- [ ] **Step 3: Create `src/templates/ui/modals.ts` with the moved modal definition**

```ts
import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import DateModificationsModal from "./DateModificationsModal.vue";

export const dateModificationsModal = defineModal()({
  component: DateModificationsModal,
  title: () => m.variable_modifications_modal_title(),
});
```

- [ ] **Step 4: Remove the modal from the journals `modals.ts`**

In `src/journals/settings/ui/modals.ts`, delete the import line:

```ts
import DateModificationsModal from "./DateModificationsModal.vue";
```

and delete the definition:

```ts
export const dateModificationsModal = defineModal()({
  component: DateModificationsModal,
  title: () => m.variable_modifications_modal_title(),
});
```

- [ ] **Step 5: Update the remaining journals importers**

In `src/journals/settings/ui/VariableReferenceModal.vue`, change:

```vue
import I18nWithSlot from "./I18nWithSlot.vue"; import VariableChip from "./VariableChip.vue";
```

to:

```vue
import VariableChip from "@/templates/ui/VariableChip.vue"; import I18nWithSlot from "@/ui/I18nWithSlot.vue";
```

(Place both in the `@/` internal group, alphabetized: `@/templates/...` before `@/ui/...`. Keep the existing `import { m } from "@/i18n";` and the `./modals` type import in their current groups.)

In `src/journals/settings/ui/TemplaterSupportHint.vue`, change:

```vue
import I18nWithSlot from "./I18nWithSlot.vue";
```

to:

```vue
import I18nWithSlot from "@/ui/I18nWithSlot.vue";
```

In `src/journals/settings/ui/VariableReferenceHint.vue`, split the modal import. Change:

```vue
import { dateModificationsModal, variableReferenceModal } from "./modals";
```

to:

```vue
import { dateModificationsModal } from "@/templates/ui/modals"; import { variableReferenceModal } from "./modals";
```

(`@/templates/ui/modals` goes in the internal `@/` group; `./modals` stays sibling.)

In `src/journals/settings/ui/VariableReferenceHint.test.ts`, change:

```ts
import { dateModificationsModal, variableReferenceModal } from "./modals";
```

to:

```ts
import { dateModificationsModal } from "@/templates/ui/modals";

import { variableReferenceModal } from "./modals";
```

(Match the existing import grouping in that file — internal `@/` imports before sibling `./` imports.)

- [ ] **Step 6: Run the full gates to confirm the refactor is green**

Run:

```bash
npm run test && npm run check:types && npm run check:lint
```

Expected: PASS. The moved tests (`VariableChip.test.ts`, `DateModificationsModal.test.ts`, `I18nWithSlot.test.ts`) run from their new paths; `VariableReferenceHint.test.ts` still passes with the split import.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: relocate variable-reference primitives to shared homes"
```

---

### Task 2: Block-scoped variables modal

**Files:**

- Create: `src/views/blocks/markdown-template/ui/MarkdownTemplateVariablesModal.vue`
- Create: `src/views/blocks/markdown-template/ui/modals.ts`
- Create: `src/views/blocks/markdown-template/ui/MarkdownTemplateVariablesModal.test.ts`
- Modify: `messages/en.json` (add modal + variable-description keys)

**Interfaces:**

- Consumes: `@/templates/ui/VariableChip.vue`, `@/templates/ui/modals.ts` → `dateModificationsModal`, `useModalService` from `@/infrastructure/host/modals`.
- Produces: `./modals` → `export const markdownTemplateVariablesModal` (a `defineModal()` handle opened with `{}` props), consumed by Task 3.

- [ ] **Step 1: Add the i18n keys**

In `messages/en.json`, insert these keys immediately after the existing `"view_block_markdown_template_variables_hint": ...` line (leave the `_variables_hint` line in place for now — Task 3 removes it):

```json
  "view_block_markdown_template_variables_modal_title": "Markdown template variables",
  "view_block_markdown_template_variables_intro": "These variables are replaced when the template renders. Dates use YYYY-MM-DD and times use HH:mm unless you give an explicit format.",
  "view_block_markdown_template_variable_date_description": "The date the view is focused on.",
  "view_block_markdown_template_variable_current_date_description": "Today's date at the moment the block renders.",
  "view_block_markdown_template_variable_time_description": "The current wall-clock time when the block renders.",
  "view_block_markdown_template_variable_current_time_description": "The current wall-clock time when the block renders (alias of the time variable).",
  "view_block_markdown_template_variable_journal_link_description": "Resolves to the vault path of another journal's note for the focused date. Wrap it in a link yourself, and add a shift like +1w to point at a neighbouring period.",
```

- [ ] **Step 2: Compile i18n and confirm the keys type-check**

Run:

```bash
npm run compile:i18n && npm run check:types
```

Expected: PASS (new `m.*` functions generated; nothing references them yet).

- [ ] **Step 3: Write the failing test**

Create `src/views/blocks/markdown-template/ui/MarkdownTemplateVariablesModal.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { dateModificationsModal } from "@/templates/ui/modals";

import MarkdownTemplateVariablesModal from "./MarkdownTemplateVariablesModal.vue";

afterEach(() => cleanup());

function mount() {
  const modals = new FakeModalService();
  const container = new Container();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  render(MarkdownTemplateVariablesModal, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
  return { modals };
}

describe("MarkdownTemplateVariablesModal", () => {
  it("lists the journal_link variable", () => {
    mount();
    expect(screen.getByText("{{journal_link(name)}}")).toBeTruthy();
  });

  it("opens the date modifications modal from a variable's modifications link", async () => {
    const { modals } = mount();
    await userEvent.click(screen.getAllByRole("link", { name: /additional modifications/i })[0]);
    expect(modals.lastOpen().definition).toBe(dateModificationsModal);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run:

```bash
npm run test -- src/views/blocks/markdown-template/ui/MarkdownTemplateVariablesModal.test.ts
```

Expected: FAIL — module `./MarkdownTemplateVariablesModal.vue` and `./modals` do not exist yet.

- [ ] **Step 5: Create the modal definition file**

Create `src/views/blocks/markdown-template/ui/modals.ts`:

```ts
import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import MarkdownTemplateVariablesModal from "./MarkdownTemplateVariablesModal.vue";

export const markdownTemplateVariablesModal = defineModal()({
  component: MarkdownTemplateVariablesModal,
  title: () => m.view_block_markdown_template_variables_modal_title(),
});
```

- [ ] **Step 6: Create the modal component**

Create `src/views/blocks/markdown-template/ui/MarkdownTemplateVariablesModal.vue`:

```vue
<script setup lang="ts">
import { m } from "@/i18n";
import { useModalService } from "@/infrastructure/host/modals";
import { dateModificationsModal } from "@/templates/ui/modals";
import VariableChip from "@/templates/ui/VariableChip.vue";

const modals = useModalService();

function showModifications(event: Event): void {
  event.preventDefault();
  void modals.open(dateModificationsModal, {});
}
</script>

<template>
  <div class="markdown-template-variables">
    <p>{{ m.view_block_markdown_template_variables_intro() }}</p>
    <dl class="markdown-template-variables__list">
      <div class="markdown-template-variables__row">
        <dt><VariableChip name="date" /></dt>
        <dd>
          {{ m.view_block_markdown_template_variable_date_description() }}
          <a href="#" @click="showModifications">{{ m.journal_edit_variable_additional_modifications_link() }}</a>
        </dd>
      </div>
      <div class="markdown-template-variables__row">
        <dt><VariableChip name="current_date" /></dt>
        <dd>
          {{ m.view_block_markdown_template_variable_current_date_description() }}
          <a href="#" @click="showModifications">{{ m.journal_edit_variable_additional_modifications_link() }}</a>
        </dd>
      </div>
      <div class="markdown-template-variables__row">
        <dt><VariableChip name="time" /></dt>
        <dd>
          {{ m.view_block_markdown_template_variable_time_description() }}
          <a href="#" @click="showModifications">{{ m.journal_edit_variable_additional_modifications_link() }}</a>
        </dd>
      </div>
      <div class="markdown-template-variables__row">
        <dt><VariableChip name="current_time" /></dt>
        <dd>
          {{ m.view_block_markdown_template_variable_current_time_description() }}
          <a href="#" @click="showModifications">{{ m.journal_edit_variable_additional_modifications_link() }}</a>
        </dd>
      </div>
      <div class="markdown-template-variables__row">
        <dt><VariableChip name="journal_link(name)" /></dt>
        <dd>{{ m.view_block_markdown_template_variable_journal_link_description() }}</dd>
      </div>
    </dl>
    <p>
      <a href="https://momentjs.com/docs/#/displaying/format/" target="_blank" rel="noopener">
        {{ m.common_moment_format_reference() }}
      </a>
    </p>
  </div>
</template>

<style scoped>
.markdown-template-variables__list {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 0.75em;
  row-gap: 0.75em;
  align-items: baseline;
}
.markdown-template-variables__row {
  display: contents;
}
</style>
```

- [ ] **Step 7: Run the test to verify it passes**

Run:

```bash
npm run test -- src/views/blocks/markdown-template/ui/MarkdownTemplateVariablesModal.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run the full gates**

Run:

```bash
npm run check:types && npm run check:lint
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(views): add markdown template block variable reference modal"
```

---

### Task 3: Wire the "Supported variables." link into the block config

**Files:**

- Modify: `src/views/blocks/markdown-template/ui/MarkdownTemplateBlockConfig.vue`
- Modify: `src/views/blocks/markdown-template/ui/MarkdownTemplateBlockConfig.test.ts`
- Modify: `messages/en.json` (add link key, remove obsolete hint key)

**Interfaces:**

- Consumes: `./modals` → `markdownTemplateVariablesModal` (from Task 2), `useModalService` from `@/infrastructure/host/modals`.

- [ ] **Step 1: Swap the i18n keys**

In `messages/en.json`, remove the obsolete line:

```json
  "view_block_markdown_template_variables_hint": "Available: \\{\\{date\\}\\}, \\{\\{current_date\\}\\}, \\{\\{time\\}\\}, \\{\\{journal_link(journal-name)\\}\\}. Wrap links like [[\\{\\{journal_link(daily)\\}\\}]].",
```

and add the link-text key next to the other `view_block_markdown_template_variables_*` keys:

```json
  "view_block_markdown_template_variables_link": "Supported variables.",
```

- [ ] **Step 2: Compile i18n**

Run:

```bash
npm run compile:i18n
```

Expected: success (regenerates messages; `m.view_block_markdown_template_variables_hint` no longer exists — the config edit in Step 4 stops referencing it).

- [ ] **Step 3: Update the config test**

Replace the entire contents of `src/views/blocks/markdown-template/ui/MarkdownTemplateBlockConfig.test.ts` with:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { InputSuggestService, NotesService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNotesService } from "@/infrastructure/host/testing";

import { markdownTemplateVariablesModal } from "./modals";
import MarkdownTemplateBlockConfig from "./MarkdownTemplateBlockConfig.vue";

import type { MarkdownTemplateConfig } from "../markdown-template-block";

afterEach(() => cleanup());

function mountConfig(config: MarkdownTemplateConfig, onChange: (next: MarkdownTemplateConfig) => void) {
  const notes = new FakeNotesService();
  notes.seed("templates/daily.md" as never);
  const modals = new FakeModalService();
  const container = new Container();
  container.register(NotesService).useValue(notes as unknown as NotesService);
  container.register(InputSuggestService).useValue(new FakeInputSuggestService() as unknown as InputSuggestService);
  container.register(ModalService).useValue(modals as unknown as ModalService);
  render(MarkdownTemplateBlockConfig, {
    props: { config, onChange },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
  return { modals };
}

describe("MarkdownTemplateBlockConfig", () => {
  it("emits onChange with the new path when the file input changes", async () => {
    const onChange = vi.fn();
    mountConfig({ templatePath: "" }, onChange);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "templates/daily.md");
    expect(onChange).toHaveBeenLastCalledWith({ templatePath: "templates/daily.md" });
  });

  it("opens the variables reference modal when the supported-variables link is clicked", async () => {
    const { modals } = mountConfig({ templatePath: "" }, vi.fn());
    await userEvent.click(screen.getByRole("link"));
    expect(modals.lastOpen().definition).toBe(markdownTemplateVariablesModal);
  });
});
```

- [ ] **Step 4: Run the test to verify the new case fails**

Run:

```bash
npm run test -- src/views/blocks/markdown-template/ui/MarkdownTemplateBlockConfig.test.ts
```

Expected: the "opens the variables reference modal" test FAILS — the config renders no link yet (`getByRole("link")` throws).

- [ ] **Step 5: Update the config component**

Replace the entire contents of `src/views/blocks/markdown-template/ui/MarkdownTemplateBlockConfig.vue` with:

```vue
<script setup lang="ts">
import { m } from "@/i18n";
import { useModalService } from "@/infrastructure/host/modals";
import UiFileInput from "@/ui/UiFileInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { markdownTemplateVariablesModal } from "./modals";

import type { MarkdownTemplateConfig, MarkdownTemplateConfigChange } from "../markdown-template-block";

const props = defineProps<{ config: MarkdownTemplateConfig; onChange: MarkdownTemplateConfigChange }>();

const modals = useModalService();

const update = (patch: Partial<MarkdownTemplateConfig>): void => props.onChange({ ...props.config, ...patch });

function showVariables(event: Event): void {
  event.preventDefault();
  void modals.open(markdownTemplateVariablesModal, {});
}
</script>

<template>
  <UiSettingRow>
    <template #name>{{ m.view_block_markdown_template_path_label() }}</template>
    <template #description>
      <a href="#" @click="showVariables">{{ m.view_block_markdown_template_variables_link() }}</a>
    </template>
    <UiFileInput
      :model-value="config.templatePath"
      :placeholder="m.view_block_markdown_template_path_placeholder()"
      @update:model-value="(value: string) => update({ templatePath: value })"
    />
  </UiSettingRow>
</template>
```

- [ ] **Step 6: Run the config tests to verify they pass**

Run:

```bash
npm run test -- src/views/blocks/markdown-template/ui/MarkdownTemplateBlockConfig.test.ts
```

Expected: PASS (both cases).

- [ ] **Step 7: Run the full gates**

Run:

```bash
npm run test && npm run check:types && npm run check:lint
```

Expected: PASS. In particular, no reference to the removed `view_block_markdown_template_variables_hint` remains.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(views): link markdown template block config to variable reference"
```

---

## Final verification (runtime UI change)

- [ ] **Run the wdio e2e suite once** to confirm the block config renders and the modal stacks correctly on top of the "Edit block" modal at runtime.

Run:

```bash
npm run test:e2e
```

Expected: PASS. If the e2e script name differs, check `package.json` `scripts` for the wdio entry and run that.

Manual smoke (optional, if a dev vault is handy): add a Markdown template block to a view, open its config, click "Supported variables.", confirm the modal lists `date`, `current_date`, `time`, `current_time`, `journal_link(name)`, and that "additional modifications" opens the date-modifications modal on top.

---

## Self-review notes

- **Spec coverage:** §1 lift → Task 1; §2 block modal + block-local `modals.ts` → Task 2; §2 config link → Task 3; §3 i18n add/remove → Tasks 2 & 3; §4 tests + gates → each task's test steps + final e2e. `I18nWithSlot → src/ui/` and block-local `modals.ts` decisions are realized in Tasks 1 and 2 respectively.
- **Type consistency:** `markdownTemplateVariablesModal` and `dateModificationsModal` are both `defineModal()` handles opened with `{}`; `VariableChip` prop is `name: string` throughout; `useModalService()` returns the `ModalService` used in all three consumers.
- **No journal-only variables** appear in the block modal (no `journal_name`, cycle, or numbering rows) — matches the block's real render context.
