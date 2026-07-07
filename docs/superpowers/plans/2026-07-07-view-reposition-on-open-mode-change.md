# Reposition Open Views on Open-Mode Change — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user changes a journal view's open mode while that view is open, offer (via a confirm modal) to move the open view to the new location right away; the setting always persists regardless.

**Architecture:** `ViewHostService` gains `isOpen(id)` and `reposition(id)` (detach every open leaf of the view type, reopen the same count at the new mode). A `RepositionViewFlow` checks `isOpen`, opens a confirm modal, and on submit calls `reposition`. The `leaf` dropdown setter in `ViewEditSubpage.vue` persists as today, then chains the flow onto the persist's success.

**Tech Stack:** TypeScript, Vue 3 SFCs, valibot config, custom DI (`inject`/`Container`), `attempt.in` Result pipelines, ts-pattern, paraglide i18n (`messages/en.json`), vitest + @testing-library/vue, WDIO e2e.

## Global Constraints

- Quality gates (run before considering any task done): `npm run test`, `npm run check:types`, `npm run check:lint`. This change is runtime-touching → the WDIO e2e in Task 5 is also required.
- No `eslint-disable` comments; fix the code instead.
- Discriminated-union dispatch uses `match().with().exhaustive()` (ts-pattern), never `switch`.
- Every `Error` subclass lives in the feature's `errors.ts`. (This plan adds none — it reuses `UserAborted` and `FlowError`.)
- Only WHY-comments; no WHAT-comments, no spec-reference comments.
- One behavior per test; test names are subject+verb behavior descriptions; assert observable outcomes.
- All `defineModal()` for the views feature live in `src/views/ui/modals.ts`; per-modal def files are forbidden.
- Field-initializer injection: `readonly #x = inject(...)` at declaration.
- Commit to the current branch (`v3-ai`); never create a branch. No `Co-Authored-By` trailer.

---

## File Structure

- `src/views/view-host.ts` — **modify**: add `isOpen`, `reposition`.
- `src/views/view-host.test.ts` — **modify**: add `isOpen` + `reposition` describe blocks.
- `messages/en.json` — **modify**: add 3 messages.
- `src/views/ui/ConfirmRepositionModal.vue` — **create**: confirm modal component.
- `src/views/ui/modals.ts` — **modify**: add `repositionViewModal` + props interface.
- `src/views/flows/reposition-view.flow.ts` — **create**: `RepositionViewFlow`.
- `src/views/flows/reposition-view.flow.test.ts` — **create**: flow unit tests.
- `src/views/ui/ViewEditSubpage.vue` — **modify**: chain flow onto the `leaf` setter.
- `src/views/ui/ViewEditSubpage.test.ts` — **modify**: register fake flow in `setup()`; add wiring test.
- `e2e/journeys/view.e2e.ts` — **modify**: add reposition journey.

---

## Task 1: `ViewHostService.isOpen` + `reposition`

**Files:**

- Modify: `src/views/view-host.ts`
- Test: `src/views/view-host.test.ts`

**Interfaces:**

- Consumes: existing private `#app`, `#getView`, `#leafFor`, module-private `viewTypeOf(id)`.
- Produces:
  - `isOpen(id: ViewId): boolean`
  - `reposition(id: ViewId): Promise<void>` — detaches every open leaf of the view type, then reopens the same number of leaves at the view's current `leaf` setting. No-op when none are open.

- [ ] **Step 1: Write the failing tests**

Append these two `describe` blocks inside the top-level `describe("ViewHostService", ...)` in `src/views/view-host.test.ts` (after the existing `describe("open dedupe", ...)` block). They reuse the file's existing `build`, `seedView`, and `openVia` helpers.

```ts
describe("isOpen", () => {
  it("reports a view with no open leaves as closed", () => {
    const { service } = build({ a: seedView("a") });
    expect(service.isOpen("a" as ViewId)).toBe(false);
  });

  it("reports a view as open once its leaf has been opened", async () => {
    const { service, host } = build({ a: seedView("a") });
    openVia(host, "a");
    await Promise.resolve();
    expect(service.isOpen("a" as ViewId)).toBe(true);
  });
});

describe("reposition", () => {
  it("reopens the view at the newly configured mode after detaching the old leaf", async () => {
    const { service, host, storage } = build({ a: seedView("a", { leaf: "right" }) });
    openVia(host, "a");
    await Promise.resolve();
    storage.a.leaf = "tab";

    await service.reposition("a" as ViewId);

    expect(host.workspace.detachedTypes).toContain("journal-view:a");
    expect(host.workspace.viewStateCalls.at(-1)).toEqual({ type: "journal-view:a", placement: "tab" });
  });

  it("preserves the number of open leaves when repositioning", async () => {
    const { service, host, storage } = build({ a: seedView("a", { leaf: "right" }) });
    await host.app.workspace.getRightLeaf(false)!.setViewState({ type: "journal-view:a" });
    await host.app.workspace.getRightLeaf(false)!.setViewState({ type: "journal-view:a" });
    storage.a.leaf = "tab";
    host.workspace.viewStateCalls.length = 0;

    await service.reposition("a" as ViewId);

    expect(host.workspace.viewStateCalls).toEqual([
      { type: "journal-view:a", placement: "tab" },
      { type: "journal-view:a", placement: "tab" },
    ]);
  });

  it("does nothing when no leaf of the view is open", async () => {
    const { service, host } = build({ a: seedView("a") });
    await service.reposition("a" as ViewId);
    expect(host.workspace.viewStateCalls).toEqual([]);
    expect(host.workspace.detachedTypes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/views/view-host.test.ts`
Expected: FAIL — `service.isOpen is not a function` / `service.reposition is not a function`.

- [ ] **Step 3: Implement `isOpen` and `reposition`**

In `src/views/view-host.ts`, add both methods to `ViewHostService` (place them right after the existing `async open(...)` method, before the closing brace of the class):

```ts
  isOpen(id: ViewId): boolean {
    return this.#app.workspace.getLeavesOfType(viewTypeOf(id)).length > 0;
  }

  async reposition(id: ViewId): Promise<void> {
    const viewType = viewTypeOf(id);
    const count = this.#app.workspace.getLeavesOfType(viewType).length;
    if (count === 0) return;
    this.#app.workspace.detachLeavesOfType(viewType);
    const view = this.#getView(id);
    for (let index = 0; index < count; index++) {
      const leaf = this.#leafFor(view?.leaf ?? "right");
      await leaf.setViewState({ type: viewType, active: true });
      await this.#app.workspace.revealLeaf(leaf);
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/views/view-host.test.ts`
Expected: PASS (all `isOpen` and `reposition` tests green).

- [ ] **Step 5: Type + lint check**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/views/view-host.ts src/views/view-host.test.ts
git commit -m "feat(views): add view-host isOpen and reposition"
```

---

## Task 2: Reposition confirm modal + `RepositionViewFlow`

**Files:**

- Modify: `messages/en.json`
- Create: `src/views/ui/ConfirmRepositionModal.vue`
- Modify: `src/views/ui/modals.ts`
- Create: `src/views/flows/reposition-view.flow.ts`
- Test: `src/views/flows/reposition-view.flow.test.ts`

**Interfaces:**

- Consumes: `ViewHostService.isOpen` / `reposition` (Task 1); `ModalService.open`; `ViewsViewModel.getView(id): Option<View>`; `UserAborted` from `@/infrastructure/flows`.
- Produces:
  - `repositionViewModal` — `ModalDefinition<RepositionViewModalProps, void>` where `RepositionViewModalProps = { location: string }`.
  - `RepositionViewFlow implements Flow<{ viewId: ViewId }, void, FlowError>` — no-op when the view is closed; otherwise opens the modal and repositions on submit, aborts on cancel.

- [ ] **Step 1: Add i18n messages**

In `messages/en.json`, insert these three keys immediately after the `"view_edit_leaf_tab": "New tab",` line:

```json
  "view_reposition_modal_title": "Move open view?",
  "view_reposition_modal_description": "This view is open. Move it to {location}?",
  "view_reposition_modal_confirm": "Move",
```

- [ ] **Step 2: Create the modal component**

Create `src/views/ui/ConfirmRepositionModal.vue` (mirrors `DeleteViewModal.vue`; the primary button is a plain CTA, not `warning`):

```vue
<script setup lang="ts">
import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

defineProps<{ location: string }>();

const api = useModal();
</script>

<template>
  <div>
    <UiSettingRow>
      <template #description>{{ m.view_reposition_modal_description({ location }) }}</template>
    </UiSettingRow>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta @click="api.submit()">{{ m.view_reposition_modal_confirm() }}</UiButton>
    </UiSettingRow>
  </div>
</template>
```

- [ ] **Step 3: Register the modal**

In `src/views/ui/modals.ts`, add the import alongside the other modal-component imports:

```ts
import ConfirmRepositionModal from "./ConfirmRepositionModal.vue";
```

Then add the props interface and modal definition (place after the `deleteViewModal` block):

```ts
export interface RepositionViewModalProps {
  location: string;
}

export const repositionViewModal = defineModal()({
  component: ConfirmRepositionModal,
  title: (_: RepositionViewModalProps) => m.view_reposition_modal_title(),
});
```

- [ ] **Step 4: Write the failing flow tests**

Create `src/views/flows/reposition-view.flow.test.ts`:

```ts
import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { Container } from "@/infrastructure/di";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { CommandService } from "@/infrastructure/host/commands";
import { createFakeHost } from "@/infrastructure/host/internal/testing";
import { InternalObsidianAppToken, InternalPluginToken } from "@/infrastructure/host/internal/tokens";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { createLoggerTestingModule } from "@/infrastructure/logger/testing";

import { ViewsRepository } from "../repository";
import { ViewsEventsToken, type ViewsEvents } from "../tokens";
import { ViewHostService } from "../view-host";
import { ViewsViewModel } from "../view-model";

import { RepositionViewFlow } from "./reposition-view.flow";

import type { View, ViewId } from "../config";

function seedView(id: string, overrides: Partial<View> = {}): View {
  return {
    id: id as ViewId,
    name: "View " + id,
    icon: "calendar-days",
    defaultShelf: null,
    showInRibbon: false,
    leaf: "right",
    openOnStartup: false,
    blocks: [],
    ...overrides,
  };
}

function build(seeds: Record<string, View> = {}) {
  const host = createFakeHost();
  const storage: Record<string, View> = { ...seeds };
  const events = createNanoEvents<ViewsEvents>();
  const repo = ViewsRepository.fromParts(storage, events);
  const c = new Container();
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(InternalObsidianAppToken).useValue(host.app);
  c.addModule(createLoggerTestingModule().module);
  c.register(CommandService).useClass(CommandService);
  c.register(ViewsRepository).useValue(repo);
  c.register(ViewsEventsToken).useValue(events);
  c.register(ViewHostService).useClass(ViewHostService);
  c.register(ViewsViewModel).useClass(ViewsViewModel);
  const modals = new FakeModalService();
  c.register(ModalService).useValue(modals as unknown as ModalService);
  c.register(Flows).useClass(Flows);
  c.register(RepositionViewFlow).useClass(RepositionViewFlow);
  c.resolve(ViewHostService);
  return { host, storage, modals, flows: c.resolve(Flows) };
}

async function seedOpenLeaf(host: ReturnType<typeof createFakeHost>, id: string): Promise<void> {
  await host.app.workspace.getRightLeaf(false)!.setViewState({ type: `journal-view:${id}` });
}

describe("RepositionViewFlow", () => {
  it("repositions the open view on submit", async () => {
    const { host, flows, modals } = build({ a: seedView("a", { leaf: "tab" }) });
    await seedOpenLeaf(host, "a");
    const promise = flows.invoke(RepositionViewFlow, { viewId: "a" as ViewId });
    modals.lastOpen<{ location: string }, void>().submit(undefined);
    await promise;
    expect(host.workspace.detachedTypes).toContain("journal-view:a");
  });

  it("describes the target open mode in the modal", async () => {
    const { host, flows, modals } = build({ a: seedView("a", { leaf: "tab" }) });
    await seedOpenLeaf(host, "a");
    flows.invoke(RepositionViewFlow, { viewId: "a" as ViewId });
    expect(modals.lastOpen<{ location: string }, void>().props.location).toBe(m.view_edit_leaf_tab());
  });

  it("returns UserAborted and leaves the view in place when cancelled", async () => {
    const { host, flows, modals } = build({ a: seedView("a", { leaf: "tab" }) });
    await seedOpenLeaf(host, "a");
    const promise = flows.invoke(RepositionViewFlow, { viewId: "a" as ViewId });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(host.workspace.detachedTypes).toEqual([]);
  });

  it("does not open a modal when the view is closed", async () => {
    const { flows, modals } = build({ a: seedView("a", { leaf: "tab" }) });
    const result = await flows.invoke(RepositionViewFlow, { viewId: "a" as ViewId });
    expect(modals.opens.length).toBe(0);
    expect(result.kind).toBe("ok");
  });
});
```

- [ ] **Step 5: Run the flow tests to verify they fail**

Run: `npm run test -- src/views/flows/reposition-view.flow.test.ts`
Expected: FAIL — cannot resolve `./reposition-view.flow` (module does not exist).

- [ ] **Step 6: Implement the flow**

Create `src/views/flows/reposition-view.flow.ts`:

```ts
import { match } from "ts-pattern";

import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import { repositionViewModal } from "../ui/modals";
import { ViewHostService } from "../view-host";
import { ViewsViewModel } from "../view-model";

import type { View, ViewId } from "../config";

export class RepositionViewFlow implements Flow<{ viewId: ViewId }, void, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #viewHost = inject(ViewHostService);
  readonly #vm = inject(ViewsViewModel);

  execute(parameters: { viewId: ViewId }): AsyncResult<void, FlowError> {
    return attempt.in(this, async function* (this: RepositionViewFlow) {
      if (!this.#viewHost.isOpen(parameters.viewId)) return;
      const leaf: View["leaf"] = this.#vm
        .getView(parameters.viewId)
        .map((view) => view.leaf)
        .getOr("right");
      const location = match(leaf)
        .with("left", () => m.view_edit_leaf_left())
        .with("right", () => m.view_edit_leaf_right())
        .with("tab", () => m.view_edit_leaf_tab())
        .exhaustive();
      yield* this.#modals
        .open(repositionViewModal, { location })
        .mapErr(() => new UserAborted("reposition-view-modal"));
      await this.#viewHost.reposition(parameters.viewId);
    });
  }
}
```

- [ ] **Step 7: Run the flow tests to verify they pass**

Run: `npm run test -- src/views/flows/reposition-view.flow.test.ts`
Expected: PASS (all four tests green).

- [ ] **Step 8: Type + lint check**

Run: `npm run check:types && npm run check:lint`
Expected: no errors. (Confirms the new message keys are recognized by the paraglide-generated `m`.)

- [ ] **Step 9: Commit**

```bash
git add messages/en.json src/views/ui/ConfirmRepositionModal.vue src/views/ui/modals.ts src/views/flows/reposition-view.flow.ts src/views/flows/reposition-view.flow.test.ts
git commit -m "feat(views): add reposition confirm modal and flow"
```

---

## Task 3: Wire the flow into the open-mode dropdown

**Files:**

- Modify: `src/views/ui/ViewEditSubpage.vue`
- Test: `src/views/ui/ViewEditSubpage.test.ts`

**Interfaces:**

- Consumes: `RepositionViewFlow` (Task 2); the component's existing `flows = useService(Flows)` and `viewsService`.
- Produces: no new exports — the `leaf` dropdown persists, then invokes `RepositionViewFlow` on persist success.

- [ ] **Step 1: Register a fake flow in the shared test setup**

In `src/views/ui/ViewEditSubpage.test.ts`, add these imports next to the existing ones:

```ts
import { AsyncResult } from "@/infrastructure/result";

import { RepositionViewFlow } from "../flows/reposition-view.flow";
```

Inside `setup()`, register a fake flow (place it right after the existing `container.register(AddBlockToViewFlow).useClass(AddBlockToViewFlow);` line) and return the spy:

```ts
const repositionExecute = vi.fn(() => AsyncResult.ok());
container.register(RepositionViewFlow).useValue({ execute: repositionExecute } as unknown as RepositionViewFlow);
```

Change the `setup()` return to include it:

```ts
return { container, open, repositionExecute };
```

- [ ] **Step 2: Write the failing wiring test**

Add this test inside `describe("ViewEditSubpage", ...)` in the same file:

```ts
it("invokes the reposition flow after the open-in dropdown changes", async () => {
  const { container, repositionExecute } = await setup();
  mount(container);
  const dropdown = within(row(m.view_edit_leaf_label())).getByRole("combobox");
  await userEvent.selectOptions(dropdown, "left");
  await vi.waitFor(() => expect(repositionExecute).toHaveBeenCalledWith({ viewId }));
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test -- src/views/ui/ViewEditSubpage.test.ts`
Expected: FAIL — `repositionExecute` was never called (the setter does not invoke the flow yet). The registration in Step 1 keeps the other leaf test from erroring on an unresolved flow.

- [ ] **Step 4: Chain the flow onto the persist**

In `src/views/ui/ViewEditSubpage.vue`, add the import next to the other flow imports:

```ts
import { RepositionViewFlow } from "../flows/reposition-view.flow";
```

Replace the existing `leafValue` setter:

```ts
const leafValue = computed<string>({
  get: () => view.value?.leaf ?? "right",
  set: (next) => {
    void viewsService.update(viewId, { leaf: next as View["leaf"] });
  },
});
```

with:

```ts
const leafValue = computed<string>({
  get: () => view.value?.leaf ?? "right",
  set: (next) => {
    void viewsService.update(viewId, { leaf: next as View["leaf"] }).tap(() => {
      void flows.invoke(RepositionViewFlow, { viewId });
    });
  },
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test -- src/views/ui/ViewEditSubpage.test.ts`
Expected: PASS — both the new wiring test and the existing `"updates the leaf placement when the Open-in dropdown changes"` test are green.

- [ ] **Step 6: Full unit suite + type + lint check**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: no failures.

- [ ] **Step 7: Commit**

```bash
git add src/views/ui/ViewEditSubpage.vue src/views/ui/ViewEditSubpage.test.ts
git commit -m "feat(views): reposition open view when open-mode changes"
```

---

## Task 4: e2e — move an open view via the confirm modal

**Files:**

- Modify: `e2e/journeys/view.e2e.ts`

**Interfaces:**

- Consumes: the full wired behavior (Tasks 1-3); e2e helpers `openSettings`, `expandSection`, `clickIcon`, `goBack`, `closeSettings`, `waitForModalOpen`, `clickDialogButton` from `../support/settings.js`; `openCalendarView`, `LIVE_LEAF` from `./view.js`.
- Produces: nothing — final integration proof.

Context: the `e2e-journeys` fixture ships the default **Calendar** view (`leaf: "right"`, opens in the right sidebar). In Obsidian, a right-sidebar leaf lives under `.mod-right-split`; a main-area tab lives under `.workspace-split.mod-root`. The `.notes-month-view` element is the calendar surface, so its container tells us where the view sits.

- [ ] **Step 1: Add imports for the settings helpers**

At the top of `e2e/journeys/view.e2e.ts`, extend the existing `../support/settings.js` import (it is not currently imported there — add this import block near the other support imports):

```ts
import {
  clickDialogButton,
  clickIcon,
  closeSettings,
  expandSection,
  goBack,
  openSettings,
  waitForModalOpen,
} from "../support/settings.js";
```

- [ ] **Step 2: Add the reposition journey**

Add this `describe` block inside `e2e/journeys/view.e2e.ts` (a sibling of the existing `describe("calendar view", ...)` block, at the top level of the file):

```ts
describe("view reposition", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
  });

  after(closeSettings);

  it("moves an open calendar view from the right sidebar to a tab after confirming", async () => {
    await openCalendarView();
    await expect($(`.mod-right-split ${LIVE_LEAF} .notes-month-view`)).toExist();

    await openSettings();
    await expandSection("Views");
    await clickIcon("Configure Calendar");

    const openInSelect = await $(
      '//div[contains(@class,"setting-item")][.//*[normalize-space(text())="Open in"]]//select',
    );
    await openInSelect.selectByAttribute("value", "tab");

    await waitForModalOpen();
    await clickDialogButton("Move");

    await goBack();
    await closeSettings();

    await $(`.workspace-split.mod-root ${LIVE_LEAF} .notes-month-view`).waitForExist({
      timeoutMsg: "calendar view did not move to a main-area tab after confirming the reposition",
    });
    await expect($(`.mod-right-split ${LIVE_LEAF} .notes-month-view`)).not.toExist();
  });
});
```

- [ ] **Step 3: Run the e2e journey**

Run: `npm run test:e2e -- --spec e2e/journeys/view.e2e.ts` (`test:e2e` = `npm run build && wdio run ./wdio.conf.mts`; the `-- --spec …` narrows the run to this file).
Expected: PASS — the new "view reposition" journey moves the calendar view to a main-area tab and removes it from the right sidebar.

If the confirm-button label, the `Configure Calendar` icon label, or the container classes differ from what the running app renders, adjust the selectors to match the observed DOM (do not change the asserted behavior). The `.mod-right-split` / `.workspace-split.mod-root` split classes and the "Open in" row label (`m.view_edit_leaf_label()`) and "Move" button label (`m.view_reposition_modal_confirm()`) are the anchors.

- [ ] **Step 4: Commit**

```bash
git add e2e/journeys/view.e2e.ts
git commit -m "test(views): e2e reposition open view on open-mode change"
```

---

## Self-Review

**Spec coverage:**

- "changing open mode with the view open" → Task 3 (setter chains flow) + Task 2 (flow opens modal when `isOpen`).
- "confirming the move" / "every open instance relocates" → Task 1 `reposition` (count-preserving) + Task 2 submit path.
- "declining the move" / setting still saved → Task 3 persists before the flow; Task 2 `UserAborted` on cancel leaves leaves untouched.
- "changing open mode with the view closed" → Task 2 flow early-returns; `reposition` no-ops (Task 1).
- "multiple open instances preserved" → Task 1 count-preserving test.
- Design-notes APIs (`isOpen`, `reposition`, `repositionViewModal`, `RepositionViewFlow`, i18n, setter wiring) → Tasks 1-3.
- Non-goals (no location detection, ordinary open unchanged) → respected: modal fires on any value change; `open()` untouched.
- Testing section (flow unit, host unit, component, e2e) → Tasks 1-4.

**Placeholder scan:** none — every step carries full code and exact commands.

**Type consistency:** `isOpen(id: ViewId): boolean` and `reposition(id: ViewId): Promise<void>` are used identically in Tasks 1-2. `RepositionViewModalProps = { location: string }` matches the modal `props.location` asserted in the flow test and the `{ location }` passed by the flow. `RepositionViewFlow` implements `Flow<{ viewId: ViewId }, void, FlowError>` and is invoked as `flows.invoke(RepositionViewFlow, { viewId })` in both the component and its test. `AsyncResult.ok()` matches the fake flow's `execute` return.
