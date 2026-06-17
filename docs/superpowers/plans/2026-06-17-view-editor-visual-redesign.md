# View Editor Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat, type-labelled view-editor list with summarised block frames and a WYSIWYG toolbar strip of real rendered items, reorderable by drag-and-drop.

**Architecture:** Blocks render as a vertical sortable list of presentational `BlockFrame`s (icon + label + config summary). The toolbar block expands into `ToolbarStrip`, a horizontal sortable list of `ToolbarItemFrame`s that each render the item's _real_ component inside a `pointer-events:none` preview, fed by a no-op `ViewContext`. Drag-and-drop uses `useSortable`; reordering persists through new `setBlockOrder` / `setToolbarItemOrder` service methods (the step-wise `move*` methods are deleted).

**Tech Stack:** Vue 3 SFCs (`<script setup>`), valibot, `@vueuse/integrations`/`sortablejs`, vitest + `@testing-library/vue` + `user-event`, paraglide i18n.

---

## File Structure

New:

- `src/views/ui/preview-view-context.ts` — composable providing a no-op editor `ViewContext`.
- `src/views/ui/use-sortable-list.ts` — thin `useSortable` wrapper persisting new id order.
- `src/views/ui/BlockFrame.vue` — presentational block row (grip, icon, label, summary, edit/delete).
- `src/views/ui/ToolbarItemFrame.vue` — frame wrapping a real toolbar-item preview.
- `src/views/ui/ToolbarStrip.vue` — sortable strip of `ToolbarItemFrame` (replaces `ToolbarItemsList.vue`).
- `src/views/blocks/calendar-block-summary.ts` — shared summary for month/week calendar blocks.

Changed:

- `src/ui/icons.ts` — add `action.dragHandle`.
- `src/views/define-view-block.ts` — add optional `summary`.
- `src/views/service.ts` — add `setBlockOrder` / `setToolbarItemOrder`; remove `moveBlockUp/Down`, `moveToolbarItemUp/Down`, `#move`, `#moveToolbarItem`.
- `src/views/service.test.ts` — drop move-method tests; add set-order tests.
- `src/views/blocks/toolbar/toolbar-items-service.ts` — add `reorder`; remove `moveItem`.
- `src/views/blocks/toolbar/toolbar-items-service.test.ts` — drop `moveItem` tests; add `reorder` tests.
- `src/views/blocks/{month-calendar,week-calendar,markdown-template,custom-intervals}/*-block.ts` — add `summary`.
- `src/views/ui/BlocksList.vue` — rewrite to sortable frames + `ToolbarStrip`.
- `src/views/ui/BlocksList.test.ts` — update for new structure.
- `messages/en.json` — new summary/count messages.
- `package.json` — new deps.

Deleted:

- `src/views/ui/ToolbarItemsList.vue`
- `src/views/ui/ToolbarItemsList.test.ts`

---

## Task 1: Add drag-and-drop dependencies and the drag-handle icon

**Files:**

- Modify: `package.json`
- Modify: `src/ui/icons.ts:2-12`

- [ ] **Step 1: Install dependencies**

Run:

```bash
npm install sortablejs @vueuse/integrations && npm install -D @types/sortablejs
```

Expected: install succeeds; `package.json` gains `sortablejs` + `@vueuse/integrations` under dependencies and `@types/sortablejs` under devDependencies. `@vueuse/core@^14` is already present (the peer `useSortable` needs).

- [ ] **Step 2: Verify the integration entrypoint resolves**

Run:

```bash
node -e "require.resolve('@vueuse/integrations/useSortable'); require.resolve('sortablejs'); console.log('ok')"
```

Expected: prints `ok`.

- [ ] **Step 3: Add the drag-handle icon to the central icon map**

In `src/ui/icons.ts`, add to the `action` group (keep alphabetical-ish grouping consistent with the file):

```ts
  action: {
    edit: "pencil",
    delete: "trash-2",
    add: "plus",
    addFile: "file-plus",
    copy: "copy",
    openExternal: "external-link",
    pickDate: "crosshair",
    check: "lucide-check",
    moveUp: "chevron-up",
    moveDown: "chevron-down",
    dragHandle: "grip-vertical",
  },
```

- [ ] **Step 4: Type-check**

Run: `npm run check:types`
Expected: PASS (no usages yet; this just confirms the icon map still type-checks).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/ui/icons.ts
git commit -m "build(views): add sortablejs/@vueuse integrations and drag-handle icon"
```

---

## Task 2: `ViewsService.setBlockOrder` (and remove block move methods)

**Files:**

- Modify: `src/views/service.ts:131-137,173-186`
- Test: `src/views/service.test.ts:300-358`

- [ ] **Step 1: Write the failing tests**

In `src/views/service.test.ts`, **delete** the `describe("moveBlockUp", …)` and `describe("moveBlockDown", …)` blocks. Add this block in their place:

```ts
describe("setBlockOrder", () => {
  it("reorders blocks to the given permutation", async () => {
    const { service, repo } = build({ blocks: [trivialBlock] });
    const created = await service.create({ name: "X" });
    expectOk(created);
    const a = await service.addBlock(created.value, "test-block");
    const b = await service.addBlock(created.value, "test-block");
    expectOk(a);
    expectOk(b);
    await service.setBlockOrder(created.value, [b.value, a.value]);
    const ids = repo.get(created.value).match({ some: (v) => v.blocks.map((x) => x.id), none: () => [] });
    expect(ids).toEqual([b.value, a.value]);
  });

  it("is an Ok no-op when the ids are not a permutation of the blocks", async () => {
    const { service, repo } = build({ blocks: [trivialBlock] });
    const created = await service.create({ name: "X" });
    expectOk(created);
    const a = await service.addBlock(created.value, "test-block");
    const b = await service.addBlock(created.value, "test-block");
    expectOk(a);
    expectOk(b);
    const result = await service.setBlockOrder(created.value, [a.value]);
    expectOk(result);
    const ids = repo.get(created.value).match({ some: (v) => v.blocks.map((x) => x.id), none: () => [] });
    expect(ids).toEqual([a.value, b.value]);
  });

  it("returns UnknownViewError for an unknown view", async () => {
    const { service } = build({ blocks: [trivialBlock] });
    const result = await service.setBlockOrder("nope" as ViewId, []);
    expectErr(result);
    expect(result.error.kind).toBe("unknown-view");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/views/service.test.ts`
Expected: FAIL — `service.setBlockOrder is not a function`.

- [ ] **Step 3: Implement `setBlockOrder` and remove the block move methods**

In `src/views/service.ts`, **delete** `moveBlockUp`, `moveBlockDown`, and the private `#move` method. Add:

```ts
  setBlockOrder(id: ViewId, orderedIds: BlockInstanceId[]): AsyncResult<void, UnknownViewError> {
    return attempt.in(this, async function* () {
      const current = yield* this.#repo.get(id).okOrElse(() => new UnknownViewError(id));
      const byId = new Map(current.blocks.map((b) => [b.id, b]));
      if (orderedIds.length !== current.blocks.length || orderedIds.some((blockId) => !byId.has(blockId))) {
        this.#logger.warn("setBlockOrder: ids are not a permutation of current blocks; ignoring", { viewId: id });
        return;
      }
      const blocks = orderedIds.map((blockId) => byId.get(blockId)!);
      yield* this.#persistBlocks(id, blocks);
    });
  }
```

(`#persistBlocks` already exists at `service.ts:192`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/views/service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/service.ts src/views/service.test.ts
git commit -m "feat(views): replace block move with setBlockOrder"
```

---

## Task 3: `ToolbarItemsService.reorder` + `ViewsService.setToolbarItemOrder` (remove item move methods)

**Files:**

- Modify: `src/views/blocks/toolbar/toolbar-items-service.ts:61-70`
- Modify: `src/views/service.ts:227-241,261-273`
- Test: `src/views/blocks/toolbar/toolbar-items-service.test.ts:124-141`
- Test: `src/views/service.test.ts`

- [ ] **Step 1: Write the failing `reorder` tests**

In `src/views/blocks/toolbar/toolbar-items-service.test.ts`, **delete** the `describe("moveItem", …)` block and add:

```ts
describe("reorder", () => {
  it("reorders items to the given permutation", () => {
    const service = build();
    const blocks = service.reorder(viewWith([item(ID_A), item(ID_B)]), "b1" as BlockInstanceId, [
      ID_B as BlockInstanceId,
      ID_A as BlockInstanceId,
    ]);
    expect(blocks).not.toBeNull();
    expect(service.itemsOf(blocks![0]).map((i) => i.id)).toEqual([ID_B, ID_A]);
  });

  it("returns null when the ids are not a permutation", () => {
    const service = build();
    const blocks = service.reorder(viewWith([item(ID_A), item(ID_B)]), "b1" as BlockInstanceId, [
      ID_A as BlockInstanceId,
    ]);
    expect(blocks).toBeNull();
  });

  it("returns null when the block id is absent", () => {
    const service = build();
    const blocks = service.reorder(viewWith([item(ID_A)]), "missing" as BlockInstanceId, [ID_A as BlockInstanceId]);
    expect(blocks).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing `setToolbarItemOrder` tests**

In `src/views/service.test.ts`, add (near the other toolbar-item service tests):

```ts
describe("setToolbarItemOrder", () => {
  it("reorders the toolbar items to the given permutation", async () => {
    const { service, repo } = build({ blocks: [toolbarBlockForTest], items: [dummyItem] });
    const created = await service.create({ name: "X" });
    expectOk(created);
    const block = await service.addBlock(created.value, "toolbar");
    expectOk(block);
    const a = await service.addToolbarItem(created.value, block.value, "dummy-item");
    const b = await service.addToolbarItem(created.value, block.value, "dummy-item");
    expectOk(a);
    expectOk(b);
    await service.setToolbarItemOrder(created.value, block.value, [b.value!, a.value!]);
    const ids = repo.get(created.value).match({
      some: (v) => ((v.blocks[0]?.config as { items: { id: string }[] }).items ?? []).map((i) => i.id),
      none: () => [],
    });
    expect(ids).toEqual([b.value, a.value]);
  });

  it("returns UnknownViewError for an unknown view", async () => {
    const { service } = build({ blocks: [toolbarBlockForTest], items: [dummyItem] });
    const result = await service.setToolbarItemOrder("nope" as ViewId, "b" as BlockInstanceId, []);
    expectErr(result);
    expect(result.error.kind).toBe("unknown-view");
  });
});
```

Add these fixtures near the top of `src/views/service.test.ts` (after `trivialBlock`), if not already present:

```ts
const toolbarBlockForTest = defineViewBlock<{ items: unknown[] }>({
  key: "toolbar",
  label: "Toolbar",
  schema: v.object({ items: v.array(v.unknown()) }),
  defaultConfig: { items: [] },
  component: { setup: () => noop },
});

const dummyItem = defineToolbarItem<{ x: number }>({
  key: "dummy-item",
  label: "Dummy item",
  schema: v.object({ x: v.number() }),
  defaultConfig: { x: 0 },
  component: { setup: () => noop },
}) as ToolbarItemDefinition;
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test -- src/views/blocks/toolbar/toolbar-items-service.test.ts src/views/service.test.ts`
Expected: FAIL — `service.reorder` / `service.setToolbarItemOrder` is not a function.

- [ ] **Step 4: Implement `reorder` and remove `moveItem`**

In `src/views/blocks/toolbar/toolbar-items-service.ts`, **delete** `moveItem` and add:

```ts
  reorder(view: View, blockId: BlockInstanceId, orderedIds: BlockInstanceId[]): View["blocks"] | null {
    return this.#withItems(view, blockId, (items) => {
      if (orderedIds.length !== items.length) return null;
      const byId = new Map(items.map((i) => [i.id, i]));
      if (orderedIds.some((itemId) => !byId.has(itemId))) return null;
      return orderedIds.map((itemId) => byId.get(itemId)!);
    });
  }
```

- [ ] **Step 5: Implement `setToolbarItemOrder` and remove the item move methods**

In `src/views/service.ts`, **delete** `moveToolbarItemUp`, `moveToolbarItemDown`, and the private `#moveToolbarItem` method. Add:

```ts
  setToolbarItemOrder(
    id: ViewId,
    blockId: BlockInstanceId,
    orderedIds: BlockInstanceId[],
  ): AsyncResult<void, UnknownViewError> {
    return attempt.in(this, async function* () {
      const current = yield* this.#repo.get(id).okOrElse(() => new UnknownViewError(id));
      const blocks = this.#toolbarItems.reorder(current, blockId, orderedIds);
      if (blocks === null) return;
      yield* this.#persistBlocks(id, blocks);
    });
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test -- src/views/blocks/toolbar/toolbar-items-service.test.ts src/views/service.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/views/service.ts src/views/service.test.ts src/views/blocks/toolbar/toolbar-items-service.ts src/views/blocks/toolbar/toolbar-items-service.test.ts
git commit -m "feat(views): replace toolbar-item move with reorder/setToolbarItemOrder"
```

---

## Task 4: Add i18n messages

**Files:**

- Modify: `messages/en.json`

- [ ] **Step 1: Add the new messages**

In `messages/en.json`, add these keys (place them near the other `view_block_*` keys, e.g. after `view_block_markdown_template_empty`):

```json
  "view_block_summary_weeks_left": "Week numbers: left",
  "view_block_summary_weeks_right": "Week numbers: right",
  "view_block_summary_padding": "{before} before, {after} after",
  "view_block_summary_hidden_days": "Hides {days}",
  "view_block_summary_journal_count": "{count} journals",
  "view_block_toolbar_item_count": "{count} items",
```

- [ ] **Step 2: Compile the message catalog**

Run: `npm run compile:i18n`
Expected: succeeds; `src/i18n/paraglide/messages/` regenerates with the new `m.view_block_summary_*` / `m.view_block_toolbar_item_count` functions.

- [ ] **Step 3: Type-check**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add messages/en.json src/i18n/paraglide
git commit -m "i18n(views): add view-editor summary and item-count messages"
```

---

## Task 5: Block config summaries

**Files:**

- Modify: `src/views/define-view-block.ts:11-19`
- Create: `src/views/blocks/calendar-block-summary.ts`
- Create: `src/views/blocks/calendar-block-summary.test.ts`
- Modify: `src/views/blocks/month-calendar/month-calendar-block.ts`
- Modify: `src/views/blocks/week-calendar/week-calendar-block.ts`
- Modify: `src/views/blocks/markdown-template/markdown-template-block.ts`
- Modify: `src/views/blocks/custom-intervals/custom-intervals-block.ts`
- Test: `src/views/blocks/markdown-template/markdown-template-block.test.ts`
- Test: `src/views/blocks/custom-intervals/custom-intervals-block.test.ts`

- [ ] **Step 1: Add the optional `summary` field to the block definition**

In `src/views/define-view-block.ts`, add `summary` to `ViewBlockDefinitionInput`:

```ts
export interface ViewBlockDefinitionInput<TConfig> {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly icon?: string;
  readonly schema: BaseSchema<unknown, TConfig, BaseIssue<unknown>>;
  readonly defaultConfig: TConfig;
  readonly component: Component;
  readonly configComponent?: Component;
  readonly cssClass?: string | readonly string[];
  readonly summary?: (config: TConfig) => string | undefined;
}
```

- [ ] **Step 2: Write the failing calendar-summary test**

Create `src/views/blocks/calendar-block-summary.test.ts`:

```ts
import { moment } from "obsidian";
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";

import { calendarBlockSummary } from "./calendar-block-summary";

describe("calendarBlockSummary", () => {
  it("reports the week-number position", () => {
    expect(calendarBlockSummary({ weeks: "left", before: 0, after: 0, hiddenWeekdays: [] })).toBe(
      m.view_block_summary_weeks_left(),
    );
  });

  it("reports before/after padding when non-zero", () => {
    const summary = calendarBlockSummary({ weeks: "none", before: 1, after: 2, hiddenWeekdays: [] });
    expect(summary).toBe(m.view_block_summary_padding({ before: 1, after: 2 }));
  });

  it("names hidden weekdays from the locale", () => {
    const names = moment().localeData().weekdaysShort();
    const summary = calendarBlockSummary({ weeks: "none", before: 0, after: 0, hiddenWeekdays: [0, 6] });
    expect(summary).toBe(m.view_block_summary_hidden_days({ days: `${names[0]}, ${names[6]}` }));
  });

  it("returns undefined when nothing notable is configured", () => {
    expect(calendarBlockSummary({ weeks: "none", before: 0, after: 0, hiddenWeekdays: [] })).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test -- src/views/blocks/calendar-block-summary.test.ts`
Expected: FAIL — cannot find module `./calendar-block-summary`.

- [ ] **Step 4: Implement the shared calendar summary**

Create `src/views/blocks/calendar-block-summary.ts`:

```ts
import { moment } from "obsidian";

import { m } from "@/i18n";

interface CalendarLikeConfig {
  readonly weeks?: "none" | "left" | "right";
  readonly before: number;
  readonly after: number;
  readonly hiddenWeekdays?: readonly number[];
}

export function calendarBlockSummary(config: CalendarLikeConfig): string | undefined {
  const parts: string[] = [];
  if (config.weeks === "left") parts.push(m.view_block_summary_weeks_left());
  else if (config.weeks === "right") parts.push(m.view_block_summary_weeks_right());
  if (config.before > 0 || config.after > 0) {
    parts.push(m.view_block_summary_padding({ before: config.before, after: config.after }));
  }
  if (config.hiddenWeekdays && config.hiddenWeekdays.length > 0) {
    const names = moment().localeData().weekdaysShort();
    parts.push(m.view_block_summary_hidden_days({ days: config.hiddenWeekdays.map((day) => names[day]).join(", ") }));
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- src/views/blocks/calendar-block-summary.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire the calendar summaries into the block definitions**

In `src/views/blocks/month-calendar/month-calendar-block.ts`, import and attach the summary:

```ts
import { calendarBlockSummary } from "../calendar-block-summary";
```

and add `summary: calendarBlockSummary,` to the `defineViewBlock` call (after `configComponent`).

Do the same in `src/views/blocks/week-calendar/week-calendar-block.ts`.

- [ ] **Step 7: Add the markdown-template summary**

In `src/views/blocks/markdown-template/markdown-template-block.ts`, add to the `defineViewBlock` call:

```ts
  summary: (config) => (config.templatePath ? config.templatePath : m.view_block_markdown_template_empty()),
```

(`m` is already imported in that file.)

- [ ] **Step 8: Add the custom-intervals summary**

In `src/views/blocks/custom-intervals/custom-intervals-block.ts`, add `import { m }` if missing (it is already imported) and add to the `defineViewBlock` call:

```ts
  summary: (config) => {
    const window = m.view_block_config_window_current({ period: config.window });
    return config.journals && config.journals.length > 0
      ? `${window} · ${m.view_block_summary_journal_count({ count: config.journals.length })}`
      : window;
  },
```

- [ ] **Step 9: Write failing summary tests for markdown-template and custom-intervals**

Append to `src/views/blocks/markdown-template/markdown-template-block.test.ts` (create the file if it does not exist, mirroring the import style of sibling block tests):

```ts
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";

import { markdownTemplateBlock } from "./markdown-template-block";

describe("markdownTemplateBlock.summary", () => {
  it("shows the template path when set", () => {
    expect(markdownTemplateBlock.summary?.({ templatePath: "notes/t.md" })).toBe("notes/t.md");
  });

  it("shows the empty message when no template is chosen", () => {
    expect(markdownTemplateBlock.summary?.({ templatePath: "" })).toBe(m.view_block_markdown_template_empty());
  });
});
```

Append to `src/views/blocks/custom-intervals/custom-intervals-block.test.ts` (create if absent):

```ts
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";

import { customIntervalsBlock } from "./custom-intervals-block";

describe("customIntervalsBlock.summary", () => {
  it("shows the window when no journals are pinned", () => {
    expect(customIntervalsBlock.summary?.({ window: "month", hideEmpty: true })).toBe(
      m.view_block_config_window_current({ period: "month" }),
    );
  });

  it("appends the journal count when journals are pinned", () => {
    const summary = customIntervalsBlock.summary?.({ window: "week", hideEmpty: true, journals: ["a", "b"] });
    expect(summary).toBe(
      `${m.view_block_config_window_current({ period: "week" })} · ${m.view_block_summary_journal_count({ count: 2 })}`,
    );
  });
});
```

- [ ] **Step 10: Run the summary tests**

Run: `npm run test -- src/views/blocks/markdown-template/markdown-template-block.test.ts src/views/blocks/custom-intervals/custom-intervals-block.test.ts src/views/blocks/calendar-block-summary.test.ts`
Expected: PASS.

- [ ] **Step 11: Type-check and commit**

Run: `npm run check:types`
Expected: PASS.

```bash
git add src/views/define-view-block.ts src/views/blocks
git commit -m "feat(views): add config summaries to view blocks"
```

---

## Task 6: Editor preview `ViewContext`

**Files:**

- Create: `src/views/ui/preview-view-context.ts`
- Test: `src/views/ui/preview-view-context.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/views/ui/preview-view-context.test.ts`:

```ts
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { Clock } from "@/calendar";
import { provideInjectorOnApp } from "@/infrastructure/di";
import { createSettingsService } from "@/settings/testing";

import { viewsCollection } from "../config";
import { ViewsRepository } from "../repository";
import { ViewsEventsToken } from "../tokens";
import { useViewContext } from "../view-context";
import { ViewsViewModel } from "../view-model";

import { provideViewPreviewContext } from "./preview-view-context";

import type { ViewId } from "../config";

afterEach(() => cleanup());

const viewId = "11111111-1111-1111-1111-111111111111" as ViewId;

async function mountConsumer() {
  const raw = {
    version: 4,
    views: {
      [viewId]: {
        id: viewId,
        name: "Weekly",
        icon: "calendar-days",
        defaultShelf: "Work",
        showInRibbon: false,
        blocks: [],
      },
    },
  };
  const { service: settings, container } = createSettingsService({ collections: [viewsCollection], raw });
  await settings.initialize();
  container.register(ViewsEventsToken).useFactory(() => createNanoEvents());
  container.register(ViewsRepository).useClass(ViewsRepository);
  container.register(ViewsViewModel).useClass(ViewsViewModel);

  const Consumer = defineComponent({
    setup() {
      provideViewPreviewContext(viewId);
      const ctx = useViewContext();
      return () =>
        h("div", [
          h("span", { "data-testid": "ref" }, ctx.refDate.value),
          h("span", { "data-testid": "shelf" }, ctx.shelf.value ?? "null"),
        ]);
    },
  });
  render(Consumer, { global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] } });
}

describe("provideViewPreviewContext", () => {
  it("exposes today as the reference date", async () => {
    await mountConsumer();
    expect(screen.getByTestId("ref").textContent).toBe(Clock.now().format("YYYY-MM-DD"));
  });

  it("exposes the view's default shelf", async () => {
    await mountConsumer();
    expect(screen.getByTestId("shelf").textContent).toBe("Work");
  });
});
```

> **Note for the implementer:** the `createSettingsService` harness mirrors `src/views/ui/BlocksList.test.ts:71-78` (it returns `{ service, data, container }`; call `await settings.initialize()` before rendering). Cross-check against that file if anything drifts.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/views/ui/preview-view-context.test.ts`
Expected: FAIL — cannot find module `./preview-view-context`.

- [ ] **Step 3: Implement the composable**

Create `src/views/ui/preview-view-context.ts`:

```ts
import { computed } from "vue";

import { Clock, type AnchorString } from "@/calendar";
import { useService } from "@/infrastructure/di";

import { provideViewContext } from "../view-context";
import { ViewsViewModel } from "../view-model";

import type { ViewId } from "../config";

export function provideViewPreviewContext(viewId: ViewId): void {
  const viewsVM = useService(ViewsViewModel);
  const view = computed(() => viewsVM.getView(viewId).getOr(undefined as never));
  provideViewContext({
    viewId,
    viewName: computed(() => view.value?.name ?? ""),
    refDate: computed(() => Clock.now().format("YYYY-MM-DD") as AnchorString),
    shelf: computed(() => view.value?.defaultShelf ?? null),
    setRefDate: () => undefined,
    setShelf: () => undefined,
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/views/ui/preview-view-context.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/ui/preview-view-context.ts src/views/ui/preview-view-context.test.ts
git commit -m "feat(views): add editor preview view-context"
```

---

## Task 7: `useSortableList` composable

**Files:**

- Create: `src/views/ui/use-sortable-list.ts`

> No unit test: this is a thin pass-through to `@vueuse/integrations`' `useSortable`; testing it would test the library (see the spec's testing section). Its effect is exercised indirectly by the component tasks (which mock it).

- [ ] **Step 1: Implement the composable**

Create `src/views/ui/use-sortable-list.ts`:

```ts
import { useSortable } from "@vueuse/integrations/useSortable";

import type { Ref } from "vue";

export function useSortableList<T extends { id: string }>(
  el: Ref<HTMLElement | null>,
  list: Ref<T[]>,
  onReorder: (orderedIds: string[]) => void,
): void {
  useSortable(el, list, {
    handle: "[data-drag-handle]",
    animation: 150,
    onEnd: () => onReorder(list.value.map((item) => item.id)),
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/views/ui/use-sortable-list.ts
git commit -m "feat(views): add useSortableList composable"
```

---

## Task 8: `ToolbarItemFrame.vue`

**Files:**

- Create: `src/views/ui/ToolbarItemFrame.vue`
- Test: `src/views/ui/ToolbarItemFrame.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/views/ui/ToolbarItemFrame.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import * as v from "valibot";
import { afterEach, describe, expect, it, vi } from "vitest";
import { h } from "vue";

import { m } from "@/i18n";

import ToolbarItemFrame from "./ToolbarItemFrame.vue";

import type { BlockInstanceId } from "../config";
import type { ToolbarItemDefinition } from "../define-toolbar-item";

afterEach(() => cleanup());

const itemId = "11111111-1111-1111-1111-aaaaaaaaaaaa" as BlockInstanceId;

const definition = {
  key: "button",
  label: "Button",
  schema: v.object({}),
  defaultConfig: {},
  component: { render: () => h("span", "PREVIEW") },
  configComponent: { render: () => null },
  __brand: "toolbar-item",
} as unknown as ToolbarItemDefinition;

function mount(def: ToolbarItemDefinition | undefined) {
  const onEdit = vi.fn();
  const onRemove = vi.fn();
  render(ToolbarItemFrame, {
    props: { item: { id: itemId, key: "button", config: {} }, definition: def, onEdit, onRemove },
  });
  return { onEdit, onRemove };
}

describe("ToolbarItemFrame", () => {
  it("renders the item's real component as a preview", () => {
    mount(definition);
    expect(screen.getByText("PREVIEW")).toBeTruthy();
  });

  it("emits edit when the edit button is clicked", async () => {
    const { onEdit } = mount(definition);
    await userEvent.click(screen.getByLabelText(m.view_toolbar_item_edit()));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("emits remove when the delete button is clicked", async () => {
    const { onRemove } = mount(definition);
    await userEvent.click(screen.getByLabelText(m.view_toolbar_item_remove()));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("falls back to an unknown-key label when the definition is missing", () => {
    mount(undefined);
    expect(screen.getByText(m.view_toolbar_item_unknown_label({ key: "button" }))).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/views/ui/ToolbarItemFrame.test.ts`
Expected: FAIL — cannot find `./ToolbarItemFrame.vue`.

- [ ] **Step 3: Implement the component**

Create `src/views/ui/ToolbarItemFrame.vue`:

```vue
<script setup lang="ts">
import { m } from "@/i18n";
import { icons } from "@/ui/icons";
import UiIcon from "@/ui/UiIcon.vue";
import UiIconButton from "@/ui/UiIconButton.vue";

import type { BlockInstanceId } from "../config";
import type { ToolbarItemDefinition } from "../define-toolbar-item";

defineProps<{
  item: { id: BlockInstanceId; key: string; config: Record<string, unknown> };
  definition: ToolbarItemDefinition | undefined;
}>();
defineEmits<{ edit: []; remove: [] }>();
</script>

<template>
  <div class="jv-item-frame">
    <span class="jv-frame-grip" data-drag-handle><UiIcon :name="icons.action.dragHandle" /></span>
    <div class="jv-item-preview">
      <component :is="definition.component" v-if="definition" :instance-id="item.id" :config="item.config" />
      <span v-else>{{ m.view_toolbar_item_unknown_label({ key: item.key }) }}</span>
    </div>
    <span class="jv-frame-tools">
      <UiIconButton
        v-if="definition?.configComponent"
        :icon="icons.action.edit"
        :tooltip="m.view_toolbar_item_edit()"
        @click="$emit('edit')"
      />
      <UiIconButton :icon="icons.action.delete" :tooltip="m.view_toolbar_item_remove()" @click="$emit('remove')" />
    </span>
  </div>
</template>

<style scoped>
.jv-item-frame {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2-2);
  padding: var(--size-2-1) var(--size-2-2);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-m);
  background: var(--background-primary);
}
.jv-item-frame:hover {
  border-color: var(--interactive-accent);
}
.jv-frame-grip {
  display: inline-flex;
  cursor: grab;
  color: var(--text-faint);
}
.jv-item-preview {
  display: inline-flex;
  align-items: center;
  pointer-events: none;
}
.jv-frame-tools {
  display: inline-flex;
  gap: var(--size-2-1);
  opacity: 0;
}
.jv-item-frame:hover .jv-frame-tools {
  opacity: 1;
}
</style>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/views/ui/ToolbarItemFrame.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/ui/ToolbarItemFrame.vue src/views/ui/ToolbarItemFrame.test.ts
git commit -m "feat(views): add ToolbarItemFrame with live item preview"
```

---

## Task 9: `ToolbarStrip.vue` (replace `ToolbarItemsList.vue`)

**Files:**

- Create: `src/views/ui/ToolbarStrip.vue`
- Create: `src/views/ui/ToolbarStrip.test.ts`
- Delete: `src/views/ui/ToolbarItemsList.vue`
- Delete: `src/views/ui/ToolbarItemsList.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/views/ui/ToolbarStrip.test.ts` by copying the harness from `src/views/ui/ToolbarItemsList.test.ts` (the `setup()` builder, fixtures, and `mount` helper) and adapting it. Mock the sortable wrapper so jsdom never touches SortableJS:

```ts
vi.mock("./use-sortable-list", () => ({ useSortableList: () => undefined }));
```

Keep these behaviors (translate any that exist in the old test, drop move-button ones):

```ts
describe("ToolbarStrip", () => {
  it("shows the empty state when the toolbar has no items", async () => {
    const { container } = await setup([]);
    mount(container);
    expect(screen.getByText(m.view_toolbar_item_empty())).toBeTruthy();
  });

  it("renders a frame per toolbar item", async () => {
    const { container } = await setup([
      { id: itemIdA, key: "shelf-selector", config: {} },
      { id: itemIdB, key: "button", config: {} },
    ]);
    mount(container);
    expect(screen.getByLabelText(m.view_toolbar_item_remove(), { exact: true })).toBeTruthy();
    expect(screen.getAllByLabelText(m.view_toolbar_item_remove())).toHaveLength(2);
  });

  it("removes an item when its delete button is clicked", async () => {
    const { container } = await setup([{ id: itemIdA, key: "shelf-selector", config: {} }]);
    mount(container);
    await userEvent.click(screen.getByLabelText(m.view_toolbar_item_remove()));
    const repo = container.resolve(ViewsRepository);
    const items = (repo.get(viewId).getOr(undefined as never)?.blocks[0]?.config as { items: unknown[] }).items;
    expect(items).toEqual([]);
  });

  it("invokes AddToolbarItemToBlockFlow when Add is clicked", async () => {
    const { container } = await setup([]);
    mount(container);
    const flows = container.resolve(Flows);
    const spy = vi.spyOn(flows, "invoke").mockReturnValue({ tap: () => undefined } as never);
    await userEvent.click(screen.getByText(m.view_add_toolbar_item()));
    expect(spy).toHaveBeenCalledWith(AddToolbarItemToBlockFlow, { viewId, blockId });
  });

  it("persists the edited config when the edit modal is saved", async () => {
    const { container } = await setup([{ id: itemIdA, key: "button", config: { label: "A" } }]);
    mount(container);
    await userEvent.click(screen.getByLabelText(m.view_toolbar_item_edit()));
    const modals = container.resolve(ModalService) as unknown as FakeModalService;
    modals.lastOpen<unknown, Record<string, unknown>>().submit({ label: "B" });
    const repo = container.resolve(ViewsRepository);
    await waitFor(() => {
      const items = (
        repo.get(viewId).getOr(undefined as never)?.blocks[0]?.config as { items: { config: { label?: string } }[] }
      ).items;
      expect(items[0]?.config.label).toBe("B");
    });
  });
});
```

> Use the fixtures from the old `ToolbarItemsList.test.ts`: `shelfSelectorDefinition` (no `configComponent`), `buttonDefinition` (with `configComponent`), `toolbarBlockDefinition`, and the `setup`/`mount` builders. Register them exactly as the old test did. The button definition's `component` may be `{ render: () => null }`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/views/ui/ToolbarStrip.test.ts`
Expected: FAIL — cannot find `./ToolbarStrip.vue`.

- [ ] **Step 3: Implement the component**

Create `src/views/ui/ToolbarStrip.vue`:

```vue
<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { useModalService } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";

import { ToolbarItemsService } from "../blocks/toolbar/toolbar-items-service";
import { AddToolbarItemToBlockFlow } from "../flows/add-toolbar-item-to-block.flow";
import { ViewsService } from "../service";
import { ViewsViewModel } from "../view-model";

import { editToolbarItemModal } from "./modals";
import ToolbarItemFrame from "./ToolbarItemFrame.vue";
import { useSortableList } from "./use-sortable-list";

import type { BlockInstanceId, ViewId } from "../config";
import type { ToolbarItemDefinition } from "../define-toolbar-item";

const props = defineProps<{ viewId: ViewId; blockId: BlockInstanceId }>();

const flows = useService(Flows);
const modals = useModalService();
const toolbarItems = useService(ToolbarItemsService);
const viewsService = useService(ViewsService);
const viewsVM = useService(ViewsViewModel);

interface Row {
  id: BlockInstanceId;
  key: string;
  config: Record<string, unknown>;
  definition: ToolbarItemDefinition | undefined;
}

const source = computed<Row[]>(() => {
  const items = viewsVM
    .getView(props.viewId)
    .map((view) => view.blocks.find((b) => b.id === props.blockId))
    .map((block) => (block ? toolbarItems.itemsOf(block) : []))
    .getOr([]);
  return items.map((item) => ({
    id: item.id,
    key: item.key,
    config: item.config,
    definition: viewsService.getToolbarItemDefinition(item.key).getOr(undefined as never),
  }));
});

const rows = ref<Row[]>([]);
watch(source, (next) => (rows.value = [...next]), { immediate: true, deep: true });

const stripEl = ref<HTMLElement | null>(null);
useSortableList(stripEl, rows, (orderedIds) => {
  void viewsService.setToolbarItemOrder(props.viewId, props.blockId, orderedIds as BlockInstanceId[]);
});

const add = (): void => void flows.invoke(AddToolbarItemToBlockFlow, { viewId: props.viewId, blockId: props.blockId });
const remove = (id: BlockInstanceId): void => void viewsService.removeToolbarItem(props.viewId, props.blockId, id);

function edit(row: Row): void {
  if (!row.definition?.configComponent) return;
  void modals
    .open(editToolbarItemModal, { component: row.definition.configComponent, config: row.config })
    .tap((next) => void viewsService.updateToolbarItemConfig(props.viewId, props.blockId, row.id, next));
}
</script>

<template>
  <div class="jv-toolbar-strip">
    <div v-if="rows.length === 0" class="jv-strip-empty">{{ m.view_toolbar_item_empty() }}</div>
    <div ref="stripEl" class="jv-strip-items">
      <ToolbarItemFrame
        v-for="row of rows"
        :key="row.id"
        :item="row"
        :definition="row.definition"
        @edit="edit(row)"
        @remove="remove(row.id)"
      />
    </div>
    <UiButton @click="add">{{ m.view_add_toolbar_item() }}</UiButton>
  </div>
</template>

<style scoped>
.jv-toolbar-strip {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-2);
  padding-left: var(--size-4-4);
}
.jv-strip-items {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--size-2-2);
}
.jv-strip-empty {
  color: var(--text-muted);
}
</style>
```

- [ ] **Step 4: Delete the old list and its test**

Run:

```bash
git rm src/views/ui/ToolbarItemsList.vue src/views/ui/ToolbarItemsList.test.ts
```

(`BlocksList.vue` still imports `ToolbarItemsList` at this point — that import is fixed in Task 11. The build stays green because Task 11 runs before any full type-check; if you run `check:types` now it will fail on that import, which is expected and resolved in Task 11.)

- [ ] **Step 5: Run the new test to verify it passes**

Run: `npm run test -- src/views/ui/ToolbarStrip.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/views/ui/ToolbarStrip.vue src/views/ui/ToolbarStrip.test.ts
git commit -m "feat(views): add ToolbarStrip replacing ToolbarItemsList"
```

---

## Task 10: `BlockFrame.vue`

**Files:**

- Create: `src/views/ui/BlockFrame.vue`
- Test: `src/views/ui/BlockFrame.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/views/ui/BlockFrame.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";

import BlockFrame from "./BlockFrame.vue";

afterEach(() => cleanup());

function mount(props: { icon?: string; label: string; summary?: string; editable: boolean }) {
  const onEdit = vi.fn();
  const onRemove = vi.fn();
  render(BlockFrame, { props: { ...props, onEdit, onRemove } });
  return { onEdit, onRemove };
}

describe("BlockFrame", () => {
  it("shows the label", () => {
    mount({ label: "Month calendar", editable: false });
    expect(screen.getByText("Month calendar")).toBeTruthy();
  });

  it("shows the summary when provided", () => {
    mount({ label: "Month calendar", summary: "Week numbers: left", editable: false });
    expect(screen.getByText("Week numbers: left")).toBeTruthy();
  });

  it("offers an edit button when editable", () => {
    mount({ label: "X", editable: true });
    expect(screen.getByLabelText(m.view_block_edit())).toBeTruthy();
  });

  it("hides the edit button when not editable", () => {
    mount({ label: "X", editable: false });
    expect(screen.queryByLabelText(m.view_block_edit())).toBeNull();
  });

  it("emits remove when delete is clicked", async () => {
    const { onRemove } = mount({ label: "X", editable: false });
    await userEvent.click(screen.getByLabelText(m.view_block_remove()));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/views/ui/BlockFrame.test.ts`
Expected: FAIL — cannot find `./BlockFrame.vue`.

- [ ] **Step 3: Implement the component**

Create `src/views/ui/BlockFrame.vue`:

```vue
<script setup lang="ts">
import { m } from "@/i18n";
import { icons } from "@/ui/icons";
import UiIcon from "@/ui/UiIcon.vue";
import UiIconButton from "@/ui/UiIconButton.vue";

defineProps<{ icon?: string; label: string; summary?: string; editable: boolean }>();
defineEmits<{ edit: []; remove: [] }>();
</script>

<template>
  <div class="jv-block-frame">
    <span class="jv-frame-grip" data-drag-handle><UiIcon :name="icons.action.dragHandle" /></span>
    <UiIcon v-if="icon" :name="icon" class="jv-block-icon" />
    <span class="jv-block-label">{{ label }}</span>
    <span v-if="summary" class="jv-block-summary">{{ summary }}</span>
    <span class="jv-frame-spacer" />
    <span class="jv-frame-tools">
      <UiIconButton v-if="editable" :icon="icons.action.edit" :tooltip="m.view_block_edit()" @click="$emit('edit')" />
      <UiIconButton :icon="icons.action.delete" :tooltip="m.view_block_remove()" @click="$emit('remove')" />
    </span>
  </div>
</template>

<style scoped>
.jv-block-frame {
  display: flex;
  align-items: center;
  gap: var(--size-2-2);
  padding: var(--size-2-2) var(--size-4-1);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-m);
  background: var(--background-secondary);
}
.jv-block-frame:hover {
  border-color: var(--interactive-accent);
}
.jv-frame-grip {
  display: inline-flex;
  cursor: grab;
  color: var(--text-faint);
}
.jv-block-icon {
  color: var(--text-muted);
}
.jv-block-label {
  font-weight: var(--font-semibold);
}
.jv-block-summary {
  color: var(--text-muted);
  font-size: var(--font-ui-smaller);
}
.jv-frame-spacer {
  flex: 1;
}
.jv-frame-tools {
  display: inline-flex;
  gap: var(--size-2-1);
  opacity: 0;
}
.jv-block-frame:hover .jv-frame-tools {
  opacity: 1;
}
</style>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/views/ui/BlockFrame.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/ui/BlockFrame.vue src/views/ui/BlockFrame.test.ts
git commit -m "feat(views): add BlockFrame block row"
```

---

## Task 11: Rewrite `BlocksList.vue`

**Files:**

- Modify: `src/views/ui/BlocksList.vue` (full rewrite)
- Modify: `src/views/ui/BlocksList.test.ts`

- [ ] **Step 1: Update the test**

In `src/views/ui/BlocksList.test.ts`:

- Add the sortable mock at the top (after imports): `vi.mock("./use-sortable-list", () => ({ useSortableList: () => undefined }));`
- **Delete** the two tests `"disables Move up on the first row"` and `"disables Move down on the last row"` (those buttons no longer exist).
- Change the test `"renders a ToolbarItemsList when a block's key is 'toolbar'"` to read `"renders a ToolbarStrip when a block's key is 'toolbar'"` (the assertion `expect(screen.getByText(m.view_toolbar_item_empty())).toBeTruthy()` stays valid).
- Add a summary test:

```ts
it("renders a block's config summary", async () => {
  const summaryDefinition = {
    key: "with-summary",
    label: "Summarised",
    schema: v.object({}),
    defaultConfig: {},
    component: { render: () => null },
    summary: () => "the summary",
  } as unknown as ViewBlockDefinition;
  const { container } = await setup([{ id: blockIdA, key: "with-summary", config: {} }]);
  container.register(ViewBlockDefinitionToken).useValue(summaryDefinition);
  mount(container);
  expect(screen.getByText("the summary")).toBeTruthy();
});
```

> `ViewBlockDefinitionToken` is already imported in this test file. Registering an extra definition after `setup()` and before `mount()` works because `mount()` resolves the view-model lazily at render time. Keep the existing `"renders the definition label"`, `"renders an unknown-key fallback label"`, `"removes a block"`, `"invokes AddBlockToViewFlow"`, and the `"editing a block's config"` describe — they remain valid (labels resolved via `aria-label`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/views/ui/BlocksList.test.ts`
Expected: FAIL — `BlocksList` still imports `ToolbarItemsList` (deleted) / summary not rendered.

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `src/views/ui/BlocksList.vue`:

```vue
<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { useModalService } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";

import { AddBlockToViewFlow } from "../flows/add-block-to-view.flow";
import { ViewsService } from "../service";
import { ViewsViewModel } from "../view-model";

import BlockFrame from "./BlockFrame.vue";
import { editBlockModal } from "./modals";
import { provideViewPreviewContext } from "./preview-view-context";
import ToolbarStrip from "./ToolbarStrip.vue";
import { useSortableList } from "./use-sortable-list";

import type { BlockInstanceId, ViewId } from "../config";
import type { ViewBlockDefinition } from "../define-view-block";

const props = defineProps<{ viewId: ViewId }>();

provideViewPreviewContext(props.viewId);

const flows = useService(Flows);
const modals = useModalService();
const viewsService = useService(ViewsService);
const viewsVM = useService(ViewsViewModel);

interface RowEntry {
  id: BlockInstanceId;
  key: string;
  config: Record<string, unknown>;
  definition: ViewBlockDefinition | undefined;
}

const source = computed<RowEntry[]>(() => {
  const blocks = viewsVM
    .getView(props.viewId)
    .map((view) => view.blocks)
    .getOr([]);
  return blocks.map((block) => ({
    id: block.id,
    key: block.key,
    config: block.config,
    definition: viewsService.getBlockDefinition(block.key).getOr(undefined as never),
  }));
});

const rows = ref<RowEntry[]>([]);
watch(source, (next) => (rows.value = [...next]), { immediate: true, deep: true });

const listEl = ref<HTMLElement | null>(null);
useSortableList(listEl, rows, (orderedIds) => {
  void viewsService.setBlockOrder(props.viewId, orderedIds as BlockInstanceId[]);
});

function labelOf(row: RowEntry): string {
  return row.definition ? row.definition.label : m.view_block_unknown_label({ key: row.key });
}

function summaryOf(row: RowEntry): string | undefined {
  if (row.key === "toolbar") {
    const items = (row.config.items as unknown[] | undefined) ?? [];
    return m.view_block_toolbar_item_count({ count: items.length });
  }
  return row.definition?.summary?.(row.config);
}

const add = (): void => void flows.invoke(AddBlockToViewFlow, { viewId: props.viewId });
const remove = (id: BlockInstanceId): void => void viewsService.removeBlock(props.viewId, id);

function edit(row: RowEntry): void {
  if (!row.definition?.configComponent) return;
  void modals
    .open(editBlockModal, { component: row.definition.configComponent, config: row.config })
    .tap((next) => void viewsService.updateBlockConfig(props.viewId, row.id, next));
}
</script>

<template>
  <div v-if="rows.length === 0" class="jv-blocks-empty">{{ m.view_edit_blocks_empty() }}</div>
  <div ref="listEl" class="jv-blocks-list">
    <div v-for="row of rows" :key="row.id" class="jv-block-entry">
      <BlockFrame
        :icon="row.definition?.icon"
        :label="labelOf(row)"
        :summary="summaryOf(row)"
        :editable="!!row.definition?.configComponent"
        @edit="edit(row)"
        @remove="remove(row.id)"
      />
      <ToolbarStrip v-if="row.key === 'toolbar'" :view-id="props.viewId" :block-id="row.id" />
    </div>
  </div>
  <UiButton cta @click="add">{{ m.view_add_block() }}</UiButton>
</template>

<style scoped>
.jv-blocks-list {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-3);
  margin-bottom: var(--size-4-2);
}
.jv-block-entry {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-2);
}
.jv-blocks-empty {
  color: var(--text-muted);
  margin-bottom: var(--size-4-2);
}
</style>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/views/ui/BlocksList.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/ui/BlocksList.vue src/views/ui/BlocksList.test.ts
git commit -m "feat(views): rewrite BlocksList with sortable frames and toolbar strip"
```

---

## Task 12: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: PASS. (If any test references the removed `ToolbarItemsList`, `moveBlockUp/Down`, `moveToolbarItem*`, or `moveItem`, fix the reference — there should be none left outside the files already edited.)

- [ ] **Step 2: Type-check**

Run: `npm run check:types`
Expected: PASS (no dangling import of `ToolbarItemsList`).

- [ ] **Step 3: Lint**

Run: `npm run check:lint`
Expected: PASS. (No `eslint-disable`; if the `byId.get(...)!` non-null assertions trip a rule, restructure to a guarded lookup rather than disabling.)

- [ ] **Step 4: e2e (runtime-touching)**

Run the wdio e2e suite per the project's e2e command (see `package.json` scripts, e.g. `npm run e2e`).
Expected: PASS. The editor now mounts real toolbar-item components in settings; confirm the suite is green. Adding a dedicated drag-reorder e2e is optional and, if added, must be isolated (drag is the most flake-prone wdio surface).

- [ ] **Step 5: Manual smoke test**

Use the `run` skill (or `npm run dev` + reload Obsidian) to open Settings → Journals → a view → edit. Confirm:

- blocks show icon + label + summary; the toolbar block shows a live strip of real items;
- dragging a grip reorders blocks and toolbar items, and the order survives a settings reopen;
- edit (pencil) opens the existing config modal and saves; delete removes; "Add block" / "Add toolbar item" still work.

- [ ] **Step 6: Final commit (if the smoke test required tweaks)**

```bash
git add -A
git commit -m "test(views): verify view-editor redesign end to end"
```

---

## Self-Review Notes

- **Spec coverage:** A3 frames (Tasks 8, 10), WYSIWYG strip with preview context (Tasks 6, 8, 9), drag-and-drop via `useSortable` (Tasks 1, 7), `setBlockOrder`/`setToolbarItemOrder` with move-method removal (Tasks 2, 3), block summaries on the definition (Task 5), `icons.action.dragHandle` (Task 1), `ToolbarItemsList` deletion (Task 9). All spec sections map to a task.
- **Types:** `setBlockOrder`/`setToolbarItemOrder`/`reorder` signatures match between service, toolbar-items-service, and call sites; `summary?: (config: TConfig) => string | undefined` is consistent between the definition type and all four block implementations; `useSortableList(el, list, onReorder)` matches both call sites.
- **No placeholders:** every code step shows complete code; the only deferred detail is "copy the exact `createSettingsService` harness" in Tasks 6/9, which points to concrete existing line ranges.
