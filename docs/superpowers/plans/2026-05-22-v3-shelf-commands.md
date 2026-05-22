# v3 Shelf Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `kind: "shelf"` command target so dynamic commands can act on every journal of a chosen write type on a named shelf, surfaced through the command management UI.

**Architecture:** The v3 `commands` feature keeps all dynamic commands in one collection, each with a `target` union (`all` | `journal`). This plan adds a third `shelf` variant resolved by `DynamicCommandRegistry`, reconciled when shelves are renamed/deleted via new shelf lifecycle events, and edited through a new `ShelfCommandsSection` mounted on the shelf-detail subpage via a new `ShelfEditSectionToken`.

**Tech Stack:** TypeScript, Vue 3 SFCs, valibot schemas, ts-pattern, nanoevents, vitest + @testing-library/vue, paraglide i18n.

---

## File Structure

- `src/shelves/lifecycle.ts` — gains a typed event emitter (`shelfRenamed`, `shelfDeleted`).
- `src/shelves/ui/shelf-edit-section.ts` — **new** — `ShelfEditSectionToken` multi-token + `defineShelfEditSection`.
- `src/shelves/ui/ShelfEditSubpage.vue` — renders registered shelf-edit sections.
- `src/shelves/index.ts` — exports the new token.
- `src/commands/config.ts` — adds the `shelf` target variant.
- `src/commands/command-registry.ts` — resolves and reconciles shelf-targeted commands.
- `src/commands/ui/ShelfCommandsSection.vue` — **new** — shelf-detail commands block.
- `src/commands/module.ts` — registers `ShelfCommandsSection` into `ShelfEditSectionToken`.
- `messages/en.json` — three new `command_shelf_*` messages.

Test files are colocated as `*.test.ts` next to each implementation file.

---

## Task 1: Shelf lifecycle events

**Files:**

- Modify: `src/shelves/lifecycle.ts`
- Test: `src/shelves/lifecycle.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/shelves/lifecycle.test.ts`, after the existing `describe` blocks:

```ts
describe("ShelvesLifecycleService events", () => {
  it("emits shelfRenamed when a shelf is renamed", async () => {
    const { shelves } = await buildInitialized({ version: 3, shelves: { work: { name: "work", journals: [] } } });
    const events: { oldName: string; newName: string }[] = [];
    shelves.events.on("shelfRenamed", (payload) => events.push(payload));
    shelves.rename("work", "office");
    expect(events).toEqual([{ oldName: "work", newName: "office" }]);
  });

  it("emits shelfDeleted when a shelf is deleted", async () => {
    const { shelves } = await buildInitialized({ version: 3, shelves: { work: { name: "work", journals: [] } } });
    const events: { shelfName: string }[] = [];
    shelves.events.on("shelfDeleted", (payload) => events.push(payload));
    shelves.delete("work");
    expect(events).toEqual([{ shelfName: "work" }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/shelves/lifecycle.test.ts`
Expected: FAIL — `shelves.events` is `undefined`.

- [ ] **Step 3: Add the emitter to `ShelvesLifecycleService`**

In `src/shelves/lifecycle.ts`, add these imports at the top of the import block:

```ts
import { createNanoEvents } from "nanoevents";
```

and alongside the other `@/infrastructure` imports:

```ts
import type { Subscribable, TypedEmitter } from "@/infrastructure/events";
```

Add this interface above the `ShelvesLifecycleService` class declaration:

```ts
export interface ShelvesLifecycleEvents {
  shelfRenamed: (payload: { oldName: string; newName: string }) => void;
  shelfDeleted: (payload: { shelfName: string }) => void;
}
```

Add these two fields as the first members of the class, before `#settings`:

```ts
  readonly #emitter: TypedEmitter<ShelvesLifecycleEvents> = createNanoEvents();
  readonly events: Subscribable<ShelvesLifecycleEvents> = this.#emitter;
```

In `rename()`, immediately after `collection.remove(oldName);`, add:

```ts
this.#emitter.emit("shelfRenamed", { oldName, newName });
```

In `delete()`, immediately after `collection.remove(name);`, add:

```ts
this.#emitter.emit("shelfDeleted", { shelfName: name });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/shelves/lifecycle.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Run the quality gates**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/shelves/lifecycle.ts src/shelves/lifecycle.test.ts
git commit -m "feat(shelves): emit shelf rename and delete lifecycle events"
```

---

## Task 2: Shelf command target and candidate resolution

**Files:**

- Modify: `src/commands/config.ts`
- Modify: `src/commands/command-registry.ts`
- Test: `src/commands/command-registry.test.ts`

- [ ] **Step 1: Add the shelf target variant to the config schema**

In `src/commands/config.ts`, add a third object to the `commandTargetSchema` union, after the `journal` object:

```ts
  v.object({
    kind: v.literal("shelf"),
    shelfName: v.pipe(v.string(), v.minLength(1)),
    writeType: v.picklist(["day", "week", "month", "quarter", "year"]),
  }),
```

The final union literal becomes:

```ts
const commandTargetSchema = v.union([
  v.object({
    kind: v.literal("all"),
    writeType: v.picklist(["day", "week", "month", "quarter", "year"]),
  }),
  v.object({
    kind: v.literal("journal"),
    journalName: v.pipe(v.string(), v.minLength(1)),
  }),
  v.object({
    kind: v.literal("shelf"),
    shelfName: v.pipe(v.string(), v.minLength(1)),
    writeType: v.picklist(["day", "week", "month", "quarter", "year"]),
  }),
]);
```

- [ ] **Step 2: Update the registry test harness with the shelves collection**

In `src/commands/command-registry.test.ts`, add this import alongside the existing ones:

```ts
import { shelvesCollection } from "@/shelves";
```

In the `build()` function, change the `collections` array to include `shelvesCollection`:

```ts
const { service: settings, container } = createSettingsService({
  collections: [journalConfigCollection, commandCollection, shelvesCollection],
});
```

Add `shelves` to the object returned by `build()`:

```ts
return {
  host,
  workspace,
  settings,
  lifecycle,
  index,
  flows,
  commands: settings.getCollection(commandCollection),
  shelves: settings.getCollection(shelvesCollection),
};
```

- [ ] **Step 3: Write the failing test**

Add to `src/commands/command-registry.test.ts`:

```ts
describe("DynamicCommandRegistry shelf targets", () => {
  it("registers a shelf-targeted command when the shelf has a matching journal", async () => {
    const { host, settings, commands, shelves } = await build();
    settings.getCollection(journalConfigCollection).add("daily", makeJournal("daily", "day"));
    shelves.add("work", { name: "work", journals: ["daily"] });
    commands.add(
      "cmd-1",
      makeCommand({ name: "Open work daily", target: { kind: "shelf", shelfName: "work", writeType: "day" } }),
    );
    expect(host.commands.get("cmd-1")?.name).toBe("Open work daily");
  });

  it("hides a shelf-targeted command when the shelf has no journal of the write type", async () => {
    const { host, settings, commands, shelves } = await build();
    settings.getCollection(journalConfigCollection).add("daily", makeJournal("daily", "day"));
    shelves.add("work", { name: "work", journals: ["daily"] });
    commands.add(
      "cmd-1",
      makeCommand({ name: "Open work weekly", target: { kind: "shelf", shelfName: "work", writeType: "week" } }),
    );
    expect(host.commands.get("cmd-1")?.check?.()).toBe(false);
  });
});
```

This test needs a `makeJournal` helper. If `command-registry.test.ts` does not already define one, add it next to `makeCommand`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -- src/commands/command-registry.test.ts`
Expected: FAIL — shelf candidates are empty, so the shelf-targeted command is not registered.

- [ ] **Step 5: Resolve shelf candidates in the registry**

In `src/commands/command-registry.ts`, add this import alongside the other `@/` imports:

```ts
import { shelvesCollection } from "@/shelves";
```

In `#candidates`, add a `shelf` branch to the `match(command.target)` expression, before `.exhaustive()`:

```ts
      .with({ kind: "shelf" }, (target) => {
        const shelf = this.#settings.getCollection(shelvesCollection).get(target.shelfName);
        if (shelf === undefined) return [];
        return shelf.journals.filter((name) => journals.get(name)?.write.type === target.writeType);
      })
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- src/commands/command-registry.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the quality gates**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/commands/config.ts src/commands/command-registry.ts src/commands/command-registry.test.ts
git commit -m "feat(commands): resolve shelf-targeted command candidates"
```

---

## Task 3: Reconcile shelf-targeted commands on rename and delete

**Files:**

- Modify: `src/commands/command-registry.ts`
- Test: `src/commands/command-registry.test.ts`

- [ ] **Step 1: Register the shelf lifecycle service in the test harness**

In `src/commands/command-registry.test.ts`, add `ShelvesLifecycleService` to the existing `@/shelves` import:

```ts
import { ShelvesLifecycleService, shelvesCollection } from "@/shelves";
```

In the `build()` function, register the shelf lifecycle service just before the `DynamicCommandRegistry` registration:

```ts
container.register(ShelvesLifecycleService).useClass(ShelvesLifecycleService);
```

- [ ] **Step 2: Write the failing tests**

Add to the `describe("DynamicCommandRegistry shelf targets", ...)` block in `src/commands/command-registry.test.ts`:

```ts
it("repoints a shelf-targeted command when its shelf is renamed", async () => {
  const { container, commands, shelves } = await build();
  shelves.add("work", { name: "work", journals: [] });
  commands.add("cmd-1", makeCommand({ target: { kind: "shelf", shelfName: "work", writeType: "day" } }));
  container.resolve(ShelvesLifecycleService).rename("work", "office");
  const target = commands.get("cmd-1")?.target;
  expect(target).toEqual({ kind: "shelf", shelfName: "office", writeType: "day" });
});

it("removes a shelf-targeted command when its shelf is deleted", async () => {
  const { container, commands, shelves } = await build();
  shelves.add("work", { name: "work", journals: [] });
  commands.add("cmd-1", makeCommand({ target: { kind: "shelf", shelfName: "work", writeType: "day" } }));
  container.resolve(ShelvesLifecycleService).delete("work");
  expect(commands.get("cmd-1")).toBeUndefined();
});
```

The `build()` return object already exposes `container` (used elsewhere in the file); if it does not, add `container` to the returned object.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- src/commands/command-registry.test.ts`
Expected: FAIL — `DynamicCommandRegistry` cannot resolve `ShelvesLifecycleService` (the injected field does not exist yet).

- [ ] **Step 4: Subscribe to shelf lifecycle events**

In `src/commands/command-registry.ts`, add `ShelvesLifecycleService` to the existing `@/shelves` import:

```ts
import { ShelvesLifecycleService, shelvesCollection } from "@/shelves";
```

Add an injected field to the `DynamicCommandRegistry` class, after `#lifecycle`:

```ts
  readonly #shelfLifecycle = inject(ShelvesLifecycleService);
```

In `initialize()`, add these two lines after the existing journal-event subscriptions:

```ts
this.#shelfLifecycle.events.on("shelfRenamed", ({ oldName, newName }) => this.#onShelfRenamed(oldName, newName));
this.#shelfLifecycle.events.on("shelfDeleted", ({ shelfName }) => this.#onShelfDeleted(shelfName));
```

Add these two methods at the end of the `DynamicCommandRegistry` class, after `#onJournalDeleted`:

```ts
  #onShelfRenamed(oldName: string, newName: string): void {
    const collection = this.#settings.getCollection(commandCollection);
    for (const id of Object.keys(collection.entries)) {
      const command = collection.get(id);
      if (command?.target.kind === "shelf" && command.target.shelfName === oldName) {
        command.target.shelfName = newName;
      }
    }
  }

  #onShelfDeleted(shelfName: string): void {
    const collection = this.#settings.getCollection(commandCollection);
    for (const id of Object.keys(collection.entries)) {
      const command = collection.get(id);
      if (command?.target.kind === "shelf" && command.target.shelfName === shelfName) {
        collection.remove(id);
      }
    }
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/commands/command-registry.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the quality gates**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/commands/command-registry.ts src/commands/command-registry.test.ts
git commit -m "feat(commands): reconcile shelf-targeted commands on shelf rename and delete"
```

---

## Task 4: Shelf command messages

**Files:**

- Modify: `messages/en.json`

- [ ] **Step 1: Add the three messages**

In `messages/en.json`, add these keys next to the existing `command_journal_*` keys:

```json
  "command_shelf_add": "Add command",
  "command_shelf_empty": "No commands created for this shelf yet.",
  "command_shelf_section_title": "Commands",
```

- [ ] **Step 2: Compile the i18n messages**

Run: `npm run compile:i18n`
Expected: generates `src/i18n/paraglide/messages/command_shelf_add.js`, `command_shelf_empty.js`, `command_shelf_section_title.js`.

- [ ] **Step 3: Verify the messages resolve**

Run: `npm run check:types`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add messages/en.json src/i18n/paraglide
git commit -m "feat(commands): add shelf command section messages"
```

---

## Task 5: ShelfCommandsSection component

**Files:**

- Create: `src/commands/ui/ShelfCommandsSection.vue`
- Test: `src/commands/ui/ShelfCommandsSection.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/commands/ui/ShelfCommandsSection.test.ts`:

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
import { shelvesCollection } from "@/shelves";

import { commandCollection, type CommandConfig } from "../config";

import { DeleteCommandFlow } from "./delete-command.flow";
import { EditCommandFlow } from "./edit-command.flow";
import ShelfCommandsSection from "./ShelfCommandsSection.vue";

afterEach(() => cleanup());

function makeConfig(name: string, target: CommandConfig["target"]): CommandConfig {
  return { name, icon: "", showInRibbon: false, openMode: "active", target, type: "same", context: "today" };
}

async function setup(commands: Record<string, CommandConfig> = {}) {
  const { service: settings, container } = createSettingsService({
    collections: [commandCollection, shelvesCollection],
    raw: { version: 3, commands, shelves: { work: { name: "work", journals: [] } } },
  });
  await settings.initialize();
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container.register(Flows).useClass(Flows);
  const flows = container.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  return { container, flows };
}

function mount(container: Container) {
  return render(ShelfCommandsSection, {
    props: { shelfName: "work" },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

describe("ShelfCommandsSection", () => {
  it("lists only this shelf's commands", async () => {
    const { container } = await setup({
      "c-1": makeConfig("Mine", { kind: "shelf", shelfName: "work", writeType: "day" }),
      "c-2": makeConfig("Other shelf", { kind: "shelf", shelfName: "home", writeType: "day" }),
      "c-3": makeConfig("Global", { kind: "all", writeType: "day" }),
    });
    mount(container);
    await userEvent.click(screen.getByText(m.command_shelf_section_title()));
    expect(screen.getByText("Mine")).toBeTruthy();
    expect(screen.queryByText("Other shelf")).toBeNull();
    expect(screen.queryByText("Global")).toBeNull();
  });

  it("invokes EditCommandFlow with a shelf target when add is clicked", async () => {
    const { container, flows } = await setup();
    mount(container);
    await userEvent.click(screen.getByLabelText(m.command_shelf_add()));
    expect(flows.invoke).toHaveBeenCalledWith(EditCommandFlow, {
      target: { kind: "shelf", shelfName: "work", writeType: "day" },
    });
  });

  it("invokes EditCommandFlow with the command id when edit is clicked", async () => {
    const { container, flows } = await setup({
      "c-1": makeConfig("Mine", { kind: "shelf", shelfName: "work", writeType: "day" }),
    });
    mount(container);
    await userEvent.click(screen.getByText(m.command_shelf_section_title()));
    await userEvent.click(screen.getByLabelText(`${m.command_list_edit()} Mine`));
    expect(flows.invoke).toHaveBeenCalledWith(EditCommandFlow, {
      commandId: "c-1",
      target: { kind: "shelf", shelfName: "work", writeType: "day" },
    });
  });

  it("invokes DeleteCommandFlow when delete is clicked", async () => {
    const { container, flows } = await setup({
      "c-1": makeConfig("Mine", { kind: "shelf", shelfName: "work", writeType: "day" }),
    });
    mount(container);
    await userEvent.click(screen.getByText(m.command_shelf_section_title()));
    await userEvent.click(screen.getByLabelText(`${m.command_list_delete()} Mine`));
    expect(flows.invoke).toHaveBeenCalledWith(DeleteCommandFlow, { commandId: "c-1" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/commands/ui/ShelfCommandsSection.test.ts`
Expected: FAIL — `ShelfCommandsSection.vue` does not exist.

- [ ] **Step 3: Create the component**

Create `src/commands/ui/ShelfCommandsSection.vue`:

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

const { shelfName } = defineProps<{ shelfName: string }>();

const settings = useService(SettingsService);
const flows = useService(Flows);
const collection = settings.getCollection(commandCollection);

const entries = computed<readonly [string, CommandConfig, JournalWrite["type"]][]>(() =>
  Object.entries(collection.entries)
    .filter(([, command]) => command.target.kind === "shelf" && command.target.shelfName === shelfName)
    .map(([id, command]): [string, CommandConfig, JournalWrite["type"]] => [
      id,
      command,
      command.target.kind === "shelf" ? command.target.writeType : "day",
    ])
    .toSorted((a, b) => a[1].name.localeCompare(b[1].name)),
);

const expanded = ref(false);

function add(): void {
  void flows.invoke(EditCommandFlow, { target: { kind: "shelf", shelfName, writeType: "day" } });
}
function edit(id: string): void {
  void flows.invoke(EditCommandFlow, { commandId: id, target: { kind: "shelf", shelfName, writeType: "day" } });
}
function remove(id: string): void {
  void flows.invoke(DeleteCommandFlow, { commandId: id });
}
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded">
    <template #trigger>
      <UiIconedRow icon="terminal">
        {{ m.command_shelf_section_title() }}
        <span class="flair">{{ entries.length }}</span>
      </UiIconedRow>
    </template>
    <template #controls>
      <UiIconButton icon="plus" cta :tooltip="m.command_shelf_add()" @click="add" />
    </template>
    <CommandList :entries="entries" :empty-text="m.command_shelf_empty()" @edit="edit" @delete="remove" />
  </UiCollapsibleBlock>
</template>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/commands/ui/ShelfCommandsSection.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the quality gates**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/commands/ui/ShelfCommandsSection.vue src/commands/ui/ShelfCommandsSection.test.ts
git commit -m "feat(commands): add the shelf commands section component"
```

---

## Task 6: Mount the shelf commands section on the shelf-detail subpage

**Files:**

- Create: `src/shelves/ui/shelf-edit-section.ts`
- Modify: `src/shelves/index.ts`
- Modify: `src/shelves/ui/ShelfEditSubpage.vue`
- Modify: `src/commands/module.ts`

This task is module/DI wiring; per project convention it carries no dedicated test and is verified by the type-check, lint, and the existing `ShelfEditSubpage` and registration tests.

- [ ] **Step 1: Create the shelf-edit section token**

Create `src/shelves/ui/shelf-edit-section.ts`:

```ts
import { createMultiToken } from "@/infrastructure/di";

import type { Component } from "vue";

export interface ShelfEditSection {
  readonly key: string;
  readonly component: Component;
  readonly order: number;
}

export function defineShelfEditSection(section: ShelfEditSection): ShelfEditSection {
  return section;
}

export const ShelfEditSectionToken = createMultiToken<ShelfEditSection>("shelves.editSection");
```

- [ ] **Step 2: Export the token from the shelves barrel**

In `src/shelves/index.ts`, add:

```ts
export { ShelfEditSectionToken, defineShelfEditSection } from "./ui/shelf-edit-section";
export type { ShelfEditSection } from "./ui/shelf-edit-section";
```

- [ ] **Step 3: Render registered sections in the shelf-detail subpage**

In `src/shelves/ui/ShelfEditSubpage.vue`, add this import next to the other local imports:

```ts
import { ShelfEditSectionToken } from "./shelf-edit-section";
```

After the `const shelves = settings.getCollection(...)` / `const journals = ...` lines in `<script setup>`, add:

```ts
const editSections = useService(ShelfEditSectionToken).toSorted((a, b) => a.order - b.order);
```

In the template, inside the `<div v-if="shelf">`, add the section render immediately after the closing `</UiCollapsibleBlock>` of the journals block (before the closing `</div>`):

```vue
<component :is="section.component" v-for="section in editSections" :key="section.key" :shelf-name="shelfName" />
```

- [ ] **Step 4: Register ShelfCommandsSection into the token**

In `src/commands/module.ts`, add to the imports:

```ts
import { ShelfEditSectionToken, defineShelfEditSection } from "@/shelves";
import ShelfCommandsSection from "./ui/ShelfCommandsSection.vue";
```

Inside `commandsModule.register(c)`, after the `JournalEditSectionToken` registration, add:

```ts
c.register(ShelfEditSectionToken).useValue(
  defineShelfEditSection({ key: "commands", component: ShelfCommandsSection as Component, order: 10 }),
);
```

- [ ] **Step 5: Run the quality gates and affected tests**

Run: `npm run check:types && npm run check:lint && npm test -- src/shelves/ui/ShelfEditSubpage.test.ts src/commands`
Expected: no errors; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/shelves/ui/shelf-edit-section.ts src/shelves/index.ts src/shelves/ui/ShelfEditSubpage.vue src/commands/module.ts
git commit -m "feat(commands): mount the shelf commands section on the shelf subpage"
```

---

## Task 7: Edit-command modal shelf support

**Files:**

- Modify: `src/commands/ui/EditCommandModal.vue`
- Test: `src/commands/ui/EditCommandModal.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the `describe("EditCommandModal", ...)` block in `src/commands/ui/EditCommandModal.test.ts`:

```ts
it("submits a shelf-target command with the entered values", async () => {
  const { submit } = await mountModal({ target: { kind: "shelf", shelfName: "work", writeType: "day" } });
  await userEvent.type(screen.getByRole("textbox"), "Open work");
  await userEvent.click(screen.getByText(m.common_action_submit()));
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith({
      name: "Open work",
      icon: "",
      showInRibbon: false,
      openMode: "active",
      target: { kind: "shelf", shelfName: "work", writeType: "day" },
      type: "same",
      context: "today",
    }),
  );
});

it("submits the write type chosen for a shelf target", async () => {
  const { submit } = await mountModal({ target: { kind: "shelf", shelfName: "work", writeType: "day" } });
  await userEvent.type(screen.getByRole("textbox"), "Open work weekly");
  await userEvent.selectOptions(screen.getAllByRole("combobox")[0], "week");
  await userEvent.click(screen.getByText(m.common_action_submit()));
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ target: { kind: "shelf", shelfName: "work", writeType: "week" } }),
    ),
  );
});
```

The first combobox is the write-type dropdown: it renders for `all` and `shelf` targets and appears before the type dropdown in the template.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/commands/ui/EditCommandModal.test.ts`
Expected: FAIL — the submitted target is not a `shelf` target (the modal currently only emits `all`/`journal`).

- [ ] **Step 3: Handle the shelf target in the modal**

In `src/commands/ui/EditCommandModal.vue`, add this import at the top of the `<script setup>` import block:

```ts
import { match } from "ts-pattern";
```

Change the `writeType` ref initializer so both `all` and `shelf` targets seed from `target.writeType`:

```ts
const writeType = ref<JournalWrite["type"]>(
  props.target.kind === "journal" ? journalWriteType() : props.target.writeType,
);
```

Replace the `submittedTarget` assignment inside `onSubmit` with a `match` over all three variants:

```ts
const submittedTarget: CommandTarget = match(props.target)
  .with({ kind: "journal" }, (target) => ({ kind: "journal" as const, journalName: target.journalName }))
  .with({ kind: "all" }, () => ({
    kind: "all" as const,
    writeType: writeType.value as Exclude<JournalWrite["type"], "custom">,
  }))
  .with({ kind: "shelf" }, (target) => ({
    kind: "shelf" as const,
    shelfName: target.shelfName,
    writeType: writeType.value as Exclude<JournalWrite["type"], "custom">,
  }))
  .exhaustive();
```

In the template, change the write-type dropdown guard from `props.target.kind === 'all'` to render for any non-journal target:

```vue
      <UiDropdown v-if="props.target.kind !== 'journal'" v-model="writeType">
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/commands/ui/EditCommandModal.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Run the quality gates**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/commands/ui/EditCommandModal.vue src/commands/ui/EditCommandModal.test.ts
git commit -m "feat(commands): support shelf targets in the edit-command modal"
```

---

## Task 8: Full verification

- [ ] **Step 1: Run the complete quality gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all tests pass, no type errors, no lint errors.

- [ ] **Step 2: Confirm clean tree**

Run: `git status --short`
Expected: only the pre-existing unrelated `src/calendar/ui/CalendarMonthView.vue` modification remains uncommitted.
