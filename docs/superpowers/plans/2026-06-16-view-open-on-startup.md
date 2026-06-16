# View "open on startup" toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-view `openOnStartup` toggle (default on for the seeded calendar view) that auto-opens a journal view on app launch and opens it immediately when the toggle is switched on.

**Architecture:** A new optional boolean on the `View` schema (no migration). `ViewHostService` gains a public, idempotent `open(id)` (dedupes against an already-restored leaf) and an `initialize()` that opens opted-in views on `onLayoutReady` at a genuine app launch. The settings subpage gets a toggle whose setter persists and opens immediately.

**Tech Stack:** TypeScript, valibot, Vue 3 SFC, vitest, @testing-library/vue, WebdriverIO (e2e), Obsidian plugin API, paraglide i18n.

**Conventions (from this repo — follow exactly):**

- Quality gates after each task: `npm run test`, `npm run check:types`, `npm run check:lint`.
- One behaviour per test; subject+verb test names; nested `describe`s; black-box assertions; never test fakes/mocks directly; colocate `*.test.ts` with implementation.
- Commit after each green task. **No** `Co-Authored-By` trailer. Commit to the current branch (`v3-ai`); do **not** branch.

---

## File structure

| File                                          | Change                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| `src/views/config.ts`                         | Add `openOnStartup` to `viewSchema` + collection factory default `false` |
| `src/views/default-view.ts`                   | `openOnStartup: true` on the seeded calendar view                        |
| `src/views/service.ts`                        | Add `openOnStartup` to `update`'s patch `Pick`                           |
| `src/views/view-host.ts`                      | Promote `#open` → public idempotent `open`; add `initialize()`           |
| `src/main.ts`                                 | Call `ViewHostService.initialize()` at boot                              |
| `src/infrastructure/host/internal/testing.ts` | Fake host: layout-ready support + view-leaf tracking (test infra)        |
| `src/views/ui/ViewEditSubpage.vue`            | Toggle row + computed setter that opens on enable                        |
| `messages/en.json`                            | New `view_edit_open_on_startup_label` message                            |
| `e2e/fixtures/e2e-startup-view/...`           | New fixture vault with an opted-in view                                  |
| `e2e/journeys/startup-view.e2e.ts`            | New startup auto-open e2e                                                |
| `*.test.ts` (colocated)                       | Updated unit/component tests                                             |

---

## Task 1: Data model — `openOnStartup` field, defaults, and update patch

**Files:**

- Modify: `src/views/config.ts`
- Modify: `src/views/default-view.ts`
- Modify: `src/views/service.ts:77-80` (the `update` patch type)
- Test: `src/views/config.test.ts`, `src/views/default-view.test.ts`, `src/views/service.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/views/config.test.ts`, add inside the `describe("default", ...)` block:

```ts
it("seeds openOnStartup as false", () => {
  const seed = viewsCollection.defaultItem("abc");
  expect(seed.openOnStartup).toBe(false);
});
```

And add a new sibling block after `describe("viewSchema validation", ...)`:

```ts
describe("openOnStartup back-compat", () => {
  it("defaults openOnStartup to false when the stored field is absent", () => {
    const { openOnStartup: _omit, ...withoutField } = viewsCollection.defaultItem(
      "3f8c8b7e-1c1a-4d5e-9b9b-1c1a4d5e9b9b",
    );
    const result = v.safeParse(viewSchema, withoutField);
    expect(result.success && result.output.openOnStartup).toBe(false);
  });
});
```

In `src/views/default-view.test.ts`, add a test asserting the seeded view opts in (place it beside the existing assertions on `defaultCalendarView()`):

```ts
it("opts the default calendar view into open-on-startup", () => {
  expect(defaultCalendarView().openOnStartup).toBe(true);
});
```

In `src/views/service.test.ts`, add inside `describe("update", ...)`:

```ts
it("persists openOnStartup through a patch", async () => {
  const { service, repo } = build();
  const created = await service.create({ name: "V" });
  expectOk(created);
  const result = await service.update(created.value, { openOnStartup: true });
  expectOk(result);
  expect(repo.get(created.value).match({ some: (v) => v.openOnStartup, none: () => null })).toBe(true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/views/config.test.ts src/views/default-view.test.ts src/views/service.test.ts`
Expected: FAIL — `openOnStartup` is `undefined` / not a valid patch key.

- [ ] **Step 3: Add the schema field and defaults**

In `src/views/config.ts`, add the field to `viewSchema` (after `leaf`):

```ts
export const viewSchema = v.object({
  id: viewIdSchema,
  name: v.pipe(v.string(), v.minLength(1)),
  icon: v.pipe(v.string(), v.minLength(1)),
  defaultShelf: v.nullable(v.string()),
  showInRibbon: v.boolean(),
  leaf: v.optional(v.picklist(["left", "right", "tab"]), "right"),
  openOnStartup: v.optional(v.boolean(), false),
  blocks: v.array(viewBlockInstanceSchema),
});
```

And add `openOnStartup: false` to the `viewsCollection` factory default object (alongside `leaf: "right" as const`):

```ts
  (id) => ({
    id: id as ViewId,
    name: id,
    icon: "calendar-days",
    defaultShelf: null,
    showInRibbon: false,
    leaf: "right" as const,
    openOnStartup: false,
    blocks: [],
  }),
```

- [ ] **Step 4: Set the seeded view to opt in**

In `src/views/default-view.ts`, add `openOnStartup: true` to the object returned by `defaultCalendarView()` (next to `leaf: "right"`):

```ts
    defaultShelf: null,
    showInRibbon: true,
    leaf: "right",
    openOnStartup: true,
    blocks: [
```

- [ ] **Step 5: Allow the field in the service update patch**

In `src/views/service.ts`, extend the `update` patch type (line ~79):

```ts
  update(
    id: ViewId,
    patch: Partial<Pick<View, "name" | "icon" | "defaultShelf" | "showInRibbon" | "leaf" | "openOnStartup">>,
  ): AsyncResult<void, UnknownViewError | ViewsLifecycleError> {
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test -- src/views/config.test.ts src/views/default-view.test.ts src/views/service.test.ts`
Expected: PASS

- [ ] **Step 7: Quality gates + commit**

```bash
npm run check:types && npm run check:lint
git add src/views/config.ts src/views/config.test.ts src/views/default-view.ts src/views/default-view.test.ts src/views/service.ts src/views/service.test.ts
git commit -m "feat(views): add openOnStartup field, default on for calendar view"
```

---

## Task 2: Idempotent `ViewHostService.open(id)`

Make opening a view dedupe against an already-open leaf of that type, so startup (and repeated commands) never stack duplicate leaves. This needs the fake host to track view leaves created via `setViewState`.

**Files:**

- Modify: `src/infrastructure/host/internal/testing.ts` (fake host — test infra, no direct tests)
- Modify: `src/views/view-host.ts`
- Test: `src/views/view-host.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/views/view-host.test.ts`, add a new block after `describe("open placement", ...)`:

```ts
describe("open dedupe", () => {
  it("reveals the existing leaf instead of opening a second one", async () => {
    const { host } = build({ a: seedView("a", { leaf: "right" }) });
    openVia(host, "a");
    await Promise.resolve();
    openVia(host, "a");
    await Promise.resolve();
    expect(host.workspace.viewStateCalls).toEqual([{ type: "journal-view:a", placement: "right" }]);
  });
});
```

(The first open records one `setViewState`; the second must find the existing leaf and reveal it, leaving `viewStateCalls` at length 1.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/views/view-host.test.ts`
Expected: FAIL — `viewStateCalls` has length 2 (a second leaf was opened).

- [ ] **Step 3: Teach the fake host to track view leaves by type**

In `src/infrastructure/host/internal/testing.ts`:

Add a tracking map near the other workspace collections inside `createFakeHost` (next to `const registeredViews = ...`):

```ts
const viewLeavesByType = new Map<string, unknown[]>();
```

In `makeLeaf`, register the leaf under its view type when `setViewState` is called:

```ts
function makeLeaf(placement: "left" | "right" | "tab", openMode: PaneType | false = false) {
  const leaf = {
    async openFile(file: TFile): Promise<void> {
      workspaceState.openPaths.add(file.path);
      workspaceState.openCalls.push({ path: file.path, mode: openMode });
      workspaceState.activeFile = file;
    },
    async setViewState(state: { type: string }): Promise<void> {
      workspaceState.viewStateCalls.push({ type: state.type, placement });
      const leaves = viewLeavesByType.get(state.type) ?? [];
      leaves.push(leaf);
      viewLeavesByType.set(state.type, leaves);
    },
  };
  return leaf;
}
```

Make `getLeavesOfType` return tracked view leaves for view types, falling back to the existing note-path behaviour for everything else:

```ts
    getLeavesOfType(type: string): { view: { file: TFile | null }; openFile: () => Promise<undefined> }[] {
      const tracked = viewLeavesByType.get(type);
      if (tracked) return tracked as { view: { file: TFile | null }; openFile: () => Promise<undefined> }[];
      return [...workspaceState.openPaths].map((path) => ({
        view: { file: fileObjects.get(path) ?? null },
        openFile: async () => undefined,
      }));
    },
```

When a view type is detached, drop its tracked leaves so dedupe state matches reality. In `detachLeavesOfType`:

```ts
    detachLeavesOfType(type: string): void {
      workspaceState.detachedTypes.push(type);
      viewLeavesByType.delete(type);
    },
```

- [ ] **Step 4: Make `open` dedupe**

In `src/views/view-host.ts`, replace the private `#open` with a public `open` that checks for an existing leaf first:

```ts
  async open(id: ViewId): Promise<void> {
    const viewType = viewTypeOf(id);
    const [existing] = this.#app.workspace.getLeavesOfType(viewType);
    if (existing) {
      await this.#app.workspace.revealLeaf(existing);
      return;
    }
    const view = this.#getView(id);
    const leaf = this.#leafFor(view?.leaf ?? "right");
    await leaf.setViewState({ type: viewType, active: true });
    await this.#app.workspace.revealLeaf(leaf);
  }
```

Repoint the command descriptor at the public method (in `#commandDescriptorFor`):

```ts
      execute: () => void this.open(id),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test -- src/views/view-host.test.ts`
Expected: PASS (dedupe test plus all existing open-placement tests still green).

- [ ] **Step 6: Quality gates + commit**

```bash
npm run check:types && npm run check:lint
git add src/views/view-host.ts src/views/view-host.test.ts src/infrastructure/host/internal/testing.ts
git commit -m "feat(views): make ViewHostService.open idempotent"
```

---

## Task 3: Startup auto-open via `initialize()`

Open every opted-in view on `onLayoutReady`, but only on a genuine app launch (layout not yet ready when `initialize` runs).

**Files:**

- Modify: `src/infrastructure/host/internal/testing.ts` (fake host — layout-ready support)
- Modify: `src/views/view-host.ts`
- Modify: `src/main.ts`
- Test: `src/views/view-host.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/views/view-host.test.ts`, add a new block after `describe("open dedupe", ...)`:

```ts
describe("initialize", () => {
  it("opens an opted-in view once layout becomes ready at launch", async () => {
    const { service, host } = build({ a: seedView("a", { openOnStartup: true }) });
    host.workspace.layoutReady = false;
    service.initialize();
    host.setLayoutReady();
    await Promise.resolve();
    expect(host.workspace.viewStateCalls).toEqual([{ type: "journal-view:a", placement: "right" }]);
  });

  it("does not open a view that has not opted in", async () => {
    const { service, host } = build({ a: seedView("a", { openOnStartup: false }) });
    host.workspace.layoutReady = false;
    service.initialize();
    host.setLayoutReady();
    await Promise.resolve();
    expect(host.workspace.viewStateCalls).toEqual([]);
  });

  it("does not open views when layout was already ready before initialize", async () => {
    const { service, host } = build({ a: seedView("a", { openOnStartup: true }) });
    host.workspace.layoutReady = true;
    service.initialize();
    await Promise.resolve();
    expect(host.workspace.viewStateCalls).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/views/view-host.test.ts`
Expected: FAIL — `service.initialize` is not a function / `host.setLayoutReady` is not a function.

- [ ] **Step 3: Add layout-ready support to the fake host**

In `src/infrastructure/host/internal/testing.ts`:

Add `layoutReady` to `FakeWorkspaceState`:

```ts
export interface FakeWorkspaceState {
  activeFile: TFile | null;
  openPaths: Set<string>;
  openCalls: { path: string; mode: PaneType | false }[];
  triggerCalls: { event: string; arguments_: unknown[] }[];
  detachedTypes: string[];
  viewStateCalls: { type: string; placement: "left" | "right" | "tab" }[];
  sidebarLeafAvailable: boolean;
  saveLayoutCalls: number;
  layoutReady: boolean;
}
```

Initialise it in `workspaceState` (default `true` so existing tests are unaffected):

```ts
const workspaceState: FakeWorkspaceState = {
  activeFile: null,
  openPaths: new Set(),
  openCalls: [],
  triggerCalls: [],
  detachedTypes: [],
  viewStateCalls: [],
  sidebarLeafAvailable: true,
  saveLayoutCalls: 0,
  layoutReady: true,
};
```

Add a queue for layout-ready callbacks beside `const unloadCallbacks: (() => void)[] = [];`:

```ts
const layoutReadyCallbacks: (() => void)[] = [];
```

Add `layoutReady` (getter) and `onLayoutReady` to `workspaceApi`:

```ts
    get layoutReady(): boolean {
      return workspaceState.layoutReady;
    },
    onLayoutReady(callback: () => void): void {
      if (workspaceState.layoutReady) callback();
      else layoutReadyCallbacks.push(callback);
    },
```

Add `setLayoutReady` to the `FakeHost` interface (near `triggerUnload`):

```ts
  triggerUnload(): void;
  setLayoutReady(): void;
```

And implement it in the returned object (next to `triggerUnload`):

```ts
    setLayoutReady(): void {
      workspaceState.layoutReady = true;
      const callbacks = [...layoutReadyCallbacks];
      layoutReadyCallbacks.length = 0;
      for (const callback of callbacks) callback();
    },
```

- [ ] **Step 4: Implement `initialize`**

In `src/views/view-host.ts`, add the method (place it just after `dispose`):

```ts
  initialize(): void {
    const appStartup = !this.#app.workspace.layoutReady;
    this.#app.workspace.onLayoutReady(() => {
      if (!appStartup) return;
      void this.#openStartupViews();
    });
  }

  async #openStartupViews(): Promise<void> {
    for (const [id, view] of this.#repo.find().entries()) {
      if (!view.openOnStartup) continue;
      try {
        await this.open(id);
      } catch (error) {
        this.#logger.error("failed to open view on startup", { id, error });
      }
    }
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test -- src/views/view-host.test.ts`
Expected: PASS

- [ ] **Step 6: Wire `initialize()` at boot**

In `src/main.ts`, resolve and call `ViewHostService.initialize()` alongside the other boot `.initialize()` calls. Add the import (`ViewHostService` is exported from `@/views`) and the call after `StartupOpenService` (line ~71):

```ts
await container.resolve(StartupOpenService).initialize();
container.resolve(ViewHostService).initialize();
```

Add to the imports at the top of `main.ts`:

```ts
import { ViewHostService } from "@/views";
```

Verify the exact existing import grouping and match it; if `@/views` is already imported, add `ViewHostService` to that import instead of a new line.

- [ ] **Step 7: Quality gates + commit**

```bash
npm run test -- src/views/view-host.test.ts
npm run check:types && npm run check:lint
git add src/views/view-host.ts src/views/view-host.test.ts src/infrastructure/host/internal/testing.ts src/main.ts
git commit -m "feat(views): auto-open opted-in views on startup"
```

---

## Task 4: Settings toggle that opens on enable

**Files:**

- Modify: `messages/en.json`
- Modify: `src/views/ui/ViewEditSubpage.vue`
- Modify: `src/views/ui/ViewEditSubpage.test.ts`

- [ ] **Step 1: Add the i18n message and compile**

In `messages/en.json`, add next to the other `view_edit_*` keys:

```json
  "view_edit_open_on_startup_label": "Open on startup",
```

Then regenerate the paraglide accessors:

Run: `npm run compile:i18n`
Expected: `m.view_edit_open_on_startup_label` becomes available from `@/i18n`.

- [ ] **Step 2: Write the failing component tests**

First make `ViewHostService` available to the component under test. In `src/views/ui/ViewEditSubpage.test.ts`, import it and register a spy in `setup()`:

Add to imports:

```ts
import { ViewHostService } from "../view-host";
```

Change the `setup()` signature to seed an optional view override and register a fake `ViewHostService`, returning the spy:

```ts
async function setup(viewOverrides: Record<string, unknown> = {}) {
  const raw = {
    version: 4,
    views: {
      [viewId]: {
        id: viewId,
        name: "Weekly",
        icon: "calendar-days",
        defaultShelf: null,
        showInRibbon: false,
        blocks: [],
        ...viewOverrides,
      },
    },
    shelves: { Personal: { name: "Personal", journals: [] } },
  };
  const { service: settings, container } = createSettingsService({
    collections: [viewsCollection, shelvesCollection],
    raw,
  });
  await settings.initialize();
  const open = vi.fn();
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container.register(InputSuggestService).useValue(new FakeInputSuggestService() as unknown as InputSuggestService);
  container.register(ViewsEventsToken).useFactory(() => createNanoEvents());
  container.register(ShelvesEventsToken).useFactory(() => createNanoEvents());
  container.register(ViewsRepository).useClass(ViewsRepository);
  container.register(ShelvesRepository).useClass(ShelvesRepository);
  container.register(ToolbarItemsService).useClass(ToolbarItemsService);
  container.register(ViewsService).useClass(ViewsService);
  container.register(ViewsViewModel).useClass(ViewsViewModel);
  container.register(ShelvesViewModel).useClass(ShelvesViewModel);
  container.register(Flows).useClass(Flows);
  container.register(ViewHostService).useValue({ open } as unknown as ViewHostService);
  return { container, open };
}
```

(The existing tests call `await setup()` with no args, so they keep working.)

Now add the two behaviour tests inside `describe("ViewEditSubpage", ...)`:

```ts
it("persists openOnStartup when the toggle is switched on", async () => {
  const { container } = await setup();
  mount(container);
  const repo = container.resolve(ViewsRepository);
  const toggle = within(row(m.view_edit_open_on_startup_label())).getByRole("checkbox");
  await userEvent.click(toggle);
  expect(repo.get(viewId).getOr(undefined as never)?.openOnStartup).toBe(true);
});

it("opens the view immediately when the toggle is switched on", async () => {
  const { container, open } = await setup();
  mount(container);
  const toggle = within(row(m.view_edit_open_on_startup_label())).getByRole("checkbox");
  await userEvent.click(toggle);
  expect(open).toHaveBeenCalledWith(viewId);
});

it("does not open the view when the toggle is switched off", async () => {
  const { container, open } = await setup({ openOnStartup: true });
  mount(container);
  const toggle = within(row(m.view_edit_open_on_startup_label())).getByRole("checkbox");
  await userEvent.click(toggle);
  expect(open).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test -- src/views/ui/ViewEditSubpage.test.ts`
Expected: FAIL — no row with that label / `open` never called.

- [ ] **Step 4: Add the toggle to the SFC**

In `src/views/ui/ViewEditSubpage.vue`, import and resolve `ViewHostService` in the `<script setup>` block (next to the other `useService` calls):

```ts
import { ViewHostService } from "../view-host";
```

```ts
const viewHost = useService(ViewHostService);
```

Add the computed beside `leafValue`:

```ts
const openOnStartupValue = computed<boolean>({
  get: () => view.value?.openOnStartup ?? false,
  set: (next) => {
    void viewsService.update(viewId, { openOnStartup: next });
    if (next) void viewHost.open(viewId);
  },
});
```

Add the row in the template (after the "Show in ribbon" row):

```vue
<UiSettingRow :name="m.view_edit_open_on_startup_label()">
      <UiToggle v-model="openOnStartupValue" />
    </UiSettingRow>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test -- src/views/ui/ViewEditSubpage.test.ts`
Expected: PASS

- [ ] **Step 6: Quality gates + commit**

```bash
npm run check:types && npm run check:lint
git add messages/en.json src/i18n/paraglide src/views/ui/ViewEditSubpage.vue src/views/ui/ViewEditSubpage.test.ts
git commit -m "feat(views): add open-on-startup toggle to view settings"
```

---

## Task 5: e2e — startup auto-open

A cold-boot e2e that proves the seam the unit suite cannot (Obsidian invoking `onLayoutReady` for a boot-time registrant). Mirrors `e2e/journeys/startup-open.e2e.ts`.

**Files:**

- Create: `e2e/fixtures/e2e-startup-view/.obsidian/plugins/journals/data.json`
- Create: `e2e/journeys/startup-view.e2e.ts`

- [ ] **Step 1: Create the fixture vault data**

Create `e2e/fixtures/e2e-startup-view/.obsidian/plugins/journals/data.json` with one view opted into startup. Use a fixed view id and a minimal month-calendar block so the leaf renders:

```json
{
  "version": 4,
  "views": {
    "c0ffee00-0000-4000-8000-000000000001": {
      "id": "c0ffee00-0000-4000-8000-000000000001",
      "name": "Calendar",
      "icon": "calendar-days",
      "defaultShelf": null,
      "showInRibbon": false,
      "leaf": "right",
      "openOnStartup": true,
      "blocks": [
        {
          "id": "c0ffee00-0000-4000-8000-000000000002",
          "key": "month-calendar",
          "config": { "before": 0, "after": 0, "hiddenWeekdays": [], "weeks": "left" }
        }
      ]
    }
  }
}
```

- [ ] **Step 2: Write the e2e test**

Create `e2e/journeys/startup-view.e2e.ts`:

```ts
import { browser, expect } from "@wdio/globals";

import { waitForState } from "../support/wait.js";

const VIEW_TYPE = "journal-view:c0ffee00-0000-4000-8000-000000000001";

// The startup auto-open seam: ViewHostService.initialize() captures appStartup from
// layoutReady at onload and, on a cold boot (layout not yet ready), opens every view
// with openOnStartup=true on onLayoutReady. A real boot is the only place this runs —
// the mocked unit suite cannot have Obsidian invoke onLayoutReady for a boot registrant.
describe("view open on startup", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-startup-view", plugins: ["journals"] });
  });

  it("opens an opted-in view's leaf on launch", async () => {
    await waitForState(
      async () => browser.executeObsidian(({ app }, type) => app.workspace.getLeavesOfType(type).length, VIEW_TYPE),
      (count) => count > 0,
      "view leaf was not opened on startup",
    );
  });
});
```

`waitForState(read, predicate, timeoutMsg)` and `executeObsidian` forwarding a trailing arg are both confirmed against the existing helpers, so the snippet above runs as written. The spec lives under `e2e/journeys/`, which `wdio.conf.mts` maps to the `journeys` suite.

- [ ] **Step 3: Run the new e2e**

Run: `npm run test:e2e -- --spec ./e2e/journeys/startup-view.e2e.ts`
Expected: PASS — the view leaf exists after boot.

- [ ] **Step 4: Regression-check the existing view e2e**

Because `defaultCalendarView()` now sets `openOnStartup: true`, the seed-backed fixtures `e2e-journeys` and `e2e-daily` (which have no `views` key) will auto-open the calendar on boot. Run the existing view suites:

Run: `npm run test:e2e -- --suite journeys`
Expected: PASS. The idempotent `open` means the ribbon-click path reveals the already-open leaf rather than stacking a new one.

**If a test breaks** because auto-open changed the leaf state: pin the affected fixture to opt out by giving its `data.json` an explicit `views` entry with `"openOnStartup": false`. Because those fixtures currently rely on the seed to provide the default calendar (and its ribbon button), replicate the full default view object from `src/views/default-view.ts` into the fixture with `openOnStartup` set to `false`. Prefer this only for the specific fixture whose test broke.

- [ ] **Step 5: Commit**

```bash
git add e2e/fixtures/e2e-startup-view e2e/journeys/startup-view.e2e.ts
git commit -m "test(views): e2e for view open-on-startup"
```

---

## Final verification

- [ ] Run the full unit suite + gates: `npm run test && npm run check:types && npm run check:lint`
- [ ] Run the e2e suites touched above and confirm green.
- [ ] Manual sanity (optional, via the `run`/`verify` skill): fresh vault → calendar view appears in the right sidebar on launch; toggling "Open on startup" on in an existing view's settings opens it immediately; toggling off does not close it but stops it auto-opening next launch.
