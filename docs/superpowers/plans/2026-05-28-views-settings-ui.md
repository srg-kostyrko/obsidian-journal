# Views Settings UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the settings-UI scaffold for v3 views: dashboard listing + edit subpage + blocks list + the three supporting flows/modals, driving the already-built `ViewsService` / `ViewsRepository`.

**Architecture:** Mirror the shelves feature exactly — `ViewsViewModel` over the repository, three `Flow` classes for user-triggered actions, three `defineModal` definitions consolidated in `ui/modals.ts`, dashboard block + subpage registered via the existing `DashboardBlockToken` / `SubpageToken`. Reorder uses the service's `moveBlockUp/Down`; no drag library. Inline per-block config UI and toolbar items are explicitly out of scope (see `docs/superpowers/specs/2026-05-28-views-settings-ui-design.md`).

**Tech Stack:** Vue 3 SFCs, vee-validate + valibot, `@testing-library/vue` + `@testing-library/user-event`, vitest, paraglide (`m.*` i18n), nanoevents.

---

## File map

**Create:**

- `src/views/view-model.ts` + `view-model.test.ts`
- `src/views/flows/edit-view-name.flow.ts` + `.test.ts`
- `src/views/flows/delete-view.flow.ts` + `.test.ts`
- `src/views/flows/add-block-to-view.flow.ts` + `.test.ts`
- `src/views/ui/modals.ts`
- `src/views/ui/ViewNameModal.vue` + `ViewNameModal.test.ts`
- `src/views/ui/DeleteViewModal.vue` + `DeleteViewModal.test.ts`
- `src/views/ui/AddBlockPickerModal.vue` + `AddBlockPickerModal.test.ts`
- `src/views/ui/view-edit-subpage.ts`
- `src/views/ui/BlocksList.vue` + `BlocksList.test.ts`
- `src/views/ui/ViewEditSubpage.vue` + `ViewEditSubpage.test.ts`
- `src/views/ui/ViewsDashboardBlock.vue` + `ViewsDashboardBlock.test.ts`

**Modify:**

- `src/views/errors.ts` — add `ViewsLifecycleFlowError` + `toFlowError`.
- `src/views/index.ts` — export `ViewsViewModel`, `viewEditSubpage`.
- `src/views/module.ts` — register view-model, flows, dashboard block, subpage.
- `messages/en.json` — add `view_*` keys.

---

### Task 1: ViewsViewModel

Reactive read-side over `ViewsRepository`, mirroring `ShelvesViewModel`.

**Files:**

- Create: `src/views/view-model.ts`
- Test: `src/views/view-model.test.ts`

- [ ] **Step 1: Write the failing test**

`src/views/view-model.test.ts`:

```ts
import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";
import { reactive } from "vue";

import type { View, ViewId } from "./config";
import { ViewsRepository } from "./repository";
import type { ViewsEvents } from "./tokens";
import { ViewsViewModel } from "./view-model";

function makeView(id: string, name: string): View {
  return {
    id: id as ViewId,
    name,
    icon: "calendar-days",
    defaultShelf: null,
    showInRibbon: false,
    blocks: [],
  };
}

function buildVM(initial: View[] = []) {
  const storage = reactive<Record<string, View>>({});
  for (const v of initial) storage[v.id] = v;
  const events = createNanoEvents<ViewsEvents>();
  const repo = ViewsRepository.fromParts(storage, events);
  const vm = ViewsViewModel.fromRepository(repo);
  return { vm, repo };
}

describe("ViewsViewModel", () => {
  describe("views", () => {
    it("sorts entries by name", () => {
      const { vm } = buildVM([makeView("b", "Beta"), makeView("a", "Alpha")]);
      expect(vm.views.value.map((v) => v.name)).toEqual(["Alpha", "Beta"]);
    });

    it("reflects mutations after create", () => {
      const { vm, repo } = buildVM();
      repo.create(makeView("a", "Alpha"));
      expect(vm.views.value.map((v) => v.name)).toEqual(["Alpha"]);
    });
  });

  describe("viewCount", () => {
    it("returns the count", () => {
      const { vm } = buildVM([makeView("a", "Alpha")]);
      expect(vm.viewCount.value).toBe(1);
    });
  });

  describe("getView", () => {
    it("returns Some for a known id", () => {
      const { vm } = buildVM([makeView("a", "Alpha")]);
      expect(vm.getView("a" as ViewId).isSome()).toBe(true);
    });

    it("returns None for an unknown id", () => {
      const { vm } = buildVM();
      expect(vm.getView("missing" as ViewId).isNone()).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/views/view-model.test.ts`
Expected: FAIL — `Cannot find module './view-model'`.

- [ ] **Step 3: Write the implementation**

`src/views/view-model.ts`:

```ts
import { computed, type ComputedRef } from "vue";

import { inject } from "@/infrastructure/di";
import type { Option } from "@/infrastructure/result";

import { ViewsRepository } from "./repository";

import type { View, ViewId } from "./config";

export class ViewsViewModel {
  readonly #repository: ViewsRepository;

  readonly views: ComputedRef<View[]>;
  readonly viewCount: ComputedRef<number>;

  constructor(repository: ViewsRepository = inject(ViewsRepository)) {
    this.#repository = repository;
    this.views = computed(() => [...repository.find().list()].toSorted((a, b) => a.name.localeCompare(b.name)));
    this.viewCount = computed(() => repository.count());
  }

  static fromRepository(repository: ViewsRepository): ViewsViewModel {
    return new ViewsViewModel(repository);
  }

  getView(id: ViewId): Option<View> {
    return this.#repository.get(id);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/views/view-model.test.ts`
Expected: PASS, four tests.

- [ ] **Step 5: Commit**

```bash
git add src/views/view-model.ts src/views/view-model.test.ts
git commit -m "feat(views): ViewsViewModel"
```

---

### Task 2: ViewsLifecycleFlowError + toFlowError

Add the flow-error wrapper mirroring shelves' pattern. Flows can't yield `ViewsService` errors directly through `attempt.in` without this conversion.

**Files:**

- Modify: `src/views/errors.ts`

- [ ] **Step 1: Edit `src/views/errors.ts`**

Add at top of the imports:

```ts
import { FlowError } from "@/infrastructure/flows";
```

Add after the existing `ViewsLifecycleError` type alias at the bottom of the file:

```ts
export class ViewsLifecycleFlowError extends FlowError {
  readonly kind = "views-lifecycle" as const;
  constructor(public override readonly cause: ViewsLifecycleError | UnknownViewError) {
    super(cause.message);
    this.name = "ViewsLifecycleFlowError";
  }
}

export function toFlowError(cause: ViewsLifecycleError | UnknownViewError): ViewsLifecycleFlowError {
  return new ViewsLifecycleFlowError(cause);
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/views/errors.ts
git commit -m "feat(views): toFlowError + ViewsLifecycleFlowError"
```

---

### Task 3: i18n messages

Add every `view_*` string used by later tasks in one place so flows and components can reference them as they land.

**Files:**

- Modify: `messages/en.json`

- [ ] **Step 1: Add keys**

Open `messages/en.json` and insert the following keys (alphabetical placement is fine; the file is a flat JSON object). Add them somewhere after the existing `"shelf_*"` keys for proximity:

```json
"view_dashboard_section_title": "Views",
"view_dashboard_empty": "No views yet.",
"view_dashboard_add": "Add a view",
"view_dashboard_open": "Open {name}",
"view_dashboard_clone": "Clone {name}",
"view_dashboard_delete": "Delete {name}",
"view_add_modal_title": "Add view",
"view_rename_modal_title": "Rename view",
"view_modal_name_label": "Name",
"view_name_required_error": "Name is required.",
"view_name_unchanged_error": "Pick a different name.",
"view_delete_modal_title": "Delete view {name}?",
"view_delete_modal_description": "This action cannot be undone.",
"view_add_block_modal_title": "Add block",
"view_add_block_empty": "No block types are registered.",
"view_edit_header_title": "View: {name}",
"view_edit_rename_tooltip": "Rename view",
"view_edit_name_label": "Name",
"view_edit_icon_label": "Icon",
"view_edit_default_shelf_label": "Default shelf",
"view_edit_default_shelf_all": "All journals",
"view_edit_show_in_ribbon_label": "Show in ribbon",
"view_edit_blocks_title": "Blocks",
"view_edit_blocks_add": "Add block",
"view_edit_blocks_empty": "No blocks yet.",
"view_block_unknown_label": "Unknown block: {key}",
"view_block_move_up": "Move up",
"view_block_move_down": "Move down",
"view_block_remove": "Remove block",
```

- [ ] **Step 2: Verify the project still builds**

Run: `npm run check:types`
Expected: PASS. (Paraglide regenerates message accessors on build/dev; if the type system requires regenerating, the next test run will surface it.)

- [ ] **Step 3: Commit**

```bash
git add messages/en.json
git commit -m "feat(views): settings UI i18n strings"
```

---

### Task 4: viewNameModal definition + ViewNameModal.vue

The text-input modal used both for "Add view" and "Rename view". Pattern matches `ShelfNameModal.vue`.

**Files:**

- Create: `src/views/ui/modals.ts`
- Create: `src/views/ui/ViewNameModal.vue`
- Test: `src/views/ui/ViewNameModal.test.ts`

- [ ] **Step 1: Write the failing test**

`src/views/ui/ViewNameModal.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";

import ViewNameModal from "./ViewNameModal.vue";

afterEach(() => cleanup());

function mountModal(props: { currentName?: string } = {}) {
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<string> = { submit, cancel };
  render(ViewNameModal, {
    props,
    global: {
      plugins: [{ install: (app) => provideModalApiOnApp(app, api as ModalApi<unknown>) }],
    },
  });
  return { submit, cancel };
}

describe("ViewNameModal", () => {
  it("submits the entered name", async () => {
    const { submit } = mountModal();
    await userEvent.type(screen.getByRole("textbox"), "Weekly");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    expect(submit).toHaveBeenCalledWith("Weekly");
  });

  it("shows the required-error for an empty name", async () => {
    mountModal();
    await userEvent.click(screen.getByText(m.common_action_submit()));
    expect(screen.getByText(m.view_name_required_error())).toBeTruthy();
  });

  it("rejects the unchanged name when renaming", async () => {
    mountModal({ currentName: "Weekly" });
    await userEvent.click(screen.getByText(m.common_action_submit()));
    expect(screen.getByText(m.view_name_unchanged_error())).toBeTruthy();
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = mountModal();
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/views/ui/ViewNameModal.test.ts`
Expected: FAIL — file not found.

- [ ] **Step 3: Create `src/views/ui/modals.ts`**

```ts
import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import AddBlockPickerModal from "./AddBlockPickerModal.vue";
import DeleteViewModal from "./DeleteViewModal.vue";
import ViewNameModal from "./ViewNameModal.vue";

import type { ViewBlockDefinition } from "../define-view-block";

export interface ViewNameModalProps {
  currentName?: string;
}

export const viewNameModal = defineModal<string>()({
  component: ViewNameModal,
  title: ({ currentName }: ViewNameModalProps) =>
    currentName === undefined ? m.view_add_modal_title() : m.view_rename_modal_title(),
});

export interface DeleteViewModalProps {
  viewName: string;
}

export const deleteViewModal = defineModal<void>()({
  component: DeleteViewModal,
  title: ({ viewName }: DeleteViewModalProps) => m.view_delete_modal_title({ name: viewName }),
});

export interface AddBlockPickerModalProps {
  definitions: readonly ViewBlockDefinition[];
}

export const addBlockPickerModal = defineModal<string>()({
  component: AddBlockPickerModal,
  title: (_: AddBlockPickerModalProps) => m.view_add_block_modal_title(),
});
```

> Note: this file imports all three modal components even though only `ViewNameModal` exists at this point. After step 4 below, the typecheck will pass (Tasks 6 and 8 add the other two components).

Defer the typecheck of `modals.ts` to Task 8. For now, suppress imports of the not-yet-existing components by stubbing them as empty `.vue` files in step 4.

- [ ] **Step 4: Create three SFC stubs so `modals.ts` compiles**

`src/views/ui/DeleteViewModal.vue` (Task 6 replaces this):

```vue
<template><div /></template>
```

`src/views/ui/AddBlockPickerModal.vue` (Task 8 replaces this):

```vue
<template><div /></template>
```

`src/views/ui/ViewNameModal.vue` — full implementation:

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

const props = withDefaults(defineProps<{ currentName?: string }>(), { currentName: undefined });

const api = useModal<string>();

const { defineField, errorBag, handleSubmit } = useForm({
  initialValues: { name: props.currentName ?? "" },
  validationSchema: toTypedSchema(
    v.object({
      name: v.pipe(
        v.string(),
        v.nonEmpty(m.view_name_required_error()),
        v.check(
          (value) => props.currentName === undefined || value !== props.currentName,
          m.view_name_unchanged_error(),
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
    <UiSettingRow :name="m.view_modal_name_label()">
      <template #description>
        <span v-for="error of errorBag.name" :key="error" class="view-form-error">{{ error }}</span>
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
.view-form-error {
  color: var(--text-error);
  display: block;
}
</style>
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/views/ui/ViewNameModal.test.ts`
Expected: PASS, four tests.

- [ ] **Step 6: Commit**

```bash
git add src/views/ui/modals.ts src/views/ui/ViewNameModal.vue src/views/ui/ViewNameModal.test.ts src/views/ui/DeleteViewModal.vue src/views/ui/AddBlockPickerModal.vue
git commit -m "feat(views): ViewNameModal + modal definitions"
```

---

### Task 5: EditViewNameFlow

Wraps `viewNameModal`. Creates or renames depending on whether `viewId` was passed.

**Files:**

- Create: `src/views/flows/edit-view-name.flow.ts`
- Test: `src/views/flows/edit-view-name.flow.test.ts`

- [ ] **Step 1: Write the failing test**

`src/views/flows/edit-view-name.flow.test.ts`:

```ts
import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { createSettingsService } from "@/settings/testing";

import { viewsCollection } from "../config";
import { ViewsRepository } from "../repository";
import { ViewsService } from "../service";
import { ViewBlockDefinitionToken, ViewsEventsToken } from "../tokens";

import { EditViewNameFlow } from "./edit-view-name.flow";

import type { ViewId } from "../config";

async function build(raw?: unknown) {
  const { service: settings, container } = createSettingsService({
    collections: [viewsCollection],
    raw,
  });
  await settings.initialize();
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(ViewsEventsToken).useFactory(() => createNanoEvents());
  container.register(ViewBlockDefinitionToken).useFactory(() => []);
  container.register(ViewsRepository).useClass(ViewsRepository);
  container.register(ViewsService).useClass(ViewsService);
  container.register(Flows).useClass(Flows);
  container.register(EditViewNameFlow).useClass(EditViewNameFlow);
  return { repo: container.resolve(ViewsRepository), modals, flows: container.resolve(Flows) };
}

describe("EditViewNameFlow", () => {
  it("creates a new view with the entered name", async () => {
    const { flows, modals, repo } = await build();
    const promise = flows.invoke(EditViewNameFlow, {});
    modals.lastOpen<unknown, string>().submit("Weekly");
    const result = await promise;
    expect(result.kind).toBe("ok");
    expect(
      repo
        .find()
        .list()
        .some((v) => v.name === "Weekly"),
    ).toBe(true);
  });

  it("renames an existing view", async () => {
    const id = "11111111-1111-1111-1111-111111111111" as ViewId;
    const raw = {
      version: 3,
      views: {
        [id]: { id, name: "Old", icon: "calendar-days", defaultShelf: null, showInRibbon: false, blocks: [] },
      },
    };
    const { flows, modals, repo } = await build(raw);
    const promise = flows.invoke(EditViewNameFlow, { viewId: id });
    modals.lastOpen<unknown, string>().submit("New");
    await promise;
    expect(repo.get(id).getOr(undefined as never)?.name).toBe("New");
  });

  it("returns UserAborted when the modal is cancelled", async () => {
    const { flows, modals } = await build();
    const promise = flows.invoke(EditViewNameFlow, {});
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/views/flows/edit-view-name.flow.test.ts`
Expected: FAIL — file not found.

- [ ] **Step 3: Write the implementation**

`src/views/flows/edit-view-name.flow.ts`:

```ts
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import { toFlowError } from "../errors";
import { ViewsService } from "../service";
import { ViewsViewModel } from "../view-model";
import { viewNameModal } from "../ui/modals";

import type { ViewId } from "../config";

export interface EditViewNameParameters {
  readonly viewId?: ViewId;
}

export class EditViewNameFlow implements Flow<EditViewNameParameters, { viewId: ViewId }, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #views = inject(ViewsService);
  readonly #vm = inject(ViewsViewModel);

  execute(parameters: EditViewNameParameters): AsyncResult<{ viewId: ViewId }, FlowError> {
    return attempt.in(this, async function* (this: EditViewNameFlow) {
      const currentName =
        parameters.viewId === undefined
          ? undefined
          : this.#vm
              .getView(parameters.viewId)
              .map((v) => v.name)
              .getOr(undefined as never);
      const name = yield* this.#modals
        .open(viewNameModal, { currentName })
        .mapErr(() => new UserAborted("view-name-modal"));
      if (parameters.viewId === undefined) {
        const id = yield* this.#views.create({ name }).mapErr(toFlowError);
        return { viewId: id };
      }
      const viewId = parameters.viewId;
      yield* this.#views.update(viewId, { name }).mapErr(toFlowError);
      return { viewId };
    });
  }
}
```

(`Option.map(...).getOr(undefined as never)` is the project's idiom — see `JournalsViewModel` consumers.)

- [ ] **Step 4: Update the test to register `ViewsViewModel`**

Edit `src/views/flows/edit-view-name.flow.test.ts`, add to imports:

```ts
import { ViewsViewModel } from "../view-model";
```

In `build()`, after the `ViewsRepository` registration, add:

```ts
container.register(ViewsViewModel).useClass(ViewsViewModel);
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/views/flows/edit-view-name.flow.test.ts`
Expected: PASS, three tests.

- [ ] **Step 6: Commit**

```bash
git add src/views/flows/edit-view-name.flow.ts src/views/flows/edit-view-name.flow.test.ts
git commit -m "feat(views): EditViewNameFlow"
```

---

### Task 6: DeleteViewModal.vue

Replace the stub from Task 4 with a confirm-only modal.

**Files:**

- Modify: `src/views/ui/DeleteViewModal.vue`
- Test: `src/views/ui/DeleteViewModal.test.ts`

- [ ] **Step 1: Write the failing test**

`src/views/ui/DeleteViewModal.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";

import DeleteViewModal from "./DeleteViewModal.vue";

afterEach(() => cleanup());

function mountModal() {
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<void> = { submit, cancel };
  render(DeleteViewModal, {
    props: { viewName: "Weekly" },
    global: { plugins: [{ install: (app) => provideModalApiOnApp(app, api as ModalApi<unknown>) }] },
  });
  return { submit, cancel };
}

describe("DeleteViewModal", () => {
  it("submits when the user clicks Delete", async () => {
    const { submit } = mountModal();
    await userEvent.click(screen.getByText(m.common_action_delete()));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = mountModal();
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("shows the description copy", () => {
    mountModal();
    expect(screen.getByText(m.view_delete_modal_description())).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/views/ui/DeleteViewModal.test.ts`
Expected: FAIL — the stub renders nothing matching the test queries.

- [ ] **Step 3: Replace `src/views/ui/DeleteViewModal.vue`**

```vue
<script setup lang="ts">
import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

defineProps<{ viewName: string }>();

const api = useModal<void>();
</script>

<template>
  <div>
    <UiSettingRow>
      <template #description>{{ m.view_delete_modal_description() }}</template>
    </UiSettingRow>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta warning @click="api.submit()">{{ m.common_action_delete() }}</UiButton>
    </UiSettingRow>
  </div>
</template>
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/views/ui/DeleteViewModal.test.ts`
Expected: PASS, three tests.

- [ ] **Step 5: Commit**

```bash
git add src/views/ui/DeleteViewModal.vue src/views/ui/DeleteViewModal.test.ts
git commit -m "feat(views): DeleteViewModal"
```

---

### Task 7: DeleteViewFlow

**Files:**

- Create: `src/views/flows/delete-view.flow.ts`
- Test: `src/views/flows/delete-view.flow.test.ts`

- [ ] **Step 1: Write the failing test**

`src/views/flows/delete-view.flow.test.ts`:

```ts
import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { createSettingsService } from "@/settings/testing";

import { viewsCollection } from "../config";
import { ViewsRepository } from "../repository";
import { ViewsService } from "../service";
import { ViewBlockDefinitionToken, ViewsEventsToken } from "../tokens";
import { ViewsViewModel } from "../view-model";

import { DeleteViewFlow } from "./delete-view.flow";

import type { ViewId } from "../config";

async function build() {
  const id = "11111111-1111-1111-1111-111111111111" as ViewId;
  const raw = {
    version: 3,
    views: {
      [id]: { id, name: "Weekly", icon: "calendar-days", defaultShelf: null, showInRibbon: false, blocks: [] },
    },
  };
  const { service: settings, container } = createSettingsService({ collections: [viewsCollection], raw });
  await settings.initialize();
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(ViewsEventsToken).useFactory(() => createNanoEvents());
  container.register(ViewBlockDefinitionToken).useFactory(() => []);
  container.register(ViewsRepository).useClass(ViewsRepository);
  container.register(ViewsService).useClass(ViewsService);
  container.register(ViewsViewModel).useClass(ViewsViewModel);
  container.register(Flows).useClass(Flows);
  container.register(DeleteViewFlow).useClass(DeleteViewFlow);
  return { id, repo: container.resolve(ViewsRepository), modals, flows: container.resolve(Flows) };
}

describe("DeleteViewFlow", () => {
  it("deletes the view on submit", async () => {
    const { id, flows, modals, repo } = await build();
    const promise = flows.invoke(DeleteViewFlow, { viewId: id });
    modals.lastOpen<unknown, void>().submit(undefined);
    await promise;
    expect(repo.get(id).isNone()).toBe(true);
  });

  it("returns UserAborted when the modal is cancelled", async () => {
    const { id, flows, modals, repo } = await build();
    const promise = flows.invoke(DeleteViewFlow, { viewId: id });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(repo.get(id).isSome()).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/views/flows/delete-view.flow.test.ts`
Expected: FAIL — file not found.

- [ ] **Step 3: Write the implementation**

`src/views/flows/delete-view.flow.ts`:

```ts
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import { toFlowError } from "../errors";
import { ViewsService } from "../service";
import { ViewsViewModel } from "../view-model";
import { deleteViewModal } from "../ui/modals";

import type { ViewId } from "../config";

export class DeleteViewFlow implements Flow<{ viewId: ViewId }, void, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #views = inject(ViewsService);
  readonly #vm = inject(ViewsViewModel);

  execute(parameters: { viewId: ViewId }): AsyncResult<void, FlowError> {
    return attempt.in(this, async function* (this: DeleteViewFlow) {
      const viewName = this.#vm
        .getView(parameters.viewId)
        .map((v) => v.name)
        .getOr(undefined as never);
      yield* this.#modals
        .open(deleteViewModal, { viewName: viewName ?? "" })
        .mapErr(() => new UserAborted("delete-view-modal"));
      yield* this.#views.delete(parameters.viewId).mapErr(toFlowError);
    });
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/views/flows/delete-view.flow.test.ts`
Expected: PASS, two tests.

- [ ] **Step 5: Commit**

```bash
git add src/views/flows/delete-view.flow.ts src/views/flows/delete-view.flow.test.ts
git commit -m "feat(views): DeleteViewFlow"
```

---

### Task 8: AddBlockPickerModal.vue

Replace the stub from Task 4. Lists registered `ViewBlockDefinition`s and submits the chosen `key`. Shows an empty-state row when none are registered.

**Files:**

- Modify: `src/views/ui/AddBlockPickerModal.vue`
- Test: `src/views/ui/AddBlockPickerModal.test.ts`

- [ ] **Step 1: Write the failing test**

`src/views/ui/AddBlockPickerModal.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";
import * as v from "valibot";

import AddBlockPickerModal from "./AddBlockPickerModal.vue";

import type { ViewBlockDefinition } from "../define-view-block";

afterEach(() => cleanup());

function def(key: string, label: string): ViewBlockDefinition {
  return {
    key,
    label,
    schema: v.object({}),
    defaultConfig: {},
    component: { render: () => null },
  } as unknown as ViewBlockDefinition;
}

function mountModal(definitions: ViewBlockDefinition[]) {
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<string> = { submit, cancel };
  render(AddBlockPickerModal, {
    props: { definitions },
    global: { plugins: [{ install: (app) => provideModalApiOnApp(app, api as ModalApi<unknown>) }] },
  });
  return { submit, cancel };
}

describe("AddBlockPickerModal", () => {
  it("submits the chosen key", async () => {
    const { submit } = mountModal([def("month-calendar", "Month calendar"), def("divider", "Divider")]);
    await userEvent.click(screen.getByText("Divider"));
    expect(submit).toHaveBeenCalledWith("divider");
  });

  it("shows the empty state when no blocks are registered", () => {
    mountModal([]);
    expect(screen.getByText(m.view_add_block_empty())).toBeTruthy();
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = mountModal([def("divider", "Divider")]);
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/views/ui/AddBlockPickerModal.test.ts`
Expected: FAIL — stub doesn't render the queried text.

- [ ] **Step 3: Replace `src/views/ui/AddBlockPickerModal.vue`**

```vue
<script setup lang="ts">
import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import type { ViewBlockDefinition } from "../define-view-block";

defineProps<{ definitions: readonly ViewBlockDefinition[] }>();

const api = useModal<string>();
</script>

<template>
  <div>
    <UiSettingRow v-if="definitions.length === 0">
      <template #description>{{ m.view_add_block_empty() }}</template>
    </UiSettingRow>
    <UiSettingRow v-for="d of definitions" :key="d.key">
      <template #name>
        <UiIcon v-if="d.icon" :icon="d.icon" />
        <button type="button" class="block-picker-row" @click="api.submit(d.key)">{{ d.label }}</button>
      </template>
      <template v-if="d.description" #description>{{ d.description }}</template>
    </UiSettingRow>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
    </UiSettingRow>
  </div>
</template>

<style scoped>
.block-picker-row {
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
}
</style>
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/views/ui/AddBlockPickerModal.test.ts`
Expected: PASS, three tests.

- [ ] **Step 5: Verify `modals.ts` typechecks against the real components**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/views/ui/AddBlockPickerModal.vue src/views/ui/AddBlockPickerModal.test.ts
git commit -m "feat(views): AddBlockPickerModal"
```

---

### Task 9: AddBlockToViewFlow

**Files:**

- Create: `src/views/flows/add-block-to-view.flow.ts`
- Test: `src/views/flows/add-block-to-view.flow.test.ts`

- [ ] **Step 1: Write the failing test**

`src/views/flows/add-block-to-view.flow.test.ts`:

```ts
import { createNanoEvents } from "nanoevents";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { createSettingsService } from "@/settings/testing";

import { viewsCollection } from "../config";
import type { ViewBlockDefinition } from "../define-view-block";
import { ViewsRepository } from "../repository";
import { ViewsService } from "../service";
import { ViewBlockDefinitionToken, ViewsEventsToken } from "../tokens";

import { AddBlockToViewFlow } from "./add-block-to-view.flow";

import type { ViewId } from "../config";

const id = "11111111-1111-1111-1111-111111111111" as ViewId;

const dividerDef = {
  key: "divider",
  label: "Divider",
  schema: v.object({}),
  defaultConfig: {},
  component: { render: () => null },
} as unknown as ViewBlockDefinition;

async function build() {
  const raw = {
    version: 3,
    views: {
      [id]: { id, name: "Weekly", icon: "calendar-days", defaultShelf: null, showInRibbon: false, blocks: [] },
    },
  };
  const { service: settings, container } = createSettingsService({ collections: [viewsCollection], raw });
  await settings.initialize();
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(ViewsEventsToken).useFactory(() => createNanoEvents());
  container.register(ViewBlockDefinitionToken).useFactory(() => [dividerDef]);
  container.register(ViewsRepository).useClass(ViewsRepository);
  container.register(ViewsService).useClass(ViewsService);
  container.register(Flows).useClass(Flows);
  container.register(AddBlockToViewFlow).useClass(AddBlockToViewFlow);
  return { repo: container.resolve(ViewsRepository), modals, flows: container.resolve(Flows) };
}

describe("AddBlockToViewFlow", () => {
  it("appends the chosen block to the view", async () => {
    const { flows, modals, repo } = await build();
    const promise = flows.invoke(AddBlockToViewFlow, { viewId: id });
    modals.lastOpen<unknown, string>().submit("divider");
    await promise;
    expect(
      repo
        .get(id)
        .getOr(undefined as never)
        ?.blocks.map((b) => b.key),
    ).toEqual(["divider"]);
  });

  it("returns UserAborted when the modal is cancelled", async () => {
    const { flows, modals } = await build();
    const promise = flows.invoke(AddBlockToViewFlow, { viewId: id });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/views/flows/add-block-to-view.flow.test.ts`
Expected: FAIL — file not found.

- [ ] **Step 3: Write the implementation**

`src/views/flows/add-block-to-view.flow.ts`:

```ts
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import { toFlowError } from "../errors";
import { ViewsService } from "../service";
import { ViewBlockDefinitionToken } from "../tokens";
import { addBlockPickerModal } from "../ui/modals";

import type { ViewId } from "../config";

export class AddBlockToViewFlow implements Flow<{ viewId: ViewId }, void, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #views = inject(ViewsService);
  readonly #definitions = inject(ViewBlockDefinitionToken);

  execute(parameters: { viewId: ViewId }): AsyncResult<void, FlowError> {
    return attempt.in(this, async function* (this: AddBlockToViewFlow) {
      const key = yield* this.#modals
        .open(addBlockPickerModal, { definitions: this.#definitions })
        .mapErr(() => new UserAborted("add-block-picker-modal"));
      yield* this.#views.addBlock(parameters.viewId, key).mapErr(toFlowError);
    });
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/views/flows/add-block-to-view.flow.test.ts`
Expected: PASS, two tests.

- [ ] **Step 5: Commit**

```bash
git add src/views/flows/add-block-to-view.flow.ts src/views/flows/add-block-to-view.flow.test.ts
git commit -m "feat(views): AddBlockToViewFlow"
```

---

### Task 10: view-edit-subpage definition

A tiny definition file mirroring `shelf-edit-subpage.ts`. The component referenced doesn't exist yet — create a stub now so Task 12 can replace it without churn.

**Files:**

- Create: `src/views/ui/view-edit-subpage.ts`
- Create: `src/views/ui/ViewEditSubpage.vue` (stub; replaced in Task 12)

- [ ] **Step 1: Create the stub component**

`src/views/ui/ViewEditSubpage.vue`:

```vue
<template><div /></template>
```

- [ ] **Step 2: Create the subpage definition**

`src/views/ui/view-edit-subpage.ts`:

```ts
import { defineSubpage } from "@/settings";

import ViewEditSubpage from "./ViewEditSubpage.vue";

import type { ViewId } from "../config";

export const viewEditSubpage = defineSubpage<{ viewId: ViewId }>({
  key: "view-edit",
  component: ViewEditSubpage,
});
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/views/ui/view-edit-subpage.ts src/views/ui/ViewEditSubpage.vue
git commit -m "feat(views): viewEditSubpage definition"
```

---

### Task 11: BlocksList.vue

Reactive list of `view.blocks`, with up/down/remove controls and an "Add block" button. Unknown keys render a labeled row with only the remove control.

**Files:**

- Create: `src/views/ui/BlocksList.vue`
- Test: `src/views/ui/BlocksList.test.ts`

- [ ] **Step 1: Write the failing test**

`src/views/ui/BlocksList.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import * as v from "valibot";
import { afterEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { type Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { createSettingsService } from "@/settings/testing";

import type { BlockInstanceId, ViewId } from "../config";
import { viewsCollection } from "../config";
import type { ViewBlockDefinition } from "../define-view-block";
import { AddBlockToViewFlow } from "../flows/add-block-to-view.flow";
import { ViewsRepository } from "../repository";
import { ViewsService } from "../service";
import { ViewBlockDefinitionToken, ViewsEventsToken } from "../tokens";
import { ViewsViewModel } from "../view-model";

import BlocksList from "./BlocksList.vue";

afterEach(() => cleanup());

const viewId = "11111111-1111-1111-1111-111111111111" as ViewId;

const dividerDef = {
  key: "divider",
  label: "Divider block",
  icon: "minus",
  schema: v.object({}),
  defaultConfig: {},
  component: { render: () => null },
} as unknown as ViewBlockDefinition;

async function setup(blocks: { id: string; key: string; config: Record<string, unknown> }[]) {
  const raw = {
    version: 3,
    views: {
      [viewId]: { id: viewId, name: "Weekly", icon: "calendar-days", defaultShelf: null, showInRibbon: false, blocks },
    },
  };
  const { service: settings, container } = createSettingsService({ collections: [viewsCollection], raw });
  await settings.initialize();
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container.register(ViewsEventsToken).useFactory(() => createNanoEvents());
  container.register(ViewBlockDefinitionToken).useFactory(() => [dividerDef]);
  container.register(ViewsRepository).useClass(ViewsRepository);
  container.register(ViewsService).useClass(ViewsService);
  container.register(ViewsViewModel).useClass(ViewsViewModel);
  container.register(Flows).useClass(Flows);
  container.register(AddBlockToViewFlow).useClass(AddBlockToViewFlow);
  return { container, service: container.resolve(ViewsService) };
}

function mount(container: Container) {
  return render(BlocksList, {
    props: { viewId },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

describe("BlocksList", () => {
  it("shows the empty state when the view has no blocks", async () => {
    const { container } = await setup([]);
    mount(container);
    expect(screen.getByText(m.view_edit_blocks_empty())).toBeTruthy();
  });

  it("renders the definition label for known block keys", async () => {
    const { container } = await setup([{ id: "a", key: "divider", config: {} }]);
    mount(container);
    expect(screen.getByText("Divider block")).toBeTruthy();
  });

  it("renders an unknown-key fallback label", async () => {
    const { container } = await setup([{ id: "a", key: "month-calendar", config: {} }]);
    mount(container);
    expect(screen.getByText(m.view_block_unknown_label({ key: "month-calendar" }))).toBeTruthy();
  });

  it("removes a block when the remove button is clicked", async () => {
    const { container, service } = await setup([{ id: "a", key: "divider", config: {} }]);
    mount(container);
    await userEvent.click(screen.getByLabelText(m.view_block_remove()));
    const { ViewsRepository: Repo } = await import("../repository");
    const repo = container.resolve(Repo);
    expect(repo.get(viewId).getOr(undefined as never)?.blocks).toEqual([]);
    void service; // keep ref to avoid unused warning if assertion is later removed
  });

  it("disables Move up on the first row", async () => {
    const { container } = await setup([
      { id: "a", key: "divider", config: {} },
      { id: "b", key: "divider", config: {} },
    ]);
    mount(container);
    const upButtons = screen.getAllByLabelText(m.view_block_move_up());
    expect(upButtons[0]).toHaveProperty("disabled", true);
    expect(upButtons[1]).toHaveProperty("disabled", false);
  });

  it("disables Move down on the last row", async () => {
    const { container } = await setup([
      { id: "a", key: "divider", config: {} },
      { id: "b", key: "divider", config: {} },
    ]);
    mount(container);
    const downButtons = screen.getAllByLabelText(m.view_block_move_down());
    expect(downButtons[0]).toHaveProperty("disabled", false);
    expect(downButtons[1]).toHaveProperty("disabled", true);
  });

  it("invokes AddBlockToViewFlow when Add block is clicked", async () => {
    const { container } = await setup([]);
    mount(container);
    const flows = container.resolve(Flows);
    const spy = vi.spyOn(flows, "invoke").mockReturnValue({ tap: () => undefined } as never);
    await userEvent.click(screen.getByText(m.view_edit_blocks_add()));
    expect(spy).toHaveBeenCalledWith(AddBlockToViewFlow, { viewId });
  });
});
```

> The test imports `vi` from `vitest`. Add `import { afterEach, describe, expect, it, vi } from "vitest";` (replace the existing import).

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/views/ui/BlocksList.test.ts`
Expected: FAIL — file not found.

- [ ] **Step 3: Write the implementation**

`src/views/ui/BlocksList.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import UiButton from "@/ui/UiButton.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import type { BlockInstanceId, ViewId } from "../config";
import { AddBlockToViewFlow } from "../flows/add-block-to-view.flow";
import { ViewsService } from "../service";
import { ViewsViewModel } from "../view-model";

const props = defineProps<{ viewId: ViewId }>();

const flows = useService(Flows);
const viewsService = useService(ViewsService);
const viewsVM = useService(ViewsViewModel);

const blocks = computed(
  () =>
    viewsVM
      .getView(props.viewId)
      .map((v) => v.blocks)
      .getOr(undefined as never) ?? [],
);

function definitionFor(key: string) {
  return viewsService.getBlockDefinition(key).getOr(undefined);
}

function moveUp(id: BlockInstanceId): void {
  void viewsService.moveBlockUp(props.viewId, id);
}
function moveDown(id: BlockInstanceId): void {
  void viewsService.moveBlockDown(props.viewId, id);
}
function remove(id: BlockInstanceId): void {
  void viewsService.removeBlock(props.viewId, id);
}
function add(): void {
  void flows.invoke(AddBlockToViewFlow, { viewId: props.viewId });
}
</script>

<template>
  <UiSettingRow v-if="blocks.length === 0">
    <template #description>{{ m.view_edit_blocks_empty() }}</template>
  </UiSettingRow>
  <UiSettingRow v-for="(block, index) of blocks" :key="block.id">
    <template #name>
      <template v-if="definitionFor(block.key)">
        <UiIcon v-if="definitionFor(block.key)!.icon" :icon="definitionFor(block.key)!.icon!" />
        {{ definitionFor(block.key)!.label }}
      </template>
      <template v-else>{{ m.view_block_unknown_label({ key: block.key }) }}</template>
    </template>
    <UiIconButton
      icon="chevron-up"
      :tooltip="m.view_block_move_up()"
      :disabled="index === 0"
      @click="moveUp(block.id)"
    />
    <UiIconButton
      icon="chevron-down"
      :tooltip="m.view_block_move_down()"
      :disabled="index === blocks.length - 1"
      @click="moveDown(block.id)"
    />
    <UiIconButton icon="trash-2" :tooltip="m.view_block_remove()" @click="remove(block.id)" />
  </UiSettingRow>

  <UiSettingRow controls-only>
    <UiButton cta @click="add">{{ m.view_edit_blocks_add() }}</UiButton>
  </UiSettingRow>
</template>
```

> **Verify `UiIconButton`** exposes the icon-as-label via the `tooltip` prop (used here for `getByLabelText` queries). Confirm by reading `src/ui/UiIconButton.vue`. If it uses a different attribute (`title`, `aria-label`), adjust the component to apply `aria-label` from `tooltip`, or change the test queries to match (`getByTitle` / by role + name) — pick whichever does not require new test-only attributes per `[[feedback_testing_library_for_components]]`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/views/ui/BlocksList.test.ts`
Expected: PASS, seven tests.

- [ ] **Step 5: Commit**

```bash
git add src/views/ui/BlocksList.vue src/views/ui/BlocksList.test.ts
git commit -m "feat(views): BlocksList"
```

---

### Task 12: ViewEditSubpage.vue

Replace the stub from Task 10 with the real subpage: view-level fields + `BlocksList`. Mirrors `ShelfEditSubpage.vue` shape.

**Files:**

- Modify: `src/views/ui/ViewEditSubpage.vue`
- Test: `src/views/ui/ViewEditSubpage.test.ts`

- [ ] **Step 1: Write the failing test**

`src/views/ui/ViewEditSubpage.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { type Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { ShelvesRepository, ShelvesEventsToken, ShelvesViewModel, shelvesCollection } from "@/shelves";
import { createSettingsService } from "@/settings/testing";

import type { ViewId } from "../config";
import { viewsCollection } from "../config";
import { ViewsRepository } from "../repository";
import { ViewsService } from "../service";
import { ViewBlockDefinitionToken, ViewsEventsToken } from "../tokens";
import { ViewsViewModel } from "../view-model";

import ViewEditSubpage from "./ViewEditSubpage.vue";

afterEach(() => cleanup());

const viewId = "11111111-1111-1111-1111-111111111111" as ViewId;

async function setup() {
  const raw = {
    version: 3,
    views: {
      [viewId]: {
        id: viewId,
        name: "Weekly",
        icon: "calendar-days",
        defaultShelf: null,
        showInRibbon: false,
        blocks: [],
      },
    },
    shelves: { Personal: { name: "Personal", journals: [] } },
  };
  const { service: settings, container } = createSettingsService({
    collections: [viewsCollection, shelvesCollection],
    raw,
  });
  await settings.initialize();
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container.register(ViewsEventsToken).useFactory(() => createNanoEvents());
  container.register(ShelvesEventsToken).useFactory(() => createNanoEvents());
  container.register(ViewBlockDefinitionToken).useFactory(() => []);
  container.register(ViewsRepository).useClass(ViewsRepository);
  container.register(ShelvesRepository).useClass(ShelvesRepository);
  container.register(ViewsService).useClass(ViewsService);
  container.register(ViewsViewModel).useClass(ViewsViewModel);
  container.register(ShelvesViewModel).useClass(ShelvesViewModel);
  container.register(Flows).useClass(Flows);
  return { container };
}

function mount(container: Container, nav = { back: vi.fn(), push: vi.fn() }) {
  return {
    ...render(ViewEditSubpage, {
      props: { viewId, nav },
      global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
    }),
    nav,
  };
}

describe("ViewEditSubpage", () => {
  it("calls nav.back when the view disappears", async () => {
    const { container } = await setup();
    const { nav } = mount(container);
    const repo = container.resolve(ViewsRepository);
    await repo.delete(viewId);
    await Promise.resolve();
    expect(nav.back).toHaveBeenCalled();
  });

  it("updates the view icon when changed", async () => {
    const { container } = await setup();
    mount(container);
    const repo = container.resolve(ViewsRepository);
    const iconInput = screen.getByDisplayValue("calendar-days") as HTMLInputElement;
    await userEvent.clear(iconInput);
    await userEvent.type(iconInput, "book-open");
    await userEvent.tab();
    expect(repo.get(viewId).getOr(undefined as never)?.icon).toBe("book-open");
  });

  it("updates the default shelf when changed", async () => {
    const { container } = await setup();
    mount(container);
    const repo = container.resolve(ViewsRepository);
    const shelfDropdown = screen.getByLabelText(m.view_edit_default_shelf_label()) as HTMLSelectElement;
    await userEvent.selectOptions(shelfDropdown, "Personal");
    expect(repo.get(viewId).getOr(undefined as never)?.defaultShelf).toBe("Personal");
  });

  it("toggles showInRibbon", async () => {
    const { container } = await setup();
    mount(container);
    const repo = container.resolve(ViewsRepository);
    await userEvent.click(screen.getByLabelText(m.view_edit_show_in_ribbon_label()));
    expect(repo.get(viewId).getOr(undefined as never)?.showInRibbon).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/views/ui/ViewEditSubpage.test.ts`
Expected: FAIL — the stub renders nothing.

- [ ] **Step 3: Replace `src/views/ui/ViewEditSubpage.vue`**

```vue
<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import type { SubpageNav } from "@/settings";
import { ShelvesViewModel } from "@/shelves";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiIconSuggest from "@/ui/UiIconSuggest.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import type { ViewId } from "../config";
import { EditViewNameFlow } from "../flows/edit-view-name.flow";
import { ViewsService } from "../service";
import { ViewsViewModel } from "../view-model";

import BlocksList from "./BlocksList.vue";

const { viewId, nav } = defineProps<{ viewId: ViewId; nav: SubpageNav }>();

const flows = useService(Flows);
const viewsService = useService(ViewsService);
const viewsVM = useService(ViewsViewModel);
const shelvesVM = useService(ShelvesViewModel);

const view = computed(() => viewsVM.getView(viewId).getOr(undefined as never));

watchEffect(() => {
  if (!view.value) nav.back();
});

const iconValue = computed<string>({
  get: () => view.value?.icon ?? "",
  set: (next) => {
    void viewsService.update(viewId, { icon: next });
  },
});

const shelfValue = computed<string>({
  get: () => view.value?.defaultShelf ?? "",
  set: (next) => {
    void viewsService.update(viewId, { defaultShelf: next === "" ? null : next });
  },
});

const ribbonValue = computed<boolean>({
  get: () => view.value?.showInRibbon ?? false,
  set: (next) => {
    void viewsService.update(viewId, { showInRibbon: next });
  },
});

const blocksOpen = ref(true);

function rename(): void {
  void flows.invoke(EditViewNameFlow, { viewId });
}
</script>

<template>
  <div v-if="view">
    <UiSettingRow heading>
      <template #name>{{ m.view_edit_header_title({ name: view.name }) }}</template>
      <UiIconButton icon="pencil" :tooltip="m.view_edit_rename_tooltip()" @click="rename" />
      <UiIconButton icon="chevron-left" :tooltip="m.journal_edit_back_tooltip()" @click="nav.back()" />
    </UiSettingRow>

    <UiSettingRow :name="m.view_edit_icon_label()">
      <UiIconSuggest v-model="iconValue" />
    </UiSettingRow>

    <UiSettingRow :name="m.view_edit_default_shelf_label()">
      <UiDropdown v-model="shelfValue">
        <option value="">{{ m.view_edit_default_shelf_all() }}</option>
        <option v-for="opt of shelvesVM.shelfOptions.value" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow :name="m.view_edit_show_in_ribbon_label()">
      <UiToggle v-model="ribbonValue" />
    </UiSettingRow>

    <UiCollapsibleBlock v-model:expanded="blocksOpen">
      <template #trigger>
        <UiIconedRow icon="layout-dashboard">
          {{ m.view_edit_blocks_title() }}
          <span class="flair">{{ view.blocks.length }}</span>
        </UiIconedRow>
      </template>
      <BlocksList :view-id="viewId" />
    </UiCollapsibleBlock>
  </div>
</template>
```

> **Label/value matching:** `UiDropdown`, `UiToggle`, and `UiIconSuggest` may expose the bound input via different mechanisms — verify by reading each SFC. If `getByLabelText(...)` doesn't resolve in the test, the SFC isn't producing a `<label for>` / `aria-labelledby` link with `UiSettingRow` and the test query should be adjusted (e.g. find the row by name then `within(row).getByRole(...)`) rather than adding test-only attributes.

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/views/ui/ViewEditSubpage.test.ts`
Expected: PASS, four tests.

- [ ] **Step 5: Commit**

```bash
git add src/views/ui/ViewEditSubpage.vue src/views/ui/ViewEditSubpage.test.ts
git commit -m "feat(views): ViewEditSubpage"
```

---

### Task 13: ViewsDashboardBlock.vue

Top-level dashboard block. Lists views, "+" for new, per-row open/clone/delete.

**Files:**

- Create: `src/views/ui/ViewsDashboardBlock.vue`
- Test: `src/views/ui/ViewsDashboardBlock.test.ts`

- [ ] **Step 1: Write the failing test**

`src/views/ui/ViewsDashboardBlock.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { type Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { SettingsUiService, SubpageToken } from "@/settings";
import { createSettingsService } from "@/settings/testing";

import type { ViewId } from "../config";
import { viewsCollection } from "../config";
import { DeleteViewFlow } from "../flows/delete-view.flow";
import { EditViewNameFlow } from "../flows/edit-view-name.flow";
import { ViewsRepository } from "../repository";
import { ViewsService } from "../service";
import { ViewBlockDefinitionToken, ViewsEventsToken } from "../tokens";
import { ViewsViewModel } from "../view-model";

import { viewEditSubpage } from "./view-edit-subpage";
import ViewsDashboardBlock from "./ViewsDashboardBlock.vue";

afterEach(() => cleanup());

async function setup(views: Record<string, unknown> = {}) {
  const { service: settings, container } = createSettingsService({
    collections: [viewsCollection],
    raw: { version: 3, views },
  });
  await settings.initialize();
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container.register(ViewsEventsToken).useFactory(() => createNanoEvents());
  container.register(ViewBlockDefinitionToken).useFactory(() => []);
  container.register(ViewsRepository).useClass(ViewsRepository);
  container.register(ViewsService).useClass(ViewsService);
  container.register(ViewsViewModel).useClass(ViewsViewModel);
  container.register(SubpageToken).useValue(viewEditSubpage);
  container.register(SettingsUiService).useClass(SettingsUiService);
  container.register(Flows).useClass(Flows);
  return { container };
}

function mount(container: Container) {
  return render(ViewsDashboardBlock, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

const viewA = (id: string, name: string) => ({
  id,
  name,
  icon: "calendar-days",
  defaultShelf: null,
  showInRibbon: false,
  blocks: [],
});

describe("ViewsDashboardBlock", () => {
  it("shows the empty state when no views exist", async () => {
    const { container } = await setup();
    mount(container);
    expect(screen.getByText(m.view_dashboard_empty())).toBeTruthy();
  });

  it("lists each view sorted by name", async () => {
    const id1 = "11111111-1111-1111-1111-111111111111";
    const id2 = "22222222-2222-2222-2222-222222222222";
    const { container } = await setup({ [id1]: viewA(id1, "Zeta"), [id2]: viewA(id2, "Alpha") });
    mount(container);
    const names = screen.getAllByText(/Alpha|Zeta/).map((n) => n.textContent);
    expect(names).toEqual(["Alpha", "Zeta"]);
  });

  it("invokes EditViewNameFlow when add is clicked", async () => {
    const { container } = await setup();
    mount(container);
    const flows = container.resolve(Flows);
    const spy = vi.spyOn(flows, "invoke").mockReturnValue({ tap: () => undefined } as never);
    await userEvent.click(screen.getByLabelText(m.view_dashboard_add()));
    expect(spy).toHaveBeenCalledWith(EditViewNameFlow, {});
  });

  it("pushes the edit subpage when open is clicked", async () => {
    const id = "11111111-1111-1111-1111-111111111111";
    const { container } = await setup({ [id]: viewA(id, "Weekly") });
    mount(container);
    const ui = container.resolve(SettingsUiService);
    await userEvent.click(screen.getByLabelText(m.view_dashboard_open({ name: "Weekly" })));
    expect(ui.current.value?.subpage.key).toBe("view-edit");
    expect(ui.current.value?.props).toEqual({ viewId: id });
  });

  it("clones the view when clone is clicked", async () => {
    const id = "11111111-1111-1111-1111-111111111111";
    const { container } = await setup({ [id]: viewA(id, "Weekly") });
    mount(container);
    const repo = container.resolve(ViewsRepository);
    await userEvent.click(screen.getByLabelText(m.view_dashboard_clone({ name: "Weekly" })));
    expect(
      repo
        .find()
        .list()
        .map((v) => v.name),
    ).toContain("Weekly (copy)");
  });

  it("invokes DeleteViewFlow when delete is clicked", async () => {
    const id = "11111111-1111-1111-1111-111111111111";
    const { container } = await setup({ [id]: viewA(id, "Weekly") });
    mount(container);
    const flows = container.resolve(Flows);
    const spy = vi.spyOn(flows, "invoke").mockReturnValue({ tap: () => undefined } as never);
    await userEvent.click(screen.getByLabelText(m.view_dashboard_delete({ name: "Weekly" })));
    expect(spy).toHaveBeenCalledWith(DeleteViewFlow, { viewId: id });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/views/ui/ViewsDashboardBlock.test.ts`
Expected: FAIL — file not found.

- [ ] **Step 3: Write the implementation**

`src/views/ui/ViewsDashboardBlock.vue`:

```vue
<script setup lang="ts">
import { ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { SettingsUiService } from "@/settings";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import type { ViewId } from "../config";
import { DeleteViewFlow } from "../flows/delete-view.flow";
import { EditViewNameFlow } from "../flows/edit-view-name.flow";
import { ViewsService } from "../service";
import { ViewsViewModel } from "../view-model";

import { viewEditSubpage } from "./view-edit-subpage";

const ui = useService(SettingsUiService);
const flows = useService(Flows);
const viewsService = useService(ViewsService);
const viewsVM = useService(ViewsViewModel);

const expanded = ref(true);

function add(): void {
  void flows.invoke(EditViewNameFlow, {}).tap(({ viewId }) => {
    ui.push(viewEditSubpage, { viewId });
  });
}
function open(viewId: ViewId): void {
  ui.push(viewEditSubpage, { viewId });
}
function clone(viewId: ViewId): void {
  void viewsService.clone(viewId);
}
function remove(viewId: ViewId): void {
  void flows.invoke(DeleteViewFlow, { viewId });
}
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded">
    <template #trigger>
      <UiIconedRow icon="layout-dashboard">
        {{ m.view_dashboard_section_title() }}
        <span class="flair">{{ viewsVM.viewCount.value }}</span>
      </UiIconedRow>
    </template>
    <template #controls>
      <UiIconButton icon="plus" cta :tooltip="m.view_dashboard_add()" @click="add" />
    </template>
    <UiSettingRow v-if="viewsVM.views.value.length === 0">
      <template #description>{{ m.view_dashboard_empty() }}</template>
    </UiSettingRow>
    <template v-else>
      <UiSettingRow v-for="view of viewsVM.views.value" :key="view.id">
        <template #name>{{ view.name }}</template>
        <UiIconButton
          icon="external-link"
          :tooltip="m.view_dashboard_open({ name: view.name })"
          @click="open(view.id)"
        />
        <UiIconButton icon="copy" :tooltip="m.view_dashboard_clone({ name: view.name })" @click="clone(view.id)" />
        <UiIconButton icon="trash-2" :tooltip="m.view_dashboard_delete({ name: view.name })" @click="remove(view.id)" />
      </UiSettingRow>
    </template>
  </UiCollapsibleBlock>
</template>
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/views/ui/ViewsDashboardBlock.test.ts`
Expected: PASS, six tests.

- [ ] **Step 5: Commit**

```bash
git add src/views/ui/ViewsDashboardBlock.vue src/views/ui/ViewsDashboardBlock.test.ts
git commit -m "feat(views): ViewsDashboardBlock"
```

---

### Task 14: Wire module + barrel exports

Register the new view-model, flows, dashboard block, and subpage in the views module. Export `ViewsViewModel` and `viewEditSubpage` from the barrel.

**Files:**

- Modify: `src/views/module.ts`
- Modify: `src/views/index.ts`

- [ ] **Step 1: Edit `src/views/module.ts`**

Replace its contents with:

```ts
import { createNanoEvents } from "nanoevents";

import type { Module } from "@/infrastructure/di";
import { CollectionDefinitionToken, DashboardBlockToken, SubpageToken, defineDashboardBlock } from "@/settings";

import { viewsCollection } from "./config";
import { AddBlockToViewFlow } from "./flows/add-block-to-view.flow";
import { DeleteViewFlow } from "./flows/delete-view.flow";
import { EditViewNameFlow } from "./flows/edit-view-name.flow";
import { ViewsRepository } from "./repository";
import { ViewsService } from "./service";
import { ViewsEventsToken, type ViewsEvents } from "./tokens";
import { ViewHostService } from "./view-host";
import { ViewsViewModel } from "./view-model";
import { viewEditSubpage } from "./ui/view-edit-subpage";
import ViewsDashboardBlock from "./ui/ViewsDashboardBlock.vue";

export const viewsModule: Module = {
  register(c) {
    c.register(CollectionDefinitionToken).useValue(viewsCollection);
    c.register(ViewsEventsToken).useFactory(() => createNanoEvents<ViewsEvents>());
    c.register(ViewsRepository).useClass(ViewsRepository).eager();
    c.register(ViewsViewModel).useClass(ViewsViewModel).eager();
    c.register(ViewsService).useClass(ViewsService).eager();
    c.register(ViewHostService).useClass(ViewHostService).eager();
    c.register(EditViewNameFlow).useClass(EditViewNameFlow);
    c.register(DeleteViewFlow).useClass(DeleteViewFlow);
    c.register(AddBlockToViewFlow).useClass(AddBlockToViewFlow);
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "views", component: ViewsDashboardBlock, order: 6 }),
    );
    c.register(SubpageToken).useValue(viewEditSubpage);
  },
};
```

- [ ] **Step 2: Edit `src/views/index.ts`**

Add two exports (alphabetical-ish placement):

```ts
export { ViewsViewModel } from "./view-model";
export { viewEditSubpage } from "./ui/view-edit-subpage";
```

- [ ] **Step 3: Verify quality gates**

Run in parallel:

```bash
npm run check:types
npm run check:lint
npm test
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/views/module.ts src/views/index.ts
git commit -m "feat(views): wire settings UI into module + barrel"
```

---

### Task 15: Final verification

Make sure the whole slice plays together.

- [ ] **Step 1: Run the full quality gates**

```bash
npm test
npm run check:types
npm run check:lint
```

Expected: all green.

- [ ] **Step 2: Confirm no orphan stubs remain**

```bash
grep -R "<template><div /></template>" src/views/ui
```

Expected: no matches (the Task 4/10 stubs should all have been replaced by Tasks 6, 8, 12).

- [ ] **Step 3: Sanity check the barrel**

```bash
grep -E "ViewsViewModel|viewEditSubpage" src/views/index.ts
```

Expected: both names appear.

- [ ] **Step 4: Done — no extra commit unless something needed fixing.**

---

## Self-review (already applied)

- Spec coverage: every in-scope item in the design (view-model, three flows, three modals, dashboard block, edit subpage, blocks list, module wiring, index exports, i18n) is owned by a task above.
- Type consistency: `ViewId`, `BlockInstanceId`, and `ViewBlockDefinition` names match across tasks; `viewsService.moveBlockUp/Down`, `addBlock`, `removeBlock`, `update`, `delete`, `clone`, `create` are the exact names on `ViewsService`.
- Placeholder scan: no TBD/TODO; every code block compiles to a complete unit.
- Open `UiIconButton.tooltip` ↔ `getByLabelText` assumption (Tasks 11, 12, 13) is called out inline. If `UiIconButton` doesn't map `tooltip` to `aria-label`, the fix is to adjust the test queries (use role + name, or `getByTitle`) rather than introducing test-only attributes per `[[feedback_testing_library_for_components]]`.
