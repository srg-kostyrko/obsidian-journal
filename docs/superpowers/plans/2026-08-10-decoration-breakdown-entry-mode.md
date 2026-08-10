# Decoration Breakdown Entry Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `DecorationBreakdownModal` into a static one-cell readout for the cell context menu and the existing date explorer for settings, so right-clicking a day cell no longer lists week and month cells that cannot influence it.

**Architecture:** Extract the section renderer both screens share, add a `BreakdownEntry` descriptor that distinguishes a fixed cell from a custom-interval row (a `Period` alone cannot — they collide on kind + anchor), introduce `decorationCellModal` that resolves exactly one cell, repoint the context menu at it, then strip the now-dead entry-point machinery from the explorer.

**Tech Stack:** Vue 3 SFCs with `<script setup>`, TypeScript, vitest + @testing-library/vue + @testing-library/user-event, ts-pattern for discriminated-union dispatch, paraglide for i18n.

**Spec:** `docs/superpowers/specs/2026-08-10-decoration-breakdown-entry-mode-design.md`

## Global Constraints

- Commit to the current branch (`v3-ai`). Never create a branch. Never add a `Co-Authored-By` trailer.
- Quality gates after every task: `npm test`, `npm run check:types`, `npm run check:lint`. All three must be clean (lint reports pre-existing warnings; zero **errors** is the bar).
- `e2e/journeys` baseline is **29/30** — `dynamic-commands.e2e.ts` › "notices when an unlisted command is invoked outside the palette" fails pre-existing. Do not treat it as a regression.
- Never use `eslint-disable` comments. Fix the code.
- `defineModal()` is only allowed in `<feature>/ui/modals.ts` — eslint enforces this (`eslint.config.mjs:163`).
- `defineModal` is curried: `defineModal<TResult>()({ component, title, width })`. `TResult` defaults to `void`; **props are inferred from `title`'s parameter type**.
- Only WHY-comments. No comments that restate what the code does.
- One behaviour per test. Test names are subject + verb, no "and"/comma lists.
- Component tests use `@testing-library/vue` + `user-event`. No `@vue/test-utils`, no CSS-class queries, no test-only `data-*` attributes.
- Inline `defineProps<{...}>()` in SFCs — no named `XxxProps` interface.
- New i18n strings go in `messages/en.json`, then `npm run compile:i18n`. **Never stage `src/i18n/paraglide`** — it is generated and git-ignored.
- New copy follows `docs/2026-07-13-ux-text-audit.md` §A: sentence case, en-US.
- `src/decorations/index.ts` is the public barrel — export only public API from it.

---

## File Structure

**Created**

| File                                                    | Responsibility                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/decorations/ui/breakdown-cell.ts`                  | `BreakdownCell` union + `formatPeriod` / `PERIOD_FORMAT`, shared by both modals |
| `src/decorations/ui/breakdown-entry.ts`                 | `BreakdownEntry` union — what the context menu hands the cell modal             |
| `src/decorations/ui/DecorationBreakdownSection.vue`     | Renders one cell: heading, preview, properties, marks                           |
| `src/decorations/ui/DecorationBreakdownSection.test.ts` | The five renderer behaviours                                                    |
| `src/decorations/ui/DecorationCellModal.vue`            | Static readout of exactly one cell                                              |
| `src/decorations/ui/DecorationCellModal.test.ts`        | Cell-readout behaviours                                                         |

**Modified**

| File                                                              | Change                                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `src/decorations/ui/DecorationBreakdownModal.vue`                 | Delegates to the section; later loses `period` and all entry-point state |
| `src/decorations/ui/DecorationBreakdownModal.test.ts`             | Loses two entry-badge tests and five renderer tests                      |
| `src/decorations/ui/modals.ts`                                    | Gains `decorationCellModal`                                              |
| `src/decorations/ui/use-decoration-menu-item.ts`                  | Takes a `BreakdownEntry`, opens `decorationCellModal`                    |
| `src/decorations/ui/use-decoration-menu-item.test.ts`             | Follows the signature change                                             |
| `src/decorations/index.ts`                                        | Exports `decorationCellModal` and `BreakdownEntry`                       |
| `src/notes-calendar/use-notes-cell.ts`                            | Builds a `fixed` entry                                                   |
| `src/views/toolbar-items/period-buttons/ui/PeriodButtonsItem.vue` | Builds a `fixed` entry                                                   |
| `src/code-blocks/nav/ui/NavBlockRow.vue`                          | Branches `fixed` / `interval` on the journal's write type                |
| `src/code-blocks/nav/ui/NavigationCodeBlock.test.ts`              | Exposes the fake modal service; gains the interval-entry test            |
| `messages/en.json`                                                | `+decoration_breakdown_cell_empty`, `−decoration_breakdown_entry_badge`  |

**A note on `isEntry`.** `BreakdownCell` carries `isEntry` from Task 1 through Task 4 and loses it in Task 5. That is deliberate: the badge must keep working in the explorer until Task 4 moves the context menu off it, and hiding it behind a slot for three tasks would cost more than it saves. Task 5 removes the field, the string, and the CSS together.

---

### Task 1: Extract the section renderer

Pure refactor. No behaviour changes, no test changes — the existing `DecorationBreakdownModal.test.ts` suite is the proof that nothing moved.

**Files:**

- Create: `src/decorations/ui/breakdown-cell.ts`
- Create: `src/decorations/ui/DecorationBreakdownSection.vue`
- Modify: `src/decorations/ui/DecorationBreakdownModal.vue`

**Interfaces:**

- Consumes: `CellAttribution` from `../attribute-cell`; `Contribution`, `DecorationSource` from `../engine`; `JournalDecorationStyle` from `../config`; `Placement` from `../resolve-cell`.
- Produces:
  - `type BreakdownCell` — discriminated on `kind: "fixed" | "interval"` (full definition in Step 1)
  - `function formatPeriod(p: Period): string`
  - `DecorationBreakdownSection.vue` with props `{ cell: BreakdownCell; index: number }`

- [ ] **Step 1: Create the shared cell module**

Create `src/decorations/ui/breakdown-cell.ts`:

```ts
import type { Period, PeriodKind } from "@/calendar";

import type { CellAttribution } from "../attribute-cell";
import type { JournalDecorationStyle } from "../config";

export type BreakdownCell =
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

const PERIOD_FORMAT: Record<PeriodKind, string> = {
  day: "YYYY-MM-DD",
  week: "YYYY-[W]w",
  month: "YYYY-MM",
  quarter: "YYYY-[Q]Q",
  year: "YYYY",
  decade: "YYYY",
};

export function formatPeriod(p: Period): string {
  return p.format(PERIOD_FORMAT[p.kind]);
}
```

- [ ] **Step 2: Create the section component**

Create `src/decorations/ui/DecorationBreakdownSection.vue`. This is a faithful move of lines 210-256 (script helpers) and 274-348 (template) plus the matching styles out of `DecorationBreakdownModal.vue`.

The one change from the original: DOM ids derive from the `index` prop rather than from a `journalIndex` field on the cell. Both are unique per render; the index needs no plumbing through cell construction.

```vue
<script setup lang="ts">
import { match } from "ts-pattern";

import { Calendar } from "@/calendar";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";

import { DecorationsStore } from "../decorations-store";
import { describeCondition } from "../settings/ui/describe-condition";

import { formatPeriod, type BreakdownCell } from "./breakdown-cell";
import DecorationPreview from "./DecorationPreview.vue";

import type { JournalDecoration } from "../config";
import type { CellAttribution } from "../attribute-cell";
import type { Contribution, DecorationSource } from "../engine";
import type { DecorationOwner } from "../owner";
import type { Placement } from "../resolve-cell";

const props = defineProps<{ cell: BreakdownCell; index: number }>();

const store = useService(DecorationsStore);
const calendar = useService(Calendar);

// An interval and the day cell it starts on share a period kind and anchor, so a key derived
// from the period alone would collide. The section's position in this render is unique and,
// unlike a journal name, never needs escaping for `aria-labelledby` (which tokenizes on
// whitespace).
const headingId = `decoration-breakdown-heading-${props.index}`;

// The heading must key off the section's kind, not its period kind: an interval is a "day"-kind
// period at its start anchor, so branching on period.kind would mislabel it as a day cell.
function headingOf(cell: BreakdownCell): string {
  return match(cell)
    .with({ kind: "interval" }, (c) =>
      m.decoration_breakdown_interval_heading({ journal: c.journalName, label: formatPeriod(c.period) }),
    )
    .with({ kind: "fixed" }, (c) =>
      m.decoration_breakdown_cell_heading({ kind: c.period.kind, label: formatPeriod(c.period) }),
    )
    .exhaustive();
}

interface MarkGroup {
  readonly slot: Placement;
  readonly contributions: readonly Contribution[];
}

// Marks are additive across nine slots and never compete, so the modal shows every
// contributing mark side by side instead of the winner/overridden framing properties get —
// grouped by slot, since two marks in different corners are not the same fact.
function markGroupsOf(attribution: CellAttribution): readonly MarkGroup[] {
  const out: MarkGroup[] = [];
  for (const [slot, contributions] of Object.entries(attribution.marks) as [Placement, readonly Contribution[]][]) {
    if (contributions.length > 0) out.push({ slot, contributions });
  }
  return out;
}

function decorationOf(source: DecorationSource): JournalDecoration | undefined {
  return store.list(source.owner).at(source.index);
}

// The owner's kind alone ("Journal") never distinguishes one journal's rule from another's,
// so the display name always carries the identity too, not just the scope.
function ownerLabel(owner: DecorationOwner): string {
  return match(owner)
    .with({ kind: "journal" }, ({ journalName }) =>
      m.decoration_breakdown_owner({ kind: "journal", name: journalName }),
    )
    .with({ kind: "shelf" }, ({ shelfName }) => m.decoration_breakdown_owner({ kind: "shelf", name: shelfName }))
    .with({ kind: "global" }, () => m.decoration_breakdown_owner({ kind: "global", name: "" }))
    .exhaustive();
}

interface Clause {
  readonly mode: "and" | "or";
  readonly text: string;
}

// Mirrors DecorationsSection.vue's row-clauses: the mode word belongs between conditions, or
// an "or" decoration with two conditions reads as if both had to hold.
function clausesOf(source: DecorationSource): readonly Clause[] {
  const decoration = decorationOf(source);
  if (!decoration) return [];
  return decoration.conditions.map((condition) => ({
    mode: decoration.mode,
    text: describeCondition(condition, calendar),
  }));
}
</script>

<template>
  <div role="region" :aria-labelledby="headingId" class="decoration-breakdown__cell">
    <h3 :id="headingId" class="decoration-breakdown__heading">
      {{ headingOf(cell) }}
      <span v-if="cell.isEntry" class="decoration-breakdown__entry-badge">{{
        m.decoration_breakdown_entry_badge()
      }}</span>
    </h3>

    <div class="decoration-breakdown__body">
      <DecorationPreview :styles="cell.styles" />

      <ul class="decoration-breakdown__properties">
        <li v-for="property in cell.attribution.properties" :key="property.property">
          <div
            role="group"
            :aria-label="m.decoration_breakdown_property({ property: property.property })"
            class="decoration-breakdown__row"
          >
            <strong>{{ m.decoration_breakdown_property({ property: property.property }) }}</strong>
            <span>{{ ownerLabel(property.winner.source.owner) }}</span>
            <template v-for="(clause, i) in clausesOf(property.winner.source)" :key="i">
              <span v-if="i > 0" class="mode-word">{{ m.decoration_describe_mode({ kind: clause.mode }) }}</span>
              <span>{{ clause.text }}</span>
            </template>
          </div>

          <div
            v-if="property.overridden.length > 0"
            role="group"
            :aria-label="
              m.decoration_breakdown_overridden_for({
                property: m.decoration_breakdown_property({ property: property.property }),
              })
            "
            class="decoration-breakdown__overridden"
          >
            <h4>{{ m.decoration_breakdown_overridden_heading() }}</h4>
            <div v-for="(loser, i) in property.overridden" :key="i" class="decoration-breakdown__row">
              <span>{{ ownerLabel(loser.source.owner) }}</span>
              <template v-for="(clause, j) in clausesOf(loser.source)" :key="j">
                <span v-if="j > 0" class="mode-word">{{ m.decoration_describe_mode({ kind: clause.mode }) }}</span>
                <span>{{ clause.text }}</span>
              </template>
            </div>
          </div>
        </li>
      </ul>

      <div v-if="markGroupsOf(cell.attribution).length > 0" class="decoration-breakdown__marks">
        <h4>{{ m.decoration_breakdown_marks_heading() }}</h4>
        <div
          v-for="group in markGroupsOf(cell.attribution)"
          :key="group.slot"
          role="group"
          :aria-label="m.decoration_breakdown_slot({ slot: group.slot })"
          class="decoration-breakdown__mark-group"
        >
          <strong>{{ m.decoration_breakdown_slot({ slot: group.slot }) }}</strong>
          <div v-for="(mark, i) in group.contributions" :key="i" class="decoration-breakdown__row">
            <span>{{ ownerLabel(mark.source.owner) }}</span>
            <template v-for="(clause, j) in clausesOf(mark.source)" :key="j">
              <span v-if="j > 0" class="mode-word">{{ m.decoration_describe_mode({ kind: clause.mode }) }}</span>
              <span>{{ clause.text }}</span>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.decoration-breakdown__cell {
  padding: var(--size-4-2) 0;
  border-top: 1px solid var(--background-modifier-border);
}
.decoration-breakdown__heading {
  margin: 0 0 var(--size-4-2) 0;
  font-size: 1em;
  display: flex;
  align-items: baseline;
  gap: var(--size-4-2);
}
.decoration-breakdown__entry-badge {
  text-transform: uppercase;
  font-size: 65%;
  color: var(--text-accent);
}
.decoration-breakdown__body {
  display: flex;
  align-items: flex-start;
  gap: var(--size-4-2);
}
.decoration-breakdown__properties {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
}
.decoration-breakdown__row {
  display: flex;
  gap: var(--size-4-2);
  flex-wrap: wrap;
  align-items: baseline;
}
.decoration-breakdown__overridden h4,
.decoration-breakdown__marks h4 {
  margin: 0;
  text-transform: uppercase;
  font-size: 75%;
  color: var(--text-muted);
}
/* Only the condition text reads as overridden; the scope badge (always the row's first
   child) stays legible so the reader can still tell whose rule lost. */
.decoration-breakdown__overridden .decoration-breakdown__row > span:not(:first-child) {
  text-decoration: line-through;
}
.decoration-breakdown__mark-group {
  margin-top: var(--size-4-2);
}
.mode-word {
  text-transform: uppercase;
  font-size: 75%;
}
</style>
```

- [ ] **Step 3: Point the explorer at the section**

In `src/decorations/ui/DecorationBreakdownModal.vue`:

1. Delete the local `PERIOD_FORMAT`, `formatPeriod`, `BreakdownCell`, `cellId`, `headingOf`, `MarkGroup`, `markGroupsOf`, `decorationOf`, `ownerLabel`, `Clause` and `clausesOf` definitions.
2. Delete the `journalIndex` field from the interval cell it pushes (and its comment) — the section derives ids from the render index now. Keep the `for (const [journalIndex, name] of journalNames.value.entries())` loop but rename the binding to `_name`-style destructuring: change it to `for (const name of journalNames.value)`.
3. Delete the now-unused imports: `match` from `ts-pattern`, `Calendar`, `describeCondition`, `DecorationPreview`, and the `JournalDecoration` / `CellAttribution` / `Contribution` / `DecorationSource` / `DecorationOwner` / `Placement` / `PeriodKind` type imports. Keep `attributeCell` (still called), `CalendarDate`, `periodOfKind`, `AnchorString`, `Period`.
4. Add: `import DecorationBreakdownSection from "./DecorationBreakdownSection.vue";` and `import type { BreakdownCell } from "./breakdown-cell";`
5. Remove `const calendar = useService(Calendar);`.
6. Replace the whole `v-for` block in the template (everything from `<div v-for="cell in cells"` to its closing `</div>`) with:

```vue
<DecorationBreakdownSection v-for="(cell, index) in cells" :key="index" :cell="cell" :index="index" />
```

7. Delete every style rule except `.decoration-breakdown__empty` if one exists — in the current file the only rules are the ones moved in Step 2, so the entire `<style scoped>` block goes.

- [ ] **Step 4: Run the existing suite to prove nothing moved**

```bash
npx vitest run src/decorations/ui/
```

Expected: PASS, 17 tests in `DecorationBreakdownModal.test.ts`. If the interval accessible-name test fails, the `aria-labelledby` id wiring in Step 2 is wrong.

- [ ] **Step 5: Run the gates**

```bash
npm run check:types && npm run check:lint
```

Expected: types clean; lint reports 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/decorations/ui/
git commit -m "refactor(decorations): extract the breakdown section renderer"
```

---

### Task 2: Move the renderer tests to the section

The five behaviours below exercise the section, not the explorer's composition. Moving them means a section regression names the section.

**Files:**

- Create: `src/decorations/ui/DecorationBreakdownSection.test.ts`
- Modify: `src/decorations/ui/DecorationBreakdownModal.test.ts`

**Interfaces:**

- Consumes: `BreakdownCell`, `DecorationBreakdownSection.vue` from Task 1.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the section test file**

The section needs only `DecorationsStore` and `Calendar` from DI, and takes a fully-built `BreakdownCell` — no engine, no index, no journals. Build contributions by hand.

Create `src/decorations/ui/DecorationBreakdownSection.test.ts`:

```ts
import { cleanup, render, screen, within } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Calendar, DayPeriod } from "@/calendar";
import { date, installTestCalendar, testCalendar } from "@/calendar/testing";
import { m } from "@/i18n";
import { provideInjectorOnApp } from "@/infrastructure/di";
import { PluginData } from "@/infrastructure/host";
import { FakePluginData } from "@/infrastructure/host/testing";
import { JournalsRepository, type JournalsEvents } from "@/journals";
import { fixedJournal } from "@/journals/testing";
import { createSettingsService } from "@/settings/testing";

import { attributeCell } from "../attribute-cell";
import { DecorationsStore } from "../decorations-store";
import { decorationsSlice } from "../settings/slice";
import { buildCalendarDecoration, buildCondition, buildDecoration, buildStyle } from "../testing";

import DecorationBreakdownSection from "./DecorationBreakdownSection.vue";

import type { BreakdownCell } from "./breakdown-cell";
import type { Contribution } from "../engine";
import type { CalendarDecoration, JournalDecoration } from "../config";

const ANY_DATE_TEXT = m.decoration_condition_date_describe({
  day: m.decoration_condition_date_any(),
  month: m.decoration_condition_date_any(),
  year: m.decoration_condition_date_any(),
});

const hasNoteDecoration: JournalDecoration = buildDecoration({
  mode: "or",
  conditions: [buildCondition("has-note")],
  styles: [buildStyle("background")],
});

const anyDayCalendarDecoration: CalendarDecoration = buildCalendarDecoration({
  mode: "or",
  conditions: [buildCondition("date", { day: -1, month: -1, year: null })],
  styles: [buildStyle("background")],
});

// The section reads decorations back out of DecorationsStore by owner + index to render their
// condition text, so the fixtures must be registered there, not just referenced by the cell.
function mountSection(options: {
  journalDecorations?: readonly JournalDecoration[];
  globalDecorations?: readonly CalendarDecoration[];
  contributions: readonly Contribution[];
}) {
  const { container, service } = createSettingsService({ slices: [decorationsSlice] });
  service.getSlice(decorationsSlice).state = { decorations: [...(options.globalDecorations ?? [])] };

  const journals = JournalsRepository.fromParts(
    {
      daily: fixedJournal("daily", { type: "day" }, { decorations: [...(options.journalDecorations ?? [])] }),
    },
    createNanoEvents<JournalsEvents>(),
  );

  container.register(JournalsRepository).useValue(journals);
  container.register(PluginData).useValue(new FakePluginData() as unknown as PluginData);
  container.register(DecorationsStore).useClass(DecorationsStore);
  container.register(Calendar).useValue(testCalendar());

  const cell: BreakdownCell = {
    kind: "fixed",
    period: DayPeriod.containing(date("2026-05-25")),
    isEntry: false,
    attribution: attributeCell(options.contributions),
    styles: options.contributions.map((contribution) => contribution.style),
  };

  render(DecorationBreakdownSection, {
    props: { cell, index: 0 },
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
          },
        },
      ],
    },
  });
}

describe("DecorationBreakdownSection", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
    cleanup();
  });

  it("names the winning decoration for a resolved property", () => {
    mountSection({
      globalDecorations: [anyDayCalendarDecoration],
      journalDecorations: [hasNoteDecoration],
      contributions: [
        { source: { owner: { kind: "global" }, index: 0 }, style: buildStyle("background") },
        { source: { owner: { kind: "journal", journalName: "daily" }, index: 0 }, style: buildStyle("background") },
      ],
    });

    const winnerGroup = screen.getByRole("group", {
      name: m.decoration_breakdown_property({ property: "background" }),
    });
    expect(within(winnerGroup).getByText(m.decoration_condition_has_note_describe())).toBeTruthy();
    expect(
      within(winnerGroup).getByText(m.decoration_breakdown_owner({ kind: "journal", name: "daily" })),
    ).toBeTruthy();
  });

  it("lists a contribution that lost a property under the overridden heading", () => {
    mountSection({
      globalDecorations: [anyDayCalendarDecoration],
      journalDecorations: [hasNoteDecoration],
      contributions: [
        { source: { owner: { kind: "global" }, index: 0 }, style: buildStyle("background") },
        { source: { owner: { kind: "journal", journalName: "daily" }, index: 0 }, style: buildStyle("background") },
      ],
    });

    const overriddenGroup = screen.getByRole("group", {
      name: m.decoration_breakdown_overridden_for({
        property: m.decoration_breakdown_property({ property: "background" }),
      }),
    });
    expect(within(overriddenGroup).getByText(ANY_DATE_TEXT)).toBeTruthy();
    expect(within(overriddenGroup).getByText(m.decoration_breakdown_owner({ kind: "global", name: "" }))).toBeTruthy();
  });

  it("interleaves the mode word between an OR decoration's conditions", () => {
    const orDecoration: JournalDecoration = buildDecoration({
      mode: "or",
      conditions: [buildCondition("has-note"), buildCondition("date", { day: -1, month: -1, year: null })],
      styles: [buildStyle("background")],
    });
    mountSection({
      journalDecorations: [orDecoration],
      contributions: [
        { source: { owner: { kind: "journal", journalName: "daily" }, index: 0 }, style: buildStyle("background") },
      ],
    });

    // Both condition texts are asserted alongside the mode word: the mode-word span renders
    // whenever there are two clauses, so without them a regression in describeCondition's
    // output for either condition would slip through.
    expect(screen.getByText(m.decoration_condition_has_note_describe())).toBeTruthy();
    expect(screen.getByText(ANY_DATE_TEXT)).toBeTruthy();
    expect(screen.getByText(m.decoration_describe_mode({ kind: "or" }))).toBeTruthy();
  });

  it("lists marks without naming a winner", () => {
    const journalMark: JournalDecoration = buildDecoration({
      mode: "or",
      conditions: [buildCondition("has-note")],
      styles: [buildStyle("shape")],
    });
    const globalMark: CalendarDecoration = buildCalendarDecoration({
      mode: "or",
      conditions: [buildCondition("date", { day: -1, month: -1, year: null })],
      styles: [buildStyle("shape")],
    });
    // Two competing marks, not one: "without naming a winner" is only a claim about plural
    // marks. A single contribution would also pass against a section that resolved nothing.
    mountSection({
      journalDecorations: [journalMark],
      globalDecorations: [globalMark],
      contributions: [
        { source: { owner: { kind: "journal", journalName: "daily" }, index: 0 }, style: buildStyle("shape") },
        { source: { owner: { kind: "global" }, index: 0 }, style: buildStyle("shape") },
      ],
    });

    expect(screen.getByText(m.decoration_condition_has_note_describe())).toBeTruthy();
    expect(screen.getByText(ANY_DATE_TEXT)).toBeTruthy();
    expect(screen.queryByText(m.decoration_breakdown_overridden_heading())).toBeNull();
  });

  it("keeps its accessible name intact for a journal name containing a space", () => {
    const { container, service } = createSettingsService({ slices: [decorationsSlice] });
    service.getSlice(decorationsSlice).state = { decorations: [] };
    const journals = JournalsRepository.fromParts({}, createNanoEvents<JournalsEvents>());
    container.register(JournalsRepository).useValue(journals);
    container.register(PluginData).useValue(new FakePluginData() as unknown as PluginData);
    container.register(DecorationsStore).useClass(DecorationsStore);
    container.register(Calendar).useValue(testCalendar());

    const cell: BreakdownCell = {
      kind: "interval",
      period: DayPeriod.containing(date("2026-05-25")),
      journalName: "sprint planning",
      isEntry: false,
      attribution: attributeCell([]),
      styles: [],
    };

    render(DecorationBreakdownSection, {
      props: { cell, index: 0 },
      global: {
        plugins: [
          {
            install(app) {
              provideInjectorOnApp(app, container);
            },
          },
        ],
      },
    });

    // `aria-labelledby` tokenizes on whitespace, so an id built from the raw journal name would
    // resolve to nonexistent ids and the region would lose its accessible name entirely.
    const heading = m.decoration_breakdown_interval_heading({ journal: "sprint planning", label: "2026-05-25" });
    expect(screen.getByRole("region", { name: heading })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the new file**

```bash
npx vitest run src/decorations/ui/DecorationBreakdownSection.test.ts
```

Expected: PASS, 5 tests. If `DecorationsStore` construction fails, check that `decorationsSlice`'s import path matches the one used in `DecorationBreakdownModal.test.ts` (it imports from `@/decorations`; adjust to the barrel if the direct path does not resolve).

- [ ] **Step 3: Delete the moved tests from the explorer suite**

From `src/decorations/ui/DecorationBreakdownModal.test.ts`, delete these five `it` blocks entirely:

- `"names the winning decoration for a resolved property"`
- `"lists a contribution that lost a property under the overridden heading"`
- `"interleaves the mode word between an OR decoration's conditions"`
- `"lists marks without naming a winner"`
- `"keeps the interval section's accessible name intact for a journal name containing a space"`

Then delete any import or const left unused — likely `buildCalendarDecoration` and `within` if no remaining test uses them. Let `check:lint` tell you.

- [ ] **Step 4: Run both files**

```bash
npx vitest run src/decorations/ui/
```

Expected: PASS. `DecorationBreakdownModal.test.ts` now has 12 tests.

- [ ] **Step 5: Run the gates**

```bash
npm run check:types && npm run check:lint
```

- [ ] **Step 6: Commit**

```bash
git add src/decorations/ui/
git commit -m "test(decorations): move the renderer behaviours onto the section"
```

---

### Task 3: Add the cell readout modal

Additive — nothing opens it yet, so the suite stays green throughout.

**Files:**

- Create: `src/decorations/ui/breakdown-entry.ts`
- Create: `src/decorations/ui/DecorationCellModal.vue`
- Create: `src/decorations/ui/DecorationCellModal.test.ts`
- Modify: `src/decorations/ui/modals.ts`
- Modify: `messages/en.json`

**Interfaces:**

- Consumes: `BreakdownCell` and `DecorationBreakdownSection.vue` from Task 1.
- Produces:
  - `type BreakdownEntry = { kind: "fixed"; period: Period } | { kind: "interval"; period: Period; journalName: string }`
  - `const decorationCellModal` — a `defineModal()` taking props `{ entry: BreakdownEntry; shelf?: string | null }`

- [ ] **Step 1: Add the copy string**

In `messages/en.json`, directly after `"decoration_breakdown_empty"`, add:

```json
  "decoration_breakdown_cell_empty": "Nothing decorates this cell.",
```

Then:

```bash
npm run compile:i18n
```

- [ ] **Step 2: Create the entry descriptor**

Create `src/decorations/ui/breakdown-entry.ts`:

```ts
import type { Period } from "@/calendar";

// A Period does not identify a cell: a custom interval is a "day"-kind period at its start
// anchor, so it collides with the day cell beneath it. The surface that owns the cell is the
// only place that knows which of the two was clicked.
export type BreakdownEntry =
  | { readonly kind: "fixed"; readonly period: Period }
  | { readonly kind: "interval"; readonly period: Period; readonly journalName: string };
```

- [ ] **Step 3: Write the failing test file**

Create `src/decorations/ui/DecorationCellModal.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { reactive } from "vue";

import { Calendar, DayPeriod, WeekPeriod } from "@/calendar";
import { date, installTestCalendar, testCalendar } from "@/calendar/testing";
import {
  DecorationEngine,
  DecorationsStore,
  decorationsSlice,
  type CalendarDecoration,
  type JournalDecoration,
} from "@/decorations";
import { m } from "@/i18n";
import { provideInjectorOnApp } from "@/infrastructure/di";
import { NoteMetadataService, type VaultPath } from "@/infrastructure/host";
import { FakeNoteMetadataService } from "@/infrastructure/host/testing";
import { CycleService, JournalsIndex, JournalsRepository, TimelineService, type JournalsEvents } from "@/journals";
import type { JournalConfig } from "@/journals/config";
import { customJournal, fixedJournal } from "@/journals/testing";
import { createSettingsService } from "@/settings/testing";
import { ShelvesRepository, type ShelvesEvents } from "@/shelves";
import type { ShelfConfig } from "@/shelves/config";

import { buildCalendarDecoration, buildCondition, buildDecoration, buildStyle } from "../testing";

import DecorationCellModal from "./DecorationCellModal.vue";

import type { BreakdownEntry } from "./breakdown-entry";

interface Note {
  readonly journalName: string;
  readonly anchor: DayPeriod;
}

interface MountOptions {
  journals?: Record<string, JournalConfig>;
  shelves?: Record<string, ShelfConfig>;
  globalDecorations?: readonly CalendarDecoration[];
  notes?: readonly Note[];
  entry: BreakdownEntry;
  shelf?: string | null;
}

function mount(options: MountOptions) {
  const { container, service } = createSettingsService({ slices: [decorationsSlice] });
  service.getSlice(decorationsSlice).state = { decorations: [...(options.globalDecorations ?? [])] };

  const journalStorage = reactive<Record<string, JournalConfig>>({ ...options.journals });
  const journals = JournalsRepository.fromParts(journalStorage, createNanoEvents<JournalsEvents>());

  const shelfStorage = reactive<Record<string, ShelfConfig>>({ ...options.shelves });
  const shelves = ShelvesRepository.fromParts(shelfStorage, createNanoEvents<ShelvesEvents>());

  const fakeMetadata = new FakeNoteMetadataService();
  const index = new JournalsIndex();
  for (const note of options.notes ?? []) {
    const path = `${note.journalName}/${note.anchor.anchor.toAnchor()}.md` as VaultPath;
    index.register({ journalName: note.journalName, anchor: note.anchor.anchor.toAnchor(), path });
    fakeMetadata.setMetadata(path, { title: note.journalName, tags: [], properties: {}, tasks: [] });
  }

  container.register(JournalsRepository).useValue(journals);
  container.register(ShelvesRepository).useValue(shelves);
  container.register(DecorationsStore).useClass(DecorationsStore);
  container.register(JournalsIndex).useValue(index);
  container.register(CycleService).useClass(CycleService);
  container.register(TimelineService).useClass(TimelineService);
  container.register(NoteMetadataService).useValue(fakeMetadata as unknown as NoteMetadataService);
  container.register(DecorationEngine).useClass(DecorationEngine);
  container.register(Calendar).useValue(testCalendar());

  render(DecorationCellModal, {
    props: { entry: options.entry, shelf: options.shelf },
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
          },
        },
      ],
    },
  });
}

const anyDayDecoration: JournalDecoration = buildDecoration({
  mode: "or",
  conditions: [buildCondition("date", { day: -1, month: -1, year: null })],
  styles: [buildStyle("background")],
});

const hasNoteDecoration: JournalDecoration = buildDecoration({
  mode: "or",
  conditions: [buildCondition("has-note")],
  styles: [buildStyle("background")],
});

const anyDayCalendarDecoration: CalendarDecoration = buildCalendarDecoration({
  mode: "or",
  conditions: [buildCondition("date", { day: -1, month: -1, year: null })],
  styles: [buildStyle("background")],
});

describe("DecorationCellModal", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
    cleanup();
  });

  it("renders only the clicked cell when the date also belongs to a decorated week cell", () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    mount({
      journals: {
        daily: fixedJournal("daily", { type: "day" }, { decorations: [hasNoteDecoration] }),
        weekly: fixedJournal("weekly", { type: "week" }, { decorations: [anyDayDecoration] }),
      },
      notes: [{ journalName: "daily", anchor: day }],
      entry: { kind: "fixed", period: day },
    });

    expect(screen.getByText(m.decoration_breakdown_cell_heading({ kind: "day", label: "2026-05-25" }))).toBeTruthy();
    expect(screen.getAllByTestId("decoration-preview")).toHaveLength(1);
  });

  it("resolves a week entry against the week cell", () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    const week = WeekPeriod.containing(date("2026-05-25"));
    mount({
      journals: {
        daily: fixedJournal("daily", { type: "day" }, { decorations: [hasNoteDecoration] }),
        weekly: fixedJournal("weekly", { type: "week" }, { decorations: [anyDayDecoration] }),
      },
      notes: [{ journalName: "daily", anchor: day }],
      entry: { kind: "fixed", period: week },
    });

    expect(screen.getByText(m.decoration_breakdown_owner({ kind: "journal", name: "weekly" }))).toBeTruthy();
  });

  it("resolves an interval entry against the interval's own decorations", () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    mount({
      journals: {
        sprint: customJournal("sprint", "week", 2, "2026-05-25", { decorations: [hasNoteDecoration] }),
      },
      notes: [{ journalName: "sprint", anchor: day }],
      entry: { kind: "interval", period: day, journalName: "sprint" },
    });

    // A non-offset custom decoration belongs to the interval, never to the day cell that
    // shares its anchor — the interval heading is what proves the right side was resolved.
    expect(
      screen.getByText(m.decoration_breakdown_interval_heading({ journal: "sprint", label: "2026-05-25" })),
    ).toBeTruthy();
  });

  it("resolves a day entry against the day cell when that day starts an interval", () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    mount({
      journals: {
        daily: fixedJournal("daily", { type: "day" }, { decorations: [anyDayDecoration] }),
        sprint: customJournal("sprint", "week", 2, "2026-05-25", { decorations: [hasNoteDecoration] }),
      },
      notes: [{ journalName: "sprint", anchor: day }],
      entry: { kind: "fixed", period: day },
    });

    expect(screen.getByText(m.decoration_breakdown_cell_heading({ kind: "day", label: "2026-05-25" }))).toBeTruthy();
    expect(
      screen.queryByText(m.decoration_breakdown_interval_heading({ journal: "sprint", label: "2026-05-25" })),
    ).toBeNull();
  });

  it("resolves against the shelf it was opened under", () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    mount({
      shelves: {
        work: { name: "work", journals: [], decorations: [] },
        home: { name: "home", journals: [], decorations: [anyDayCalendarDecoration] },
      },
      entry: { kind: "fixed", period: day },
      shelf: "work",
    });

    expect(screen.getByText(m.decoration_breakdown_cell_empty())).toBeTruthy();
  });

  it("re-resolves when the shelf selection changes", async () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    mount({
      shelves: {
        work: { name: "work", journals: [], decorations: [] },
        home: { name: "home", journals: [], decorations: [anyDayCalendarDecoration] },
      },
      entry: { kind: "fixed", period: day },
      shelf: "home",
    });

    expect(screen.getByTestId("decoration-preview")).toBeTruthy();

    await userEvent.selectOptions(screen.getByRole("combobox"), "work");

    expect(screen.getByText(m.decoration_breakdown_cell_empty())).toBeTruthy();
  });
});
```

**Note.** An earlier draft also asserted the date picker's absence. The spec declined that assertion — it edges into testing the wiring, and "renders only the clicked cell" already proves this is a one-cell readout. Do not add it back.

- [ ] **Step 4: Run it to verify it fails**

```bash
npx vitest run src/decorations/ui/DecorationCellModal.test.ts
```

Expected: FAIL — `Failed to resolve import "./DecorationCellModal.vue"`.

- [ ] **Step 5: Create the component**

Create `src/decorations/ui/DecorationCellModal.vue`:

```vue
<script setup lang="ts">
import { computed, ref, toRaw } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { JournalsRepository } from "@/journals/repository";
import { useIndexVersion } from "@/journals/use-index-version";
import { ShelvesRepository } from "@/shelves/repository";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { attributeCell } from "../attribute-cell";
import { DecorationsStore } from "../decorations-store";
import { cellKey, DecorationEngine, hasOffsetCondition } from "../engine";
import { gatherBindings } from "../gather-bindings";

import DecorationBreakdownSection from "./DecorationBreakdownSection.vue";

import type { BreakdownCell } from "./breakdown-cell";
import type { BreakdownEntry } from "./breakdown-entry";
import type { DecorationBinding } from "../engine";

const props = defineProps<{ entry: BreakdownEntry; shelf?: string | null }>();

const journals = useService(JournalsRepository);
const shelves = useService(ShelvesRepository);
const store = useService(DecorationsStore);
const engine = useService(DecorationEngine);
const indexVersion = useIndexVersion();

const entry = toRaw(props.entry);
const period = toRaw(entry.period);

const shelf = ref<string | null>(props.shelf ?? null);
const shelfModel = computed<string>({
  get: () => shelf.value ?? "",
  set: (value) => {
    shelf.value = value === "" ? null : value;
  },
});
const shelfNames = computed<readonly string[]>(() => [...shelves.find().map((s) => s.name)]);

const journalNames = computed<readonly string[]>(() => {
  if (shelf.value === null) return [...journals.find().map((j) => j.name)];
  return shelves.get(shelf.value).match<readonly string[]>({
    some: (config) => config.journals,
    none: () => [],
  });
});

// An interval and the day cell it starts on share a cell key, and the two are told apart by
// complementary filters: the day grid takes a custom journal's offset-carrying decorations,
// the interval list takes the rest. The entry says which side was clicked.
function bindingsFor(): readonly DecorationBinding[] {
  if (entry.kind === "interval") {
    return gatherBindings(journals, store, {
      journalNames: [entry.journalName],
      shelf: shelf.value,
      includeCalendar: false,
      filter: (binding) => !hasOffsetCondition(binding.decoration),
    });
  }
  return gatherBindings(journals, store, {
    journalNames: journalNames.value,
    shelf: shelf.value,
    includeCalendar: true,
    filter: (binding) => {
      const config = journals.get(binding.journalName).getOrUndefined();
      if (config?.write.type !== "custom") return true;
      return hasOffsetCondition(binding.decoration);
    },
  });
}

const cell = computed<BreakdownCell | null>(() => {
  void indexVersion.value;
  const contributions = engine
    .explainRange([period], bindingsFor())
    .get(cellKey(period.kind, period.anchor.toAnchor()));
  if (!contributions || contributions.length === 0) return null;

  const attribution = attributeCell(contributions);
  const styles = contributions.map((contribution) => contribution.style);
  return entry.kind === "interval"
    ? { kind: "interval", period, journalName: entry.journalName, isEntry: false, attribution, styles }
    : { kind: "fixed", period, isEntry: false, attribution, styles };
});
</script>

<template>
  <div class="decoration-breakdown">
    <UiSettingRow :name="m.decoration_breakdown_shelf_label()">
      <UiDropdown v-model="shelfModel">
        <option value="">{{ m.decoration_breakdown_shelf_all() }}</option>
        <option v-for="name in shelfNames" :key="name" :value="name">{{ name }}</option>
      </UiDropdown>
    </UiSettingRow>

    <p v-if="cell === null" class="decoration-breakdown__empty">{{ m.decoration_breakdown_cell_empty() }}</p>
    <DecorationBreakdownSection v-else :cell="cell" :index="0" />
  </div>
</template>
```

- [ ] **Step 6: Register the modal**

In `src/decorations/ui/modals.ts`, add below the existing definition:

```ts
export const decorationCellModal = defineModal()({
  component: DecorationCellModal,
  title: (_: { entry: BreakdownEntry; shelf?: string | null }) => m.decoration_breakdown_title(),
  width: 700,
});
```

with `import DecorationCellModal from "./DecorationCellModal.vue";` and `import type { BreakdownEntry } from "./breakdown-entry";` at the top.

- [ ] **Step 7: Export from the barrel**

In `src/decorations/index.ts`, change the last modal export line to:

```ts
export { decorationBreakdownModal, decorationCellModal } from "./ui/modals";
export type { BreakdownEntry } from "./ui/breakdown-entry";
```

- [ ] **Step 8: Run the test to verify it passes**

```bash
npx vitest run src/decorations/ui/DecorationCellModal.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 9: Run the gates**

```bash
npm test && npm run check:types && npm run check:lint
```

- [ ] **Step 10: Commit**

```bash
git add src/decorations/ messages/en.json
git commit -m "feat(decorations): add a one-cell breakdown readout"
```

---

### Task 4: Repoint the context menu at the cell readout

**Files:**

- Modify: `src/decorations/ui/use-decoration-menu-item.ts`
- Modify: `src/decorations/ui/use-decoration-menu-item.test.ts`
- Modify: `src/notes-calendar/use-notes-cell.ts:66-68`
- Modify: `src/views/toolbar-items/period-buttons/ui/PeriodButtonsItem.vue`
- Modify: `src/code-blocks/nav/ui/NavBlockRow.vue:81-83`
- Modify: `src/code-blocks/nav/ui/NavigationCodeBlock.test.ts`

**Interfaces:**

- Consumes: `BreakdownEntry`, `decorationCellModal` from Task 3.
- Produces: `useDecorationMenuItems(cells, shelf) => (entry: BreakdownEntry) => readonly MenuItemSpec[]`

- [ ] **Step 1: Write the failing tests**

In `src/decorations/ui/use-decoration-menu-item.test.ts`, change the captured type and every `itemsFor(period)` call to take an entry. Replace `import { decorationBreakdownModal } from "./modals";` with `import { decorationCellModal } from "./modals";` and add `import type { BreakdownEntry } from "./breakdown-entry";`.

The signature in `mountItems` becomes:

```ts
const captured: { value: ((entry: BreakdownEntry) => readonly MenuItemSpec[]) | null } = { value: null };
```

and its return type `itemsFor: (entry: BreakdownEntry) => readonly MenuItemSpec[]`.

Each existing call site changes from `itemsFor(period)` to `itemsFor({ kind: "fixed", period })`. Update the two modal assertions:

```ts
it("opens the cell readout for the clicked cell", () => {
  const period = DayPeriod.containing(date("2026-05-25"));
  const cells = cellsWith(period, shallowRef([buildStyle("background")]));

  const { itemsFor, modals } = mountItems(cells);
  itemsFor({ kind: "fixed", period })[0].onClick();

  const opened = modals.lastOpen<{ entry: BreakdownEntry }, void>();
  expect(opened.definition).toBe(decorationCellModal);
  expect(opened.props.entry).toEqual({ kind: "fixed", period });
});

it("scopes the readout it opens to the surface's shelf", () => {
  const period = DayPeriod.containing(date("2026-05-25"));
  const cells = cellsWith(period, shallowRef([buildStyle("background")]));

  const { itemsFor, modals } = mountItems(cells, "Work");
  itemsFor({ kind: "fixed", period })[0].onClick();

  expect(modals.lastOpen<{ shelf: string | null }, void>().props.shelf).toBe("Work");
});

it("forwards an interval entry unchanged", () => {
  const period = DayPeriod.containing(date("2026-05-25"));
  const cells = cellsWith(period, shallowRef([buildStyle("background")]));

  const { itemsFor, modals } = mountItems(cells);
  itemsFor({ kind: "interval", period, journalName: "sprint" })[0].onClick();

  expect(modals.lastOpen<{ entry: BreakdownEntry }, void>().props.entry).toEqual({
    kind: "interval",
    period,
    journalName: "sprint",
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/decorations/ui/use-decoration-menu-item.test.ts
```

Expected: FAIL — `decorationCellModal` is opened nowhere, so `opened.definition` is `decorationBreakdownModal`.

- [ ] **Step 3: Change the composable**

In `src/decorations/ui/use-decoration-menu-item.ts`, swap the import to `decorationCellModal` and rewrite the returned function:

```ts
return (entry: BreakdownEntry): readonly MenuItemSpec[] => {
  const { period } = entry;
  const styles = cells.get(cellKey(period.kind, period.anchor.toAnchor()))?.value ?? [];
  if (styles.length === 0) return [];
  return [
    {
      title: m.decoration_explain_menu_item(),
      icon: icons.action.search,
      onClick: () => {
        void modals.open(decorationCellModal, { entry, shelf: toValue(shelf) });
      },
    },
  ];
};
```

with the return type on the function signature updated to `(entry: BreakdownEntry) => readonly MenuItemSpec[]` and `import type { BreakdownEntry } from "./breakdown-entry";` added. The `Period` type import is no longer needed.

- [ ] **Step 4: Update the three call sites**

`src/notes-calendar/use-notes-cell.ts` — in `openContextMenu`:

```ts
workspace.openPathsMenu(existingPathsAt(period), event, decorationItems({ kind: "fixed", period }));
```

`src/views/toolbar-items/period-buttons/ui/PeriodButtonsItem.vue` — find the `openContextMenu` that calls `decorationItems(badge.period)` and change it to `decorationItems({ kind: "fixed", period: badge.period })`.

`src/code-blocks/nav/ui/NavBlockRow.vue` — replace `contextMenuItems`:

```ts
// Offering to explain decorations this row deliberately renders none of would be
// incoherent from the user's side, so the menu item tracks the same flag the template does.
function contextMenuItems(period: Period): readonly MenuItemSpec[] {
  if (!props.row.addDecorations) return [];
  // A custom journal's row IS the interval, and an interval is a "day"-kind period at its
  // start anchor — indistinguishable from the day cell without saying so here.
  return props.journal.write.type === "custom"
    ? decorationItems({ kind: "interval", period, journalName: props.journal.name })
    : decorationItems({ kind: "fixed", period });
}
```

- [ ] **Step 5: Run to verify the composable tests pass**

```bash
npx vitest run src/decorations/ui/use-decoration-menu-item.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Write the failing NavBlockRow branch test**

In `src/code-blocks/nav/ui/NavigationCodeBlock.test.ts`:

1. Add `modals` to the `Harness` interface and capture it in `buildHarness` (currently the fake is constructed inline at line 145):

```ts
const modals = new FakeModalService();
container.register(ModalService).useValue(modals as unknown as ModalService);
```

and add `modals` to the returned object and to the `Harness` interface as `modals: FakeModalService`.

2. Add this test to the `describe("NavigationCodeBlock context menu", ...)` block:

```ts
it("opens an interval entry from a custom journal's row", async () => {
  const base = customJournal("sprint", "week", 2, "2026-05-25");
  const journal: JournalConfig = {
    ...base,
    decorations: [
      buildDecoration({
        mode: "or",
        conditions: [buildCondition("date", { day: -1, month: -1, year: null })],
        styles: [buildStyle("background")],
      }),
    ],
    navBlock: {
      ...base.navBlock,
      rows: [
        {
          template: "sprint",
          fontSize: 1,
          bold: false,
          italic: false,
          color: { type: "transparent" },
          background: { type: "transparent" },
          link: "self",
          journal: "",
          addDecorations: true,
        },
      ],
    },
  };
  const h = buildHarness({ sprint: journal });
  mount(h, "Sprint/2026-05-25.md");

  const target = screen.getAllByText("sprint")[1];
  if (target) await fireEvent.contextMenu(target);

  const items = h.workspace.pathsMenuCalls.at(-1)?.extraItems ?? [];
  items[0]?.onClick();

  expect(h.modals.lastOpen<{ entry: { kind: string; journalName?: string } }, void>().props.entry).toMatchObject({
    kind: "interval",
    journalName: "sprint",
  });
});
```

`customJournal(name, every, duration, anchorDate, overrides?)` is defined at `src/journals/testing.ts:26`; import it alongside the existing `journalDefaultsFor` import in this test file. If `pathsMenuCalls` records `extraItems` as `MenuItemSpec[]`, the `items[0]?.onClick()` call works as written; check `FakeWorkspace` in the same test file.

- [ ] **Step 7: Run it**

```bash
npx vitest run src/code-blocks/nav/ui/NavigationCodeBlock.test.ts
```

Expected: PASS (the production branch from Step 4 is already in place). If it fails on the cell not being decorated, the row's period is not in the provided decoration map — confirm the `date` wildcard condition matches and that `addDecorations: true` is set.

- [ ] **Step 8: Run the gates**

```bash
npm test && npm run check:types && npm run check:lint
```

- [ ] **Step 9: Commit**

```bash
git add src/
git commit -m "feat(decorations): open the one-cell readout from a decorated cell"
```

---

### Task 5: Strip the entry-point machinery from the explorer

Nothing opens the explorer with a period any more, so all of it is dead.

**Files:**

- Modify: `src/decorations/ui/DecorationBreakdownModal.vue`
- Modify: `src/decorations/ui/DecorationBreakdownModal.test.ts`
- Modify: `src/decorations/ui/DecorationBreakdownSection.vue`
- Modify: `src/decorations/ui/breakdown-cell.ts`
- Modify: `src/decorations/ui/modals.ts`
- Modify: `messages/en.json`

**Interfaces:**

- Consumes: everything from Tasks 1-4.
- Produces: `BreakdownCell` without `isEntry`; `decorationBreakdownModal` with props `{}`.

- [ ] **Step 1: Delete the two entry-badge tests**

From `src/decorations/ui/DecorationBreakdownModal.test.ts`, delete these `it` blocks:

- `"highlights the section for the entry-point cell"`
- `"highlights only the day section when opened from a day cell that starts an interval"`

Then rewrite `"excludes a custom journal's non-offset decoration from the day cell"`, which currently asserts through the badge. Replace its assertion and comment with:

```ts
// The day cell gets zero contributions once the offset-only filter excludes this
// decoration, so no day section renders. It still surfaces in the interval section below.
expect(screen.queryByText(m.decoration_breakdown_cell_heading({ kind: "day", label: "2026-05-25" }))).toBeNull();
```

- [ ] **Step 2: Drop `period` from the mount harness**

In the same file, remove `period?: Period;` from `MountOptions`, remove `period: options.period` from the `render` props (leaving `props: { shelf: options.shelf }`), and delete every `period: day,` line from the remaining tests' `mount({...})` calls. Remove the now-unused `Period` type import if nothing else uses it.

- [ ] **Step 3: Checkpoint — confirm the suite is green before deleting code**

There is no red test in this task. It removes dead code, and the suite staying green across the removal is the evidence. Establish the green baseline first:

```bash
npx vitest run src/decorations/ui/DecorationBreakdownModal.test.ts
```

Expected: PASS. The component still accepts a prop nothing passes; Steps 4-8 delete it.

- [ ] **Step 4: Strip the component**

In `src/decorations/ui/DecorationBreakdownModal.vue`:

1. `const props = defineProps<{ period?: Period; shelf?: string | null }>();` → `const props = defineProps<{ shelf?: string | null }>();`
2. Delete `const initialPeriod = toRaw(props.period);` and simplify the anchor ref to:

```ts
const anchor = ref<AnchorString>(CalendarDate.today().toAnchor());
```

3. Delete `const entryKey = ...` and its comment.
4. Delete the `isEntry:` line from both cell pushes.
5. Remove the `toRaw` import if unused, and the `Period` type import if unused.

- [ ] **Step 5: Strip the badge from the section**

In `src/decorations/ui/DecorationBreakdownSection.vue`, remove the badge `<span>` from the `<h3>`, leaving:

```vue
<h3 :id="headingId" class="decoration-breakdown__heading">{{ headingOf(cell) }}</h3>
```

and delete the `.decoration-breakdown__entry-badge` style rule. The `.decoration-breakdown__heading` flex rules stay — they no longer align a badge, but they cost nothing and removing them is an unrelated style change.

- [ ] **Step 6: Strip `isEntry` from the cell type**

In `src/decorations/ui/breakdown-cell.ts`, delete `readonly isEntry: boolean;` from the `fixed` variant and `readonly isEntry: false;` from the `interval` variant. Then delete the `isEntry: false` properties from `DecorationCellModal.vue`'s two cell literals and from `DecorationBreakdownSection.test.ts`'s two cell literals.

- [ ] **Step 7: Drop the props from the modal definition**

In `src/decorations/ui/modals.ts`:

```ts
export const decorationBreakdownModal = defineModal()({
  component: DecorationBreakdownModal,
  title: (_: { shelf?: string | null }) => m.decoration_breakdown_title(),
  width: 700,
});
```

Remove the `Period` type import if now unused.

- [ ] **Step 8: Delete the copy string**

Remove the `"decoration_breakdown_entry_badge"` line from `messages/en.json` (it exists in `en.json` only — no other locale carries it). Then:

```bash
npm run compile:i18n
```

- [ ] **Step 9: Verify the string is gone from source**

```bash
grep -rn "decoration_breakdown_entry_badge\|isEntry" src/ messages/ || echo "clean"
```

Expected: `clean`.

- [ ] **Step 10: Run everything**

```bash
npm test && npm run check:types && npm run check:lint
```

Expected: all green, 0 lint errors.

- [ ] **Step 11: Run the journeys suite**

```bash
npm run build && npx wdio run ./wdio.conf.mts --suite journeys
```

Expected: **29 passed, 1 failed** — the pre-existing `dynamic-commands` failure and nothing else. `view.e2e.ts` exercises the "Explain decorations" menu item's presence and ordering; it must still pass, since the item's title and visibility rule are unchanged.

- [ ] **Step 12: Commit**

```bash
git add src/ messages/en.json
git commit -m "refactor(decorations): drop the explorer's dead entry-point state"
```

---

## Self-Review

**Spec coverage**

| Spec section                                                                     | Task                                             |
| -------------------------------------------------------------------------------- | ------------------------------------------------ |
| Why two screens, not two modes                                                   | 1, 3, 5                                          |
| The entry descriptor (`BreakdownEntry`, menu-item signature, three call sites)   | 3 (type), 4 (signature + call sites)             |
| `decorationCellModal` — props, shelf seeding, two-branch resolution, empty state | 3                                                |
| `decorationBreakdownModal` shrinks                                               | 5                                                |
| `DecorationBreakdownSection` extraction                                          | 1                                                |
| Testing — section tests                                                          | 2                                                |
| Testing — explorer keeps composition, drops two                                  | 5                                                |
| Testing — cell modal, six behaviours                                             | 3                                                |
| Testing — NavBlockRow branch                                                     | 4                                                |
| Testing — no new e2e                                                             | 5 Step 11 verifies the existing one still passes |
| Rollout — i18n add/remove + compile                                              | 3 Step 1, 5 Step 8                               |

No gaps.

**Deviation from the spec, deliberate**

The spec placed `journalIndex` on `BreakdownCell` for DOM-id uniqueness. Task 1 uses the section's render `index` prop instead — equally unique, and it removes a field that had to be threaded through cell construction. The whitespace-in-journal-name test still guards the property that mattered.

A second deviation (asserting the date picker's absence) was raised in pre-flight and resolved in the spec's favour: the assertion is not in the plan.

**Type consistency**

`BreakdownCell` (Task 1) → consumed unchanged by `DecorationBreakdownSection` (Task 1), `DecorationCellModal` (Task 3), `DecorationBreakdownModal` (Task 1), narrowed in Task 5. `BreakdownEntry` (Task 3) → consumed by `modals.ts` (Task 3), `useDecorationMenuItems` (Task 4), the three call sites (Task 4). `formatPeriod` is defined once and used only inside the section. `decorationCellModal` is named identically in Tasks 3 and 4.
