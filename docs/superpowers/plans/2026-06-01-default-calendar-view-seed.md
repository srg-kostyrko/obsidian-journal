# Default "Calendar" view — new-install seed: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a fresh plugin install, auto-create one view named "Calendar" that reproduces the v2 calendar view, using a generic seed-on-absent hook in the settings collection layer.

**Architecture:** `defineCollection` gains an optional `{ seed }`. `SettingsService` hydrates a collection from its seed only when the collection key is _absent_ from stored data (fresh install) — present-but-empty is respected as a deliberate deletion. A new `src/views/default-view.ts` provides `defaultCalendarView()` (fixed ids, composed from already-built blocks), wired into `viewsCollection`'s seed.

**Tech Stack:** TypeScript, valibot (schemas), Vue/Obsidian (consumed, not touched here), vitest, paraglide (i18n), DI container.

**Spec:** `docs/superpowers/specs/2026-06-01-default-calendar-view-seed-design.md`

---

## File Structure

- `src/settings/schema.ts` — add `seed?` to `CollectionDefinition`; add optional `options` arg to `defineCollection`. (Modify)
- `src/settings/settings-service.ts` — `parseCollectionValue` seeds on absent key. (Modify)
- `src/settings/settings-service.test.ts` — tests for the seed-on-absent behavior. (Modify)
- `messages/en.json` — add `view_default_calendar_name`. (Modify)
- `src/views/default-view.ts` — `DEFAULT_CALENDAR_VIEW_ID`, fixed instance ids, `defaultCalendarView()`. (Create)
- `src/views/default-view.test.ts` — tests for the seed composition. (Create)
- `src/views/config.ts` — wire `seed` into `viewsCollection`. (Modify)

**Quality gates (every task, before commit):** `npm test`, `npm run check:types`, `npm run check:lint` must all pass. `npm` scripts (not pnpm). There is no e2e suite.

---

## Task 1: Generic collection seed-on-absent mechanism (settings infra)

**Files:**

- Modify: `src/settings/schema.ts`
- Modify: `src/settings/settings-service.ts:136-156` (`parseCollectionValue`)
- Test: `src/settings/settings-service.test.ts`

- [ ] **Step 1: Write the failing tests**

Add this `describe` block inside the top-level `describe("SettingsService", …)` in `src/settings/settings-service.test.ts` (e.g. right after the existing `describe("recordOf", …)` block). It defines a throwaway seeded collection — do **not** touch the real `viewsCollection` here.

```ts
describe("collection seed-on-absent", () => {
  const seededCollection = defineCollection("seeded", journalSchema, (id) => ({ name: id }), {
    seed: () => ({ alpha: { name: "seeded-alpha" } }),
  });

  it("seeds a collection when its key is absent from stored data", async () => {
    const { service } = build({ slices: [], collections: [seededCollection], raw: { version: 3 } });
    await service.initialize();
    expect(service.recordOf(seededCollection)).toEqual({ alpha: { name: "seeded-alpha" } });
  });

  it("does not seed when the collection key is present but empty", async () => {
    const { service } = build({ slices: [], collections: [seededCollection], raw: { version: 3, seeded: {} } });
    await service.initialize();
    expect(service.recordOf(seededCollection)).toEqual({});
  });
});
```

> The third spec case — "a collection with no `seed` stays empty when absent" — is already covered by the existing `recordOf` test "returns the reactive Record for a registered collection" (`journalCollection` has no seed and hydrates to `{}`). Do not duplicate it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/settings/settings-service.test.ts -t "collection seed-on-absent"`
Expected: FAIL. The first test fails (`recordOf` returns `{}` instead of the seeded record) because `defineCollection` ignores the 4th argument and `parseCollectionValue` never seeds. (A TS error on the unknown 4th arg is also possible until Step 3.)

- [ ] **Step 3: Add `seed` to the collection definition**

In `src/settings/schema.ts`, extend the `CollectionDefinition` interface and `defineCollection`:

```ts
export interface CollectionDefinition<TKey extends string, TItem extends AnySchema> {
  readonly __brand: "collection";
  readonly key: TKey;
  readonly itemSchema: TItem;
  readonly defaultItem: (id: string) => InferOutput<TItem>;
  readonly seed?: () => Record<string, InferOutput<TItem>>;
}
```

```ts
export function defineCollection<TKey extends string, TItem extends AnySchema>(
  key: TKey,
  itemSchema: TItem,
  defaultItem: (id: string) => InferOutput<TItem>,
  options?: { seed?: () => Record<string, InferOutput<TItem>> },
): CollectionDefinition<TKey, TItem> {
  return { __brand: "collection", key, itemSchema, defaultItem, seed: options?.seed };
}
```

- [ ] **Step 4: Seed on absent key in `parseCollectionValue`**

In `src/settings/settings-service.ts`, replace the body of `parseCollectionValue` (currently lines 136-156) with the version below. The new `raw === undefined && definition.seed` branch runs first; everything else is unchanged.

```ts
function parseCollectionValue<TItem extends AnySchema>(
  definition: CollectionDefinition<string, TItem>,
  raw: unknown,
  logger: Logger,
): Record<string, InferOutput<TItem>> {
  const out: Record<string, InferOutput<TItem>> = {};
  if (raw === undefined && definition.seed) {
    for (const [id, value] of Object.entries(definition.seed())) {
      const parsed = v.safeParse(definition.itemSchema, value);
      if (parsed.success) {
        out[id] = parsed.output;
      } else {
        logger.warn("collection seed entry failed validation; omitting", {
          sliceKey: `${definition.key}/${id}`,
          issues: parsed.issues.map((issue) => issue.message),
        });
      }
    }
    return out;
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, value] of Object.entries(raw)) {
    const parsed = v.safeParse(definition.itemSchema, value);
    if (parsed.success) {
      out[id] = parsed.output;
    } else {
      out[id] = definition.defaultItem(id);
      logger.warn("collection entry reset to defaults", {
        sliceKey: `${definition.key}/${id}`,
        issues: parsed.issues.map((issue) => issue.message),
      });
    }
  }
  return out;
}
```

No other change is needed: `#hydrate` already passes `migrated[definition.key]` (which is `undefined` for an absent key) into this helper, and `import * as v from "valibot"` is already at the top of the file.

- [ ] **Step 5: Run the new tests to verify they pass**

Run: `npx vitest run src/settings/settings-service.test.ts -t "collection seed-on-absent"`
Expected: PASS (2 tests).

- [ ] **Step 6: Run the full settings suite to check for regressions**

Run: `npx vitest run src/settings/settings-service.test.ts`
Expected: PASS (all existing tests still green — the absent-key branch only activates when a `seed` is defined).

- [ ] **Step 7: Quality gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/settings/schema.ts src/settings/settings-service.ts src/settings/settings-service.test.ts
git commit -m "feat(settings): seed a collection on absent key"
```

---

## Task 2: The default Calendar view seed (views feature)

**Files:**

- Modify: `messages/en.json`
- Create: `src/views/default-view.ts`
- Test: `src/views/default-view.test.ts`

- [ ] **Step 1: Add the i18n message**

In `messages/en.json`, add a new key right after the line `"view_block_divider_label": "Divider",`:

```json
  "view_default_calendar_name": "Calendar",
```

- [ ] **Step 2: Compile i18n so `m.view_default_calendar_name` exists**

Run: `npm run compile:i18n`
Expected: completes without error; regenerates `src/i18n/paraglide/` (git-ignored — do not stage it).

- [ ] **Step 3: Write the failing tests**

Create `src/views/default-view.test.ts`:

```ts
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { viewSchema } from "./config";
import { defaultCalendarView } from "./default-view";

interface ToolbarItem {
  id: string;
  key: string;
  config: Record<string, unknown>;
}

function toolbarItems(): ToolbarItem[] {
  const [toolbar] = defaultCalendarView().blocks;
  return (toolbar.config as { items: ToolbarItem[] }).items;
}

function actionOf(item: ToolbarItem): { type: string; mode?: string } {
  return (item.config as { action: { type: string; mode?: string } }).action;
}

describe("defaultCalendarView", () => {
  it("produces a view that satisfies the view schema", () => {
    const result = v.safeParse(viewSchema, defaultCalendarView());
    expect(result.success).toBe(true);
  });

  it("orders blocks as toolbar, month grid, divider, then intervals", () => {
    const keys = defaultCalendarView().blocks.map((block) => block.key);
    expect(keys).toEqual(["toolbar", "month-calendar", "divider", "custom-intervals"]);
  });

  it("mirrors the v2 header controls in order", () => {
    expect(toolbarItems().map((item) => item.key)).toEqual([
      "shelf-selector",
      "button",
      "button",
      "button",
      "button",
      "period-buttons",
      "button",
      "button",
    ]);
  });

  it("seeds the pick-date button in navigate mode", () => {
    const pick = toolbarItems().find((item) => actionOf(item).type === "pick-date");
    expect(actionOf(pick!).mode).toBe("navigate");
  });

  it("seeds the today button in create mode", () => {
    const current = toolbarItems().find((item) => actionOf(item).type === "current");
    expect(actionOf(current!).mode).toBe("create");
  });

  it("seeds period buttons for month, quarter, and year but not week", () => {
    const period = toolbarItems().find((item) => item.key === "period-buttons");
    expect(period!.config).toEqual({ week: false, month: true, quarter: true, year: true });
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/views/default-view.test.ts`
Expected: FAIL — `./default-view` does not exist yet (module-not-found).

- [ ] **Step 5: Create the seed module**

Create `src/views/default-view.ts`. All ids are fixed, valid UUIDs so re-seeding is byte-stable and tests are deterministic.

```ts
import { m } from "@/i18n";

import type { BlockInstanceId, View, ViewId } from "./config";

export const DEFAULT_CALENDAR_VIEW_ID = "b9f3a1c2-0d4e-4f6a-8b1c-2d3e4f5a6b7c" as ViewId;

const TOOLBAR_BLOCK_ID = "c1a2b3d4-1e2f-4a5b-9c6d-7e8f9a0b1c2d" as BlockInstanceId;
const MONTH_CALENDAR_BLOCK_ID = "fa0d1e2b-0b1c-4d4e-8f5a-7b8c9d0e1f2a" as BlockInstanceId;
const DIVIDER_BLOCK_ID = "ab1e2f3c-1c2d-4e5f-9a6b-8c9d0e1f2a3b" as BlockInstanceId;
const CUSTOM_INTERVALS_BLOCK_ID = "bc2f3a4d-2d3e-4f6a-8b7c-9d0e1f2a3b4c" as BlockInstanceId;

const ITEM_SHELF_SELECTOR = "d2b3c4e5-2f3a-4b6c-8d7e-9f0a1b2c3d4e";
const ITEM_PICK_DATE = "e3c4d5f6-3a4b-4c7d-9e8f-0a1b2c3d4e5f";
const ITEM_CURRENT = "f4d5e6a7-4b5c-4d8e-8f9a-1b2c3d4e5f6a";
const ITEM_PREV_YEAR = "a5e6f7b8-5c6d-4e9f-9a0b-2c3d4e5f6a7b";
const ITEM_PREV_MONTH = "b6f7a8c9-6d7e-4f0a-8b1c-3d4e5f6a7b8c";
const ITEM_PERIOD_BUTTONS = "c7a8b9d0-7e8f-4a1b-9c2d-4e5f6a7b8c9d";
const ITEM_NEXT_MONTH = "d8b9c0e1-8f9a-4b2c-8d3e-5f6a7b8c9d0e";
const ITEM_NEXT_YEAR = "e9c0d1f2-9a0b-4c3d-9e4f-6a7b8c9d0e1f";

export function defaultCalendarView(): View {
  return {
    id: DEFAULT_CALENDAR_VIEW_ID,
    name: m.view_default_calendar_name(),
    icon: "calendar-days",
    defaultShelf: null,
    showInRibbon: true,
    blocks: [
      {
        id: TOOLBAR_BLOCK_ID,
        key: "toolbar",
        config: {
          items: [
            { id: ITEM_SHELF_SELECTOR, key: "shelf-selector", config: {} },
            {
              id: ITEM_PICK_DATE,
              key: "button",
              config: { action: { type: "pick-date", mode: "navigate", levels: ["day"] } },
            },
            {
              id: ITEM_CURRENT,
              key: "button",
              config: { action: { type: "current", mode: "create", levels: ["day"] } },
            },
            {
              id: ITEM_PREV_YEAR,
              key: "button",
              config: { action: { type: "navigate-step", direction: "prev", unit: "year", amount: 1 } },
            },
            {
              id: ITEM_PREV_MONTH,
              key: "button",
              config: { action: { type: "navigate-step", direction: "prev", unit: "month", amount: 1 } },
            },
            {
              id: ITEM_PERIOD_BUTTONS,
              key: "period-buttons",
              config: { week: false, month: true, quarter: true, year: true },
            },
            {
              id: ITEM_NEXT_MONTH,
              key: "button",
              config: { action: { type: "navigate-step", direction: "next", unit: "month", amount: 1 } },
            },
            {
              id: ITEM_NEXT_YEAR,
              key: "button",
              config: { action: { type: "navigate-step", direction: "next", unit: "year", amount: 1 } },
            },
          ],
        },
      },
      { id: MONTH_CALENDAR_BLOCK_ID, key: "month-calendar", config: { before: 0, after: 0, hideWeekends: false } },
      { id: DIVIDER_BLOCK_ID, key: "divider", config: {} },
      { id: CUSTOM_INTERVALS_BLOCK_ID, key: "custom-intervals", config: { window: "current-month", hideEmpty: true } },
    ],
  };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/views/default-view.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 7: Quality gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add messages/en.json src/views/default-view.ts src/views/default-view.test.ts
git commit -m "feat(views): default Calendar view seed composition"
```

---

## Task 3: Wire the seed into the views collection

**Files:**

- Modify: `src/views/config.ts:38-45`

- [ ] **Step 1: Wire the seed**

In `src/views/config.ts`, add the import and pass `seed` as the 4th argument to `defineCollection`. The `defaultItem` factory is unchanged.

Add near the other imports:

```ts
import { DEFAULT_CALENDAR_VIEW_ID, defaultCalendarView } from "./default-view";
```

Replace the `viewsCollection` export:

```ts
export const viewsCollection = defineCollection(
  "views",
  viewSchema,
  (id) => ({
    id: id as ViewId,
    name: id,
    icon: "calendar-days",
    defaultShelf: null,
    showInRibbon: false,
    blocks: [],
  }),
  { seed: () => ({ [DEFAULT_CALENDAR_VIEW_ID]: defaultCalendarView() }) },
);
```

> Import direction: `config.ts` imports `default-view.ts` (values); `default-view.ts` imports `config.ts` **type-only** (erased at runtime). No runtime cycle. The `seed` thunk is lazy, so `defaultCalendarView()` is not called during module evaluation regardless.

- [ ] **Step 2: Verify type-check passes**

Run: `npm run check:types`
Expected: PASS. (No dedicated wiring test — per project convention, DI/collection wiring is not unit-tested. The seed _content_ is covered by `default-view.test.ts` and the seed _mechanism_ by `settings-service.test.ts`.)

- [ ] **Step 3: Run the full test suite to confirm no seed leakage**

Run: `npm test`
Expected: PASS. In particular, `src/views/config.test.ts` (which exercises `defaultItem`, not `seed`) and the views service/host/repository suites (which use in-memory repositories via `ViewsRepository.fromParts`, not `SettingsService` + the real `viewsCollection`) remain green. If any test that boots the full container with fresh data now fails because it finds a seeded Calendar view, that test was asserting an empty views collection on a fresh install — update it to expect the seeded Calendar view, since seeding is now the intended fresh-install behavior.

- [ ] **Step 4: Quality gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/config.ts
git commit -m "feat(views): seed default Calendar view on fresh install"
```

---

## Self-Review

**Spec coverage:**

- Generic collection-seed mechanism (absent-key only; present-but-empty respected) → Task 1.
- Seed composition reproducing v2 (8 toolbar items + 4 blocks, fixed ids, navigate/create button modes) → Task 2.
- i18n message `view_default_calendar_name` → Task 2 Step 1-2.
- Wiring into `viewsCollection` → Task 3.
- Out-of-scope items (`defaultCalendarViewId` slice, migration, legacy adapter) → intentionally absent. ✓
- Idempotency behavior is a consequence of the absent-key gate (Task 1) + fixed ids (Task 2); no extra code. ✓

**Placeholder scan:** none — every step shows full code or an exact command.

**Type/name consistency:** `defaultCalendarView` / `DEFAULT_CALENDAR_VIEW_ID` (Task 2) are the exact names imported in Task 3. `CollectionDefinition.seed` / `defineCollection`'s `options.seed` (Task 1) match the `{ seed }` call in Task 3. `parseCollectionValue` keeps its `(definition, raw, logger)` signature. `View` / `ViewId` / `BlockInstanceId` are the existing exports of `src/views/config.ts`.
