# Calendar Decorations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a vault and each shelf own decorations that no journal owns, built from the two journal-independent conditions (`date`, `weekday`) and painted on day cells.

**Architecture:** A narrower `CalendarDecoration` type (same styles, conditions restricted to `date` and `weekday`) is stored in a new settings slice (vault-wide) and on each shelf's config. A `DecorationsStore` resolves a `DecorationOwner` — journal, shelf, or global — to its list, so one settings section and one pair of flows serve all three. The engine's `DecorationBinding` becomes a discriminated union: calendar bindings skip the journal config and note metadata entirely and match only `day` periods. Consumers opt in per surface.

**Tech Stack:** TypeScript, Vue 3 SFCs, valibot schemas, ts-pattern, vitest + @testing-library/vue, WebdriverIO for e2e, paraglide for i18n.

**Spec:** `docs/superpowers/specs/2026-07-31-calendar-decorations-design.md`

## Global Constraints

- Work on the current branch (`v3-ai`). Never create a branch. Never add a `Co-Authored-By` trailer.
- Every task ends green on `npm run test`, `npm run check:types`, `npm run check:lint`.
- Never silence lint with `eslint-disable`. Fix the code.
- `no-non-null-assertion` is on in production code, off in tests. Use `.at(i) ?? fallback`.
- Discriminated-union dispatch uses `match(...).with(...).exhaustive()` from ts-pattern, never `switch`.
- Types are inferred from valibot schemas via `v.InferOutput`, never hand-written twins.
- Tests are colocated as `*.test.ts` next to the implementation. One behavior per test; test names are subject + verb, no "and"/comma lists. Nested `describe()` for scope, never dashes or colons in one label.
- Vue component tests use `@testing-library/vue` + `user-event`. No `@vue/test-utils`, no CSS-class queries, no test-only `data-*` attributes.
- Prefer `readonly #x = inject(...)` field initializers over constructor-body assignment.
- New user-facing strings go in `messages/en.json` following `docs/2026-07-13-ux-text-audit.md` §A (sentence case, en-US). After editing, run `npm run compile:i18n`. **Never stage `src/i18n/paraglide/` — it is generated and git-ignored.**
- Authored icons come from `src/ui/icons.ts`, never bare string literals.
- Zero-argument DI modules stay plain `const xModule: Module = {...}` values.

## Naming decision baked into this plan

`decoration_section_title` today reads **"Calendar decorations"** and titles the _journal's_ section. Three lists cannot share one title — `expandSection("Calendar decorations")` in `e2e/journeys/settings.e2e.ts` would become ambiguous. So:

| List       | Title                |
| ---------- | -------------------- |
| Journal    | Journal decorations  |
| Shelf      | Shelf decorations    |
| Vault-wide | Calendar decorations |

Task 5 rewords the journal title and updates the three e2e call sites.

## File Structure

**Created**

| File                                                        | Responsibility                               |
| ----------------------------------------------------------- | -------------------------------------------- |
| `src/decorations/owner.ts`                                  | `DecorationOwner` union + `describeOwner`    |
| `src/decorations/decorations-store.ts`                      | Owner → decoration list, read and write      |
| `src/decorations/decorations-store.test.ts`                 | Store behavior per owner                     |
| `src/decorations/settings/slice.ts`                         | The vault-wide settings slice                |
| `src/decorations/settings/ui/JournalDecorationsSection.vue` | Journal edit page host (takes `journalName`) |
| `src/decorations/settings/ui/ShelfDecorationsSection.vue`   | Shelf edit page host (takes `shelfName`)     |
| `src/decorations/settings/ui/CalendarDecorationsBlock.vue`  | Dashboard host (no props)                    |

**Modified**

| File                                                                                                                               | Change                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `src/decorations/config.ts`                                                                                                        | `calendarConditionSchema`, `calendarDecorationSchema`    |
| `src/decorations/engine.ts`                                                                                                        | Binding union, calendar evaluation                       |
| `src/decorations/errors.ts`                                                                                                        | Owner-shaped errors                                      |
| `src/decorations/testing.ts`                                                                                                       | `buildCalendarDecoration`                                |
| `src/decorations/index.ts`                                                                                                         | New public exports                                       |
| `src/decorations/module.ts`                                                                                                        | Register the store                                       |
| `src/decorations/use-cell-decorations.ts`                                                                                          | Options object, calendar bindings, precedence            |
| `src/decorations/settings/module.ts`                                                                                               | Register slice, shelf section, dashboard block           |
| `src/decorations/settings/flows/*.flow.ts`                                                                                         | Take a `DecorationOwner`                                 |
| `src/decorations/settings/ui/DecorationsSection.vue`                                                                               | Owner prop, per-owner copy                               |
| `src/decorations/settings/ui/modals.ts`                                                                                            | Modal props                                              |
| `src/decorations/settings/ui/EditDecorationModal.vue`                                                                              | `conditionTypes` prop replaces `writeType`/`journalName` |
| `src/decorations/settings/ui/condition-types.ts`                                                                                   | Calendar condition set                                   |
| `src/shelves/config.ts`                                                                                                            | `decorations` field                                      |
| `src/shelves/repository.ts`                                                                                                        | `create()` seeds `decorations: []`                       |
| `src/notes-calendar/ui/NotesMonthView.vue`, `NotesWeekView.vue`                                                                    | New call shape + opt in                                  |
| `src/code-blocks/nav/ui/NavigationCodeBlock.vue`                                                                                   | New call shape + row-scope opt in                        |
| `src/views/blocks/custom-intervals/ui/CustomIntervalsBlock.vue`, `src/views/toolbar-items/period-buttons/ui/PeriodButtonsItem.vue` | New call shape, no opt in                                |
| `messages/en.json`                                                                                                                 | New and reworded strings                                 |
| `e2e/journeys/settings.e2e.ts`                                                                                                     | Renamed journal section title                            |
| `e2e/journeys/decorations.ts`                                                                                                      | Reserved day + hex for the vault-wide decoration         |
| `e2e/journeys/view.e2e.ts`                                                                                                         | The paint assertion                                      |
| `e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json`                                                                   | Seeded vault-wide decoration                             |

---

### Task 1: Calendar decorations in the engine

**Files:**

- Modify: `src/decorations/config.ts`
- Modify: `src/decorations/engine.ts`
- Modify: `src/decorations/testing.ts`
- Modify: `src/decorations/index.ts`
- Modify: `src/decorations/use-cell-decorations.ts:32-43` (compile fix only)
- Test: `src/decorations/engine.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `calendarDecorationSchema`, `CalendarDecoration`, `CalendarDecorationCondition`, `JournalDecorationBinding`, `CalendarDecorationBinding`, `DecorationBinding` (union), `buildCalendarDecoration(overrides?)`. `DecorationEngine.evaluateRange(periods, bindings)` keeps its signature; `bindings` is now the union.

- [ ] **Step 1: Write the failing tests**

Add to `src/decorations/engine.test.ts` inside the existing `describe("evaluateRange")`:

```ts
it("paints a day cell from a calendar decoration", () => {
  const decoration = buildCalendarDecoration({
    mode: "or",
    conditions: [buildCondition("weekday", { weekdays: [1] })],
    styles: [buildStyle("background")],
  });
  const { c } = buildContainer();
  const engine = c.resolve(DecorationEngine);

  // 2026-05-25 is a Monday.
  const period = DayPeriod.containing(date("2026-05-25"));
  const result = engine.evaluateRange([period], [{ kind: "calendar", decoration }]);

  expect(result.get(cellKey("day", period.anchor.toAnchor()))).toEqual(decoration.styles);
});

it("leaves a week cell untouched for a calendar decoration", () => {
  const decoration = buildCalendarDecoration({
    mode: "or",
    conditions: [buildCondition("weekday", { weekdays: [1] })],
    styles: [buildStyle("background")],
  });
  const { c } = buildContainer();
  const engine = c.resolve(DecorationEngine);

  const period = WeekPeriod.containing(date("2026-05-25"));
  const result = engine.evaluateRange([period], [{ kind: "calendar", decoration }]);

  expect(result.size).toBe(0);
});

it("never reads note metadata for a calendar decoration", () => {
  const decoration = buildCalendarDecoration({
    mode: "or",
    conditions: [buildCondition("weekday", { weekdays: [1] })],
    styles: [buildStyle("background")],
  });
  const { c, metadata } = buildContainer();
  const spy = vi.spyOn(metadata, "get");
  const engine = c.resolve(DecorationEngine);

  engine.evaluateRange([DayPeriod.containing(date("2026-05-25"))], [{ kind: "calendar", decoration }]);

  expect(spy).not.toHaveBeenCalled();
});
```

Add `vi` to the vitest import and `cellKey` to the `./engine` import. `buildCalendarDecoration` comes from `./testing`.

Then mechanically update the 7 existing journal bindings in this file from `{ journalName: "x", decoration }` to `{ kind: "journal", journalName: "x", decoration }`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/decorations/engine.test.ts`
Expected: FAIL — `buildCalendarDecoration` is not exported, and the object literals do not match `DecorationBinding`.

- [ ] **Step 3: Add the schema**

In `src/decorations/config.ts`, after `decorationConditionSchema` (line 196):

```ts
export const calendarConditionSchema = v.union([dateConditionSchema, weekdayCondition]);
export type CalendarDecorationCondition = v.InferOutput<typeof calendarConditionSchema>;

export const calendarDecorationSchema = v.object({
  mode: v.union([v.literal("and"), v.literal("or")]),
  conditions: v.array(calendarConditionSchema),
  styles: v.array(decorationStyleSchema),
});
export type CalendarDecoration = v.InferOutput<typeof calendarDecorationSchema>;
```

- [ ] **Step 4: Make the binding a union**

In `src/decorations/engine.ts`, replace the `DecorationBinding` interface (lines 24-27):

```ts
export interface JournalDecorationBinding {
  readonly kind: "journal";
  readonly journalName: string;
  readonly decoration: JournalDecoration;
}

export interface CalendarDecorationBinding {
  readonly kind: "calendar";
  readonly decoration: CalendarDecoration;
}

export type DecorationBinding = JournalDecorationBinding | CalendarDecorationBinding;
```

Import `CalendarDecoration` and `CalendarDecorationCondition` from `./config`.

- [ ] **Step 5: Evaluate calendar bindings**

In the same file, add alongside `#matches`:

```ts
#matchesCalendar(decoration: CalendarDecoration, period: Period): boolean {
  const { mode, conditions } = decoration;
  if (conditions.length === 0) return false;
  const test = (c: CalendarDecorationCondition): boolean =>
    match(c)
      .with({ type: "date" }, (x) => checkDate(x, period))
      .with({ type: "weekday" }, (x) => checkWeekday(x, period))
      .exhaustive();
  return mode === "or" ? conditions.some(test) : conditions.every(test);
}
```

Rewrite `evaluateRange`'s two loops. The config pre-pass skips calendar bindings:

```ts
const configs = new Map<string, JournalConfig>();
for (const binding of decorations) {
  if (binding.kind !== "journal") continue;
  if (configs.has(binding.journalName)) continue;
  const opt = this.#journals.get(binding.journalName);
  if (opt.isSome()) configs.set(binding.journalName, opt.value);
}
```

and the main loop dispatches on kind, sharing one push helper:

```ts
const push = (period: Period, styles: readonly JournalDecorationStyle[]): void => {
  const key = cellKey(period.kind, period.anchor.toAnchor());
  let bucket = result.get(key);
  if (!bucket) {
    bucket = [];
    result.set(key, bucket);
  }
  bucket.push(...styles);
};

for (const binding of decorations) {
  if (binding.kind === "calendar") {
    for (const period of periods) {
      // Journal-free decorations paint calendar days only. Custom-interval rows are also
      // "day"-kind periods, so surfaces that render them simply do not opt in.
      if (period.kind !== "day") continue;
      if (!this.#matchesCalendar(binding.decoration, period)) continue;
      push(period, binding.decoration.styles);
    }
    continue;
  }
  const config = configs.get(binding.journalName);
  if (!config) continue;
  for (const period of periods) {
    if (!periodMatchesWrite(period.kind, config.write.type)) continue;
    const anchorString = period.anchor.toAnchor();
    if (!this.#matches(binding.decoration, period, config, () => metadataFor(binding.journalName, anchorString)))
      continue;
    push(period, binding.decoration.styles);
  }
}
```

- [ ] **Step 6: Add the test builder**

In `src/decorations/testing.ts`:

```ts
export function buildCalendarDecoration(overrides: Partial<CalendarDecoration> = {}): CalendarDecoration {
  return { mode: "and", conditions: [], styles: [], ...overrides };
}
```

Import `CalendarDecoration` as a type from `./config`.

- [ ] **Step 7: Fix the one production call site**

In `src/decorations/use-cell-decorations.ts:38`, change the binding literal to `{ kind: "journal" as const, journalName: name, decoration }`, and narrow the `filter` parameter type in the signature (line 19) from `DecorationBinding` to `JournalDecorationBinding` so the `.vue` call sites that read `binding.journalName` keep compiling unchanged.

- [ ] **Step 8: Export the new surface**

In `src/decorations/index.ts`, add `calendarDecorationSchema`, `calendarConditionSchema`, `type CalendarDecoration`, `type CalendarDecorationCondition` to the `./config` export block, and `type CalendarDecorationBinding`, `type JournalDecorationBinding` to the `./engine` export block.

- [ ] **Step 9: Run the checks**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/decorations
git commit -m "feat(decorations): evaluate journal-free calendar decorations"
```

---

### Task 2: Storage and the owner store

**Files:**

- Create: `src/decorations/owner.ts`
- Create: `src/decorations/settings/slice.ts`
- Create: `src/decorations/decorations-store.ts`
- Create: `src/decorations/decorations-store.test.ts`
- Modify: `src/shelves/config.ts`
- Modify: `src/shelves/repository.ts:56`
- Modify: `src/decorations/module.ts`, `src/decorations/settings/module.ts`, `src/decorations/index.ts`

**Interfaces:**

- Consumes: `calendarDecorationSchema`, `CalendarDecoration` (Task 1).
- Produces:
  - `type DecorationOwner = { kind: "journal"; journalName: string } | { kind: "shelf"; shelfName: string } | { kind: "global" }`
  - `type CalendarDecorationOwner = Exclude<DecorationOwner, { kind: "journal" }>`
  - `describeOwner(owner: DecorationOwner): string`
  - `decorationsSlice` (key `"decorations"`, state `{ decorations: CalendarDecoration[] }`)
  - `class DecorationsStore` with `list(owner): readonly JournalDecoration[]`, `calendarList(owner: CalendarDecorationOwner): readonly CalendarDecoration[]`, `exists(owner): boolean`, `save(owner, next: readonly JournalDecoration[]): void`

- [ ] **Step 1: Write the failing tests**

Create `src/decorations/decorations-store.test.ts`:

```ts
import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";
import { reactive } from "vue";

import { Container } from "@/infrastructure/di";
import { JournalsRepository, journalDefaultsFor, type JournalConfig, type JournalsEvents } from "@/journals";
import { SettingsService } from "@/settings";
import { createSettingsService } from "@/settings/testing";
import { ShelvesRepository, type ShelvesEvents } from "@/shelves";
import type { ShelfConfig } from "@/shelves/config";

import { DecorationsStore } from "./decorations-store";
import { decorationsSlice } from "./settings/slice";
import { buildCalendarDecoration, buildCondition, buildDecoration, buildStyle } from "./testing";

function build(options: { journals?: Record<string, JournalConfig>; shelves?: Record<string, ShelfConfig> } = {}) {
  const { container, service } = createSettingsService({ slices: [decorationsSlice] });
  const journalStorage = reactive<Record<string, JournalConfig>>({ ...options.journals });
  const shelfStorage = reactive<Record<string, ShelfConfig>>({ ...options.shelves });
  container.register(SettingsService).useValue(service);
  container
    .register(JournalsRepository)
    .useValue(JournalsRepository.fromParts(journalStorage, createNanoEvents<JournalsEvents>()));
  container
    .register(ShelvesRepository)
    .useValue(ShelvesRepository.fromParts(shelfStorage, createNanoEvents<ShelvesEvents>()));
  container.register(DecorationsStore).useClass(DecorationsStore);
  return { store: container.resolve(DecorationsStore), journalStorage, shelfStorage, service };
}

const calendarDecoration = buildCalendarDecoration({
  mode: "and",
  conditions: [buildCondition("weekday", { weekdays: [6] })],
  styles: [buildStyle("background")],
});

describe("DecorationsStore", () => {
  describe("list", () => {
    it("returns a journal's own decorations", () => {
      const journal = { ...journalDefaultsFor({ type: "day" }, "daily"), decorations: [buildDecoration()] };
      const { store } = build({ journals: { daily: journal } });
      expect(store.list({ kind: "journal", journalName: "daily" })).toEqual(journal.decorations);
    });

    it("returns an empty list for a journal that no longer exists", () => {
      const { store } = build();
      expect(store.list({ kind: "journal", journalName: "gone" })).toEqual([]);
    });

    it("returns an empty list for a shelf saved without a decorations field", () => {
      const { store } = build({ shelves: { work: { name: "work", journals: [] } as ShelfConfig } });
      expect(store.list({ kind: "shelf", shelfName: "work" })).toEqual([]);
    });
  });

  describe("save", () => {
    it("writes a shelf's decorations back to the shelf", () => {
      const { store, shelfStorage } = build({ shelves: { work: { name: "work", journals: [], decorations: [] } } });
      store.save({ kind: "shelf", shelfName: "work" }, [calendarDecoration]);
      expect(shelfStorage.work.decorations).toEqual([calendarDecoration]);
    });

    it("writes global decorations back to the settings slice", () => {
      const { store, service } = build();
      store.save({ kind: "global" }, [calendarDecoration]);
      expect(service.getSlice(decorationsSlice).state.decorations).toEqual([calendarDecoration]);
    });
  });

  describe("exists", () => {
    it("reports a missing shelf as absent", () => {
      const { store } = build();
      expect(store.exists({ kind: "shelf", shelfName: "gone" })).toBe(false);
    });

    it("always reports the global owner as present", () => {
      const { store } = build();
      expect(store.exists({ kind: "global" })).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/decorations/decorations-store.test.ts`
Expected: FAIL — `./decorations-store` and `./settings/slice` do not exist.

- [ ] **Step 3: Add the owner type**

Create `src/decorations/owner.ts`:

```ts
import { match } from "ts-pattern";

export type DecorationOwner =
  | { readonly kind: "journal"; readonly journalName: string }
  | { readonly kind: "shelf"; readonly shelfName: string }
  | { readonly kind: "global" };

export type CalendarDecorationOwner = Exclude<DecorationOwner, { kind: "journal" }>;

export function describeOwner(owner: DecorationOwner): string {
  return match(owner)
    .with({ kind: "journal" }, ({ journalName }) => `journal=${journalName}`)
    .with({ kind: "shelf" }, ({ shelfName }) => `shelf=${shelfName}`)
    .with({ kind: "global" }, () => "global")
    .exhaustive();
}
```

- [ ] **Step 4: Add the slice**

Create `src/decorations/settings/slice.ts`:

```ts
import * as v from "valibot";

import { defineSlice } from "@/settings";

import { calendarDecorationSchema } from "../config";

export const decorationsSliceSchema = v.object({ decorations: v.array(calendarDecorationSchema) });

export type DecorationsSliceState = v.InferOutput<typeof decorationsSliceSchema>;

export const decorationsSlice = defineSlice<"decorations", typeof decorationsSliceSchema>(
  "decorations",
  decorationsSliceSchema,
  { decorations: [] },
);
```

Register it in `src/decorations/settings/module.ts`:

```ts
c.register(SliceDefinitionToken).useValue(decorationsSlice);
```

importing `SliceDefinitionToken` from `@/settings`.

- [ ] **Step 5: Add the shelf field**

In `src/shelves/config.ts`:

```ts
import { calendarDecorationSchema } from "@/decorations/config";

const shelfConfigSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1)),
  journals: v.array(v.string()),
  // Optional with a default so a shelf saved before calendar decorations existed parses
  // instead of failing and resetting the whole shelf to defaults.
  decorations: v.optional(v.array(calendarDecorationSchema), []),
});
```

and seed it in `defineCollection`'s default item: `(id) => ({ name: id, journals: [], decorations: [] })`.

> Import from `@/decorations/config`, **not** the `@/decorations` barrel: the barrel pulls the engine, which imports `@/journals`, and `@/decorations` will import `@/shelves` for the store — the direct submodule path keeps that out of a cycle.

In `src/shelves/repository.ts:56`, the hand-built entity in `create()` must match:

```ts
const entity: ShelfConfig = { name, journals: [], decorations: [] };
```

- [ ] **Step 6: Write the store**

Create `src/decorations/decorations-store.ts`:

```ts
import { match } from "ts-pattern";

import { inject } from "@/infrastructure/di";
import { JournalsRepository } from "@/journals/repository";
import { SettingsService } from "@/settings";
import { ShelvesRepository } from "@/shelves/repository";

import { decorationsSlice } from "./settings/slice";

import type { CalendarDecoration, JournalDecoration } from "./config";
import type { CalendarDecorationOwner, DecorationOwner } from "./owner";

export class DecorationsStore {
  readonly #journals = inject(JournalsRepository);
  readonly #shelves = inject(ShelvesRepository);
  readonly #slice = inject(SettingsService).getSlice(decorationsSlice);

  calendarList(owner: CalendarDecorationOwner): readonly CalendarDecoration[] {
    return match(owner)
      .with({ kind: "shelf" }, ({ shelfName }) =>
        this.#shelves.get(shelfName).match<readonly CalendarDecoration[]>({
          some: (shelf) => shelf.decorations,
          none: () => [],
        }),
      )
      .with({ kind: "global" }, () => this.#slice.state.decorations)
      .exhaustive();
  }

  // The editor works on the wider journal shape; a calendar owner's list is a subset of it,
  // so widening here is safe and keeps one section and one flow serving every owner.
  list(owner: DecorationOwner): readonly JournalDecoration[] {
    return match(owner)
      .with({ kind: "journal" }, ({ journalName }) =>
        this.#journals.get(journalName).match<readonly JournalDecoration[]>({
          some: (config) => config.decorations,
          none: () => [],
        }),
      )
      .otherwise((calendarOwner) => this.calendarList(calendarOwner));
  }

  exists(owner: DecorationOwner): boolean {
    return match(owner)
      .with({ kind: "journal" }, ({ journalName }) => this.#journals.get(journalName).isSome())
      .with({ kind: "shelf" }, ({ shelfName }) => this.#shelves.get(shelfName).isSome())
      .with({ kind: "global" }, () => true)
      .exhaustive();
  }

  save(owner: DecorationOwner, next: readonly JournalDecoration[]): void {
    match(owner)
      .with({ kind: "journal" }, ({ journalName }) => {
        this.#journals.update(journalName, { decorations: [...next] });
      })
      .with({ kind: "shelf" }, ({ shelfName }) => {
        this.#shelves.update(shelfName, { decorations: next as CalendarDecoration[] });
      })
      .with({ kind: "global" }, () => {
        this.#slice.state = { decorations: next as CalendarDecoration[] };
      })
      .exhaustive();
  }
}
```

The two `as CalendarDecoration[]` casts are downcasts to a subtype, which TypeScript accepts. Keep them and keep the comment above `list` explaining why: the editor's condition set is what guarantees a calendar owner only ever receives `date`/`weekday` conditions, and the slice's own schema rejects anything else on load.

- [ ] **Step 7: Register the store**

In `src/decorations/module.ts`, add `c.register(DecorationsStore).useClass(DecorationsStore);` (default lifetime — do not call `.lifetime(...)`).

Export `DecorationsStore`, `decorationsSlice`, `type DecorationOwner`, `type CalendarDecorationOwner`, `describeOwner` from `src/decorations/index.ts`.

- [ ] **Step 8: Run the checks**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: PASS. `src/shelves/repository.test.ts` and any shelf fixture that builds a `ShelfConfig` literal may need `decorations: []` added — fix those the same way.

- [ ] **Step 9: Commit**

```bash
git add src/decorations src/shelves
git commit -m "feat(decorations): store calendar decorations per vault and shelf"
```

---

### Task 3: Feed calendar decorations to the surfaces

**Files:**

- Modify: `src/decorations/use-cell-decorations.ts`
- Modify: `src/notes-calendar/ui/NotesMonthView.vue:88-93`, `src/notes-calendar/ui/NotesWeekView.vue:61-66`
- Modify: `src/code-blocks/nav/ui/NavigationCodeBlock.vue:109-118`
- Modify: `src/views/blocks/custom-intervals/ui/CustomIntervalsBlock.vue:76-83`, `src/views/toolbar-items/period-buttons/ui/PeriodButtonsItem.vue:66-69`
- Test: `src/decorations/use-cell-decorations.test.ts`

**Interfaces:**

- Consumes: `DecorationsStore` (Task 2), `DecorationBinding` union (Task 1).
- Produces:

```ts
export interface CellDecorationsOptions {
  periods: MaybeRefOrGetter<readonly Period[]>;
  journalNames: MaybeRefOrGetter<readonly string[]>;
  scope?: CellDecorationScope;
  filter?: (binding: JournalDecorationBinding) => boolean;
  // Presence opts the surface into journal-free decorations. `shelf` is the shelf in scope,
  // or null for "all journals", where only the vault-wide list applies.
  calendarDecorations?: { shelf: MaybeRefOrGetter<string | null> };
}
export function useCellDecorations(options: CellDecorationsOptions): ReadonlyMap<string, CellStyleRef>;
```

- [ ] **Step 1: Write the failing tests**

In `src/decorations/use-cell-decorations.test.ts`, register `DecorationsStore` (and the settings slice + a `ShelvesRepository`) in `buildHarness` the same way `decorations-store.test.ts` does, then add:

```ts
it("paints a day cell from a vault-wide decoration", async () => {
  const decoration = buildCalendarDecoration({
    mode: "or",
    conditions: [buildCondition("weekday", { weekdays: [1] })],
    styles: [buildStyle("background")],
  });
  const { c, store } = buildHarness();
  store.save({ kind: "global" }, [decoration]);
  const period = DayPeriod.containing(date("2026-05-25"));

  const cells = mountCells(c, [period], [], { shelf: null });
  await nextTick();

  expect(cells.get(key(period))?.value).toEqual(decoration.styles);
});

it("ignores a shelf's decorations while another shelf is in scope", async () => {
  const decoration = buildCalendarDecoration({
    mode: "or",
    conditions: [buildCondition("weekday", { weekdays: [1] })],
    styles: [buildStyle("background")],
  });
  const { c, store } = buildHarness();
  store.save({ kind: "shelf", shelfName: "work" }, [decoration]);
  const period = DayPeriod.containing(date("2026-05-25"));

  const cells = mountCells(c, [period], [], { shelf: "personal" });
  await nextTick();

  expect(cells.get(key(period))?.value).toEqual([]);
});

it("orders a journal's styles ahead of a vault-wide decoration's", async () => {
  const journalStyle = buildStyle("background", { color: { type: "custom", color: "#111111" } });
  const globalStyle = buildStyle("background", { color: { type: "custom", color: "#222222" } });
  const journalDecoration = buildDecoration({
    mode: "or",
    conditions: [buildCondition("weekday", { weekdays: [1] })],
    styles: [journalStyle],
  });
  const { c, store } = buildHarness([journalDecoration]);
  store.save({ kind: "global" }, [
    buildCalendarDecoration({
      mode: "or",
      conditions: [buildCondition("weekday", { weekdays: [1] })],
      styles: [globalStyle],
    }),
  ]);
  const period = DayPeriod.containing(date("2026-05-25"));

  const cells = mountCells(c, [period], ["daily"], { shelf: null });
  await nextTick();

  // backgroundFrom() takes the first background in the bucket, so order is the precedence rule.
  expect(cells.get(key(period))?.value.at(0)).toEqual(journalStyle);
});

it("orders a shelf's styles ahead of a vault-wide decoration's", async () => {
  const shelfStyle = buildStyle("background", { color: { type: "custom", color: "#333333" } });
  const globalStyle = buildStyle("background", { color: { type: "custom", color: "#444444" } });
  const weekdayCondition = buildCondition("weekday", { weekdays: [1] });
  const { c, store } = buildHarness();
  store.save({ kind: "shelf", shelfName: "work" }, [
    buildCalendarDecoration({ mode: "or", conditions: [weekdayCondition], styles: [shelfStyle] }),
  ]);
  store.save({ kind: "global" }, [
    buildCalendarDecoration({ mode: "or", conditions: [weekdayCondition], styles: [globalStyle] }),
  ]);
  const period = DayPeriod.containing(date("2026-05-25"));

  const cells = mountCells(c, [period], [], { shelf: "work" });
  await nextTick();

  expect(cells.get(key(period))?.value.at(0)).toEqual(shelfStyle);
});
```

`buildHarness` must also seed a shelf named `work` in the `ShelvesRepository` storage it registers, so `store.save({ kind: "shelf", ... })` has something to write to.

`mountCells` is a new thin wrapper over this file's existing `mount(container, setup)` helper (line 92), returning the captured map directly:

```ts
function mountCells(
  container: Container,
  periods: readonly Period[],
  journalNames: readonly string[],
  calendarDecorations?: { shelf: string | null },
): ReadonlyMap<string, CellStyleRef> {
  const { captured } = mount(container, () =>
    useCellDecorations({
      periods: () => periods,
      journalNames: () => journalNames,
      calendarDecorations: calendarDecorations && { shelf: () => calendarDecorations.shelf },
    }),
  );
  const cells = captured.value;
  if (!cells) throw new Error("cell map was not provided");
  return cells;
}
```

`buildHarness` returns `{ c, notesEmitter, fakeMetadata }` today; extend it to register `SettingsService` (`createSettingsService({ slices: [decorationsSlice] })`), a `ShelvesRepository` over a reactive record, and `DecorationsStore`, and to return `store` alongside the rest. Every existing call in this file keeps working.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/decorations/use-cell-decorations.test.ts`
Expected: FAIL — the composable takes positional parameters and knows nothing about a store.

- [ ] **Step 3: Move the composable to an options object**

In `src/decorations/use-cell-decorations.ts`, replace the signature and read options through local aliases:

```ts
export function useCellDecorations(options: CellDecorationsOptions): ReadonlyMap<string, CellStyleRef> {
  const scope = options.scope ?? defaultCellDecorationScope;
  const filter = options.filter ?? ((): boolean => true);
  const store = useService(DecorationsStore);
  ...
}
```

Every existing `toValue(periodsRef)` becomes `toValue(options.periods)` and `toValue(journalNamesRef)` becomes `toValue(options.journalNames)`.

- [ ] **Step 4: Gather calendar bindings**

Replace `gatherDecorations`:

```ts
function gatherDecorations(): readonly DecorationBinding[] {
  const out: DecorationBinding[] = [];
  // Journal, then shelf, then global: backgroundFrom()/textColorFrom() take the first match,
  // so gathering order is what makes the most specific owner win.
  for (const name of toValue(options.journalNames)) {
    const opt = journals.get(name);
    if (opt.isNone()) continue;
    for (const decoration of opt.value.decorations) {
      const binding = { kind: "journal", journalName: name, decoration } as const;
      if (filter(binding)) out.push(binding);
    }
  }
  const calendar = options.calendarDecorations;
  if (calendar) {
    const shelfName = toValue(calendar.shelf);
    if (shelfName !== null) {
      for (const decoration of store.calendarList({ kind: "shelf", shelfName })) {
        out.push({ kind: "calendar", decoration });
      }
    }
    for (const decoration of store.calendarList({ kind: "global" })) {
      out.push({ kind: "calendar", decoration });
    }
  }
  return out;
}
```

In `reseed`, extend the existing dependency-touching block so a mutation of either calendar list re-runs the effect:

```ts
const calendar = options.calendarDecorations;
if (calendar) {
  const shelfName = toValue(calendar.shelf);
  const lists =
    shelfName === null
      ? [store.calendarList({ kind: "global" })]
      : [store.calendarList({ kind: "shelf", shelfName }), store.calendarList({ kind: "global" })];
  for (const list of lists) {
    void list.length;
    for (const d of list) void d;
  }
}
```

- [ ] **Step 5: Update the five call sites**

`src/notes-calendar/ui/NotesMonthView.vue`:

```ts
useCellDecorations({
  periods: () => visiblePeriods.value,
  journalNames: () => scope.all.value,
  filter: (binding) =>
    scope.custom.value.includes(binding.journalName) ? hasOffsetCondition(binding.decoration) : true,
  calendarDecorations: { shelf: () => props.shelf },
});
```

`src/notes-calendar/ui/NotesWeekView.vue`: identical shape with `periods: () => allPeriods.value`.

`src/code-blocks/nav/ui/NavigationCodeBlock.vue` — the row scope opts in, the block scope does not:

```ts
// Journal-free decorations belong to the per-row scope: every row is a different date, while
// the whole-block scope decorates the block from the current journal's own rules. Only day rows
// are affected — a weekly journal's nav block renders week rows and shows none of these.
const decorationShelf = computed<string | null>(() => {
  const currentJournal = journal.value;
  if (!currentJournal) return null;
  return shelves
    .find()
    .filter((shelf) => shelf.journals.includes(currentJournal.name))
    .first()
    .match<string | null>({ some: (shelf) => shelf.name, none: () => null });
});

useCellDecorations({
  periods: () => periods.value,
  journalNames: () => blockJournalNames.value,
  scope: navBlockDecorationScope,
});
useCellDecorations({
  periods: () => periods.value,
  journalNames: () => rowJournalNames.value,
  scope: navRowDecorationScope,
  calendarDecorations: { shelf: () => decorationShelf.value },
});
```

`src/views/blocks/custom-intervals/ui/CustomIntervalsBlock.vue` and `src/views/toolbar-items/period-buttons/ui/PeriodButtonsItem.vue`: convert to the options object with no `calendarDecorations` key, keeping their existing `filter` and comments verbatim.

- [ ] **Step 6: Run the checks**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/decorations src/notes-calendar src/code-blocks src/views
git commit -m "feat(decorations): render calendar decorations on day cells and nav rows"
```

---

### Task 4: Flows take a decoration owner

**Files:**

- Modify: `src/decorations/errors.ts`
- Modify: `src/decorations/settings/flows/edit-decoration.flow.ts`, `delete-decoration.flow.ts`
- Modify: `src/decorations/settings/ui/modals.ts`, `EditDecorationModal.vue`, `DeleteDecorationModal.vue`, `condition-types.ts`
- Test: `src/decorations/settings/flows/edit-decoration.flow.test.ts`, `delete-decoration.flow.test.ts`, `src/decorations/settings/ui/EditDecorationModal.test.ts`

**Interfaces:**

- Consumes: `DecorationsStore`, `DecorationOwner`, `describeOwner` (Task 2).
- Produces:
  - `EditDecorationFlow.execute({ owner: DecorationOwner; index?: number })` → `{ decoration: JournalDecoration; index: number }`
  - `DeleteDecorationFlow.execute({ owner: DecorationOwner; index: number })` → `{ deleted: JournalDecoration }`
  - `UnknownDecorationOwnerError(owner)` and `UnknownDecorationError(owner, index)`
  - `editDecorationModal` props `{ decoration?: JournalDecoration; conditionTypes: readonly JournalDecorationCondition["type"][] }`
  - `deleteDecorationModal` props `{ owner: DecorationOwner }`

- [ ] **Step 1: Write the failing tests**

In `delete-decoration.flow.test.ts`, replace the "returns UnknownJournalError when the journal does not exist" test and add shelf coverage:

```ts
it("reports an unknown owner when the journal is gone", async () => {
  const { flows } = build();
  const result = await flows.invoke(DeleteDecorationFlow, {
    owner: { kind: "journal", journalName: "missing" },
    index: 0,
  });
  expect(result.kind === "err" && result.error).toBeInstanceOf(DecorationLifecycleFlowError);
  expect(result.kind === "err" && (result.error as DecorationLifecycleFlowError).cause).toBeInstanceOf(
    UnknownDecorationOwnerError,
  );
});

it("removes a global decoration from the vault-wide list", async () => {
  const { flows, store } = build();
  store.save({ kind: "global" }, [sampleCalendarDecoration]);
  modals.resolveNext({ confirmed: true });

  await flows.invoke(DeleteDecorationFlow, { owner: { kind: "global" }, index: 0 });

  expect(store.list({ kind: "global" })).toEqual([]);
});
```

Update `build()` in both flow test files to register `SettingsService` (via `createSettingsService({ slices: [decorationsSlice] })`), `ShelvesRepository`, and `DecorationsStore`, and to return the store. Rewrite every remaining `{ journalName: "daily", index }` invocation as `{ owner: { kind: "journal", journalName: "daily" }, index }`.

In `src/decorations/settings/ui/EditDecorationModal.test.ts`, change `mountModal`'s options from `writeType` to `conditionTypes: readonly JournalDecorationCondition["type"][]` (its `props` become `{ conditionTypes, decoration }`), update the existing calls to pass `conditionTypeOptions.day` / `conditionTypeOptions.custom` / `conditionTypeOptions.week`, and add to `describe("add-condition options")`:

```ts
it("offers only date and weekday for a calendar owner", async () => {
  mountModal({ conditionTypes: CALENDAR_CONDITION_TYPES });
  await userEvent.click(screen.getByText(m.decoration_modal_add_condition()));
  expect(screen.getByText(m.decoration_condition_type_label({ type: "date" }))).toBeTruthy();
  expect(screen.getByText(m.decoration_condition_type_label({ type: "weekday" }))).toBeTruthy();
  expect(screen.queryByText(m.decoration_condition_type_label({ type: "has-note" }))).toBeNull();
});
```

In `edit-decoration.flow.test.ts`, add:

```ts
it("appends a new decoration to a shelf's list", async () => {
  const { flows, store } = build({ shelves: { work: { name: "work", journals: [], decorations: [] } } });
  modals.resolveNext({ decoration: sampleCalendarDecoration });

  const result = await flows.invoke(EditDecorationFlow, { owner: { kind: "shelf", shelfName: "work" } });

  expect(result.kind === "ok" && result.value.index).toBe(0);
  expect(store.list({ kind: "shelf", shelfName: "work" })).toEqual([sampleCalendarDecoration]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/decorations/settings/flows`
Expected: FAIL — the flows take `journalName`.

- [ ] **Step 3: Reshape the errors**

In `src/decorations/errors.ts`:

```ts
import { FlowError } from "@/infrastructure/flows";

import { describeOwner, type DecorationOwner } from "./owner";

export class UnknownDecorationError extends Error {
  readonly kind = "unknown-decoration" as const;
  constructor(
    public readonly owner: DecorationOwner,
    public readonly index: number,
  ) {
    super(`Decoration not found: ${describeOwner(owner)} index=${index}`);
    this.name = "UnknownDecorationError";
  }
}

export class UnknownDecorationOwnerError extends Error {
  readonly kind = "unknown-decoration-owner" as const;
  constructor(public readonly owner: DecorationOwner) {
    super(`Decoration owner not found: ${describeOwner(owner)}`);
    this.name = "UnknownDecorationOwnerError";
  }
}

export type DecorationLifecycleError = UnknownDecorationError | UnknownDecorationOwnerError;
```

`DecorationLifecycleFlowError` and `toDecorationFlowError` stay as they are. Export `UnknownDecorationOwnerError` from `src/decorations/index.ts`.

- [ ] **Step 4: Rewrite the edit flow**

`src/decorations/settings/flows/edit-decoration.flow.ts`:

```ts
export interface EditDecorationParameters {
  owner: DecorationOwner;
  index?: number;
}

export class EditDecorationFlow implements Flow<EditDecorationParameters, EditDecorationResult, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #store = inject(DecorationsStore);
  readonly #journals = inject(JournalsRepository);

  execute(parameters: EditDecorationParameters): AsyncResult<EditDecorationResult, FlowError> {
    const { owner } = parameters;
    if (!this.#store.exists(owner)) {
      return AsyncResult.err(toDecorationFlowError(new UnknownDecorationOwnerError(owner)));
    }
    const decorations = this.#store.list(owner);
    const index = parameters.index;
    const isEdit = index !== undefined;
    if (isEdit && (index < 0 || index >= decorations.length)) {
      return AsyncResult.err(toDecorationFlowError(new UnknownDecorationError(owner, index)));
    }
    const existing = isEdit ? decorations[index] : undefined;
    return attempt.in(this, async function* (this: EditDecorationFlow) {
      const submitted = yield* this.#modals
        .open(editDecorationModal, { decoration: existing, conditionTypes: this.#conditionTypes(owner) })
        .mapErr(() => new UserAborted("edit-decoration-modal"));
      const next = isEdit
        ? decorations.map((d, i) => (i === index ? submitted.decoration : d))
        : [...decorations, submitted.decoration];
      this.#store.save(owner, next);
      return { decoration: submitted.decoration, index: isEdit ? index : decorations.length };
    });
  }

  #conditionTypes(owner: DecorationOwner): readonly JournalDecorationCondition["type"][] {
    if (owner.kind !== "journal") return CALENDAR_CONDITION_TYPES;
    return this.#journals.get(owner.journalName).match({
      some: (config) => conditionTypeOptions[config.write.type],
      none: () => CALENDAR_CONDITION_TYPES,
    });
  }
}
```

Import `JournalsRepository` from `@/journals/repository` (direct path), and `CALENDAR_CONDITION_TYPES` / `conditionTypeOptions` from `../ui/condition-types` — Step 7 below adds the constant, so do that step first if the import does not resolve.

- [ ] **Step 5: Rewrite the delete flow**

```ts
export class DeleteDecorationFlow implements Flow<
  { owner: DecorationOwner; index: number },
  { deleted: JournalDecoration },
  FlowError
> {
  readonly #modals = inject(ModalService);
  readonly #store = inject(DecorationsStore);

  execute(parameters: {
    owner: DecorationOwner;
    index: number;
  }): AsyncResult<{ deleted: JournalDecoration }, FlowError> {
    const { owner, index } = parameters;
    if (!this.#store.exists(owner)) {
      return AsyncResult.err(toDecorationFlowError(new UnknownDecorationOwnerError(owner)));
    }
    const decorations = this.#store.list(owner);
    if (index < 0 || index >= decorations.length) {
      return AsyncResult.err(toDecorationFlowError(new UnknownDecorationError(owner, index)));
    }
    const deleted = decorations[index];
    return attempt.in(this, async function* (this: DeleteDecorationFlow) {
      yield* this.#modals
        .open(deleteDecorationModal, { owner })
        .mapErr(() => new UserAborted("delete-decoration-modal"));
      this.#store.save(
        owner,
        decorations.filter((_, i) => i !== index),
      );
      return { deleted };
    });
  }
}
```

- [ ] **Step 6: Update the modal definitions**

`src/decorations/settings/ui/modals.ts`:

```ts
export interface EditDecorationModalProps {
  decoration?: JournalDecoration;
  conditionTypes: readonly JournalDecorationCondition["type"][];
}

export const editDecorationModal = defineModal<{ decoration: JournalDecoration }>()({
  component: EditDecorationModal,
  title: ({ decoration }: EditDecorationModalProps) => (decoration ? m.decoration_edit() : m.decoration_add()),
  width: 800,
});

export const deleteDecorationModal = defineModal<{ confirmed: true }>()({
  component: DeleteDecorationModal,
  title: (_: { owner: DecorationOwner }) => m.decoration_delete(),
});
```

Change `DeleteDecorationModal.vue`'s `defineProps<{ journalName: string }>()` to `defineProps<{ owner: DecorationOwner }>()` (the prop is not read in its template today, and still is not).

- [ ] **Step 7: Move the allowed condition set into the modal's props**

In `src/decorations/settings/ui/condition-types.ts`, keep `conditionTypeOptions` as it is and add:

```ts
export const CALENDAR_CONDITION_TYPES: readonly JournalDecorationCondition["type"][] = ["date", "weekday"];
```

In `EditDecorationModal.vue`, replace the props block:

```ts
const props = defineProps<{
  decoration?: JournalDecoration;
  conditionTypes: readonly JournalDecorationCondition["type"][];
}>();
```

and in `addConditionOptions` replace `const allowed = conditionTypeOptions[props.writeType];` with `const allowed = props.conditionTypes;`. Drop the now-unused `conditionTypeOptions` and `JournalConfig` imports from this file.

- [ ] **Step 8: Run the checks**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/decorations
git commit -m "refactor(decorations): key decoration flows by owner instead of journal"
```

---

### Task 5: Settings UI for all three owners

**Files:**

- Modify: `src/decorations/settings/ui/DecorationsSection.vue`
- Create: `src/decorations/settings/ui/JournalDecorationsSection.vue`, `ShelfDecorationsSection.vue`, `CalendarDecorationsBlock.vue`
- Modify: `src/decorations/settings/module.ts`
- Modify: `messages/en.json`
- Test: `src/decorations/settings/ui/DecorationsSection.test.ts`

**Interfaces:**

- Consumes: `DecorationsStore`, `DecorationOwner` (Task 2), the flows' owner parameters (Task 4).
- Produces: `DecorationsSection` props `{ owner: DecorationOwner }`; three host components, each taking the props its settings host passes (`journalName`, `shelfName`, none).

- [ ] **Step 1: Write the failing tests**

In `DecorationsSection.test.ts`, change `mount(decorations)` to `mount(owner, decorations)`: keep the journal storage it builds today, additionally register `SettingsService` (`createSettingsService({ slices: [decorationsSlice] })`), a `ShelvesRepository` over `reactive({ work: { name: "work", journals: [], decorations: [] } })`, and `DecorationsStore`, seed the passed decorations into whichever owner is under test, and return `{ flows, store }`. Update the existing calls to pass `{ kind: "journal", journalName: "daily" }`. Then add:

```ts
const sampleCalendarDecoration: CalendarDecoration = {
  mode: "and",
  conditions: [{ type: "weekday", weekdays: [6] }],
  styles: [{ type: "background", color: transparent }],
};

it("titles the section for a shelf owner", async () => {
  mount({ kind: "shelf", shelfName: "work" }, [sampleCalendarDecoration]);
  expect(screen.getByText(m.decoration_section_title_shelf())).toBeTruthy();
});

it("lists a shelf's decorations", () => {
  mount({ kind: "shelf", shelfName: "work" }, [sampleCalendarDecoration]);
  expect(screen.getAllByLabelText(m.decoration_edit())).toHaveLength(1);
});

it("invokes the edit flow with the global owner", async () => {
  const { flows } = mount({ kind: "global" }, []);
  await userEvent.click(screen.getByLabelText(m.decoration_add()));
  expect(flows.invoke).toHaveBeenCalledWith(EditDecorationFlow, { owner: { kind: "global" } });
});
```

The section renders inside a collapsed `UiCollapsibleBlock`, so the existing tests already expand it before querying rows — follow whatever the current file does before the `getAllByLabelText` assertions.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/decorations/settings/ui`
Expected: FAIL — `DecorationsSection` takes `journalName`, the messages do not exist.

- [ ] **Step 3: Add the copy**

In `messages/en.json` (keep keys alphabetically placed as the file already is):

```json
"decoration_section_description_calendar": "Decorate day cells in every calendar, whatever journals are shown.",
"decoration_section_description_journal": "Use decorations to highlight dates in calendar that meet certain conditions.",
"decoration_section_description_shelf": "Decorate day cells while this shelf is shown, whatever journals it holds.",
"decoration_section_empty": "No decorations configured yet.",
"decoration_section_title_calendar": "Calendar decorations",
"decoration_section_title_journal": "Journal decorations",
"decoration_section_title_shelf": "Shelf decorations",
```

Delete `decoration_section_title` and `decoration_section_description`. Run `npm run compile:i18n`. Do not stage `src/i18n/paraglide`.

- [ ] **Step 4: Make the section owner-driven**

`DecorationsSection.vue`:

```ts
const { owner } = defineProps<{ owner: DecorationOwner }>();

const flows = useService(Flows);
const store = useService(DecorationsStore);
const calendar = useService(Calendar);

const decorations = computed<readonly JournalDecoration[]>(() => store.list(owner));

const title = computed(() =>
  match(owner)
    .with({ kind: "journal" }, () => m.decoration_section_title_journal())
    .with({ kind: "shelf" }, () => m.decoration_section_title_shelf())
    .with({ kind: "global" }, () => m.decoration_section_title_calendar())
    .exhaustive(),
);

const description = computed(() =>
  match(owner)
    .with({ kind: "journal" }, () => m.decoration_section_description_journal())
    .with({ kind: "shelf" }, () => m.decoration_section_description_shelf())
    .with({ kind: "global" }, () => m.decoration_section_description_calendar())
    .exhaustive(),
);

function add(): void {
  void flows.invoke(EditDecorationFlow, { owner });
}
function edit(index: number): void {
  void flows.invoke(EditDecorationFlow, { owner, index });
}
function remove(index: number): void {
  void flows.invoke(DeleteDecorationFlow, { owner, index });
}
```

The template swaps `m.decoration_section_title()` → `title`, `m.decoration_section_description()` → `description`. `JournalsViewModel` is no longer needed here.

> `title`/`description` are computeds because they read the reactive `owner` prop — this is the argument case, not the "don't wrap `m.*()` in computed" case.

- [ ] **Step 5: Add the three hosts**

`JournalDecorationsSection.vue`:

```vue
<script setup lang="ts">
import DecorationsSection from "./DecorationsSection.vue";

const { journalName } = defineProps<{ journalName: string }>();
</script>

<template>
  <DecorationsSection :owner="{ kind: 'journal', journalName }" />
</template>
```

`ShelfDecorationsSection.vue` is the same shape with `shelfName` and `{ kind: 'shelf', shelfName }`. `CalendarDecorationsBlock.vue` takes no props and renders `<DecorationsSection :owner="{ kind: 'global' }" />`.

- [ ] **Step 6: Register the hosts**

`src/decorations/settings/module.ts`:

```ts
c.register(JournalEditSectionToken).useValue(
  defineJournalEditSection({ key: "decorations", order: 100, component: JournalDecorationsSection }),
);
c.register(ShelfEditSectionToken).useValue(
  defineShelfEditSection({ key: "decorations", order: 100, component: ShelfDecorationsSection }),
);
c.register(DashboardBlockToken).useValue(
  defineDashboardBlock({ key: "calendar-decorations", component: CalendarDecorationsBlock, order: 11 }),
);
```

Import `ShelfEditSectionToken`/`defineShelfEditSection` from `@/shelves` and `DashboardBlockToken`/`defineDashboardBlock` from `@/settings`. Order 11 puts the block directly after the calendar week block (order 10).

- [ ] **Step 7: Run the checks**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/decorations messages/en.json
git commit -m "feat(decorations): edit calendar decorations from the dashboard and shelves"
```

---

### Task 6: End-to-end coverage

**Files:**

- Modify: `e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json`
- Modify: `e2e/journeys/decorations.ts`
- Modify: `e2e/journeys/view.e2e.ts`
- Modify: `e2e/journeys/settings.e2e.ts`

**Interfaces:**

- Consumes: everything above. Uses `calendar`, `dayAnchor`, `DECO_DAY`, `STYLE_HEX`, `expectBackgroundHex` from `e2e/journeys/`.
- Produces: `DECO_DAY.global`, `STYLE_HEX.global`.

The decoration is seeded through the fixture rather than built through the modal. Driving the condition dropdown, a weekday checkbox and an `<input type="color">` through WDIO adds four fragile helpers and tests the editor, which unit tests already cover; the behavior this e2e exists to prove is that a journal-free decoration reaches a real calendar day cell.

- [ ] **Step 1: Fix the renamed section**

In `e2e/journeys/settings.e2e.ts`, change all three `expandSection("Calendar decorations")` calls inside `describe("decorations")` to `expandSection("Journal decorations")`.

- [ ] **Step 2: Reserve a day and a color**

In `e2e/journeys/decorations.ts`, add `global: "#3a5f7d"` to `STYLE_HEX` and `global: 3` to `DECO_DAY` (3 is unused — the existing entries are 2, 5, 6, 7, 10, 13, 16, 19, 22, 25, 28). Keep the file's existing comments about custom hexes matching the fixture.

- [ ] **Step 3: Seed the fixture**

In `e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json`, add a top-level `decorations` slice beside `journals`/`shelves`/`views`/`commands`:

```json
"decorations": {
  "decorations": [
    {
      "mode": "and",
      "conditions": [{ "type": "date", "day": 3, "month": -1, "year": null }],
      "styles": [{ "type": "background", "color": { "type": "custom", "color": "#3a5f7d" } }]
    }
  ]
}
```

`month: -1` is `DATE_CONDITION_ANY`, so this matches the 3rd of every month and the test is date-independent. A `date` condition is used rather than a `weekday` one deliberately: a weekday rule would paint four or five cells per month and could collide with the day cells the existing decoration matrix asserts on.

- [ ] **Step 4: Write the failing test**

In `e2e/journeys/view.e2e.ts`, inside the same `describe` that calls `assertDecorationMatrix(calendar)` (around line 194), add a sibling test — not a line inside `assertDecorationMatrix`, which is shared with the nav code-block surface:

```ts
it("paints a day cell from a vault-wide decoration with no journal", async () => {
  await expectBackgroundHex(calendar.cell(dayAnchor(DECO_DAY.global)), STYLE_HEX.global);
});
```

Import `DECO_DAY` alongside the existing `STYLE_HEX`/`dayAnchor` imports if it is not already imported there.

- [ ] **Step 5: Run the suite**

Run: `npm run test:e2e -- --spec e2e/journeys/view.e2e.ts`
Expected: PASS after Tasks 1-5. If it fails with the cell's background reading `inherit`, the slice is not being parsed — check that `decorationsSlice` is registered (Task 2, Step 4) and that the fixture's `version` still matches the current settings version.

- [ ] **Step 6: Run every check**

Run: `npm run test && npm run check:types && npm run check:lint && npm run test:e2e`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add e2e
git commit -m "test(e2e): cover vault-wide calendar decorations"
```

---

## Verification

After Task 6, the feature is complete when:

- A decoration added from the dashboard's "Calendar decorations" block paints matching day cells in every calendar, on any shelf.
- A decoration added on a shelf's page paints only while that shelf is the one in scope.
- The condition editor offers exactly `date` and `weekday` for both, and all nine for a journal.
- A journal decoration's background still wins over a shelf's, and a shelf's over the vault-wide one.
- Custom-interval rows and toolbar badges are unchanged.
- `npm run test`, `npm run check:types`, `npm run check:lint`, `npm run test:e2e` all pass.
