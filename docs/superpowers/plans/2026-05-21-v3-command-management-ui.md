# v3 Command Management UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v3 settings UI for creating, editing, and deleting user commands — a global "Commands" dashboard block and a per-journal section, both backed by the existing `commands` collection.

**Architecture:** Two surfaces (a `DashboardBlockToken` block for `all`-target commands; a journal-editor section, reached through a new `JournalEditSectionToken`, for `journal`-target commands) share one `CommandList` presentational component and one `EditCommandModal`. Mutations run through `EditCommandFlow` / `DeleteCommandFlow`, which open modals and write the collection. The existing `DynamicCommandRegistry` already reconciles Obsidian's registered commands on every collection change, so the UI never touches it.

**Tech Stack:** Vue 3 `<script setup>`, `vee-validate` + `valibot`, the project DI container, paraglide i18n, Vitest + `@testing-library/vue`.

---

## File Structure

**Create:**

- `messages/en.json` — extended with `command_*` messages (existing file).
- `src/commands/ui/command-type-label.ts` — helper turning `(writeType, type, context)` into a human label.
- `src/commands/ui/command-type-label.test.ts`
- `src/ui/UiIconSuggest.vue` — reusable icon picker built on input-suggest.
- `src/commands/ui/CommandList.vue` — shared presentational list.
- `src/commands/ui/CommandList.test.ts`
- `src/commands/ui/EditCommandModal.vue` + `edit-command-modal.ts`
- `src/commands/ui/EditCommandModal.test.ts`
- `src/commands/ui/DeleteCommandModal.vue` + `delete-command-modal.ts`
- `src/commands/ui/DeleteCommandModal.test.ts`
- `src/commands/ui/edit-command.flow.ts` + `edit-command.flow.test.ts`
- `src/commands/ui/delete-command.flow.ts` + `delete-command.flow.test.ts`
- `src/commands/ui/CommandsDashboardBlock.vue` + `CommandsDashboardBlock.test.ts`
- `src/commands/ui/JournalCommandsSection.vue` + `JournalCommandsSection.test.ts`
- `src/journals/settings/ui/journal-edit-section.ts` — the journal-editor extension point.

**Modify:**

- `__mocks__/obsidian.ts` — add `getIconIds`.
- `src/journals/index.ts` — re-export the extension point.
- `src/journals/settings/ui/JournalEditSubpage.vue` — render contributed sections.
- `src/journals/settings/ui/JournalEditSubpage.test.ts` — cover the extension point.
- `src/commands/module.ts` — register flows, the dashboard block, the journal section.

---

## Task 1: i18n messages

**Files:**

- Modify: `messages/en.json`

- [ ] **Step 1: Add the command messages**

Merge the following keys into `messages/en.json`, keeping the file's alphabetical key order (these all sort under the existing `command_open_next` / `command_open_previous` entries and before `common_*`):

```json
  "command_add_modal_title": "Add command",
  "command_context_option": [
    {
      "declarations": ["input context"],
      "selectors": ["context"],
      "match": {
        "context=today": "Today",
        "context=open_note": "Currently open note",
        "context=only_open_note": "Only the open note"
      }
    }
  ],
  "command_dashboard_add": "Add command",
  "command_dashboard_empty": "No global commands created yet.",
  "command_dashboard_section_title": "Commands",
  "command_delete_modal_confirm": "Delete the command \"{name}\"?",
  "command_delete_modal_title": "Delete command",
  "command_edit_modal_title": "Edit command",
  "command_icon_required_error": "Pick an icon to show this command in the ribbon.",
  "command_journal_add": "Add command",
  "command_journal_empty": "No commands created for this journal yet.",
  "command_journal_section_title": "Commands",
  "command_label_today": "Open today's note",
  "command_label_tomorrow": "Open tomorrow's note",
  "command_label_yesterday": "Open yesterday's note",
  "command_list_delete": "Delete command",
  "command_list_edit": "Edit command",
  "command_modal_context_description": "Choose which note's date the command treats as the current date.",
  "command_modal_context_label": "Context",
  "command_modal_context_only_open_note_hint": "Runs only while a journal note is open, using that note's date.",
  "command_modal_context_open_note_hint": "Uses the open journal note's date, or today's date when no journal note is open.",
  "command_modal_icon_label": "Icon",
  "command_modal_name_label": "Name",
  "command_modal_open_mode_label": "Open note",
  "command_modal_ribbon_label": "Show in ribbon",
  "command_modal_type_label": "When the command runs",
  "command_modal_write_type_label": "Note type",
  "command_name_required_error": "Command name is required",
  "command_name_unique_error": "Command name must be unique",
  "command_open_mode_option": [
    {
      "declarations": ["input mode"],
      "selectors": ["mode"],
      "match": {
        "mode=active": "Replacing the active note",
        "mode=tab": "In a new tab",
        "mode=split": "Next to the active note",
        "mode=window": "In a popout window"
      }
    }
  ],
  "command_type_label": [
    {
      "declarations": ["input type", "input writeType"],
      "selectors": ["type"],
      "match": {
        "type=same": "Open current {writeType}'s note",
        "type=next": "Open next {writeType}'s note",
        "type=previous": "Open last {writeType}'s note",
        "type=same_next_week": "Open same {writeType} next week",
        "type=same_previous_week": "Open same {writeType} last week",
        "type=same_next_month": "Open same {writeType} next month",
        "type=same_previous_month": "Open same {writeType} last month",
        "type=same_next_year": "Open same {writeType} next year",
        "type=same_previous_year": "Open same {writeType} last year"
      }
    }
  ],
  "command_write_type_option": [
    {
      "declarations": ["input writeType"],
      "selectors": ["writeType"],
      "match": {
        "writeType=day": "Daily note",
        "writeType=week": "Weekly note",
        "writeType=month": "Monthly note",
        "writeType=quarter": "Quarterly note",
        "writeType=year": "Yearly note",
        "writeType=custom": "Custom note"
      }
    }
  ],
```

- [ ] **Step 2: Compile the messages**

Run: `npm run compile:i18n`
Expected: completes without error; regenerates files under `src/i18n/paraglide`.

- [ ] **Step 3: Verify the messages exist**

Run: `ls src/i18n/paraglide/messages/command_dashboard_section_title.js src/i18n/paraglide/messages/command_type_label.js`
Expected: both files listed (no "No such file").

- [ ] **Step 4: Commit**

```bash
git add messages/en.json src/i18n/paraglide
git commit -m "i18n: add command-management messages"
```

---

## Task 2: `commandTypeLabel` helper

A pure function that ports v2's `resolveCommandLabel`. For a `day` write type it uses the today/tomorrow/yesterday shortcuts; otherwise it composes the generic parameterized label.

**Files:**

- Create: `src/commands/ui/command-type-label.ts`
- Test: `src/commands/ui/command-type-label.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";

import { commandTypeLabel } from "./command-type-label";

describe("commandTypeLabel", () => {
  it("labels a same-type daily command as today", () => {
    expect(commandTypeLabel("day", "same", "today")).toBe(m.command_label_today());
  });

  it("labels a next-type daily command in today context as tomorrow", () => {
    expect(commandTypeLabel("day", "next", "today")).toBe(m.command_label_tomorrow());
  });

  it("labels a previous-type daily command in today context as yesterday", () => {
    expect(commandTypeLabel("day", "previous", "today")).toBe(m.command_label_yesterday());
  });

  it("labels a next-type daily command in open-note context with the generic form", () => {
    expect(commandTypeLabel("day", "next", "open_note")).toBe(m.command_type_label({ type: "next", writeType: "day" }));
  });

  it("labels a non-daily same command with its write type", () => {
    expect(commandTypeLabel("week", "same", "today")).toBe(m.command_type_label({ type: "same", writeType: "week" }));
  });

  it("labels a compound command with its write type", () => {
    expect(commandTypeLabel("month", "same_next_year", "today")).toBe(
      m.command_type_label({ type: "same_next_year", writeType: "month" }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/commands/ui/command-type-label.test.ts`
Expected: FAIL — cannot resolve `./command-type-label`.

- [ ] **Step 3: Write the implementation**

Create `src/commands/ui/command-type-label.ts`:

```ts
import { m } from "@/i18n";
import type { JournalWrite } from "@/journals";

import type { CommandContext, CommandType } from "../config";

export function commandTypeLabel(writeType: JournalWrite["type"], type: CommandType, context: CommandContext): string {
  if (writeType === "day") {
    if (type === "same") return m.command_label_today();
    if (type === "next" && context === "today") return m.command_label_tomorrow();
    if (type === "previous" && context === "today") return m.command_label_yesterday();
  }
  return m.command_type_label({ type, writeType });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/commands/ui/command-type-label.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/commands/ui/command-type-label.ts src/commands/ui/command-type-label.test.ts
git commit -m "feat(commands): add command-type label helper"
```

---

## Task 3: `UiIconSuggest` icon picker

A reusable UI primitive — an input-suggest over Obsidian's icon ids, with a live preview of the selected icon. Per the spec it has no unit test (thin input-suggest wiring). The obsidian test mock needs `getIconIds`, which other components also import indirectly through this one.

**Files:**

- Modify: `__mocks__/obsidian.ts`
- Create: `src/ui/UiIconSuggest.vue`

- [ ] **Step 1: Add `getIconIds` to the obsidian mock**

In `__mocks__/obsidian.ts`, next to the existing `getIcon` export, add:

```ts
export function getIconIds(): string[] {
  return ["calendar", "calendar-days", "book-open", "file-text", "terminal"];
}
```

- [ ] **Step 2: Create the component**

Create `src/ui/UiIconSuggest.vue`:

```vue
<script setup lang="ts">
import { getIconIds } from "obsidian";
import { computed } from "vue";

import { defineInputSuggest, renderIcon } from "@/infrastructure/host";
import UiIcon from "@/ui/UiIcon.vue";
import UiInputSuggestInput from "@/ui/UiInputSuggestInput.vue";

const model = defineModel<string>();
defineProps<{ placeholder?: string; disabled?: boolean }>();

const allIcons = getIconIds();

const definition = computed(() =>
  defineInputSuggest<string>({
    fetch: (query) => {
      const q = query.toLowerCase();
      return allIcons.filter((icon) => icon.toLowerCase().includes(q));
    },
    render: (icon, element) => {
      const svg = renderIcon(icon);
      if (svg) element.append(svg);
      element.append(document.createTextNode(icon));
    },
    toValue: (icon) => icon,
  }),
);
</script>

<template>
  <span class="ui-icon-suggest">
    <UiIcon v-if="model" :name="model" />
    <UiInputSuggestInput
      :model-value="model ?? ''"
      :definition="definition"
      :placeholder="placeholder"
      :disabled="disabled"
      @update:model-value="model = $event"
    />
  </span>
</template>

<style scoped>
.ui-icon-suggest {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2-2);
}
</style>
```

- [ ] **Step 3: Verify types and lint**

Run: `npm run check:types && npm run check:lint`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add __mocks__/obsidian.ts src/ui/UiIconSuggest.vue
git commit -m "feat(ui): add UiIconSuggest icon picker"
```

---

## Task 4: Journal-editor extension point

A DI multi-token plus a `define*` helper, mirroring `defineDashboardBlock` / `DashboardBlockToken`. Lets `commands` contribute a section to the journal editor without `journals` importing `commands`. Like `defineDashboardBlock`, the `define*` helper is a pass-through and is not unit-tested.

**Files:**

- Create: `src/journals/settings/ui/journal-edit-section.ts`
- Modify: `src/journals/index.ts`

- [ ] **Step 1: Create the extension point**

Create `src/journals/settings/ui/journal-edit-section.ts`:

```ts
import { createMultiToken } from "@/infrastructure/di";

import type { Component } from "vue";

export interface JournalEditSection {
  readonly key: string;
  readonly component: Component;
  readonly order: number;
}

export function defineJournalEditSection(section: JournalEditSection): JournalEditSection {
  return section;
}

export const JournalEditSectionToken = createMultiToken<JournalEditSection>("journals.editSection");
```

- [ ] **Step 2: Re-export from the journals barrel**

In `src/journals/index.ts`, add (after the `journalsModule` export):

```ts
export {
  JournalEditSectionToken,
  defineJournalEditSection,
  type JournalEditSection,
} from "./settings/ui/journal-edit-section";
```

- [ ] **Step 3: Verify types and lint**

Run: `npm run check:types && npm run check:lint`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/journals/settings/ui/journal-edit-section.ts src/journals/index.ts
git commit -m "feat(journals): add journal-editor section extension point"
```

---

## Task 5: Render contributed sections in the journal editor

`JournalEditSubpage` resolves `JournalEditSectionToken` and renders each section, sorted by `order`, after its built-in blocks. `useService` on a multi-token returns `[]` when nothing is registered, so existing tests are unaffected.

**Files:**

- Modify: `src/journals/settings/ui/JournalEditSubpage.vue`
- Test: `src/journals/settings/ui/JournalEditSubpage.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/journals/settings/ui/JournalEditSubpage.test.ts`, add two imports to the existing import block at the top of the file (keeping the file's import grouping):

```ts
import { defineComponent, h } from "vue";
```

and, with the other `./` imports:

```ts
import { JournalEditSectionToken, defineJournalEditSection } from "./journal-edit-section";
```

Then add this `describe` block at the end of the file:

```ts
describe("JournalEditSubpage extension sections", () => {
  it("renders sections contributed through JournalEditSectionToken", async () => {
    const { container } = await setup();
    const Stub = defineComponent({
      props: { journalName: { type: String, required: true } },
      setup: (props) => () => h("div", `section for ${props.journalName}`),
    });
    container
      .register(JournalEditSectionToken)
      .useValue(defineJournalEditSection({ key: "stub", component: Stub, order: 1 }));
    mount(container, "daily");
    expect(screen.getByText("section for daily")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/journals/settings/ui/JournalEditSubpage.test.ts -t "renders sections contributed"`
Expected: FAIL — "section for daily" not found.

- [ ] **Step 3: Implement the change**

In `src/journals/settings/ui/JournalEditSubpage.vue`:

Add to the imports (with the other `./` imports):

```ts
import { JournalEditSectionToken } from "./journal-edit-section";
```

In `<script setup>`, after `const flows = useService(Flows);`, add:

```ts
const editSections = [...useService(JournalEditSectionToken)].sort((a, b) => a.order - b.order);
```

`useService` must be called directly in setup (not inside a `computed` getter), because it
calls Vue's `inject` under the hood. The section list is registered once at boot, so a plain
sorted array — not a `computed` — is correct.

In the template, immediately before the final `</div>` that closes `<div v-if="config">`, add:

```html
<component :is="section.component" v-for="section in editSections" :key="section.key" :journal-name="journalName" />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/journals/settings/ui/JournalEditSubpage.test.ts`
Expected: PASS — all tests including the new one.

- [ ] **Step 5: Commit**

```bash
git add src/journals/settings/ui/JournalEditSubpage.vue src/journals/settings/ui/JournalEditSubpage.test.ts
git commit -m "feat(journals): render contributed journal-editor sections"
```

---

## Task 6: `CommandList` presentational component

A pure list: one row per command showing the name and a resolved description flair, with edit/delete buttons, plus an empty-state row. No service access — the parent passes already-filtered entries, each carrying the write type its label needs.

**Files:**

- Create: `src/commands/ui/CommandList.vue`
- Test: `src/commands/ui/CommandList.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import type { CommandConfig } from "../config";

import CommandList from "./CommandList.vue";

afterEach(() => cleanup());

function makeCommand(name: string): CommandConfig {
  return {
    name,
    icon: "",
    showInRibbon: false,
    openMode: "active",
    target: { kind: "all", writeType: "day" },
    type: "same",
    context: "today",
  };
}

describe("CommandList", () => {
  it("shows the empty-state text when there are no entries", () => {
    render(CommandList, { props: { entries: [], emptyText: "nothing here" } });
    expect(screen.getByText("nothing here")).toBeTruthy();
  });

  it("renders a row per command with its name", () => {
    render(CommandList, {
      props: { entries: [["id-1", makeCommand("Open daily"), "day"]], emptyText: "x" },
    });
    expect(screen.getByText("Open daily")).toBeTruthy();
  });

  it("emits edit with the command id when the edit button is clicked", async () => {
    const { emitted } = render(CommandList, {
      props: { entries: [["id-1", makeCommand("Open daily"), "day"]], emptyText: "x" },
    });
    await userEvent.click(screen.getByLabelText(`${m.command_list_edit()} Open daily`));
    expect(emitted().edit).toEqual([["id-1"]]);
  });

  it("emits delete with the command id when the delete button is clicked", async () => {
    const { emitted } = render(CommandList, {
      props: { entries: [["id-1", makeCommand("Open daily"), "day"]], emptyText: "x" },
    });
    await userEvent.click(screen.getByLabelText(`${m.command_list_delete()} Open daily`));
    expect(emitted().delete).toEqual([["id-1"]]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/commands/ui/CommandList.test.ts`
Expected: FAIL — cannot resolve `./CommandList.vue`.

- [ ] **Step 3: Write the component**

Create `src/commands/ui/CommandList.vue`:

```vue
<script setup lang="ts">
import { m } from "@/i18n";
import type { JournalWrite } from "@/journals";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import type { CommandConfig } from "../config";

import { commandTypeLabel } from "./command-type-label";

defineProps<{
  entries: readonly [string, CommandConfig, JournalWrite["type"]][];
  emptyText: string;
}>();
defineEmits<{ edit: [id: string]; delete: [id: string] }>();
</script>

<template>
  <UiSettingRow v-if="entries.length === 0">
    <template #description>{{ emptyText }}</template>
  </UiSettingRow>
  <template v-else>
    <UiSettingRow v-for="[id, command, writeType] in entries" :key="id">
      <template #name>
        {{ command.name }}
        <span class="flair">{{ commandTypeLabel(writeType, command.type, command.context) }}</span>
      </template>
      <UiIconButton icon="pencil" :tooltip="`${m.command_list_edit()} ${command.name}`" @click="$emit('edit', id)" />
      <UiIconButton
        icon="trash-2"
        :tooltip="`${m.command_list_delete()} ${command.name}`"
        @click="$emit('delete', id)"
      />
    </UiSettingRow>
  </template>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/commands/ui/CommandList.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/commands/ui/CommandList.vue src/commands/ui/CommandList.test.ts
git commit -m "feat(commands): add CommandList presentational component"
```

---

## Task 7: `EditCommandModal`

The create/edit form. `name`, `type`, `context`, `showInRibbon`, `icon`, `openMode` are vee-validate fields; `writeType` is a plain `ref` (chosen via dropdown for `all` targets, derived for `journal` targets) because a `journal` target's write type can be `custom`, which is not a valid form-field value. Changing the write type clamps an unsupported `type` back to `same`.

**Files:**

- Create: `src/commands/ui/EditCommandModal.vue`
- Create: `src/commands/ui/edit-command-modal.ts`
- Test: `src/commands/ui/EditCommandModal.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { provideInjectorOnApp } from "@/infrastructure/di";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { createSettingsService } from "@/settings/testing";

import { commandCollection, type CommandConfig, type CommandTarget } from "../config";

import { editCommandModal } from "./edit-command-modal";
import EditCommandModal from "./EditCommandModal.vue";

afterEach(() => cleanup());

function makeJournal(name: string, writeType: "day" | "week") {
  return {
    name,
    write: { type: writeType },
    timeline: { start: "", end: { kind: "never" as const } },
    dateFormat: "YYYY-MM-DD",
    frontmatter: {
      dateField: "journal-date",
      startDateField: "journal-start-date",
      endDateField: "journal-end-date",
      addStartDate: false,
      addEndDate: false,
    },
    numbering: { enabled: false, anchorDate: "", allowBefore: false, sources: [] },
  };
}

async function mountModal(options: {
  command?: CommandConfig;
  target: CommandTarget;
  takenNames?: string[];
  journals?: Record<string, unknown>;
}) {
  const { service: settings, container } = createSettingsService({
    collections: [commandCollection, journalConfigCollection],
    raw: { version: 3, journals: options.journals ?? {} },
  });
  await settings.initialize();
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<CommandConfig> = { submit, cancel };
  render(EditCommandModal, {
    props: { command: options.command, target: options.target, takenNames: options.takenNames ?? [] },
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
            provideModalApiOnApp(app, api as ModalApi<unknown>);
          },
        },
      ],
    },
  });
  return { submit, cancel };
}

describe("editCommandModal definition", () => {
  it("uses the add title when no command is supplied", () => {
    expect(editCommandModal.title({ target: { kind: "all", writeType: "day" }, takenNames: [] })).toBe(
      m.command_add_modal_title(),
    );
  });
});

describe("EditCommandModal", () => {
  it("submits an all-target command with the entered values", async () => {
    const { submit } = await mountModal({ target: { kind: "all", writeType: "day" } });
    await userEvent.type(screen.getByRole("textbox"), "Open today");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        name: "Open today",
        icon: "",
        showInRibbon: false,
        openMode: "active",
        target: { kind: "all", writeType: "day" },
        type: "same",
        context: "today",
      }),
    );
  });

  it("surfaces a required-name error when submitting without a name", async () => {
    const { submit } = await mountModal({ target: { kind: "all", writeType: "day" } });
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => expect(screen.getByText(m.command_name_required_error())).toBeTruthy());
    expect(submit).not.toHaveBeenCalled();
  });

  it("surfaces a unique-name error when the name collides", async () => {
    const { submit } = await mountModal({
      target: { kind: "all", writeType: "day" },
      takenNames: ["Taken"],
    });
    await userEvent.type(screen.getByRole("textbox"), "Taken");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => expect(screen.getByText(m.command_name_unique_error())).toBeTruthy());
    expect(submit).not.toHaveBeenCalled();
  });

  it("requires an icon when show-in-ribbon is enabled", async () => {
    const { submit } = await mountModal({ target: { kind: "all", writeType: "day" } });
    await userEvent.type(screen.getByRole("textbox"), "Ribboned");
    await userEvent.click(screen.getByLabelText(m.command_modal_ribbon_label()));
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => expect(screen.getByText(m.command_icon_required_error())).toBeTruthy());
    expect(submit).not.toHaveBeenCalled();
  });

  it("offers only the supported types for a weekly journal target", async () => {
    await mountModal({
      target: { kind: "journal", journalName: "weekly" },
      journals: { weekly: makeJournal("weekly", "week") },
    });
    const typeSelect = screen.getAllByRole("combobox")[0];
    const optionValues = [...typeSelect.querySelectorAll("option")].map((o) => o.getAttribute("value"));
    expect(optionValues).toEqual(["same", "next", "previous"]);
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = await mountModal({ target: { kind: "all", writeType: "day" } });
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/commands/ui/EditCommandModal.test.ts`
Expected: FAIL — cannot resolve `./edit-command-modal`.

- [ ] **Step 3: Write the modal definition**

Create `src/commands/ui/edit-command-modal.ts`:

```ts
import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import type { CommandConfig, CommandTarget } from "../config";

import EditCommandModal from "./EditCommandModal.vue";

import type { Component } from "vue";

export interface EditCommandModalProps {
  command?: CommandConfig;
  target: CommandTarget;
  takenNames: string[];
}

export const editCommandModal: ModalDefinition<EditCommandModalProps, CommandConfig> = defineModal({
  component: EditCommandModal as Component,
  title: ({ command }: EditCommandModalProps) => (command ? m.command_edit_modal_title() : m.command_add_modal_title()),
});
```

- [ ] **Step 4: Write the modal component**

Create `src/commands/ui/EditCommandModal.vue`:

```vue
<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/valibot";
import { getIconIds } from "obsidian";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { computed, ref, watch } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModal } from "@/infrastructure/host/modals";
import { journalConfigCollection, type JournalWrite } from "@/journals";
import { SettingsService } from "@/settings";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconSuggest from "@/ui/UiIconSuggest.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";
import UiToggle from "@/ui/UiToggle.vue";

import {
  commandCollection,
  type CommandConfig,
  type CommandContext,
  type CommandTarget,
  type CommandType,
} from "../config";
import { supportedTypes } from "../resolve";

import { commandTypeLabel } from "./command-type-label";

const { command, target, takenNames } = defineProps<{
  command?: CommandConfig;
  target: CommandTarget;
  takenNames: string[];
}>();

const api = useModal<CommandConfig>();
const settings = useService(SettingsService);
const validIcons = new Set(getIconIds());

function journalWriteType(): JournalWrite["type"] {
  if (target.kind !== "journal") return "day";
  return settings.getCollection(journalConfigCollection).get(target.journalName)?.write.type ?? "day";
}

const writeType = ref<JournalWrite["type"]>(target.kind === "all" ? target.writeType : journalWriteType());

const initial = command ?? commandCollection.defaultItem("");

const { defineField, errorBag, handleSubmit } = useForm({
  initialValues: {
    name: initial.name,
    type: initial.type,
    context: initial.context,
    showInRibbon: initial.showInRibbon,
    icon: initial.icon,
    openMode: initial.openMode,
  },
  validationSchema: toTypedSchema(
    v.pipe(
      v.object({
        name: v.pipe(
          v.string(),
          v.nonEmpty(m.command_name_required_error()),
          v.check((value) => !takenNames.includes(value), m.command_name_unique_error()),
        ),
        type: v.picklist([
          "same",
          "next",
          "previous",
          "same_next_week",
          "same_previous_week",
          "same_next_month",
          "same_previous_month",
          "same_next_year",
          "same_previous_year",
        ]),
        context: v.picklist(["today", "open_note", "only_open_note"]),
        showInRibbon: v.boolean(),
        icon: v.string(),
        openMode: v.picklist(["active", "tab", "split", "window"]),
      }),
      v.forward(
        v.partialCheck(
          [["showInRibbon"], ["icon"]],
          (input) => (input.showInRibbon ? validIcons.has(input.icon) : true),
          m.command_icon_required_error(),
        ),
        ["icon"],
      ),
    ),
  ),
});

const [name, nameAttrs] = defineField("name");
const [type, typeAttrs] = defineField("type");
const [context, contextAttrs] = defineField("context");
const [showInRibbon, showInRibbonAttrs] = defineField("showInRibbon");
const [icon, iconAttrs] = defineField("icon");
const [openMode, openModeAttrs] = defineField("openMode");

const typeOptions = computed(() =>
  supportedTypes(writeType.value).map((value) => ({
    value,
    label: commandTypeLabel(writeType.value, value, (context.value ?? "today") as CommandContext),
  })),
);

watch(writeType, () => {
  if (!supportedTypes(writeType.value).includes(type.value as CommandType)) {
    type.value = "same";
  }
});

const onSubmit = handleSubmit((values) => {
  const submittedTarget: CommandTarget =
    target.kind === "all"
      ? { kind: "all", writeType: writeType.value as Exclude<JournalWrite["type"], "custom"> }
      : { kind: "journal", journalName: target.journalName };
  api.submit({
    name: values.name,
    icon: values.icon,
    showInRibbon: values.showInRibbon,
    openMode: values.openMode,
    type: values.type,
    context: values.context,
    target: submittedTarget,
  });
});
</script>

<template>
  <form @submit.prevent="onSubmit">
    <UiSettingRow :name="m.command_modal_name_label()">
      <template #description>
        <span v-for="error of errorBag.name" :key="error" class="command-form-error">{{ error }}</span>
      </template>
      <UiTextInput v-model="name" v-bind="nameAttrs" />
    </UiSettingRow>

    <UiSettingRow :name="m.command_modal_write_type_label()">
      <UiDropdown v-if="target.kind === 'all'" v-model="writeType">
        <option value="day">{{ m.command_write_type_option({ writeType: "day" }) }}</option>
        <option value="week">{{ m.command_write_type_option({ writeType: "week" }) }}</option>
        <option value="month">{{ m.command_write_type_option({ writeType: "month" }) }}</option>
        <option value="quarter">{{ m.command_write_type_option({ writeType: "quarter" }) }}</option>
        <option value="year">{{ m.command_write_type_option({ writeType: "year" }) }}</option>
      </UiDropdown>
      <span v-else>{{ m.command_write_type_option({ writeType }) }}</span>
    </UiSettingRow>

    <UiSettingRow :name="m.command_modal_type_label()">
      <UiDropdown v-model="type" v-bind="typeAttrs">
        <option v-for="option of typeOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow v-if="type !== 'same'" :name="m.command_modal_context_label()">
      <template #description>
        <div>{{ m.command_modal_context_description() }}</div>
        <div v-if="context === 'open_note'">{{ m.command_modal_context_open_note_hint() }}</div>
        <div v-if="context === 'only_open_note'">{{ m.command_modal_context_only_open_note_hint() }}</div>
      </template>
      <UiDropdown v-model="context" v-bind="contextAttrs">
        <option value="today">{{ m.command_context_option({ context: "today" }) }}</option>
        <option value="open_note">{{ m.command_context_option({ context: "open_note" }) }}</option>
        <option value="only_open_note">{{ m.command_context_option({ context: "only_open_note" }) }}</option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow :name="m.command_modal_ribbon_label()">
      <UiToggle v-model="showInRibbon" v-bind="showInRibbonAttrs" :tooltip="m.command_modal_ribbon_label()" />
    </UiSettingRow>

    <UiSettingRow v-if="showInRibbon" :name="m.command_modal_icon_label()">
      <template #description>
        <span v-for="error of errorBag.icon" :key="error" class="command-form-error">{{ error }}</span>
      </template>
      <UiIconSuggest v-model="icon" v-bind="iconAttrs" />
    </UiSettingRow>

    <UiSettingRow :name="m.command_modal_open_mode_label()">
      <UiDropdown v-model="openMode" v-bind="openModeAttrs">
        <option value="active">{{ m.command_open_mode_option({ mode: "active" }) }}</option>
        <option value="tab">{{ m.command_open_mode_option({ mode: "tab" }) }}</option>
        <option value="split">{{ m.command_open_mode_option({ mode: "split" }) }}</option>
        <option value="window">{{ m.command_open_mode_option({ mode: "window" }) }}</option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta type="submit">{{ m.common_action_submit() }}</UiButton>
    </UiSettingRow>
  </form>
</template>

<style scoped>
.command-form-error {
  color: var(--text-error);
  display: block;
}
</style>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/commands/ui/EditCommandModal.test.ts`
Expected: PASS — all tests.

Note: the "offers only the supported types" test relies on the type `<select>` being the first combobox in the DOM; for a `journal` target the write-type row renders static text, not a dropdown, so the first combobox is the type select.

- [ ] **Step 6: Commit**

```bash
git add src/commands/ui/EditCommandModal.vue src/commands/ui/edit-command-modal.ts src/commands/ui/EditCommandModal.test.ts
git commit -m "feat(commands): add the edit-command modal"
```

---

## Task 8: `EditCommandFlow`

Opens the edit modal and writes the collection. For a new command it generates a `crypto.randomUUID()` id; for an edit it overwrites the existing entry. When editing, the existing command's `target` is authoritative.

**Files:**

- Create: `src/commands/ui/edit-command.flow.ts`
- Test: `src/commands/ui/edit-command.flow.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { createSettingsService } from "@/settings/testing";

import { commandCollection, type CommandConfig } from "../config";

import { EditCommandFlow } from "./edit-command.flow";

function makeConfig(name: string): CommandConfig {
  return {
    name,
    icon: "",
    showInRibbon: false,
    openMode: "active",
    target: { kind: "all", writeType: "day" },
    type: "same",
    context: "today",
  };
}

async function build(raw?: unknown) {
  const { service: settings, container } = createSettingsService({
    collections: [commandCollection],
    raw,
  });
  await settings.initialize();
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(Flows).useClass(Flows);
  container.register(EditCommandFlow).useClass(EditCommandFlow);
  return { settings, modals, flows: container.resolve(Flows) };
}

describe("EditCommandFlow", () => {
  it("adds a new command to the collection on submit", async () => {
    const { flows, modals, settings } = await build();
    const promise = flows.invoke(EditCommandFlow, { target: { kind: "all", writeType: "day" } });
    modals.lastOpen<unknown, CommandConfig>().submit(makeConfig("Added"));
    await promise;
    const entries = Object.values(settings.getCollection(commandCollection).entries);
    expect(entries).toEqual([makeConfig("Added")]);
  });

  it("overwrites the existing entry when editing", async () => {
    const raw = { version: 3, commands: { "cmd-1": makeConfig("Old") } };
    const { flows, modals, settings } = await build(raw);
    const promise = flows.invoke(EditCommandFlow, {
      commandId: "cmd-1",
      target: { kind: "all", writeType: "day" },
    });
    modals.lastOpen<unknown, CommandConfig>().submit(makeConfig("New"));
    await promise;
    expect(settings.getCollection(commandCollection).get("cmd-1")?.name).toBe("New");
  });

  it("leaves the collection untouched when the modal is cancelled", async () => {
    const { flows, modals, settings } = await build();
    const promise = flows.invoke(EditCommandFlow, { target: { kind: "all", writeType: "day" } });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(Object.keys(settings.getCollection(commandCollection).entries)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/commands/ui/edit-command.flow.test.ts`
Expected: FAIL — cannot resolve `./edit-command.flow`.

- [ ] **Step 3: Write the flow**

Create `src/commands/ui/edit-command.flow.ts`:

```ts
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { commandCollection, type CommandTarget } from "../config";

import { editCommandModal } from "./edit-command-modal";

export interface EditCommandParameters {
  readonly commandId?: string;
  readonly target: CommandTarget;
}

export class EditCommandFlow implements Flow<EditCommandParameters, { id: string }, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #settings = inject(SettingsService);

  execute(parameters: EditCommandParameters): AsyncResult<{ id: string }, FlowError> {
    const collection = this.#settings.getCollection(commandCollection);
    const existing = parameters.commandId === undefined ? undefined : collection.get(parameters.commandId);
    const target = existing?.target ?? parameters.target;
    const takenNames = Object.entries(collection.entries)
      .filter(([id]) => id !== parameters.commandId)
      .map(([, command]) => command.name);
    return attempt.in(this, async function* (this: EditCommandFlow) {
      const config = yield* this.#modals
        .open(editCommandModal, { command: existing, target, takenNames })
        .mapErr(() => new UserAborted("edit-command-modal"));
      const id = parameters.commandId ?? crypto.randomUUID();
      collection.add(id, config);
      return { id };
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/commands/ui/edit-command.flow.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/commands/ui/edit-command.flow.ts src/commands/ui/edit-command.flow.test.ts
git commit -m "feat(commands): add the edit-command flow"
```

---

## Task 9: `DeleteCommandModal`

A plain confirmation modal: it names the command and offers Cancel / Delete.

**Files:**

- Create: `src/commands/ui/DeleteCommandModal.vue`
- Create: `src/commands/ui/delete-command-modal.ts`
- Test: `src/commands/ui/DeleteCommandModal.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";

import DeleteCommandModal from "./DeleteCommandModal.vue";

afterEach(() => cleanup());

function mountModal() {
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<void> = { submit, cancel };
  render(DeleteCommandModal, {
    props: { commandName: "Open today" },
    global: {
      plugins: [{ install: (app) => provideModalApiOnApp(app, api as ModalApi<unknown>) }],
    },
  });
  return { submit, cancel };
}

describe("DeleteCommandModal", () => {
  it("names the command being deleted", () => {
    mountModal();
    expect(screen.getByText(m.command_delete_modal_confirm({ name: "Open today" }))).toBeTruthy();
  });

  it("submits when Delete is clicked", async () => {
    const { submit } = mountModal();
    await userEvent.click(screen.getByText(m.common_action_delete()));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("cancels when Cancel is clicked", async () => {
    const { cancel } = mountModal();
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/commands/ui/DeleteCommandModal.test.ts`
Expected: FAIL — cannot resolve `./DeleteCommandModal.vue`.

- [ ] **Step 3: Write the component and definition**

Create `src/commands/ui/DeleteCommandModal.vue`:

```vue
<script setup lang="ts">
import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const { commandName } = defineProps<{ commandName: string }>();
const api = useModal<void>();
</script>

<template>
  <div>
    <UiSettingRow>
      <template #description>{{ m.command_delete_modal_confirm({ name: commandName }) }}</template>
    </UiSettingRow>
    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton warning @click="api.submit()">{{ m.common_action_delete() }}</UiButton>
    </UiSettingRow>
  </div>
</template>
```

Create `src/commands/ui/delete-command-modal.ts`:

```ts
import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import DeleteCommandModal from "./DeleteCommandModal.vue";

import type { Component } from "vue";

export const deleteCommandModal: ModalDefinition<{ commandName: string }, void> = defineModal({
  component: DeleteCommandModal as Component,
  title: () => m.command_delete_modal_title(),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/commands/ui/DeleteCommandModal.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/commands/ui/DeleteCommandModal.vue src/commands/ui/delete-command-modal.ts src/commands/ui/DeleteCommandModal.test.ts
git commit -m "feat(commands): add the delete-command modal"
```

---

## Task 10: `DeleteCommandFlow`

Opens the confirmation modal, then removes the entry.

**Files:**

- Create: `src/commands/ui/delete-command.flow.ts`
- Test: `src/commands/ui/delete-command.flow.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { createSettingsService } from "@/settings/testing";

import { commandCollection, type CommandConfig } from "../config";

import { DeleteCommandFlow } from "./delete-command.flow";

function makeConfig(name: string): CommandConfig {
  return {
    name,
    icon: "",
    showInRibbon: false,
    openMode: "active",
    target: { kind: "all", writeType: "day" },
    type: "same",
    context: "today",
  };
}

async function build() {
  const raw = { version: 3, commands: { "cmd-1": makeConfig("Doomed") } };
  const { service: settings, container } = createSettingsService({
    collections: [commandCollection],
    raw,
  });
  await settings.initialize();
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(Flows).useClass(Flows);
  container.register(DeleteCommandFlow).useClass(DeleteCommandFlow);
  return { settings, modals, flows: container.resolve(Flows) };
}

describe("DeleteCommandFlow", () => {
  it("removes the command from the collection on confirm", async () => {
    const { flows, modals, settings } = await build();
    const promise = flows.invoke(DeleteCommandFlow, { commandId: "cmd-1" });
    modals.lastOpen<{ commandName: string }, void>().submit();
    await promise;
    expect(settings.getCollection(commandCollection).get("cmd-1")).toBeUndefined();
  });

  it("leaves the command in place when cancelled", async () => {
    const { flows, modals, settings } = await build();
    const promise = flows.invoke(DeleteCommandFlow, { commandId: "cmd-1" });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(settings.getCollection(commandCollection).get("cmd-1")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/commands/ui/delete-command.flow.test.ts`
Expected: FAIL — cannot resolve `./delete-command.flow`.

- [ ] **Step 3: Write the flow**

Create `src/commands/ui/delete-command.flow.ts`:

```ts
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { commandCollection } from "../config";

import { deleteCommandModal } from "./delete-command-modal";

export class DeleteCommandFlow implements Flow<{ commandId: string }, void, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #settings = inject(SettingsService);

  execute(parameters: { commandId: string }): AsyncResult<void, FlowError> {
    const collection = this.#settings.getCollection(commandCollection);
    return attempt.in(this, async function* (this: DeleteCommandFlow) {
      yield* this.#modals
        .open(deleteCommandModal, { commandName: collection.get(parameters.commandId)?.name ?? "" })
        .mapErr(() => new UserAborted("delete-command-modal"));
      collection.remove(parameters.commandId);
      return;
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/commands/ui/delete-command.flow.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/commands/ui/delete-command.flow.ts src/commands/ui/delete-command.flow.test.ts
git commit -m "feat(commands): add the delete-command flow"
```

---

## Task 11: `CommandsDashboardBlock`

The global dashboard block: lists `all`-target commands, sorted by name, and wires the add/edit/delete buttons to the flows.

**Files:**

- Create: `src/commands/ui/CommandsDashboardBlock.vue`
- Test: `src/commands/ui/CommandsDashboardBlock.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { type Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { createSettingsService } from "@/settings/testing";

import { commandCollection, type CommandConfig } from "../config";

import CommandsDashboardBlock from "./CommandsDashboardBlock.vue";
import { DeleteCommandFlow } from "./delete-command.flow";
import { EditCommandFlow } from "./edit-command.flow";

afterEach(() => cleanup());

function makeConfig(name: string, kind: "all" | "journal"): CommandConfig {
  return {
    name,
    icon: "",
    showInRibbon: false,
    openMode: "active",
    target: kind === "all" ? { kind: "all", writeType: "day" } : { kind: "journal", journalName: "daily" },
    type: "same",
    context: "today",
  };
}

async function setup(commands: Record<string, CommandConfig> = {}) {
  const { service: settings, container } = createSettingsService({
    collections: [commandCollection],
    raw: { version: 3, commands },
  });
  await settings.initialize();
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container.register(Flows).useClass(Flows);
  const flows = container.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  return { container, flows };
}

function mount(container: Container) {
  return render(CommandsDashboardBlock, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

describe("CommandsDashboardBlock", () => {
  it("shows the empty state when no global commands exist", async () => {
    const { container } = await setup();
    mount(container);
    expect(screen.getByText(m.command_dashboard_empty())).toBeTruthy();
  });

  it("lists only all-target commands", async () => {
    const { container } = await setup({
      "c-1": makeConfig("Global one", "all"),
      "c-2": makeConfig("Journal one", "journal"),
    });
    mount(container);
    expect(screen.getByText("Global one")).toBeTruthy();
    expect(screen.queryByText("Journal one")).toBeNull();
  });

  it("invokes EditCommandFlow with an all target when add is clicked", async () => {
    const { container, flows } = await setup();
    mount(container);
    await userEvent.click(screen.getByLabelText(m.command_dashboard_add()));
    expect(flows.invoke).toHaveBeenCalledWith(EditCommandFlow, {
      target: { kind: "all", writeType: "day" },
    });
  });

  it("invokes EditCommandFlow with the command id when edit is clicked", async () => {
    const { container, flows } = await setup({ "c-1": makeConfig("Global one", "all") });
    mount(container);
    await userEvent.click(screen.getByLabelText(`${m.command_list_edit()} Global one`));
    expect(flows.invoke).toHaveBeenCalledWith(EditCommandFlow, {
      commandId: "c-1",
      target: { kind: "all", writeType: "day" },
    });
  });

  it("invokes DeleteCommandFlow when delete is clicked", async () => {
    const { container, flows } = await setup({ "c-1": makeConfig("Global one", "all") });
    mount(container);
    await userEvent.click(screen.getByLabelText(`${m.command_list_delete()} Global one`));
    expect(flows.invoke).toHaveBeenCalledWith(DeleteCommandFlow, { commandId: "c-1" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/commands/ui/CommandsDashboardBlock.test.ts`
Expected: FAIL — cannot resolve `./CommandsDashboardBlock.vue`.

- [ ] **Step 3: Write the component**

Create `src/commands/ui/CommandsDashboardBlock.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import type { JournalWrite } from "@/journals";
import { SettingsService } from "@/settings";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";

import { commandCollection, type CommandConfig } from "../config";

import CommandList from "./CommandList.vue";
import { DeleteCommandFlow } from "./delete-command.flow";
import { EditCommandFlow } from "./edit-command.flow";

const settings = useService(SettingsService);
const flows = useService(Flows);
const collection = settings.getCollection(commandCollection);

const entries = computed<readonly [string, CommandConfig, JournalWrite["type"]][]>(() =>
  Object.entries(collection.entries as Record<string, CommandConfig>)
    .filter(([, command]) => command.target.kind === "all")
    .map(([id, command]): [string, CommandConfig, JournalWrite["type"]] => [
      id,
      command,
      command.target.kind === "all" ? command.target.writeType : "day",
    ])
    .toSorted((a, b) => a[1].name.localeCompare(b[1].name)),
);

const expanded = ref(true);

function add(): void {
  void flows.invoke(EditCommandFlow, { target: { kind: "all", writeType: "day" } });
}
function edit(id: string): void {
  void flows.invoke(EditCommandFlow, { commandId: id, target: { kind: "all", writeType: "day" } });
}
function remove(id: string): void {
  void flows.invoke(DeleteCommandFlow, { commandId: id });
}
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded">
    <template #trigger>
      <UiIconedRow icon="terminal">
        {{ m.command_dashboard_section_title() }}
        <span class="flair">{{ entries.length }}</span>
      </UiIconedRow>
    </template>
    <template #controls>
      <UiIconButton icon="plus" cta :tooltip="m.command_dashboard_add()" @click="add" />
    </template>
    <CommandList :entries="entries" :empty-text="m.command_dashboard_empty()" @edit="edit" @delete="remove" />
  </UiCollapsibleBlock>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/commands/ui/CommandsDashboardBlock.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/commands/ui/CommandsDashboardBlock.vue src/commands/ui/CommandsDashboardBlock.test.ts
git commit -m "feat(commands): add the commands dashboard block"
```

---

## Task 12: `JournalCommandsSection`

The journal-editor section: lists `journal`-target commands for one journal, derives the journal's write type for labels, and wires add/edit/delete with the target fixed to the journal.

**Files:**

- Create: `src/commands/ui/JournalCommandsSection.vue`
- Test: `src/commands/ui/JournalCommandsSection.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { type Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { createSettingsService } from "@/settings/testing";

import { commandCollection, type CommandConfig } from "../config";

import { DeleteCommandFlow } from "./delete-command.flow";
import { EditCommandFlow } from "./edit-command.flow";
import JournalCommandsSection from "./JournalCommandsSection.vue";

afterEach(() => cleanup());

function makeJournal(name: string) {
  return {
    name,
    write: { type: "day" as const },
    timeline: { start: "", end: { kind: "never" as const } },
    dateFormat: "YYYY-MM-DD",
    frontmatter: {
      dateField: "journal-date",
      startDateField: "journal-start-date",
      endDateField: "journal-end-date",
      addStartDate: false,
      addEndDate: false,
    },
    numbering: { enabled: false, anchorDate: "", allowBefore: false, sources: [] },
  };
}

function makeConfig(name: string, target: CommandConfig["target"]): CommandConfig {
  return { name, icon: "", showInRibbon: false, openMode: "active", target, type: "same", context: "today" };
}

async function setup(commands: Record<string, CommandConfig> = {}) {
  const { service: settings, container } = createSettingsService({
    collections: [commandCollection, journalConfigCollection],
    raw: { version: 3, commands, journals: { daily: makeJournal("daily") } },
  });
  await settings.initialize();
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container.register(Flows).useClass(Flows);
  const flows = container.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  return { container, flows };
}

function mount(container: Container) {
  return render(JournalCommandsSection, {
    props: { journalName: "daily" },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

describe("JournalCommandsSection", () => {
  it("lists only this journal's commands", async () => {
    const { container } = await setup({
      "c-1": makeConfig("Mine", { kind: "journal", journalName: "daily" }),
      "c-2": makeConfig("Other journal", { kind: "journal", journalName: "weekly" }),
      "c-3": makeConfig("Global", { kind: "all", writeType: "day" }),
    });
    mount(container);
    expect(screen.getByText("Mine")).toBeTruthy();
    expect(screen.queryByText("Other journal")).toBeNull();
    expect(screen.queryByText("Global")).toBeNull();
  });

  it("invokes EditCommandFlow with a journal target when add is clicked", async () => {
    const { container, flows } = await setup();
    mount(container);
    await userEvent.click(screen.getByLabelText(m.command_journal_add()));
    expect(flows.invoke).toHaveBeenCalledWith(EditCommandFlow, {
      target: { kind: "journal", journalName: "daily" },
    });
  });

  it("invokes EditCommandFlow with the command id when edit is clicked", async () => {
    const { container, flows } = await setup({
      "c-1": makeConfig("Mine", { kind: "journal", journalName: "daily" }),
    });
    mount(container);
    await userEvent.click(screen.getByLabelText(`${m.command_list_edit()} Mine`));
    expect(flows.invoke).toHaveBeenCalledWith(EditCommandFlow, {
      commandId: "c-1",
      target: { kind: "journal", journalName: "daily" },
    });
  });

  it("invokes DeleteCommandFlow when delete is clicked", async () => {
    const { container, flows } = await setup({
      "c-1": makeConfig("Mine", { kind: "journal", journalName: "daily" }),
    });
    mount(container);
    await userEvent.click(screen.getByLabelText(`${m.command_list_delete()} Mine`));
    expect(flows.invoke).toHaveBeenCalledWith(DeleteCommandFlow, { commandId: "c-1" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/commands/ui/JournalCommandsSection.test.ts`
Expected: FAIL — cannot resolve `./JournalCommandsSection.vue`.

- [ ] **Step 3: Write the component**

Create `src/commands/ui/JournalCommandsSection.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { journalConfigCollection, type JournalWrite } from "@/journals";
import { SettingsService } from "@/settings";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";

import { commandCollection, type CommandConfig } from "../config";

import CommandList from "./CommandList.vue";
import { DeleteCommandFlow } from "./delete-command.flow";
import { EditCommandFlow } from "./edit-command.flow";

const { journalName } = defineProps<{ journalName: string }>();

const settings = useService(SettingsService);
const flows = useService(Flows);
const collection = settings.getCollection(commandCollection);
const journals = settings.getCollection(journalConfigCollection);

const writeType = computed<JournalWrite["type"]>(() => journals.get(journalName)?.write.type ?? "day");

const entries = computed<readonly [string, CommandConfig, JournalWrite["type"]][]>(() =>
  Object.entries(collection.entries as Record<string, CommandConfig>)
    .filter(([, command]) => command.target.kind === "journal" && command.target.journalName === journalName)
    .map(([id, command]): [string, CommandConfig, JournalWrite["type"]] => [id, command, writeType.value])
    .toSorted((a, b) => a[1].name.localeCompare(b[1].name)),
);

const expanded = ref(false);

function add(): void {
  void flows.invoke(EditCommandFlow, { target: { kind: "journal", journalName } });
}
function edit(id: string): void {
  void flows.invoke(EditCommandFlow, { commandId: id, target: { kind: "journal", journalName } });
}
function remove(id: string): void {
  void flows.invoke(DeleteCommandFlow, { commandId: id });
}
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded">
    <template #trigger>
      <UiIconedRow icon="terminal">
        {{ m.command_journal_section_title() }}
        <span class="flair">{{ entries.length }}</span>
      </UiIconedRow>
    </template>
    <template #controls>
      <UiIconButton icon="plus" cta :tooltip="m.command_journal_add()" @click="add" />
    </template>
    <CommandList :entries="entries" :empty-text="m.command_journal_empty()" @edit="edit" @delete="remove" />
  </UiCollapsibleBlock>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/commands/ui/JournalCommandsSection.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/commands/ui/JournalCommandsSection.vue src/commands/ui/JournalCommandsSection.test.ts
git commit -m "feat(commands): add the journal commands section"
```

---

## Task 13: Wire the module

Register the two flows, the dashboard block, and the journal-editor section in `commandsModule`. This is wiring — per the project's conventions it has no dedicated test; correctness is verified by the full suite plus the type and lint gates.

**Files:**

- Modify: `src/commands/module.ts`

- [ ] **Step 1: Update the module**

Replace the contents of `src/commands/module.ts` with:

```ts
import type { Module } from "@/infrastructure/di";
import { JournalEditSectionToken, defineJournalEditSection } from "@/journals";
import { CollectionDefinitionToken, DashboardBlockToken, defineDashboardBlock } from "@/settings";

import { DynamicCommandRegistry } from "./command-registry";
import { commandCollection } from "./config";
import CommandsDashboardBlock from "./ui/CommandsDashboardBlock.vue";
import { DeleteCommandFlow } from "./ui/delete-command.flow";
import { EditCommandFlow } from "./ui/edit-command.flow";
import JournalCommandsSection from "./ui/JournalCommandsSection.vue";

import type { Component } from "vue";

export const commandsModule: Module = {
  register(c) {
    c.register(CollectionDefinitionToken).useValue(commandCollection);
    c.register(DynamicCommandRegistry).useClass(DynamicCommandRegistry).eager();
    c.register(EditCommandFlow).useClass(EditCommandFlow);
    c.register(DeleteCommandFlow).useClass(DeleteCommandFlow);
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "commands", component: CommandsDashboardBlock as Component, order: 6 }),
    );
    c.register(JournalEditSectionToken).useValue(
      defineJournalEditSection({ key: "commands", component: JournalCommandsSection as Component, order: 10 }),
    );
  },
};
```

- [ ] **Step 2: Run the full quality gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all pass — the full test suite is green, no type errors, no lint errors.

- [ ] **Step 3: Commit**

```bash
git add src/commands/module.ts
git commit -m "feat(commands): register the command-management UI"
```

---

## Self-Review Notes

- **Spec coverage:** global dashboard block (Task 11), journal-editor section (Task 12), extension point (Tasks 4–5), edit modal (Task 7), delete modal (Task 9), flows (Tasks 8, 10), icon picker (Task 3), command-type label (Task 2), i18n (Task 1), wiring (Task 13). The `CommandList` shared component (Task 6) backs both surfaces.
- **Type consistency:** `EditCommandParameters` (`{ commandId?, target }`) is produced identically by both blocks and consumed by `EditCommandFlow`. `CommandList` entries are `[string, CommandConfig, JournalWrite["type"]]` everywhere. `editCommandModal` props (`{ command?, target, takenNames }`) match between `edit-command-modal.ts`, `EditCommandFlow`, and the modal component.
- **Deviation from spec, noted:** the spec described the command-type label as "a single parameterized paraglide message". Implementation uses one parameterized message (`command_type_label`) plus three plain messages for the day shortcuts (`command_label_today/tomorrow/yesterday`), composed by the `commandTypeLabel` helper — a multi-selector single message could not cleanly express the day-only today/tomorrow/yesterday special cases. The label still lives entirely in the UI layer, as the spec requires.
