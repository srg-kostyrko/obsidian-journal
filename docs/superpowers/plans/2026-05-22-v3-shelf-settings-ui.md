# v3 Shelf Settings UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v3 settings UI for managing journal shelves — listing/creating/deleting shelves, a shelf-detail subpage, and placing journals on shelves — on top of the already-shipped shelves data layer.

**Architecture:** All new UI lives in `src/shelves/ui/`. The `shelves` module takes over both dashboard blocks (a "Journal shelves" block and the journal-list block, which now shows only journals not on a shelf); `journals` stops registering a dashboard block. Mutations run through `Flows` + `defineModal` modals, mirroring the `commands` UI slice. The `shelves → journals` dependency is allowed; the reverse edge stays absent.

**Tech Stack:** TypeScript, Vue 3 (`<script setup>`), `vee-validate` + `valibot` forms, custom DI (`inject`/`useService`), `Result`/`AsyncResult` monads, `paraglide` i18n, Vitest + `@testing-library/vue`.

---

## Background for the implementer

Read these before starting — they are the patterns every task copies:

- `src/commands/ui/` — the closest precedent. `CommandsDashboardBlock.vue`, `CommandList.vue`, `edit-command.flow.ts`, `delete-command.flow.ts`, `edit-command-modal.ts`, `EditCommandModal.vue`, `DeleteCommandModal.vue`, and their `*.test.ts` files.
- `src/shelves/lifecycle.ts` — `ShelvesLifecycleService` with `create` / `rename` / `delete` / `assign`, each returning a `Result`.
- `src/shelves/config.ts` — `shelvesCollection` (keyed by shelf name; each entry `{ name, journals: string[] }`), `ShelfConfig`.
- `src/journals/settings/errors.ts` — the `toFlowError` / `JournalLifecycleFlowError` pattern this plan mirrors for shelves.
- `src/journals/settings/ui/JournalEditSubpage.vue` — the subpage pattern (`heading` row, `nav` prop, `watchEffect` guard).

Project conventions enforced by review: colocated `*.test.ts`; `@testing-library/vue` + `user-event` for components (no CSS-class queries, no test-only `data-*`); one behavior per test; black-box assertions; errors live in the feature's `errors.ts`; no WHAT-comments; no module-wiring or barrel-shape tests. Quality gates run after each task: `npm test`, `npm run check:types`, `npm run check:lint`.

## File structure

Create in `src/shelves/ui/`:

- `shelf-name-modal.ts`, `ShelfNameModal.vue`, `ShelfNameModal.test.ts` — create/rename name modal.
- `delete-shelf-modal.ts`, `DeleteShelfModal.vue`, `DeleteShelfModal.test.ts` — delete confirmation with destination dropdown.
- `place-journal-modal.ts`, `PlaceJournalModal.vue`, `PlaceJournalModal.test.ts` — shelf-picker modal.
- `edit-shelf-name.flow.ts`, `edit-shelf-name.flow.test.ts` — create + rename flow.
- `delete-shelf.flow.ts`, `delete-shelf.flow.test.ts` — delete flow.
- `place-journal.flow.ts`, `place-journal.flow.test.ts` — assign flow.
- `JournalList.vue`, `JournalList.test.ts` — shared presentational journal list.
- `shelf-edit-subpage.ts`, `ShelfEditSubpage.vue`, `ShelfEditSubpage.test.ts` — shelf-detail subpage.
- `ShelvesDashboardBlock.vue`, `ShelvesDashboardBlock.test.ts` — shelves dashboard block.
- `JournalsDashboardBlock.vue`, `JournalsDashboardBlock.test.ts` — journals (not-on-shelf) dashboard block.
- `JournalShelfSection.vue`, `JournalShelfSection.test.ts` — journal-editor shelf section.

Modify:

- `messages/en.json` — new `shelf_*` keys.
- `src/shelves/errors.ts` — add `ShelvesLifecycleError`, `ShelvesLifecycleFlowError`, `toFlowError`.
- `src/shelves/module.ts` — register the two blocks, the subpage, the section, the three flows.
- `src/journals/index.ts` — export `describeWrite`, `AddJournalFlow`, `DeleteJournalFlow`, `journalEditSubpage`.
- `src/journals/settings/module.ts` — drop the `DashboardBlockToken` registration.

Delete:

- `src/journals/settings/ui/JournalsDashboardBlock.vue` and `src/journals/settings/ui/JournalsDashboardBlock.test.ts`.

---

## Task 1: i18n messages

**Files:**

- Modify: `messages/en.json`

- [ ] **Step 1: Add the `shelf_*` keys**

Add these keys to `messages/en.json` (placement within the object does not matter — JSON key order is not significant):

```json
  "shelf_add_modal_title": "Add shelf",
  "shelf_dashboard_add": "Add shelf",
  "shelf_dashboard_delete": "Delete {name}",
  "shelf_dashboard_empty": "No shelves created yet.",
  "shelf_dashboard_open": "Organize {name}",
  "shelf_dashboard_section_title": "Journal shelves",
  "shelf_delete_modal_destination_label": "Move journals to",
  "shelf_delete_modal_destination_none": "None",
  "shelf_delete_modal_moved_out": "Journals will be moved off the shelf.",
  "shelf_delete_modal_title": "Delete shelf {name}",
  "shelf_edit_header_title": "Configuring {name}",
  "shelf_edit_journals_add": "Create new journal",
  "shelf_edit_journals_title": "Journals",
  "shelf_edit_rename_tooltip": "Rename shelf",
  "shelf_journals_block_title": "Journals",
  "shelf_journals_block_title_filtered": "Journals not on a shelf",
  "shelf_member_count": "{count} journals",
  "shelf_modal_name_label": "Shelf name",
  "shelf_name_required_error": "Shelf name is required",
  "shelf_name_unchanged_error": "Enter a different name",
  "shelf_name_unique_error": "Shelf name must be unique",
  "shelf_place_modal_label": "Shelf",
  "shelf_place_modal_title": "Place journal",
  "shelf_rename_modal_title": "Rename shelf",
  "shelf_section_not_on_shelf": "Not on a shelf",
  "shelf_section_place_tooltip": "Place on a shelf",
  "shelf_section_title": "Shelf",
```

- [ ] **Step 2: Compile the messages**

Run: `npm run compile:i18n`
Expected: regenerates `src/i18n/paraglide/` with no errors. The new `m.shelf_*` accessors become available.

- [ ] **Step 3: Verify the types compile**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add messages/en.json src/i18n/paraglide
git commit -m "feat(shelves): add shelf settings UI messages"
```

---

## Task 2: Shelf flow-error wrapper

**Files:**

- Modify: `src/shelves/errors.ts`

The shelf flows need to map `ShelvesLifecycleService` errors into a `FlowError`, exactly as `src/journals/settings/errors.ts` does for journals. This is a pure wrapper exercised by the flow tests in Tasks 7–9 — no dedicated test (per the project's "no trivial error tests" convention).

- [ ] **Step 1: Append the flow-error wrapper**

Append to `src/shelves/errors.ts` (keep the three existing error classes unchanged):

```ts
import { FlowError } from "@/infrastructure/flows";
import type { UnknownJournalError } from "@/journals/settings/errors";

export type ShelvesLifecycleError =
  | InvalidShelfNameError
  | ShelfNameTakenError
  | UnknownShelfError
  | UnknownJournalError;

export class ShelvesLifecycleFlowError extends FlowError {
  readonly kind = "shelves-lifecycle" as const;
  constructor(public override readonly cause: ShelvesLifecycleError) {
    super(cause.message);
    this.name = "ShelvesLifecycleFlowError";
  }
}

export function toFlowError(cause: ShelvesLifecycleError): ShelvesLifecycleFlowError {
  return new ShelvesLifecycleFlowError(cause);
}
```

Move the two `import` lines to the top of the file with the other imports (the file currently has none).

- [ ] **Step 2: Verify the types compile**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/shelves/errors.ts
git commit -m "feat(shelves): add the lifecycle flow-error wrapper"
```

---

## Task 3: Journals barrel exports

**Files:**

- Modify: `src/journals/index.ts`

The `shelves` UI must invoke `journals`' flows and navigate to its subpage. Expose them on the public barrel. No test (barrel shape is not tested).

- [ ] **Step 1: Add the exports**

Append to `src/journals/index.ts`:

```ts
export { describeWrite } from "./settings/describe-write";

export { AddJournalFlow } from "./settings/flows/add-journal.flow";
export { DeleteJournalFlow } from "./settings/flows/delete-journal.flow";

export { journalEditSubpage } from "./settings/ui/journals-subpage";
```

- [ ] **Step 2: Verify the types compile**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/journals/index.ts
git commit -m "feat(journals): export flows and subpage for cross-feature use"
```

---

## Task 4: ShelfNameModal

**Files:**

- Create: `src/shelves/ui/shelf-name-modal.ts`
- Create: `src/shelves/ui/ShelfNameModal.vue`
- Test: `src/shelves/ui/ShelfNameModal.test.ts`

One text-field modal used for both creating and renaming a shelf. Resolves to the entered name string.

- [ ] **Step 1: Write the failing test**

Create `src/shelves/ui/ShelfNameModal.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";

import { shelfNameModal } from "./shelf-name-modal";
import ShelfNameModal from "./ShelfNameModal.vue";

afterEach(() => cleanup());

function mountModal(props: { currentName?: string; takenNames?: string[] }) {
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<string> = { submit, cancel };
  render(ShelfNameModal, {
    props: { currentName: props.currentName, takenNames: props.takenNames ?? [] },
    global: {
      plugins: [{ install: (app) => provideModalApiOnApp(app, api as ModalApi<unknown>) }],
    },
  });
  return { submit, cancel };
}

describe("shelfNameModal definition", () => {
  it("uses the add title when no current name is supplied", () => {
    expect(shelfNameModal.title({ takenNames: [] })).toBe(m.shelf_add_modal_title());
  });

  it("uses the rename title when a current name is supplied", () => {
    expect(shelfNameModal.title({ currentName: "Work", takenNames: [] })).toBe(m.shelf_rename_modal_title());
  });
});

describe("ShelfNameModal", () => {
  it("submits the entered name", async () => {
    const { submit } = mountModal({});
    await userEvent.type(screen.getByRole("textbox"), "Work");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => expect(submit).toHaveBeenCalledWith("Work"));
  });

  it("surfaces a required error when the name is empty", async () => {
    const { submit } = mountModal({});
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => expect(screen.getByText(m.shelf_name_required_error())).toBeTruthy());
    expect(submit).not.toHaveBeenCalled();
  });

  it("surfaces a uniqueness error when the name is taken", async () => {
    const { submit } = mountModal({ takenNames: ["Work"] });
    await userEvent.type(screen.getByRole("textbox"), "Work");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => expect(screen.getByText(m.shelf_name_unique_error())).toBeTruthy());
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects the unchanged name when renaming", async () => {
    const { submit } = mountModal({ currentName: "Work" });
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => expect(screen.getByText(m.shelf_name_unchanged_error())).toBeTruthy());
    expect(submit).not.toHaveBeenCalled();
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = mountModal({});
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/shelves/ui/ShelfNameModal.test.ts`
Expected: FAIL — `shelf-name-modal` / `ShelfNameModal.vue` do not exist.

- [ ] **Step 3: Create the modal definition**

Create `src/shelves/ui/shelf-name-modal.ts`:

```ts
import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import ShelfNameModal from "./ShelfNameModal.vue";

import type { Component } from "vue";

export interface ShelfNameModalProps {
  currentName?: string;
  takenNames: string[];
}

export const shelfNameModal: ModalDefinition<ShelfNameModalProps, string> = defineModal({
  component: ShelfNameModal as Component,
  title: ({ currentName }: ShelfNameModalProps) =>
    currentName === undefined ? m.shelf_add_modal_title() : m.shelf_rename_modal_title(),
});
```

- [ ] **Step 4: Create the component**

Create `src/shelves/ui/ShelfNameModal.vue`:

```vue
<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";

import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

const props = withDefaults(
  defineProps<{
    currentName?: string;
    takenNames: string[];
  }>(),
  { currentName: undefined },
);

const api = useModal<string>();

const { defineField, errorBag, handleSubmit } = useForm({
  initialValues: { name: props.currentName ?? "" },
  validationSchema: toTypedSchema(
    v.object({
      name: v.pipe(
        v.string(),
        v.nonEmpty(m.shelf_name_required_error()),
        v.check((value) => !props.takenNames.includes(value), m.shelf_name_unique_error()),
        v.check(
          (value) => props.currentName === undefined || value !== props.currentName,
          m.shelf_name_unchanged_error(),
        ),
      ),
    }),
  ),
});

const [name, nameAttrs] = defineField("name");

const onSubmit = handleSubmit((values) => {
  api.submit(values.name);
});
</script>

<template>
  <form @submit.prevent="onSubmit">
    <UiSettingRow :name="m.shelf_modal_name_label()">
      <template #description>
        <span v-for="error of errorBag.name" :key="error" class="shelf-form-error">{{ error }}</span>
      </template>
      <UiTextInput v-model="name" v-bind="nameAttrs" />
    </UiSettingRow>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta type="submit">{{ m.common_action_submit() }}</UiButton>
    </UiSettingRow>
  </form>
</template>

<style scoped>
.shelf-form-error {
  color: var(--text-error);
  display: block;
}
</style>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/shelves/ui/ShelfNameModal.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the quality gates**

Run: `npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shelves/ui/shelf-name-modal.ts src/shelves/ui/ShelfNameModal.vue src/shelves/ui/ShelfNameModal.test.ts
git commit -m "feat(shelves): add the shelf-name modal"
```

---

## Task 5: DeleteShelfModal

**Files:**

- Create: `src/shelves/ui/delete-shelf-modal.ts`
- Create: `src/shelves/ui/DeleteShelfModal.vue`
- Test: `src/shelves/ui/DeleteShelfModal.test.ts`

A confirmation modal that resolves to the destination shelf name (`""` when members should just be moved off).

- [ ] **Step 1: Write the failing test**

Create `src/shelves/ui/DeleteShelfModal.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";

import DeleteShelfModal from "./DeleteShelfModal.vue";

afterEach(() => cleanup());

function mountModal(props: { shelfName?: string; otherShelves?: string[] }) {
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<string> = { submit, cancel };
  render(DeleteShelfModal, {
    props: { shelfName: props.shelfName ?? "Work", otherShelves: props.otherShelves ?? [] },
    global: {
      plugins: [{ install: (app) => provideModalApiOnApp(app, api as ModalApi<unknown>) }],
    },
  });
  return { submit, cancel };
}

describe("DeleteShelfModal", () => {
  it("lists the other shelves as destinations", () => {
    mountModal({ otherShelves: ["Personal", "Archive"] });
    const optionValues = [...screen.getByRole("combobox").querySelectorAll("option")].map((o) =>
      o.getAttribute("value"),
    );
    expect(optionValues).toEqual(["", "Personal", "Archive"]);
  });

  it("shows the moved-out message when no other shelves exist", () => {
    mountModal({ otherShelves: [] });
    expect(screen.getByText(m.shelf_delete_modal_moved_out())).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("submits the empty destination when no destination is picked", async () => {
    const { submit } = mountModal({ otherShelves: ["Personal"] });
    await userEvent.click(screen.getByText(m.common_action_delete()));
    expect(submit).toHaveBeenCalledWith("");
  });

  it("submits the chosen destination", async () => {
    const { submit } = mountModal({ otherShelves: ["Personal"] });
    await userEvent.selectOptions(screen.getByRole("combobox"), "Personal");
    await userEvent.click(screen.getByText(m.common_action_delete()));
    expect(submit).toHaveBeenCalledWith("Personal");
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = mountModal({});
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/shelves/ui/DeleteShelfModal.test.ts`
Expected: FAIL — files do not exist.

- [ ] **Step 3: Create the modal definition**

Create `src/shelves/ui/delete-shelf-modal.ts`:

```ts
import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import DeleteShelfModal from "./DeleteShelfModal.vue";

import type { Component } from "vue";

export interface DeleteShelfModalProps {
  shelfName: string;
  otherShelves: string[];
}

export const deleteShelfModal: ModalDefinition<DeleteShelfModalProps, string> = defineModal({
  component: DeleteShelfModal as Component,
  title: ({ shelfName }: DeleteShelfModalProps) => m.shelf_delete_modal_title({ name: shelfName }),
});
```

- [ ] **Step 4: Create the component**

Create `src/shelves/ui/DeleteShelfModal.vue`:

```vue
<script setup lang="ts">
import { ref } from "vue";

import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const props = defineProps<{
  shelfName: string;
  otherShelves: string[];
}>();

const api = useModal<string>();
const destination = ref("");
</script>

<template>
  <div>
    <UiSettingRow v-if="props.otherShelves.length > 0" :name="m.shelf_delete_modal_destination_label()">
      <UiDropdown v-model="destination">
        <option value="">{{ m.shelf_delete_modal_destination_none() }}</option>
        <option v-for="shelf of props.otherShelves" :key="shelf" :value="shelf">{{ shelf }}</option>
      </UiDropdown>
    </UiSettingRow>
    <UiSettingRow v-else>
      <template #description>{{ m.shelf_delete_modal_moved_out() }}</template>
    </UiSettingRow>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta warning @click="api.submit(destination)">{{ m.common_action_delete() }}</UiButton>
    </UiSettingRow>
  </div>
</template>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/shelves/ui/DeleteShelfModal.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the quality gates**

Run: `npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shelves/ui/delete-shelf-modal.ts src/shelves/ui/DeleteShelfModal.vue src/shelves/ui/DeleteShelfModal.test.ts
git commit -m "feat(shelves): add the delete-shelf modal"
```

---

## Task 6: PlaceJournalModal

**Files:**

- Create: `src/shelves/ui/place-journal-modal.ts`
- Create: `src/shelves/ui/PlaceJournalModal.vue`
- Test: `src/shelves/ui/PlaceJournalModal.test.ts`

A shelf-picker modal — v2's "Place journal" dropdown. Resolves to the chosen shelf name (`""` = not on a shelf).

- [ ] **Step 1: Write the failing test**

Create `src/shelves/ui/PlaceJournalModal.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";

import PlaceJournalModal from "./PlaceJournalModal.vue";

afterEach(() => cleanup());

function mountModal(props: { currentShelf?: string; shelfNames?: string[] }) {
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<string> = { submit, cancel };
  render(PlaceJournalModal, {
    props: { currentShelf: props.currentShelf ?? "", shelfNames: props.shelfNames ?? [] },
    global: {
      plugins: [{ install: (app) => provideModalApiOnApp(app, api as ModalApi<unknown>) }],
    },
  });
  return { submit, cancel };
}

describe("PlaceJournalModal", () => {
  it("offers every shelf plus the not-on-a-shelf option", () => {
    mountModal({ shelfNames: ["Work", "Personal"] });
    const optionValues = [...screen.getByRole("combobox").querySelectorAll("option")].map((o) =>
      o.getAttribute("value"),
    );
    expect(optionValues).toEqual(["", "Work", "Personal"]);
  });

  it("starts with the journal's current shelf selected", () => {
    mountModal({ currentShelf: "Personal", shelfNames: ["Work", "Personal"] });
    expect(screen.getByRole<HTMLSelectElement>("combobox").value).toBe("Personal");
  });

  it("submits the chosen shelf", async () => {
    const { submit } = mountModal({ shelfNames: ["Work"] });
    await userEvent.selectOptions(screen.getByRole("combobox"), "Work");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    expect(submit).toHaveBeenCalledWith("Work");
  });

  it("submits the empty shelf to unassign the journal", async () => {
    const { submit } = mountModal({ currentShelf: "Work", shelfNames: ["Work"] });
    await userEvent.selectOptions(screen.getByRole("combobox"), "");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    expect(submit).toHaveBeenCalledWith("");
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = mountModal({});
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/shelves/ui/PlaceJournalModal.test.ts`
Expected: FAIL — files do not exist.

- [ ] **Step 3: Create the modal definition**

Create `src/shelves/ui/place-journal-modal.ts`:

```ts
import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import PlaceJournalModal from "./PlaceJournalModal.vue";

import type { Component } from "vue";

export interface PlaceJournalModalProps {
  currentShelf: string;
  shelfNames: string[];
}

export const placeJournalModal: ModalDefinition<PlaceJournalModalProps, string> = defineModal({
  component: PlaceJournalModal as Component,
  title: () => m.shelf_place_modal_title(),
});
```

- [ ] **Step 4: Create the component**

Create `src/shelves/ui/PlaceJournalModal.vue`:

```vue
<script setup lang="ts">
import { ref } from "vue";

import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const props = defineProps<{
  currentShelf: string;
  shelfNames: string[];
}>();

const api = useModal<string>();
const selected = ref(props.currentShelf);
</script>

<template>
  <div>
    <UiSettingRow :name="m.shelf_place_modal_label()">
      <UiDropdown v-model="selected">
        <option value="">{{ m.shelf_section_not_on_shelf() }}</option>
        <option v-for="shelf of props.shelfNames" :key="shelf" :value="shelf">{{ shelf }}</option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta @click="api.submit(selected)">{{ m.common_action_submit() }}</UiButton>
    </UiSettingRow>
  </div>
</template>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/shelves/ui/PlaceJournalModal.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the quality gates**

Run: `npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shelves/ui/place-journal-modal.ts src/shelves/ui/PlaceJournalModal.vue src/shelves/ui/PlaceJournalModal.test.ts
git commit -m "feat(shelves): add the place-journal modal"
```

---

## Task 7: EditShelfNameFlow

**Files:**

- Create: `src/shelves/ui/edit-shelf-name.flow.ts`
- Test: `src/shelves/ui/edit-shelf-name.flow.test.ts`

One flow for create and rename, mirroring `EditCommandFlow`. Input `{ shelfName?: string }`; with no `shelfName` it creates, otherwise it renames. Returns `{ shelfName: string }` (the resulting name) so callers can navigate.

- [ ] **Step 1: Write the failing test**

Create `src/shelves/ui/edit-shelf-name.flow.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { JournalLifecycleService } from "@/journals/settings/lifecycle";
import { createSettingsService } from "@/settings/testing";

import { shelvesCollection } from "../config";
import { ShelvesLifecycleService } from "../lifecycle";

import { EditShelfNameFlow } from "./edit-shelf-name.flow";

async function build(raw?: unknown) {
  const { service: settings, container } = createSettingsService({
    collections: [journalConfigCollection, shelvesCollection],
    raw,
  });
  await settings.initialize();
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(JournalLifecycleService).useClass(JournalLifecycleService);
  container.register(ShelvesLifecycleService).useClass(ShelvesLifecycleService);
  container.register(Flows).useClass(Flows);
  container.register(EditShelfNameFlow).useClass(EditShelfNameFlow);
  return { settings, modals, flows: container.resolve(Flows) };
}

describe("EditShelfNameFlow", () => {
  it("creates a shelf when no shelf name is given", async () => {
    const { flows, modals, settings } = await build();
    const promise = flows.invoke(EditShelfNameFlow, {});
    modals.lastOpen<unknown, string>().submit("Work");
    await promise;
    expect(settings.getCollection(shelvesCollection).get("Work")).toEqual({ name: "Work", journals: [] });
  });

  it("renames an existing shelf and keeps its journals", async () => {
    const raw = { version: 3, shelves: { Work: { name: "Work", journals: ["daily"] } } };
    const { flows, modals, settings } = await build(raw);
    const promise = flows.invoke(EditShelfNameFlow, { shelfName: "Work" });
    modals.lastOpen<unknown, string>().submit("Office");
    await promise;
    expect(settings.getCollection(shelvesCollection).get("Work")).toBeUndefined();
    expect(settings.getCollection(shelvesCollection).get("Office")).toEqual({
      name: "Office",
      journals: ["daily"],
    });
  });

  it("leaves the collection untouched when the modal is cancelled", async () => {
    const { flows, modals, settings } = await build();
    const promise = flows.invoke(EditShelfNameFlow, {});
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(Object.keys(settings.getCollection(shelvesCollection).entries)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/shelves/ui/edit-shelf-name.flow.test.ts`
Expected: FAIL — `edit-shelf-name.flow` does not exist.

- [ ] **Step 3: Create the flow**

Create `src/shelves/ui/edit-shelf-name.flow.ts`:

```ts
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { shelvesCollection } from "../config";
import { toFlowError } from "../errors";
import { ShelvesLifecycleService } from "../lifecycle";

import { shelfNameModal } from "./shelf-name-modal";

export interface EditShelfNameParameters {
  readonly shelfName?: string;
}

export class EditShelfNameFlow implements Flow<EditShelfNameParameters, { shelfName: string }, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #lifecycle = inject(ShelvesLifecycleService);
  readonly #settings = inject(SettingsService);

  execute(parameters: EditShelfNameParameters): AsyncResult<{ shelfName: string }, FlowError> {
    const collection = this.#settings.getCollection(shelvesCollection);
    const takenNames = Object.keys(collection.entries).filter((name) => name !== parameters.shelfName);
    return attempt.in(this, async function* (this: EditShelfNameFlow) {
      const name = yield* this.#modals
        .open(shelfNameModal, { currentName: parameters.shelfName, takenNames })
        .mapErr(() => new UserAborted("shelf-name-modal"));
      if (parameters.shelfName === undefined) {
        yield* this.#lifecycle.create(name).mapErr(toFlowError);
      } else {
        yield* this.#lifecycle.rename(parameters.shelfName, name).mapErr(toFlowError);
      }
      return { shelfName: name };
    });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/shelves/ui/edit-shelf-name.flow.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the quality gates**

Run: `npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shelves/ui/edit-shelf-name.flow.ts src/shelves/ui/edit-shelf-name.flow.test.ts
git commit -m "feat(shelves): add the create/rename shelf flow"
```

---

## Task 8: DeleteShelfFlow

**Files:**

- Create: `src/shelves/ui/delete-shelf.flow.ts`
- Test: `src/shelves/ui/delete-shelf.flow.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shelves/ui/delete-shelf.flow.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { JournalLifecycleService } from "@/journals/settings/lifecycle";
import { createSettingsService } from "@/settings/testing";

import { shelvesCollection } from "../config";
import { ShelvesLifecycleService } from "../lifecycle";

import { DeleteShelfFlow } from "./delete-shelf.flow";

async function build(raw?: unknown) {
  const { service: settings, container } = createSettingsService({
    collections: [journalConfigCollection, shelvesCollection],
    raw,
  });
  await settings.initialize();
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(JournalLifecycleService).useClass(JournalLifecycleService);
  container.register(ShelvesLifecycleService).useClass(ShelvesLifecycleService);
  container.register(Flows).useClass(Flows);
  container.register(DeleteShelfFlow).useClass(DeleteShelfFlow);
  return { settings, modals, flows: container.resolve(Flows) };
}

describe("DeleteShelfFlow", () => {
  it("removes the shelf and moves its journals to the chosen destination", async () => {
    const raw = {
      version: 3,
      shelves: {
        Work: { name: "Work", journals: ["daily"] },
        Personal: { name: "Personal", journals: [] },
      },
    };
    const { flows, modals, settings } = await build(raw);
    const promise = flows.invoke(DeleteShelfFlow, { shelfName: "Work" });
    modals.lastOpen<unknown, string>().submit("Personal");
    await promise;
    expect(settings.getCollection(shelvesCollection).get("Work")).toBeUndefined();
    expect(settings.getCollection(shelvesCollection).get("Personal")?.journals).toEqual(["daily"]);
  });

  it("leaves the shelf in place when the modal is cancelled", async () => {
    const raw = { version: 3, shelves: { Work: { name: "Work", journals: [] } } };
    const { flows, modals, settings } = await build(raw);
    const promise = flows.invoke(DeleteShelfFlow, { shelfName: "Work" });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(settings.getCollection(shelvesCollection).get("Work")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/shelves/ui/delete-shelf.flow.test.ts`
Expected: FAIL — `delete-shelf.flow` does not exist.

- [ ] **Step 3: Create the flow**

Create `src/shelves/ui/delete-shelf.flow.ts`:

```ts
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { shelvesCollection } from "../config";
import { toFlowError } from "../errors";
import { ShelvesLifecycleService } from "../lifecycle";

import { deleteShelfModal } from "./delete-shelf-modal";

export class DeleteShelfFlow implements Flow<{ shelfName: string }, void, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #lifecycle = inject(ShelvesLifecycleService);
  readonly #settings = inject(SettingsService);

  execute(parameters: { shelfName: string }): AsyncResult<void, FlowError> {
    const collection = this.#settings.getCollection(shelvesCollection);
    const otherShelves = Object.keys(collection.entries).filter((name) => name !== parameters.shelfName);
    return attempt.in(this, async function* (this: DeleteShelfFlow) {
      const destination = yield* this.#modals
        .open(deleteShelfModal, { shelfName: parameters.shelfName, otherShelves })
        .mapErr(() => new UserAborted("delete-shelf-modal"));
      yield* this.#lifecycle.delete(parameters.shelfName, destination).mapErr(toFlowError);
      return;
    });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/shelves/ui/delete-shelf.flow.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the quality gates**

Run: `npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shelves/ui/delete-shelf.flow.ts src/shelves/ui/delete-shelf.flow.test.ts
git commit -m "feat(shelves): add the delete-shelf flow"
```

---

## Task 9: PlaceJournalFlow

**Files:**

- Create: `src/shelves/ui/place-journal.flow.ts`
- Test: `src/shelves/ui/place-journal.flow.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shelves/ui/place-journal.flow.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { JournalLifecycleService } from "@/journals/settings/lifecycle";
import { createSettingsService } from "@/settings/testing";

import { shelvesCollection } from "../config";
import { ShelvesLifecycleService } from "../lifecycle";

import { PlaceJournalFlow } from "./place-journal.flow";

function makeJournal(name: string) {
  return {
    name,
    write: { type: "day" as const },
    timeline: { start: "2024-01-01", end: { kind: "never" as const } },
    dateFormat: "YYYY-MM-DD",
    frontmatter: {
      dateField: "journal-date",
      startDateField: "journal-start-date",
      endDateField: "journal-end-date",
      addStartDate: false,
      addEndDate: false,
    },
    numbering: { enabled: false, anchorDate: "2024-01-01", allowBefore: false, sources: [] },
    nameTemplate: "{{date}}",
    folder: "",
    templates: [],
    confirmCreation: false,
    autoCreate: false,
  };
}

async function build() {
  const raw = {
    version: 3,
    journals: { daily: makeJournal("daily") },
    shelves: { Work: { name: "Work", journals: [] } },
  };
  const { service: settings, container } = createSettingsService({
    collections: [journalConfigCollection, shelvesCollection],
    raw,
  });
  await settings.initialize();
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(JournalLifecycleService).useClass(JournalLifecycleService);
  container.register(ShelvesLifecycleService).useClass(ShelvesLifecycleService);
  container.register(Flows).useClass(Flows);
  container.register(PlaceJournalFlow).useClass(PlaceJournalFlow);
  return { settings, modals, flows: container.resolve(Flows) };
}

describe("PlaceJournalFlow", () => {
  it("assigns the journal to the chosen shelf", async () => {
    const { flows, modals, settings } = await build();
    const promise = flows.invoke(PlaceJournalFlow, { journalName: "daily" });
    modals.lastOpen<unknown, string>().submit("Work");
    await promise;
    expect(settings.getCollection(shelvesCollection).get("Work")?.journals).toEqual(["daily"]);
  });

  it("leaves shelf membership unchanged when the modal is cancelled", async () => {
    const { flows, modals, settings } = await build();
    const promise = flows.invoke(PlaceJournalFlow, { journalName: "daily" });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(settings.getCollection(shelvesCollection).get("Work")?.journals).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/shelves/ui/place-journal.flow.test.ts`
Expected: FAIL — `place-journal.flow` does not exist.

- [ ] **Step 3: Create the flow**

Create `src/shelves/ui/place-journal.flow.ts`:

```ts
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { shelvesCollection } from "../config";
import { toFlowError } from "../errors";
import { ShelvesLifecycleService } from "../lifecycle";

import { placeJournalModal } from "./place-journal-modal";

export class PlaceJournalFlow implements Flow<{ journalName: string }, void, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #lifecycle = inject(ShelvesLifecycleService);
  readonly #settings = inject(SettingsService);

  execute(parameters: { journalName: string }): AsyncResult<void, FlowError> {
    const shelves = this.#settings.getCollection(shelvesCollection);
    const shelfNames = Object.keys(shelves.entries);
    const currentShelf = shelfNames.find((name) => shelves.get(name)?.journals.includes(parameters.journalName)) ?? "";
    return attempt.in(this, async function* (this: PlaceJournalFlow) {
      const selected = yield* this.#modals
        .open(placeJournalModal, { currentShelf, shelfNames })
        .mapErr(() => new UserAborted("place-journal-modal"));
      yield* this.#lifecycle.assign(parameters.journalName, selected).mapErr(toFlowError);
      return;
    });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/shelves/ui/place-journal.flow.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the quality gates**

Run: `npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shelves/ui/place-journal.flow.ts src/shelves/ui/place-journal.flow.test.ts
git commit -m "feat(shelves): add the place-journal flow"
```

---

## Task 10: JournalList presentational component

**Files:**

- Create: `src/shelves/ui/JournalList.vue`
- Test: `src/shelves/ui/JournalList.test.ts`

A presentational list of journals — name, a write-type flair, edit/delete buttons. Owns no service access. Used by both dashboard blocks and the shelf-detail subpage.

- [ ] **Step 1: Write the failing test**

Create `src/shelves/ui/JournalList.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";
import type { JournalConfig } from "@/journals";

import JournalList from "./JournalList.vue";

afterEach(() => cleanup());

function makeJournal(name: string): JournalConfig {
  return {
    name,
    write: { type: "day" },
    timeline: { start: "2024-01-01", end: { kind: "never" } },
    dateFormat: "YYYY-MM-DD",
    frontmatter: {
      dateField: "journal-date",
      startDateField: "journal-start-date",
      endDateField: "journal-end-date",
      addStartDate: false,
      addEndDate: false,
    },
    numbering: { enabled: false, anchorDate: "2024-01-01", allowBefore: false, sources: [] },
    nameTemplate: "{{date}}",
    folder: "",
    templates: [],
    confirmCreation: false,
    autoCreate: false,
  };
}

describe("JournalList", () => {
  it("shows the empty text when there are no entries", () => {
    render(JournalList, { props: { entries: [], emptyText: "Nothing here" } });
    expect(screen.getByText("Nothing here")).toBeTruthy();
  });

  it("renders a row per journal", () => {
    render(JournalList, {
      props: { entries: [["daily", makeJournal("daily")]], emptyText: "Nothing here" },
    });
    expect(screen.getByText("daily")).toBeTruthy();
    expect(screen.queryByText("Nothing here")).toBeNull();
  });

  it("emits edit with the journal name", async () => {
    const { emitted } = render(JournalList, {
      props: { entries: [["daily", makeJournal("daily")]], emptyText: "Nothing here" },
    });
    await userEvent.click(screen.getByLabelText(`${m.journal_dashboard_edit()} daily`));
    expect(emitted().edit).toEqual([["daily"]]);
  });

  it("emits delete with the journal name", async () => {
    const { emitted } = render(JournalList, {
      props: { entries: [["daily", makeJournal("daily")]], emptyText: "Nothing here" },
    });
    await userEvent.click(screen.getByLabelText(`${m.journal_dashboard_delete()} daily`));
    expect(emitted().delete).toEqual([["daily"]]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/shelves/ui/JournalList.test.ts`
Expected: FAIL — `JournalList.vue` does not exist.

- [ ] **Step 3: Create the component**

Create `src/shelves/ui/JournalList.vue`:

```vue
<script setup lang="ts">
import { m } from "@/i18n";
import { describeWrite, type JournalConfig } from "@/journals";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

defineProps<{
  entries: readonly [string, JournalConfig][];
  emptyText: string;
}>();
defineEmits<{ edit: [name: string]; delete: [name: string] }>();
</script>

<template>
  <UiSettingRow v-if="entries.length === 0">
    <template #description>{{ emptyText }}</template>
  </UiSettingRow>
  <template v-else>
    <UiSettingRow v-for="[name, config] in entries" :key="name">
      <template #name>
        {{ name }}
        <span class="flair">{{ m.journal_write({ every: "day", duration: 1, ...describeWrite(config.write) }) }}</span>
      </template>
      <UiIconButton icon="pencil" :tooltip="`${m.journal_dashboard_edit()} ${name}`" @click="$emit('edit', name)" />
      <UiIconButton
        icon="trash-2"
        :tooltip="`${m.journal_dashboard_delete()} ${name}`"
        @click="$emit('delete', name)"
      />
    </UiSettingRow>
  </template>
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/shelves/ui/JournalList.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the quality gates**

Run: `npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shelves/ui/JournalList.vue src/shelves/ui/JournalList.test.ts
git commit -m "feat(shelves): add the shared journal list component"
```

---

## Task 11: ShelfEditSubpage

**Files:**

- Create: `src/shelves/ui/shelf-edit-subpage.ts`
- Create: `src/shelves/ui/ShelfEditSubpage.vue`
- Test: `src/shelves/ui/ShelfEditSubpage.test.ts`

The shelf-detail page: a heading with rename/back, and a "Journals" collapsible listing the shelf's members. The add control creates a journal directly onto the shelf. After a rename, the shelf entry's key changes, so the `watchEffect` guard navigates back to the dashboard.

- [ ] **Step 1: Write the failing test**

Create `src/shelves/ui/ShelfEditSubpage.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { type Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { AsyncResult } from "@/infrastructure/result";
import { AddJournalFlow, DeleteJournalFlow, journalConfigCollection } from "@/journals";
import { JournalLifecycleService } from "@/journals/settings/lifecycle";
import { SettingsUiService, SubpageToken } from "@/settings";
import { createSettingsService } from "@/settings/testing";

import { shelvesCollection } from "../config";
import { ShelvesLifecycleService } from "../lifecycle";

import { EditShelfNameFlow } from "./edit-shelf-name.flow";
import { shelfEditSubpage } from "./shelf-edit-subpage";
import ShelfEditSubpage from "./ShelfEditSubpage.vue";

afterEach(() => cleanup());

function makeJournal(name: string) {
  return {
    name,
    write: { type: "day" as const },
    timeline: { start: "2024-01-01", end: { kind: "never" as const } },
    dateFormat: "YYYY-MM-DD",
    frontmatter: {
      dateField: "journal-date",
      startDateField: "journal-start-date",
      endDateField: "journal-end-date",
      addStartDate: false,
      addEndDate: false,
    },
    numbering: { enabled: false, anchorDate: "2024-01-01", allowBefore: false, sources: [] },
    nameTemplate: "{{date}}",
    folder: "",
    templates: [],
    confirmCreation: false,
    autoCreate: false,
  };
}

async function setup(options: { journals?: string[]; shelves?: Record<string, { name: string; journals: string[] }> }) {
  const raw = {
    version: 3,
    journals: Object.fromEntries((options.journals ?? []).map((n) => [n, makeJournal(n)])),
    shelves: options.shelves ?? {},
  };
  const { service: settings, container } = createSettingsService({
    collections: [journalConfigCollection, shelvesCollection],
    raw,
  });
  await settings.initialize();
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container.register(JournalLifecycleService).useClass(JournalLifecycleService);
  container.register(ShelvesLifecycleService).useClass(ShelvesLifecycleService);
  container.register(SubpageToken).useValue(shelfEditSubpage);
  container.register(SettingsUiService).useClass(SettingsUiService);
  container.register(Flows).useClass(Flows);
  const flows = container.resolve(Flows);
  return { container, settings, flows };
}

const noopNav = { back: () => {}, push: () => {} };

function mount(container: Container, shelfName: string, nav = noopNav) {
  return render(ShelfEditSubpage, {
    props: { shelfName, nav },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

describe("ShelfEditSubpage", () => {
  it("lists the shelf's member journals", async () => {
    const { container } = await setup({
      journals: ["daily"],
      shelves: { Work: { name: "Work", journals: ["daily"] } },
    });
    mount(container, "Work");
    expect(screen.getByText("daily")).toBeTruthy();
  });

  it("invokes EditShelfNameFlow with the shelf name when rename is clicked", async () => {
    const { container, flows } = await setup({ shelves: { Work: { name: "Work", journals: [] } } });
    vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok({ shelfName: "Work" }) as never);
    mount(container, "Work");
    await userEvent.click(screen.getByLabelText(m.shelf_edit_rename_tooltip()));
    expect(flows.invoke).toHaveBeenCalledWith(EditShelfNameFlow, { shelfName: "Work" });
  });

  it("calls nav.back when the back button is clicked", async () => {
    const { container } = await setup({ shelves: { Work: { name: "Work", journals: [] } } });
    const back = vi.fn();
    mount(container, "Work", { back, push: () => {} });
    await userEvent.click(screen.getByLabelText(m.journal_edit_back_tooltip()));
    expect(back).toHaveBeenCalled();
  });

  it("calls nav.back when the shelf no longer exists", async () => {
    const { container } = await setup({ shelves: {} });
    const back = vi.fn();
    mount(container, "Gone", { back, push: () => {} });
    expect(back).toHaveBeenCalled();
  });

  it("assigns a newly created journal to the shelf", async () => {
    const { container, flows, settings } = await setup({
      journals: ["daily"],
      shelves: { Work: { name: "Work", journals: [] } },
    });
    vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok({ name: "daily" }) as never);
    mount(container, "Work");
    await userEvent.click(screen.getByLabelText(m.shelf_edit_journals_add()));
    await vi.waitFor(() => expect(settings.getCollection(shelvesCollection).get("Work")?.journals).toEqual(["daily"]));
    expect(flows.invoke).toHaveBeenCalledWith(AddJournalFlow);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/shelves/ui/ShelfEditSubpage.test.ts`
Expected: FAIL — `shelf-edit-subpage` / `ShelfEditSubpage.vue` do not exist.

- [ ] **Step 3: Create the subpage definition**

Create `src/shelves/ui/shelf-edit-subpage.ts`:

```ts
import { defineSubpage } from "@/settings";

import ShelfEditSubpage from "./ShelfEditSubpage.vue";

import type { Component } from "vue";

export const shelfEditSubpage = defineSubpage<{ shelfName: string }>({
  key: "shelf-edit",
  component: ShelfEditSubpage as Component,
});
```

- [ ] **Step 4: Create the component**

Create `src/shelves/ui/ShelfEditSubpage.vue`:

```vue
<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import {
  AddJournalFlow,
  DeleteJournalFlow,
  journalConfigCollection,
  journalEditSubpage,
  type JournalConfig,
} from "@/journals";
import { SettingsService, type SubpageNav } from "@/settings";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { shelvesCollection } from "../config";
import { ShelvesLifecycleService } from "../lifecycle";

import { EditShelfNameFlow } from "./edit-shelf-name.flow";
import JournalList from "./JournalList.vue";

const { shelfName, nav } = defineProps<{ shelfName: string; nav: SubpageNav }>();

const settings = useService(SettingsService);
const flows = useService(Flows);
const shelvesLifecycle = useService(ShelvesLifecycleService);
const shelves = settings.getCollection(shelvesCollection);
const journals = settings.getCollection(journalConfigCollection);

const shelf = computed(() => shelves.get(shelfName));

watchEffect(() => {
  if (!shelf.value) nav.back();
});

const entries = computed<readonly [string, JournalConfig][]>(() =>
  (shelf.value?.journals ?? [])
    .map((name): [string, JournalConfig] | undefined => {
      const config = journals.get(name);
      return config ? [name, config] : undefined;
    })
    .filter((entry): entry is [string, JournalConfig] => entry !== undefined),
);

const expanded = ref(true);

function rename(): void {
  void flows.invoke(EditShelfNameFlow, { shelfName });
}
function add(): void {
  void flows.invoke(AddJournalFlow).tap(({ name }) => {
    shelvesLifecycle.assign(name, shelfName);
  });
}
function edit(journalName: string): void {
  nav.push(journalEditSubpage, { journalName });
}
function remove(journalName: string): void {
  void flows.invoke(DeleteJournalFlow, { journalName });
}
</script>

<template>
  <div v-if="shelf">
    <UiSettingRow heading>
      <template #name>{{ m.shelf_edit_header_title({ name: shelf.name }) }}</template>
      <UiIconButton icon="pencil" :tooltip="m.shelf_edit_rename_tooltip()" @click="rename" />
      <UiIconButton icon="chevron-left" :tooltip="m.journal_edit_back_tooltip()" @click="nav.back()" />
    </UiSettingRow>

    <UiCollapsibleBlock v-model:expanded="expanded">
      <template #trigger>
        <UiIconedRow icon="book-open">
          {{ m.shelf_edit_journals_title() }}
          <span class="flair">{{ entries.length }}</span>
        </UiIconedRow>
      </template>
      <template #controls>
        <UiIconButton icon="plus" cta :tooltip="m.shelf_edit_journals_add()" @click="add" />
      </template>
      <JournalList :entries="entries" :empty-text="m.journal_dashboard_empty()" @edit="edit" @delete="remove" />
    </UiCollapsibleBlock>
  </div>
</template>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/shelves/ui/ShelfEditSubpage.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the quality gates**

Run: `npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shelves/ui/shelf-edit-subpage.ts src/shelves/ui/ShelfEditSubpage.vue src/shelves/ui/ShelfEditSubpage.test.ts
git commit -m "feat(shelves): add the shelf-detail subpage"
```

---

## Task 12: ShelvesDashboardBlock

**Files:**

- Create: `src/shelves/ui/ShelvesDashboardBlock.vue`
- Test: `src/shelves/ui/ShelvesDashboardBlock.test.ts`

The "Journal shelves" dashboard block — lists shelves, opens the detail subpage, creates and deletes shelves.

- [ ] **Step 1: Write the failing test**

Create `src/shelves/ui/ShelvesDashboardBlock.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { type Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { SettingsUiService, SubpageToken } from "@/settings";
import { createSettingsService } from "@/settings/testing";

import { shelvesCollection } from "../config";

import { DeleteShelfFlow } from "./delete-shelf.flow";
import { EditShelfNameFlow } from "./edit-shelf-name.flow";
import { shelfEditSubpage } from "./shelf-edit-subpage";
import ShelvesDashboardBlock from "./ShelvesDashboardBlock.vue";

afterEach(() => cleanup());

async function setup(shelves: Record<string, { name: string; journals: string[] }> = {}) {
  const { service: settings, container } = createSettingsService({
    collections: [shelvesCollection],
    raw: { version: 3, shelves },
  });
  await settings.initialize();
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container.register(SubpageToken).useValue(shelfEditSubpage);
  container.register(SettingsUiService).useClass(SettingsUiService);
  container.register(Flows).useClass(Flows);
  const flows = container.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({ tap: () => {} } as never);
  return { container, flows, ui: container.resolve(SettingsUiService) };
}

function mount(container: Container) {
  return render(ShelvesDashboardBlock, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

describe("ShelvesDashboardBlock", () => {
  it("shows the empty state when no shelves exist", async () => {
    const { container } = await setup();
    mount(container);
    expect(screen.getByText(m.shelf_dashboard_empty())).toBeTruthy();
  });

  it("lists each shelf with its member count", async () => {
    const { container } = await setup({ Work: { name: "Work", journals: ["daily", "weekly"] } });
    mount(container);
    expect(screen.getByText("Work")).toBeTruthy();
    expect(screen.getByText(m.shelf_member_count({ count: 2 }))).toBeTruthy();
  });

  it("invokes EditShelfNameFlow when the add button is clicked", async () => {
    const { container, flows } = await setup();
    mount(container);
    await userEvent.click(screen.getByLabelText(m.shelf_dashboard_add()));
    expect(flows.invoke).toHaveBeenCalledWith(EditShelfNameFlow, {});
  });

  it("opens the shelf-detail subpage when the organize button is clicked", async () => {
    const { container, ui } = await setup({ Work: { name: "Work", journals: [] } });
    mount(container);
    await userEvent.click(screen.getByLabelText(m.shelf_dashboard_open({ name: "Work" })));
    expect(ui.current.value?.subpage.key).toBe("shelf-edit");
    expect(ui.current.value?.props).toEqual({ shelfName: "Work" });
  });

  it("invokes DeleteShelfFlow when the delete button is clicked", async () => {
    const { container, flows } = await setup({ Work: { name: "Work", journals: [] } });
    mount(container);
    await userEvent.click(screen.getByLabelText(m.shelf_dashboard_delete({ name: "Work" })));
    expect(flows.invoke).toHaveBeenCalledWith(DeleteShelfFlow, { shelfName: "Work" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/shelves/ui/ShelvesDashboardBlock.test.ts`
Expected: FAIL — `ShelvesDashboardBlock.vue` does not exist.

- [ ] **Step 3: Create the component**

Create `src/shelves/ui/ShelvesDashboardBlock.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { SettingsService, SettingsUiService } from "@/settings";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { shelvesCollection, type ShelfConfig } from "../config";

import { DeleteShelfFlow } from "./delete-shelf.flow";
import { EditShelfNameFlow } from "./edit-shelf-name.flow";
import { shelfEditSubpage } from "./shelf-edit-subpage";

const settings = useService(SettingsService);
const ui = useService(SettingsUiService);
const flows = useService(Flows);
const collection = settings.getCollection(shelvesCollection);

const entries = computed<readonly [string, ShelfConfig][]>(() =>
  Object.entries(collection.entries).toSorted(([a], [b]) => a.localeCompare(b)),
);

const expanded = ref(true);

function add(): void {
  void flows.invoke(EditShelfNameFlow, {}).tap(({ shelfName }) => {
    ui.push(shelfEditSubpage, { shelfName });
  });
}
function open(shelfName: string): void {
  ui.push(shelfEditSubpage, { shelfName });
}
function remove(shelfName: string): void {
  void flows.invoke(DeleteShelfFlow, { shelfName });
}
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded">
    <template #trigger>
      <UiIconedRow icon="library">
        {{ m.shelf_dashboard_section_title() }}
        <span class="flair">{{ entries.length }}</span>
      </UiIconedRow>
    </template>
    <template #controls>
      <UiIconButton icon="plus" cta :tooltip="m.shelf_dashboard_add()" @click="add" />
    </template>
    <UiSettingRow v-if="entries.length === 0">
      <template #description>{{ m.shelf_dashboard_empty() }}</template>
    </UiSettingRow>
    <template v-else>
      <UiSettingRow v-for="[name, shelf] in entries" :key="name">
        <template #name>
          {{ name }}
          <span class="flair">{{ m.shelf_member_count({ count: shelf.journals.length }) }}</span>
        </template>
        <UiIconButton icon="library" :tooltip="m.shelf_dashboard_open({ name })" @click="open(name)" />
        <UiIconButton icon="trash-2" :tooltip="m.shelf_dashboard_delete({ name })" @click="remove(name)" />
      </UiSettingRow>
    </template>
  </UiCollapsibleBlock>
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/shelves/ui/ShelvesDashboardBlock.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the quality gates**

Run: `npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shelves/ui/ShelvesDashboardBlock.vue src/shelves/ui/ShelvesDashboardBlock.test.ts
git commit -m "feat(shelves): add the shelves dashboard block"
```

---

## Task 13: JournalsDashboardBlock (not-on-shelf)

**Files:**

- Create: `src/shelves/ui/JournalsDashboardBlock.vue`
- Test: `src/shelves/ui/JournalsDashboardBlock.test.ts`

The journal-list block, now shelf-aware: it lists only journals not on any shelf. When no shelves exist this is every journal. The title reflects whether shelves exist.

- [ ] **Step 1: Write the failing test**

Create `src/shelves/ui/JournalsDashboardBlock.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { type Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { AddJournalFlow, DeleteJournalFlow, journalConfigCollection, journalEditSubpage } from "@/journals";
import { SettingsUiService, SubpageToken } from "@/settings";
import { createSettingsService } from "@/settings/testing";

import { shelvesCollection } from "../config";

import JournalsDashboardBlock from "./JournalsDashboardBlock.vue";

afterEach(() => cleanup());

function makeJournal(name: string) {
  return {
    name,
    write: { type: "day" as const },
    timeline: { start: "2024-01-01", end: { kind: "never" as const } },
    dateFormat: "YYYY-MM-DD",
    frontmatter: {
      dateField: "journal-date",
      startDateField: "journal-start-date",
      endDateField: "journal-end-date",
      addStartDate: false,
      addEndDate: false,
    },
    numbering: { enabled: false, anchorDate: "2024-01-01", allowBefore: false, sources: [] },
    nameTemplate: "{{date}}",
    folder: "",
    templates: [],
    confirmCreation: false,
    autoCreate: false,
  };
}

async function setup(options: { journals?: string[]; shelves?: Record<string, { name: string; journals: string[] }> }) {
  const { service: settings, container } = createSettingsService({
    collections: [journalConfigCollection, shelvesCollection],
    raw: {
      version: 3,
      journals: Object.fromEntries((options.journals ?? []).map((n) => [n, makeJournal(n)])),
      shelves: options.shelves ?? {},
    },
  });
  await settings.initialize();
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container.register(SubpageToken).useValue(journalEditSubpage);
  container.register(SettingsUiService).useClass(SettingsUiService);
  container.register(Flows).useClass(Flows);
  const flows = container.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  return { container, flows, ui: container.resolve(SettingsUiService) };
}

function mount(container: Container) {
  return render(JournalsDashboardBlock, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

describe("JournalsDashboardBlock", () => {
  it("lists only journals not on any shelf", async () => {
    const { container } = await setup({
      journals: ["daily", "weekly"],
      shelves: { Work: { name: "Work", journals: ["weekly"] } },
    });
    mount(container);
    expect(screen.getByText("daily")).toBeTruthy();
    expect(screen.queryByText("weekly")).toBeNull();
  });

  it("uses the plain title when no shelves exist", async () => {
    const { container } = await setup({ journals: ["daily"] });
    mount(container);
    expect(screen.getByText(m.shelf_journals_block_title())).toBeTruthy();
  });

  it("uses the not-on-a-shelf title once a shelf exists", async () => {
    const { container } = await setup({
      journals: ["daily"],
      shelves: { Work: { name: "Work", journals: [] } },
    });
    mount(container);
    expect(screen.getByText(m.shelf_journals_block_title_filtered())).toBeTruthy();
  });

  it("invokes AddJournalFlow when the add button is clicked", async () => {
    const { container, flows } = await setup({});
    mount(container);
    await userEvent.click(screen.getByLabelText(m.journal_dashboard_add()));
    expect(flows.invoke).toHaveBeenCalledWith(AddJournalFlow);
  });

  it("pushes the journal-edit subpage when Edit is clicked", async () => {
    const { container, ui } = await setup({ journals: ["daily"] });
    mount(container);
    await userEvent.click(screen.getByLabelText(`${m.journal_dashboard_edit()} daily`));
    expect(ui.current.value?.subpage.key).toBe("journal-edit");
    expect(ui.current.value?.props).toEqual({ journalName: "daily" });
  });

  it("invokes DeleteJournalFlow when Delete is clicked", async () => {
    const { container, flows } = await setup({ journals: ["daily"] });
    mount(container);
    await userEvent.click(screen.getByLabelText(`${m.journal_dashboard_delete()} daily`));
    expect(flows.invoke).toHaveBeenCalledWith(DeleteJournalFlow, { journalName: "daily" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/shelves/ui/JournalsDashboardBlock.test.ts`
Expected: FAIL — `src/shelves/ui/JournalsDashboardBlock.vue` does not exist.

- [ ] **Step 3: Create the component**

Create `src/shelves/ui/JournalsDashboardBlock.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import {
  AddJournalFlow,
  DeleteJournalFlow,
  journalConfigCollection,
  journalEditSubpage,
  type JournalConfig,
} from "@/journals";
import { SettingsService, SettingsUiService } from "@/settings";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";

import { shelvesCollection } from "../config";

import JournalList from "./JournalList.vue";

const settings = useService(SettingsService);
const ui = useService(SettingsUiService);
const flows = useService(Flows);
const journals = settings.getCollection(journalConfigCollection);
const shelves = settings.getCollection(shelvesCollection);

const shelvedNames = computed(() => new Set(Object.values(shelves.entries).flatMap((shelf) => shelf.journals)));
const hasShelves = computed(() => Object.keys(shelves.entries).length > 0);

const entries = computed<readonly [string, JournalConfig][]>(() =>
  (Object.entries(journals.entries) as [string, JournalConfig][])
    .filter(([name]) => !shelvedNames.value.has(name))
    .toSorted(([a], [b]) => a.localeCompare(b)),
);

const expanded = ref(true);

function add(): void {
  void flows.invoke(AddJournalFlow);
}
function edit(journalName: string): void {
  ui.push(journalEditSubpage, { journalName });
}
function remove(journalName: string): void {
  void flows.invoke(DeleteJournalFlow, { journalName });
}
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded">
    <template #trigger>
      <UiIconedRow icon="book-open">
        {{ hasShelves ? m.shelf_journals_block_title_filtered() : m.shelf_journals_block_title() }}
        <span class="flair">{{ entries.length }}</span>
      </UiIconedRow>
    </template>
    <template #controls>
      <UiIconButton icon="plus" cta :tooltip="m.journal_dashboard_add()" @click="add" />
    </template>
    <JournalList :entries="entries" :empty-text="m.journal_dashboard_empty()" @edit="edit" @delete="remove" />
  </UiCollapsibleBlock>
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/shelves/ui/JournalsDashboardBlock.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the quality gates**

Run: `npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shelves/ui/JournalsDashboardBlock.vue src/shelves/ui/JournalsDashboardBlock.test.ts
git commit -m "feat(shelves): add the not-on-shelf journals block"
```

---

## Task 14: JournalShelfSection

**Files:**

- Create: `src/shelves/ui/JournalShelfSection.vue`
- Test: `src/shelves/ui/JournalShelfSection.test.ts`

A section appended to the journal editor through `JournalEditSectionToken`. Shows the journal's current shelf and a button that opens the place-journal flow.

- [ ] **Step 1: Write the failing test**

Create `src/shelves/ui/JournalShelfSection.test.ts`:

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

import { shelvesCollection } from "../config";

import JournalShelfSection from "./JournalShelfSection.vue";
import { PlaceJournalFlow } from "./place-journal.flow";

afterEach(() => cleanup());

async function setup(shelves: Record<string, { name: string; journals: string[] }> = {}) {
  const { service: settings, container } = createSettingsService({
    collections: [shelvesCollection],
    raw: { version: 3, shelves },
  });
  await settings.initialize();
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container.register(Flows).useClass(Flows);
  const flows = container.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  return { container, flows };
}

function mount(container: Container, journalName: string) {
  return render(JournalShelfSection, {
    props: { journalName },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

describe("JournalShelfSection", () => {
  it("shows the not-on-a-shelf message when the journal is unassigned", async () => {
    const { container } = await setup({ Work: { name: "Work", journals: [] } });
    mount(container, "daily");
    expect(screen.getByText(m.shelf_section_not_on_shelf())).toBeTruthy();
  });

  it("shows the current shelf when the journal is on one", async () => {
    const { container } = await setup({ Work: { name: "Work", journals: ["daily"] } });
    mount(container, "daily");
    expect(screen.getByText("Work")).toBeTruthy();
  });

  it("invokes PlaceJournalFlow when the place button is clicked", async () => {
    const { container, flows } = await setup({ Work: { name: "Work", journals: [] } });
    mount(container, "daily");
    await userEvent.click(screen.getByLabelText(m.shelf_section_place_tooltip()));
    expect(flows.invoke).toHaveBeenCalledWith(PlaceJournalFlow, { journalName: "daily" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/shelves/ui/JournalShelfSection.test.ts`
Expected: FAIL — `JournalShelfSection.vue` does not exist.

- [ ] **Step 3: Create the component**

Create `src/shelves/ui/JournalShelfSection.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { SettingsService } from "@/settings";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { shelvesCollection } from "../config";

import { PlaceJournalFlow } from "./place-journal.flow";

const { journalName } = defineProps<{ journalName: string }>();

const settings = useService(SettingsService);
const flows = useService(Flows);
const shelves = settings.getCollection(shelvesCollection);

const currentShelf = computed(
  () => Object.keys(shelves.entries).find((name) => shelves.get(name)?.journals.includes(journalName)) ?? "",
);

const expanded = ref(false);

function place(): void {
  void flows.invoke(PlaceJournalFlow, { journalName });
}
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded">
    <template #trigger>
      <span class="journal-section-heading">
        <UiIcon name="library" />
        <span>{{ m.shelf_section_title() }}</span>
      </span>
    </template>

    <UiSettingRow :name="m.shelf_section_title()">
      <span>{{ currentShelf === "" ? m.shelf_section_not_on_shelf() : currentShelf }}</span>
      <UiIconButton icon="pencil" :tooltip="m.shelf_section_place_tooltip()" @click="place" />
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
</style>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/shelves/ui/JournalShelfSection.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the quality gates**

Run: `npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shelves/ui/JournalShelfSection.vue src/shelves/ui/JournalShelfSection.test.ts
git commit -m "feat(shelves): add the journal-editor shelf section"
```

---

## Task 15: Wiring and journals-block removal

**Files:**

- Modify: `src/shelves/module.ts`
- Modify: `src/journals/settings/module.ts`
- Delete: `src/journals/settings/ui/JournalsDashboardBlock.vue`
- Delete: `src/journals/settings/ui/JournalsDashboardBlock.test.ts`

This task registers all the new UI and removes the old journals dashboard block. Module wiring is not unit-tested; correctness is verified by the full quality gates.

- [ ] **Step 1: Register everything in the shelves module**

Replace the contents of `src/shelves/module.ts` with:

```ts
import type { Module } from "@/infrastructure/di";
import { JournalEditSectionToken, defineJournalEditSection } from "@/journals";
import { CollectionDefinitionToken, DashboardBlockToken, SubpageToken, defineDashboardBlock } from "@/settings";

import { shelvesCollection } from "./config";
import { ShelvesLifecycleService } from "./lifecycle";
import { DeleteShelfFlow } from "./ui/delete-shelf.flow";
import { EditShelfNameFlow } from "./ui/edit-shelf-name.flow";
import JournalsDashboardBlock from "./ui/JournalsDashboardBlock.vue";
import JournalShelfSection from "./ui/JournalShelfSection.vue";
import { PlaceJournalFlow } from "./ui/place-journal.flow";
import { shelfEditSubpage } from "./ui/shelf-edit-subpage";
import ShelvesDashboardBlock from "./ui/ShelvesDashboardBlock.vue";

import type { Component } from "vue";

export const shelvesModule: Module = {
  register(c) {
    c.register(CollectionDefinitionToken).useValue(shelvesCollection);
    c.register(ShelvesLifecycleService).useClass(ShelvesLifecycleService).eager();
    c.register(EditShelfNameFlow).useClass(EditShelfNameFlow);
    c.register(DeleteShelfFlow).useClass(DeleteShelfFlow);
    c.register(PlaceJournalFlow).useClass(PlaceJournalFlow);
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "shelves", component: ShelvesDashboardBlock as Component, order: 4 }),
    );
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "journals", component: JournalsDashboardBlock as Component, order: 5 }),
    );
    c.register(SubpageToken).useValue(shelfEditSubpage);
    c.register(JournalEditSectionToken).useValue(
      defineJournalEditSection({ key: "shelf", component: JournalShelfSection as Component, order: 5 }),
    );
  },
};
```

- [ ] **Step 2: Drop the dashboard block from the journals settings module**

In `src/journals/settings/module.ts`:

Change the settings import line from:

```ts
import { DashboardBlockToken, SubpageToken, defineDashboardBlock } from "@/settings";
```

to:

```ts
import { SubpageToken } from "@/settings";
```

Remove the `JournalsDashboardBlock` import line:

```ts
import JournalsDashboardBlock from "./ui/JournalsDashboardBlock.vue";
```

Remove the `import type { Component } from "vue";` line (no longer used).

Remove the block registration from `register`:

```ts
c.register(DashboardBlockToken).useValue(
  defineDashboardBlock({ key: "journals", component: JournalsDashboardBlock as Component, order: 5 }),
);
```

The `register` body keeps the five `useClass` flow/service registrations and the `SubpageToken` registration.

- [ ] **Step 3: Delete the old journals dashboard block and its test**

Run:

```bash
git rm src/journals/settings/ui/JournalsDashboardBlock.vue src/journals/settings/ui/JournalsDashboardBlock.test.ts
```

- [ ] **Step 4: Run the full quality gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: PASS. All shelf UI test files pass; no references to the deleted `src/journals/settings/ui/JournalsDashboardBlock.vue` remain.

- [ ] **Step 5: Commit**

```bash
git add src/shelves/module.ts src/journals/settings/module.ts src/journals/settings/ui/JournalsDashboardBlock.vue src/journals/settings/ui/JournalsDashboardBlock.test.ts
git commit -m "feat(shelves): register the shelf settings UI"
```

---

## Final verification

- [ ] **Run all quality gates one last time**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all PASS.

- [ ] **Manual smoke check (optional but recommended)**

Open the plugin settings in the test vault and confirm: the "Journal shelves" block appears above the journals block; creating a shelf navigates into its detail page; the journals block lists only un-shelved journals; the journal editor shows a "Shelf" section.
