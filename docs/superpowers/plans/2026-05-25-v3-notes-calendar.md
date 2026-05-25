# v3 Notes-Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a cell-level layer (`NotesCalendarCell.vue`, `useNotesCell`, `useShelfScope`, `ActiveEntryViewModel`) that turns a `CalendarMonthView` cell into one displaying decoration overlay, active-note highlight, click-to-open, right-click file menu, and cmd/ctrl-hover preview. First real consumer of the decorations engine.

**Architecture:** New top-level feature `src/notes-calendar/`, peer to `decorations/` / `calendar/` / `journals/`. Per-surface composable plus a thin SFC that renders inside the calendar primitives' existing `cell` slot (no nested button). Active-note state lives in one eager DI singleton subscribed to `WorkspaceService` + `JournalsIndex`. Two new sync methods on `WorkspaceService` wrap Obsidian's `link-hover` / `file-menu` triggers.

**Tech Stack:** TypeScript, Vue 3 (Composition API + scoped slots), valibot (already wired upstream), vitest + `@testing-library/vue` + `@testing-library/user-event`, ts-pattern, nanoevents, project's own DI (`infrastructure/di`), Result/Option monads (`infrastructure/result`).

**Spec:** `docs/superpowers/specs/2026-05-25-v3-notes-calendar-design.md`

**Conventions enforced by repo memory** (read each before writing code in the matching surface):

- `feedback_quality_gates` — every task ends with `npm run test`, `npm run check:types`, `npm run check:lint` clean.
- `feedback_test_hygiene` — colocate `*.test.ts` next to implementation.
- `feedback_no_lint_silence` — never `eslint-disable`; fix the code.
- `feedback_no_separate_branches` — work on the current branch (`v3-ai`); never create a new one.
- `feedback_one_behavior_per_test`, `feedback_test_descriptions`, `feedback_nested_describes`, `feedback_black_box_assertions`.
- `feedback_testing_library_for_components` — Vue tests use `@testing-library/vue` + `user-event`.
- `feedback_inline_vue_props` — inline `defineProps<{...}>()`; no separate `Props` interface.
- `feedback_di_omit_default_lifetime` — never call `.lifetime(Lifetime.Container)` (it's the default).
- `feedback_di_module_factories` — zero-arg modules export `const xModule: Module = {...}` (not a factory function).
- `feedback_field_initializer_preference` — `readonly #x = inject(...)`, not constructor body.
- `feedback_ts_pattern_over_switch` — discriminated-union dispatch via `match().with().exhaustive()`.
- `feedback_no_what_comments` — no narrative file-header or signature-paraphrasing comments.
- `feedback_no_spec_refs_in_source` — no "Satisfies §X" / spec references in code or test names.

---

## Phase 0 — Host plumbing

### Task 0.1: Add `Menu` to the obsidian mock

The new `WorkspaceService.openFileMenu` instantiates Obsidian's `Menu`. The test mock in `__mocks__/obsidian.ts` has no `Menu` class today; tests would crash. Adding a minimal fake here unblocks every later task that touches the file menu.

**Files:**

- Modify: `__mocks__/obsidian.ts`

- [ ] **Step 1: Add the Menu mock class plus a testing accessor**

Append the following to `__mocks__/obsidian.ts` (place the `class Menu` block before `const attachedInputSuggests`; add the `openMenus` array beside the other module-scoped arrays; extend `__testing` with the new accessors).

```ts
export interface FakeMenuItemConfig {
  title?: string;
  icon?: string;
  onClick?: (event: MouseEvent | KeyboardEvent) => void;
}

export class MenuItem {
  title = "";
  icon = "";
  #onClick: (event: MouseEvent | KeyboardEvent) => void = () => {};

  setTitle(title: string): this {
    this.title = title;
    return this;
  }
  setIcon(icon: string): this {
    this.icon = icon;
    return this;
  }
  onClick(callback: (event: MouseEvent | KeyboardEvent) => void): this {
    this.#onClick = callback;
    return this;
  }
  click(event: MouseEvent | KeyboardEvent = new MouseEvent("click")): void {
    this.#onClick(event);
  }
}

export class Menu {
  readonly items: MenuItem[] = [];
  showAtMouseEventCalls: MouseEvent[] = [];

  addItem(build: (item: MenuItem) => unknown): this {
    const item = new MenuItem();
    build(item);
    this.items.push(item);
    return this;
  }
  showAtMouseEvent(event: MouseEvent): void {
    this.showAtMouseEventCalls.push(event);
    openMenus.push(this);
  }
  showAtPosition(_position: { x: number; y: number }): void {
    openMenus.push(this);
  }
  hide(): void {
    const index = openMenus.indexOf(this);
    if (index >= 0) openMenus.splice(index, 1);
  }
}

const openMenus: Menu[] = [];
```

Inside the `__testing` object, add (alongside `openModals` / `openSuggestModals`):

```ts
  get openMenus(): readonly Menu[] {
    return openMenus;
  },
  lastOpenMenu(): Menu {
    const last = openMenus.at(-1);
    if (!last) throw new Error("__testing.lastOpenMenu() called before any menu opened");
    return last;
  },
```

And inside `reset()`:

```ts
for (const m of [...openMenus]) m.hide();
openMenus.length = 0;
```

- [ ] **Step 2: Run the full test suite to confirm no regressions**

Run: `npm run test`
Expected: PASS — no existing test uses the Menu mock yet; adding the class should be neutral.

- [ ] **Step 3: Type-check**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add __mocks__/obsidian.ts
git commit -m "test(mocks): add Menu mock for obsidian"
```

---

### Task 0.2: Teach the fake host workspace to record `trigger` calls

`WorkspaceService.triggerHoverPreview` / `openFileMenu` invoke `app.workspace.trigger(...)`. The fake host in `src/infrastructure/host/internal/testing.ts` has no `trigger` method today, so calling either would crash at runtime in tests.

**Files:**

- Modify: `src/infrastructure/host/internal/testing.ts`

- [ ] **Step 1: Extend `FakeWorkspaceState` and the `workspaceApi`**

In `src/infrastructure/host/internal/testing.ts`:

a) Update the `FakeWorkspaceState` interface (around line 36) to include a recorded-triggers array:

```ts
export interface FakeWorkspaceState {
  activeFile: TFile | null;
  openPaths: Set<string>;
  openCalls: { path: string; mode: PaneType | false }[];
  triggerCalls: { event: string; args: unknown[] }[];
}
```

b) Update the initial state object (around line 106) to seed the new field:

```ts
const workspaceState: FakeWorkspaceState = {
  activeFile: null,
  openPaths: new Set(),
  openCalls: [],
  triggerCalls: [],
};
```

c) Add a `trigger` method to `workspaceApi` (just before the closing brace of that object literal, around line 281):

```ts
trigger(event: string, ...args: unknown[]): void {
  workspaceState.triggerCalls.push({ event, args });
},
```

- [ ] **Step 2: Run the full test suite to confirm nothing regressed**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 3: Type-check**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/infrastructure/host/internal/testing.ts
git commit -m "test(host): record workspace.trigger calls on fake host"
```

---

### Task 0.3: Add `defineOpenMode` to `infrastructure/host`

Pure DOM → `OpenMode` helper. Lives in the host so any host-aware surface can reuse it.

**Files:**

- Create: `src/infrastructure/host/define-open-mode.ts`
- Create: `src/infrastructure/host/define-open-mode.test.ts`
- Modify: `src/infrastructure/host/index.ts`

- [ ] **Step 1: Write the failing test**

`src/infrastructure/host/define-open-mode.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { defineOpenMode } from "./define-open-mode";

describe("defineOpenMode", () => {
  it("returns 'active' for a plain left-click", () => {
    const event = new MouseEvent("click", { button: 0, ctrlKey: false, metaKey: false });
    expect(defineOpenMode(event)).toBe("active");
  });

  it("returns 'tab' when the ctrl key is held", () => {
    const event = new MouseEvent("click", { button: 0, ctrlKey: true });
    expect(defineOpenMode(event)).toBe("tab");
  });

  it("returns 'tab' when the meta key is held", () => {
    const event = new MouseEvent("click", { button: 0, metaKey: true });
    expect(defineOpenMode(event)).toBe("tab");
  });

  it("returns 'tab' for a middle-click", () => {
    const event = new MouseEvent("click", { button: 1 });
    expect(defineOpenMode(event)).toBe("tab");
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm run test -- src/infrastructure/host/define-open-mode.test.ts`
Expected: FAIL — `Cannot find module './define-open-mode'`.

- [ ] **Step 3: Write the implementation**

`src/infrastructure/host/define-open-mode.ts`:

```ts
import type { OpenMode } from "./types";

export function defineOpenMode(event: MouseEvent): OpenMode {
  if (event.ctrlKey || event.metaKey || event.button === 1) return "tab";
  return "active";
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm run test -- src/infrastructure/host/define-open-mode.test.ts`
Expected: PASS — all four tests green.

- [ ] **Step 5: Export from the host barrel**

In `src/infrastructure/host/index.ts`, add the line (alphabetical order; place near `defineModal`):

```ts
export { defineOpenMode } from "./define-open-mode";
```

- [ ] **Step 6: Run quality gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/infrastructure/host/define-open-mode.ts src/infrastructure/host/define-open-mode.test.ts src/infrastructure/host/index.ts
git commit -m "feat(host): add defineOpenMode utility"
```

---

### Task 0.4: Add `triggerHoverPreview` to `WorkspaceService`

**Files:**

- Modify: `src/infrastructure/host/internal/workspace-service.ts`
- Modify: `src/infrastructure/host/internal/workspace-service.test.ts`
- Modify: `src/infrastructure/host/testing.ts`

- [ ] **Step 1: Write the failing test**

Inside the existing `describe("WorkspaceService", ...)` block in `src/infrastructure/host/internal/workspace-service.test.ts`, append a new nested describe (before the closing `})` of the outer describe):

```ts
describe("triggerHoverPreview", () => {
  it("invokes app.workspace.trigger with the link-hover signal", () => {
    const { service, host } = build();
    const event = new MouseEvent("mouseenter");
    service.triggerHoverPreview(path, event);

    expect(host.workspace.triggerCalls).toHaveLength(1);
    const [recorded] = host.workspace.triggerCalls;
    expect(recorded.event).toBe("link-hover");
    expect(recorded.args[0]).toBe(host.plugin);
    expect(recorded.args[1]).toBe(event.target);
    expect(recorded.args[2]).toBe(path);
    expect(recorded.args[3]).toBe(path);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm run test -- src/infrastructure/host/internal/workspace-service.test.ts`
Expected: FAIL — `service.triggerHoverPreview is not a function`.

- [ ] **Step 3: Implement the method**

In `src/infrastructure/host/internal/workspace-service.ts`, add this method to the `WorkspaceService` class (place after `openNote`):

```ts
triggerHoverPreview(path: VaultPath, event: MouseEvent): void {
  this.#app.workspace.trigger("link-hover", this.#plugin, event.target, path, path);
}
```

- [ ] **Step 4: Mirror the new method on `FakeWorkspaceService`**

`src/infrastructure/host/testing.ts` — update the `Pick<...>` union and add the spy. Replace the existing class declaration with:

```ts
export class FakeWorkspaceService implements Pick<
  WorkspaceService,
  "activeNote" | "isOpen" | "openNote" | "events" | "triggerHoverPreview"
> {
  readonly #open = new Set<VaultPath>();
  readonly #emitter: TypedEmitter<WorkspaceEvents> = createNanoEvents();
  #active: Option<VaultPath> = new None<VaultPath>();

  readonly events: Subscribable<WorkspaceEvents> = this.#emitter;
  readonly hoverPreviewCalls: { path: VaultPath; event: MouseEvent }[] = [];

  activeNote(): Option<VaultPath> {
    return this.#active;
  }

  isOpen(path: VaultPath): boolean {
    return this.#open.has(path);
  }

  openNote(path: VaultPath, _mode: OpenMode = "active"): AsyncResult<void, WorkspaceOpenError> {
    this.#open.add(path);
    this.#active = new Some<VaultPath>(path);
    return AsyncResult.ok(undefined);
  }

  setActive(path: VaultPath | null): void {
    this.#active = path === null ? new None<VaultPath>() : new Some<VaultPath>(path);
    this.#emitter.emit("active-note-changed", this.#active);
  }

  triggerHoverPreview(path: VaultPath, event: MouseEvent): void {
    this.hoverPreviewCalls.push({ path, event });
  }
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npm run test -- src/infrastructure/host/internal/workspace-service.test.ts`
Expected: PASS.

- [ ] **Step 6: Run full quality gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/infrastructure/host/internal/workspace-service.ts src/infrastructure/host/internal/workspace-service.test.ts src/infrastructure/host/testing.ts
git commit -m "feat(host): add triggerHoverPreview to WorkspaceService"
```

---

### Task 0.5: Add `openFileMenu` to `WorkspaceService`

**Files:**

- Modify: `src/infrastructure/host/internal/workspace-service.ts`
- Modify: `src/infrastructure/host/internal/workspace-service.test.ts`
- Modify: `src/infrastructure/host/testing.ts`

- [ ] **Step 1: Write the failing tests**

Inside `src/infrastructure/host/internal/workspace-service.test.ts`, append a new nested describe before the outer describe closes:

```ts
describe("openFileMenu", () => {
  it("invokes app.workspace.trigger with the file-menu signal and shows the menu at the event", async () => {
    const { __testing } = await import("obsidian");
    __testing.reset();

    const { service, host } = build();
    host.putFile(path);
    const event = new MouseEvent("contextmenu");
    service.openFileMenu(path, event);

    expect(host.workspace.triggerCalls).toHaveLength(1);
    const [recorded] = host.workspace.triggerCalls;
    expect(recorded.event).toBe("file-menu");
    const menu = __testing.lastOpenMenu();
    expect(menu.showAtMouseEventCalls).toEqual([event]);
  });

  it("no-ops when the path does not resolve to a TFile", async () => {
    const { __testing } = await import("obsidian");
    __testing.reset();

    const { service, host } = build();
    service.openFileMenu("Missing/file.md" as VaultPath, new MouseEvent("contextmenu"));

    expect(host.workspace.triggerCalls).toHaveLength(0);
    expect(__testing.openMenus).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm run test -- src/infrastructure/host/internal/workspace-service.test.ts`
Expected: FAIL — `service.openFileMenu is not a function`.

- [ ] **Step 3: Implement the method**

In `src/infrastructure/host/internal/workspace-service.ts`:

a) Add the `Menu` import alongside the existing `TFile` import:

```ts
import { Menu, TFile } from "obsidian";
```

b) Add this method to the `WorkspaceService` class (place after `triggerHoverPreview`):

```ts
openFileMenu(path: VaultPath, event: MouseEvent): void {
  const file = this.#app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return;
  const menu = new Menu();
  this.#app.workspace.trigger("file-menu", menu, file, "file-explorer-context-menu", null);
  menu.showAtMouseEvent(event);
}
```

- [ ] **Step 4: Mirror on `FakeWorkspaceService`**

In `src/infrastructure/host/testing.ts`, extend the `Pick<...>` union and add a spy. Replace the relevant lines in the existing class:

```ts
export class FakeWorkspaceService
  implements
    Pick<WorkspaceService, "activeNote" | "isOpen" | "openNote" | "events" | "triggerHoverPreview" | "openFileMenu">
{
```

And add a new property + method beside `hoverPreviewCalls`:

```ts
  readonly fileMenuCalls: { path: VaultPath; event: MouseEvent }[] = [];

  openFileMenu(path: VaultPath, event: MouseEvent): void {
    this.fileMenuCalls.push({ path, event });
  }
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `npm run test -- src/infrastructure/host/internal/workspace-service.test.ts`
Expected: PASS.

- [ ] **Step 6: Run full quality gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/infrastructure/host/internal/workspace-service.ts src/infrastructure/host/internal/workspace-service.test.ts src/infrastructure/host/testing.ts
git commit -m "feat(host): add openFileMenu to WorkspaceService"
```

---

## Phase 1 — `cell-format.ts`

### Task 1.1: Implement and test `defaultFormatPattern`

Pure function, no dependencies. Easiest possible starting point for the new feature.

**Files:**

- Create: `src/notes-calendar/cell-format.ts`
- Create: `src/notes-calendar/cell-format.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/notes-calendar/cell-format.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { defaultFormatPattern } from "./cell-format";

describe("defaultFormatPattern", () => {
  it("returns 'D' for day", () => {
    expect(defaultFormatPattern("day")).toBe("D");
  });

  it("returns '[W]ww' for week", () => {
    expect(defaultFormatPattern("week")).toBe("[W]ww");
  });

  it("returns 'MMM' for month", () => {
    expect(defaultFormatPattern("month")).toBe("MMM");
  });

  it("returns '[Q]Q' for quarter", () => {
    expect(defaultFormatPattern("quarter")).toBe("[Q]Q");
  });

  it("returns 'YYYY' for year", () => {
    expect(defaultFormatPattern("year")).toBe("YYYY");
  });

  it("returns 'YYYY' for decade", () => {
    expect(defaultFormatPattern("decade")).toBe("YYYY");
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm run test -- src/notes-calendar/cell-format.test.ts`
Expected: FAIL — `Cannot find module './cell-format'`.

- [ ] **Step 3: Write the implementation**

`src/notes-calendar/cell-format.ts`:

```ts
import { match } from "ts-pattern";

import type { PeriodKind } from "@/calendar";

export function defaultFormatPattern(kind: PeriodKind): string {
  return match(kind)
    .with("day", () => "D")
    .with("week", () => "[W]ww")
    .with("month", () => "MMM")
    .with("quarter", () => "[Q]Q")
    .with("year", () => "YYYY")
    .with("decade", () => "YYYY")
    .exhaustive();
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm run test -- src/notes-calendar/cell-format.test.ts`
Expected: PASS — six tests green.

- [ ] **Step 5: Run full quality gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/notes-calendar/cell-format.ts src/notes-calendar/cell-format.test.ts
git commit -m "feat(notes-calendar): add defaultFormatPattern"
```

---

## Phase 2 — `ActiveEntryViewModel` + module skeleton

### Task 2.1: Implement `ActiveEntryViewModel` with subscriptions

**Files:**

- Create: `src/notes-calendar/active-entry.ts`
- Create: `src/notes-calendar/active-entry.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/notes-calendar/active-entry.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DayPeriod } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { WorkspaceService } from "@/infrastructure/host";
import { FakeWorkspaceService } from "@/infrastructure/host/testing";
import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex } from "@/journals";
import type { JournalEntry } from "@/journals";

import { ActiveEntryViewModel } from "./active-entry";

interface Harness {
  vm: ActiveEntryViewModel;
  workspace: FakeWorkspaceService;
  index: JournalsIndex;
}

function build(): Harness {
  const c = new Container();
  const workspace = new FakeWorkspaceService();
  c.register(WorkspaceService).useValue(workspace as unknown as WorkspaceService);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(ActiveEntryViewModel).useClass(ActiveEntryViewModel);
  const index = c.resolve(JournalsIndex);
  const vm = c.resolve(ActiveEntryViewModel);
  return { vm, workspace, index };
}

const dailyPath = "Daily/2026-05-25.md" as VaultPath;
const anchor = DayPeriod.containing(date("2026-05-25")).anchor.toAnchor();
const entry: JournalEntry = { journalName: "daily", anchor, path: dailyPath };

describe("ActiveEntryViewModel", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  describe("initial state", () => {
    it("is null when no active note exists at construction", () => {
      const { vm } = build();
      expect(vm.active.value).toBeNull();
    });

    it("reflects the active note's journal entry when one exists at construction", () => {
      const c = new Container();
      const workspace = new FakeWorkspaceService();
      workspace.setActive(dailyPath);
      c.register(WorkspaceService).useValue(workspace as unknown as WorkspaceService);
      c.register(JournalsIndex).useClass(JournalsIndex);
      c.resolve(JournalsIndex).register(entry);
      c.register(ActiveEntryViewModel).useClass(ActiveEntryViewModel);

      const vm = c.resolve(ActiveEntryViewModel);
      expect(vm.active.value).toEqual({ journalName: "daily", anchor });
    });
  });

  describe("active-note-changed", () => {
    it("updates active when a journal note becomes the active file", () => {
      const { vm, workspace, index } = build();
      index.register(entry);
      workspace.setActive(dailyPath);
      expect(vm.active.value).toEqual({ journalName: "daily", anchor });
    });

    it("clears active when a non-journal file becomes active", () => {
      const { vm, workspace, index } = build();
      index.register(entry);
      workspace.setActive(dailyPath);
      workspace.setActive("Other/random.md" as VaultPath);
      expect(vm.active.value).toBeNull();
    });
  });

  describe("entryChanged", () => {
    it("updates active when the active note registers in the index", () => {
      const { vm, workspace, index } = build();
      workspace.setActive(dailyPath);
      expect(vm.active.value).toBeNull();
      index.register(entry);
      expect(vm.active.value).toEqual({ journalName: "daily", anchor });
    });

    it("clears active when the active note unregisters from the index", () => {
      const { vm, workspace, index } = build();
      index.register(entry);
      workspace.setActive(dailyPath);
      index.unregister(dailyPath);
      expect(vm.active.value).toBeNull();
    });

    it("ignores entryChanged for unrelated paths", () => {
      const { vm, workspace, index } = build();
      index.register(entry);
      workspace.setActive(dailyPath);
      const initial = vm.active.value;
      index.register({ journalName: "weekly", anchor, path: "Weekly/2026-W22.md" as VaultPath });
      expect(vm.active.value).toBe(initial);
    });
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm run test -- src/notes-calendar/active-entry.test.ts`
Expected: FAIL — `Cannot find module './active-entry'`.

- [ ] **Step 3: Write the implementation**

`src/notes-calendar/active-entry.ts`:

```ts
import { shallowRef, type ShallowRef } from "vue";

import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { WorkspaceService } from "@/infrastructure/host";
import type { Option, VaultPath } from "@/infrastructure/host";
import { JournalsIndex } from "@/journals";

export interface ActiveEntryRef {
  readonly journalName: string;
  readonly anchor: AnchorString;
}

export class ActiveEntryViewModel {
  readonly #workspace = inject(WorkspaceService);
  readonly #index = inject(JournalsIndex);

  readonly active: ShallowRef<ActiveEntryRef | null> = shallowRef(null);

  constructor() {
    this.#refresh(this.#workspace.activeNote());
    this.#workspace.events.on("active-note-changed", (path: Option<VaultPath>) => {
      this.#refresh(path);
    });
    this.#index.events.on("entryChanged", ({ entry, kind }) => {
      const current = this.#workspace.activeNote();
      if (current.isNone() || current.value !== entry.path) return;
      this.active.value = kind === "added" ? { journalName: entry.journalName, anchor: entry.anchor } : null;
    });
  }

  #refresh(path: Option<VaultPath>): void {
    this.active.value = path
      .flatMap((p) => this.#index.entryByPath(p))
      .match({
        some: (entry) => ({ journalName: entry.journalName, anchor: entry.anchor }),
        none: () => null as ActiveEntryRef | null,
      });
  }
}
```

Note the corrected imports (the `Option` type lives in `@/infrastructure/result`, not the host barrel):

```ts
import { shallowRef, type ShallowRef } from "vue";

import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import type { Option } from "@/infrastructure/result";
import { JournalsIndex } from "@/journals";
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npm run test -- src/notes-calendar/active-entry.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full quality gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/notes-calendar/active-entry.ts src/notes-calendar/active-entry.test.ts
git commit -m "feat(notes-calendar): add ActiveEntryViewModel"
```

---

### Task 2.2: Add `FakeActiveEntryViewModel` to feature testing helper

Used by `useNotesCell` tests in Phase 4 to inject a writable active-entry ref.

**Files:**

- Create: `src/notes-calendar/testing.ts`

- [ ] **Step 1: Write the helper**

`src/notes-calendar/testing.ts`:

```ts
import { shallowRef, type ShallowRef } from "vue";

import type { ActiveEntryRef, ActiveEntryViewModel } from "./active-entry";

export class FakeActiveEntryViewModel implements Pick<ActiveEntryViewModel, "active"> {
  readonly active: ShallowRef<ActiveEntryRef | null> = shallowRef(null);

  setActive(ref: ActiveEntryRef | null): void {
    this.active.value = ref;
  }
}
```

- [ ] **Step 2: Run quality gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: PASS — `testing.ts` is infrastructure (per `feedback_no_mock_fake_tests`); no test of its own.

- [ ] **Step 3: Commit**

```bash
git add src/notes-calendar/testing.ts
git commit -m "test(notes-calendar): add FakeActiveEntryViewModel"
```

---

### Task 2.3: Add `notesCalendarModule` and wire it in `main.ts`

**Files:**

- Create: `src/notes-calendar/module.ts`
- Create: `src/notes-calendar/index.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Write the module**

`src/notes-calendar/module.ts`:

```ts
import type { Module } from "@/infrastructure/di";

import { ActiveEntryViewModel } from "./active-entry";

export const notesCalendarModule: Module = {
  register(c) {
    c.register(ActiveEntryViewModel).useClass(ActiveEntryViewModel).eager();
  },
};
```

- [ ] **Step 2: Write a placeholder barrel**

`src/notes-calendar/index.ts`:

```ts
export { ActiveEntryViewModel, type ActiveEntryRef } from "./active-entry";
export { defaultFormatPattern } from "./cell-format";
export { notesCalendarModule } from "./module";
```

- [ ] **Step 3: Wire the module in `main.ts`**

In `src/main.ts`, add the import (alphabetical with neighbors):

```ts
import { notesCalendarModule } from "@/notes-calendar";
```

And the registration line, placed right after `decorationsModule`:

```ts
container.addModule(notesCalendarModule);
```

- [ ] **Step 4: Run quality gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: PASS — no new tests; module wiring is not tested per `feedback_no_wiring_tests`.

- [ ] **Step 5: Commit**

```bash
git add src/notes-calendar/module.ts src/notes-calendar/index.ts src/main.ts
git commit -m "feat(notes-calendar): register notesCalendarModule"
```

---

## Phase 3 — `useShelfScope`

### Task 3.1: Implement `useShelfScope`

Reads from `JournalsViewModel.journals` (reactive `ComputedRef<JournalConfig[]>`), `ShelvesRepository.get(name)` for the shelf-filtering case. Partitions journals by `write.type`.

**Files:**

- Create: `src/notes-calendar/use-shelf-scope.ts`
- Create: `src/notes-calendar/use-shelf-scope.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/notes-calendar/use-shelf-scope.test.ts`:

```ts
import { render } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, reactive } from "vue";

import { installTestCalendar } from "@/calendar/testing";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { JournalsRepository, JournalsViewModel } from "@/journals";
import type { JournalsEvents } from "@/journals";
import { customJournal, fixedJournal } from "@/journals/testing";
import { ShelvesEventsToken, ShelvesRepository } from "@/shelves";
import type { ShelfConfig, ShelvesEvents } from "@/shelves";

import { useShelfScope } from "./use-shelf-scope";
import type { ShelfScope } from "./use-shelf-scope";

interface Harness {
  c: Container;
  journals: Record<string, ReturnType<typeof fixedJournal>>;
  shelves: Record<string, ShelfConfig>;
}

function build(journals: Harness["journals"] = {}, shelves: Harness["shelves"] = {}): Harness {
  const c = new Container();
  const reactiveJournals = reactive({ ...journals });
  const journalsEvents = createNanoEvents<JournalsEvents>();
  c.register(JournalsRepository).useValue(JournalsRepository.fromParts(reactiveJournals, journalsEvents));
  c.register(JournalsViewModel).useClass(JournalsViewModel);
  const reactiveShelves = reactive({ ...shelves });
  const shelvesEvents = createNanoEvents<ShelvesEvents>();
  c.register(ShelvesEventsToken).useValue(shelvesEvents);
  c.register(ShelvesRepository).useValue(ShelvesRepository.fromParts(reactiveShelves, shelvesEvents));
  return { c, journals: reactiveJournals, shelves: reactiveShelves };
}

function mountAndCapture(c: Container, shelfName: () => string | null): { scope: ShelfScope; unmount: () => void } {
  let captured: ShelfScope | null = null;
  const Host = defineComponent({
    setup() {
      captured = useShelfScope(shelfName);
      return () => h("div");
    },
  });
  const utilities = render(Host, {
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, c);
          },
        },
      ],
    },
  });
  if (!captured) throw new Error("scope not captured");
  return { scope: captured, unmount: () => utilities.unmount() };
}

describe("useShelfScope", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  it("returns every journal partitioned by write type when shelf is null", () => {
    const { c } = build({
      daily: fixedJournal("daily", { type: "day" }),
      weekly: fixedJournal("weekly", { type: "week" }),
      custom1: customJournal("custom1", "day", 3, "2026-01-01"),
    });

    const { scope } = mountAndCapture(c, () => null);

    expect([...scope.all.value]).toEqual(["daily", "weekly", "custom1"]);
    expect([...scope.day.value]).toEqual(["daily"]);
    expect([...scope.week.value]).toEqual(["weekly"]);
    expect([...scope.custom.value]).toEqual(["custom1"]);
    expect([...scope.month.value]).toEqual([]);
  });

  it("filters journals to those listed by the named shelf", () => {
    const { c } = build(
      {
        daily: fixedJournal("daily", { type: "day" }),
        weekly: fixedJournal("weekly", { type: "week" }),
        monthly: fixedJournal("monthly", { type: "month" }),
      },
      {
        work: { name: "work", journals: ["daily", "weekly"] },
      },
    );

    const { scope } = mountAndCapture(c, () => "work");

    expect([...scope.all.value]).toEqual(["daily", "weekly"]);
    expect([...scope.month.value]).toEqual([]);
  });

  it("returns empty buckets when the shelf name is unknown", () => {
    const { c } = build({ daily: fixedJournal("daily", { type: "day" }) });

    const { scope } = mountAndCapture(c, () => "missing");

    expect([...scope.all.value]).toEqual([]);
    expect([...scope.day.value]).toEqual([]);
  });

  it("re-computes when a journal is added to the underlying repository", async () => {
    const { c, journals } = build({ daily: fixedJournal("daily", { type: "day" }) });

    const { scope } = mountAndCapture(c, () => null);
    expect([...scope.day.value]).toEqual(["daily"]);

    journals.morning = fixedJournal("morning", { type: "day" });
    await Promise.resolve();
    expect([...scope.day.value]).toEqual(["daily", "morning"]);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm run test -- src/notes-calendar/use-shelf-scope.test.ts`
Expected: FAIL — `Cannot find module './use-shelf-scope'`.

- [ ] **Step 3: Write the implementation**

`src/notes-calendar/use-shelf-scope.ts`:

```ts
import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";

import { useService } from "@/infrastructure/di";
import { JournalsViewModel } from "@/journals";
import type { JournalConfig, JournalWrite } from "@/journals";
import { ShelvesRepository } from "@/shelves";

export interface ShelfScope {
  readonly all: ComputedRef<readonly string[]>;
  readonly day: ComputedRef<readonly string[]>;
  readonly week: ComputedRef<readonly string[]>;
  readonly month: ComputedRef<readonly string[]>;
  readonly quarter: ComputedRef<readonly string[]>;
  readonly year: ComputedRef<readonly string[]>;
  readonly custom: ComputedRef<readonly string[]>;
}

export function useShelfScope(shelfName: MaybeRefOrGetter<string | null>): ShelfScope {
  const journalsVM = useService(JournalsViewModel);
  const shelves = useService(ShelvesRepository);

  const scopedJournals = computed<readonly JournalConfig[]>(() => {
    const name = toValue(shelfName);
    const all = journalsVM.journals.value;
    if (name === null) return all;
    const shelf = shelves.get(name);
    if (shelf.isNone()) return [];
    const allowed = new Set(shelf.value.journals);
    return all.filter((journal) => allowed.has(journal.name));
  });

  const namesOfWrite = (writeType: JournalWrite["type"]): ComputedRef<readonly string[]> =>
    computed(() => scopedJournals.value.filter((journal) => journal.write.type === writeType).map((j) => j.name));

  return {
    all: computed(() => scopedJournals.value.map((j) => j.name)),
    day: namesOfWrite("day"),
    week: namesOfWrite("week"),
    month: namesOfWrite("month"),
    quarter: namesOfWrite("quarter"),
    year: namesOfWrite("year"),
    custom: namesOfWrite("custom"),
  };
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npm run test -- src/notes-calendar/use-shelf-scope.test.ts`
Expected: PASS — four tests green.

- [ ] **Step 5: Export from the feature barrel**

In `src/notes-calendar/index.ts`, add:

```ts
export { useShelfScope, type ShelfScope } from "./use-shelf-scope";
```

- [ ] **Step 6: Run full quality gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/notes-calendar/use-shelf-scope.ts src/notes-calendar/use-shelf-scope.test.ts src/notes-calendar/index.ts
git commit -m "feat(notes-calendar): add useShelfScope composable"
```

---

## Phase 4 — `useNotesCell`

### Task 4.1: Implement `useNotesCell` (isActive, isActionable, open)

Start with the reactive surface + the open action. Defer `openContextMenu` / `openPreview` to 4.2 and 4.3 to keep tasks small.

**Files:**

- Create: `src/notes-calendar/use-notes-cell.ts`
- Create: `src/notes-calendar/use-notes-cell.test.ts`

- [ ] **Step 1: Write the failing tests for `isActive`, `isActionable`, `open`**

`src/notes-calendar/use-notes-cell.test.ts`:

```ts
import { render } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, reactive } from "vue";

import { DayPeriod } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows, FlowsModule } from "@/infrastructure/flows";
import { LoggerModule } from "@/infrastructure/logger";
import { WorkspaceService } from "@/infrastructure/host";
import { FakeWorkspaceService } from "@/infrastructure/host/testing";
import type { VaultPath } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";
import { CycleService, JournalsIndex, JournalsRepository, OpenDateFlow, TimelineService } from "@/journals";
import { fakeRepo, fixedJournal } from "@/journals/testing";

import { ActiveEntryViewModel } from "./active-entry";
import { FakeActiveEntryViewModel } from "./testing";
import { useNotesCell, type NotesCellApi } from "./use-notes-cell";

interface Harness {
  c: Container;
  workspace: FakeWorkspaceService;
  flows: Flows;
  active: FakeActiveEntryViewModel;
  index: JournalsIndex;
  invokeSpy: ReturnType<typeof vi.spyOn>;
}

function buildHarness(): Harness {
  const c = new Container();
  c.addModule(LoggerModule);
  c.addModule(FlowsModule);

  const journals = reactive({
    daily: fixedJournal(
      "daily",
      { type: "day" },
      { timeline: { start: "2026-01-01" as AnchorString, end: { kind: "never" } } },
    ),
  });
  c.register(JournalsRepository).useValue(fakeRepo(journals));
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(TimelineService).useClass(TimelineService);

  const workspace = new FakeWorkspaceService();
  c.register(WorkspaceService).useValue(workspace as unknown as WorkspaceService);

  const active = new FakeActiveEntryViewModel();
  c.register(ActiveEntryViewModel).useValue(active as unknown as ActiveEntryViewModel);

  const flows = c.resolve(Flows);
  const invokeSpy = vi
    .spyOn(flows, "invoke")
    .mockImplementation(() => AsyncResult.ok({ path: "noop" as VaultPath, created: false }));
  const index = c.resolve(JournalsIndex);

  return { c, workspace, flows, active, index, invokeSpy };
}

function mountWithApi(c: Container, journalNames: () => readonly string[]): { api: NotesCellApi; unmount: () => void } {
  let captured: NotesCellApi | null = null;
  const Host = defineComponent({
    setup() {
      captured = useNotesCell({ journalNames });
      return () => h("div");
    },
  });
  const utilities = render(Host, {
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, c);
          },
        },
      ],
    },
  });
  if (!captured) throw new Error("api not captured");
  return { api: captured, unmount: () => utilities.unmount() };
}

const may25 = DayPeriod.containing(date("2026-05-25"));
const dailyPath = "Daily/2026-05-25.md" as VaultPath;

describe("useNotesCell", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  describe("isActionable", () => {
    it("is true when any in-scope journal covers the period's anchor", () => {
      const { c } = buildHarness();
      const { api } = mountWithApi(c, () => ["daily"]);
      expect(api.isActionable(may25)).toBe(true);
    });

    it("is false when no journal is in scope", () => {
      const { c } = buildHarness();
      const { api } = mountWithApi(c, () => []);
      expect(api.isActionable(may25)).toBe(false);
    });

    it("is false when the anchor is before every in-scope journal's timeline start", () => {
      const { c } = buildHarness();
      const { api } = mountWithApi(c, () => ["daily"]);
      const before = DayPeriod.containing(date("2025-12-31"));
      expect(api.isActionable(before)).toBe(false);
    });
  });

  describe("isActive", () => {
    it("is true when the active entry's journal + anchor match the period", () => {
      const { c, active } = buildHarness();
      const { api } = mountWithApi(c, () => ["daily"]);
      active.setActive({ journalName: "daily", anchor: may25.anchor.toAnchor() });
      expect(api.isActive(may25)).toBe(true);
    });

    it("is false when the active entry's journal is not in scope", () => {
      const { c, active } = buildHarness();
      const { api } = mountWithApi(c, () => ["daily"]);
      active.setActive({ journalName: "weekly", anchor: may25.anchor.toAnchor() });
      expect(api.isActive(may25)).toBe(false);
    });

    it("is false when active is null", () => {
      const { c } = buildHarness();
      const { api } = mountWithApi(c, () => ["daily"]);
      expect(api.isActive(may25)).toBe(false);
    });
  });

  describe("open", () => {
    it("invokes OpenDateFlow with the period anchor and journal names", () => {
      const { c, invokeSpy } = buildHarness();
      const { api } = mountWithApi(c, () => ["daily"]);
      const event = new MouseEvent("click");
      api.open(may25, event);

      expect(invokeSpy).toHaveBeenCalledWith(OpenDateFlow, {
        anchor: may25.anchor.toAnchor(),
        journalNames: ["daily"],
        openMode: "active",
      });
    });

    it("passes openMode 'tab' when ctrl is held", () => {
      const { c, invokeSpy } = buildHarness();
      const { api } = mountWithApi(c, () => ["daily"]);
      api.open(may25, new MouseEvent("click", { ctrlKey: true }));
      expect(invokeSpy).toHaveBeenCalledWith(OpenDateFlow, expect.objectContaining({ openMode: "tab" }));
    });

    it("does not invoke OpenDateFlow when the cell is not actionable", () => {
      const { c, invokeSpy } = buildHarness();
      const { api } = mountWithApi(c, () => []);
      api.open(may25, new MouseEvent("click"));
      expect(invokeSpy).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm run test -- src/notes-calendar/use-notes-cell.test.ts`
Expected: FAIL — `Cannot find module './use-notes-cell'`.

- [ ] **Step 3: Write the minimal implementation**

`src/notes-calendar/use-notes-cell.ts`:

```ts
import { toValue, type MaybeRefOrGetter } from "vue";

import type { Period } from "@/calendar";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { defineOpenMode, WorkspaceService } from "@/infrastructure/host";
import { JournalsIndex, OpenDateFlow, TimelineService } from "@/journals";

import { ActiveEntryViewModel } from "./active-entry";

export interface NotesCellApi {
  open(period: Period, event: MouseEvent): void;
  openContextMenu(period: Period, event: MouseEvent): void;
  openPreview(period: Period, event: MouseEvent): void;
  isActive(period: Period): boolean;
  isActionable(period: Period): boolean;
}

export function useNotesCell(options: { journalNames: MaybeRefOrGetter<readonly string[]> }): NotesCellApi {
  const flows = useService(Flows);
  const workspace = useService(WorkspaceService);
  const timeline = useService(TimelineService);
  const index = useService(JournalsIndex);
  const activeVM = useService(ActiveEntryViewModel);

  const isActionable = (period: Period): boolean => {
    const names = toValue(options.journalNames);
    const anchor = period.anchor.toAnchor();
    return names.some((name) => timeline.contains(name, anchor));
  };

  const isActive = (period: Period): boolean => {
    const a = activeVM.active.value;
    if (a === null) return false;
    const names = toValue(options.journalNames);
    if (!names.includes(a.journalName)) return false;
    return a.anchor === period.anchor.toAnchor();
  };

  const existingPathsAt = (period: Period): readonly string[] => {
    const anchor = period.anchor.toAnchor();
    const paths: string[] = [];
    for (const name of toValue(options.journalNames)) {
      const opt = index.entryByAnchor(name, anchor);
      if (opt.isSome()) paths.push(opt.value.path);
    }
    return paths;
  };

  const open = (period: Period, event: MouseEvent): void => {
    if (!isActionable(period)) return;
    void flows.invoke(OpenDateFlow, {
      anchor: period.anchor.toAnchor(),
      journalNames: [...toValue(options.journalNames)],
      openMode: defineOpenMode(event),
    });
  };

  const openContextMenu = (_period: Period, _event: MouseEvent): void => {
    // implemented in task 4.2
  };

  const openPreview = (_period: Period, _event: MouseEvent): void => {
    // implemented in task 4.3
  };

  // silence unused-variable lint in this partial implementation
  void workspace;
  void existingPathsAt;

  return { open, openContextMenu, openPreview, isActive, isActionable };
}
```

Note: the two `void workspace` / `void existingPathsAt` placeholders disappear in 4.2 and 4.3 — no lint suppression needed once those land. If lint complains in this intermediate state, delete the unused symbols and re-add when needed.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test -- src/notes-calendar/use-notes-cell.test.ts`
Expected: PASS — all tests in `isActionable`, `isActive`, `open` describes pass.

- [ ] **Step 5: Run full quality gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/notes-calendar/use-notes-cell.ts src/notes-calendar/use-notes-cell.test.ts
git commit -m "feat(notes-calendar): add useNotesCell with open/isActive/isActionable"
```

---

### Task 4.2: Implement `openContextMenu` (0/1/N-path branches)

**Files:**

- Modify: `src/notes-calendar/use-notes-cell.ts`
- Modify: `src/notes-calendar/use-notes-cell.test.ts`

- [ ] **Step 1: Append failing tests inside the outer `describe("useNotesCell", ...)` block**

```ts
describe("openContextMenu", () => {
  it("does nothing when no entry exists at the period's anchor", () => {
    const { c, workspace } = buildHarness();
    const { api } = mountWithApi(c, () => ["daily"]);
    api.openContextMenu(may25, new MouseEvent("contextmenu"));
    expect(workspace.fileMenuCalls).toEqual([]);
  });

  it("opens the file menu directly when exactly one entry exists", async () => {
    const { c, workspace, index } = buildHarness();
    index.register({ journalName: "daily", anchor: may25.anchor.toAnchor(), path: dailyPath });
    const { api } = mountWithApi(c, () => ["daily"]);
    const event = new MouseEvent("contextmenu");
    api.openContextMenu(may25, event);

    expect(workspace.fileMenuCalls).toEqual([{ path: dailyPath, event }]);
  });

  it("shows a chooser menu when multiple entries exist at the same anchor", async () => {
    const { c, index } = buildHarness();
    index.register({ journalName: "daily", anchor: may25.anchor.toAnchor(), path: dailyPath });
    const secondPath = "Daily2/2026-05-25.md" as VaultPath;
    index.register({ journalName: "secondary", anchor: may25.anchor.toAnchor(), path: secondPath });
    const { api } = mountWithApi(c, () => ["daily", "secondary"]);
    const { __testing } = await import("obsidian");
    __testing.reset();

    api.openContextMenu(may25, new MouseEvent("contextmenu"));

    const menu = __testing.lastOpenMenu();
    expect(menu.items.map((i) => i.title)).toEqual([dailyPath, secondPath]);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm run test -- src/notes-calendar/use-notes-cell.test.ts`
Expected: FAIL — `openContextMenu` is currently a no-op so 1-path and N-path tests fail.

- [ ] **Step 3: Implement `openContextMenu`**

In `src/notes-calendar/use-notes-cell.ts`:

a) Add the `Menu` import at the top (alongside any other obsidian imports — there are none yet, so add a fresh line):

```ts
import { Menu } from "obsidian";
```

b) Replace the placeholder `openContextMenu` with:

```ts
const openContextMenu = (period: Period, event: MouseEvent): void => {
  const paths = existingPathsAt(period);
  if (paths.length === 0) return;
  if (paths.length === 1) {
    workspace.openFileMenu(paths[0] as VaultPath, event);
    return;
  }
  const menu = new Menu();
  for (const path of paths) {
    menu.addItem((item) => {
      item.setTitle(path).onClick(() => workspace.openFileMenu(path as VaultPath, event));
    });
  }
  menu.showAtMouseEvent(event);
};
```

c) Add `VaultPath` to the host import line:

```ts
import { defineOpenMode, WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
```

d) Change `existingPathsAt`'s return type to be `string[]` (already is) — no change needed; the cast in `openFileMenu(paths[0] as VaultPath, event)` handles the branding gap. If preferred, change `existingPathsAt` to return `readonly VaultPath[]` directly: the index entries already hold `VaultPath`, so push `opt.value.path` without coercion.

e) Remove the `void workspace; void existingPathsAt;` placeholder.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test -- src/notes-calendar/use-notes-cell.test.ts`
Expected: PASS — three `openContextMenu` tests now green; everything else stays green.

- [ ] **Step 5: Run full quality gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/notes-calendar/use-notes-cell.ts src/notes-calendar/use-notes-cell.test.ts
git commit -m "feat(notes-calendar): implement useNotesCell.openContextMenu"
```

---

### Task 4.3: Implement `openPreview` with cmd/ctrl gating

**Files:**

- Modify: `src/notes-calendar/use-notes-cell.ts`
- Modify: `src/notes-calendar/use-notes-cell.test.ts`

- [ ] **Step 1: Append failing tests**

```ts
describe("openPreview", () => {
  it("does nothing when no modifier key is held", () => {
    const { c, workspace, index } = buildHarness();
    index.register({ journalName: "daily", anchor: may25.anchor.toAnchor(), path: dailyPath });
    const { api } = mountWithApi(c, () => ["daily"]);
    api.openPreview(may25, new MouseEvent("mouseenter"));
    expect(workspace.hoverPreviewCalls).toEqual([]);
  });

  it("does nothing when no existing entry is present even with ctrl held", () => {
    const { c, workspace } = buildHarness();
    const { api } = mountWithApi(c, () => ["daily"]);
    api.openPreview(may25, new MouseEvent("mouseenter", { ctrlKey: true }));
    expect(workspace.hoverPreviewCalls).toEqual([]);
  });

  it("invokes triggerHoverPreview with the first existing path when ctrl is held", () => {
    const { c, workspace, index } = buildHarness();
    index.register({ journalName: "daily", anchor: may25.anchor.toAnchor(), path: dailyPath });
    const { api } = mountWithApi(c, () => ["daily"]);
    const event = new MouseEvent("mouseenter", { ctrlKey: true });
    api.openPreview(may25, event);
    expect(workspace.hoverPreviewCalls).toEqual([{ path: dailyPath, event }]);
  });

  it("invokes triggerHoverPreview when meta is held", () => {
    const { c, workspace, index } = buildHarness();
    index.register({ journalName: "daily", anchor: may25.anchor.toAnchor(), path: dailyPath });
    const { api } = mountWithApi(c, () => ["daily"]);
    api.openPreview(may25, new MouseEvent("mouseenter", { metaKey: true }));
    expect(workspace.hoverPreviewCalls).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm run test -- src/notes-calendar/use-notes-cell.test.ts`
Expected: FAIL — `openPreview` is still a no-op.

- [ ] **Step 3: Implement `openPreview`**

In `src/notes-calendar/use-notes-cell.ts`, replace the placeholder `openPreview` with:

```ts
const openPreview = (period: Period, event: MouseEvent): void => {
  if (!event.ctrlKey && !event.metaKey) return;
  const paths = existingPathsAt(period);
  if (paths.length === 0) return;
  workspace.triggerHoverPreview(paths[0] as VaultPath, event);
};
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test -- src/notes-calendar/use-notes-cell.test.ts`
Expected: PASS — all four `openPreview` tests green.

- [ ] **Step 5: Run full quality gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 6: Export from the feature barrel**

In `src/notes-calendar/index.ts`, add:

```ts
export { useNotesCell, type NotesCellApi } from "./use-notes-cell";
```

- [ ] **Step 7: Commit**

```bash
git add src/notes-calendar/use-notes-cell.ts src/notes-calendar/use-notes-cell.test.ts src/notes-calendar/index.ts
git commit -m "feat(notes-calendar): implement useNotesCell.openPreview"
```

---

## Phase 5 — `NotesCalendarCell.vue`

### Task 5.1: Implement the SFC

**Files:**

- Create: `src/notes-calendar/ui/NotesCalendarCell.vue`
- Create: `src/notes-calendar/ui/NotesCalendarCell.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/notes-calendar/ui/NotesCalendarCell.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DayPeriod } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";
import type { Period } from "@/calendar";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";

import type { NotesCellApi } from "../use-notes-cell";

import NotesCalendarCell from "./NotesCalendarCell.vue";

function stubApi(overrides: Partial<NotesCellApi> = {}): NotesCellApi {
  return {
    open: vi.fn(),
    openContextMenu: vi.fn(),
    openPreview: vi.fn(),
    isActive: () => false,
    isActionable: () => true,
    ...overrides,
  };
}

function mount(props: { period: Period; cell: NotesCellApi; format?: string }) {
  const c = new Container();
  return render(NotesCalendarCell, {
    props,
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, c);
          },
        },
      ],
    },
  });
}

const may25 = DayPeriod.containing(date("2026-05-25"));

describe("NotesCalendarCell", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
    cleanup();
  });

  describe("label", () => {
    it("renders the period formatted with the default pattern when format prop is absent", () => {
      mount({ period: may25, cell: stubApi() });
      expect(screen.getByText("25")).toBeTruthy();
    });

    it("respects an explicit format prop", () => {
      mount({ period: may25, cell: stubApi(), format: "YYYY-MM-DD" });
      expect(screen.getByText("2026-05-25")).toBeTruthy();
    });
  });

  describe("data attributes", () => {
    it("renders data-active when the cell reports active", () => {
      const { container } = mount({
        period: may25,
        cell: stubApi({ isActive: () => true }),
      });
      const cell = container.querySelector(".notes-calendar-cell");
      expect(cell?.getAttribute("data-active")).toBe("true");
    });

    it("omits data-active when the cell reports inactive", () => {
      const { container } = mount({ period: may25, cell: stubApi() });
      const cell = container.querySelector(".notes-calendar-cell");
      expect(cell?.hasAttribute("data-active")).toBe(false);
    });

    it("renders data-inactive when the cell reports not actionable", () => {
      const { container } = mount({
        period: may25,
        cell: stubApi({ isActionable: () => false }),
      });
      const cell = container.querySelector(".notes-calendar-cell");
      expect(cell?.getAttribute("data-inactive")).toBe("true");
    });
  });

  describe("event handlers", () => {
    it("invokes cell.openContextMenu and prevents the browser default on contextmenu", async () => {
      const openContextMenu = vi.fn();
      const { container } = mount({ period: may25, cell: stubApi({ openContextMenu }) });
      const cell = container.querySelector(".notes-calendar-cell") as HTMLElement;
      const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
      cell.dispatchEvent(event);
      expect(openContextMenu).toHaveBeenCalledWith(may25, event);
      expect(event.defaultPrevented).toBe(true);
    });

    it("invokes cell.openPreview on mouseenter", async () => {
      const openPreview = vi.fn();
      const { container } = mount({ period: may25, cell: stubApi({ openPreview }) });
      const cell = container.querySelector(".notes-calendar-cell") as HTMLElement;
      await userEvent.hover(cell);
      expect(openPreview).toHaveBeenCalled();
      const [calledPeriod, calledEvent] = openPreview.mock.calls[0];
      expect(calledPeriod).toBe(may25);
      expect(calledEvent).toBeInstanceOf(MouseEvent);
    });
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm run test -- src/notes-calendar/ui/NotesCalendarCell.test.ts`
Expected: FAIL — `Cannot find module './NotesCalendarCell.vue'`.

- [ ] **Step 3: Write the SFC**

`src/notes-calendar/ui/NotesCalendarCell.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";

import type { Period } from "@/calendar";
import { CellDecoration } from "@/decorations";

import { defaultFormatPattern } from "../cell-format";

import type { NotesCellApi } from "../use-notes-cell";

const props = defineProps<{
  period: Period;
  cell: NotesCellApi;
  format?: string;
}>();

const label = computed(() => props.period.format(props.format ?? defaultFormatPattern(props.period.kind)));
const isActive = computed(() => props.cell.isActive(props.period));
const isInactive = computed(() => !props.cell.isActionable(props.period));
</script>

<template>
  <span
    class="notes-calendar-cell"
    :data-active="isActive || null"
    :data-inactive="isInactive || null"
    @contextmenu.prevent="cell.openContextMenu(period, $event)"
    @mouseenter="cell.openPreview(period, $event)"
  >
    <CellDecoration :period="period">{{ label }}</CellDecoration>
  </span>
</template>
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test -- src/notes-calendar/ui/NotesCalendarCell.test.ts`
Expected: PASS.

- [ ] **Step 5: Export from the feature barrel**

In `src/notes-calendar/index.ts`, add:

```ts
export { default as NotesCalendarCell } from "./ui/NotesCalendarCell.vue";
```

- [ ] **Step 6: Run full quality gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/notes-calendar/ui/NotesCalendarCell.vue src/notes-calendar/ui/NotesCalendarCell.test.ts src/notes-calendar/index.ts
git commit -m "feat(notes-calendar): add NotesCalendarCell SFC"
```

---

## Phase 6 — Calendar primitives: pass MouseEvent through `select`

The five `Calendar*View` SFCs already expose the `cell` scoped slot. The only structural change in this phase is the `select` emit signature: `[Period]` → `[Period, MouseEvent]`. `DatePickerModal` is the only existing consumer.

### Task 6.1: Update `CalendarMonthView` (and its test) to pass the click event

**Files:**

- Modify: `src/calendar/ui/CalendarMonthView.vue`
- Modify: `src/calendar/ui/CalendarMonthView.test.ts`

- [ ] **Step 1: Adapt the existing `emit` test to assert on the new tuple**

In `src/calendar/ui/CalendarMonthView.test.ts`, replace the body of `it("emits select with the clicked day's DayPeriod", ...)` (around line 67) with:

```ts
it("emits select with the clicked day's DayPeriod and the MouseEvent", async () => {
  const outerPeriod = MonthPeriod.containing(date("2024-05-15"));
  const { emitted } = mount({ outerPeriod, selected: null });

  const targetCell = screen.getAllByTestId("month-cell").find((c) => c.dataset.anchor === "2024-05-07")!;
  await userEvent.click(targetCell);

  const events = emitted<[DayPeriod, MouseEvent]>("select");
  expect(events).toHaveLength(1);
  expect(events[0][0].start.toAnchor()).toBe("2024-05-07");
  expect(events[0][1]).toBeInstanceOf(MouseEvent);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm run test -- src/calendar/ui/CalendarMonthView.test.ts`
Expected: FAIL — `events[0][1]` is `undefined` because the second argument isn't emitted yet.

- [ ] **Step 3: Update the SFC**

In `src/calendar/ui/CalendarMonthView.vue`:

a) Change the emit type (around line 18):

```ts
const emit = defineEmits<{ select: [cell: DayPeriod, event: MouseEvent] }>();
```

b) Change the click handler to pass `$event` (around line 60):

```vue
<UiButton
  v-for="cell in grid"
  :key="cell.key"
  data-testid="month-cell"
  :data-anchor="cell.period.start.toAnchor()"
  :data-selected="cell.isSelected || null"
  :data-outside="cell.isOutside || null"
  :data-today="cell.isToday || null"
  :disabled="cell.isDisabled"
  @click="emit('select', cell.period as DayPeriod, $event)"
>
  <slot name="cell" :period="cell.period" :label="cell.label">{{ cell.label }}</slot>
</UiButton>
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm run test -- src/calendar/ui/CalendarMonthView.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/calendar/ui/CalendarMonthView.vue src/calendar/ui/CalendarMonthView.test.ts
git commit -m "feat(calendar): pass MouseEvent through CalendarMonthView select emit"
```

---

### Task 6.2: Update the remaining four `Calendar*View` SFCs and their tests

**Files:**

- Modify: `src/calendar/ui/CalendarWeekView.vue`, `CalendarQuarterView.vue`, `CalendarYearView.vue`, `CalendarDecadeView.vue`
- Modify: matching `*.test.ts` files

- [ ] **Step 1: Repeat 6.1's transformation for each remaining view**

For each of `CalendarWeekView.vue`, `CalendarQuarterView.vue`, `CalendarYearView.vue`, `CalendarDecadeView.vue`:

a) Change the `defineEmits<{ select: [cell: <Period>] }>()` to `defineEmits<{ select: [cell: <Period>, event: MouseEvent] }>()` (the period type varies — preserve whichever is already there).

b) Change the click handler to pass `$event`: `@click="emit('select', cell.period as <Period>, $event)"`.

c) In the corresponding `*.test.ts`, find any `emitted<[<Period>]>("select")` and change to `emitted<[<Period>, MouseEvent]>("select")`. Assert `events[0][1]` is a `MouseEvent` only in tests that already touch the second arg; leave others using `events[0][0]`.

- [ ] **Step 2: Run the affected tests**

Run: `npm run test -- src/calendar/ui/`
Expected: PASS — every `Calendar*View.test.ts` green.

- [ ] **Step 3: Run full quality gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: PASS — type errors from this change should now bubble up in `DatePickerModal.vue` only if the callback signature doesn't accept the extra arg. Vue's emit-handler arity is lenient, but a strict tsc check on `onCellSelect: (cell: Period) => void` could complain when invoked with `(Period, MouseEvent)`. If so, proceed to 6.3 first.

- [ ] **Step 4: Commit**

```bash
git add src/calendar/ui/
git commit -m "feat(calendar): pass MouseEvent through all Calendar*View select emits"
```

---

### Task 6.3: Update `DatePickerModal.onCellSelect` to accept (and ignore) the second arg

**Files:**

- Modify: `src/calendar/ui/DatePickerModal.vue`

- [ ] **Step 1: Update the signature**

In `src/calendar/ui/DatePickerModal.vue`, line 112, change:

```ts
function onCellSelect(cell: Period): void {
```

to:

```ts
function onCellSelect(cell: Period, _event: MouseEvent): void {
```

No other change — the function body stays identical.

- [ ] **Step 2: Run the DatePickerModal tests**

Run: `npm run test -- src/calendar/ui/DatePickerModal.test.ts`
Expected: PASS — behavior unchanged, signature now matches the emit.

- [ ] **Step 3: Run full quality gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/calendar/ui/DatePickerModal.vue
git commit -m "fix(calendar): accept MouseEvent in DatePickerModal cell handler"
```

---

## Phase 7 — Final verification

### Task 7.1: Full suite + lint + types

- [ ] **Step 1: Run every gate from scratch**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: PASS — full suite green.

- [ ] **Step 2: Confirm the new feature is reachable through its barrel**

Run: `cat src/notes-calendar/index.ts`
Expected output contains all of:

```
export { ActiveEntryViewModel, type ActiveEntryRef } from "./active-entry";
export { defaultFormatPattern } from "./cell-format";
export { notesCalendarModule } from "./module";
export { useShelfScope, type ShelfScope } from "./use-shelf-scope";
export { useNotesCell, type NotesCellApi } from "./use-notes-cell";
export { default as NotesCalendarCell } from "./ui/NotesCalendarCell.vue";
```

- [ ] **Step 3: Confirm `main.ts` registers the module**

Run: `grep -n "notesCalendarModule" src/main.ts`
Expected: one import line and one `container.addModule(notesCalendarModule)` line, the latter right after `decorationsModule`.

- [ ] **Step 4: No new feature-level commits — verification only**

If steps 1–3 all pass, the plan is complete. No new commit; everything is already on the branch.

---

## Definition of done

- `npm run test`, `npm run check:types`, `npm run check:lint` all clean.
- `DatePickerModal` and all `Calendar*View` tests stay green after the emit-signature change.
- New `notes-calendar` tests cover `ActiveEntryViewModel`, `useShelfScope`, `useNotesCell`, `cell-format`, `NotesCalendarCell`.
- `WorkspaceService` tests cover `triggerHoverPreview` and `openFileMenu` (the missing-file no-op branch included).
- `notesCalendarModule` registered in `main.ts` after `decorationsModule`.
- No regressions in any pre-existing decoration-engine test (the decorations feature is untouched).
