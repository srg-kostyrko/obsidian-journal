# Open on Startup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore v2's "open a chosen journal's note when the vault opens" (gap #4) in the v3 architecture.

**Architecture:** A new `src/journals/startup/` sub-feature owns a settings slice (`startupSlice`), a `StartupOpenService` that opens today's note on a genuine vault launch (gated on `appStartup`), and a `StartupBlock.vue` dashboard block. The service reuses the existing `OpenJournalEntryFlow`. A thin `layoutReady`/`onLayoutReady` capability is added to `WorkspaceService` (and its fake).

**Tech Stack:** TypeScript, valibot (settings schema), the project DI container, nanoevents (journal events), Vue 3 SFC + @testing-library/vue, vitest, paraglide i18n.

**Design reference:** `docs/superpowers/specs/2026-06-01-open-on-startup-design.md`

---

## File Structure

- **Create** `src/journals/startup/slice.ts` — the `startupSlice` definition (`{ journalName: string }`, default `""`).
- **Create** `src/journals/startup/startup-open.ts` — `StartupOpenService`: the gate + open logic + rename/delete reconciliation.
- **Create** `src/journals/startup/startup-open.test.ts` — service behavior tests.
- **Create** `src/journals/startup/ui/StartupBlock.vue` — the dashboard block.
- **Create** `src/journals/startup/ui/StartupBlock.test.ts` — component tests.
- **Create** `src/journals/startup/module.ts` — `startupModule`: registers slice, block, service.
- **Modify** `src/infrastructure/host/internal/workspace-service.ts` — add `layoutReady` getter + `onLayoutReady`.
- **Modify** `src/infrastructure/host/testing.ts` — add the same to `FakeWorkspaceService` + a `setLayoutReady` test control.
- **Modify** `messages/en.json` — four UI strings.
- **Modify** `src/main.ts` — register `startupModule`, call `StartupOpenService.initialize()`.
- **Modify** `docs/2026-06-01-v2-v3-feature-gaps.md` — mark item 4 closed.

---

### Task 1: `startupSlice` settings slice

**Files:**

- Create: `src/journals/startup/slice.ts`

No test: a slice definition is pure config/defaults; per repo conventions slice defaults are not unit-tested.

- [ ] **Step 1: Create the slice**

```ts
import * as v from "valibot";

import { defineSlice } from "@/settings";

export const startupSliceSchema = v.object({ journalName: v.string() });

export type StartupSliceState = v.InferOutput<typeof startupSliceSchema>;

export const startupSlice = defineSlice<"startup", typeof startupSliceSchema>("startup", startupSliceSchema, {
  journalName: "",
});
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run check:types`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/journals/startup/slice.ts
git commit -m "feat(journals): add startup settings slice"
```

---

### Task 2: `layoutReady` / `onLayoutReady` on WorkspaceService

The service needs to (a) read whether the layout was already ready at plugin load, and (b) register a callback that fires when the layout becomes ready (immediately, if already ready). Obsidian's `Workspace` exposes `layoutReady: boolean` and `onLayoutReady(cb)`. We wrap both, and mirror them on the fake.

No direct test for the production wrapper (thin host wiring, skipped per conventions); it is exercised through Task 3's service tests via the fake.

**Files:**

- Modify: `src/infrastructure/host/internal/workspace-service.ts`
- Modify: `src/infrastructure/host/testing.ts:164-202` (FakeWorkspaceService)

- [ ] **Step 1: Add the wrapper to the real WorkspaceService**

In `src/infrastructure/host/internal/workspace-service.ts`, add these two members to the `WorkspaceService` class (e.g. immediately after the `activeNote()` method, around line 34):

```ts
  get layoutReady(): boolean {
    return this.#app.workspace.layoutReady;
  }

  onLayoutReady(callback: () => void): void {
    this.#app.workspace.onLayoutReady(callback);
  }
```

- [ ] **Step 2: Add controllable versions to FakeWorkspaceService**

In `src/infrastructure/host/testing.ts`, extend the `Pick<...>` on `FakeWorkspaceService` (line 164-167) to include the two new names:

```ts
export class FakeWorkspaceService implements Pick<
  WorkspaceService,
  | "activeNote"
  | "isOpen"
  | "openNote"
  | "events"
  | "triggerHoverPreview"
  | "openFileMenu"
  | "layoutReady"
  | "onLayoutReady"
> {
```

Then add these members inside the class (e.g. after the `#active` field and before `activeNote()`):

```ts
  #layoutReady = false;
  #layoutReadyCallbacks: (() => void)[] = [];

  get layoutReady(): boolean {
    return this.#layoutReady;
  }

  onLayoutReady(callback: () => void): void {
    if (this.#layoutReady) {
      callback();
      return;
    }
    this.#layoutReadyCallbacks.push(callback);
  }

  setLayoutReady(value: boolean): void {
    this.#layoutReady = value;
    if (!value) return;
    const pending = this.#layoutReadyCallbacks;
    this.#layoutReadyCallbacks = [];
    for (const callback of pending) callback();
  }
```

- [ ] **Step 3: Verify it type-checks**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/infrastructure/host/internal/workspace-service.ts src/infrastructure/host/testing.ts
git commit -m "feat(host): expose layoutReady and onLayoutReady on WorkspaceService"
```

---

### Task 3: `StartupOpenService`

The core. TDD: write the full test file (a container build helper + six behaviors), watch it fail, then implement.

**Files:**

- Create: `src/journals/startup/startup-open.test.ts`
- Create: `src/journals/startup/startup-open.ts`

**Behavior captured by the tests:**

1. Opens the configured journal's today note when the layout was **not** ready at `initialize()` (genuine launch).
2. Does **not** open when the layout **was** ready at `initialize()` (plugin enabled mid-session).
3. No-op when `journalName` is empty.
4. No-op when the configured journal no longer exists.
5. A journal `renamed` event updates the stored name.
6. A `deleted` event for the configured journal clears the stored name.

- [ ] **Step 1: Write the failing test file**

```ts
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installTestCalendar } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { FlowsModule } from "@/infrastructure/flows";
import { NotesService, TemplaterService, WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNotesService, FakeTemplaterService, FakeWorkspaceService } from "@/infrastructure/host/testing";
import { LoggerModule } from "@/infrastructure/logger";
import { PluginData } from "@/infrastructure/host";
import { FakePluginData } from "@/infrastructure/host/testing";
import { SettingsService, SliceDefinitionToken } from "@/settings";
import { TemplateEngine } from "@/templates";

import type { JournalConfig } from "../config";
import { CycleService } from "../cycle";
import { OpenJournalEntryFlow } from "../flows/open-journal-entry.flow";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { NoteCreationService } from "../notes/note-creation";
import { NotePathService } from "../notes/note-path";
import { TemplateContentService } from "../notes/template-content";
import { NumberingService } from "../numbering";
import { JournalsRepository } from "../repository";
import { fixedJournal } from "../testing";
import { JournalsEventsToken } from "../tokens";
import type { JournalsEvents } from "../repository";

import { startupSlice } from "./slice";
import { StartupOpenService } from "./startup-open";

import type { Emitter } from "nanoevents";

interface Harness {
  readonly container: Container;
  readonly repo: JournalsRepository;
  readonly events: Emitter<JournalsEvents>;
  readonly workspace: FakeWorkspaceService;
  readonly settings: SettingsService;
}

function build(journals: Record<string, JournalConfig>): Harness {
  const events = createNanoEvents<JournalsEvents>();
  const repo = JournalsRepository.fromParts(journals, events);
  const workspace = new FakeWorkspaceService();
  const notes = new FakeNotesService();

  const c = new Container();
  c.addModule(LoggerModule);
  c.addModule(FlowsModule);
  c.register(PluginData).useValue(new FakePluginData() as unknown as PluginData);
  c.register(SliceDefinitionToken).useValue(startupSlice);
  c.register(SettingsService).useClass(SettingsService);
  c.register(JournalsRepository).useValue(repo);
  c.register(JournalsEventsToken).useValue(events);
  c.register(WorkspaceService).useValue(workspace as unknown as WorkspaceService);
  c.register(NotesService).useValue(notes as unknown as NotesService);
  c.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  c.register(TemplaterService).useValue(new FakeTemplaterService() as unknown as TemplaterService);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  c.register(TemplateEngine).useClass(TemplateEngine);
  c.register(NotePathService).useClass(NotePathService);
  c.register(TemplateContentService).useClass(TemplateContentService);
  c.register(NoteCreationService).useClass(NoteCreationService);
  c.register(OpenJournalEntryFlow).useClass(OpenJournalEntryFlow);
  c.register(StartupOpenService).useClass(StartupOpenService);

  return { container: c, repo, events, workspace, settings: c.resolve(SettingsService) };
}

const TODAY_PATH = "2026-05-19.md" as VaultPath;

describe("StartupOpenService", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 19, 9, 0, 0));
  });
  afterEach(() => {
    teardown();
    vi.useRealTimers();
  });

  it("opens the configured journal's today note on a genuine launch", async () => {
    const h = build({ daily: fixedJournal("daily", { type: "day" }) });
    await h.settings.initialize();
    h.settings.getSlice(startupSlice).state = { journalName: "daily" };
    h.workspace.setLayoutReady(false);

    await h.container.resolve(StartupOpenService).initialize();
    h.workspace.setLayoutReady(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(h.workspace.isOpen(TODAY_PATH)).toBe(true);
  });

  it("does not open when the layout was already ready at initialize", async () => {
    const h = build({ daily: fixedJournal("daily", { type: "day" }) });
    await h.settings.initialize();
    h.settings.getSlice(startupSlice).state = { journalName: "daily" };
    h.workspace.setLayoutReady(true);

    await h.container.resolve(StartupOpenService).initialize();
    await vi.advanceTimersByTimeAsync(0);

    expect(h.workspace.isOpen(TODAY_PATH)).toBe(false);
  });

  it("does nothing when no journal is configured", async () => {
    const h = build({ daily: fixedJournal("daily", { type: "day" }) });
    await h.settings.initialize();
    h.workspace.setLayoutReady(false);

    await h.container.resolve(StartupOpenService).initialize();
    h.workspace.setLayoutReady(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(h.workspace.isOpen(TODAY_PATH)).toBe(false);
  });

  it("does nothing when the configured journal no longer exists", async () => {
    const h = build({ daily: fixedJournal("daily", { type: "day" }) });
    await h.settings.initialize();
    h.settings.getSlice(startupSlice).state = { journalName: "ghost" };
    h.workspace.setLayoutReady(false);

    await h.container.resolve(StartupOpenService).initialize();
    h.workspace.setLayoutReady(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(h.workspace.isOpen(TODAY_PATH)).toBe(false);
  });

  it("updates the stored journal name when that journal is renamed", async () => {
    const h = build({ daily: fixedJournal("daily", { type: "day" }) });
    await h.settings.initialize();
    h.settings.getSlice(startupSlice).state = { journalName: "daily" };
    h.container.resolve(StartupOpenService);

    h.repo.rename("daily", "work");

    expect(h.settings.getSlice(startupSlice).state.journalName).toBe("work");
  });

  it("clears the stored journal name when that journal is deleted", async () => {
    const h = build({ daily: fixedJournal("daily", { type: "day" }) });
    await h.settings.initialize();
    h.settings.getSlice(startupSlice).state = { journalName: "daily" };
    h.container.resolve(StartupOpenService);

    h.repo.delete("daily");

    expect(h.settings.getSlice(startupSlice).state.journalName).toBe("");
  });
});
```

Add the missing `vi` import — change the vitest import line to:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/journals/startup/startup-open.test.ts`
Expected: FAIL — `Cannot find module './startup-open'` (the service does not exist yet).

- [ ] **Step 3: Implement `StartupOpenService`**

```ts
import { CalendarDate } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { WorkspaceService } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { OpenJournalEntryFlow } from "../flows/open-journal-entry.flow";
import { JournalsRepository } from "../repository";
import { JournalsEventsToken } from "../tokens";

import { startupSlice } from "./slice";

export class StartupOpenService {
  readonly #workspace = inject(WorkspaceService);
  readonly #flows = inject(Flows);
  readonly #journals = inject(JournalsRepository);
  readonly #settings = inject(SettingsService);
  readonly #events = inject(JournalsEventsToken);
  readonly #logger = inject(LoggerFactoryToken).named("startup-open");

  readonly #slice = this.#settings.getSlice(startupSlice);

  constructor() {
    this.#events.on("renamed", (oldName, newName) => {
      if (this.#slice.state.journalName === oldName) {
        this.#slice.state = { journalName: newName };
      }
    });
    this.#events.on("deleted", (name) => {
      if (this.#slice.state.journalName === name) {
        this.#slice.state = { journalName: "" };
      }
    });
  }

  initialize(): AsyncResult<void, never> {
    const appStartup = !this.#workspace.layoutReady;
    this.#workspace.onLayoutReady(() => {
      if (!appStartup) return;
      void this.#open();
    });
    return AsyncResult.ok();
  }

  async #open(): Promise<void> {
    const { journalName } = this.#slice.state;
    if (journalName === "" || !this.#journals.exists(journalName)) return;
    const anchor = CalendarDate.today().toAnchor();
    const result = await this.#flows.invoke(OpenJournalEntryFlow, { journalName, anchor, openMode: "active" });
    if (result.isErr()) {
      this.#logger.error("startup-open: failed to open note", { journalName, error: result.error });
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/journals/startup/startup-open.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/journals/startup/startup-open.ts src/journals/startup/startup-open.test.ts
git commit -m "feat(journals): add StartupOpenService for open-on-startup"
```

---

### Task 4: i18n strings + `StartupBlock.vue`

**Files:**

- Modify: `messages/en.json`
- Create: `src/journals/startup/ui/StartupBlock.vue`
- Create: `src/journals/startup/ui/StartupBlock.test.ts`

- [ ] **Step 1: Add the four message keys**

In `messages/en.json`, add these keys (place them alphabetically near other `startup_*`/`s*` keys — exact position does not matter, JSON order is irrelevant):

```json
  "startup_dashboard_section_title": "Startup",
  "startup_open_note_title": "Open on startup",
  "startup_open_note_desc": "Open a note whenever you open this vault?",
  "startup_dont_open_option": "Don't open",
```

- [ ] **Step 2: Compile the messages**

Run: `npm run compile:i18n`
Expected: regenerates `src/i18n/paraglide/messages.js`; `m.startup_dashboard_section_title` etc. become available. No errors.

- [ ] **Step 3: Create the dashboard block component**

```vue
<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { SettingsService } from "@/settings";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { JournalsRepository } from "../../repository";
import { startupSlice } from "../slice";

const settings = useService(SettingsService);
const journals = useService(JournalsRepository);
const slice = settings.getSlice(startupSlice);
const expanded = ref(false);

const options = computed(() => [...journals.find().options()]);

const journalName = computed({
  get: () => slice.state.journalName,
  set: (name: string) => {
    slice.state = { journalName: name };
  },
});
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded">
    <template #trigger>
      <span class="section-heading">
        <UiIcon name="log-in" />
        <span class="section-title">{{ m.startup_dashboard_section_title() }}</span>
      </span>
    </template>
    <UiSettingRow :name="m.startup_open_note_title()">
      <template #description>{{ m.startup_open_note_desc() }}</template>
      <UiDropdown v-model="journalName">
        <option value="">{{ m.startup_dont_open_option() }}</option>
        <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
      </UiDropdown>
    </UiSettingRow>
  </UiCollapsibleBlock>
</template>

<style scoped>
.section-heading {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2-2);
}
.section-title {
  font-weight: var(--font-semibold);
}
</style>
```

- [ ] **Step 4: Write the component test**

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { provideInjectorOnApp, type Container } from "@/infrastructure/di";
import { SettingsService, SliceDefinitionToken } from "@/settings";
import { createSettingsService } from "@/settings/testing";

import { JournalsRepository } from "../../repository";
import { fakeRepo, fixedJournal } from "../../testing";
import { startupSlice } from "../slice";

import StartupBlock from "./StartupBlock.vue";

async function setup() {
  const settings = createSettingsService({ slices: [startupSlice] });
  const container = settings.container;
  container.register(SliceDefinitionToken).useValue(startupSlice);
  container.register(JournalsRepository).useValue(
    fakeRepo({
      daily: fixedJournal("daily", { type: "day" }),
      weekly: fixedJournal("weekly", { type: "week" }),
    }),
  );
  await settings.service.initialize();
  return { container, settings: settings.service };
}

function mount(container: Container) {
  return render(StartupBlock, {
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
          },
        },
      ],
    },
  });
}

async function expand(): Promise<void> {
  await userEvent.click(screen.getByText(m.startup_dashboard_section_title()));
}

afterEach(() => cleanup());

describe("StartupBlock", () => {
  it("offers a 'Don't open' choice plus one option per journal", async () => {
    const { container } = await setup();
    mount(container);
    await expand();
    expect(screen.getByRole("option", { name: m.startup_dont_open_option() })).toBeTruthy();
    expect(screen.getByRole("option", { name: "daily" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "weekly" })).toBeTruthy();
  });

  it("writes the chosen journal to the slice", async () => {
    const { container, settings } = await setup();
    mount(container);
    await expand();
    await userEvent.selectOptions(screen.getByRole("combobox"), "weekly");
    expect(settings.getSlice(startupSlice).state.journalName).toBe("weekly");
  });
});
```

Note: `createSettingsService` already registers `startupSlice` via its `slices` option, so the extra `SliceDefinitionToken` registration in `setup()` is redundant — remove that line if `npm run check:types`/tests complain about a duplicate; it is included only in case the component's `useService(SettingsService)` resolves a different instance. Keep the single `createSettingsService({ slices: [startupSlice] })` as the source of truth.

- [ ] **Step 5: Run the component tests**

Run: `npm run test -- src/journals/startup/ui/StartupBlock.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add messages/en.json src/i18n/paraglide src/journals/startup/ui/StartupBlock.vue src/journals/startup/ui/StartupBlock.test.ts
git commit -m "feat(journals): add Startup dashboard block"
```

---

### Task 5: Wire `startupModule` and integrate into `main.ts`

**Files:**

- Create: `src/journals/startup/module.ts`
- Modify: `src/main.ts:15` (import), `src/main.ts:45-48` (addModule), `src/main.ts:61` (initialize)
- Modify: `docs/2026-06-01-v2-v3-feature-gaps.md:37-39`

No test: module/DI wiring is not unit-tested per repo conventions ("don't test the wiring").

- [ ] **Step 1: Create the module**

```ts
import type { Module } from "@/infrastructure/di";
import { DashboardBlockToken, SliceDefinitionToken, defineDashboardBlock } from "@/settings";

import { startupSlice } from "./slice";
import { StartupOpenService } from "./startup-open";
import StartupBlock from "./ui/StartupBlock.vue";

export const startupModule: Module = {
  register(c) {
    c.register(SliceDefinitionToken).useValue(startupSlice);
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({
        key: "startup",
        component: StartupBlock,
        order: 8,
      }),
    );
    c.register(StartupOpenService).useClass(StartupOpenService);
  },
};
```

(Order 8 places the block after `views` (7) and before `calendar-week` (10).)

- [ ] **Step 2: Register the module and initialize the service in `main.ts`**

In `src/main.ts`, add to the import on line 15 (the `@/journals` import) so it reads:

```ts
import { AutoAttachService, AutoCreateService, StartupOpenService } from "@/journals";
```

Add the module import near the other module imports (e.g. after line 17):

```ts
import { startupModule } from "@/journals/startup/module";
```

Register the module — after line 48 (`container.addModule(commandsModule);`) add:

```ts
container.addModule(startupModule);
```

Initialize the service — after line 61 (`await container.resolve(AutoCreateService).initialize();`) add:

```ts
await container.resolve(StartupOpenService).initialize();
```

- [ ] **Step 3: Export `StartupOpenService` from the journals barrel**

In `src/journals/index.ts`, add `StartupOpenService` to the value exports. Find the existing block that exports `AutoCreateService` (around line 62) and add a sibling export:

```ts
export { StartupOpenService } from "./startup/startup-open";
```

(Match the surrounding export style in that file — if the barrel groups names in a single `export { … } from` per module, add a new line for the startup module rather than squeezing it into `notes`.)

- [ ] **Step 4: Verify types, lint, and full suite**

Run: `npm run check:types`
Expected: PASS.

Run: `npm run check:lint`
Expected: PASS.

Run: `npm run test`
Expected: PASS (full suite, including the new `startup-open` and `StartupBlock` tests).

- [ ] **Step 5: Mark gap #4 closed in the audit doc**

In `docs/2026-06-01-v2-v3-feature-gaps.md`, change item 4 (lines 37-39) from:

```markdown
- [ ] **4. Open on startup** — gone.
  - v2: `PluginSettings.openOnStartup` + `openStartupNote()` opened a chosen journal's note in the `onLayoutReady` hook (`src/_old-code/main.ts:425-433`); kept in sync on rename/remove.
  - v3: no `openOnStartup` setting, no startup-open logic in `src/main.ts`.
```

to:

```markdown
- [x] **4. Open on startup** — ported.
  - v2: `PluginSettings.openOnStartup` + `openStartupNote()` opened a chosen journal's note in the `onLayoutReady` hook (`src/_old-code/main.ts:425-433`); kept in sync on rename/remove.
  - v3: `src/journals/startup/` — `startupSlice` ({ journalName }), `StartupOpenService` (opens today's note via `OpenJournalEntryFlow` only on genuine launch, gated on `appStartup = !workspace.layoutReady`; reconciles the stored name on journal `renamed`/`deleted`), `StartupBlock` dashboard block. `WorkspaceService` gained `layoutReady`/`onLayoutReady`. Initialized from `main.ts`.
```

- [ ] **Step 6: Commit**

```bash
git add src/journals/startup/module.ts src/main.ts src/journals/index.ts docs/2026-06-01-v2-v3-feature-gaps.md
git commit -m "feat(journals): wire open-on-startup and close gap #4"
```

---

## Self-Review notes

- **Spec coverage:** slice (Task 1), host `layoutReady`/`onLayoutReady` (Task 2), `StartupOpenService` with the `appStartup` gate + rename/delete reconciliation (Task 3), `StartupBlock.vue` (Task 4), `startupModule` + `main.ts` init + gap-doc close (Task 5). All spec components and the "Skipped per conventions" list (host wrapper test, slice-defaults test, migration) are reflected.
- **Type consistency:** the slice state shape `{ journalName: string }` is identical across `slice.ts`, the service, the block, and all tests. `OpenJournalEntryFlow.execute` params `{ journalName, anchor, openMode }` match its definition. `JournalsEventsToken` event names `renamed`/`deleted` match `JournalsEvents`/`RepositoryEvents`.
- **Open risk to confirm during execution:** the journals barrel (`src/journals/index.ts`) export grouping is stylistic — match what's already there. If `createSettingsService` + an extra `SliceDefinitionToken` registration double-registers the slice and the DI container rejects duplicates, drop the redundant line (noted inline in Task 4 Step 4).

```

```
