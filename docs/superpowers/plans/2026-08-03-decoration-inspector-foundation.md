# Decoration Inspector — Foundation and Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Explain why a cell is decorated the way it is — a breakdown modal, reachable from all three settings decoration sections, showing which decoration won each property and which were overridden.

**Architecture:** The decoration engine currently flattens matched styles with `bucket.push(...styles)`, discarding which decoration each came from. This plan makes the engine build _attributed_ contributions once and project them two ways — the existing style list for rendering, and the contributions themselves for explanation — so there is never a second matcher to drift. A pure attribution layer turns contributions into per-property winners and overrides, defined against the same declaration rule `resolveCell` uses. The modal consumes that.

**Tech Stack:** TypeScript, Vue 3 SFCs, ts-pattern, valibot, Vitest, `@testing-library/vue`, Paraglide (i18n).

Design doc: `docs/superpowers/specs/2026-08-03-decoration-inspector-design.md`
Composition model this builds on: `docs/superpowers/specs/2026-08-03-decoration-composition-semantics-design.md`

**This is plan 1 of 3.** Plan 2 adds right-click reach from decorated cells (the `openPathsMenu`/`openFileMenu` refactor). Plan 3 adds the per-decoration match badges. Both depend on this plan's engine work; neither depends on the other.

## Global Constraints

- Commands are **npm**, not pnpm: `npm run test`, `npm run check:types`, `npm run check:lint`. Single file: `npm run test -- <path>`.
- Commit to the current branch (`v3-ai`). Never create a new branch. No `Co-Authored-By` trailer.
- Never use `eslint-disable` comments. Fix the code instead.
- Discriminated-union dispatch uses `ts-pattern` `match().with().exhaustive()`, never `switch`.
- Tests colocate: `foo.test.ts` beside `foo.ts`. Test infrastructure goes in a sibling `testing.ts`, never a `mocks/` or `fixtures/` folder.
- One behavior per test. Test names describe behavior (subject + verb). No "and"/comma-list names. Nested `describe()` for scope, never dashes or colons in one label.
- Assert observable outcomes. No whole-object equality on rich structures, no asserting array position as a proxy for precedence.
- Vue component tests use `@testing-library/vue` + `user-event`. No `@vue/test-utils`, no CSS-class queries, no test-only `data-*` attributes.
- Vue components use inline `defineProps<{...}>()`. Components reach DI through `useService`/`useModalService`, never `useApp`/`usePlugin`.
- Don't wrap `m.*()` in `computed()` unless the arguments include reactive data — inline in templates.
- New i18n strings go in `messages/en.json` and require `npm run compile:i18n`. **Never** stage or edit `src/i18n/paraglide` — it is generated and git-ignored.
- Copy style: sentence case, en-US, no concatenated tooltips.
- No spec-reference comments in source. Comments explain WHY, never WHAT.
- `no-non-null-assertion` is ON in production code, OFF in test files.
- Field initializers over constructor-body assignment: `readonly #x = inject(...)`.

---

### Task 1: Bindings carry their source, and gathering becomes shared

Two structural changes with no behavior change. `CalendarDecorationBinding` cannot currently tell a shelf decoration from a vault-wide one, and `gatherDecorations` is trapped inside `useCellDecorations` where the modal cannot reach it.

**Files:**

- Modify: `src/decorations/engine.ts` (binding interfaces, new `DecorationSource` + `sourceOf`)
- Create: `src/decorations/gather-bindings.ts`
- Create: `src/decorations/gather-bindings.test.ts`
- Modify: `src/decorations/use-cell-decorations.ts:50-73` (call the extracted function)
- Modify: `src/decorations/index.ts` (export the new names)

**Interfaces:**

- Consumes: `DecorationOwner`, `CalendarDecorationOwner` from `src/decorations/owner.ts`; `DecorationsStore`; `JournalsRepository`.
- Produces:
  - `interface DecorationSource { readonly owner: DecorationOwner; readonly index: number }`
  - `function sourceOf(binding: DecorationBinding): DecorationSource`
  - `interface GatherOptions { journalNames: readonly string[]; shelf: string | null; includeCalendar: boolean; filter?: (b: JournalDecorationBinding) => boolean }`
  - `function gatherBindings(journals: JournalsRepository, store: DecorationsStore | undefined, options: GatherOptions): readonly DecorationBinding[]`
  - `JournalDecorationBinding` gains `readonly index: number`
  - `CalendarDecorationBinding` gains `readonly owner: CalendarDecorationOwner` and `readonly index: number`

- [ ] **Step 1: Write the failing test**

Create `src/decorations/gather-bindings.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createSettingsService } from "@/settings/testing";
import { JournalsRepository } from "@/journals";
import { fakeRepo, fixedJournal } from "@/journals/testing";
import { ShelvesRepository, type ShelvesEvents } from "@/shelves";
import type { ShelfConfig } from "@/shelves/config";
import { createNanoEvents } from "nanoevents";
import { reactive } from "vue";

import { DecorationsStore } from "./decorations-store";
import { gatherBindings } from "./gather-bindings";
import { decorationsSlice } from "./settings/slice";
import { buildCalendarDecoration, buildCondition, buildDecoration, buildStyle } from "./testing";

function build(journalDecorations = []) {
  const { container: c, service } = createSettingsService({ slices: [decorationsSlice] });
  service.getSlice(decorationsSlice).state = { decorations: [] };
  const journals = fakeRepo({ daily: fixedJournal("daily", { type: "day" }, { decorations: journalDecorations }) });
  c.register(JournalsRepository).useValue(journals);
  const shelfStorage = reactive<Record<string, ShelfConfig>>({
    work: { name: "work", journals: [], decorations: [] },
  });
  c.register(ShelvesRepository).useValue(ShelvesRepository.fromParts(shelfStorage, createNanoEvents<ShelvesEvents>()));
  c.register(DecorationsStore).useClass(DecorationsStore);
  return { journals, store: c.resolve(DecorationsStore) };
}

const weekday = () => buildCondition("weekday", { weekdays: [1] });

describe("gatherBindings", () => {
  it("orders vault-wide bindings before journal bindings", () => {
    const { journals, store } = build([
      buildDecoration({ mode: "or", conditions: [weekday()], styles: [buildStyle("background")] }),
    ]);
    store.save({ kind: "global" }, [
      buildCalendarDecoration({ mode: "or", conditions: [weekday()], styles: [buildStyle("background")] }),
    ]);

    const bindings = gatherBindings(journals, store, { journalNames: ["daily"], shelf: null, includeCalendar: true });

    expect(bindings.map((b) => b.kind)).toEqual(["calendar", "journal"]);
  });

  it("orders shelf bindings before journal bindings", () => {
    const { journals, store } = build([
      buildDecoration({ mode: "or", conditions: [weekday()], styles: [buildStyle("background")] }),
    ]);
    store.save({ kind: "shelf", shelfName: "work" }, [
      buildCalendarDecoration({ mode: "or", conditions: [weekday()], styles: [buildStyle("background")] }),
    ]);

    const bindings = gatherBindings(journals, store, { journalNames: ["daily"], shelf: "work", includeCalendar: true });

    expect(bindings.map((b) => b.kind)).toEqual(["calendar", "journal"]);
  });

  it("labels a vault-wide binding with the global owner", () => {
    const { journals, store } = build();
    store.save({ kind: "global" }, [buildCalendarDecoration({ mode: "or", conditions: [weekday()], styles: [] })]);

    const [binding] = gatherBindings(journals, store, { journalNames: [], shelf: null, includeCalendar: true });

    expect(binding?.kind === "calendar" ? binding.owner : null).toEqual({ kind: "global" });
  });

  it("labels a shelf binding with its shelf owner", () => {
    const { journals, store } = build();
    store.save({ kind: "shelf", shelfName: "work" }, [
      buildCalendarDecoration({ mode: "or", conditions: [weekday()], styles: [] }),
    ]);

    const [binding] = gatherBindings(journals, store, { journalNames: [], shelf: "work", includeCalendar: true });

    expect(binding?.kind === "calendar" ? binding.owner : null).toEqual({ kind: "shelf", shelfName: "work" });
  });

  it("numbers each binding by its position in its owner's list", () => {
    const first = buildDecoration({ mode: "or", conditions: [weekday()], styles: [] });
    const second = buildDecoration({ mode: "or", conditions: [weekday()], styles: [] });
    const { journals, store } = build([first, second]);

    const bindings = gatherBindings(journals, store, { journalNames: ["daily"], shelf: null, includeCalendar: false });

    expect(bindings.map((b) => b.index)).toEqual([0, 1]);
  });

  it("omits a shelf's bindings when no shelf is in scope", () => {
    const { journals, store } = build();
    store.save({ kind: "shelf", shelfName: "work" }, [
      buildCalendarDecoration({ mode: "or", conditions: [weekday()], styles: [] }),
    ]);

    const bindings = gatherBindings(journals, store, { journalNames: [], shelf: null, includeCalendar: true });

    expect(bindings).toEqual([]);
  });

  it("omits every calendar binding when the surface does not opt in", () => {
    const { journals, store } = build();
    store.save({ kind: "global" }, [buildCalendarDecoration({ mode: "or", conditions: [weekday()], styles: [] })]);

    const bindings = gatherBindings(journals, store, { journalNames: [], shelf: null, includeCalendar: false });

    expect(bindings).toEqual([]);
  });

  it("drops journal bindings the filter rejects", () => {
    const { journals, store } = build([buildDecoration({ mode: "or", conditions: [weekday()], styles: [] })]);

    const bindings = gatherBindings(journals, store, {
      journalNames: ["daily"],
      shelf: null,
      includeCalendar: false,
      filter: () => false,
    });

    expect(bindings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/decorations/gather-bindings.test.ts`

Expected: FAIL — `Failed to resolve import "./gather-bindings"`.

- [ ] **Step 3: Widen the binding types**

In `src/decorations/engine.ts`, replace the two binding interfaces and the union (lines 30-41) with:

```ts
export interface JournalDecorationBinding {
  readonly kind: "journal";
  readonly journalName: string;
  readonly index: number;
  readonly decoration: JournalDecoration;
}

export interface CalendarDecorationBinding {
  readonly kind: "calendar";
  readonly owner: CalendarDecorationOwner;
  readonly index: number;
  readonly decoration: CalendarDecoration;
}

export type DecorationBinding = JournalDecorationBinding | CalendarDecorationBinding;

export interface DecorationSource {
  readonly owner: DecorationOwner;
  readonly index: number;
}

export function sourceOf(binding: DecorationBinding): DecorationSource {
  return binding.kind === "journal"
    ? { owner: { kind: "journal", journalName: binding.journalName }, index: binding.index }
    : { owner: binding.owner, index: binding.index };
}
```

Add to the imports at the top of `engine.ts`:

```ts
import type { CalendarDecorationOwner, DecorationOwner } from "./owner";
```

- [ ] **Step 4: Write the gatherer**

Create `src/decorations/gather-bindings.ts`:

```ts
import type { JournalsRepository } from "@/journals";

import type { DecorationBinding, JournalDecorationBinding } from "./engine";

import type { DecorationsStore } from "./decorations-store";

export interface GatherOptions {
  readonly journalNames: readonly string[];
  // The shelf in scope, or null for "all journals" — a shelf's decorations apply only
  // while that shelf is shown.
  readonly shelf: string | null;
  // Surfaces that never render journal-free decorations opt out entirely.
  readonly includeCalendar: boolean;
  readonly filter?: (binding: JournalDecorationBinding) => boolean;
}

// Vault-wide, then shelf, then journal: resolveCell() takes the last declaration of each
// exclusive property, so gathering order is what makes the most specific owner win.
export function gatherBindings(
  journals: JournalsRepository,
  store: DecorationsStore | undefined,
  options: GatherOptions,
): readonly DecorationBinding[] {
  const out: DecorationBinding[] = [];
  const accept = options.filter ?? ((): boolean => true);

  if (options.includeCalendar && store) {
    const globalDecorations = store.calendarList({ kind: "global" });
    for (const [index, decoration] of globalDecorations.entries()) {
      out.push({ kind: "calendar", owner: { kind: "global" }, index, decoration });
    }
    const shelfName = options.shelf;
    if (shelfName !== null) {
      const shelfDecorations = store.calendarList({ kind: "shelf", shelfName });
      for (const [index, decoration] of shelfDecorations.entries()) {
        out.push({ kind: "calendar", owner: { kind: "shelf", shelfName }, index, decoration });
      }
    }
  }

  for (const name of options.journalNames) {
    const opt = journals.get(name);
    if (opt.isNone()) continue;
    for (const [index, decoration] of opt.value.decorations.entries()) {
      const binding: JournalDecorationBinding = { kind: "journal", journalName: name, index, decoration };
      if (accept(binding)) out.push(binding);
    }
  }

  return out;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- src/decorations/gather-bindings.test.ts`

Expected: PASS — 8 tests.

- [ ] **Step 6: Point `useCellDecorations` at the shared gatherer**

In `src/decorations/use-cell-decorations.ts`, replace the whole `gatherDecorations` function (lines 50-73) with:

```ts
function gatherDecorations(): readonly DecorationBinding[] {
  const calendar = options.calendarDecorations;
  return gatherBindings(journals, store, {
    journalNames: toValue(options.journalNames),
    shelf: calendar ? toValue(calendar.shelf) : null,
    includeCalendar: calendar !== undefined,
    filter,
  });
}
```

Add `gatherBindings` to the imports and drop any import left unused by the change. The `DecorationBinding` type import stays.

- [ ] **Step 7: Export the new names**

In `src/decorations/index.ts`, add to the existing `./engine` export block: `sourceOf`, `type DecorationSource`. Add a new line: `export { gatherBindings, type GatherOptions } from "./gather-bindings";`

- [ ] **Step 8: Run the full gates**

Run: `npm run test && npm run check:types && npm run check:lint`

Expected: all PASS. `use-cell-decorations.test.ts` must be green **unchanged** — this task alters no behavior, only where the gathering code lives and what the bindings carry. If a precedence test there fails, the extraction changed the order and must be corrected.

- [ ] **Step 9: Commit**

```bash
git add src/decorations
git commit -m "refactor(decorations): give bindings a source and share the gatherer"
```

---

### Task 2: `explainRange` — contributions instead of bare styles

**Files:**

- Modify: `src/decorations/engine.ts` (`evaluateRange` becomes a projection of a new `explainRange`)
- Modify: `src/decorations/engine.test.ts` (add contribution coverage)

**Interfaces:**

- Consumes: `DecorationSource`, `sourceOf` from Task 1.
- Produces:
  - `interface Contribution { readonly source: DecorationSource; readonly style: JournalDecorationStyle }`
  - `DecorationEngine.explainRange(periods, decorations): Map<string, Contribution[]>`
  - `DecorationEngine.evaluateRange` keeps its exact existing signature and return type.

- [ ] **Step 1: Write the failing test**

Append to `src/decorations/engine.test.ts`, inside the existing top-level `describe` for the engine (match the file's existing harness helpers for building an engine, periods and bindings — read the file first and reuse them rather than inventing new ones):

```ts
describe("explainRange", () => {
  it("labels a contribution with the decoration that produced it", () => {
    // Build one journal decoration matching the period under test, with a single
    // background style, using this file's existing harness.
    // Assert the returned contribution's source is { owner: { kind: "journal", journalName }, index: 0 }.
  });

  it("returns contributions in cascade order", () => {
    // A vault-wide decoration and a journal decoration both matching the same period.
    // Assert the sources' owner kinds are ["global", "journal"] in that order.
  });

  it("returns no entry for a period nothing matched", () => {
    // Assert the map has no key for an undecorated period.
  });
});
```

**Replace each comment with the real test body using the harness already in `engine.test.ts`.** Read that file first; it constructs a `DecorationEngine` against fake repositories and builds periods with `DayPeriod.containing(date(...))`. Do not create a second harness.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/decorations/engine.test.ts`

Expected: FAIL — `engine.explainRange is not a function`.

- [ ] **Step 3: Split the matcher from its projections**

In `src/decorations/engine.ts`, add the contribution type beside the binding types:

```ts
export interface Contribution {
  readonly source: DecorationSource;
  readonly style: JournalDecorationStyle;
}
```

Rename the existing `evaluateRange` method to `explainRange`, change its return type to `Map<string, Contribution[]>`, and change its inner `push` helper to carry the source:

```ts
const push = (period: Period, binding: DecorationBinding): void => {
  const styles = binding.decoration.styles;
  if (styles.length === 0) return;
  const key = cellKey(period.kind, period.anchor.toAnchor());
  let bucket = result.get(key);
  if (!bucket) {
    bucket = [];
    result.set(key, bucket);
  }
  const source = sourceOf(binding);
  for (const style of styles) bucket.push({ source, style });
};
```

Update the two call sites inside the loop from `push(period, binding.decoration.styles)` to `push(period, binding)`.

Then add `evaluateRange` back as the second projection:

```ts
  evaluateRange(
    periods: readonly Period[],
    decorations: readonly DecorationBinding[],
  ): Map<string, JournalDecorationStyle[]> {
    const result = new Map<string, JournalDecorationStyle[]>();
    for (const [key, contributions] of this.explainRange(periods, decorations)) {
      result.set(
        key,
        contributions.map((contribution) => contribution.style),
      );
    }
    return result;
  }
```

Note the `styles.length === 0` guard in `push`: today an empty style array still creates no entries because the spread pushes nothing. The explicit guard preserves that — without it, a decoration with conditions but no styles would create an empty bucket and make an undecorated cell look decorated.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/decorations/engine.test.ts`

Expected: PASS.

- [ ] **Step 5: Run the full gates**

Run: `npm run test && npm run check:types && npm run check:lint`

Expected: all PASS. Every existing `evaluateRange` consumer and test is untouched — the signature did not change.

- [ ] **Step 6: Commit**

```bash
git add src/decorations
git commit -m "feat(decorations): add explainRange carrying each style's source"
```

---

### Task 3: Declared properties and cell attribution

Turns contributions into per-property winners and overrides. The declaration rule is stated once and asserted against `resolveCell`, so the two cannot drift.

**Files:**

- Modify: `src/decorations/resolve-cell.ts` (add `declaredProperties`)
- Modify: `src/decorations/resolve-cell.test.ts` (add the agreement test)
- Create: `src/decorations/attribute-cell.ts`
- Create: `src/decorations/attribute-cell.test.ts`
- Modify: `src/decorations/index.ts`

**Interfaces:**

- Consumes: `Contribution` from Task 2; `resolveCell`, `Placement`, `CellMark` from `resolve-cell.ts`.
- Produces:
  - `type ExclusiveProperty = "background" | "textColor" | "border.top" | "border.right" | "border.bottom" | "border.left" | "corner.top-left" | "corner.top-right" | "corner.bottom-left" | "corner.bottom-right"`
  - `function declaredProperties(style: JournalDecorationStyle): readonly ExclusiveProperty[]`
  - `interface PropertyAttribution { readonly property: ExclusiveProperty; readonly winner: Contribution; readonly overridden: readonly Contribution[] }`
  - `interface CellAttribution { readonly properties: readonly PropertyAttribution[]; readonly marks: Readonly<Record<Placement, readonly Contribution[]>> }`
  - `function attributeCell(contributions: readonly Contribution[]): CellAttribution`

- [ ] **Step 1: Write the failing tests**

Create `src/decorations/attribute-cell.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { attributeCell } from "./attribute-cell";
import { buildStyle } from "./testing";

import type { Contribution } from "./engine";
import type { JournalDecorationStyle } from "./config";

function contribution(style: JournalDecorationStyle, journalName: string, index = 0): Contribution {
  return { source: { owner: { kind: "journal", journalName }, index }, style };
}

describe("attributeCell", () => {
  it("names the last declaring contribution as the winner", () => {
    const earlier = contribution(buildStyle("background", { color: { type: "custom", color: "#aaaaaa" } }), "a");
    const later = contribution(buildStyle("background", { color: { type: "custom", color: "#bbbbbb" } }), "b");

    const { properties } = attributeCell([earlier, later]);

    expect(properties.find((p) => p.property === "background")?.winner).toBe(later);
  });

  it("reports the contributions a winner overrode in cascade order", () => {
    const first = contribution(buildStyle("background", { color: { type: "custom", color: "#111111" } }), "a");
    const second = contribution(buildStyle("background", { color: { type: "custom", color: "#222222" } }), "b");
    const third = contribution(buildStyle("background", { color: { type: "custom", color: "#333333" } }), "c");

    const { properties } = attributeCell([first, second, third]);

    expect(properties.find((p) => p.property === "background")?.overridden).toEqual([first, second]);
  });

  it("omits a property no contribution declared", () => {
    const only = contribution(buildStyle("background"), "a");

    const { properties } = attributeCell([only]);

    expect(properties.some((p) => p.property === "textColor")).toBe(false);
  });

  it("attributes each border side independently", () => {
    const top = contribution(
      buildStyle("border", {
        border: "different",
        top: { show: true, width: 1, style: "solid", color: { type: "custom", color: "#ff0000" } },
      }),
      "a",
    );
    const left = contribution(
      buildStyle("border", {
        border: "different",
        left: { show: true, width: 1, style: "solid", color: { type: "custom", color: "#00ff00" } },
      }),
      "b",
    );

    const { properties } = attributeCell([top, left]);

    expect(properties.find((p) => p.property === "border.top")?.winner).toBe(top);
  });

  it("leaves an abstaining border side unattributed", () => {
    const hidden = contribution(
      buildStyle("border", {
        border: "different",
        top: { show: false, width: 5, style: "solid", color: { type: "custom", color: "#ff0000" } },
      }),
      "a",
    );

    const { properties } = attributeCell([hidden]);

    expect(properties.some((p) => p.property === "border.top")).toBe(false);
  });

  it("attributes each corner placement independently", () => {
    const topLeft = contribution(buildStyle("corner", { placement: "top-left" }), "a");
    const bottomRight = contribution(buildStyle("corner", { placement: "bottom-right" }), "b");

    const { properties } = attributeCell([topLeft, bottomRight]);

    expect(properties.find((p) => p.property === "corner.bottom-right")?.winner).toBe(bottomRight);
  });

  it("collects marks into their slot in cascade order", () => {
    const earlier = contribution(buildStyle("shape", { placement_x: "center", placement_y: "bottom" }), "a");
    const later = contribution(buildStyle("icon", { placement_x: "center", placement_y: "bottom" }), "b");

    const { marks } = attributeCell([earlier, later]);

    expect(marks.center_bottom).toEqual([earlier, later]);
  });

  it("reports no overrides for marks sharing a slot", () => {
    const earlier = contribution(buildStyle("shape", { placement_x: "center", placement_y: "bottom" }), "a");
    const later = contribution(buildStyle("shape", { placement_x: "center", placement_y: "bottom" }), "b");

    const { properties } = attributeCell([earlier, later]);

    expect(properties).toEqual([]);
  });
});
```

Append to `src/decorations/resolve-cell.test.ts` a new top-level `describe` — this is the agreement test, and it is the reason `declaredProperties` is worth having as a separate function:

```ts
describe("declaredProperties", () => {
  const ALL_PROPERTIES = [
    "background",
    "textColor",
    "border.top",
    "border.right",
    "border.bottom",
    "border.left",
    "corner.top-left",
    "corner.top-right",
    "corner.bottom-left",
    "corner.bottom-right",
  ] as const;

  // Reading a resolved cell property by its ExclusiveProperty name, so the two
  // implementations can be compared without either knowing about the other.
  function read(cell: ResolvedCell, property: (typeof ALL_PROPERTIES)[number]): string {
    if (property === "background") return cell.background;
    if (property === "textColor") return cell.textColor;
    if (property.startsWith("border.")) {
      const side = property.slice("border.".length) as "top" | "right" | "bottom" | "left";
      return cell.border[side];
    }
    const placement = property.slice("corner.".length);
    const corner = cell.corners.find((c) => c.placement === placement);
    return corner ? colorToString(corner.color) : "none";
  }

  const cases: { name: string; style: JournalDecorationStyle }[] = [
    { name: "a background style", style: buildStyle("background", { color: { type: "custom", color: "#123456" } }) },
    { name: "a color style", style: buildStyle("color", { color: { type: "custom", color: "#654321" } }) },
    {
      name: "a uniform border",
      style: buildStyle("border", {
        border: "uniform",
        left: { show: true, width: 2, style: "solid", color: { type: "custom", color: "#abcdef" } },
      }),
    },
    {
      name: "a per-side border with one shown side",
      style: buildStyle("border", {
        border: "different",
        top: { show: true, width: 2, style: "solid", color: { type: "custom", color: "#abcdef" } },
      }),
    },
    {
      name: "a per-side border with every side hidden",
      style: buildStyle("border", { border: "different" }),
    },
    {
      name: "a corner",
      style: buildStyle("corner", { placement: "top-right", color: { type: "custom", color: "#0abcde" } }),
    },
    { name: "a shape", style: buildStyle("shape", { color: { type: "custom", color: "#111111" } }) },
    { name: "an icon", style: buildStyle("icon", { color: { type: "custom", color: "#222222" } }) },
  ];

  for (const { name, style } of cases) {
    it(`reports exactly the properties ${name} changes when resolved`, () => {
      const before = resolveCell([]);
      const after = resolveCell([style]);
      const changed = ALL_PROPERTIES.filter((property) => read(after, property) !== read(before, property));

      expect([...declaredProperties(style)].sort()).toEqual([...changed].sort());
    });
  }
});
```

Add to that file's imports: `declaredProperties`, `type ResolvedCell` from `./resolve-cell`; `colorToString` from `./ui/color`; `type JournalDecorationStyle` from `./config`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/decorations/attribute-cell.test.ts src/decorations/resolve-cell.test.ts`

Expected: FAIL — `Failed to resolve import "./attribute-cell"`, and `declaredProperties is not exported`.

- [ ] **Step 3: Add `declaredProperties` to the resolver**

Append to `src/decorations/resolve-cell.ts`:

```ts
export type ExclusiveProperty =
  | "background"
  | "textColor"
  | "border.top"
  | "border.right"
  | "border.bottom"
  | "border.left"
  | "corner.top-left"
  | "corner.top-right"
  | "corner.bottom-left"
  | "corner.bottom-right";

// Which exclusive properties a style competes for. A hidden border side abstains, so it
// declares nothing; marks never compete, so they declare nothing either.
export function declaredProperties(style: JournalDecorationStyle): readonly ExclusiveProperty[] {
  return match<JournalDecorationStyle, readonly ExclusiveProperty[]>(style)
    .with({ type: "background" }, () => ["background"])
    .with({ type: "color" }, () => ["textColor"])
    .with({ type: "border" }, (s) => {
      if (s.border === "uniform") {
        return s.left.show ? ["border.top", "border.right", "border.bottom", "border.left"] : [];
      }
      return BORDER_SIDES.filter((side) => s[side].show).map((side) => `border.${side}` as ExclusiveProperty);
    })
    .with({ type: "corner" }, (s) => [`corner.${s.placement}` as ExclusiveProperty])
    .with({ type: "shape" }, { type: "icon" }, () => [])
    .exhaustive();
}
```

- [ ] **Step 4: Write the attribution**

Create `src/decorations/attribute-cell.ts`:

```ts
import { declaredProperties, type ExclusiveProperty, type Placement } from "./resolve-cell";

import type { Contribution } from "./engine";

export interface PropertyAttribution {
  readonly property: ExclusiveProperty;
  readonly winner: Contribution;
  // Earlier declarations of the same property, in cascade order.
  readonly overridden: readonly Contribution[];
}

export interface CellAttribution {
  readonly properties: readonly PropertyAttribution[];
  readonly marks: Readonly<Record<Placement, readonly Contribution[]>>;
}

function emptyMarks(): Record<Placement, Contribution[]> {
  return {
    left_top: [],
    left_middle: [],
    left_bottom: [],
    center_top: [],
    center_middle: [],
    center_bottom: [],
    right_top: [],
    right_middle: [],
    right_bottom: [],
  };
}

export function attributeCell(contributions: readonly Contribution[]): CellAttribution {
  const declarers = new Map<ExclusiveProperty, Contribution[]>();
  const marks = emptyMarks();

  for (const contribution of contributions) {
    const { style } = contribution;
    if (style.type === "shape" || style.type === "icon") {
      marks[`${style.placement_x}_${style.placement_y}`].push(contribution);
      continue;
    }
    for (const property of declaredProperties(style)) {
      const bucket = declarers.get(property);
      if (bucket) bucket.push(contribution);
      else declarers.set(property, [contribution]);
    }
  }

  const properties: PropertyAttribution[] = [];
  for (const [property, bucket] of declarers) {
    const winner = bucket.at(-1);
    if (!winner) continue;
    properties.push({ property, winner, overridden: bucket.slice(0, -1) });
  }

  return { properties, marks };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test -- src/decorations/attribute-cell.test.ts src/decorations/resolve-cell.test.ts`

Expected: PASS — 8 attribution tests and 8 agreement cases.

- [ ] **Step 6: Export and run the full gates**

In `src/decorations/index.ts` add:

```ts
export { attributeCell, type CellAttribution, type PropertyAttribution } from "./attribute-cell";
export { declaredProperties, type ExclusiveProperty } from "./resolve-cell";
```

Run: `npm run test && npm run check:types && npm run check:lint`

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/decorations
git commit -m "feat(decorations): attribute a cell's properties to the decorations that set them"
```

---

### Task 4: The breakdown modal

**Files:**

- Create: `src/decorations/ui/DecorationBreakdownModal.vue`
- Create: `src/decorations/ui/DecorationBreakdownModal.test.ts`
- Create: `src/decorations/ui/modals.ts`
- Modify: `messages/en.json`
- Modify: `src/decorations/index.ts`

**Interfaces:**

- Consumes: `gatherBindings` (Task 1), `DecorationEngine.explainRange` (Task 2), `attributeCell` (Task 3), `DecorationPreview`, `describeCondition` from `src/decorations/settings/ui/describe-condition.ts`, `DatePicker` + `useAnchorField` from `@/calendar/ui`, `ShelvesRepository`, `JournalsRepository`.
- Produces: `decorationBreakdownModal` — a `defineModal<void>()` taking `{ period?: Period }`.

- [ ] **Step 1: Add the copy**

Add to `messages/en.json`:

```json
"decoration_breakdown_title": "Decoration breakdown",
"decoration_breakdown_open": "Inspect a date",
"decoration_breakdown_date_label": "Date",
"decoration_breakdown_shelf_label": "Shelf in view",
"decoration_breakdown_shelf_all": "All journals",
"decoration_breakdown_empty": "Nothing decorates this date.",
"decoration_breakdown_marks_heading": "Marks",
"decoration_breakdown_overridden_heading": "Overridden here",
"decoration_breakdown_scope": [{"declarations":["input kind"],"selectors":["kind"],"match":{"kind=journal":"Journal","kind=shelf":"Shelf","kind=global":"Vault-wide"}}],
"decoration_breakdown_property": [{"declarations":["input property"],"selectors":["property"],"match":{"property=background":"Background","property=textColor":"Text color","property=border.top":"Border top","property=border.right":"Border right","property=border.bottom":"Border bottom","property=border.left":"Border left","property=corner.top-left":"Corner top left","property=corner.top-right":"Corner top right","property=corner.bottom-left":"Corner bottom left","property=corner.bottom-right":"Corner bottom right"}}]
```

Run: `npm run compile:i18n`

Do **not** stage anything under `src/i18n/paraglide`.

- [ ] **Step 2: Write the failing component test**

Create `src/decorations/ui/DecorationBreakdownModal.test.ts`. Read `src/decorations/settings/ui/DecorationsSection.test.ts` first and reuse its container/render helper shape rather than inventing one — it already wires `provideInjectorOnApp` and the decorations services.

Cover exactly these behaviors, one `it` each:

```ts
// describe("DecorationBreakdownModal")
//   it("shows a section for each decorated cell the date belongs to")
//   it("omits a cell no decoration matched")
//   it("names the winning decoration for a resolved property")
//   it("lists a contribution that lost a property under the overridden heading")
//   it("lists marks without naming a winner")
//   it("re-resolves when the shelf selection changes")
//   it("shows the empty state for a date nothing decorates")
```

Write real bodies: seed a journal decoration and a vault-wide decoration that both set a background on the same day, render with `period` pointing at that day, and assert through visible text — the winner's condition summary appears in the property row, the loser's under the overridden heading. Use `@testing-library/vue` queries and `user-event` for the shelf dropdown. No CSS-class queries, no `data-*` test attributes.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test -- src/decorations/ui/DecorationBreakdownModal.test.ts`

Expected: FAIL — the component does not exist.

- [ ] **Step 4: Write the modal component**

Create `src/decorations/ui/DecorationBreakdownModal.vue`. Structure:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";

import { CalendarDate, DayPeriod, type AnchorString, type Period } from "@/calendar";
import { DatePicker, useAnchorField } from "@/calendar/ui";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { JournalsRepository } from "@/journals";
import { ShelvesRepository } from "@/shelves";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { attributeCell } from "../attribute-cell";
import { DecorationsStore } from "../decorations-store";
import { DecorationEngine } from "../engine";
import { gatherBindings } from "../gather-bindings";
import { describeCondition } from "../settings/ui/describe-condition";

import DecorationPreview from "./DecorationPreview.vue";

const { period } = defineProps<{ period?: Period }>();
</script>
```

Behaviour to implement in that script block:

1. `anchor` is a `ref<AnchorString>` seeded from `period?.anchor.toAnchor()` or today's date; bind `DatePicker` through `useAnchorField({ anchor, picking: "day" })`.
2. `shelf` is a `ref<string | null>` seeded from `null`; the dropdown lists `m.decoration_breakdown_shelf_all()` plus every shelf name from `ShelvesRepository`.
3. `cells` is a computed producing one entry per period kind that some journal writes, plus the day period, each built from the selected date. For each, call `gatherBindings(journals, store, { journalNames, shelf, includeCalendar: true })` and `engine.explainRange([thatPeriod], bindings)`, keep only cells whose contribution list is non-empty, and pair each with `attributeCell(contributions)` and the plain style list for `DecorationPreview`.
4. `journalNames` is every journal in the repository when `shelf` is null, otherwise that shelf's journals.

Template: a `UiSettingRow` for the date picker, one for the shelf dropdown, then per cell a `DecorationPreview` beside a list of `properties` — each showing `m.decoration_breakdown_property({ property })`, the winner's `m.decoration_breakdown_scope({ kind })` and its conditions joined via `describeCondition` — then the overridden list under `m.decoration_breakdown_overridden_heading()`, then marks under `m.decoration_breakdown_marks_heading()`. When `cells` is empty render `m.decoration_breakdown_empty()`.

The modal is a viewer: it calls neither `submit` nor `cancel` from its own body.

- [ ] **Step 5: Define the modal**

Create `src/decorations/ui/modals.ts`:

```ts
import type { Period } from "@/calendar";
import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import DecorationBreakdownModal from "./DecorationBreakdownModal.vue";

export const decorationBreakdownModal = defineModal()({
  component: DecorationBreakdownModal,
  title: (_: { period?: Period }) => m.decoration_breakdown_title(),
  width: 700,
});
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test -- src/decorations/ui/DecorationBreakdownModal.test.ts`

Expected: PASS — 7 tests.

- [ ] **Step 7: Export and run the full gates**

Add to `src/decorations/index.ts`: `export { decorationBreakdownModal } from "./ui/modals";`

Run: `npm run test && npm run check:types && npm run check:lint`

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/decorations messages/en.json
git commit -m "feat(decorations): add the cell breakdown modal"
```

---

### Task 5: The settings entry point

**Files:**

- Modify: `src/decorations/settings/ui/DecorationsSection.vue`
- Modify: `src/decorations/settings/ui/DecorationsSection.test.ts`

**Interfaces:**

- Consumes: `decorationBreakdownModal` (Task 4), `useModalService` from `@/infrastructure/host/modals`.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Append to `src/decorations/settings/ui/DecorationsSection.test.ts`:

```ts
it("opens the breakdown modal from the inspect button", async () => {
  // Render the section, click the button labelled m.decoration_breakdown_open(),
  // and assert the modal service was asked to open decorationBreakdownModal.
  // Use the modals testing helper the other modal-opening tests in this repo use
  // (see src/infrastructure/host/modals/testing.ts) rather than spying on a real service.
});
```

Replace the comment with a real body following the modal-testing pattern already used elsewhere in the repo.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/decorations/settings/ui/DecorationsSection.test.ts`

Expected: FAIL — no button with that label exists.

- [ ] **Step 3: Add the button**

In `src/decorations/settings/ui/DecorationsSection.vue`, add to the `#controls` template block, before the existing add button:

```vue
<UiIconButton :icon="icons.action.search" :tooltip="m.decoration_breakdown_open()" @click="inspect" />
```

and in the script block:

```ts
const modals = useModalService();

function inspect(): void {
  void modals.open(decorationBreakdownModal, {});
}
```

Import `useModalService` from `@/infrastructure/host/modals` and `decorationBreakdownModal` from `../../ui/modals`.

The modal is a viewer with no domain effect, so it opens directly rather than through a flow — a flow here would be a pass-through with no domain meaning.

`icons.action.search` does **not** exist yet — the `action` group currently ends at `moveUp`/`moveDown`. Add `search: "search"` to that group in `src/ui/icons.ts` as part of this step. Never write a bare icon literal at the call site.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/decorations/settings/ui/DecorationsSection.test.ts`

Expected: PASS.

- [ ] **Step 5: Run the full gates**

Run: `npm run test && npm run check:types && npm run check:lint`

Expected: all PASS. `DecorationsSection` serves all three owners, so this one change puts the button on the journal edit page, the shelf edit page and the dashboard block.

- [ ] **Step 6: Manual verification**

Open the plugin in the test vault, go to Settings → Journals → any journal → Decorations, click **Inspect a date**, and confirm: the modal opens on today, the date picker moves it, a date with a decoration shows a breakdown naming the winning decoration, and switching the shelf selector changes what is listed.

- [ ] **Step 7: Commit**

```bash
git add src/decorations
git commit -m "feat(decorations): open the breakdown modal from the decorations sections"
```

---

### Task 6: Custom-interval sections

The design says a date belongs to up to six cells — day, week, month, quarter, year, **and custom interval** — but the modal renders five. Tasks 1-5 shipped only the correctness half: a custom journal's decorations no longer misattribute to the day cell (the `hasOffsetCondition` filter mirrors the day grid). The consequence is that a custom journal's **non-offset** decorations currently have no surface in this modal at all. This task gives them one.

**Files:**

- Modify: `src/decorations/ui/DecorationBreakdownModal.vue`
- Modify: `src/decorations/ui/DecorationBreakdownModal.test.ts`
- Modify: `messages/en.json`

**Interfaces:**

- Consumes: `CycleService.anchorOf(journalName, date: CalendarDate): Option<AnchorString>`; `TimelineService.contains(journalName, anchor)`; `periodForJournal(write, anchor)` from `@/code-blocks/nav/period-for-journal`; `hasOffsetCondition` from `@/decorations`; `gatherBindings`, `explainRange`, `attributeCell` as already used.
- Produces: no new exports. `BreakdownCell` becomes a discriminated union.

#### Three things that will bite if you skip them

**1. Cell keys collide, so a second `explainRange` call is mandatory.** `periodForJournal` maps a custom write to `periodOfKind("day", date)` — an interval is a **"day"-kind period at its start anchor**. When the selected date _is_ an interval's start date, `cellKey("day", startAnchor)` is byte-identical to the day cell's key. The two must show different decorations (the day cell shows offset-carrying ones; the interval shows the rest), so they cannot share one `explainRange` result — the second write would overwrite the first. Production solves this with two independently-scoped `useCellDecorations` calls (`NotesMonthView.vue` vs `CustomIntervalsBlock.vue`); this modal needs the same separation as two gather-and-explain passes.

**2. The filter is the exact complement of the day cell's.** `CustomIntervalsBlock.vue` uses `filter: (binding) => !hasOffsetCondition(binding.decoration)`, scoped to the custom journals it renders. The interval pass must use that, and must be scoped to the one journal whose interval it is — not the whole `journalNames` list.

**3. `isEntry` breaks on the same collision.** `entryKey` is a `cellKey` string. Because an interval starting on the selected date shares the day cell's key, comparing keys alone would highlight the interval section when the user opened the modal from a day cell. The comparison must consider the section's kind, not just its key.

- [ ] **Step 1: Add the copy**

Add to `messages/en.json`:

```json
"decoration_breakdown_interval_heading": "Interval — {journal} — {label}"
```

Run: `npm run compile:i18n`. Never stage anything under `src/i18n/paraglide`.

- [ ] **Step 2: Write the failing tests**

Add to `src/decorations/ui/DecorationBreakdownModal.test.ts`, following the harness and query style already in the file (`@testing-library/vue`, accessible-name queries, no CSS-class selectors):

```ts
it("shows an interval section for a custom journal's non-offset decoration", async () => {
  // Seed a custom journal whose interval contains the selected date, carrying a
  // decoration with a non-offset condition (e.g. has-note) and a background style.
  // Assert a section headed with the interval heading renders, and that the
  // decoration's condition summary appears inside it.
});

it("keeps a custom journal's offset decoration out of the interval section", async () => {
  // Same journal, a decoration carrying an offset condition matching the selected day.
  // Assert its condition summary does NOT appear inside the interval section.
  // (It belongs to the day cell, which the existing admitting test already covers.)
});

it("highlights only the day section when opened from a day cell that starts an interval", async () => {
  // Seed a custom journal whose interval STARTS on the selected date, plus a day-type
  // journal decoration on that date, so both sections exist and share a cell key.
  // Open with the day period. Assert the entry badge appears in the day section and
  // not in the interval section.
});

it("omits an interval section for a journal whose timeline excludes the interval", async () => {
  // A custom journal with a decoration that would match, but whose timeline does not
  // contain the interval's anchor. Assert no interval section renders for it.
});
```

Replace each comment with a real body. Reuse the file's existing fixture helpers rather than inventing new ones; the file already builds custom journals (see the admitting/excluding tests added in Task 4's fix round).

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test -- src/decorations/ui/DecorationBreakdownModal.test.ts`

Expected: FAIL — no interval section is rendered, so the heading query finds nothing.

- [ ] **Step 4: Make `BreakdownCell` a discriminated union**

Replace the interface with:

```ts
type BreakdownCell =
  | {
      readonly kind: "fixed";
      readonly period: Period;
      readonly isEntry: boolean;
      readonly attribution: CellAttribution;
      readonly styles: readonly JournalDecorationStyle[];
    }
  | {
      readonly kind: "interval";
      readonly period: Period;
      readonly journalName: string;
      readonly isEntry: false;
      readonly attribution: CellAttribution;
      readonly styles: readonly JournalDecorationStyle[];
    };
```

`isEntry` is `false` on interval sections by construction: every current entry point supplies a fixed-grid period, and typing it shut is what stops the key collision from ever highlighting the wrong section. Revisit only if a surface starts opening the modal from an interval row.

Set `kind: "fixed"` on the cells the existing loop produces.

- [ ] **Step 5: Build the interval sections**

In the `cells` computed, after the existing fixed-period pass, add a second pass:

```ts
for (const name of journalNames.value) {
  const config = journals.get(name).getOrUndefined();
  if (config?.write.type !== "custom") continue;
  const intervalAnchor = cycle.anchorOf(name, selectedDate).getOrUndefined();
  if (intervalAnchor === undefined) continue;
  if (!timeline.contains(name, intervalAnchor)) continue;

  const intervalPeriod = periodForJournal(config.write, intervalAnchor);
  // An interval is a "day"-kind period at its start anchor, so its cell key collides with
  // the day cell's. A separate explainRange keeps the two from overwriting each other, and
  // the complementary filter is what makes them describe different things.
  const intervalBindings = gatherBindings(journals, store, {
    journalNames: [name],
    shelf: shelf.value,
    includeCalendar: false,
    filter: (binding) => !hasOffsetCondition(binding.decoration),
  });
  const intervalContributions = engine
    .explainRange([intervalPeriod], intervalBindings)
    .get(cellKey(intervalPeriod.kind, intervalPeriod.anchor.toAnchor()));
  if (!intervalContributions || intervalContributions.length === 0) continue;

  out.push({
    kind: "interval",
    period: intervalPeriod,
    journalName: name,
    isEntry: false,
    attribution: attributeCell(intervalContributions),
    styles: intervalContributions.map((contribution) => contribution.style),
  });
}
```

`includeCalendar: false` is deliberate: vault-wide and shelf decorations paint day cells only (`engine.ts`, `period.kind !== "day"` guard applies to the _calendar_ grid), so admitting them here would attribute a vault-wide rule to an interval it never decorates.

Inject `CycleService` and `TimelineService` alongside the existing services, and import `periodForJournal` and `hasOffsetCondition`.

- [ ] **Step 6: Render the heading**

The existing heading keys off `cell.period.kind`, which is `"day"` for an interval and would mislabel it. Branch on `cell.kind`: fixed cells keep `m.decoration_breakdown_cell_heading({ kind, label })`; interval cells use `m.decoration_breakdown_interval_heading({ journal: cell.journalName, label: formatPeriod(cell.period) })`. Everything below the heading — preview, properties, overridden, marks — is unchanged and shared.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm run test -- src/decorations/ui/DecorationBreakdownModal.test.ts`

Expected: PASS.

- [ ] **Step 8: Prove the separation is load-bearing**

Temporarily merge the interval pass into the single `explainRange` call from Step 5 (one call over both period lists with one filter). Confirm the "highlights only the day section" test and one of the offset tests fail, then restore. Without this check, a future refactor collapsing the two passes would look harmless. Record the failure output in your report.

- [ ] **Step 9: Run the full gates**

Run: `npm run test && npm run check:types && npm run check:lint`

Expected: all PASS, with the lint warning count unchanged from its baseline.

- [ ] **Step 10: Commit**

```bash
git add src/decorations messages/en.json
git commit -m "feat(decorations): show custom-interval cells in the breakdown modal"
```

---

## Self-Review

**Spec coverage**

| Spec section                                                 | Task                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| `DecorationSource` / `Contribution` types                    | Tasks 1 and 2                                         |
| Binding gains its `DecorationOwner`                          | Task 1, Step 3                                        |
| One matcher, two projections                                 | Task 2, Step 3                                        |
| `evaluateRange` keeps its signature                          | Task 2, Step 3                                        |
| Attribution is a pure function over contributions            | Task 3, Step 4                                        |
| Attribution defined against `resolveCell`'s declaration rule | Task 3 — `declaredProperties` plus the agreement test |
| Modal is a `defineModal<void>()` taking an optional `Period` | Task 4, Step 5                                        |
| Only decorated cells produce sections                        | Task 4, Steps 2 and 4                                 |
| Winner, overridden, marks-without-winner                     | Task 4, Steps 2 and 4                                 |
| Shelf selector seeded from the entry point                   | Task 4, Step 4                                        |
| Empty state                                                  | Task 4, Steps 2 and 4                                 |
| No edit jump from the breakdown                              | Not built — deliberate                                |
| Settings button in `DecorationsSection`                      | Task 5                                                |
| No command-palette entry                                     | Not built — deliberate                                |
| No migration                                                 | No task needed                                        |
| Cell reach (`openPathsMenu` refactor)                        | **Plan 2**                                            |
| Match badges                                                 | **Plan 3**                                            |
| A date belongs to six cells, including a custom interval     | Task 6                                                |

**Task 6 was added after Tasks 1-5 shipped.** The final whole-branch review found Task 4 specified none of the design's custom-interval section, leaving a custom journal's non-offset decorations with no surface in the modal at all. Two further design requirements for the modal — the strike-through and per-slot mark listing — were absent from Task 4 for the same reason and were closed in the final fix wave; this one was task-sized. The cause in every case was the plan paraphrasing the design's requirements rather than transcribing them, and it is the most repeated defect across this plan's reviews.

**Deviation from the spec, deliberate:** the spec called for a test that projecting `explainRange` down to styles equals `evaluateRange`. Task 2 implements `evaluateRange` _as_ that projection, which makes such a test a tautology. The agreement test that has teeth is `declaredProperties` versus `resolveCell` (Task 3, Step 1) — two independent implementations of the same declaration rule, which genuinely can diverge.

**Gap the spec did not name:** `gatherDecorations` was a closure inside `useCellDecorations` and had to be extracted for the modal to reach it. That is Task 1.

**Placeholder scan:** Tasks 2, 4 and 5 contain comment-outlined test bodies rather than literal code, each with an explicit instruction to read a named existing file and reuse its harness. This is deliberate — inventing a second harness for `engine.test.ts` or `DecorationsSection.test.ts` would duplicate working test infrastructure, which the repo's conventions forbid. Every other step carries literal code.

**Type consistency:** `DecorationSource`, `Contribution`, `ExclusiveProperty`, `PropertyAttribution`, `CellAttribution`, `GatherOptions`, `gatherBindings`, `sourceOf`, `declaredProperties`, `attributeCell`, `decorationBreakdownModal` are spelled identically at definition and every use. `Placement` and `CellMark` come from `resolve-cell.ts` unchanged. `BORDER_SIDES` already exists in `resolve-cell.ts` from the composition work and is reused by `declaredProperties`.
