# Auto-open config modal after adding a toolbar item — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a user adds a toolbar item that has a config editor, open that editor immediately so they can configure it in one motion.

**Architecture:** All logic lives in `AddToolbarItemToBlockFlow.execute`, which already orchestrates pick→add and already gets back the new item's id from `ViewsService.addToolbarItem`. After the add, the flow looks up the chosen definition; if it has a `configComponent`, it opens the existing `editToolbarItemModal` and, on submit, calls `ViewsService.updateToolbarItemConfig`. Cancelling the config modal is a no-op (item kept with defaults), not an aborted add.

**Tech Stack:** TypeScript, Vue 3 SFCs, valibot, a Result/AsyncResult effect layer with `attempt.in` do-notation, InversifyJS-style DI (`inject`), Vitest (unit), WebdriverIO (e2e against real Obsidian).

## Global Constraints

- Compose Result/AsyncResult pipelines as one `attempt.in(this, async function* …)` block; never shadow `this.#field`.
- Every Error subclass lives in the feature's `errors.ts`; never inline.
- No `eslint-disable`; fix the code. No WHAT-comments; only WHY-comments.
- One behavior per test; test descriptions name subject+verb behavior; assert observable outcomes (black-box), not spy counts, unless the side effect _is_ the contract.
- Inject errors in tests via `vi.spyOn`; never add `simulate*Error` queues to fakes.
- Quality gates before done: `npm run test`, `npm run check:types`, `npm run check:lint`. This change touches runtime UI, so the e2e suite (Task 3) is part of the gate.
- Commit to the current branch (`v3-ai`); do not create a branch. No `Co-Authored-By` trailer.

---

### Task 1: Auto-open the config modal from the add flow

**Files:**

- Modify: `src/views/errors.ts` — add `InvalidToolbarItemConfigError` to the `ViewsLifecycleError` union (so `toFlowError` accepts the update error).
- Modify: `src/views/flows/add-toolbar-item-to-block.flow.ts` — the flow logic.
- Test: `src/views/flows/add-toolbar-item-to-block.flow.test.ts` — extend the existing suite.

**Interfaces:**

- Consumes:
  - `ViewsService.addToolbarItem(id: ViewId, blockId: BlockInstanceId, itemKey: string, defaultConfig?: Record<string, unknown>): AsyncResult<BlockInstanceId | null, UnknownViewError | UnknownToolbarItemKeyError>` — returns the new item id (or `null` when the block is not found).
  - `ViewsService.updateToolbarItemConfig(id: ViewId, blockId: BlockInstanceId, itemId: BlockInstanceId, config: unknown): AsyncResult<void, UnknownViewError | InvalidToolbarItemConfigError>`.
  - `ModalService.open(definition, props): AsyncResult<TResult, ModalCancelled>` — `.match({ ok, err })` returns a `Promise<U>`.
  - `editToolbarItemModal` from `../ui/modals` — `defineModal<Record<string, unknown>>()` with props `{ component, config, typeLabel }`.
  - `ToolbarItemDefinitionToken` injects the array of `ToolbarItemDefinition`; each has `key`, `label`, `defaultConfig`, optional `configComponent`, optional `summary(config) => string`.
  - `toFlowError(cause: ViewsLifecycleError): ViewsLifecycleFlowError`.
- Produces: no new exported symbols; `AddToolbarItemToBlockFlow` keeps its `execute(p): AsyncResult<void, FlowError>` signature.

- [ ] **Step 1: Write the failing test — submit applies config**

Add these shared fixtures near the top of `add-toolbar-item-to-block.flow.test.ts` (after `shelfSelectorDefinition`, line ~41). Also add `vi` to the vitest import on line 3 (`import { describe, expect, it, vi } from "vitest";`).

```ts
const configurableDefinition = {
  key: "period-buttons",
  label: "Period buttons",
  schema: v.object({ periods: v.array(v.string()) }),
  defaultConfig: { periods: [] },
  component: { render: () => null },
  configComponent: { render: () => null },
  summary: (config: Record<string, unknown>) => `periods:${((config.periods as string[]) ?? []).length}`,
  __brand: "toolbar-item",
} as unknown as ToolbarItemDefinition;

function readItems(repo: ViewsRepository): { id: string; key: string; config: unknown }[] {
  const rawConfig =
    repo
      .get(viewId)
      .getOr(undefined as never)
      ?.blocks.find((b) => b.id === blockId)?.config ?? {};
  return Array.isArray(rawConfig.items) ? (rawConfig.items as { id: string; key: string; config: unknown }[]) : [];
}
```

Change the existing `build` to register both toolbar-item definitions when `withDefinition` is true (replace the `if (withDefinition) { … }` block, lines ~63-65):

```ts
if (withDefinition) {
  container.register(ToolbarItemDefinitionToken).useValue(shelfSelectorDefinition);
  container.register(ToolbarItemDefinitionToken).useValue(configurableDefinition);
}
```

Add the new test inside the `describe("AddToolbarItemToBlockFlow", …)` block:

```ts
it("opens the config modal after adding a configurable item and applies the submitted config", async () => {
  const { flows, modals, repo } = await build();
  const promise = flows.invoke(AddToolbarItemToBlockFlow, { viewId, blockId });
  modals
    .lastOpen<unknown, { key: string; defaultConfig: unknown }>()
    .submit({ key: "period-buttons", defaultConfig: { periods: [] } });
  await vi.waitFor(() => expect(modals.opens).toHaveLength(2));
  modals.lastOpen<unknown, Record<string, unknown>>().submit({ periods: ["month"] });
  await promise;
  expect(readItems(repo)).toEqual([{ id: expect.any(String), key: "period-buttons", config: { periods: ["month"] } }]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/views/flows/add-toolbar-item-to-block.flow.test.ts`
Expected: the new test FAILS — only one modal opens (`modals.opens` stays length 1, `vi.waitFor` times out), because the flow does not yet open the config modal.

- [ ] **Step 3: Widen the error union**

In `src/views/errors.ts`, add `InvalidToolbarItemConfigError` (already declared above the union) to `ViewsLifecycleError`:

```ts
export type ViewsLifecycleError =
  | InvalidViewNameError
  | UnknownViewError
  | UnknownViewBlockKeyError
  | UnknownToolbarItemKeyError
  | InvalidToolbarItemConfigError;
```

- [ ] **Step 4: Implement the flow**

Replace the body of `src/views/flows/add-toolbar-item-to-block.flow.ts` with:

```ts
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import { toFlowError } from "../errors";
import { ViewsService } from "../service";
import { ToolbarItemDefinitionToken } from "../tokens";
import { addToolbarItemPickerModal, editToolbarItemModal } from "../ui/modals";

import type { BlockInstanceId, ViewId } from "../config";

export interface AddToolbarItemParameters {
  readonly viewId: ViewId;
  readonly blockId: BlockInstanceId;
}

export class AddToolbarItemToBlockFlow implements Flow<AddToolbarItemParameters, void, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #views = inject(ViewsService);
  readonly #definitions = inject(ToolbarItemDefinitionToken);

  execute(p: AddToolbarItemParameters): AsyncResult<void, FlowError> {
    return attempt.in(this, async function* (this: AddToolbarItemToBlockFlow) {
      const choice = yield* this.#modals
        .open(addToolbarItemPickerModal, { definitions: this.#definitions })
        .mapErr(() => new UserAborted("add-toolbar-item-picker-modal"));
      const defaultConfig = choice.defaultConfig as Record<string, unknown> | undefined;
      const itemId = yield* this.#views
        .addToolbarItem(p.viewId, p.blockId, choice.key, defaultConfig)
        .mapErr(toFlowError);
      if (itemId === null) return;

      const definition = this.#definitions.find((d) => d.key === choice.key);
      if (!definition?.configComponent) return;

      const seed = defaultConfig ?? (definition.defaultConfig as Record<string, unknown>);
      const submitted = await this.#modals
        .open(editToolbarItemModal, {
          component: definition.configComponent,
          config: seed,
          typeLabel: definition.summary?.(seed) ?? definition.label,
        })
        .match<Record<string, unknown> | null>({ ok: (next) => next, err: () => null });
      if (submitted === null) return;

      yield* this.#views.updateToolbarItemConfig(p.viewId, p.blockId, itemId, submitted).mapErr(toFlowError);
    });
  }
}
```

Why `.match(... err: () => null)`: cancelling the config modal must be a successful "added, not customized" outcome, not a propagated error — so we convert the `ModalCancelled` into a sentinel and return early instead of `yield*`-ing it.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- src/views/flows/add-toolbar-item-to-block.flow.test.ts`
Expected: the submit test PASSES; the three pre-existing tests still PASS.

- [ ] **Step 6: Add the non-configurable behavior test**

```ts
it("adds a non-configurable item without opening a config modal", async () => {
  const { flows, modals } = await build();
  const promise = flows.invoke(AddToolbarItemToBlockFlow, { viewId, blockId });
  modals
    .lastOpen<unknown, { key: string; defaultConfig: unknown }>()
    .submit({ key: "shelf-selector", defaultConfig: {} });
  await promise;
  expect(modals.opens).toHaveLength(1);
});
```

- [ ] **Step 7: Add the cancel behavior test**

```ts
it("keeps the added item with its default config when the config modal is cancelled", async () => {
  const { flows, modals, repo } = await build();
  const promise = flows.invoke(AddToolbarItemToBlockFlow, { viewId, blockId });
  modals
    .lastOpen<unknown, { key: string; defaultConfig: unknown }>()
    .submit({ key: "period-buttons", defaultConfig: { periods: [] } });
  await vi.waitFor(() => expect(modals.opens).toHaveLength(2));
  modals.lastOpen().cancel();
  const result = await promise;
  expect(result.kind).toBe("ok");
  expect(readItems(repo)).toEqual([{ id: expect.any(String), key: "period-buttons", config: { periods: [] } }]);
});
```

- [ ] **Step 8: Run the full suite + gates**

Run: `npm run test -- src/views/flows/add-toolbar-item-to-block.flow.test.ts && npm run check:types && npm run check:lint`
Expected: all PASS. `check:types` in particular confirms the widened `ViewsLifecycleError` union has no downstream exhaustiveness breakage.

- [ ] **Step 9: Commit**

```bash
git add src/views/errors.ts src/views/flows/add-toolbar-item-to-block.flow.ts src/views/flows/add-toolbar-item-to-block.flow.test.ts
git commit -m "feat(views): open config modal after adding a configurable toolbar item"
```

---

### Task 2: Reconcile e2e journeys with the auto-opened modal

Two existing e2e tests add **configurable** items, so the config modal now auto-opens mid-test and would otherwise be left open — polluting the next test's modal lookup. Fix both, add a helper, and add one new coverage test.

**Files:**

- Modify: `e2e/support/settings.ts` — add an exported `waitForModalOpen()` helper.
- Modify: `e2e/journeys/settings.e2e.ts` — update two tests, add one.

**Interfaces:**

- Consumes: existing helpers `expandSection`, `clickIcon`, `submitModal`, `selectModalSelect`, `waitForSettings` and the module-private `DIALOG` selector / `activeModal()` in `settings.ts`.
- Produces: `export async function waitForModalOpen(): Promise<void>` in `e2e/support/settings.ts`.

- [ ] **Step 1: Add the `waitForModalOpen` helper**

In `e2e/support/settings.ts`, next to `waitForDialogClosed` (line ~108), add:

```ts
export async function waitForModalOpen(): Promise<void> {
  await activeModal().waitForExist({ timeoutMsg: "expected a dialog to open" });
}
```

- [ ] **Step 2: Fix the "adds a toolbar item" test**

In `e2e/journeys/settings.e2e.ts`, the test at ~line 195 adds **Period buttons** (configurable). After the add click, close the auto-opened config modal before asserting. Replace:

```ts
await clickIcon("Add Period buttons");

await waitForSettings((s) => itemCount(s.views) === before + 1, "added toolbar item not persisted");
```

with:

```ts
await clickIcon("Add Period buttons");
// Adding a configurable item now auto-opens its config editor; Save it with defaults so it
// does not leak into the next test.
await submitModal();

await waitForSettings((s) => itemCount(s.views) === before + 1, "added toolbar item not persisted");
```

- [ ] **Step 3: Fix the "edits a toolbar button's behavior" test**

In the same file at ~line 212, the test adds **Pick date** (a configurable button) then later drives an explicit edit. Dismiss the auto-opened modal right after the add so the later programmatic edit-button click is not fighting an already-open modal. Replace:

```ts
      await clickIcon("Add Pick date");
      await waitForSettings(
```

with:

```ts
      await clickIcon("Add Pick date");
      // Auto-opened config editor: Save with the preset's defaults (mode stays "navigate"); the
      // explicit edit below then changes the mode.
      await submitModal();
      await waitForSettings(
```

- [ ] **Step 4: Add a focused auto-open coverage test**

Add this test in `settings.e2e.ts` immediately after the "adds a toolbar item…" test. Import `waitForModalOpen` from the support module alongside the other helpers at the top of the file.

```ts
it("auto-opens the config editor when a configurable toolbar item is added", async () => {
  await expandSection("Views");
  await clickIcon("Open Calendar");
  const adders = await $$('button[aria-label="Add toolbar item"]').getElements();
  await adders.at(-1)?.click();
  await clickIcon("Add Period buttons");

  await waitForModalOpen();
  // Close it so it does not pollute the next test.
  await submitModal();
});
```

- [ ] **Step 5: Run the affected e2e journey**

Run: `npm run test:e2e -- --spec e2e/journeys/settings.e2e.ts`
(If the project uses a different e2e invocation, use the one in `package.json`'s scripts — confirm the script name before running.)
Expected: the settings journey PASSES, including the three touched/added tests, with no leftover-modal failures in subsequent tests.

- [ ] **Step 6: Commit**

```bash
git add e2e/support/settings.ts e2e/journeys/settings.e2e.ts
git commit -m "test(views): cover auto-open config modal after adding a toolbar item (e2e)"
```

---

## Self-Review

**Spec coverage:**

- "Adding a configurable item opens its configuration modal" → Task 1 Steps 1-5 (unit) + Task 2 Step 4 (e2e).
- "Submitting the configuration applies it" → Task 1 Steps 1, 5.
- "Cancelling keeps the item with its defaults, no error" → Task 1 Step 7.
- "Presets still open the modal" → covered by the flow logic (auto-open keys off `configComponent`, independent of `defaultConfig`); the "Add Pick date" preset path in Task 2 Step 3 exercises it end-to-end.
- "Non-configurable items open nothing" → Task 1 Step 6.
- "Config-seed correctness" → `seed = defaultConfig ?? definition.defaultConfig` mirrors `addItem`, Task 1 Step 4.
- "e2e existing tests must be updated" → Task 2 Steps 2-3; modal-pollution hazard addressed by Save-closing every auto-opened modal.

**Placeholder scan:** none — every code and command step is concrete.

**Type consistency:** `addToolbarItem` → `BlockInstanceId | null` (checked for `null`), `updateToolbarItemConfig(id, blockId, itemId, config)`, `editToolbarItemModal` props `{ component, config, typeLabel }`, `.match<Record<string, unknown> | null>({ ok, err })`, `toFlowError(ViewsLifecycleError)` after the union widening — all consistent between tasks and the real signatures verified in the codebase.

**Note for the implementer:** confirm the e2e script name in `package.json` before Task 2 Step 5; the exact invocation (`test:e2e`, a wdio config path, or a fixture-scoped runner) may differ.
