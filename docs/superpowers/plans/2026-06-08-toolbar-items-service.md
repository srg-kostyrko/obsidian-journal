# Toolbar Items Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the toolbar block's items their own deep module — a `ToolbarItemsService` that owns the single validated parse of `config.items`, item-config validation, and the add/remove/move mutations — and delegate `ViewsService`'s five `*ToolbarItem*` methods to it.

**Architecture:** A DI service in `src/views/blocks/toolbar/`, co-located with the toolbar block whose config it owns. It injects the toolbar-item registry (`ToolbarItemDefinitionToken`), exposes `itemsOf` (the one `v.safeParse` against the toolbar block's own `itemSchema` — the single source of truth for `ToolbarItemInstance`), `getDefinition`, and storage-free `View → blocks` transforms `addItem`/`removeItem`/`moveItem`/`updateItemConfig`. `ViewsService` keeps only persistence (`repo.get → toolbarItems.op → repo.update`) and drops the item registry, the locally re-declared `ToolbarItemInstance`, and all six `config.items as { items?: unknown }` + `Array.isArray` casts. `ToolbarItemsList.vue` reads via `itemsOf`.

**Constraint (why a module, not types):** view-block kinds are an open DI registry (`ViewBlockDefinitionToken`) — `block.config` is `Record<string, unknown>` and cannot be statically typed by `key`. A runtime parse is unavoidable; the deepening concentrates it in one validated place. See `CONTEXT.md` → _Views_.

**Tech Stack:** TypeScript, Vitest, valibot, ts-pattern, Vue 3, the in-house DI `Container` + `Result`/`AsyncResult`/`attempt` monads. Quality gate every task: `npm run test`, `npm run check:types`, `npm run check:lint`.

---

## File structure

| File                                                     | Responsibility                         | Change                                                                     |
| -------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------- |
| `src/views/blocks/toolbar/toolbar-block.ts`              | toolbar block definition + item schema | export branded `toolbarItemSchema` + `ToolbarItemInstance`                 |
| `src/views/blocks/toolbar/toolbar-items-service.ts`      | the deep toolbar-items module          | **create**                                                                 |
| `src/views/blocks/toolbar/toolbar-items-service.test.ts` | its unit tests                         | **create**                                                                 |
| `src/views/module.ts`                                    | DI wiring                              | register `ToolbarItemsService`                                             |
| `src/views/service.ts`                                   | views persistence                      | delegate the 5 `*ToolbarItem*` methods; drop registry + casts + local type |
| `src/views/ui/ToolbarItemsList.vue`                      | toolbar-item settings list             | read items via `itemsOf`                                                   |
| `src/views/service.test.ts`                              | existing toolbar tests                 | thin to persistence-boundary checks                                        |

---

## Task 1: Export a branded item schema from the toolbar block

The toolbar block already declares `itemSchema` privately. Make it the single source of truth: brand its `id` and export it plus the inferred instance type.

**Files:**

- Modify: `src/views/blocks/toolbar/toolbar-block.ts`

- [ ] **Step 1: Edit the schema and exports**

Replace the top of `src/views/blocks/toolbar/toolbar-block.ts` (the imports through the `schema`/`ToolbarConfig` lines):

```ts
import * as v from "valibot";

import { m } from "@/i18n";

import { defineViewBlock } from "../../define-view-block";

import ToolbarBlock from "./ui/ToolbarBlock.vue";

const itemSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  key: v.pipe(v.string(), v.minLength(1)),
  config: v.record(v.string(), v.unknown()),
});

const schema = v.object({ items: v.array(itemSchema) });

type ToolbarConfig = v.InferOutput<typeof schema>;
```

with:

```ts
import * as v from "valibot";

import { m } from "@/i18n";

import { defineViewBlock } from "../../define-view-block";

import ToolbarBlock from "./ui/ToolbarBlock.vue";

import type { BlockInstanceId } from "../../config";

export const toolbarItemSchema = v.object({
  id: v.pipe(
    v.string(),
    v.uuid(),
    v.transform((s) => s as BlockInstanceId),
  ),
  key: v.pipe(v.string(), v.minLength(1)),
  config: v.record(v.string(), v.unknown()),
});

export type ToolbarItemInstance = v.InferOutput<typeof toolbarItemSchema>;

const schema = v.object({ items: v.array(toolbarItemSchema) });

type ToolbarConfig = v.InferOutput<typeof schema>;
```

> `ToolbarItemInstance` is now `{ id: BlockInstanceId; key: string; config: Record<string, unknown> }`, inferred from the schema. The `v.transform` carries the brand (matches `viewBlockInstanceSchema.id` in `config.ts`).

- [ ] **Step 2: Quality gate**

Run: `npm run check:types && npm run check:lint`
Expected: pass. (No behavior change yet; `itemsOf` in Task 2 exercises the parse. `npm run test` still green — the `toolbar-block.test.ts` and `service.test.ts` fixtures are independent of this rename.)

- [ ] **Step 3: Commit**

```bash
git add src/views/blocks/toolbar/toolbar-block.ts
git commit -m "refactor(views): export branded toolbar item schema as source of truth"
```

---

## Task 2: Create `ToolbarItemsService` (test-first) and register it

**Files:**

- Create: `src/views/blocks/toolbar/toolbar-items-service.ts`
- Create: `src/views/blocks/toolbar/toolbar-items-service.test.ts`
- Modify: `src/views/module.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/views/blocks/toolbar/toolbar-items-service.test.ts`:

```ts
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";
import { createLoggerTestingModule } from "@/infrastructure/logger/testing";
import { expectErr, expectOk } from "@/infrastructure/result/testing";

import { defineToolbarItem, type ToolbarItemDefinition } from "../../define-toolbar-item";
import { ToolbarItemDefinitionToken } from "../../tokens";

import { ToolbarItemsService } from "./toolbar-items-service";

import type { ToolbarItemInstance } from "./toolbar-block";
import type { BlockInstanceId, View, ViewId } from "../../config";

const noop = () => null;

const dummy = defineToolbarItem<{ x: number }>({
  key: "dummy",
  label: "Dummy",
  schema: v.object({ x: v.number() }),
  defaultConfig: { x: 0 },
  component: { setup: () => noop },
}) as ToolbarItemDefinition;

function build(items: readonly ToolbarItemDefinition[] = [dummy]): ToolbarItemsService {
  const c = new Container();
  c.addModule(createLoggerTestingModule().module);
  for (const item of items) c.register(ToolbarItemDefinitionToken).useValue(item);
  c.register(ToolbarItemsService).useClass(ToolbarItemsService);
  return c.resolve(ToolbarItemsService);
}

function viewWith(items: ToolbarItemInstance[]): View {
  return {
    id: "11111111-1111-1111-1111-111111111111" as ViewId,
    name: "V",
    icon: "x",
    defaultShelf: null,
    showInRibbon: false,
    leaf: "right",
    blocks: [{ id: "b1" as BlockInstanceId, key: "toolbar", config: { items } }],
  };
}

const item = (id: string, key = "dummy"): ToolbarItemInstance => ({
  id: id as BlockInstanceId,
  key,
  config: { x: 0 },
});

describe("ToolbarItemsService", () => {
  describe("itemsOf", () => {
    it("returns the parsed items of a toolbar block", () => {
      const service = build();
      const view = viewWith([item("a")]);
      expect(service.itemsOf(view.blocks[0]).map((i) => i.id)).toEqual(["a"]);
    });

    it("returns an empty list when the config has no items array", () => {
      const service = build();
      const block = { id: "b1" as BlockInstanceId, key: "toolbar", config: { items: "garbage" } };
      expect(service.itemsOf(block)).toEqual([]);
    });
  });

  describe("addItem", () => {
    it("returns UnknownToolbarItemKeyError for an unregistered key", () => {
      const service = build([]);
      const result = service.addItem(viewWith([]), "b1" as BlockInstanceId, "nope");
      expectErr(result);
      expect(result.error.kind).toBe("unknown-toolbar-item-key");
    });

    it("appends an item carrying the definition's defaultConfig", () => {
      const service = build();
      const result = service.addItem(viewWith([]), "b1" as BlockInstanceId, "dummy");
      expectOk(result);
      const items = service.itemsOf(result.value!.blocks[0]);
      expect(items).toHaveLength(1);
      expect(items[0].config).toEqual({ x: 0 });
    });

    it("uses the supplied config override", () => {
      const service = build();
      const result = service.addItem(viewWith([]), "b1" as BlockInstanceId, "dummy", { x: 99 });
      expectOk(result);
      expect(service.itemsOf(result.value!.blocks[0])[0].config).toEqual({ x: 99 });
    });

    it("returns Ok(null) when the block id is absent", () => {
      const service = build();
      const result = service.addItem(viewWith([]), "missing" as BlockInstanceId, "dummy");
      expectOk(result);
      expect(result.value).toBeNull();
    });
  });

  describe("removeItem", () => {
    it("drops the matching item", () => {
      const service = build();
      const blocks = service.removeItem(
        viewWith([item("a"), item("b")]),
        "b1" as BlockInstanceId,
        "a" as BlockInstanceId,
      );
      expect(blocks).not.toBeNull();
      expect(service.itemsOf(blocks![0]).map((i) => i.id)).toEqual(["b"]);
    });

    it("returns null when the item id is absent", () => {
      const service = build();
      const blocks = service.removeItem(viewWith([item("a")]), "b1" as BlockInstanceId, "z" as BlockInstanceId);
      expect(blocks).toBeNull();
    });
  });

  describe("moveItem", () => {
    it("swaps toward the delta", () => {
      const service = build();
      const blocks = service.moveItem(
        viewWith([item("a"), item("b")]),
        "b1" as BlockInstanceId,
        "b" as BlockInstanceId,
        -1,
      );
      expect(blocks).not.toBeNull();
      expect(service.itemsOf(blocks![0]).map((i) => i.id)).toEqual(["b", "a"]);
    });

    it("returns null at an out-of-range edge", () => {
      const service = build();
      const blocks = service.moveItem(viewWith([item("a")]), "b1" as BlockInstanceId, "a" as BlockInstanceId, -1);
      expect(blocks).toBeNull();
    });
  });

  describe("updateItemConfig", () => {
    it("writes the new config on success", () => {
      const service = build();
      const result = service.updateItemConfig(viewWith([item("a")]), "b1" as BlockInstanceId, "a" as BlockInstanceId, {
        x: 7,
      });
      expectOk(result);
      expect(service.itemsOf(result.value![0])[0].config).toEqual({ x: 7 });
    });

    it("returns InvalidToolbarItemConfigError when config fails the item schema", () => {
      const service = build();
      const result = service.updateItemConfig(viewWith([item("a")]), "b1" as BlockInstanceId, "a" as BlockInstanceId, {
        x: "no",
      });
      expectErr(result);
      expect(result.error.kind).toBe("invalid-toolbar-item-config");
    });

    it("returns Ok(null) when the item id is absent", () => {
      const service = build();
      const result = service.updateItemConfig(viewWith([item("a")]), "b1" as BlockInstanceId, "z" as BlockInstanceId, {
        x: 1,
      });
      expectOk(result);
      expect(result.value).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/views/blocks/toolbar/toolbar-items-service.test.ts`
Expected: FAIL — `./toolbar-items-service` has no `ToolbarItemsService`.

- [ ] **Step 3: Write the implementation**

Create `src/views/blocks/toolbar/toolbar-items-service.ts`:

```ts
import * as v from "valibot";

import { inject } from "@/infrastructure/di";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { Err, Ok, Option, type Result } from "@/infrastructure/result";

import { InvalidToolbarItemConfigError, UnknownToolbarItemKeyError } from "../../errors";
import { ToolbarItemDefinitionToken } from "../../tokens";

import { toolbarItemSchema, type ToolbarItemInstance } from "./toolbar-block";

import type { BlockInstanceId, View, ViewBlockInstance } from "../../config";
import type { ToolbarItemDefinition } from "../../define-toolbar-item";

export class ToolbarItemsService {
  readonly #itemList = inject(ToolbarItemDefinitionToken);
  readonly #logger = inject(LoggerFactoryToken).named("toolbar-items");
  readonly #items: ReadonlyMap<string, ToolbarItemDefinition>;

  constructor() {
    const map = new Map<string, ToolbarItemDefinition>();
    for (const definition of this.#itemList) map.set(definition.key, definition);
    this.#items = map;
  }

  getDefinition(key: string): Option<ToolbarItemDefinition> {
    return Option.fromNullable(this.#items.get(key));
  }

  itemsOf(block: ViewBlockInstance): ToolbarItemInstance[] {
    const raw = (block.config as { items?: unknown }).items ?? [];
    const parsed = v.safeParse(v.array(toolbarItemSchema), raw);
    return parsed.success ? parsed.output : [];
  }

  addItem(
    view: View,
    blockId: BlockInstanceId,
    itemKey: string,
    defaultConfig?: Record<string, unknown>,
  ): Result<{ blocks: View["blocks"]; itemId: BlockInstanceId } | null, UnknownToolbarItemKeyError> {
    const definition = this.#items.get(itemKey);
    if (!definition) return new Err(new UnknownToolbarItemKeyError(itemKey));
    const itemId = crypto.randomUUID() as BlockInstanceId;
    const newItem: ToolbarItemInstance = {
      id: itemId,
      key: itemKey,
      config: defaultConfig ?? (definition.defaultConfig as Record<string, unknown>),
    };
    const blocks = this.#withItems(view, blockId, (items) => [...items, newItem]);
    return new Ok(blocks === null ? null : { blocks, itemId });
  }

  removeItem(view: View, blockId: BlockInstanceId, itemId: BlockInstanceId): View["blocks"] | null {
    return this.#withItems(view, blockId, (items) => {
      const filtered = items.filter((i) => i.id !== itemId);
      return filtered.length === items.length ? null : filtered;
    });
  }

  moveItem(view: View, blockId: BlockInstanceId, itemId: BlockInstanceId, delta: -1 | 1): View["blocks"] | null {
    return this.#withItems(view, blockId, (items) => {
      const index = items.findIndex((i) => i.id === itemId);
      const nextIndex = index + delta;
      if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return null;
      const next = [...items];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  updateItemConfig(
    view: View,
    blockId: BlockInstanceId,
    itemId: BlockInstanceId,
    config: unknown,
  ): Result<View["blocks"] | null, InvalidToolbarItemConfigError> {
    const block = view.blocks.find((b) => b.id === blockId);
    if (!block) return new Ok(null);
    const target = this.itemsOf(block).find((i) => i.id === itemId);
    if (!target) return new Ok(null);

    const definition = this.#items.get(target.key);
    if (definition) {
      const parsed = v.safeParse(definition.schema, config);
      if (!parsed.success) {
        return new Err(new InvalidToolbarItemConfigError(view.id, blockId, itemId, target.key, parsed.issues));
      }
    } else {
      this.#logger.warn("updateItemConfig: toolbar-item definition not registered; persisting without validation", {
        viewId: view.id,
        blockId,
        itemId,
        key: target.key,
      });
    }

    const blocks = this.#withItems(view, blockId, (items) =>
      items.map((i) => (i.id === itemId ? { ...i, config: config as Record<string, unknown> } : i)),
    );
    return new Ok(blocks);
  }

  #withItems(
    view: View,
    blockId: BlockInstanceId,
    mutate: (items: ToolbarItemInstance[]) => ToolbarItemInstance[] | null,
  ): View["blocks"] | null {
    const block = view.blocks.find((b) => b.id === blockId);
    if (!block) return null;
    const next = mutate(this.itemsOf(block));
    if (next === null) return null;
    return view.blocks.map((b) => (b.id === blockId ? { ...b, config: { ...b.config, items: next } } : b));
  }
}
```

> `crypto.randomUUID()` is the same global the old `ViewsService` used. The lone cast — `block.config as { items?: unknown }` in `itemsOf` — is the single, immediately-validated parse the whole feature now shares.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/views/blocks/toolbar/toolbar-items-service.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Register the service in the views module**

In `src/views/module.ts`:

a) Add the import (with the other block imports near `toolbarBlock`):

```ts
import { ToolbarItemsService } from "./blocks/toolbar/toolbar-items-service";
```

b) Register it alongside the other services (after the `ViewsService` registration line). It is **not** `.eager()` — the eager `ViewsService` pulls it on construction:

```ts
c.register(ToolbarItemsService).useClass(ToolbarItemsService);
```

- [ ] **Step 6: Quality gate**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/views/blocks/toolbar/toolbar-items-service.ts src/views/blocks/toolbar/toolbar-items-service.test.ts src/views/module.ts
git commit -m "feat(views): add ToolbarItemsService owning the toolbar-items concern"
```

---

## Task 3: Delegate `ViewsService` to `ToolbarItemsService`

The existing `ViewsService – toolbar-item operations` tests in `service.test.ts` (lines ~394–695) are the regression net: they exercise the same public methods and must stay green after delegation.

**Files:**

- Modify: `src/views/service.ts`

- [ ] **Step 1: Run the existing toolbar tests (green baseline)**

Run: `npm run test -- src/views/service.test.ts`
Expected: PASS — baseline before refactor.

- [ ] **Step 2: Swap dependencies and delete the local item machinery**

In `src/views/service.ts`:

a) Imports — remove the toolbar-item registry token and the local definition type, add the service. Change:

```ts
import { ViewsRepository } from "./repository";
import { ToolbarItemDefinitionToken, ViewBlockDefinitionToken } from "./tokens";

import type { BlockInstanceId, View, ViewId } from "./config";
import type { ToolbarItemDefinition } from "./define-toolbar-item";
import type { ViewBlockDefinition } from "./define-view-block";
```

to:

```ts
import { ToolbarItemsService } from "./blocks/toolbar/toolbar-items-service";
import { ViewsRepository } from "./repository";
import { ViewBlockDefinitionToken } from "./tokens";

import type { BlockInstanceId, View, ViewId } from "./config";
import type { ViewBlockDefinition } from "./define-view-block";
```

b) Delete the local `ToolbarItemInstance` interface (the `interface ToolbarItemInstance { … }` block).

c) Field declarations + constructor — drop `#itemList` and `#items`, inject the service. Replace:

```ts
  readonly #repo = inject(ViewsRepository);
  readonly #blockList = inject(ViewBlockDefinitionToken);
  readonly #itemList = inject(ToolbarItemDefinitionToken);
  readonly #logger = inject(LoggerFactoryToken).named("views-service");
  readonly #blocks: ReadonlyMap<string, ViewBlockDefinition>;
  readonly #items: ReadonlyMap<string, ToolbarItemDefinition>;

  constructor() {
    const blockMap = new Map<string, ViewBlockDefinition>();
    for (const definition of this.#blockList) blockMap.set(definition.key, definition);
    this.#blocks = blockMap;

    const itemMap = new Map<string, ToolbarItemDefinition>();
    for (const definition of this.#itemList) itemMap.set(definition.key, definition);
    this.#items = itemMap;
  }
```

with:

```ts
  readonly #repo = inject(ViewsRepository);
  readonly #blockList = inject(ViewBlockDefinitionToken);
  readonly #toolbarItems = inject(ToolbarItemsService);
  readonly #logger = inject(LoggerFactoryToken).named("views-service");
  readonly #blocks: ReadonlyMap<string, ViewBlockDefinition>;

  constructor() {
    const blockMap = new Map<string, ViewBlockDefinition>();
    for (const definition of this.#blockList) blockMap.set(definition.key, definition);
    this.#blocks = blockMap;
  }
```

- [ ] **Step 3: Add a shared persistence helper**

Add this private method to `ViewsService` (place it next to the other private helpers, e.g. just before the old `#withToolbarBlock`):

```ts
  #persistBlocks(id: ViewId, blocks: View["blocks"]): AsyncResult<void, UnknownViewError> {
    return this.#repo.update(id, { blocks }).mapErr((cause): UnknownViewError => {
      if (cause.kind === "unknown-view") return cause;
      throw new ViewsInvariantError(`unreachable: repo.update returned ${cause.kind}`);
    });
  }
```

- [ ] **Step 4: Rewrite the five toolbar methods as delegations**

Replace the whole region from `addToolbarItem` through `#moveToolbarItem` (i.e. `addToolbarItem`, `removeToolbarItem`, `moveToolbarItemUp`, `moveToolbarItemDown`, `updateToolbarItemConfig`, `getToolbarItemDefinition`, `#withToolbarBlock`, `#moveToolbarItem`) with:

```ts
  addToolbarItem(
    id: ViewId,
    blockId: BlockInstanceId,
    itemKey: string,
    defaultConfig?: Record<string, unknown>,
  ): AsyncResult<BlockInstanceId | null, UnknownViewError | UnknownToolbarItemKeyError> {
    return attempt.in(this, async function* () {
      const current = yield* this.#repo.get(id).okOrElse(() => new UnknownViewError(id));
      const outcome = yield* this.#toolbarItems.addItem(current, blockId, itemKey, defaultConfig);
      if (outcome === null) return null;
      yield* this.#persistBlocks(id, outcome.blocks);
      return outcome.itemId;
    });
  }

  removeToolbarItem(id: ViewId, blockId: BlockInstanceId, itemId: BlockInstanceId): AsyncResult<void, UnknownViewError> {
    return attempt.in(this, async function* () {
      const current = yield* this.#repo.get(id).okOrElse(() => new UnknownViewError(id));
      const blocks = this.#toolbarItems.removeItem(current, blockId, itemId);
      if (blocks === null) return;
      yield* this.#persistBlocks(id, blocks);
    });
  }

  moveToolbarItemUp(id: ViewId, blockId: BlockInstanceId, itemId: BlockInstanceId): AsyncResult<void, UnknownViewError> {
    return this.#moveToolbarItem(id, blockId, itemId, -1);
  }

  moveToolbarItemDown(
    id: ViewId,
    blockId: BlockInstanceId,
    itemId: BlockInstanceId,
  ): AsyncResult<void, UnknownViewError> {
    return this.#moveToolbarItem(id, blockId, itemId, +1);
  }

  updateToolbarItemConfig(
    id: ViewId,
    blockId: BlockInstanceId,
    itemId: BlockInstanceId,
    config: unknown,
  ): AsyncResult<void, UnknownViewError | InvalidToolbarItemConfigError> {
    return attempt.in(this, async function* () {
      const current = yield* this.#repo.get(id).okOrElse(() => new UnknownViewError(id));
      const blocks = yield* this.#toolbarItems.updateItemConfig(current, blockId, itemId, config);
      if (blocks === null) return;
      yield* this.#persistBlocks(id, blocks);
    });
  }

  getToolbarItemDefinition(key: string): Option<ToolbarItemDefinition> {
    return this.#toolbarItems.getDefinition(key);
  }

  #moveToolbarItem(
    id: ViewId,
    blockId: BlockInstanceId,
    itemId: BlockInstanceId,
    delta: -1 | 1,
  ): AsyncResult<void, UnknownViewError> {
    return attempt.in(this, async function* () {
      const current = yield* this.#repo.get(id).okOrElse(() => new UnknownViewError(id));
      const blocks = this.#toolbarItems.moveItem(current, blockId, itemId, delta);
      if (blocks === null) return;
      yield* this.#persistBlocks(id, blocks);
    });
  }
```

> `getToolbarItemDefinition` still returns `Option<ToolbarItemDefinition>`, so keep a `type { ToolbarItemDefinition }` import — add it back if `check:types` reports it missing: `import type { ToolbarItemDefinition } from "./define-toolbar-item";`. `UnknownToolbarItemKeyError` and `InvalidToolbarItemConfigError` remain imported from `./errors` (they appear in the return-type unions).

- [ ] **Step 5: Run the regression net**

Run: `npm run test -- src/views/service.test.ts`
Expected: PASS — same set as Step 1; behavior preserved through delegation.

- [ ] **Step 6: Quality gate**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass. Verify the casts are gone:

```bash
grep -n "items?: unknown" src/views/service.ts   # expect: no matches
```

- [ ] **Step 7: Commit**

```bash
git add src/views/service.ts
git commit -m "refactor(views): delegate toolbar-item operations to ToolbarItemsService"
```

---

## Task 4: Read `ToolbarItemsList` items through `itemsOf`

**Files:**

- Modify: `src/views/ui/ToolbarItemsList.vue`

- [ ] **Step 1: Replace the inline cast with the service accessor**

In `src/views/ui/ToolbarItemsList.vue`:

a) Add the service import (with the other `../service` / view imports):

```ts
import { ToolbarItemsService } from "../blocks/toolbar/toolbar-items-service";
```

b) Resolve it next to the existing services:

```ts
const toolbarItems = useService(ToolbarItemsService);
```

c) Replace the `rows` computed's item extraction. Change:

```ts
const rows = computed<Row[]>(() => {
  const items = viewsVM
    .getView(props.viewId)
    .map((view) => view.blocks.find((b) => b.id === props.blockId))
    .map((block) => {
      const raw = block?.config.items;
      return Array.isArray(raw) ? (raw as { id: BlockInstanceId; key: string; config: Record<string, unknown> }[]) : [];
    })
    .getOr([]);
  return items.map((item) => ({
    id: item.id,
    key: item.key,
    definition: viewsService.getToolbarItemDefinition(item.key).getOr(undefined as never),
  }));
});
```

to:

```ts
const rows = computed<Row[]>(() => {
  const items = viewsVM
    .getView(props.viewId)
    .map((view) => view.blocks.find((b) => b.id === props.blockId))
    .map((block) => (block ? toolbarItems.itemsOf(block) : []))
    .getOr([]);
  return items.map((item) => ({
    id: item.id,
    key: item.key,
    definition: viewsService.getToolbarItemDefinition(item.key).getOr(undefined as never),
  }));
});
```

> If `viewsService` is now used only for `getToolbarItemDefinition`, that is fine — leave it. Do not remove the `viewsService` import unless `check:lint` flags it unused.

- [ ] **Step 2: Quality gate**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass. Verify the last cast site is gone:

```bash
grep -rn "config.items" src/views/ui/ToolbarItemsList.vue   # expect: no matches
```

- [ ] **Step 3: Commit**

```bash
git add src/views/ui/ToolbarItemsList.vue
git commit -m "refactor(views): read toolbar items via ToolbarItemsService.itemsOf"
```

---

## Task 5: Thin the `ViewsService` toolbar tests

The granular add/remove/move/update behavior is now owned by `toolbar-items-service.test.ts`. Keep, in `service.test.ts`, only the tests that verify the **persistence + error boundary** through `ViewsService` (delegation result reaches the repo / propagates the typed error) — that is the part `ViewsService` still owns. Remove the rest to avoid testing the same behavior twice and to keep the suite pointed at one cause per failure.

**Files:**

- Modify: `src/views/service.test.ts`

- [ ] **Step 1: Reduce the `ViewsService – toolbar-item operations` describe block**

Within `describe("ViewsService – toolbar-item operations", …)`, keep exactly these four `it(...)` cases (they assert the repo persisted the delegated result or the typed error surfaced):

- `addToolbarItem` → `"appends a new item to the toolbar block's items array"`
- `addToolbarItem` → `"returns UnknownToolbarItemKeyError when the key is not registered"`
- `removeToolbarItem` → `"removes the matching item"`
- `updateToolbarItemConfig` → the case asserting `InvalidToolbarItemConfigError` (the `it` whose result is `expectErr` with `kind === "invalid-toolbar-item-config"`)

Delete the other `it(...)` cases in that describe block (the `stores the chosen item key`, `applies the definition's defaultConfig`, `uses the supplied defaultConfig override`, `is a no-op when the block id is not present`, the `removeToolbarItem` no-op case, and both `moveToolbarItemUp` / `moveToolbarItemDown` cases) — they duplicate `toolbar-items-service.test.ts`. Leave the `dummyItem` fixture and the local `toolbarBlock` fixture in place (the kept tests still use them).

- [ ] **Step 2: Run the file**

Run: `npm run test -- src/views/service.test.ts`
Expected: PASS with the reduced toolbar block.

- [ ] **Step 3: Full quality gate**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/views/service.test.ts
git commit -m "test(views): scope ViewsService toolbar tests to the persistence boundary"
```

---

## Self-review notes

- **Spec coverage:** the deep module (Task 2) owns parse (`itemsOf`), validation (`updateItemConfig`), registry (`getDefinition`), and the three mutations; `ViewsService` delegates (Task 3); the read-path cast is removed (Task 4); duplicate tests are pruned (Task 5). `ToolbarItemInstance` has one source of truth (Task 1). The six cast sites are accounted for: five in `ViewsService` (Task 3) + one in `ToolbarItemsList` (Task 4); the surviving cast lives once in `ToolbarItemsService.itemsOf`.
- **Type consistency:** `ToolbarItemInstance` is imported from `./toolbar-block` everywhere; service method names are stable (`itemsOf`, `addItem`, `removeItem`, `moveItem`, `updateItemConfig`, `getDefinition`). The no-op contract is uniform: `null` means "block/item absent or no change → skip persistence."
- **Not fused:** `BlocksList.vue` / `ToolbarItemsList.vue` stay separate (different domain entity behind the same row shape) — `CONTEXT.md` → _Don't fuse by shape (views)_.
- **Open verification point (Task 3 Step 4):** confirm whether `import type { ToolbarItemDefinition } from "./define-toolbar-item"` is still required after the rewrite (it is referenced by `getToolbarItemDefinition`'s return type) — `check:types` will say; add it back if flagged.
- **Registration ordering (Task 2 Step 5):** `ToolbarItemsService` must be registered in `viewsModule` before `ViewsService` is resolved. Since both are in the same module's `register(c)` and `ViewsService` is `.eager()` (resolved during `autoLoad`, not at registration time), registration order within the module body does not matter.
