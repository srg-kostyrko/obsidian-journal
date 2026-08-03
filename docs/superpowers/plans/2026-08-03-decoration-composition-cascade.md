# Decoration Composition Cascade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four ad-hoc decoration merge rules with one cascade — ten exclusive properties resolved last-wins over a vault-wide → shelf → journal ordering, plus nine additive mark slots.

**Architecture:** `src/decorations/derive-styles.ts` currently exports six functions whose merge rule is implied by the array method each happens to use (`find` = first-wins, an overwriting `for` = last-wins, `filter` = additive). That inconsistency is the bug: a vault-wide decoration's border beats a journal's, the reverse of background and text colour. The six collapse into one `resolveCell` that resolves every property in a single forward pass, and `useCellDecorations.gatherDecorations` reverses so the most specific owner is gathered last. Last-wins then falls out of plain overwriting, and no function encodes a rule of its own.

**Tech Stack:** TypeScript, Vue 3 SFCs, ts-pattern, Vitest, `@testing-library/vue`, WebdriverIO (wdio) for e2e.

Design doc: `docs/superpowers/specs/2026-08-03-decoration-composition-semantics-design.md`

## Global Constraints

- Commands are **npm**, not pnpm: `npm run test`, `npm run check:types`, `npm run check:lint`, `npm run test:e2e`.
- Commit to the **current branch** (`v3-ai`). Never create a new branch.
- Never add a `Co-Authored-By` trailer to a commit message.
- Never use `eslint-disable` comments. Fix the code instead.
- Discriminated-union dispatch uses `ts-pattern` `match().with().exhaustive()`, never `switch`.
- Tests are colocated: `foo.test.ts` sits beside `foo.ts`.
- One behavior per test. Test names describe behavior (subject + verb), never implementation. No "and"/comma-list names.
- Express test scope hierarchy with nested `describe()` blocks, never with dashes or colons in one label.
- Assert observable outcomes, not internal shape. Never assert array position as a proxy for precedence.
- No spec-reference comments in source (`// Satisfies Requirement 3.2` and similar are forbidden).
- Comments explain WHY, never WHAT. No narrative file-header JSDoc.
- `no-non-null-assertion` is ON in production code, OFF in test files.

---

### Task 1: The `resolveCell` resolver

Creates the new module with final last-wins semantics and full unit coverage. Nothing consumes it yet, so application behavior is unchanged and every existing test stays green. A reviewer can reject the semantics here without touching any consumer.

**Files:**

- Create: `src/decorations/resolve-cell.ts`
- Create: `src/decorations/resolve-cell.test.ts`

**Interfaces:**

- Consumes: `colorToString` from `src/decorations/ui/color.ts`; `BorderSide`, `JournalDecorationBorder`, `JournalDecorationCorner`, `JournalDecorationIcon`, `JournalDecorationShape`, `JournalDecorationStyle` from `src/decorations/config.ts`; `buildStyle` from `src/decorations/testing.ts`.
- Produces:
  - `type Placement = "left_top" | "left_middle" | "left_bottom" | "center_top" | "center_middle" | "center_bottom" | "right_top" | "right_middle" | "right_bottom"`
  - `type CellMark = JournalDecorationShape | JournalDecorationIcon`
  - `interface CellBorder { readonly top: string; readonly right: string; readonly bottom: string; readonly left: string }`
  - `interface PaddingExtents { top, right, bottom, left, topBorder, rightBorder, bottomBorder, leftBorder: number }`
  - `interface ResolvedCell { background: string; textColor: string; border: CellBorder; corners: readonly JournalDecorationCorner[]; marks: Readonly<Record<Placement, readonly CellMark[]>>; padding: PaddingExtents }`
  - `function resolveCell(styles: readonly JournalDecorationStyle[]): ResolvedCell`
  - `function formatPadding(extents: PaddingExtents): string`
  - `function mergePadding(all: Iterable<PaddingExtents>): PaddingExtents`

- [ ] **Step 1: Write the failing test**

Create `src/decorations/resolve-cell.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { formatPadding, mergePadding, resolveCell } from "./resolve-cell";
import { buildStyle } from "./testing";

describe("resolveCell", () => {
  describe("background", () => {
    it("inherits when no background style is present", () => {
      expect(resolveCell([]).background).toBe("inherit");
    });

    it("takes the last background declaration", () => {
      const earlier = buildStyle("background", { color: { type: "custom", color: "#aaaaaa" } });
      const later = buildStyle("background", { color: { type: "custom", color: "#bbbbbb" } });
      expect(resolveCell([earlier, later]).background).toBe("#bbbbbb");
    });

    it("clears an earlier background when a later one is transparent", () => {
      const opaque = buildStyle("background", { color: { type: "custom", color: "#aaaaaa" } });
      const cleared = buildStyle("background", { color: { type: "transparent" } });
      expect(resolveCell([opaque, cleared]).background).toBe("transparent");
    });
  });

  describe("text color", () => {
    it("inherits when no color style is present", () => {
      expect(resolveCell([]).textColor).toBe("inherit");
    });

    it("takes the last color declaration", () => {
      const earlier = buildStyle("color", { color: { type: "custom", color: "#a1a1a1" } });
      const later = buildStyle("color", { color: { type: "custom", color: "#b2b2b2" } });
      expect(resolveCell([earlier, later]).textColor).toBe("#b2b2b2");
    });
  });

  describe("border", () => {
    it("leaves every side unset when no border style is present", () => {
      expect(resolveCell([]).border).toEqual({ top: "none", right: "none", bottom: "none", left: "none" });
    });

    it("declares all four sides from a uniform border", () => {
      const border = buildStyle("border", {
        border: "uniform",
        left: { show: true, width: 2, style: "solid", color: { type: "custom", color: "#000000" } },
      });
      expect(resolveCell([border]).border).toEqual({
        top: "2px solid #000000",
        right: "2px solid #000000",
        bottom: "2px solid #000000",
        left: "2px solid #000000",
      });
    });

    it("declares only the shown sides in per-side mode", () => {
      const border = buildStyle("border", {
        border: "different",
        left: { show: true, width: 1, style: "solid", color: { type: "custom", color: "#ff0000" } },
        right: { show: false, width: 0, style: "solid", color: { type: "transparent" } },
        top: { show: true, width: 3, style: "dashed", color: { type: "custom", color: "#00ff00" } },
        bottom: { show: false, width: 0, style: "solid", color: { type: "transparent" } },
      });
      expect(resolveCell([border]).border).toEqual({
        top: "3px dashed #00ff00",
        right: "none",
        bottom: "none",
        left: "1px solid #ff0000",
      });
    });

    it("replaces a side with a later shown declaration of that side", () => {
      const earlier = buildStyle("border", {
        border: "different",
        top: { show: true, width: 1, style: "solid", color: { type: "custom", color: "#ff0000" } },
      });
      const later = buildStyle("border", {
        border: "different",
        top: { show: true, width: 2, style: "solid", color: { type: "custom", color: "#00ff00" } },
      });
      expect(resolveCell([earlier, later]).border.top).toBe("2px solid #00ff00");
    });

    it("keeps a side when a later declaration hides that side", () => {
      const earlier = buildStyle("border", {
        border: "different",
        top: { show: true, width: 1, style: "solid", color: { type: "custom", color: "#ff0000" } },
      });
      const abstaining = buildStyle("border", {
        border: "different",
        top: { show: false, width: 5, style: "solid", color: { type: "custom", color: "#00ff00" } },
      });
      expect(resolveCell([earlier, abstaining]).border.top).toBe("1px solid #ff0000");
    });
  });

  describe("corners", () => {
    it("keeps only the last corner at a placement", () => {
      const earlier = buildStyle("corner", { placement: "top-left", color: { type: "custom", color: "#aa0000" } });
      const later = buildStyle("corner", { placement: "top-left", color: { type: "custom", color: "#00aa00" } });
      expect(resolveCell([earlier, later]).corners).toEqual([later]);
    });

    it("keeps corners that sit at different placements", () => {
      const topLeft = buildStyle("corner", { placement: "top-left" });
      const bottomRight = buildStyle("corner", { placement: "bottom-right" });
      expect(resolveCell([topLeft, bottomRight]).corners).toEqual([topLeft, bottomRight]);
    });
  });

  describe("marks", () => {
    it("groups a shape into the slot named by its placement", () => {
      const shape = buildStyle("shape", { placement_x: "left", placement_y: "top" });
      expect(resolveCell([shape]).marks.left_top).toEqual([shape]);
    });

    it("groups an icon into the slot named by its placement", () => {
      const icon = buildStyle("icon", { placement_x: "right", placement_y: "bottom" });
      expect(resolveCell([icon]).marks.right_bottom).toEqual([icon]);
    });

    it("leaves a slot no mark names empty", () => {
      const shape = buildStyle("shape", { placement_x: "left", placement_y: "top" });
      expect(resolveCell([shape]).marks.center_middle).toEqual([]);
    });

    it("keeps every mark sharing a slot in cascade order", () => {
      const earlier = buildStyle("shape", { placement_x: "center", placement_y: "bottom", size: 0.3 });
      const later = buildStyle("shape", { placement_x: "center", placement_y: "bottom", size: 0.5 });
      expect(resolveCell([earlier, later]).marks.center_bottom).toEqual([earlier, later]);
    });
  });

  describe("padding", () => {
    it("reserves a shape's size on its placement side", () => {
      const shape = buildStyle("shape", { size: 0.6, placement_y: "top", placement_x: "center" });
      expect(formatPadding(resolveCell([shape]).padding)).toMatch(/max\(0\.7em, 2px\)/);
    });

    it("reserves a uniform border's left width on all four sides", () => {
      const wide = { show: true, width: 99, style: "solid", color: { type: "custom" as const, color: "#000000" } };
      const border = buildStyle("border", {
        border: "uniform",
        left: { show: true, width: 4, style: "solid", color: { type: "custom", color: "#000000" } },
        right: wide,
        top: wide,
        bottom: wide,
      });
      const padding = formatPadding(resolveCell([border]).padding);
      expect(padding.split("max(0.1em, 6px)").length - 1).toBe(4);
    });
  });
});

describe("mergePadding", () => {
  it("takes the per-side maximum reservation across cells", () => {
    const bottomShape = buildStyle("shape", { size: 0.4, placement_y: "bottom", placement_x: "center" });
    const topShape = buildStyle("shape", { size: 0.6, placement_y: "top", placement_x: "center" });
    const padding = formatPadding(mergePadding([resolveCell([bottomShape]).padding, resolveCell([topShape]).padding]));
    expect(padding).toMatch(/max\(0\.7em, 2px\)/);
    expect(padding).toMatch(/max\(0\.5em, 2px\)/);
  });

  it("reserves the base extents when no cell is decorated", () => {
    expect(formatPadding(mergePadding([]))).toBe(formatPadding(resolveCell([]).padding));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/decorations/resolve-cell.test.ts`

Expected: FAIL — `Failed to resolve import "./resolve-cell"`. The module does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/decorations/resolve-cell.ts`:

```ts
import { match } from "ts-pattern";

import { colorToString } from "./ui/color";

import type {
  BorderSide,
  JournalDecorationBorder,
  JournalDecorationCorner,
  JournalDecorationIcon,
  JournalDecorationShape,
  JournalDecorationStyle,
} from "./config";

export type Placement =
  | "left_top"
  | "left_middle"
  | "left_bottom"
  | "center_top"
  | "center_middle"
  | "center_bottom"
  | "right_top"
  | "right_middle"
  | "right_bottom";

export type CellMark = JournalDecorationShape | JournalDecorationIcon;

export interface CellBorder {
  readonly top: string;
  readonly right: string;
  readonly bottom: string;
  readonly left: string;
}

export interface PaddingExtents {
  top: number;
  right: number;
  bottom: number;
  left: number;
  topBorder: number;
  rightBorder: number;
  bottomBorder: number;
  leftBorder: number;
}

export interface ResolvedCell {
  readonly background: string;
  readonly textColor: string;
  readonly border: CellBorder;
  readonly corners: readonly JournalDecorationCorner[];
  readonly marks: Readonly<Record<Placement, readonly CellMark[]>>;
  readonly padding: PaddingExtents;
}

type BorderSideName = keyof CellBorder;

const BORDER_SIDES: readonly BorderSideName[] = ["top", "right", "bottom", "left"];

function emptyMarks(): Record<Placement, CellMark[]> {
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

function zeroExtents(): PaddingExtents {
  return {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    topBorder: 0,
    rightBorder: 0,
    bottomBorder: 0,
    leftBorder: 0,
  };
}

// A hidden side abstains from the cascade rather than clearing it: a decoration that paints
// only a left accent must leave another decoration's top accent standing.
function sideString(side: BorderSide): string {
  if (!side.show) return "none";
  return `${side.width}px ${side.style} ${colorToString(side.color)}`;
}

function applyBorder(
  border: Record<BorderSideName, string>,
  padding: PaddingExtents,
  style: JournalDecorationBorder,
): void {
  if (style.border === "uniform") {
    const uniform = sideString(style.left);
    if (uniform !== "none") {
      for (const side of BORDER_SIDES) border[side] = uniform;
    }
    const width = style.left.width;
    padding.topBorder = Math.max(padding.topBorder, width);
    padding.rightBorder = Math.max(padding.rightBorder, width);
    padding.bottomBorder = Math.max(padding.bottomBorder, width);
    padding.leftBorder = Math.max(padding.leftBorder, width);
    return;
  }
  for (const side of BORDER_SIDES) {
    const resolved = sideString(style[side]);
    if (resolved !== "none") border[side] = resolved;
  }
  padding.topBorder = Math.max(padding.topBorder, style.top.width);
  padding.rightBorder = Math.max(padding.rightBorder, style.right.width);
  padding.bottomBorder = Math.max(padding.bottomBorder, style.bottom.width);
  padding.leftBorder = Math.max(padding.leftBorder, style.left.width);
}

function applyMarkPadding(padding: PaddingExtents, mark: CellMark): void {
  const { size } = mark;
  if (mark.placement_y === "top") padding.top = Math.max(padding.top, size);
  else if (mark.placement_y === "bottom") padding.bottom = Math.max(padding.bottom, size);
  if (mark.placement_x === "left") padding.left = Math.max(padding.left, size);
  else if (mark.placement_x === "right") padding.right = Math.max(padding.right, size);
}

// The cascade: decorations arrive vault-wide first and journal last, so plain overwriting
// resolves every exclusive property to its most specific declaration.
export function resolveCell(styles: readonly JournalDecorationStyle[]): ResolvedCell {
  let background = "inherit";
  let textColor = "inherit";
  const border: Record<BorderSideName, string> = { top: "none", right: "none", bottom: "none", left: "none" };
  const corners = new Map<JournalDecorationCorner["placement"], JournalDecorationCorner>();
  const marks = emptyMarks();
  const padding = zeroExtents();

  for (const style of styles) {
    match(style)
      .with({ type: "background" }, (s) => {
        background = colorToString(s.color);
      })
      .with({ type: "color" }, (s) => {
        textColor = colorToString(s.color);
      })
      .with({ type: "border" }, (s) => {
        applyBorder(border, padding, s);
      })
      .with({ type: "corner" }, (s) => {
        corners.set(s.placement, s);
      })
      .with({ type: "shape" }, { type: "icon" }, (s) => {
        marks[`${s.placement_x}_${s.placement_y}`].push(s);
        applyMarkPadding(padding, s);
      })
      .exhaustive();
  }

  return { background, textColor, border, corners: [...corners.values()], marks, padding };
}

export function formatPadding(extents: PaddingExtents): string {
  return `max(${extents.top + 0.1}em, ${extents.topBorder + 2}px) max(${extents.right + 0.1}em, ${extents.rightBorder + 2}px) max(${extents.bottom + 0.1}em, ${extents.bottomBorder + 2}px) max(${extents.left + 0.1}em, ${extents.leftBorder + 2}px)`;
}

// Reserve the same padding on every cell — the per-side maximum across all cells — so a
// decoration on one cell shifts its content identically to its siblings instead of
// inflating only its own grid row (the v2 calendar kept rows aligned via fixed row height).
export function mergePadding(all: Iterable<PaddingExtents>): PaddingExtents {
  const merged = zeroExtents();
  for (const extents of all) {
    merged.top = Math.max(merged.top, extents.top);
    merged.right = Math.max(merged.right, extents.right);
    merged.bottom = Math.max(merged.bottom, extents.bottom);
    merged.left = Math.max(merged.left, extents.left);
    merged.topBorder = Math.max(merged.topBorder, extents.topBorder);
    merged.rightBorder = Math.max(merged.rightBorder, extents.rightBorder);
    merged.bottomBorder = Math.max(merged.bottomBorder, extents.bottomBorder);
    merged.leftBorder = Math.max(merged.leftBorder, extents.leftBorder);
  }
  return merged;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/decorations/resolve-cell.test.ts`

Expected: PASS — 18 tests.

- [ ] **Step 5: Verify nothing else regressed**

Run: `npm run test && npm run check:types && npm run check:lint`

Expected: all PASS. `derive-styles.ts` is still in place and still used, so no behavior has changed.

- [ ] **Step 6: Commit**

```bash
git add src/decorations/resolve-cell.ts src/decorations/resolve-cell.test.ts
git commit -m "feat(decorations): add resolveCell with last-wins cascade semantics"
```

---

### Task 2: Switch the cascade over

Reverses the gather order and moves all three consumers onto `resolveCell` in one commit. These cannot be separated: last-wins with the _old_ gather order would make vault-wide decorations beat journal ones, which is a wrong intermediate state. `derive-styles.ts` is deleted here because nothing references it afterward.

**Files:**

- Modify: `src/decorations/use-cell-decorations.ts:9` (import), `:50-73` (`gatherDecorations`), `:147-151` (shared padding)
- Modify: `src/decorations/ui/CellDecoration.vue:1-57`
- Modify: `src/decorations/ui/DecorationPreview.vue:1-45`
- Modify: `src/decorations/use-cell-decorations.test.ts` (two precedence tests rewritten, one added)
- Modify: `CHANGELOG.md` (`### Bug Fixes` under `## [Unreleased]`)
- Delete: `src/decorations/derive-styles.ts`, `src/decorations/derive-styles.test.ts`

**Interfaces:**

- Consumes: `resolveCell`, `formatPadding`, `mergePadding` from Task 1.
- Produces: no new exports. `derive-styles.ts` and its six exports (`backgroundFrom`, `textColorFrom`, `borderStylesFrom`, `paddingFrom`, `paddingFromAll`, `placedFrom`, `cornersFrom`) cease to exist. They are not re-exported from `src/decorations/index.ts`, so no barrel change is needed.

- [ ] **Step 1: Write the failing tests**

In `src/decorations/use-cell-decorations.test.ts`, add the resolver import beside the existing `./testing` import:

```ts
import { resolveCell } from "./resolve-cell";
```

Replace the test currently named `"orders a journal's styles ahead of a vault-wide decoration's"` (around line 433) in full with:

```ts
it("resolves a journal's background over a vault-wide decoration's", async () => {
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

  expect(resolveCell(cells.get(key(period))?.value ?? []).background).toBe("#111111");
});

it("resolves a journal's border over a vault-wide decoration's", async () => {
  const journalBorder = buildStyle("border", {
    border: "uniform",
    left: { show: true, width: 2, style: "solid", color: { type: "custom", color: "#111111" } },
  });
  const globalBorder = buildStyle("border", {
    border: "uniform",
    left: { show: true, width: 2, style: "solid", color: { type: "custom", color: "#222222" } },
  });
  const journalDecoration = buildDecoration({
    mode: "or",
    conditions: [buildCondition("weekday", { weekdays: [1] })],
    styles: [journalBorder],
  });
  const { c, store } = buildHarness([journalDecoration]);
  store.save({ kind: "global" }, [
    buildCalendarDecoration({
      mode: "or",
      conditions: [buildCondition("weekday", { weekdays: [1] })],
      styles: [globalBorder],
    }),
  ]);
  const period = DayPeriod.containing(date("2026-05-25"));

  const cells = mountCells(c, [period], ["daily"], { shelf: null });
  await nextTick();

  expect(resolveCell(cells.get(key(period))?.value ?? []).border.top).toBe("2px solid #111111");
});
```

Replace the test currently named `"orders a shelf's styles ahead of a vault-wide decoration's"` (around line 493) in full with:

```ts
it("resolves a shelf's background over a vault-wide decoration's", async () => {
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

  expect(resolveCell(cells.get(key(period))?.value ?? []).background).toBe("#333333");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/decorations/use-cell-decorations.test.ts`

Expected: FAIL — all three. With the gather order still journal-first, `resolveCell` takes the _last_ declaration, which is the vault-wide one:

- `resolves a journal's background over a vault-wide decoration's` → received `"#222222"`, expected `"#111111"`
- `resolves a journal's border over a vault-wide decoration's` → received `"2px solid #222222"`
- `resolves a shelf's background over a vault-wide decoration's` → received `"#444444"`

This is the red state that proves the tests are pinned to precedence, not to array position.

- [ ] **Step 3: Reverse the gather order**

In `src/decorations/use-cell-decorations.ts`, change the import on line 9 from:

```ts
import { paddingFromAll } from "./derive-styles";
```

to:

```ts
import { formatPadding, mergePadding, resolveCell } from "./resolve-cell";
```

Replace the whole `gatherDecorations` function (lines 50-73) with:

```ts
function gatherDecorations(): readonly DecorationBinding[] {
  const out: DecorationBinding[] = [];
  // Vault-wide, then shelf, then journal: resolveCell() takes the last declaration of each
  // exclusive property, so gathering order is what makes the most specific owner win.
  const calendar = options.calendarDecorations;
  if (calendar && store) {
    for (const decoration of store.calendarList({ kind: "global" })) {
      out.push({ kind: "calendar", decoration });
    }
    const shelfName = toValue(calendar.shelf);
    if (shelfName !== null) {
      for (const decoration of store.calendarList({ kind: "shelf", shelfName })) {
        out.push({ kind: "calendar", decoration });
      }
    }
  }
  for (const name of toValue(options.journalNames)) {
    const opt = journals.get(name);
    if (opt.isNone()) continue;
    for (const decoration of opt.value.decorations) {
      const binding = { kind: "journal", journalName: name, decoration } as const;
      if (filter(binding)) out.push(binding);
    }
  }
  return out;
}
```

Replace the `sharedPadding` body (line 149) so it reads:

```ts
return formatPadding(mergePadding(Array.from(cells.values(), (slot) => resolveCell(slot.value).padding)));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/decorations/use-cell-decorations.test.ts`

Expected: PASS — all three precedence tests now resolve to the more specific owner.

- [ ] **Step 5: Move `CellDecoration.vue` onto the resolver**

In `src/decorations/ui/CellDecoration.vue`, replace the `<script setup>` block (lines 1-38) with:

```vue
<script setup lang="ts">
import { computed, inject } from "vue";

import type { Period } from "@/calendar";

import { cellKey } from "../engine";
import { formatPadding, resolveCell } from "../resolve-cell";

import { CellDecorationMapKey, CellPaddingKey, type CellDecorationScope } from "./cell-decoration-map-key";
import DecorationCorner from "./DecorationCorner.vue";
import DecorationIcon from "./DecorationIcon.vue";
import DecorationShape from "./DecorationShape.vue";

import type { JournalDecorationStyle } from "../config";

const props = defineProps<{ period: Period; scope?: CellDecorationScope }>();
const cells = inject(props.scope?.map ?? CellDecorationMapKey, null);
const sharedPadding = inject(props.scope?.padding ?? CellPaddingKey, null);

const styles = computed<readonly JournalDecorationStyle[]>(
  () => cells?.get(cellKey(props.period.kind, props.period.anchor.toAnchor()))?.value ?? [],
);

const cell = computed(() => resolveCell(styles.value));
// Named separately because `v-bind()` in the scoped style block resolves setup bindings by name.
const background = computed(() => cell.value.background);
const textColor = computed(() => cell.value.textColor);
// Within a decorated grid every cell shares one reservation so a single decoration never
// inflates only its own row; standalone use (e.g. previews) falls back to its own styles.
const padding = computed(() => sharedPadding?.value ?? formatPadding(cell.value.padding));
</script>
```

Replace the `<template>` block (lines 40-57) with:

```vue
<template>
  <span class="cell-decoration" data-testid="cell-decoration">
    <span
      class="cell-decoration__border"
      :style="{
        borderTop: cell.border.top,
        borderRight: cell.border.right,
        borderBottom: cell.border.bottom,
        borderLeft: cell.border.left,
      }"
    />
    <DecorationCorner v-for="(corner, i) in cell.corners" :key="i" :decoration="corner" />
    <span class="cell-decoration__placed">
      <template v-for="(group, key) in cell.marks" :key="key">
        <span v-if="group.length > 0" :class="`place place-${key}`">
          <template v-for="(d, i) in group" :key="i">
            <DecorationIcon v-if="d.type === 'icon'" :decoration="d" />
            <DecorationShape v-else :decoration="d" />
          </template>
        </span>
      </template>
    </span>
    <span class="cell-decoration__content"><slot /></span>
  </span>
</template>
```

Leave the `<style scoped>` block untouched — it references `padding`, `background`, and `textColor` by name and those bindings still exist.

- [ ] **Step 6: Move `DecorationPreview.vue` onto the resolver**

In `src/decorations/ui/DecorationPreview.vue`, replace the `<script setup>` block (lines 1-27) with:

```vue
<script setup lang="ts">
import { computed } from "vue";

import { formatPadding, resolveCell } from "../resolve-cell";

import DecorationCorner from "./DecorationCorner.vue";
import DecorationIcon from "./DecorationIcon.vue";
import DecorationShape from "./DecorationShape.vue";

import type { JournalDecorationStyle } from "../config";

const props = defineProps<{ styles: readonly JournalDecorationStyle[] }>();

const cell = computed(() => resolveCell(props.styles));
// Named separately because `v-bind()` in the scoped style block resolves setup bindings by name.
const background = computed(() => cell.value.background);
const textColor = computed(() => cell.value.textColor);
const padding = computed(() => formatPadding(cell.value.padding));
</script>
```

Replace the `<template>` block (lines 29-45) with:

```vue
<template>
  <span class="decoration-preview" data-testid="decoration-preview">
    <span
      class="decoration-preview__border"
      :style="{
        borderTop: cell.border.top,
        borderRight: cell.border.right,
        borderBottom: cell.border.bottom,
        borderLeft: cell.border.left,
      }"
    />
    <DecorationCorner v-for="(corner, i) in cell.corners" :key="i" :decoration="corner" />
    <span class="decoration-preview__placed">
      <template v-for="(group, key) in cell.marks" :key="key">
        <span v-if="group.length > 0" :class="`place place-${key}`">
          <template v-for="(d, i) in group" :key="i">
            <DecorationIcon v-if="d.type === 'icon'" :decoration="d" />
            <DecorationShape v-else :decoration="d" />
          </template>
        </span>
      </template>
    </span>
    <span class="decoration-preview__content"><slot /></span>
  </span>
</template>
```

Leave the `<style scoped>` block untouched.

- [ ] **Step 7: Delete the superseded module**

```bash
git rm src/decorations/derive-styles.ts src/decorations/derive-styles.test.ts
```

- [ ] **Step 8: Run the full gates**

Run: `npm run test && npm run check:types && npm run check:lint`

Expected: all PASS. If `check:types` reports an unresolved `../derive-styles` import, a consumer was missed — `grep -rn "derive-styles" src` must return nothing.

- [ ] **Step 9: Record the fix in the changelog**

In `CHANGELOG.md`, under `## [Unreleased]` → `### Bug Fixes`, append:

```markdown
- Decorations now layer predictably: a journal's decoration overrides a shelf's, which overrides a vault-wide one. Previously borders resolved the opposite way, so a vault-wide border silently replaced a journal's.
```

- [ ] **Step 10: Commit**

```bash
git add -A src/decorations CHANGELOG.md
git commit -m "fix(decorations): resolve cell styles through one last-wins cascade

Borders resolved with the opposite precedence to background and text color,
so a vault-wide decoration's border replaced a journal's. Gathering now runs
vault-wide to journal and every exclusive property takes its last declaration."
```

---

### Task 3: End-to-end precedence coverage

`e2e/journeys/decorations.ts` asserts each style type rendering in isolation and nothing about interaction, which is why the border bug survived a full suite. This adds one journey that fails under the old rule.

**Files:**

- Modify: `e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json`
- Modify: `e2e/journeys/decorations.ts:12-37` (`STYLE_HEX`, `DECO_DAY`)
- Modify: `e2e/journeys/view.e2e.ts:30-42` (import list), and the `describe("decorations")` block around line 188

**Interfaces:**

- Consumes: `expectBorderTop`, `dayAnchor`, `STYLE_HEX`, `DECO_DAY` from `e2e/journeys/decorations.ts`; `calendar` from `e2e/journeys/view.ts`.
- Produces: `STYLE_HEX.precedenceJournal`, `STYLE_HEX.precedenceGlobal`, `DECO_DAY.precedence`.

- [ ] **Step 1: Add the fixture decorations**

In `e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json`, append this object to the **top-level** `decorations.decorations` array (the array that already holds the day-3 background decoration):

```json
{
  "mode": "and",
  "conditions": [{ "type": "date", "day": 8, "month": -1, "year": null }],
  "styles": [
    {
      "type": "border",
      "border": "uniform",
      "left": { "show": true, "width": 3, "style": "solid", "color": { "type": "custom", "color": "#c04040" } },
      "right": { "show": true, "width": 3, "style": "solid", "color": { "type": "custom", "color": "#c04040" } },
      "top": { "show": true, "width": 3, "style": "solid", "color": { "type": "custom", "color": "#c04040" } },
      "bottom": { "show": true, "width": 3, "style": "solid", "color": { "type": "custom", "color": "#c04040" } }
    }
  ]
}
```

Append this object to `journals.daily.decorations`:

```json
{
  "mode": "and",
  "conditions": [{ "type": "date", "day": 8, "month": -1, "year": null }],
  "styles": [
    {
      "type": "border",
      "border": "uniform",
      "left": { "show": true, "width": 3, "style": "solid", "color": { "type": "custom", "color": "#40c040" } },
      "right": { "show": true, "width": 3, "style": "solid", "color": { "type": "custom", "color": "#40c040" } },
      "top": { "show": true, "width": 3, "style": "solid", "color": { "type": "custom", "color": "#40c040" } },
      "bottom": { "show": true, "width": 3, "style": "solid", "color": { "type": "custom", "color": "#40c040" } }
    }
  ]
}
```

Both use a `date` condition, so neither needs a seeded note. Day 8 is unclaimed — `DECO_DAY` uses 2, 3, 5, 6, 7, 10, 13, 16, 19, 22, 25, 28, and the date-condition test owns day 4. Both widths are 3 so the rendered width is identical either way and the **colour is the only discriminator**.

- [ ] **Step 2: Declare the fixture values**

In `e2e/journeys/decorations.ts`, add two entries to `STYLE_HEX` (after `global`):

```ts
  precedenceJournal: "#40c040",
  precedenceGlobal: "#c04040",
```

Add one entry to `DECO_DAY` (after `global`):

```ts
  precedence: 8,
```

Leave the existing comment above `STYLE_HEX` in place — these values also must match the fixture.

- [ ] **Step 3: Write the failing journey**

In `e2e/journeys/view.e2e.ts`, add `expectBorderTop` to the existing import from `./decorations.js`, keeping the list alphabetical:

```ts
import {
  DECO_DAY,
  STYLE_HEX,
  assertDecorationMatrix,
  dayAnchor,
  expectBackgroundCleared,
  expectBackgroundHex,
  expectBorderTop,
  expectDecorated,
  expectTextHex,
  expectUndecorated,
  note,
  seedDecorationFixture,
} from "./decorations.js";
```

Inside `describe("decorations")`, immediately after the existing `it("paints a day cell from a vault-wide decoration with no journal", ...)`, add:

```ts
it("paints a journal's border over a vault-wide decoration's on the same day", async () => {
  await expectBorderTop(calendar.cell(dayAnchor(DECO_DAY.precedence)), "3px", STYLE_HEX.precedenceJournal);
});
```

- [ ] **Step 4: Run the journey to verify it passes on the fixed code**

Run: `npm run test:e2e`

Expected: PASS, including the new journey. The nav-template integration failure (10 of 11) is a known pre-existing baseline and is unrelated.

Some existing journeys may show **mark-order churn** where a fixture places several marks in one slot — the cascade reversal changes their left-to-right order. That is expected under this design. Confirm any such change is ordering-only by comparing against a worktree at the base commit; do **not** use `git stash` for this.

- [ ] **Step 5: Prove the journey actually diverges**

This journey is worthless if it passes with the bug present. Verify it fails against the old rule:

```bash
git stash push -- src/decorations/use-cell-decorations.ts
npm run test:e2e -- --spec e2e/journeys/view.e2e.ts
git stash pop
```

Expected: FAIL with `waited for cell border-top 3px #40c040` — the cell renders `#c04040`, the vault-wide colour, because the gather order is back to journal-first.

(`git stash` is acceptable here because it is a deliberate single-file revert being immediately restored, not a baseline comparison.)

- [ ] **Step 6: Commit**

```bash
git add e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json e2e/journeys/decorations.ts e2e/journeys/view.e2e.ts
git commit -m "test(e2e): cover journal-over-vault-wide border precedence"
```

---

## Self-Review

**Spec coverage**

| Spec section                                            | Task                                                                                                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| The cascade — vault-wide → shelf → journal ordering     | Task 2, Step 3                                                                                                                                 |
| Sibling journals cascade in `journalNames` order        | Task 2, Step 3 (journal loop preserved verbatim)                                                                                               |
| Ten exclusive properties, last wins                     | Task 1, Step 3 (`resolveCell`)                                                                                                                 |
| Border side `show: false` abstains                      | Task 1 (`sideString` + test "keeps a side when a later declaration hides that side")                                                           |
| `transparent` is a value, not an abstention             | Task 1 (test "clears an earlier background when a later one is transparent")                                                                   |
| Corners exclusive per placement                         | Task 1 (`corners` Map + two corner tests)                                                                                                      |
| Nine additive mark slots, cascade order                 | Task 1 (test "keeps every mark sharing a slot in cascade order")                                                                               |
| Padding derived, per-side then per-grid max             | Task 1 (`applyBorder`/`applyMarkPadding`, `mergePadding`)                                                                                      |
| `resolveCell` / `formatPadding` / `mergePadding` API    | Task 1, Step 3                                                                                                                                 |
| `derive-styles.ts` → `resolve-cell.ts`                  | Tasks 1 and 2 (create, then delete)                                                                                                            |
| Two components drop to one computed                     | Task 2, Steps 5-6                                                                                                                              |
| `PaddingExtents` exported                               | Task 1, Step 3                                                                                                                                 |
| `resolveCell` carries no provenance                     | Task 1 — signature takes a bare style array                                                                                                    |
| Existing precedence tests renamed and re-pointed        | Task 2, Step 1                                                                                                                                 |
| `derive-styles.test.ts` ports to `resolve-cell.test.ts` | Task 1, Step 1 (all seven original cases carried over)                                                                                         |
| New unit coverage, eight behaviors                      | Task 1, Step 1                                                                                                                                 |
| Cascade coverage, three boundaries                      | Task 2, Step 1 produced journal-over-vault-wide twice and never journal-over-shelf; caught in review and closed by a later commit (`e87239b7`) |
| One e2e journey, diverging colours                      | Task 3                                                                                                                                         |
| No migration                                            | No task needed — read-side only                                                                                                                |
| `CHANGELOG.md` Fixed entry                              | Task 2, Step 9                                                                                                                                 |
| Gates: test, check:types, check:lint, test:e2e          | Task 1 Step 5, Task 2 Step 8, Task 3 Step 4                                                                                                    |

One gap: Task 2's task text omitted the journal-over-shelf boundary the design doc requires, leaving journal-over-vault-wide covered twice instead. It was caught in review and closed by a later commit rather than by the plan as written.

**Placeholder scan:** No TBD/TODO, no "add error handling", no "similar to Task N". Every code step carries the literal content.

**Type consistency:** `resolveCell`, `formatPadding`, `mergePadding`, `PaddingExtents`, `CellBorder`, `CellMark`, `Placement`, `ResolvedCell` are spelled identically in Task 1's definition and Tasks 2-3's uses. `cell.border.top` in the components matches `CellBorder.top`. `cell.marks` matches `ResolvedCell.marks`. `cell.corners` matches `ResolvedCell.corners`. `STYLE_HEX.precedenceJournal` and `DECO_DAY.precedence` are declared in Task 3 Step 2 before use in Step 3.
