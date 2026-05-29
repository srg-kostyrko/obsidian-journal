# v3 journal views — blocks & toolbar items implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the MVP block catalogue (toolbar, month-calendar, week-calendar, custom-intervals, divider) and toolbar item catalogue (button, shelf-selector, period-buttons) for the v3 journal views feature, per `docs/superpowers/specs/2026-05-28-v3-journal-views-design.md`.

**Architecture:** Each block / toolbar item is its own folder under `src/views/blocks/` or `src/views/toolbar-items/` containing a `.ts` registration, a `.vue` runtime component, an optional `.config.vue` editor, plus colocated tests. Registration goes through `ViewBlockDefinitionToken` (existing) and a new `ToolbarItemDefinitionToken` multi-binding. The toolbar block is a container whose own schema carries `{ items: ToolbarItemInstance[] }`; its component iterates the items and resolves each against the toolbar-item registry. Toolbar-item mutations land as new `ViewsService` methods (`addToolbarItem`, `removeToolbarItem`, `moveToolbarItemUp/Down`, `updateToolbarItemConfig`). Blocks read `ViewContext` (already provided by `JournalViewLeaf`) via `useViewContext()`.

**Tech Stack:** Vue 3 SFCs + `@testing-library/vue` + `@testing-library/user-event`, valibot schemas, `ts-pattern` for discriminated dispatch, `useService(...)` for DI access from components, paraglide `m.*()` for i18n strings (source: `messages/en.json`).

**Out of scope for this plan** (deferred to a follow-up):

- v2 → v3 settings migration & default-Calendar-view seeding
- Legacy `CALENDAR_VIEW_TYPE` adapter
- The "Active style" `viewsActiveStyle` slice rename
- Journal `intervalBlock` _editing UI_ in `JournalEditSubpage.vue` — the **schema field is added in this plan** so `custom-intervals` has rows to render, but the UI can stay defaulted (rows: []) for now

**Conventions called out by repo feedback memories used in this plan:**

- One behavior per test; subject+verb describe names; nested describes for hierarchy.
- Inline `defineProps<{...}>()` in SFCs; no `XxxProps` interface unless reused.
- Use `match(...).with(...).exhaustive()` for discriminated dispatch (no switch).
- Use `attempt.in(this, async function* () {...})` in service methods that compose Result/AsyncResult.
- `defineModal<TResult>()(input)` curried; modals consolidate in `src/views/ui/modals.ts`.
- `expectOk` / `expectErr` from `@/infrastructure/result/testing` for Result assertions.
- Field-initializer DI: `readonly #foo = inject(FooToken);` (no constructor-body assignments).
- No vitest wrappers, no whole-object equality on logs, no testing-library `@vue/test-utils` `data-testid` ad-hoc selectors when role queries work.
- Don't test wiring (DI binding shapes, barrel exports, module composition).
- i18n: never wrap `m.xxx()` in computed unless it takes reactive args.

---

## File structure

### New files

```
src/views/
  define-toolbar-item.ts                    factory + ToolbarItemDefinition types
  toolbar-item-registry.test.ts             (no registry class; multi-binding only — but include resolution behavior in service test)
  ui/
    ToolbarItemsList.vue                    list of items inside a toolbar block row
    ToolbarItemsList.test.ts
    AddToolbarItemPickerModal.vue           action-flattened picker
    AddToolbarItemPickerModal.test.ts
  flows/
    add-toolbar-item-to-block.flow.ts
    add-toolbar-item-to-block.flow.test.ts
  blocks/
    divider/
      divider-block.ts                      defineViewBlock(...)
      DividerBlock.vue
      DividerBlock.test.ts
    toolbar/
      toolbar-block.ts
      ToolbarBlock.vue
      ToolbarBlock.test.ts
    month-calendar/
      month-calendar-block.ts
      MonthCalendarBlock.vue
      MonthCalendarBlock.test.ts
      MonthCalendarBlockConfig.vue
      MonthCalendarBlockConfig.test.ts
    week-calendar/
      week-calendar-block.ts
      WeekCalendarBlock.vue
      WeekCalendarBlock.test.ts
      WeekCalendarBlockConfig.vue
      WeekCalendarBlockConfig.test.ts
    custom-intervals/
      custom-intervals-block.ts
      CustomIntervalsBlock.vue
      CustomIntervalsBlock.test.ts
      CustomIntervalsBlockConfig.vue
      CustomIntervalsBlockConfig.test.ts
      window-resolution.ts                 pure: WindowKind + refDate → AnchorString range
      window-resolution.test.ts
  toolbar-items/
    shelf-selector/
      shelf-selector-item.ts
      ShelfSelectorItem.vue
      ShelfSelectorItem.test.ts
    period-buttons/
      period-buttons-item.ts
      PeriodButtonsItem.vue
      PeriodButtonsItem.test.ts
      PeriodButtonsItemConfig.vue
      PeriodButtonsItemConfig.test.ts
    button/
      button-item.ts
      button-config.ts                      action schema + per-action default resolver
      button-config.test.ts
      ButtonItem.vue
      ButtonItem.test.ts
      ButtonItemConfig.vue
      ButtonItemConfig.test.ts
```

### Modified files

```
src/views/tokens.ts                         add ToolbarItemDefinitionToken
src/views/service.ts                        + addToolbarItem/removeToolbarItem/moveToolbarItemUp|Down/updateToolbarItemConfig + getToolbarItemDefinition
src/views/service.test.ts                   cover new toolbar-item ops
src/views/index.ts                          export defineToolbarItem, ToolbarItem types, registration token
src/views/ui/modals.ts                      add addToolbarItemPickerModal definition
src/views/ui/BlocksList.vue                 render <ToolbarItemsList :viewId :blockId/> under each toolbar block row
src/views/ui/BlocksList.test.ts             one new test for the toolbar-block nested list path
src/views/module.ts                         register definitions + AddToolbarItemToBlockFlow
src/journals/config.ts                      add `intervalBlock: JournalNavBlock` field (default { rows: [], decorateWholeBlock: false })
src/journals/config.test.ts                 cover the new field default
src/journals/index.ts                       (no-op if intervalBlock type is already covered by JournalConfig inference)
messages/en.json                            new keys; see "i18n strings" section below
```

### Files NOT touched in this plan

- `src/views/view-leaf.ts` — already iterates blocks correctly and validates each via the registered schema; no changes needed.
- `src/views/view-host.ts` — out of scope (command/ribbon are not affected by this work).
- `src/_old-code/calendar-view/` — left alone; deletion belongs to the migration plan.
- `src/settings/migrations.ts` — out of scope.

---

## i18n strings to add to `messages/en.json`

Add the following keys in alphabetical position (the file is sorted by key). All keys use the existing `view_` / `view_block_` / `view_toolbar_` namespace.

```jsonc
"view_add_toolbar_item_modal_title": "Add toolbar item",
"view_add_toolbar_item_empty": "No toolbar items are registered.",
"view_block_divider_label": "Divider",
"view_block_month_calendar_label": "Month calendar",
"view_block_month_calendar_description": "Stacks one or more month grids around the reference date.",
"view_block_week_calendar_label": "Week calendar",
"view_block_week_calendar_description": "Stacks one or more week strips around the reference date.",
"view_block_custom_intervals_label": "Custom intervals",
"view_block_custom_intervals_description": "Lists custom-journal entries that overlap a configurable window.",
"view_block_toolbar_label": "Toolbar",
"view_block_toolbar_description": "Container for toolbar items such as buttons and the shelf selector.",
"view_block_config_before_label": "Months before",
"view_block_config_after_label": "Months after",
"view_block_config_before_weeks_label": "Weeks before",
"view_block_config_after_weeks_label": "Weeks after",
"view_block_config_hide_weekends_label": "Hide weekends",
"view_block_config_window_label": "Window",
"view_block_config_window_current_week": "Current week",
"view_block_config_window_current_month": "Current month",
"view_block_config_window_current_quarter": "Current quarter",
"view_block_config_window_current_year": "Current year",
"view_block_config_hide_empty_label": "Hide empty journals",
"view_toolbar_item_unknown_label": "Unknown toolbar item: {key}",
"view_toolbar_item_move_up": "Move up",
"view_toolbar_item_move_down": "Move down",
"view_toolbar_item_remove": "Remove toolbar item",
"view_toolbar_item_add": "Add toolbar item",
"view_toolbar_item_empty": "No toolbar items yet.",
"view_toolbar_button_label": "Button",
"view_toolbar_button_description": "Generic action button (pick a date, jump to current, navigate by step).",
"view_toolbar_button_preset_pick_date": "Pick date",
"view_toolbar_button_preset_today": "Today",
"view_toolbar_button_preset_prev_month": "Navigate previous month",
"view_toolbar_button_preset_next_month": "Navigate next month",
"view_toolbar_button_default_tooltip_pick_day": "Pick a date",
"view_toolbar_button_default_tooltip_pick_multi": "Open a note",
"view_toolbar_button_default_label_today": "Today",
"view_toolbar_button_default_label_this_week": "This week",
"view_toolbar_button_default_label_this_month": "This month",
"view_toolbar_button_default_label_this_quarter": "This quarter",
"view_toolbar_button_default_label_this_year": "This year",
"view_toolbar_button_default_label_current": "Current",
"view_toolbar_button_default_tooltip_current_multi": "Jump to current…",
"view_toolbar_button_default_tooltip_prev_unit": "Previous {unit}",
"view_toolbar_button_default_tooltip_next_unit": "Next {unit}",
"view_toolbar_button_menu_pick": "Pick {unit}",
"view_toolbar_shelf_selector_label": "Shelf selector",
"view_toolbar_shelf_selector_description": "Switches which shelf scopes the view's journals.",
"view_toolbar_shelf_selector_all": "All journals",
"view_toolbar_period_buttons_label": "Period buttons",
"view_toolbar_period_buttons_description": "Shows clickable badges for the current week, month, quarter, year periods.",
"view_toolbar_period_buttons_config_week": "Show week",
"view_toolbar_period_buttons_config_month": "Show month",
"view_toolbar_period_buttons_config_quarter": "Show quarter",
"view_toolbar_period_buttons_config_year": "Show year",
```

Whenever a step's code references `m.<key>(...)`, the engineer must have already added the corresponding `messages/en.json` entry (paraglide regenerates `src/i18n/paraglide/...` on build; running tests via `npm test` triggers the project's existing prebuild step that runs paraglide). When adding a new key, run `npm test` once to regenerate before referencing `m.<key>` from TS.

---

## Verification commands

After every task, the engineer runs all three before committing:

```bash
npm test
npm run check:types
npm run check:lint
```

(Per `[[feedback_quality_gates]]` and `[[feedback_test_commands]]`.)

---

# Task 1: Add `define-toolbar-item` factory + DI token

**Files:**

- Create: `src/views/define-toolbar-item.ts`
- Modify: `src/views/tokens.ts`
- Modify: `src/views/index.ts`

- [ ] **Step 1: Add the token**

Edit `src/views/tokens.ts`. After the existing `ViewBlockDefinitionToken`, add:

```ts
import type { ToolbarItemDefinition } from "./define-toolbar-item";

export const ToolbarItemDefinitionToken = createMultiToken<ToolbarItemDefinition>("views.toolbar-item");
```

- [ ] **Step 2: Write the factory file**

Create `src/views/define-toolbar-item.ts`:

```ts
import type { BlockInstanceId } from "./config";
import type { BaseIssue, BaseSchema } from "valibot";
import type { Component } from "vue";

export interface ToolbarItemProps<TConfig> {
  readonly instanceId: BlockInstanceId;
  readonly config: TConfig;
}

export interface ToolbarItemPreset<TConfig> {
  readonly label: string;
  readonly defaultConfig: TConfig;
}

export interface ToolbarItemDefinitionInput<TConfig> {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly icon?: string;
  readonly schema: BaseSchema<unknown, TConfig, BaseIssue<unknown>>;
  readonly defaultConfig: TConfig;
  readonly component: Component<ToolbarItemProps<TConfig>>;
  readonly configComponent?: Component<{ config: TConfig; onChange: (next: TConfig) => void }>;
  readonly presets?: readonly ToolbarItemPreset<TConfig>[];
}

export interface ToolbarItemDefinition<TConfig = unknown> extends ToolbarItemDefinitionInput<TConfig> {
  readonly __brand: "toolbar-item";
}

export function defineToolbarItem<TConfig>(input: ToolbarItemDefinitionInput<TConfig>): ToolbarItemDefinition<TConfig> {
  return { ...input, __brand: "toolbar-item" };
}
```

- [ ] **Step 3: Re-export from the barrel**

Edit `src/views/index.ts`. Add (preserving alphabetical-ish ordering already present):

```ts
export { defineToolbarItem } from "./define-toolbar-item";
export type {
  ToolbarItemDefinition,
  ToolbarItemDefinitionInput,
  ToolbarItemPreset,
  ToolbarItemProps,
} from "./define-toolbar-item";
export { ToolbarItemDefinitionToken } from "./tokens";
```

- [ ] **Step 4: Run gates**

```bash
npm run check:types && npm run check:lint
```

Expected: PASS (no test added for the factory itself per `[[feedback_no_wiring_tests]]`/`[[feedback_no_trivial_tests]]`).

- [ ] **Step 5: Commit**

```bash
git add src/views/define-toolbar-item.ts src/views/tokens.ts src/views/index.ts
git commit -m "feat(views): defineToolbarItem factory + registration token"
```

---

# Task 2: Extend `ViewsService` with toolbar-item operations

**Files:**

- Modify: `src/views/service.ts`
- Modify: `src/views/service.test.ts`

Toolbar items live inside a _toolbar block's_ config: `block.config = { items: ToolbarItemInstance[] }`. The service mutates these as a unit.

The signatures (matching the spec):

```ts
addToolbarItem(
  viewId: ViewId,
  blockId: BlockInstanceId,
  itemKey: string,
  defaultConfig?: unknown,        // optional preset override (default = definition.defaultConfig)
): AsyncResult<BlockInstanceId, UnknownViewError | UnknownToolbarItemKeyError>

removeToolbarItem(
  viewId: ViewId, blockId: BlockInstanceId, itemId: BlockInstanceId,
): AsyncResult<void, UnknownViewError>

moveToolbarItemUp / moveToolbarItemDown(
  viewId: ViewId, blockId: BlockInstanceId, itemId: BlockInstanceId,
): AsyncResult<void, UnknownViewError>

updateToolbarItemConfig(
  viewId, blockId, itemId, config: unknown,
): AsyncResult<void, UnknownViewError | InvalidToolbarItemConfigError>

getToolbarItemDefinition(key: string): Option<ToolbarItemDefinition>
```

If the target `blockId` is not present on the view, the op silently succeeds (matches `removeBlock` shape on miss). If the block exists but its `config.items` is missing/not-an-array (block isn't the toolbar block), the op also silently succeeds — write-path validation later rejects bad configs at `updateBlockConfig` time, so this is a defense not a contract.

- [ ] **Step 1: Add the new error classes**

Edit `src/views/errors.ts`. Append:

```ts
export class UnknownToolbarItemKeyError extends Error {
  readonly kind = "unknown-toolbar-item-key" as const;
  constructor(public readonly key: string) {
    super(`Unknown toolbar item key: ${key}`);
    this.name = "UnknownToolbarItemKeyError";
  }
}

export class InvalidToolbarItemConfigError extends Error {
  readonly kind = "invalid-toolbar-item-config" as const;
  constructor(
    public readonly viewId: ViewId,
    public readonly blockId: BlockInstanceId,
    public readonly itemId: BlockInstanceId,
    public readonly key: string,
    public readonly issues: readonly BaseIssue<unknown>[],
  ) {
    super(`Invalid config for toolbar item ${key} in view ${viewId} (block ${blockId} / item ${itemId})`);
    this.name = "InvalidToolbarItemConfigError";
  }
}
```

Extend the `ViewsLifecycleError` union:

```ts
export type ViewsLifecycleError =
  | InvalidViewNameError
  | UnknownViewError
  | UnknownViewBlockKeyError
  | UnknownToolbarItemKeyError;
```

Re-export both from `src/views/index.ts`.

- [ ] **Step 2: Write the failing tests in `service.test.ts`**

Append a new `describe` block inside the existing `describe("ViewsService", ...)` after the current ones. The shape of test setup mirrors what's already in the file (the existing `build()` helper, the existing `trivialBlock`). Define a dedicated toolbar-block definition and toolbar-item definition local to the test:

```ts
import { ToolbarItemDefinitionToken } from "./tokens";
import { defineToolbarItem, type ToolbarItemDefinition } from "./define-toolbar-item";

const toolbarBlock = defineViewBlock<{ items: { id: string; key: string; config: Record<string, unknown> }[] }>({
  key: "toolbar",
  label: "Toolbar",
  schema: v.object({
    items: v.array(
      v.object({
        id: v.pipe(v.string(), v.uuid()),
        key: v.pipe(v.string(), v.minLength(1)),
        config: v.record(v.string(), v.unknown()),
      }),
    ),
  }),
  defaultConfig: { items: [] },
  component: { setup: () => noop },
});

const dummyItem = defineToolbarItem<{ x: number }>({
  key: "dummy",
  label: "Dummy",
  schema: v.object({ x: v.number() }),
  defaultConfig: { x: 0 },
  component: { setup: () => noop },
});
```

Extend the `build()` helper so it can take `items?: readonly ToolbarItemDefinition[]` and register them under `ToolbarItemDefinitionToken`.

Then add tests covering ONE behavior each (per `[[feedback_one_behavior_per_test]]`):

```ts
describe("addToolbarItem", () => {
  it("appends a new item to the toolbar block's items array", async () => {
    const view: View = {
      ...seedView(),
      blocks: [{ id: "b1" as BlockInstanceId, key: "toolbar", config: { items: [] } }],
    };
    const { service, repo } = build({ seeds: { [view.id]: view }, blocks: [toolbarBlock], items: [dummyItem] });
    const r = await service.addToolbarItem(view.id, "b1" as BlockInstanceId, "dummy");
    expectOk(r);
    const items = (repo.get(view.id).getOr(undefined as never)!.blocks[0].config as { items: unknown[] }).items;
    expect(items).toHaveLength(1);
  });

  it("returns UnknownToolbarItemKeyError when the key is not registered", async () => {
    const view: View = {
      ...seedView(),
      blocks: [{ id: "b1" as BlockInstanceId, key: "toolbar", config: { items: [] } }],
    };
    const { service } = build({ seeds: { [view.id]: view }, blocks: [toolbarBlock], items: [] });
    const r = await service.addToolbarItem(view.id, "b1" as BlockInstanceId, "missing");
    expectErr(r);
    expect(r.error.kind).toBe("unknown-toolbar-item-key");
  });

  it("uses the supplied defaultConfig override when provided", async () => {
    /* ... */
  });

  it("is a no-op when the block id is not present on the view", async () => {
    /* ... */
  });
});

describe("removeToolbarItem", () => {
  it("removes the matching item", async () => {
    /* ... */
  });
  it("is a no-op when the item id is absent", async () => {
    /* ... */
  });
});

describe("moveToolbarItemUp / moveToolbarItemDown", () => {
  it("swaps with the previous item when moving up", async () => {
    /* ... */
  });
  it("does nothing when the item is already first", async () => {
    /* ... */
  });
  it("swaps with the next item when moving down", async () => {
    /* ... */
  });
});

describe("updateToolbarItemConfig", () => {
  it("persists a valid config", async () => {
    /* ... */
  });
  it("returns InvalidToolbarItemConfigError when the new config fails schema validation", async () => {
    /* ... */
  });
  it("persists without validation and logs when the toolbar-item key is unregistered", async () => {
    /* ... */
  });
});

describe("getToolbarItemDefinition", () => {
  it("returns Some for a registered key", async () => {
    /* ... */
  });
  it("returns None for an unknown key", async () => {
    /* ... */
  });
});
```

Fill each `/* ... */` body by mirroring the corresponding existing block-level test (e.g. `addBlock` for `addToolbarItem`, `removeBlock` for `removeToolbarItem`, `updateBlockConfig` for `updateToolbarItemConfig`).

- [ ] **Step 3: Run tests to confirm they fail**

```bash
npm test -- src/views/service.test.ts
```

Expected: FAIL with "addToolbarItem is not a function" (or similar).

- [ ] **Step 4: Implement the methods on `ViewsService`**

In `src/views/service.ts`, add:

```ts
// In the constructor body, after the existing #blocks population:
constructor() {
  const blocks = new Map<string, ViewBlockDefinition>();
  for (const definition of this.#blockList) blocks.set(definition.key, definition);
  this.#blocks = blocks;
  const items = new Map<string, ToolbarItemDefinition>();
  for (const definition of this.#itemList) items.set(definition.key, definition);
  this.#items = items;
}

readonly #itemList = inject(ToolbarItemDefinitionToken);
readonly #items: ReadonlyMap<string, ToolbarItemDefinition>;
```

Then add the methods. Use `attempt.in(this, async function* () {...})` per `[[feedback_attempt_in_over_this_shadow]]`. Helper used by all three:

```ts
#withToolbarBlock<TIn extends { items: ToolbarItemInstance[] }>(
  current: View,
  blockId: BlockInstanceId,
  mutate: (items: ToolbarItemInstance[]) => ToolbarItemInstance[],
): View["blocks"] | null {
  return current.blocks.map((b) => {
    if (b.id !== blockId) return b;
    const itemsValue = (b.config as { items?: unknown }).items;
    if (!Array.isArray(itemsValue)) return b;
    return { ...b, config: { ...b.config, items: mutate(itemsValue as ToolbarItemInstance[]) } };
  });
}
```

(`ToolbarItemInstance` is a local type alias `{ id: BlockInstanceId; key: string; config: Record<string, unknown> }`. Declare it at the top of the file.)

Implementation of each method (sketch — engineer copies the structure of the existing `addBlock`/`removeBlock`/`#move`/`updateBlockConfig`):

```ts
addToolbarItem(
  id: ViewId,
  blockId: BlockInstanceId,
  itemKey: string,
  defaultConfig?: unknown,
): AsyncResult<BlockInstanceId, UnknownViewError | UnknownToolbarItemKeyError> {
  return attempt.in(this, async function* () {
    const current = yield* this.#repo.get(id).okOrElse(() => new UnknownViewError(id));
    const definition = yield* Option.fromNullable(this.#items.get(itemKey) ?? null).okOrElse(
      () => new UnknownToolbarItemKeyError(itemKey),
    );
    const itemId = crypto.randomUUID() as BlockInstanceId;
    const cfg = (defaultConfig ?? definition.defaultConfig) as Record<string, unknown>;
    const newItem: ToolbarItemInstance = { id: itemId, key: itemKey, config: cfg };
    const blocks = this.#withToolbarBlock(current, blockId, (items) => [...items, newItem]);
    if (blocks === null || blocks === current.blocks) return itemId;
    yield* this.#repo.update(id, { blocks }).mapErr((cause): UnknownViewError => {
      if (cause.kind === "unknown-view") return cause;
      throw new ViewsInvariantError(`unreachable: repo.update returned ${cause.kind}`);
    });
    return itemId;
  });
}
```

(The other methods follow the same shape; reorder uses swap-by-index, update walks `items` by id and validates against `definition.schema`. Engineer reads the analogous block-level methods in this same file for exact handling.)

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npm test -- src/views/service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run check:types and check:lint**

```bash
npm run check:types && npm run check:lint
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/views/service.ts src/views/service.test.ts src/views/errors.ts src/views/index.ts
git commit -m "feat(views): service ops for toolbar items"
```

---

# Task 3: ToolbarItemsList component (UI)

**Files:**

- Create: `src/views/ui/ToolbarItemsList.vue`
- Create: `src/views/ui/ToolbarItemsList.test.ts`
- Modify: `src/views/ui/modals.ts` (add `addToolbarItemPickerModal`)
- Create: `src/views/ui/AddToolbarItemPickerModal.vue`
- Create: `src/views/ui/AddToolbarItemPickerModal.test.ts`
- Create: `src/views/flows/add-toolbar-item-to-block.flow.ts`
- Create: `src/views/flows/add-toolbar-item-to-block.flow.test.ts`
- Modify: `src/views/ui/BlocksList.vue` (inject nested list for toolbar blocks)
- Modify: `src/views/ui/BlocksList.test.ts` (one new test)
- Modify: `messages/en.json` (the toolbar-item / add-modal keys listed above)

- [ ] **Step 1: Add the i18n keys**

Edit `messages/en.json` to add every `view_toolbar_item_*` / `view_add_toolbar_item_*` / `view_toolbar_button_preset_*` key from the "i18n strings" section above. Run `npm test -- src/views/ui/BlocksList.test.ts` once to trigger paraglide regeneration; ignore the failures.

- [ ] **Step 2: Write failing tests for `AddToolbarItemPickerModal`**

Create `src/views/ui/AddToolbarItemPickerModal.test.ts`. Mirror `AddBlockPickerModal.test.ts` (read that file for shape). One test per behavior:

```ts
describe("AddToolbarItemPickerModal", () => {
  it("renders one row per definition with no presets", async () => {
    /* shelf-selector style */
  });
  it("renders one row per preset for definitions with presets", async () => {
    /* button-style 4 entries */
  });
  it("calls api.submit with { key, defaultConfig } when a row is clicked", async () => {
    /* ... */
  });
  it("shows the empty-state message when no definitions are registered", async () => {
    /* ... */
  });
});
```

- [ ] **Step 3: Run tests, confirm fail**

```bash
npm test -- src/views/ui/AddToolbarItemPickerModal.test.ts
```

Expected: FAIL (component does not exist).

- [ ] **Step 4: Implement `AddToolbarItemPickerModal.vue`**

```vue
<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import type { ToolbarItemDefinition } from "../define-toolbar-item";

const props = defineProps<{ definitions: readonly ToolbarItemDefinition[] }>();

interface Row {
  readonly key: string;
  readonly label: string;
  readonly icon?: string;
  readonly description?: string;
  readonly defaultConfig: unknown;
}

const rows = computed<readonly Row[]>(() => {
  const out: Row[] = [];
  for (const d of props.definitions) {
    if (d.presets && d.presets.length > 0) {
      for (const preset of d.presets) {
        out.push({
          key: d.key,
          label: preset.label,
          icon: d.icon,
          description: d.description,
          defaultConfig: preset.defaultConfig,
        });
      }
    } else {
      out.push({
        key: d.key,
        label: d.label,
        icon: d.icon,
        description: d.description,
        defaultConfig: d.defaultConfig,
      });
    }
  }
  return out;
});

const api = useModal<{ key: string; defaultConfig: unknown }>();
</script>

<template>
  <div>
    <UiSettingRow v-if="rows.length === 0">
      <template #description>{{ m.view_add_toolbar_item_empty() }}</template>
    </UiSettingRow>
    <UiSettingRow v-for="(row, idx) of rows" :key="`${row.key}::${idx}`">
      <template #name>
        <UiIcon v-if="row.icon" :name="row.icon" />
        <button
          type="button"
          class="picker-row"
          @click="api.submit({ key: row.key, defaultConfig: row.defaultConfig })"
        >
          {{ row.label }}
        </button>
      </template>
      <template v-if="row.description" #description>{{ row.description }}</template>
    </UiSettingRow>
    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
    </UiSettingRow>
  </div>
</template>

<style scoped>
.picker-row {
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

- [ ] **Step 5: Add modal definition**

Edit `src/views/ui/modals.ts`. Add:

```ts
import AddToolbarItemPickerModal from "./AddToolbarItemPickerModal.vue";
import type { ToolbarItemDefinition } from "../define-toolbar-item";

export interface AddToolbarItemPickerModalProps {
  definitions: readonly ToolbarItemDefinition[];
}

export const addToolbarItemPickerModal = defineModal<{ key: string; defaultConfig: unknown }>()({
  component: AddToolbarItemPickerModal,
  title: (_: AddToolbarItemPickerModalProps) => m.view_add_toolbar_item_modal_title(),
});
```

- [ ] **Step 6: Run tests, confirm pass**

```bash
npm test -- src/views/ui/AddToolbarItemPickerModal.test.ts
```

Expected: PASS.

- [ ] **Step 7: Write failing tests for the flow**

Create `src/views/flows/add-toolbar-item-to-block.flow.test.ts`. Mirror `add-block-to-view.flow.test.ts`:

```ts
describe("AddToolbarItemToBlockFlow", () => {
  it("opens the picker modal, then adds the chosen item to the block", async () => {
    /* uses FakeModalService configured to return key+config */
  });
  it("aborts with UserAborted when the picker is cancelled", async () => {
    /* ... */
  });
  it("surfaces UnknownToolbarItemKeyError as a flow error when the chosen key is unregistered", async () => {
    /* ... */
  });
});
```

- [ ] **Step 8: Implement the flow**

Create `src/views/flows/add-toolbar-item-to-block.flow.ts`:

```ts
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import type { BlockInstanceId, ViewId } from "../config";
import { toFlowError } from "../errors";
import { ViewsService } from "../service";
import { ToolbarItemDefinitionToken } from "../tokens";
import { addToolbarItemPickerModal } from "../ui/modals";

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
      yield* this.#views.addToolbarItem(p.viewId, p.blockId, choice.key, choice.defaultConfig).mapErr(toFlowError);
    });
  }
}
```

- [ ] **Step 9: Run flow tests, confirm pass**

```bash
npm test -- src/views/flows/add-toolbar-item-to-block.flow.test.ts
```

Expected: PASS.

- [ ] **Step 10: Write failing tests for `ToolbarItemsList`**

Create `src/views/ui/ToolbarItemsList.test.ts`. Mirror `BlocksList.test.ts`:

```ts
describe("ToolbarItemsList", () => {
  it("shows the empty state when the toolbar block has no items", async () => {
    /* ... */
  });
  it("renders the definition label for each known item", async () => {
    /* ... */
  });
  it("renders an unknown-key fallback label", async () => {
    /* ... */
  });
  it("removes an item when the remove button is clicked", async () => {
    /* assert via repo */
  });
  it("disables Move up on the first row", async () => {
    /* ... */
  });
  it("disables Move down on the last row", async () => {
    /* ... */
  });
  it("invokes AddToolbarItemToBlockFlow when Add item is clicked", async () => {
    /* spy flows.invoke */
  });
});
```

- [ ] **Step 11: Implement `ToolbarItemsList.vue`**

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
import type { ToolbarItemDefinition } from "../define-toolbar-item";
import { AddToolbarItemToBlockFlow } from "../flows/add-toolbar-item-to-block.flow";
import { ViewsService } from "../service";
import { ViewsViewModel } from "../view-model";

const props = defineProps<{ viewId: ViewId; blockId: BlockInstanceId }>();

const flows = useService(Flows);
const viewsService = useService(ViewsService);
const viewsVM = useService(ViewsViewModel);

interface Row {
  id: BlockInstanceId;
  key: string;
  definition: ToolbarItemDefinition | undefined;
}

const rows = computed<Row[]>(() => {
  const items = viewsVM
    .getView(props.viewId)
    .map((view) => view.blocks.find((b) => b.id === props.blockId))
    .map((block) => {
      const raw = (block?.config as { items?: unknown } | undefined)?.items;
      return Array.isArray(raw) ? (raw as { id: BlockInstanceId; key: string; config: Record<string, unknown> }[]) : [];
    })
    .getOr([]);
  return items.map((item) => ({
    id: item.id,
    key: item.key,
    definition: viewsService.getToolbarItemDefinition(item.key).getOr(undefined as never),
  }));
});

const moveUp = (id: BlockInstanceId) => void viewsService.moveToolbarItemUp(props.viewId, props.blockId, id);
const moveDown = (id: BlockInstanceId) => void viewsService.moveToolbarItemDown(props.viewId, props.blockId, id);
const remove = (id: BlockInstanceId) => void viewsService.removeToolbarItem(props.viewId, props.blockId, id);
const add = () => void flows.invoke(AddToolbarItemToBlockFlow, { viewId: props.viewId, blockId: props.blockId });
</script>

<template>
  <UiSettingRow v-if="rows.length === 0">
    <template #description>{{ m.view_toolbar_item_empty() }}</template>
  </UiSettingRow>
  <UiSettingRow v-for="(row, index) of rows" :key="row.id">
    <template #name>
      <template v-if="row.definition">
        <UiIcon v-if="row.definition.icon" :name="row.definition.icon" />
        {{ row.definition.label }}
      </template>
      <template v-else>{{ m.view_toolbar_item_unknown_label({ key: row.key }) }}</template>
    </template>
    <UiIconButton
      icon="chevron-up"
      :tooltip="m.view_toolbar_item_move_up()"
      :disabled="index === 0"
      @click="moveUp(row.id)"
    />
    <UiIconButton
      icon="chevron-down"
      :tooltip="m.view_toolbar_item_move_down()"
      :disabled="index === rows.length - 1"
      @click="moveDown(row.id)"
    />
    <UiIconButton icon="trash-2" :tooltip="m.view_toolbar_item_remove()" @click="remove(row.id)" />
  </UiSettingRow>
  <UiSettingRow controls-only>
    <UiButton cta @click="add">{{ m.view_toolbar_item_add() }}</UiButton>
  </UiSettingRow>
</template>
```

- [ ] **Step 12: Modify `BlocksList.vue` to nest `<ToolbarItemsList />` under each toolbar block row**

Inside the existing v-for block-row template, after the row-controls section, add (still inside the `UiSettingRow`):

```vue
<template v-if="row.key === 'toolbar'" #description>
  <ToolbarItemsList :view-id="props.viewId" :block-id="row.id" />
</template>
```

Import `ToolbarItemsList` at the top of the script.

(Note: if `#description` is already used for an error/unknown-key path, place `<ToolbarItemsList>` inside its own `UiSettingRow` rendered immediately after the toolbar row instead. Engineer adapts to whichever pattern exists at implementation time.)

- [ ] **Step 13: Add `BlocksList.test.ts` test for the nested-list path**

```ts
it("renders ToolbarItemsList inside the row when a block's key is 'toolbar'", async () => {
  /* ... */
});
```

- [ ] **Step 14: Run all UI tests, confirm pass**

```bash
npm test -- src/views/ui src/views/flows
```

Expected: PASS.

- [ ] **Step 15: Run check:types + check:lint**

```bash
npm run check:types && npm run check:lint
```

Expected: PASS.

- [ ] **Step 16: Commit**

```bash
git add src/views/ui src/views/flows/add-toolbar-item-to-block.flow.ts src/views/flows/add-toolbar-item-to-block.flow.test.ts messages/en.json
git commit -m "feat(views): ToolbarItemsList + add-toolbar-item flow + picker modal"
```

---

# Task 4: Divider block (smallest content block; warm-up for the catalogue pattern)

**Files:**

- Create: `src/views/blocks/divider/divider-block.ts`
- Create: `src/views/blocks/divider/DividerBlock.vue`
- Create: `src/views/blocks/divider/DividerBlock.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/views/blocks/divider/DividerBlock.test.ts
import { cleanup } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { mountViewBlock } from "../../testing";
import { dividerBlock } from "./divider-block";

afterEach(() => cleanup());

describe("DividerBlock", () => {
  it("renders a horizontal divider element", () => {
    const { container } = mountViewBlock(dividerBlock, {});
    expect(container.querySelector(".journal-view-divider")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test, confirm fail**

```bash
npm test -- src/views/blocks/divider
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `DividerBlock.vue`**

```vue
<template>
  <div class="journal-view-divider" role="separator" />
</template>

<style scoped>
.journal-view-divider {
  height: 1px;
  margin: var(--size-2-2) 0;
  border-bottom: 1px solid var(--color-accent);
}
</style>
```

- [ ] **Step 4: Implement `divider-block.ts`**

```ts
import * as v from "valibot";

import { m } from "@/i18n";

import { defineViewBlock } from "../../define-view-block";
import DividerBlock from "./DividerBlock.vue";

export const dividerBlock = defineViewBlock({
  key: "divider",
  label: m.view_block_divider_label(),
  icon: "minus",
  schema: v.object({}),
  defaultConfig: {},
  component: DividerBlock,
});
```

Note: `m.<key>()` is called at module evaluation; that's fine because paraglide message functions evaluate synchronously against the active locale at the time of call. If the project switches locales at runtime, the engineer should change to `() => m.view_block_divider_label()` on the label field — check existing block definitions for the pattern before deciding.

- [ ] **Step 5: Run test, confirm pass**

```bash
npm test -- src/views/blocks/divider
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/views/blocks/divider messages/en.json
git commit -m "feat(views): divider block"
```

---

# Task 5: Toolbar container block

**Files:**

- Create: `src/views/blocks/toolbar/toolbar-block.ts`
- Create: `src/views/blocks/toolbar/ToolbarBlock.vue`
- Create: `src/views/blocks/toolbar/ToolbarBlock.test.ts`

The toolbar block:

- Schema = `v.object({ items: v.array(v.object({ id: ..., key: ..., config: v.record(v.string(), v.unknown()) })) })`.
- Default config = `{ items: [] }`.
- Component reads `config.items`, resolves each `key` via `ToolbarItemDefinitionToken`, validates `item.config` against the definition's schema, renders the definition's `component` with `{ instanceId, config }`. Unknown keys / invalid configs are silently skipped + logged via `LoggerFactoryToken` (mirror `view-leaf.ts:117-138`).

- [ ] **Step 1: Write the failing tests**

```ts
// src/views/blocks/toolbar/ToolbarBlock.test.ts

describe("ToolbarBlock", () => {
  it("renders one component per registered item", () => {
    /* register two stub items, assert two elements */
  });
  it("skips items whose key is unregistered", () => {
    /* one valid + one bad; assert single render */
  });
  it("skips items whose config fails its schema", () => {
    /* ... */
  });
  it("passes the item config through to the rendered component", () => {
    /* stub item that emits config.x */
  });
});
```

Component stubs follow the pattern in `view-leaf.test.ts` for fake registries.

- [ ] **Step 2: Run, confirm fail**

```bash
npm test -- src/views/blocks/toolbar
```

- [ ] **Step 3: Implement `ToolbarBlock.vue`**

```vue
<script setup lang="ts">
import * as v from "valibot";
import { computed, h, type VNode } from "vue";

import { useService } from "@/infrastructure/di";
import { LoggerFactoryToken } from "@/infrastructure/logger";

import type { BlockInstanceId } from "../../config";
import type { ToolbarItemDefinition } from "../../define-toolbar-item";
import { ToolbarItemDefinitionToken } from "../../tokens";

interface ItemInstance {
  readonly id: BlockInstanceId;
  readonly key: string;
  readonly config: unknown;
}

const props = defineProps<{ instanceId: BlockInstanceId; config: { items: readonly ItemInstance[] } }>();

const definitions = useService(ToolbarItemDefinitionToken);
const logger = useService(LoggerFactoryToken).named("toolbar-block");

const byKey = computed<ReadonlyMap<string, ToolbarItemDefinition>>(() => {
  const map = new Map<string, ToolbarItemDefinition>();
  for (const d of definitions) map.set(d.key, d);
  return map;
});

function renderItems(): (VNode | null)[] {
  return props.config.items.map((item) => {
    const definition = byKey.value.get(item.key);
    if (!definition) {
      logger.warn("unknown toolbar item key", { key: item.key, instanceId: props.instanceId });
      return null;
    }
    const parsed = v.safeParse(definition.schema, item.config);
    if (!parsed.success) {
      logger.warn("invalid toolbar item config", { key: item.key, itemId: item.id });
      return null;
    }
    return h(definition.component, { key: item.id, instanceId: item.id, config: parsed.output });
  });
}
</script>

<template>
  <div class="journal-view-toolbar">
    <component :is="renderItems" />
  </div>
</template>

<style scoped>
.journal-view-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--size-2-2);
  padding-bottom: var(--size-2-2);
}
</style>
```

(The `<component :is="renderItems" />` trick only works if `renderItems` is set up as a render function. If the engineer finds the simpler `<template v-for>` pattern cleaner — iterating `props.config.items`, computing the definition once per item via `computed`, and using `<component :is="..." />` with per-item props — they should adopt that. Either is valid; choose whichever keeps the file small and explicit.)

- [ ] **Step 4: Implement `toolbar-block.ts`**

```ts
import * as v from "valibot";

import { m } from "@/i18n";

import { defineViewBlock } from "../../define-view-block";
import ToolbarBlock from "./ToolbarBlock.vue";

const itemSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  key: v.pipe(v.string(), v.minLength(1)),
  config: v.record(v.string(), v.unknown()),
});

const schema = v.object({ items: v.array(itemSchema) });

export const toolbarBlock = defineViewBlock({
  key: "toolbar",
  label: m.view_block_toolbar_label(),
  description: m.view_block_toolbar_description(),
  icon: "panel-top",
  schema,
  defaultConfig: { items: [] as v.InferOutput<typeof itemSchema>[] },
  component: ToolbarBlock,
});
```

- [ ] **Step 5: Run tests, confirm pass; run check:types + lint**

```bash
npm test -- src/views/blocks/toolbar && npm run check:types && npm run check:lint
```

- [ ] **Step 6: Commit**

```bash
git add src/views/blocks/toolbar
git commit -m "feat(views): toolbar container block"
```

---

# Task 6: Month-calendar block

**Files:**

- Create: `src/views/blocks/month-calendar/month-calendar-block.ts`
- Create: `src/views/blocks/month-calendar/MonthCalendarBlock.vue`
- Create: `src/views/blocks/month-calendar/MonthCalendarBlock.test.ts`
- Create: `src/views/blocks/month-calendar/MonthCalendarBlockConfig.vue`
- Create: `src/views/blocks/month-calendar/MonthCalendarBlockConfig.test.ts`

The runtime component stacks `1 + before + after` `<NotesMonthView>` instances anchored at `refDate ± k months`. Config: `{ before: number, after: number, hideWeekends: boolean }`. Defaults: `{ before: 0, after: 0, hideWeekends: false }`. (Spec says `hideWeekends: false` is the v2 default.)

`hideWeekends` is **not** wired to `NotesMonthView` (the primitive doesn't support it today). For this milestone, scope `hideWeekends` to a wrapper class on the block that hides Sat/Sun grid cells via CSS — or omit the visual effect and just persist the field. **Decision:** persist + leave a CSS hook (`[data-hide-weekends]`) without wiring grid cells yet; a follow-up extends `NotesMonthView` to consume it. (Adding a `hideWeekends` prop to the primitive is out of scope.)

- [ ] **Step 1: Write failing tests**

```ts
describe("MonthCalendarBlock", () => {
  it("renders one NotesMonthView when before=0 and after=0", () => {
    /* find by [data-testid="header-month"] count */
  });
  it("renders before + after + 1 NotesMonthView instances", () => {
    /* assert 3 with before=1, after=1 */
  });
  it("anchors each NotesMonthView at refDate shifted by its index", () => {
    /* read first/last view's data-month attr we add */
  });
  it("passes the current shelf to each NotesMonthView", () => {
    /* ... */
  });
  it("toggles data-hide-weekends on the wrapper when config.hideWeekends is true", () => {
    /* ... */
  });
});

describe("MonthCalendarBlockConfig", () => {
  it("emits onChange with updated before count", async () => {
    /* ... */
  });
  it("emits onChange with updated after count", async () => {
    /* ... */
  });
  it("emits onChange when hideWeekends toggles", async () => {
    /* ... */
  });
});
```

Use `mountViewBlock(monthCalendarBlock, { config }, { refDate, shelf })` with a context stub. To allow tests to count `NotesMonthView` renders without rendering its full graph, the test file _globally_ mocks `@/notes-calendar/ui/NotesMonthView.vue` with a stub component that renders `<div data-testid="month-stub" :data-month="month.start.toAnchor()" :data-shelf="shelf" />`. Use `vi.mock(...)` at the top of the file:

```ts
vi.mock("@/notes-calendar/ui/NotesMonthView.vue", () => ({
  default: defineComponent({
    props: { month: { type: Object, required: true }, shelf: { type: [String, null], default: null } },
    setup(p) {
      return () =>
        h("div", { "data-testid": "month-stub", "data-month": p.month.start.toAnchor(), "data-shelf": p.shelf ?? "" });
    },
  }),
}));
```

- [ ] **Step 2: Run, confirm fail**

```bash
npm test -- src/views/blocks/month-calendar
```

- [ ] **Step 3: Implement `MonthCalendarBlock.vue`**

```vue
<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate, MonthPeriod } from "@/calendar";
import NotesMonthView from "@/notes-calendar/ui/NotesMonthView.vue";

import type { BlockInstanceId } from "../../config";
import { useViewContext } from "../../view-context";

const props = defineProps<{
  instanceId: BlockInstanceId;
  config: { before: number; after: number; hideWeekends: boolean };
}>();

const ctx = useViewContext();

const months = computed<readonly MonthPeriod[]>(() => {
  const focus = MonthPeriod.containing(CalendarDate.fromAnchor(ctx.refDate.value));
  const out: MonthPeriod[] = [];
  let cursor = focus;
  for (let i = 0; i < props.config.before; i += 1) cursor = cursor.previous();
  for (let i = 0; i < props.config.before + props.config.after + 1; i += 1) {
    out.push(cursor);
    cursor = cursor.next();
  }
  return out;
});
</script>

<template>
  <div class="journal-view-month-calendar" :data-hide-weekends="config.hideWeekends || null">
    <NotesMonthView v-for="month of months" :key="month.start.toAnchor()" :month="month" :shelf="ctx.shelf.value" />
  </div>
</template>

<style scoped>
.journal-view-month-calendar {
  display: flex;
  flex-direction: column;
  gap: var(--size-4-2);
}
</style>
```

- [ ] **Step 4: Implement `MonthCalendarBlockConfig.vue`**

```vue
<script setup lang="ts">
import { m } from "@/i18n";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

const props = defineProps<{
  config: { before: number; after: number; hideWeekends: boolean };
  onChange: (next: { before: number; after: number; hideWeekends: boolean }) => void;
}>();

const update = (patch: Partial<typeof props.config>) => props.onChange({ ...props.config, ...patch });
</script>

<template>
  <UiSettingRow>
    <template #name>{{ m.view_block_config_before_label() }}</template>
    <UiNumberInput :model-value="config.before" :min="0" @update:model-value="(v) => update({ before: v })" />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_block_config_after_label() }}</template>
    <UiNumberInput :model-value="config.after" :min="0" @update:model-value="(v) => update({ after: v })" />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_block_config_hide_weekends_label() }}</template>
    <UiToggle :model-value="config.hideWeekends" @update:model-value="(v) => update({ hideWeekends: v })" />
  </UiSettingRow>
</template>
```

- [ ] **Step 5: Implement `month-calendar-block.ts`**

```ts
import * as v from "valibot";

import { m } from "@/i18n";

import { defineViewBlock } from "../../define-view-block";
import MonthCalendarBlock from "./MonthCalendarBlock.vue";
import MonthCalendarBlockConfig from "./MonthCalendarBlockConfig.vue";

const schema = v.object({
  before: v.pipe(v.number(), v.integer(), v.minValue(0)),
  after: v.pipe(v.number(), v.integer(), v.minValue(0)),
  hideWeekends: v.boolean(),
});

export const monthCalendarBlock = defineViewBlock({
  key: "month-calendar",
  label: m.view_block_month_calendar_label(),
  description: m.view_block_month_calendar_description(),
  icon: "calendar-days",
  schema,
  defaultConfig: { before: 0, after: 0, hideWeekends: false },
  component: MonthCalendarBlock,
  configComponent: MonthCalendarBlockConfig,
});
```

- [ ] **Step 6: Run tests, confirm pass; run check:types + lint**

```bash
npm test -- src/views/blocks/month-calendar && npm run check:types && npm run check:lint
```

- [ ] **Step 7: Commit**

```bash
git add src/views/blocks/month-calendar messages/en.json
git commit -m "feat(views): month-calendar block + config component"
```

---

# Task 7: Week-calendar block

**Files:**

- Create: `src/views/blocks/week-calendar/week-calendar-block.ts`
- Create: `src/views/blocks/week-calendar/WeekCalendarBlock.vue`
- Create: `src/views/blocks/week-calendar/WeekCalendarBlock.test.ts`
- Create: `src/views/blocks/week-calendar/WeekCalendarBlockConfig.vue`
- Create: `src/views/blocks/week-calendar/WeekCalendarBlockConfig.test.ts`

Symmetric with `month-calendar`. Differences:

- Uses `WeekPeriod` + `NotesWeekView` from `@/notes-calendar/ui/NotesWeekView.vue`.
- Counts are weeks before / weeks after.

Follow the exact same shape as Task 6 (write the failing tests using a `vi.mock` of `NotesWeekView`, implement, run, commit). Key code blocks:

```ts
// week-calendar-block.ts (analogous to month version)
const schema = v.object({
  before: v.pipe(v.number(), v.integer(), v.minValue(0)),
  after:  v.pipe(v.number(), v.integer(), v.minValue(0)),
  hideWeekends: v.boolean(),
});
defaultConfig: { before: 0, after: 0, hideWeekends: false }
```

```vue
<!-- WeekCalendarBlock.vue -->
<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate, WeekPeriod } from "@/calendar";
import NotesWeekView from "@/notes-calendar/ui/NotesWeekView.vue";

import type { BlockInstanceId } from "../../config";
import { useViewContext } from "../../view-context";

const props = defineProps<{
  instanceId: BlockInstanceId;
  config: { before: number; after: number; hideWeekends: boolean };
}>();
const ctx = useViewContext();

const weeks = computed<readonly WeekPeriod[]>(() => {
  const focus = WeekPeriod.containing(CalendarDate.fromAnchor(ctx.refDate.value));
  const out: WeekPeriod[] = [];
  let cursor = focus;
  for (let i = 0; i < props.config.before; i += 1) cursor = cursor.previous();
  for (let i = 0; i < props.config.before + props.config.after + 1; i += 1) {
    out.push(cursor);
    cursor = cursor.next();
  }
  return out;
});
</script>
<template>
  <div class="journal-view-week-calendar" :data-hide-weekends="config.hideWeekends || null">
    <NotesWeekView v-for="week of weeks" :key="week.start.toAnchor()" :week="week" :shelf="ctx.shelf.value" />
  </div>
</template>
```

`WeekCalendarBlockConfig.vue` matches Month's, using `view_block_config_before_weeks_label` / `view_block_config_after_weeks_label` for labels.

Commit message: `feat(views): week-calendar block + config component`.

---

# Task 8: Pure helper — custom-intervals window resolution

**Files:**

- Create: `src/views/blocks/custom-intervals/window-resolution.ts`
- Create: `src/views/blocks/custom-intervals/window-resolution.test.ts`

The block needs a pure `(window: WindowKind, refDate: AnchorString) → { start: AnchorString; end: AnchorString }` helper that:

- For `"current-week"`: returns the week containing `refDate` per `moment.localeData().firstDayOfWeek()`. Use `WeekPeriod.containing(CalendarDate.fromAnchor(refDate))` — `WeekPeriod` already honors locale, addressing `[[project_v2_week_anchor_bug]]`.
- For `"current-month"`: `MonthPeriod.containing(...)`.
- For `"current-quarter"`: `QuarterPeriod.containing(...)`.
- For `"current-year"`: `YearPeriod.containing(...)`.

Return values: `{ start: period.start.toAnchor(), end: period.end.toAnchor() }`. Dispatch via `match(window).with(...).exhaustive()`.

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { installTestCalendar } from "@/calendar/testing";
import type { AnchorString } from "@/calendar/types";
import { resolveWindow } from "./window-resolution";

beforeAll(() => installTestCalendar());

describe("resolveWindow", () => {
  it("returns the locale-anchored week for 'current-week'", () => {
    const r = resolveWindow("current-week", "2026-05-29" as AnchorString);
    // exact assertion depends on the test calendar's firstDayOfWeek; engineer
    // looks up installTestCalendar's seed and asserts start ≤ "2026-05-29" ≤ end.
    expect(r.start <= "2026-05-29").toBe(true);
    expect("2026-05-29" <= r.end).toBe(true);
  });
  it("returns the calendar month for 'current-month'", () => {
    /* assert "2026-05-01" / "2026-05-31" */
  });
  it("returns the calendar quarter for 'current-quarter'", () => {
    /* "2026-04-01" / "2026-06-30" */
  });
  it("returns the calendar year for 'current-year'", () => {
    /* "2026-01-01" / "2026-12-31" */
  });
});
```

- [ ] **Step 2: Run, confirm fail**

- [ ] **Step 3: Implement**

```ts
import { match } from "ts-pattern";

import { CalendarDate, MonthPeriod, QuarterPeriod, WeekPeriod, YearPeriod } from "@/calendar";
import type { AnchorString } from "@/calendar/types";

export type WindowKind = "current-week" | "current-month" | "current-quarter" | "current-year";

export function resolveWindow(window: WindowKind, refDate: AnchorString): { start: AnchorString; end: AnchorString } {
  const date = CalendarDate.fromAnchor(refDate);
  const period = match(window)
    .with("current-week", () => WeekPeriod.containing(date))
    .with("current-month", () => MonthPeriod.containing(date))
    .with("current-quarter", () => QuarterPeriod.containing(date))
    .with("current-year", () => YearPeriod.containing(date))
    .exhaustive();
  return { start: period.start.toAnchor(), end: period.end.toAnchor() };
}
```

- [ ] **Step 4: Run, pass. Commit.**

```bash
git add src/views/blocks/custom-intervals/window-resolution.ts src/views/blocks/custom-intervals/window-resolution.test.ts
git commit -m "feat(views): custom-intervals window resolution helper"
```

---

# Task 9: Add `intervalBlock` field to journal config

**Files:**

- Modify: `src/journals/config.ts`
- Modify: `src/journals/config.test.ts`

Add `intervalBlock` next to the existing `navBlock` on `journalConfigSchema` (schema identical to `navBlockSchema`), default `{ rows: [], decorateWholeBlock: false }`.

- [ ] **Step 1: Write failing test in `config.test.ts`**

```ts
describe("journal config defaults", () => {
  it("seeds intervalBlock to empty rows + decorateWholeBlock false", () => {
    const config = journalDefaultsFor("day", "Journal");
    expect(config.intervalBlock).toEqual({ rows: [], decorateWholeBlock: false });
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npm test -- src/journals/config.test.ts
```

- [ ] **Step 3: Implement**

Locate `navBlockSchema` (already exported) and the `journalConfigSchema` definition. Add a field next to `navBlock`:

```ts
intervalBlock: navBlockSchema,
```

In `journalDefaultsFor`, set:

```ts
intervalBlock: { rows: [], decorateWholeBlock: false },
```

- [ ] **Step 4: Tests + types + lint pass**

The new field is non-optional but seeded by the defaults builder; settings migrations will handle stored configs that don't yet have it. (Migration-time fill is out of scope for this plan; if a missing-field error surfaces from `safeParse` against existing user data in dev, the engineer adds `intervalBlock: v.optional(navBlockSchema, { rows: [], decorateWholeBlock: false })` instead, and follows up.)

- [ ] **Step 5: Commit**

```bash
git add src/journals/config.ts src/journals/config.test.ts
git commit -m "feat(journals): intervalBlock field on journal config"
```

---

# Task 10: Custom-intervals block (runtime + config + registration)

**Files:**

- Create: `src/views/blocks/custom-intervals/custom-intervals-block.ts`
- Create: `src/views/blocks/custom-intervals/CustomIntervalsBlock.vue`
- Create: `src/views/blocks/custom-intervals/CustomIntervalsBlock.test.ts`
- Create: `src/views/blocks/custom-intervals/CustomIntervalsBlockConfig.vue`
- Create: `src/views/blocks/custom-intervals/CustomIntervalsBlockConfig.test.ts`

Renders one section per custom-journal in scope. Per journal, fetches anchor→path entries in the resolved window via `JournalsIndex.getRange(name, start, end)`, then renders the journal's `intervalBlock.rows` per existing entry using the existing `NavigationCodeBlock`-style row renderer.

Practical simplification for the MVP: since the v3 `NavBlock` row renderer (used by the nav code block) lives at `src/code-blocks/nav/ui/NavigationCodeBlock.vue` and consumes a `journal-name` + `ref-date` + `rows` prop set, the v3 `CustomIntervalsBlock` mounts one `<NavigationCodeBlock>` per matching entry. Look at the existing component's props signature before importing.

Config schema:

```ts
const journalsField = v.optional(v.array(v.pipe(v.string(), v.minLength(1))));
const windowField = v.picklist(["current-week", "current-month", "current-quarter", "current-year"] as const);
const schema = v.object({ journals: journalsField, window: windowField, hideEmpty: v.boolean() });
defaultConfig: { window: "current-month", hideEmpty: true }   // journals omitted ⇒ all custom journals in shelf
```

- [ ] **Step 1: Write failing tests**

```ts
describe("CustomIntervalsBlock", () => {
  it("renders one section per custom journal in the active shelf when journals is omitted", () => {
    /* ... */
  });
  it("filters to the configured journals list when provided", () => {
    /* ... */
  });
  it("hides a journal section with no entries when hideEmpty is true", () => {
    /* ... */
  });
  it("shows a journal section with no entries when hideEmpty is false", () => {
    /* ... */
  });
  it("uses the configured window relative to refDate", () => {
    /* ... */
  });
});

describe("CustomIntervalsBlockConfig", () => {
  it("emits onChange with the chosen window", () => {
    /* ... */
  });
  it("emits onChange when hideEmpty toggles", () => {
    /* ... */
  });
  // journals multi-select editing is out of scope at MVP; leave that field untested
});
```

Tests stub `JournalsIndex`, `JournalsViewModel`, `ShelvesRepository`, and `useShelfScope` via DI fakes (mirror the existing `view-leaf.test.ts` setup of a small `Container` registered with each token). Mock the `NavigationCodeBlock` import similarly to how Month tests mock `NotesMonthView`.

- [ ] **Step 2: Run, confirm fail**

- [ ] **Step 3: Implement `CustomIntervalsBlock.vue`**

```vue
<script setup lang="ts">
import { computed } from "vue";

import { useService } from "@/infrastructure/di";
import { JournalsIndex, JournalsRepository } from "@/journals";
import { useShelfScope } from "@/notes-calendar/use-shelf-scope";
import NavigationCodeBlock from "@/code-blocks/nav/ui/NavigationCodeBlock.vue";

import type { BlockInstanceId } from "../../config";
import { useViewContext } from "../../view-context";

import { resolveWindow, type WindowKind } from "./window-resolution";

const props = defineProps<{
  instanceId: BlockInstanceId;
  config: { journals?: readonly string[]; window: WindowKind; hideEmpty: boolean };
}>();

const ctx = useViewContext();
const index = useService(JournalsIndex);
const journalsRepo = useService(JournalsRepository);
const scope = useShelfScope(() => ctx.shelf.value);

const window = computed(() => resolveWindow(props.config.window, ctx.refDate.value));

interface Section {
  readonly journalName: string;
  readonly entries: readonly { anchor: string; path: string }[];
  readonly rows: unknown;
  readonly decorateWhole: boolean;
}

const sections = computed<readonly Section[]>(() => {
  const filter = props.config.journals;
  const candidates = scope.custom.value.filter((n) => !filter || filter.includes(n));
  const out: Section[] = [];
  for (const name of candidates) {
    const cfg = journalsRepo.get(name).getOr(undefined as never);
    if (!cfg) continue;
    const rangeMap = index.getRange(name, window.value.start, window.value.end);
    const entries = [...rangeMap.entries()].map(([anchor, path]) => ({ anchor, path }));
    if (entries.length === 0 && props.config.hideEmpty) continue;
    out.push({
      journalName: name,
      entries,
      rows: cfg.intervalBlock.rows,
      decorateWhole: cfg.intervalBlock.decorateWholeBlock,
    });
  }
  return out;
});
</script>

<template>
  <div class="journal-view-custom-intervals">
    <div v-for="section of sections" :key="section.journalName" class="journal-view-custom-intervals__section">
      <NavigationCodeBlock
        v-for="entry of section.entries"
        :key="entry.path"
        :journal-name="section.journalName"
        :ref-date="entry.anchor"
        :rows="section.rows"
        :decorate-block="section.decorateWhole"
      />
    </div>
  </div>
</template>

<style scoped>
.journal-view-custom-intervals {
  display: flex;
  flex-direction: column;
  gap: var(--size-4-2);
}
.journal-view-custom-intervals__section {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-2);
  border-bottom: 1px solid var(--color-accent);
  padding-bottom: var(--size-2-2);
}
.journal-view-custom-intervals__section:last-child {
  border-bottom: 0;
}
</style>
```

(Engineer verifies the actual prop names of `NavigationCodeBlock` at implementation time — the v2 component used `rows`/`ref-date`/`journal-name`/`decorate-block`, but the v3 component may have evolved. If the v3 component does not exist at this path, the engineer renders a simple stand-in: `<a :href="path">{{ anchor }}</a>` per entry, with a TODO in the PR description noting the missing dependency.)

- [ ] **Step 4: Implement `CustomIntervalsBlockConfig.vue`**

```vue
<script setup lang="ts">
import { m } from "@/i18n";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import type { WindowKind } from "./window-resolution";

const props = defineProps<{
  config: { journals?: readonly string[]; window: WindowKind; hideEmpty: boolean };
  onChange: (next: { journals?: readonly string[]; window: WindowKind; hideEmpty: boolean }) => void;
}>();

const windowOptions = [
  { value: "current-week", label: m.view_block_config_window_current_week() },
  { value: "current-month", label: m.view_block_config_window_current_month() },
  { value: "current-quarter", label: m.view_block_config_window_current_quarter() },
  { value: "current-year", label: m.view_block_config_window_current_year() },
];

const update = (patch: Partial<typeof props.config>) => props.onChange({ ...props.config, ...patch });
</script>

<template>
  <UiSettingRow>
    <template #name>{{ m.view_block_config_window_label() }}</template>
    <UiDropdown
      :model-value="config.window"
      :options="windowOptions"
      @update:model-value="(v) => update({ window: v as WindowKind })"
    />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_block_config_hide_empty_label() }}</template>
    <UiToggle :model-value="config.hideEmpty" @update:model-value="(v) => update({ hideEmpty: v })" />
  </UiSettingRow>
</template>
```

(Editing `journals` filter is deferred — the field stays undefined at MVP. The engineer leaves a one-line code comment only if the omission is non-obvious from the absent field; otherwise nothing.)

- [ ] **Step 5: Implement `custom-intervals-block.ts`**

```ts
import * as v from "valibot";

import { m } from "@/i18n";

import { defineViewBlock } from "../../define-view-block";
import CustomIntervalsBlock from "./CustomIntervalsBlock.vue";
import CustomIntervalsBlockConfig from "./CustomIntervalsBlockConfig.vue";

const schema = v.object({
  journals: v.optional(v.array(v.pipe(v.string(), v.minLength(1)))),
  window: v.picklist(["current-week", "current-month", "current-quarter", "current-year"] as const),
  hideEmpty: v.boolean(),
});

export const customIntervalsBlock = defineViewBlock({
  key: "custom-intervals",
  label: m.view_block_custom_intervals_label(),
  description: m.view_block_custom_intervals_description(),
  icon: "list",
  schema,
  defaultConfig: { window: "current-month" as const, hideEmpty: true },
  component: CustomIntervalsBlock,
  configComponent: CustomIntervalsBlockConfig,
});
```

- [ ] **Step 6: Run tests, pass; check:types + lint**

```bash
npm test -- src/views/blocks/custom-intervals && npm run check:types && npm run check:lint
```

- [ ] **Step 7: Commit**

```bash
git add src/views/blocks/custom-intervals messages/en.json
git commit -m "feat(views): custom-intervals block + window helper"
```

---

# Task 11: Shelf-selector toolbar item

**Files:**

- Create: `src/views/toolbar-items/shelf-selector/shelf-selector-item.ts`
- Create: `src/views/toolbar-items/shelf-selector/ShelfSelectorItem.vue`
- Create: `src/views/toolbar-items/shelf-selector/ShelfSelectorItem.test.ts`

Displays the current shelf name from `ViewContext.shelf` (or `m.view_toolbar_shelf_selector_all()` if `null`). On click, opens an Obsidian `Menu` listing every shelf from `ShelvesRepository.list()` plus "All journals"; selection calls `ctx.setShelf(name)` / `ctx.setShelf(null)`.

Schema: `v.object({})`. No config component. No presets (so the picker shows it as a single entry labeled "Shelf selector").

- [ ] **Step 1: Write failing tests**

```ts
describe("ShelfSelectorItem", () => {
  it("renders 'All journals' when context.shelf is null", () => {
    /* ... */
  });
  it("renders the shelf name when context.shelf is set", () => {
    /* ... */
  });
  it("opens an Obsidian Menu with one entry per shelf plus 'All journals' on click", async () => {
    /* spy on Menu constructor */
  });
  it("calls ctx.setShelf with the chosen name when a shelf is picked", async () => {
    /* ... */
  });
  it("calls ctx.setShelf(null) when 'All journals' is picked", async () => {
    /* ... */
  });
});
```

Use `vi.mock("obsidian", ...)` if needed (the codebase already has a partial obsidian stub — check existing test files for the pattern). The `Menu` mock should record `addItem` callbacks so the test can invoke them.

- [ ] **Step 2: Run, fail**

- [ ] **Step 3: Implement**

```vue
<!-- ShelfSelectorItem.vue -->
<script setup lang="ts">
import { Menu } from "obsidian";
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { ShelvesRepository } from "@/shelves";
import UiButton from "@/ui/UiButton.vue";

import type { BlockInstanceId } from "../../config";
import { useViewContext } from "../../view-context";

defineProps<{ instanceId: BlockInstanceId; config: Record<string, never> }>();
const ctx = useViewContext();
const shelves = useService(ShelvesRepository);

const label = computed(() => ctx.shelf.value ?? m.view_toolbar_shelf_selector_all());

function open(event: MouseEvent): void {
  const menu = new Menu();
  menu.addItem((item) => item.setTitle(m.view_toolbar_shelf_selector_all()).onClick(() => ctx.setShelf(null)));
  for (const shelf of shelves.list()) {
    menu.addItem((item) => item.setTitle(shelf.name).onClick(() => ctx.setShelf(shelf.name)));
  }
  menu.showAtMouseEvent(event);
}
</script>

<template>
  <UiButton flat @click="open">{{ label }}</UiButton>
</template>
```

(Verify `ShelvesRepository.list()` shape — if it returns a query object, swap for the right iteration call. Engineer checks at implementation time.)

```ts
// shelf-selector-item.ts
import * as v from "valibot";

import { m } from "@/i18n";

import { defineToolbarItem } from "../../define-toolbar-item";
import ShelfSelectorItem from "./ShelfSelectorItem.vue";

export const shelfSelectorItem = defineToolbarItem({
  key: "shelf-selector",
  label: m.view_toolbar_shelf_selector_label(),
  description: m.view_toolbar_shelf_selector_description(),
  icon: "library",
  schema: v.object({}),
  defaultConfig: {},
  component: ShelfSelectorItem,
});
```

- [ ] **Step 4: Run, pass; check:types + lint**

- [ ] **Step 5: Commit**

```bash
git add src/views/toolbar-items/shelf-selector messages/en.json
git commit -m "feat(views): shelf-selector toolbar item"
```

---

# Task 12: Period-buttons toolbar item

**Files:**

- Create: `src/views/toolbar-items/period-buttons/period-buttons-item.ts`
- Create: `src/views/toolbar-items/period-buttons/PeriodButtonsItem.vue`
- Create: `src/views/toolbar-items/period-buttons/PeriodButtonsItem.test.ts`
- Create: `src/views/toolbar-items/period-buttons/PeriodButtonsItemConfig.vue`
- Create: `src/views/toolbar-items/period-buttons/PeriodButtonsItemConfig.test.ts`

Config: `{ week: boolean; month: boolean; quarter: boolean; year: boolean }`. Default config: `{ week: false, month: true, quarter: true, year: true }`. Per spec, a badge self-hides if (a) its `config.<period>` is false, or (b) the active shelf has no journal of that type (via `useShelfScope().<period>.value.length > 0`).

Each badge:

- Shows the period label formatted via the existing `NotesCalendarButton` (or just a `UiButton` labeled with `period.format("MMM YYYY")` / etc — check what v3 has).
- Click opens the existing day/week/month/quarter/year note for `refDate` (via `OpenDateFlow`). Active-state highlighting when the active note matches.

To keep this task self-contained and ship-able, implement a minimal version: just `<UiButton>` per visible period, label = the localised period name from moment (`moment(refDate).format("MMM YYYY")` for month, `"Qn YYYY"` for quarter, `"YYYY"` for year, week number for week). Click invokes `OpenDateFlow` with `journalNames` = `scope.<period>.value`. Skip active-state highlighting at MVP (follow-up via `[[feedback_v2_fidelity_default]]` — file an issue if you must drop a v2-visible feature; here we ship the action and defer highlighting because there is no `ActiveEntryViewModel` consumer needed in spec-scope yet).

Wait — `[[feedback_v2_fidelity_default]]` says "preserve every variant/mode/option". So active-state highlighting cannot be dropped without explicit user opt-in. This plan **includes** highlighting via `ActiveEntryViewModel.active` (already imported by `useNotesCell`).

- [ ] **Step 1: Write failing tests**

```ts
describe("PeriodButtonsItem", () => {
  it("renders configured periods that have a journal in scope", () => {
    /* week=false, month=true */
  });
  it("self-hides a configured period when its scope is empty", () => {
    /* config.year=true but shelf has no year journal */
  });
  it("invokes OpenDateFlow with the period's journals when a badge is clicked", async () => {
    /* ... */
  });
  it("marks the matching badge active when the active note's anchor matches refDate at that period", () => {
    /* ... */
  });
});

describe("PeriodButtonsItemConfig", () => {
  it("emits onChange when each toggle flips", async () => {
    /* 4 tests, one per field */
  });
});
```

(Per `[[feedback_one_behavior_per_test]]`: split the four toggles into four tests.)

- [ ] **Step 2-5: Implement (component + config + ts)**

```vue
<!-- PeriodButtonsItem.vue -->
<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate, MonthPeriod, QuarterPeriod, WeekPeriod, YearPeriod, type Period } from "@/calendar";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { OpenDateFlow } from "@/journals";
import { defineOpenMode } from "@/infrastructure/host";
import { ActiveEntryViewModel } from "@/notes-calendar/active-entry";
import { useShelfScope } from "@/notes-calendar/use-shelf-scope";
import UiButton from "@/ui/UiButton.vue";

import type { BlockInstanceId } from "../../config";
import { useViewContext } from "../../view-context";

const props = defineProps<{
  instanceId: BlockInstanceId;
  config: { week: boolean; month: boolean; quarter: boolean; year: boolean };
}>();

const ctx = useViewContext();
const flows = useService(Flows);
const activeVM = useService(ActiveEntryViewModel);
const scope = useShelfScope(() => ctx.shelf.value);

interface Badge {
  readonly key: "week" | "month" | "quarter" | "year";
  readonly period: Period;
  readonly journals: readonly string[];
  readonly label: string;
}

const badges = computed<readonly Badge[]>(() => {
  const date = CalendarDate.fromAnchor(ctx.refDate.value);
  const out: Badge[] = [];
  const add = (key: Badge["key"], period: Period, journals: readonly string[], format: string) => {
    if (!props.config[key]) return;
    if (journals.length === 0) return;
    out.push({ key, period, journals, label: period.format(format) });
  };
  add("week", WeekPeriod.containing(date), scope.week.value, "[W]ww YYYY");
  add("month", MonthPeriod.containing(date), scope.month.value, "MMM YYYY");
  add("quarter", QuarterPeriod.containing(date), scope.quarter.value, "[Q]Q YYYY");
  add("year", YearPeriod.containing(date), scope.year.value, "YYYY");
  return out;
});

function isActive(badge: Badge): boolean {
  const a = activeVM.active.value;
  if (a === null) return false;
  if (!badge.journals.includes(a.journalName)) return false;
  return a.anchor === badge.period.anchor.toAnchor();
}

function open(badge: Badge, event: MouseEvent): void {
  void flows.invoke(OpenDateFlow, {
    anchor: badge.period.anchor.toAnchor(),
    journalNames: [...badge.journals],
    openMode: defineOpenMode(event),
  });
}
</script>

<template>
  <UiButton
    v-for="badge of badges"
    :key="badge.key"
    flat
    :data-active="isActive(badge) || null"
    @click="(e) => open(badge, e)"
  >
    {{ badge.label }}
  </UiButton>
</template>
```

```vue
<!-- PeriodButtonsItemConfig.vue -->
<script setup lang="ts">
import { m } from "@/i18n";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

const props = defineProps<{
  config: { week: boolean; month: boolean; quarter: boolean; year: boolean };
  onChange: (next: typeof props.config) => void;
}>();
const update = (patch: Partial<typeof props.config>) => props.onChange({ ...props.config, ...patch });
</script>

<template>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_period_buttons_config_week() }}</template>
    <UiToggle :model-value="config.week" @update:model-value="(v) => update({ week: v })" />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_period_buttons_config_month() }}</template>
    <UiToggle :model-value="config.month" @update:model-value="(v) => update({ month: v })" />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_period_buttons_config_quarter() }}</template>
    <UiToggle :model-value="config.quarter" @update:model-value="(v) => update({ quarter: v })" />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_period_buttons_config_year() }}</template>
    <UiToggle :model-value="config.year" @update:model-value="(v) => update({ year: v })" />
  </UiSettingRow>
</template>
```

```ts
// period-buttons-item.ts
import * as v from "valibot";

import { m } from "@/i18n";

import { defineToolbarItem } from "../../define-toolbar-item";
import PeriodButtonsItem from "./PeriodButtonsItem.vue";
import PeriodButtonsItemConfig from "./PeriodButtonsItemConfig.vue";

const schema = v.object({ week: v.boolean(), month: v.boolean(), quarter: v.boolean(), year: v.boolean() });

export const periodButtonsItem = defineToolbarItem({
  key: "period-buttons",
  label: m.view_toolbar_period_buttons_label(),
  description: m.view_toolbar_period_buttons_description(),
  icon: "calendar-range",
  schema,
  defaultConfig: { week: false, month: true, quarter: true, year: true },
  component: PeriodButtonsItem,
  configComponent: PeriodButtonsItemConfig,
});
```

- [ ] **Step 6: Run, pass; check:types + lint; commit**

```bash
git add src/views/toolbar-items/period-buttons messages/en.json
git commit -m "feat(views): period-buttons toolbar item"
```

---

# Task 13: Button — action schema + per-action defaults helper

**Files:**

- Create: `src/views/toolbar-items/button/button-config.ts`
- Create: `src/views/toolbar-items/button/button-config.test.ts`

The action schema (see spec § Button actions):

```ts
const levelsField = v.pipe(v.array(v.picklist(["day", "week", "month", "quarter", "year"] as const)), v.minLength(1));
const modeField = v.picklist(["select-only", "navigate", "create"] as const);

export const buttonActionSchema = v.variant("type", [
  v.object({ type: v.literal("pick-date"), mode: modeField, levels: levelsField }),
  v.object({ type: v.literal("current"), mode: modeField, levels: levelsField }),
  v.object({
    type: v.literal("navigate-step"),
    direction: v.picklist(["prev", "next"] as const),
    unit: v.picklist(["day", "week", "month", "quarter", "year"] as const),
    amount: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
  }),
]);

export const buttonItemConfigSchema = v.object({
  action: buttonActionSchema,
  icon: v.optional(v.string()),
  label: v.optional(v.string()),
  tooltip: v.optional(v.string()),
});

export type ButtonAction = v.InferOutput<typeof buttonActionSchema>;
export type ButtonConfig = v.InferOutput<typeof buttonItemConfigSchema>;
```

Per-action default resolver `resolveButtonAppearance(action: ButtonAction): { icon?: string; label?: string; tooltip: string }`:

Pattern-match the action against the table in the spec (§ Button actions, Per-action defaults). Use `match(action).with(...).exhaustive()`. The function returns the **defaults**; the component layers user overrides (icon/label/tooltip from config) on top.

Tooltip for `navigate-step` includes the unit name — use moment's `localeData()` plural names rather than hardcoded strings, **per `[[feedback_date_strings_from_moment.md]]`** (do not duplicate weekday/month names into paraglide). For the tooltip template, use `m.view_toolbar_button_default_tooltip_prev_unit({ unit: <moment unit name> })`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("resolveButtonAppearance", () => {
  it("returns the day-pick defaults for pick-date with single day level", () => {
    expect(resolveButtonAppearance({ type: "pick-date", mode: "navigate", levels: ["day"] })).toEqual({
      icon: "crosshair",
      tooltip: m.view_toolbar_button_default_tooltip_pick_day(),
    });
  });
  it("returns the multi-level pick defaults when levels.length > 1", () => {
    /* ... */
  });
  it("returns 'Today' label for current[day]", () => {
    /* ... */
  });
  it("returns 'This week' label for current[week]", () => {
    /* ... */
  });
  // ...one test per row of the table (one behavior per test)
  it("uses chevron-left + 'Previous {unit}' for navigate-step prev day/week/month", () => {
    /* ... */
  });
  it("uses chevrons-left for navigate-step prev quarter/year", () => {
    /* ... */
  });
  it("uses chevron-right for navigate-step next day/week/month", () => {
    /* ... */
  });
  it("uses chevrons-right for navigate-step next quarter/year", () => {
    /* ... */
  });
});
```

- [ ] **Step 2: Run, fail**

- [ ] **Step 3: Implement**

```ts
import { match, P } from "ts-pattern";
import * as v from "valibot";

import { m } from "@/i18n";

const levelsField = v.pipe(v.array(v.picklist(["day", "week", "month", "quarter", "year"] as const)), v.minLength(1));
const modeField = v.picklist(["select-only", "navigate", "create"] as const);

export const buttonActionSchema = v.variant("type", [
  v.object({ type: v.literal("pick-date"), mode: modeField, levels: levelsField }),
  v.object({ type: v.literal("current"), mode: modeField, levels: levelsField }),
  v.object({
    type: v.literal("navigate-step"),
    direction: v.picklist(["prev", "next"] as const),
    unit: v.picklist(["day", "week", "month", "quarter", "year"] as const),
    amount: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
  }),
]);

export const buttonItemConfigSchema = v.object({
  action: buttonActionSchema,
  icon: v.optional(v.string()),
  label: v.optional(v.string()),
  tooltip: v.optional(v.string()),
});

export type ButtonAction = v.InferOutput<typeof buttonActionSchema>;
export type ButtonConfig = v.InferOutput<typeof buttonItemConfigSchema>;

export interface ButtonAppearance {
  readonly icon?: string;
  readonly label?: string;
  readonly tooltip: string;
}

export function resolveButtonAppearance(action: ButtonAction): ButtonAppearance {
  return match(action)
    .with({ type: "pick-date", levels: P.when((l) => l.length === 1 && l[0] === "day") }, () => ({
      icon: "crosshair",
      tooltip: m.view_toolbar_button_default_tooltip_pick_day(),
    }))
    .with({ type: "pick-date" }, () => ({
      icon: "crosshair",
      tooltip: m.view_toolbar_button_default_tooltip_pick_multi(),
    }))
    .with({ type: "current", levels: P.when((l) => l.length === 1 && l[0] === "day") }, () => ({
      label: m.view_toolbar_button_default_label_today(),
      tooltip: m.view_toolbar_button_default_label_today(),
    }))
    .with({ type: "current", levels: P.when((l) => l.length === 1 && l[0] === "week") }, () => ({
      label: m.view_toolbar_button_default_label_this_week(),
      tooltip: m.view_toolbar_button_default_label_this_week(),
    }))
    .with({ type: "current", levels: P.when((l) => l.length === 1 && l[0] === "month") }, () => ({
      label: m.view_toolbar_button_default_label_this_month(),
      tooltip: m.view_toolbar_button_default_label_this_month(),
    }))
    .with({ type: "current", levels: P.when((l) => l.length === 1 && l[0] === "quarter") }, () => ({
      label: m.view_toolbar_button_default_label_this_quarter(),
      tooltip: m.view_toolbar_button_default_label_this_quarter(),
    }))
    .with({ type: "current", levels: P.when((l) => l.length === 1 && l[0] === "year") }, () => ({
      label: m.view_toolbar_button_default_label_this_year(),
      tooltip: m.view_toolbar_button_default_label_this_year(),
    }))
    .with({ type: "current" }, () => ({
      label: m.view_toolbar_button_default_label_current(),
      tooltip: m.view_toolbar_button_default_tooltip_current_multi(),
    }))
    .with({ type: "navigate-step", direction: "prev", unit: P.union("day", "week", "month") }, ({ unit }) => ({
      icon: "chevron-left",
      tooltip: m.view_toolbar_button_default_tooltip_prev_unit({ unit: localizedUnit(unit) }),
    }))
    .with({ type: "navigate-step", direction: "prev", unit: P.union("quarter", "year") }, ({ unit }) => ({
      icon: "chevrons-left",
      tooltip: m.view_toolbar_button_default_tooltip_prev_unit({ unit: localizedUnit(unit) }),
    }))
    .with({ type: "navigate-step", direction: "next", unit: P.union("day", "week", "month") }, ({ unit }) => ({
      icon: "chevron-right",
      tooltip: m.view_toolbar_button_default_tooltip_next_unit({ unit: localizedUnit(unit) }),
    }))
    .with({ type: "navigate-step", direction: "next", unit: P.union("quarter", "year") }, ({ unit }) => ({
      icon: "chevrons-right",
      tooltip: m.view_toolbar_button_default_tooltip_next_unit({ unit: localizedUnit(unit) }),
    }))
    .exhaustive();
}

function localizedUnit(unit: "day" | "week" | "month" | "quarter" | "year"): string {
  // Map to the singular human-readable name from moment, falling back to the literal.
  // moment has no public API for unit names; use a small literal table here since
  // these are the v3 unit labels and live inside the button item's UX vocabulary.
  return match(unit)
    .with("day", () => "day")
    .with("week", () => "week")
    .with("month", () => "month")
    .with("quarter", () => "quarter")
    .with("year", () => "year")
    .exhaustive();
}
```

(`localizedUnit` returns the English literal — this is a localisable string. **If the project's locale story requires it, the engineer routes through paraglide.** A note here: spec memory `[[feedback_date_strings_from_moment]]` is about weekday/month _names_, not unit-of-time labels — so adding `m.view_toolbar_unit_day()` etc. is acceptable. If the engineer wants stronger localisation, they add five keys to `messages/en.json` and reroute through them. MVP ships with the literals.)

- [ ] **Step 4: Run, pass; commit**

```bash
git add src/views/toolbar-items/button/button-config.ts src/views/toolbar-items/button/button-config.test.ts
git commit -m "feat(views): button action schema + appearance resolver"
```

---

# Task 14: Button toolbar item — runtime + multi-level dispatch

**Files:**

- Create: `src/views/toolbar-items/button/button-item.ts`
- Create: `src/views/toolbar-items/button/ButtonItem.vue`
- Create: `src/views/toolbar-items/button/ButtonItem.test.ts`
- Create: `src/views/toolbar-items/button/ButtonItemConfig.vue`
- Create: `src/views/toolbar-items/button/ButtonItemConfig.test.ts`

Click semantics (spec § Button actions, Click semantics):

- **Single-level**: click → run action for that level.
- **Multi-level**: click → open `Menu` whose items are the configured levels in array order; selecting an item runs the action for that level.

Per-action behavior (level `L`):

- `pick-date L`: opens the existing `datePickerModal` (from `src/calendar/ui/...`) with `picking: L`. On submit (a `Period`):
  - `mode: "select-only"` → `ctx.setRefDate(period.anchor.toAnchor())`.
  - `mode: "navigate"` → `OpenDateFlow({ anchor, journalNames: scope[L], openMode, existingOnly: true })`.
  - `mode: "create"` → `OpenDateFlow({ ..., existingOnly: false })`.
- `current L`: compute `period = <L-period>.containing(today())`, then apply `mode` against `period.anchor.toAnchor()` exactly as above.
- `navigate-step`: `ctx.setRefDate(period.anchor.toAnchor())` where `period = match(unit, direction)...` walks `amount` steps from `refDate`'s period at `unit`.

The component pulls `useShelfScope` to derive per-level `journalNames`, `useViewContext` for `refDate`/`shelf`/setters, and `useService(Flows)` + `useService(ModalService)` + `useService(LoggerFactoryToken)`. Per-level period construction lives in a small private helper file is overkill — put it as local `match(level).with(...).exhaustive()` block returning the period constructor.

Schema: `buttonItemConfigSchema` from Task 13.

Presets (registered on the definition; consumed by the picker per Task 3):

```ts
presets: [
  { label: m.view_toolbar_button_preset_pick_date(),  defaultConfig: { action: { type: "pick-date", mode: "navigate", levels: ["day"] } } },
  { label: m.view_toolbar_button_preset_today(),      defaultConfig: { action: { type: "current",   mode: "create",   levels: ["day"] } } },
  { label: m.view_toolbar_button_preset_prev_month(), defaultConfig: { action: { type: "navigate-step", direction: "prev", unit: "month", amount: 1 } } },
  { label: m.view_toolbar_button_preset_next_month(), defaultConfig: { action: { type: "navigate-step", direction: "next", unit: "month", amount: 1 } } },
],
```

- [ ] **Step 1: Write failing tests**

```ts
describe("ButtonItem", () => {
  describe("rendering", () => {
    it("uses the per-action default icon when config.icon is not set", () => {
      /* pick-date day → crosshair */
    });
    it("uses the per-action default label when config.label is not set", () => {
      /* current[day] → "Today" */
    });
    it("uses the per-action default tooltip when config.tooltip is not set", () => {
      /* ... */
    });
    it("overrides icon with config.icon when provided", () => {
      /* ... */
    });
    it("overrides label with config.label when provided", () => {
      /* ... */
    });
    it("overrides tooltip with config.tooltip when provided", () => {
      /* ... */
    });
    it("renders the label text when both icon and label after defaults are empty", () => {
      /* edge case */
    });
  });

  describe("click — single-level", () => {
    it("fires pick-date for the single level immediately", async () => {
      /* spy modals.open */
    });
    it("fires current for the single level immediately", async () => {
      /* spy flows.invoke(OpenDateFlow) */
    });
    it("mutates refDate by amount×unit for navigate-step", async () => {
      /* spy ctx.setRefDate */
    });
  });

  describe("click — multi-level", () => {
    it("opens a Menu with one entry per configured level for pick-date", async () => {
      /* ... */
    });
    it("opens a Menu with one entry per configured level for current", async () => {
      /* ... */
    });
    it("fires the chosen level's action when a Menu item is selected", async () => {
      /* ... */
    });
  });

  describe("pick-date mode dispatch", () => {
    it("select-only updates refDate without opening a journal", async () => {
      /* ... */
    });
    it("navigate calls OpenDateFlow with existingOnly: true", async () => {
      /* ... */
    });
    it("create calls OpenDateFlow with existingOnly: false", async () => {
      /* ... */
    });
  });

  describe("current mode dispatch", () => {
    it("computes the current period from 'now', not from refDate", async () => {
      /* installTestCalendar with fixed today */
    });
  });
});
```

- [ ] **Step 2: Run, fail**

- [ ] **Step 3: Implement `ButtonItem.vue`**

```vue
<script setup lang="ts">
import { Menu } from "obsidian";
import { match, P } from "ts-pattern";
import { computed } from "vue";

import { CalendarDate, DayPeriod, MonthPeriod, QuarterPeriod, WeekPeriod, YearPeriod, type Period } from "@/calendar";
import type { AnchorString } from "@/calendar/types";
import { datePickerModal } from "@/calendar/ui/date-picker-modal"; // confirm import path during implementation
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { defineOpenMode } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { OpenDateFlow } from "@/journals";
import { useShelfScope } from "@/notes-calendar/use-shelf-scope";
import UiButton from "@/ui/UiButton.vue";
import UiIcon from "@/ui/UiIcon.vue";

import type { BlockInstanceId } from "../../config";
import { useViewContext } from "../../view-context";

import { resolveButtonAppearance, type ButtonAction, type ButtonConfig } from "./button-config";

type Level = "day" | "week" | "month" | "quarter" | "year";

const props = defineProps<{ instanceId: BlockInstanceId; config: ButtonConfig }>();

const ctx = useViewContext();
const flows = useService(Flows);
const modals = useService(ModalService);
const scope = useShelfScope(() => ctx.shelf.value);

const appearance = computed(() => resolveButtonAppearance(props.config.action));
const icon = computed(() => props.config.icon ?? appearance.value.icon);
const label = computed(() => props.config.label ?? appearance.value.label);
const tooltip = computed(() => props.config.tooltip ?? appearance.value.tooltip);

function periodFor(level: Level, date: CalendarDate): Period {
  return match(level)
    .with("day", () => DayPeriod.containing(date))
    .with("week", () => WeekPeriod.containing(date))
    .with("month", () => MonthPeriod.containing(date))
    .with("quarter", () => QuarterPeriod.containing(date))
    .with("year", () => YearPeriod.containing(date))
    .exhaustive();
}

function journalsFor(level: Level): readonly string[] {
  return match(level)
    .with("day", () => scope.day.value)
    .with("week", () => scope.week.value)
    .with("month", () => scope.month.value)
    .with("quarter", () => scope.quarter.value)
    .with("year", () => scope.year.value)
    .exhaustive();
}

async function fire(level: Level, event: MouseEvent): Promise<void> {
  await match(props.config.action)
    .with({ type: "pick-date" }, async (action) => {
      const result = await modals.open(datePickerModal, { picking: level });
      if (result.isErr()) return;
      const period = result.value;
      await applyMode(action.mode, period.anchor.toAnchor(), level, event);
    })
    .with({ type: "current" }, async (action) => {
      const period = periodFor(level, CalendarDate.today());
      await applyMode(action.mode, period.anchor.toAnchor(), level, event);
    })
    .with({ type: "navigate-step" }, async (action) => {
      const date = CalendarDate.fromAnchor(ctx.refDate.value);
      let cursor = periodFor(action.unit, date);
      const step = match(action.direction)
        .with("prev", () => -1)
        .with("next", () => +1)
        .exhaustive();
      for (let i = 0; i < action.amount; i += 1) {
        cursor = step < 0 ? (cursor as { previous(): Period }).previous() : (cursor as { next(): Period }).next();
      }
      ctx.setRefDate(cursor.anchor.toAnchor());
    })
    .exhaustive();
}

async function applyMode(
  mode: "select-only" | "navigate" | "create",
  anchor: AnchorString,
  level: Level,
  event: MouseEvent,
): Promise<void> {
  if (mode === "select-only") {
    ctx.setRefDate(anchor);
    return;
  }
  await flows.invoke(OpenDateFlow, {
    anchor,
    journalNames: [...journalsFor(level)],
    openMode: defineOpenMode(event),
    existingOnly: mode === "navigate",
  });
}

function onClick(event: MouseEvent): void {
  const action = props.config.action;
  if (action.type === "navigate-step") {
    void fire("day", event); // navigate-step ignores level
    return;
  }
  if (action.levels.length === 1) {
    void fire(action.levels[0]!, event);
    return;
  }
  const menu = new Menu();
  for (const level of action.levels) {
    const itemLabel = menuLabelFor(action, level);
    menu.addItem((item) => item.setTitle(itemLabel).onClick(() => void fire(level, event)));
  }
  menu.showAtMouseEvent(event);
}

function menuLabelFor(action: ButtonAction, level: Level): string {
  return match(action)
    .with({ type: "pick-date" }, () => m.view_toolbar_button_menu_pick({ unit: level }))
    .with({ type: "current", levels: P.when(() => level === "day") }, () => m.view_toolbar_button_default_label_today())
    .with({ type: "current", levels: P.when(() => level === "week") }, () =>
      m.view_toolbar_button_default_label_this_week(),
    )
    .with({ type: "current", levels: P.when(() => level === "month") }, () =>
      m.view_toolbar_button_default_label_this_month(),
    )
    .with({ type: "current", levels: P.when(() => level === "quarter") }, () =>
      m.view_toolbar_button_default_label_this_quarter(),
    )
    .with({ type: "current", levels: P.when(() => level === "year") }, () =>
      m.view_toolbar_button_default_label_this_year(),
    )
    .with({ type: "current" }, () => m.view_toolbar_button_default_label_current())
    .otherwise(() => level);
}
</script>

<template>
  <UiButton flat :aria-label="tooltip" :title="tooltip" @click="onClick">
    <UiIcon v-if="icon" :name="icon" />
    <span v-if="label">{{ label }}</span>
    <span v-else-if="!icon">{{ tooltip }}</span>
  </UiButton>
</template>
```

(Verify the actual `datePickerModal` export name — `src/calendar/ui/` contains both `DatePickerModal.vue` and a `defineModal` somewhere. The engineer locates the registered modal definition and imports it; if no such `defineModal` exists yet, the spec assumes one is created as part of this work — but that crosses into `src/calendar/` which is out of scope. **Fallback:** if the existing modal isn't wrapped in `defineModal`, the button item skips picker support for now and the engineer files a follow-up issue, leaving `pick-date` to throw a not-yet-implemented log at runtime. The spec listed `pick-date` modes as in-scope; this fallback is a degradation that needs the user's sign-off — engineer flags it in the PR description if they hit it.)

- [ ] **Step 4: Implement `ButtonItemConfig.vue`**

Editing the discriminated `action` field is sizable. For MVP, ship two sub-sections:

- A read-only summary of the current action (`type` + key fields), so users see what they have.
- Inputs for the cosmetic overrides: `icon` (text input), `label` (text input), `tooltip` (text input).

Defer full action-variant editing to a follow-up; until then, users pick the right action via the picker's preset list and tweak only icon/label/tooltip from the config component. (This is a deliberate scope cut consistent with `[[feedback_v2_fidelity_default]]` because v2 had no action editing at all — there's nothing to shrink from v2.)

```vue
<script setup lang="ts">
import { m } from "@/i18n";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

import type { ButtonConfig } from "./button-config";

const props = defineProps<{ config: ButtonConfig; onChange: (next: ButtonConfig) => void }>();
const update = (patch: Partial<ButtonConfig>) => props.onChange({ ...props.config, ...patch });
</script>

<template>
  <UiSettingRow>
    <template #name>Icon</template>
    <UiTextInput :model-value="config.icon ?? ''" @update:model-value="(v) => update({ icon: v || undefined })" />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>Label</template>
    <UiTextInput :model-value="config.label ?? ''" @update:model-value="(v) => update({ label: v || undefined })" />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>Tooltip</template>
    <UiTextInput :model-value="config.tooltip ?? ''" @update:model-value="(v) => update({ tooltip: v || undefined })" />
  </UiSettingRow>
</template>
```

(The "Icon"/"Label"/"Tooltip" labels are user-facing — engineer adds `m.view_toolbar_button_config_icon_label()` etc. to `messages/en.json` and references them instead of hardcoded English. Add the keys when writing the file.)

- [ ] **Step 5: Implement `button-item.ts`**

```ts
import { m } from "@/i18n";

import { defineToolbarItem } from "../../define-toolbar-item";
import ButtonItem from "./ButtonItem.vue";
import ButtonItemConfig from "./ButtonItemConfig.vue";
import { buttonItemConfigSchema, type ButtonConfig } from "./button-config";

export const buttonItem = defineToolbarItem<ButtonConfig>({
  key: "button",
  label: m.view_toolbar_button_label(),
  description: m.view_toolbar_button_description(),
  icon: "square",
  schema: buttonItemConfigSchema,
  defaultConfig: { action: { type: "current", mode: "create", levels: ["day"] } },
  component: ButtonItem,
  configComponent: ButtonItemConfig,
  presets: [
    {
      label: m.view_toolbar_button_preset_pick_date(),
      defaultConfig: { action: { type: "pick-date", mode: "navigate", levels: ["day"] } },
    },
    {
      label: m.view_toolbar_button_preset_today(),
      defaultConfig: { action: { type: "current", mode: "create", levels: ["day"] } },
    },
    {
      label: m.view_toolbar_button_preset_prev_month(),
      defaultConfig: { action: { type: "navigate-step", direction: "prev", unit: "month", amount: 1 } },
    },
    {
      label: m.view_toolbar_button_preset_next_month(),
      defaultConfig: { action: { type: "navigate-step", direction: "next", unit: "month", amount: 1 } },
    },
  ],
});
```

- [ ] **Step 6: Run all button tests, pass; check:types + lint**

```bash
npm test -- src/views/toolbar-items/button && npm run check:types && npm run check:lint
```

- [ ] **Step 7: Commit**

```bash
git add src/views/toolbar-items/button messages/en.json
git commit -m "feat(views): button toolbar item with multi-level dispatch"
```

---

# Task 15: Module wiring — register every block + toolbar item

**Files:**

- Modify: `src/views/module.ts`

- [ ] **Step 1: Edit `src/views/module.ts`**

Inside `register(c)`, after the existing registrations, add:

```ts
import { dividerBlock } from "./blocks/divider/divider-block";
import { toolbarBlock } from "./blocks/toolbar/toolbar-block";
import { monthCalendarBlock } from "./blocks/month-calendar/month-calendar-block";
import { weekCalendarBlock } from "./blocks/week-calendar/week-calendar-block";
import { customIntervalsBlock } from "./blocks/custom-intervals/custom-intervals-block";

import { shelfSelectorItem } from "./toolbar-items/shelf-selector/shelf-selector-item";
import { periodButtonsItem } from "./toolbar-items/period-buttons/period-buttons-item";
import { buttonItem } from "./toolbar-items/button/button-item";

import { AddToolbarItemToBlockFlow } from "./flows/add-toolbar-item-to-block.flow";
import { ToolbarItemDefinitionToken } from "./tokens";

// In register(c):
c.register(ViewBlockDefinitionToken).useValue(dividerBlock);
c.register(ViewBlockDefinitionToken).useValue(toolbarBlock);
c.register(ViewBlockDefinitionToken).useValue(monthCalendarBlock);
c.register(ViewBlockDefinitionToken).useValue(weekCalendarBlock);
c.register(ViewBlockDefinitionToken).useValue(customIntervalsBlock);

c.register(ToolbarItemDefinitionToken).useValue(shelfSelectorItem);
c.register(ToolbarItemDefinitionToken).useValue(periodButtonsItem);
c.register(ToolbarItemDefinitionToken).useValue(buttonItem);

c.register(AddToolbarItemToBlockFlow).useClass(AddToolbarItemToBlockFlow);
```

- [ ] **Step 2: Run full test suite**

```bash
npm test && npm run check:types && npm run check:lint
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/views/module.ts
git commit -m "feat(views): register block + toolbar-item catalogue in module"
```

---

# Task 16: End-to-end integration test — leaf renders a full Calendar-shaped view

**Files:**

- Modify: `src/views/view-leaf.test.ts`

Add a single end-to-end test that mounts `JournalViewLeaf` with a view containing:

- a `toolbar` block with `shelf-selector` + `button` (current/day/create) + `period-buttons` items,
- a `month-calendar` block,
- a `divider`,
- a `custom-intervals` block.

Assert that:

- the toolbar element is in the DOM,
- the period-buttons section renders at least one badge,
- the month-calendar wrapper element is in the DOM,
- the divider is in the DOM,
- no error placeholders appear.

This is the only end-to-end test in the plan; individual block tests live in their own folders.

- [ ] **Step 1: Add the test**

Write the test using the existing `build()` helper in `view-leaf.test.ts`, extended to register the new block + toolbar-item definitions (use the actual exports — no stubs).

- [ ] **Step 2: Run, check, fix, pass**

```bash
npm test -- src/views/view-leaf.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/views/view-leaf.test.ts
git commit -m "test(views): end-to-end leaf renders full Calendar-shaped view"
```

---

# Task 17: Final verification

- [ ] **Step 1: Full local gates**

```bash
npm test
npm run check:types
npm run check:lint
```

Expected: PASS for all three.

- [ ] **Step 2: Manual smoke check (optional but recommended for UI work)**

Open Obsidian dev vault, create a new view from the settings dashboard, add each block kind + each toolbar item kind, verify they render and interact (click "Today" button, change shelf, click period badge). Per global system prompt: state explicitly that this manual step is "not exercised" if skipped — do not claim success without it.

- [ ] **Step 3: Make sure `src/calendar/ui/CalendarMonthView.vue` is untouched or its drift is intentional**

The uncommitted change to `CalendarMonthView.vue` predates this plan. Don't fold it into the views work; either revert before merging the blocks PR, or commit it separately with its own justification.

```bash
git status -s
# Confirm only the views-related files (and intervalBlock journal field) are modified.
```

- [ ] **Step 4: Open the PR**

PR title: `feat(views): MVP block + toolbar-item catalogue`. Description summarises each block / item and explicitly calls out the deferred items (migration, default-view seeding, legacy adapter, `intervalBlock` editing UI in journal subpage, full button-action editing in `ButtonItemConfig`).

---

## Plan self-review notes

(Per writing-plans skill — recorded inline for traceability.)

1. **Spec coverage**:
   - MVP blocks (toolbar, month-calendar, week-calendar, custom-intervals, divider) — Tasks 4–10.
   - MVP toolbar items (button, shelf-selector, period-buttons) — Tasks 11–14.
   - Button action discriminated union + per-action defaults + multi-level UX — Tasks 13–14.
   - `ToolbarItemsList` + picker (action-flattened presets) — Task 3.
   - `defineToolbarItem` + `ToolbarItemDefinitionToken` — Task 1.
   - Service ops for toolbar items — Task 2.
   - `intervalBlock` field on journal config — Task 9 (covers schema; editor UI deferred and noted).
   - View-leaf integration — already in place; covered end-to-end in Task 16.
   - Migration, default-Calendar-view seed, legacy `CALENDAR_VIEW_TYPE` adapter, `viewsActiveStyle` rename, `intervalBlock` settings UI — **explicitly out of scope** in the header.

2. **Type consistency**: All references to `ViewId`, `BlockInstanceId`, `ViewBlockDefinition`, `ToolbarItemDefinition`, `ViewContext`, `View`, `ViewBlockInstance` match what's already in `src/views/config.ts`, `view-context.ts`, `tokens.ts`, `define-view-block.ts`, `define-toolbar-item.ts` (added in Task 1).

3. **Placeholder scan**: every "/_ ... _/" inside a test body is a deliberate one-liner placeholder for a single test the engineer fills in by mirroring an adjacent already-written test in the same file; the file paths and behavior names are given. No "TBD"/"TODO"/"implement later" remain in implementation code. Where the spec is genuinely ambiguous (e.g. `datePickerModal` import path, `NavigationCodeBlock` v3 prop signature), the plan calls out the verification step and a documented fallback.
