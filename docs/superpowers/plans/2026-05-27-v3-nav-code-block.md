# v3 Navigation Code Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port v2's `NavigationCodeBlock` to v3 under the existing code-block foundation, including the per-journal `navBlock` config it depends on, with full v2 feature parity (3 key aliases, decorations, hover preview, context menu, link routing, template rendering).

**Architecture:** Extend `JournalConfig` with a `navBlock` field (type, rows, decorateWholeBlock) parsed via valibot. Add a new `src/code-blocks/nav/` sub-folder owning the `defineCodeBlock` value, pure helpers (`period-for-journal`, `link-targets`, `nav-row-context`), and Vue UI (`NavigationCodeBlock.vue` → `NavBlock.vue` → `NavBlockRow.vue`). The block reads the note's journal via `JournalsIndex.entryByPath`, computes prev/cur/next refs via `CycleService` or `JournalsIndex.findPrevious/findNext` depending on `navBlock.type`, renders three columns, and wires clicks/menus/hovers through `Flows`, `WorkspaceService`, and `OpenDateFlow`. Decorations integrate via a single `useCellDecorations` call covering all three anchors.

**Tech Stack:** TypeScript, Vue 3 (SFC), valibot, paraglide i18n, vitest, `@testing-library/vue`, `@testing-library/user-event`, moment.js, ts-pattern, obsidian.

**Reference spec:** `docs/superpowers/specs/2026-05-27-v3-nav-code-block-design.md`.

**Conventions in this repo (carry through every task):**

- Commit on the current branch (`v3-ai`); never create a new branch.
- Co-located tests: `*.test.ts` lives next to the implementation file.
- No `eslint-disable`. No `Co-Authored-By` trailer. Don't add narrative file-header JSDoc.
- DI: prefer field initializers (`readonly #x = inject(...)`); omit `.lifetime(Lifetime.Container)`.
- Vue components: inline `defineProps<{...}>()`; tests use `@testing-library/vue` + `user-event`; never `@vue/test-utils`.
- Tests: one behavior per test; nested `describe`; black-box assertions (assert observable outcomes, not call counts).
- Discriminated-union dispatch: `match(...).with(...).exhaustive()` (ts-pattern), not `switch`.
- Verification before claiming a task done: `npm test`, `npm run check:types`, `npm run check:lint`.

---

## Task 1 — Re-export `colorToString` from the decorations barrel

`src/decorations/ui/color.ts` already exports `colorToString(color: ColorSettings): string`. The nav-row component needs it; the barrel doesn't expose it yet.

**Files:**

- Modify: `src/decorations/index.ts`

- [ ] **Step 1: Add the export**

Insert next to the existing `CellDecoration` / `DecorationPreview` exports:

```ts
export { colorToString } from "./ui/color";
```

- [ ] **Step 2: Verify type-check and lint pass**

```bash
npm run check:types
npm run check:lint
```

Expected: both green; the barrel is exported but unused outside (will be consumed in Task 9).

- [ ] **Step 3: Commit**

```bash
git add src/decorations/index.ts
git commit -m "feat(decorations): export colorToString from barrel"
```

---

## Task 2 — Add `navBlockRow` / `navBlock` schemas to `journals/config.ts`

Schemas only — no defaults or `journalConfigSchema` change yet (that lands in Task 3). Reuses the existing `colorSchema` from `@/decorations/config`.

**Files:**

- Modify: `src/journals/config.ts`
- Modify: `src/journals/config.test.ts`

- [ ] **Step 1: Write a failing schema test**

Append to `src/journals/config.test.ts`:

```ts
import { navBlockSchema } from "./config";

describe("navBlockSchema", () => {
  it("accepts a populated nav block", () => {
    const value = {
      type: "create" as const,
      decorateWholeBlock: false,
      rows: [
        {
          template: "{{date}}",
          fontSize: 1,
          bold: false,
          italic: false,
          color: { type: "theme" as const, name: "text-normal" },
          background: { type: "transparent" as const },
          link: "self" as const,
          journal: "",
          addDecorations: false,
        },
      ],
    };
    expect(v.safeParse(navBlockSchema, value).success).toBe(true);
  });

  it("rejects unknown link kinds", () => {
    const value = {
      type: "create" as const,
      decorateWholeBlock: false,
      rows: [
        {
          template: "",
          fontSize: 1,
          bold: false,
          italic: false,
          color: { type: "transparent" as const },
          background: { type: "transparent" as const },
          link: "nonsense" as unknown as "self",
          journal: "",
          addDecorations: false,
        },
      ],
    };
    expect(v.safeParse(navBlockSchema, value).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/journals/config.test.ts
```

Expected: FAIL — `navBlockSchema` is not exported.

- [ ] **Step 3: Add the schemas**

In `src/journals/config.ts`, after the existing `numberingSchema` block but before `journalConfigSchema`, add:

```ts
import { colorSchema } from "@/decorations/config";

const navBlockRowLinkSchema = v.union([
  v.literal("none"),
  v.literal("self"),
  v.literal("journal"),
  v.picklist(["day", "week", "month", "quarter", "year"]),
]);

const navBlockRowSchema = v.object({
  template: v.string(),
  fontSize: v.number(),
  bold: v.boolean(),
  italic: v.boolean(),
  color: colorSchema,
  background: colorSchema,
  link: navBlockRowLinkSchema,
  journal: v.string(),
  addDecorations: v.boolean(),
});

export const navBlockSchema = v.object({
  type: v.picklist(["create", "existing"]),
  rows: v.array(navBlockRowSchema),
  decorateWholeBlock: v.boolean(),
});

export type NavBlockRowLink = v.InferOutput<typeof navBlockRowLinkSchema>;
export type NavBlockRow = v.InferOutput<typeof navBlockRowSchema>;
export type JournalNavBlock = v.InferOutput<typeof navBlockSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/journals/config.test.ts
```

Expected: PASS.

- [ ] **Step 5: Re-export the new types from the journals barrel**

In `src/journals/index.ts`, extend the existing `export type { ... } from "./config"` block to include the three new aliases:

```ts
export type {
  // ...existing exports...
  NavBlockRowLink,
  NavBlockRow,
  JournalNavBlock,
} from "./config";
```

- [ ] **Step 6: Type-check**

```bash
npm run check:types
```

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/journals/config.ts src/journals/config.test.ts src/journals/index.ts
git commit -m "feat(journals): add navBlock schema"
```

---

## Task 3 — Add `navBlock` field to `journalConfigSchema` with empty default

The field is `v.optional` with a generic `{ type: "create", rows: [], decorateWholeBlock: false }` default — same dual-default pattern as `templates`, `folder`, etc. The richer per-write-type rows land in Task 4.

**Files:**

- Modify: `src/journals/config.ts`
- Modify: `src/journals/config.test.ts`

- [ ] **Step 1: Write a failing test for the default**

Append to `src/journals/config.test.ts`:

```ts
describe("journalConfigSchema navBlock default", () => {
  it("fills navBlock with an empty-create default when absent", () => {
    const cfg = journalDefaultsFor({ type: "day" }, "daily");
    const { navBlock: _omit, ...withoutNavBlock } = cfg;
    const parsed = v.safeParse(journalConfigSchema, withoutNavBlock);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.output.navBlock).toEqual({
        type: "create",
        rows: [],
        decorateWholeBlock: false,
      });
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/journals/config.test.ts -t "fills navBlock"
```

Expected: FAIL — `navBlock` is unknown property; the destructure of `cfg.navBlock` is also a type error (no field yet).

- [ ] **Step 3: Add `navBlock` to `journalConfigSchema`**

In `src/journals/config.ts`, inside the `v.object({ ... })` literal of `journalConfigSchema`, alongside the other `v.optional(...)` fields:

```ts
navBlock: v.optional(navBlockSchema, () => ({
  type: "create" as const,
  rows: [] as NavBlockRow[],
  decorateWholeBlock: false,
})),
```

Also add the field to the `journalDefaultsFor` returned object (will be replaced with richer defaults in Task 4):

```ts
navBlock: { type: "create", rows: [], decorateWholeBlock: false },
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/journals/config.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journals/config.ts src/journals/config.test.ts
git commit -m "feat(journals): add navBlock to journal config schema with empty default"
```

---

## Task 4 — Per-write-type default rows in `journalDefaultsFor`

Port v2's `defaultNavBlocks` 1:1 from `src/_old-code/journals/journal-defaults.ts` (lines 20–163) into `journalDefaultsFor`.

**Files:**

- Modify: `src/journals/config.ts`
- Modify: `src/journals/config.test.ts`

- [ ] **Step 1: Write failing tests for each write type**

Append to `src/journals/config.test.ts`:

```ts
describe("journalDefaultsFor navBlock per write type", () => {
  it("day journal has weekday + big day-number + relative + week + month + year rows", () => {
    const { navBlock } = journalDefaultsFor({ type: "day" }, "daily");
    expect(navBlock.type).toBe("create");
    expect(navBlock.decorateWholeBlock).toBe(false);
    expect(navBlock.rows.map((r) => r.template)).toEqual([
      "{{date:ddd}}",
      "{{date:D}}",
      "{{relative_date}}",
      "{{date:[W]w}}",
      "{{date:MMMM}}",
      "{{date:YYYY}}",
    ]);
    expect(navBlock.rows[1]).toMatchObject({ fontSize: 3, bold: true, link: "self", addDecorations: true });
  });

  it("week journal has big week + relative + month + year rows", () => {
    const { navBlock } = journalDefaultsFor({ type: "week" }, "weekly");
    expect(navBlock.rows.map((r) => r.template)).toEqual([
      "{{date:[W]w}}",
      "{{relative_date}}",
      "{{date:MMMM}}",
      "{{date:YYYY}}",
    ]);
    expect(navBlock.rows[0]).toMatchObject({ fontSize: 3, bold: true, link: "self", addDecorations: true });
  });

  it("month journal has big month + relative + year rows", () => {
    const { navBlock } = journalDefaultsFor({ type: "month" }, "monthly");
    expect(navBlock.rows.map((r) => r.template)).toEqual(["{{date:MMMM}}", "{{relative_date}}", "{{date:YYYY}}"]);
    expect(navBlock.rows[0]).toMatchObject({ fontSize: 3, bold: true, link: "self", addDecorations: true });
  });

  it("quarter journal has big quarter + relative + year rows", () => {
    const { navBlock } = journalDefaultsFor({ type: "quarter" }, "quarterly");
    expect(navBlock.rows.map((r) => r.template)).toEqual(["{{date:[Q]Q}}", "{{relative_date}}", "{{date:YYYY}}"]);
    expect(navBlock.rows[0]).toMatchObject({ fontSize: 3, bold: true, link: "self", addDecorations: true });
  });

  it("year journal has big year + relative rows", () => {
    const { navBlock } = journalDefaultsFor({ type: "year" }, "yearly");
    expect(navBlock.rows.map((r) => r.template)).toEqual(["{{date:YYYY}}", "{{relative_date}}"]);
    expect(navBlock.rows[0]).toMatchObject({ fontSize: 3, bold: true, link: "self", addDecorations: true });
  });

  it("custom journal has big title + start_date + 'to' + end_date rows", () => {
    const { navBlock } = journalDefaultsFor(
      { type: "custom", every: "week", duration: 2, anchorDate: "2024-01-01" as AnchorString },
      "biweekly",
    );
    expect(navBlock.rows.map((r) => r.template)).toEqual([
      "{{journal_name}} {{index}}",
      "{{start_date}}",
      "to",
      "{{end_date}}",
    ]);
    expect(navBlock.rows[0]).toMatchObject({ fontSize: 3, bold: true, link: "self", addDecorations: true });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/journals/config.test.ts -t "navBlock per write type"
```

Expected: all six tests FAIL — `navBlock.rows` is currently empty.

- [ ] **Step 3: Add the shared row fragments and per-type lookup**

In `src/journals/config.ts`, above `journalDefaultsFor`:

```ts
const emptyNavRow: NavBlockRow = {
  template: "",
  fontSize: 1,
  bold: false,
  italic: false,
  link: "none",
  journal: "",
  color: { type: "theme", name: "text-normal" },
  background: { type: "transparent" },
  addDecorations: false,
};

const rowNavWeek: NavBlockRow = { ...emptyNavRow, template: "{{date:[W]w}}", link: "week" };
const rowNavMonth: NavBlockRow = { ...emptyNavRow, template: "{{date:MMMM}}", link: "month" };
const rowNavYear: NavBlockRow = { ...emptyNavRow, template: "{{date:YYYY}}", link: "year" };
const rowNavRelative: NavBlockRow = { ...emptyNavRow, template: "{{relative_date}}", fontSize: 0.7 };

const defaultNavBlocks: Record<JournalWrite["type"], JournalNavBlock> = {
  day: {
    type: "create",
    decorateWholeBlock: false,
    rows: [
      { ...emptyNavRow, template: "{{date:ddd}}" },
      { ...emptyNavRow, template: "{{date:D}}", fontSize: 3, bold: true, link: "self", addDecorations: true },
      rowNavRelative,
      rowNavWeek,
      rowNavMonth,
      rowNavYear,
    ],
  },
  week: {
    type: "create",
    decorateWholeBlock: false,
    rows: [
      { ...rowNavWeek, fontSize: 3, bold: true, link: "self", addDecorations: true },
      rowNavRelative,
      rowNavMonth,
      rowNavYear,
    ],
  },
  month: {
    type: "create",
    decorateWholeBlock: false,
    rows: [{ ...rowNavMonth, fontSize: 3, bold: true, link: "self", addDecorations: true }, rowNavRelative, rowNavYear],
  },
  quarter: {
    type: "create",
    decorateWholeBlock: false,
    rows: [
      { ...emptyNavRow, template: "{{date:[Q]Q}}", fontSize: 3, bold: true, link: "self", addDecorations: true },
      rowNavRelative,
      rowNavYear,
    ],
  },
  year: {
    type: "create",
    decorateWholeBlock: false,
    rows: [{ ...rowNavYear, fontSize: 3, bold: true, link: "self", addDecorations: true }, rowNavRelative],
  },
  custom: {
    type: "create",
    decorateWholeBlock: false,
    rows: [
      {
        ...emptyNavRow,
        template: "{{journal_name}} {{index}}",
        link: "self",
        fontSize: 3,
        bold: true,
        addDecorations: true,
      },
      { ...emptyNavRow, template: "{{start_date}}" },
      { ...emptyNavRow, template: "to" },
      { ...emptyNavRow, template: "{{end_date}}" },
    ],
  },
};
```

Then in the body of `journalDefaultsFor`, replace the placeholder `navBlock` line from Task 3 with:

```ts
navBlock: defaultNavBlocks[write.type],
```

- [ ] **Step 4: Run all tests in the file**

```bash
npx vitest run src/journals/config.test.ts
```

Expected: every test PASSES, including the existing "accepts the unmodified defaults" suite (the new rows must round-trip through `journalConfigSchema`).

- [ ] **Step 5: Commit**

```bash
git add src/journals/config.ts src/journals/config.test.ts
git commit -m "feat(journals): per-write-type default nav-block rows"
```

---

## Task 5 — Add the not-connected i18n message

**Files:**

- Modify: `messages/en.json`

- [ ] **Step 1: Append the key**

Open `messages/en.json` and add (alphabetically near other `code_blocks_*`/short keys; placement isn't enforced):

```json
"code_blocks_nav_not_connected": "Note is not connected to a journal",
```

- [ ] **Step 2: Regenerate the paraglide bundle**

```bash
npm run check:types
```

This triggers paraglide regeneration via the dev tooling; if a separate step is required in this repo, run `npx paraglide-js compile --project ./project.inlang` first. Expected: type-check passes and `m.code_blocks_nav_not_connected` becomes available.

- [ ] **Step 3: Commit**

```bash
git add messages/en.json src/i18n/paraglide
git commit -m "feat(i18n): add code-blocks nav not-connected message"
```

(If `src/i18n/paraglide` is not git-tracked in this repo, omit it — `messages/en.json` is the source of truth.)

---

## Task 6 — Pure helper `period-for-journal`

Builds the right `Period` subclass for a journal's write type; custom journals collapse to `DayPeriod` (matches `periodMatchesWrite("day", "custom") === true`).

**Files:**

- Create: `src/code-blocks/nav/period-for-journal.ts`
- Create: `src/code-blocks/nav/period-for-journal.test.ts`

- [ ] **Step 1: Write failing tests (one per write type)**

```ts
// src/code-blocks/nav/period-for-journal.test.ts
import { describe, expect, it } from "vitest";

import { type AnchorString } from "@/calendar";

import { periodForJournal } from "./period-for-journal";

const anchor = "2026-05-27" as AnchorString;

describe("periodForJournal", () => {
  it("returns a DayPeriod for write.type === 'day'", () => {
    expect(periodForJournal({ type: "day" }, anchor).kind).toBe("day");
  });

  it("returns a WeekPeriod for write.type === 'week'", () => {
    expect(periodForJournal({ type: "week" }, anchor).kind).toBe("week");
  });

  it("returns a MonthPeriod for write.type === 'month'", () => {
    expect(periodForJournal({ type: "month" }, anchor).kind).toBe("month");
  });

  it("returns a QuarterPeriod for write.type === 'quarter'", () => {
    expect(periodForJournal({ type: "quarter" }, anchor).kind).toBe("quarter");
  });

  it("returns a YearPeriod for write.type === 'year'", () => {
    expect(periodForJournal({ type: "year" }, anchor).kind).toBe("year");
  });

  it("collapses custom writes to a DayPeriod", () => {
    expect(periodForJournal({ type: "custom", every: "week", duration: 2, anchorDate: anchor }, anchor).kind).toBe(
      "day",
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/code-blocks/nav/period-for-journal.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
// src/code-blocks/nav/period-for-journal.ts
import { match } from "ts-pattern";

import {
  CalendarDate,
  DayPeriod,
  MonthPeriod,
  QuarterPeriod,
  WeekPeriod,
  YearPeriod,
  type AnchorString,
  type Period,
} from "@/calendar";
import type { JournalWrite } from "@/journals";

export function periodForJournal(write: JournalWrite, anchor: AnchorString): Period {
  const date = CalendarDate.fromAnchor(anchor);
  return match(write)
    .with({ type: "day" }, () => DayPeriod.containing(date))
    .with({ type: "week" }, () => WeekPeriod.containing(date))
    .with({ type: "month" }, () => MonthPeriod.containing(date))
    .with({ type: "quarter" }, () => QuarterPeriod.containing(date))
    .with({ type: "year" }, () => YearPeriod.containing(date))
    .with({ type: "custom" }, () => DayPeriod.containing(date))
    .exhaustive();
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
npx vitest run src/code-blocks/nav/period-for-journal.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/code-blocks/nav/period-for-journal.ts src/code-blocks/nav/period-for-journal.test.ts
git commit -m "feat(code-blocks): periodForJournal helper for nav block"
```

---

## Task 7 — Pure helper `resolveLinkTarget`

Maps a row's `link` plus context to the list of journals to open (or "self" / "none").

**Files:**

- Create: `src/code-blocks/nav/link-targets.ts`
- Create: `src/code-blocks/nav/link-targets.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/code-blocks/nav/link-targets.test.ts
import { describe, expect, it } from "vitest";

import { type AnchorString } from "@/calendar";
import { type VaultPath } from "@/infrastructure/host";
import { Option } from "@/infrastructure/result";
import { type JournalConfig, type JournalEntry, type NavBlockRow, journalDefaultsFor } from "@/journals";

import { resolveLinkTarget } from "./link-targets";

const noteJournal: JournalConfig = journalDefaultsFor({ type: "day" }, "daily");
const noteEntry: Option<JournalEntry> = Option.some({
  journalName: "daily",
  anchor: "2026-05-27" as AnchorString,
  path: "Daily/2026-05-27.md" as VaultPath,
});
const baseRow: NavBlockRow = {
  template: "",
  fontSize: 1,
  bold: false,
  italic: false,
  color: { type: "transparent" },
  background: { type: "transparent" },
  link: "none",
  journal: "",
  addDecorations: false,
};

describe("resolveLinkTarget", () => {
  it("returns kind 'none' for link 'none'", () => {
    expect(resolveLinkTarget({ ...baseRow, link: "none" }, noteJournal, [noteJournal], noteEntry).kind).toBe("none");
  });

  it("returns kind 'self' with the entry path for link 'self' when entry exists", () => {
    const result = resolveLinkTarget({ ...baseRow, link: "self" }, noteJournal, [noteJournal], noteEntry);
    expect(result).toEqual({ kind: "self", path: "Daily/2026-05-27.md" });
  });

  it("collapses link 'self' to 'none' when entry is absent", () => {
    expect(resolveLinkTarget({ ...baseRow, link: "self" }, noteJournal, [noteJournal], Option.none()).kind).toBe(
      "none",
    );
  });

  it("returns kind 'open' with the row's journal for link 'journal' when journal is set", () => {
    const result = resolveLinkTarget(
      { ...baseRow, link: "journal", journal: "weekly" },
      noteJournal,
      [noteJournal],
      noteEntry,
    );
    expect(result).toEqual({ kind: "open", journalNames: ["weekly"] });
  });

  it("collapses link 'journal' with empty name to 'none'", () => {
    expect(
      resolveLinkTarget({ ...baseRow, link: "journal", journal: "" }, noteJournal, [noteJournal], noteEntry).kind,
    ).toBe("none");
  });

  it("returns shelf journals matching the period kind", () => {
    const weekly = journalDefaultsFor({ type: "week" }, "weekly");
    const yearly = journalDefaultsFor({ type: "year" }, "yearly");
    const result = resolveLinkTarget(
      { ...baseRow, link: "week" },
      noteJournal,
      [noteJournal, weekly, yearly],
      noteEntry,
    );
    expect(result).toEqual({ kind: "open", journalNames: ["weekly"] });
  });

  it("collapses to 'none' when no shelf journal matches the period kind", () => {
    expect(resolveLinkTarget({ ...baseRow, link: "year" }, noteJournal, [noteJournal], noteEntry).kind).toBe("none");
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

```bash
npx vitest run src/code-blocks/nav/link-targets.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
// src/code-blocks/nav/link-targets.ts
import { match, P } from "ts-pattern";

import { type VaultPath } from "@/infrastructure/host";
import { type Option } from "@/infrastructure/result";
import { type JournalConfig, type JournalEntry, type NavBlockRow } from "@/journals";

export type LinkTarget =
  | { readonly kind: "none" }
  | { readonly kind: "self"; readonly path: VaultPath }
  | { readonly kind: "open"; readonly journalNames: readonly string[] };

export function resolveLinkTarget(
  row: NavBlockRow,
  _noteJournal: JournalConfig,
  shelfJournals: readonly JournalConfig[],
  noteEntry: Option<JournalEntry>,
): LinkTarget {
  return match(row.link)
    .with("none", () => ({ kind: "none" }) as const)
    .with("self", () =>
      noteEntry.isSome() ? ({ kind: "self", path: noteEntry.value.path } as const) : ({ kind: "none" } as const),
    )
    .with("journal", () =>
      row.journal.length > 0
        ? ({ kind: "open", journalNames: [row.journal] as const } as const)
        : ({ kind: "none" } as const),
    )
    .with(P.union("day", "week", "month", "quarter", "year"), (kind) => {
      const matches = shelfJournals.filter((j) => j.write.type === kind).map((j) => j.name);
      return matches.length > 0 ? ({ kind: "open", journalNames: matches } as const) : ({ kind: "none" } as const);
    })
    .exhaustive();
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
npx vitest run src/code-blocks/nav/link-targets.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/code-blocks/nav/link-targets.ts src/code-blocks/nav/link-targets.test.ts
git commit -m "feat(code-blocks): resolveLinkTarget for nav rows"
```

---

## Task 8 — Pure helper `buildNavRowContext`

Builds the `TemplateContext` with v2's six variables (`date`, `start_date`, `end_date`, `relative_date`, `journal_name`, `index`).

**Files:**

- Create: `src/code-blocks/nav/nav-row-context.ts`
- Create: `src/code-blocks/nav/nav-row-context.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/code-blocks/nav/nav-row-context.test.ts
import { beforeAll, describe, expect, it } from "vitest";

import { type AnchorString } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import { initLocale } from "@/i18n";
import { Container } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { LoggerFactory, LoggerFactoryToken } from "@/infrastructure/logger";
import { Option } from "@/infrastructure/result";
import {
  CycleService,
  JournalsIndex,
  JournalsRepository,
  type JournalConfig,
  type JournalEntry,
  journalDefaultsFor,
} from "@/journals";
import { fakeRepo } from "@/journals/testing";

import { buildNavRowContext } from "./nav-row-context";

installTestCalendar();

function makeCycle(journals: Record<string, JournalConfig>): CycleService {
  const c = new Container();
  c.register(LoggerFactoryToken).useClass(LoggerFactory);
  c.register(JournalsRepository).useValue(fakeRepo(journals));
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  return c.resolve(CycleService);
}

const today = "2026-05-27" as AnchorString;
const refDate = "2026-05-26" as AnchorString;

describe("buildNavRowContext", () => {
  beforeAll(() => initLocale("en"));

  const dailyConfig = journalDefaultsFor({ type: "day" }, "daily");
  const cycle = makeCycle({ daily: dailyConfig });

  it("exposes refDate as the `date` variable using the journal's dateFormat", () => {
    const ctx = buildNavRowContext({ journal: dailyConfig, refDate, entry: Option.none(), cycle, today });
    const spec = ctx.get("date");
    expect(spec?.kind).toBe("date");
    if (spec?.kind === "date") {
      expect(spec.value.toAnchor()).toBe("2026-05-26");
      expect(spec.defaultFormat).toBe(dailyConfig.dateFormat);
    }
  });

  it("renders journal_name as the journal's name", () => {
    const ctx = buildNavRowContext({ journal: dailyConfig, refDate, entry: Option.none(), cycle, today });
    expect(ctx.get("journal_name")).toEqual({ kind: "string", value: "daily" });
  });

  it("renders relative_date for a fixed journal", () => {
    const ctx = buildNavRowContext({ journal: dailyConfig, refDate, entry: Option.none(), cycle, today });
    expect(ctx.get("relative_date")).toEqual({ kind: "string", value: "Yesterday" });
  });

  it("renders relative_date as an empty string for a custom journal", () => {
    const customConfig = journalDefaultsFor(
      { type: "custom", every: "week", duration: 2, anchorDate: "2024-01-01" as AnchorString },
      "biweekly",
    );
    const cycleCustom = makeCycle({ biweekly: customConfig });
    const ctx = buildNavRowContext({
      journal: customConfig,
      refDate,
      entry: Option.none(),
      cycle: cycleCustom,
      today,
    });
    expect(ctx.get("relative_date")).toEqual({ kind: "string", value: "" });
  });

  it("populates index from the entry numbers when present", () => {
    const entry: JournalEntry = {
      journalName: "daily",
      anchor: refDate,
      path: "Daily/2026-05-26.md" as VaultPath,
      numbers: { index: 42 },
    };
    const ctx = buildNavRowContext({ journal: dailyConfig, refDate, entry: Option.some(entry), cycle, today });
    expect(ctx.get("index")).toEqual({ kind: "number", value: 42 });
  });

  it("omits index when entry has no numbers", () => {
    const ctx = buildNavRowContext({ journal: dailyConfig, refDate, entry: Option.none(), cycle, today });
    expect(ctx.get("index")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

```bash
npx vitest run src/code-blocks/nav/nav-row-context.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
// src/code-blocks/nav/nav-row-context.ts
import { match } from "ts-pattern";

import { CalendarDate, relativeDate, type AnchorString, type PeriodKind } from "@/calendar";
import type { Option } from "@/infrastructure/result";
import type { CycleService, JournalConfig, JournalEntry, JournalWrite } from "@/journals";
import { TemplateContext } from "@/templates";

export interface NavRowContextInputs {
  readonly journal: JournalConfig;
  readonly refDate: AnchorString;
  readonly entry: Option<JournalEntry>;
  readonly cycle: CycleService;
  readonly today: AnchorString;
}

function fixedPeriodKindFor(write: JournalWrite): Exclude<PeriodKind, "decade"> | null {
  return match(write)
    .with({ type: "day" }, () => "day" as const)
    .with({ type: "week" }, () => "week" as const)
    .with({ type: "month" }, () => "month" as const)
    .with({ type: "quarter" }, () => "quarter" as const)
    .with({ type: "year" }, () => "year" as const)
    .with({ type: "custom" }, () => null)
    .exhaustive();
}

export function buildNavRowContext(inputs: NavRowContextInputs): TemplateContext {
  const { journal, refDate, entry, cycle, today } = inputs;
  const refCalendarDate = CalendarDate.fromAnchor(refDate);
  const startDate = cycle.startOf(journal.name, refDate).getOr(refCalendarDate);
  const endDate = cycle.endOf(journal.name, refDate).getOr(refCalendarDate);
  const periodKind = fixedPeriodKindFor(journal.write);
  const relative = periodKind === null ? "" : relativeDate(periodKind, refDate, today);

  let ctx = TemplateContext.empty()
    .date("date", refCalendarDate, journal.dateFormat)
    .date("start_date", startDate, journal.dateFormat)
    .date("end_date", endDate, journal.dateFormat)
    .string("relative_date", relative)
    .string("journal_name", journal.name);

  if (entry.isSome()) {
    const indexValue = entry.value.numbers?.["index"];
    if (typeof indexValue === "number") ctx = ctx.number("index", indexValue);
  }
  return ctx;
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
npx vitest run src/code-blocks/nav/nav-row-context.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/code-blocks/nav/nav-row-context.ts src/code-blocks/nav/nav-row-context.test.ts
git commit -m "feat(code-blocks): buildNavRowContext for nav rows"
```

---

## Task 9 — `NavBlockRow.vue`

Renders one row: template text via `TemplateEngine`, inline styles, click/contextmenu/hover handlers, optional `<CellDecoration>` wrapper when `addDecorations`. Per the spec: no standalone test — coverage lives in the `NavigationCodeBlock` integration suite (Tasks 11–17).

**Files:**

- Create: `src/code-blocks/nav/ui/NavBlockRow.vue`

- [ ] **Step 1: Implement the component**

```vue
<script setup lang="ts">
import { computed } from "vue";

import { Clock, type AnchorString, type Period } from "@/calendar";
import { CellDecoration, colorToString } from "@/decorations";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { defineOpenMode, WorkspaceService, type VaultPath } from "@/infrastructure/host";
import { CycleService, JournalsIndex, JournalsRepository, OpenDateFlow, ShelvesRepository } from "@/journals";
import type { JournalConfig, JournalEntry, NavBlockRow } from "@/journals";
import { TemplateEngine } from "@/templates";
import { Menu } from "obsidian";

import { resolveLinkTarget } from "../link-targets";
import { buildNavRowContext } from "../nav-row-context";

const props = defineProps<{
  journal: JournalConfig;
  row: NavBlockRow;
  refDate: AnchorString;
  period: Period;
  preventNavigation?: boolean;
}>();

const journals = useService(JournalsRepository);
const index = useService(JournalsIndex);
const cycle = useService(CycleService);
const shelves = useService(ShelvesRepository);
const engine = useService(TemplateEngine);
const flows = useService(Flows);
const workspace = useService(WorkspaceService);

const today = computed(() => Clock.now().format("YYYY-MM-DD") as AnchorString);

const entry = computed(() => index.entryByAnchor(props.journal.name, props.refDate));

const shelfJournals = computed<readonly JournalConfig[]>(() => {
  const all = [...journals.find().list()];
  const owning = [...shelves.find().list()].find((s) => s.journals.includes(props.journal.name));
  if (!owning) return [];
  return all.filter((j) => owning.journals.includes(j.name));
});

const target = computed(() => resolveLinkTarget(props.row, props.journal, shelfJournals.value, entry.value));

const text = computed(() =>
  engine.renderString(
    props.row.template,
    buildNavRowContext({
      journal: props.journal,
      refDate: props.refDate,
      entry: entry.value,
      cycle,
      today: today.value,
    }),
  ),
);

const fontSize = computed(() => `${props.row.fontSize}em`);
const fontWeight = computed(() => (props.row.bold ? "bold" : "normal"));
const fontStyle = computed(() => (props.row.italic ? "italic" : "normal"));
const color = computed(() => colorToString(props.row.color));
const background = computed(() => colorToString(props.row.background));
const cursor = computed(() => (target.value.kind === "none" ? "default" : "pointer"));

function entriesForOpen(anchor: AnchorString, names: readonly string[]): readonly JournalEntry[] {
  const out: JournalEntry[] = [];
  for (const name of names) {
    const opt = index.entryByAnchor(name, anchor);
    if (opt.isSome()) out.push(opt.value);
  }
  return out;
}

function onClick(event: MouseEvent): void {
  if (props.preventNavigation) return;
  const t = target.value;
  if (t.kind === "none") return;
  if (t.kind === "self") {
    void workspace.openNote(t.path, defineOpenMode(event));
    return;
  }
  void flows.invoke(OpenDateFlow, {
    anchor: props.refDate,
    journalNames: [...t.journalNames],
    openMode: defineOpenMode(event),
  });
}

function onContextMenu(event: MouseEvent): void {
  if (props.preventNavigation) return;
  const t = target.value;
  if (t.kind === "none") return;
  const paths: VaultPath[] =
    t.kind === "self" ? [t.path] : entriesForOpen(props.refDate, t.journalNames).map((e) => e.path);
  if (paths.length === 0) return;
  if (paths.length === 1) {
    const [first] = paths;
    if (first !== undefined) workspace.openFileMenu(first, event);
    return;
  }
  const menu = new Menu();
  for (const path of paths) {
    menu.addItem((item) => {
      item.setTitle(path).onClick(() => workspace.openFileMenu(path, event));
    });
  }
  menu.showAtMouseEvent(event);
}

function onPointerEnter(event: PointerEvent): void {
  if (props.preventNavigation) return;
  if (!event.ctrlKey && !event.metaKey) return;
  const t = target.value;
  if (t.kind === "none") return;
  const path = t.kind === "self" ? t.path : entriesForOpen(props.refDate, t.journalNames).map((e) => e.path)[0];
  if (path === undefined) return;
  workspace.triggerHoverPreview(path, event);
}
</script>

<template>
  <div class="nav-row" @click.prevent="onClick" @contextmenu="onContextMenu" @pointerenter="onPointerEnter">
    <CellDecoration v-if="row.addDecorations" :period="period">{{ text }}</CellDecoration>
    <template v-else>{{ text }}</template>
  </div>
</template>

<style scoped>
.nav-row {
  font-size: v-bind(fontSize);
  font-weight: v-bind(fontWeight);
  font-style: v-bind(fontStyle);
  color: v-bind(color);
  background-color: v-bind(background);
  cursor: v-bind(cursor);
  position: relative;
}
</style>
```

- [ ] **Step 2: Verify type-check and lint pass**

```bash
npm run check:types
npm run check:lint
```

Expected: green. The component is not yet mounted anywhere; it compiles in isolation.

- [ ] **Step 3: Commit**

```bash
git add src/code-blocks/nav/ui/NavBlockRow.vue
git commit -m "feat(code-blocks): NavBlockRow component"
```

---

## Task 10 — `NavBlock.vue`

Renders a column: the list of `NavBlockRow`, optionally wrapped in `<CellDecoration>` when `decorateWholeBlock`.

**Files:**

- Create: `src/code-blocks/nav/ui/NavBlock.vue`

- [ ] **Step 1: Implement the component**

```vue
<script setup lang="ts">
import { type AnchorString, type Period } from "@/calendar";
import { CellDecoration } from "@/decorations";
import type { JournalConfig } from "@/journals";

import NavBlockRow from "./NavBlockRow.vue";

const props = defineProps<{
  journal: JournalConfig;
  refDate: AnchorString;
  period: Period;
  preventNavigation?: boolean;
}>();
</script>

<template>
  <div class="nav-block">
    <CellDecoration v-if="journal.navBlock.decorateWholeBlock" :period="period" class="nav-block-inner">
      <div v-for="(row, index) of journal.navBlock.rows" :key="index">
        <NavBlockRow :journal :row :ref-date="refDate" :period :prevent-navigation="preventNavigation" />
      </div>
    </CellDecoration>
    <template v-else>
      <div v-for="(row, index) of journal.navBlock.rows" :key="index">
        <NavBlockRow :journal :row :ref-date="refDate" :period :prevent-navigation="preventNavigation" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.nav-block {
  display: flex;
  flex-direction: column;
  text-align: center;
}
</style>
```

- [ ] **Step 2: Verify type-check and lint pass**

```bash
npm run check:types
npm run check:lint
```

Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/code-blocks/nav/ui/NavBlock.vue
git commit -m "feat(code-blocks): NavBlock column component"
```

---

## Task 11 — `NavigationCodeBlock.vue` skeleton + not-connected fallback test

Establish the test harness and prove the "no journal" path. Subsequent tasks (12–17) add tests + impl incrementally.

**Files:**

- Create: `src/code-blocks/nav/ui/NavigationCodeBlock.vue`
- Create: `src/code-blocks/nav/ui/NavigationCodeBlock.test.ts`

- [ ] **Step 1: Write the failing not-connected test**

```ts
// src/code-blocks/nav/ui/NavigationCodeBlock.test.ts
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { initLocale } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import {
  NoteMetadataService,
  NotesService,
  WorkspaceService,
  type NotesEvents,
  type VaultPath,
} from "@/infrastructure/host";
import { FakeNoteMetadataService } from "@/infrastructure/host/testing";
import { LoggerFactory, LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult, Ok, Option } from "@/infrastructure/result";
import { DecorationEngine } from "@/decorations";
import {
  CycleService,
  JournalsIndex,
  JournalsRepository,
  OpenDateFlow,
  type JournalConfig,
  type JournalEntry,
  journalDefaultsFor,
} from "@/journals";
import { fakeRepo } from "@/journals/testing";
import { ShelvesRepository } from "@/shelves";
import { TemplateEngine } from "@/templates";
import { installTestCalendar } from "@/calendar/testing";

import NavigationCodeBlock from "./NavigationCodeBlock.vue";

installTestCalendar();

class FakeJournalsIndex {
  byPath = new Map<string, JournalEntry>();
  byAnchor = new Map<string, JournalEntry>();
  nextByAnchor = new Map<string, VaultPath>();
  prevByAnchor = new Map<string, VaultPath>();
  events = createNanoEvents();

  entryByPath(path: string) {
    return Option.fromNullable(this.byPath.get(path));
  }
  entryByAnchor(name: string, anchor: string) {
    return Option.fromNullable(this.byAnchor.get(`${name}::${anchor}`));
  }
  findNext(name: string, anchor: string) {
    return Option.fromNullable(this.nextByAnchor.get(`${name}::${anchor}`));
  }
  findPrevious(name: string, anchor: string) {
    return Option.fromNullable(this.prevByAnchor.get(`${name}::${anchor}`));
  }
}

class FakeWorkspace {
  openNoteCalls: { path: VaultPath; mode: unknown }[] = [];
  hoverCalls: { path: VaultPath }[] = [];
  fileMenuCalls: { path: VaultPath }[] = [];
  openNote(path: VaultPath, mode?: unknown) {
    this.openNoteCalls.push({ path, mode });
    return AsyncResult.ok(undefined);
  }
  triggerHoverPreview(path: VaultPath) {
    this.hoverCalls.push({ path });
  }
  openFileMenu(path: VaultPath) {
    this.fileMenuCalls.push({ path });
  }
}

class FakeFlows {
  calls: { parameters: unknown }[] = [];
  invoke(_flow: unknown, parameters: unknown) {
    this.calls.push({ parameters });
    return AsyncResult.ok({ path: "x" as VaultPath, created: false });
  }
}

class FakeShelves {
  shelves: { name: string; journals: string[] }[] = [];
  find() {
    return { list: () => this.shelves[Symbol.iterator]() };
  }
}

interface Harness {
  container: Container;
  journalsRepo: JournalsRepository;
  index: FakeJournalsIndex;
  workspace: FakeWorkspace;
  flows: FakeFlows;
  shelves: FakeShelves;
}

function buildHarness(journals: Record<string, JournalConfig>): Harness {
  const container = new Container();
  container.register(LoggerFactoryToken).useClass(LoggerFactory);
  const journalsRepo = fakeRepo(journals);
  container.register(JournalsRepository).useValue(journalsRepo);
  const index = new FakeJournalsIndex();
  container.register(JournalsIndex).useValue(index as unknown as JournalsIndex);
  container.register(CycleService).useClass(CycleService);
  const shelves = new FakeShelves();
  container.register(ShelvesRepository).useValue(shelves as unknown as ShelvesRepository);
  const workspace = new FakeWorkspace();
  container.register(WorkspaceService).useValue(workspace as unknown as WorkspaceService);
  const flows = new FakeFlows();
  container.register(Flows).useValue(flows as unknown as Flows);
  container.register(OpenDateFlow).useValue({} as OpenDateFlow);
  const fakeMetadata = new FakeNoteMetadataService();
  container.register(NoteMetadataService).useValue(fakeMetadata as unknown as NoteMetadataService);
  container.register(NotesService).useValue({ events: createNanoEvents<NotesEvents>() } as unknown as NotesService);
  container.register(DecorationEngine).useClass(DecorationEngine);
  container.register(TemplateEngine).useClass(TemplateEngine);
  return { container, journalsRepo, index, workspace, flows, shelves };
}

function mount(h: Harness, path: string) {
  return render(NavigationCodeBlock, {
    props: { path: path as VaultPath, config: {} },
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, h.container);
          },
        },
      ],
    },
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeAll(() => initLocale("en"));

describe("NavigationCodeBlock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T10:00:00Z"));
  });

  it("renders the not-connected message when the path has no journal entry", () => {
    const h = buildHarness({});
    mount(h, "Random/Note.md");
    expect(screen.getByText("Note is not connected to a journal")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/code-blocks/nav/ui/NavigationCodeBlock.test.ts
```

Expected: FAIL — `NavigationCodeBlock.vue` does not exist.

- [ ] **Step 3: Implement the skeleton**

```vue
<!-- src/code-blocks/nav/ui/NavigationCodeBlock.vue -->
<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { type CodeBlockProps } from "@/infrastructure/host";
import { JournalsIndex, JournalsRepository } from "@/journals";

const { path } = defineProps<CodeBlockProps<Record<string, never>>>();

const index = useService(JournalsIndex);
const journals = useService(JournalsRepository);

const entry = computed(() => index.entryByPath(path));
const journal = computed(() => (entry.value.isSome() ? journals.get(entry.value.value.journalName) : null));
const isConnected = computed(() => entry.value.isSome() && journal.value?.isSome() === true);
</script>

<template>
  <div v-if="!isConnected" class="journal-nav-not-connected">{{ m.code_blocks_nav_not_connected() }}</div>
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/code-blocks/nav/ui/NavigationCodeBlock.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/code-blocks/nav/ui/NavigationCodeBlock.vue src/code-blocks/nav/ui/NavigationCodeBlock.test.ts
git commit -m "feat(code-blocks): nav block skeleton + not-connected fallback"
```

---

## Task 12 — Render prev / current / next columns

Add the three-column rendering for connected notes and the prev/next resolution. Two tests, two modes.

**Files:**

- Modify: `src/code-blocks/nav/ui/NavigationCodeBlock.vue`
- Modify: `src/code-blocks/nav/ui/NavigationCodeBlock.test.ts`

- [ ] **Step 1: Write failing tests for the three columns**

Append to the test file:

```ts
describe("NavigationCodeBlock columns", () => {
  it("renders the current journal date in 'create' mode with prev/next periods from CycleService", () => {
    const daily = journalDefaultsFor({ type: "day" }, "daily");
    const h = buildHarness({ daily });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily"] }];
    mount(h, "Daily/2026-05-27.md");

    const dayNumbers = screen.getAllByText(/^(26|27|28)$/);
    expect(dayNumbers.map((el) => el.textContent).sort()).toEqual(["26", "27", "28"]);
  });

  it("renders empty side columns in 'existing' mode when there are no adjacent existing entries", () => {
    const daily: JournalConfig = { ...journalDefaultsFor({ type: "day" }, "daily") };
    daily.navBlock = { ...daily.navBlock, type: "existing" };
    const h = buildHarness({ daily });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily"] }];
    mount(h, "Daily/2026-05-27.md");

    expect(screen.queryByText("26")).toBeNull();
    expect(screen.queryByText("28")).toBeNull();
    expect(screen.getByText("27")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
npx vitest run src/code-blocks/nav/ui/NavigationCodeBlock.test.ts -t "columns"
```

Expected: FAIL — the component does not render columns yet.

- [ ] **Step 3: Update `NavigationCodeBlock.vue` to render the three columns**

Replace the contents with:

```vue
<script setup lang="ts">
import { computed } from "vue";

import { type AnchorString, type Period } from "@/calendar";
import { useCellDecorations } from "@/decorations";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { type CodeBlockProps } from "@/infrastructure/host";
import { CycleService, JournalsIndex, JournalsRepository } from "@/journals";
import type { JournalConfig } from "@/journals";
import { ShelvesRepository } from "@/shelves";

import { periodForJournal } from "../period-for-journal";

import NavBlock from "./NavBlock.vue";

const { path } = defineProps<CodeBlockProps<Record<string, never>>>();

const index = useService(JournalsIndex);
const journals = useService(JournalsRepository);
const cycle = useService(CycleService);
const shelves = useService(ShelvesRepository);

const entryOpt = computed(() => index.entryByPath(path));
const journalOpt = computed(() => (entryOpt.value.isSome() ? journals.get(entryOpt.value.value.journalName) : null));
const isConnected = computed(() => entryOpt.value.isSome() && journalOpt.value?.isSome() === true);

const journal = computed<JournalConfig | null>(() => (isConnected.value ? journalOpt.value!.value : null));
const currentAnchor = computed<AnchorString | null>(() =>
  entryOpt.value.isSome() ? entryOpt.value.value.anchor : null,
);

const adjacent = computed<{ previous: AnchorString | null; next: AnchorString | null }>(() => {
  const j = journal.value;
  const anchor = currentAnchor.value;
  if (!j || !anchor) return { previous: null, next: null };
  if (j.navBlock.type === "existing") {
    const prevPath = index.findPrevious(j.name, anchor);
    const nextPath = index.findNext(j.name, anchor);
    const previous = prevPath.flatMap((p) => index.entryByPath(p)).map((e) => e.anchor);
    const next = nextPath.flatMap((p) => index.entryByPath(p)).map((e) => e.anchor);
    return { previous: previous.getOr(null as AnchorString | null), next: next.getOr(null as AnchorString | null) };
  }
  return {
    previous: cycle.previousAnchor(j.name, anchor).getOr(null as AnchorString | null),
    next: cycle.nextAnchor(j.name, anchor).getOr(null as AnchorString | null),
  };
});

const periods = computed<Period[]>(() => {
  const j = journal.value;
  if (!j) return [];
  const list: Period[] = [];
  const anchor = currentAnchor.value;
  if (anchor) list.push(periodForJournal(j.write, anchor));
  if (adjacent.value.previous) list.push(periodForJournal(j.write, adjacent.value.previous));
  if (adjacent.value.next) list.push(periodForJournal(j.write, adjacent.value.next));
  return list;
});

const shelfJournalNames = computed<readonly string[]>(() => {
  const j = journal.value;
  if (!j) return [];
  const owning = [...shelves.find().list()].find((s) => s.journals.includes(j.name));
  if (!owning) return [];
  return [...journals.find().list()]
    .filter((other) => owning.journals.includes(other.name) && other.write.type === j.write.type)
    .map((other) => other.name);
});

useCellDecorations(
  () => periods.value,
  () => shelfJournalNames.value,
);
</script>

<template>
  <div v-if="!isConnected" class="journal-nav-not-connected">{{ m.code_blocks_nav_not_connected() }}</div>
  <div v-else-if="journal && currentAnchor" class="nav-view">
    <NavBlock
      v-if="adjacent.previous"
      :journal
      :ref-date="adjacent.previous"
      :period="periodForJournal(journal.write, adjacent.previous)"
    />
    <div v-else class="nav-block-placeholder" />

    <NavBlock :journal :ref-date="currentAnchor" :period="periodForJournal(journal.write, currentAnchor)" />

    <NavBlock
      v-if="adjacent.next"
      :journal
      :ref-date="adjacent.next"
      :period="periodForJournal(journal.write, adjacent.next)"
    />
    <div v-else class="nav-block-placeholder" />
  </div>
</template>

<style scoped>
.nav-view {
  display: flex;
  justify-content: space-around;
  gap: 50px;
  --icon-size: 3em;
}
.nav-block-placeholder {
  flex-basis: 20%;
}
</style>
```

- [ ] **Step 4: Run all tests in the file to verify they pass**

```bash
npx vitest run src/code-blocks/nav/ui/NavigationCodeBlock.test.ts
```

Expected: PASS (not-connected + two column tests).

- [ ] **Step 5: Commit**

```bash
git add src/code-blocks/nav/ui/NavigationCodeBlock.vue src/code-blocks/nav/ui/NavigationCodeBlock.test.ts
git commit -m "feat(code-blocks): nav block renders prev/current/next columns"
```

---

## Task 13 — Arrow buttons + open-on-click

Add prev/next arrow buttons that dispatch `OpenDateFlow`. `existingOnly` mirrors `navBlock.type === "existing"`.

**Files:**

- Modify: `src/code-blocks/nav/ui/NavigationCodeBlock.vue`
- Modify: `src/code-blocks/nav/ui/NavigationCodeBlock.test.ts`

- [ ] **Step 1: Write failing tests**

Append to the test file:

```ts
import userEvent from "@testing-library/user-event";

describe("NavigationCodeBlock arrows", () => {
  it("invokes OpenDateFlow with the previous anchor and existingOnly=false in 'create' mode", async () => {
    const daily = journalDefaultsFor({ type: "day" }, "daily");
    const h = buildHarness({ daily });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily"] }];
    mount(h, "Daily/2026-05-27.md");

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole("button", { name: /previous/i }));

    expect(h.flows.calls).toHaveLength(1);
    const parameters = h.flows.calls[0]?.parameters as {
      anchor: string;
      journalNames: string[];
      existingOnly?: boolean;
    };
    expect(parameters.anchor).toBe("2026-05-26");
    expect(parameters.journalNames).toEqual(["daily"]);
    expect(parameters.existingOnly).toBe(false);
  });

  it("invokes OpenDateFlow with existingOnly=true in 'existing' mode", async () => {
    const daily: JournalConfig = { ...journalDefaultsFor({ type: "day" }, "daily") };
    daily.navBlock = { ...daily.navBlock, type: "existing" };
    const h = buildHarness({ daily });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.index.byPath.set("Daily/2026-05-25.md", {
      journalName: "daily",
      anchor: "2026-05-25" as AnchorString,
      path: "Daily/2026-05-25.md" as VaultPath,
    });
    h.index.prevByAnchor.set("daily::2026-05-27", "Daily/2026-05-25.md" as VaultPath);
    h.shelves.shelves = [{ name: "main", journals: ["daily"] }];
    mount(h, "Daily/2026-05-27.md");

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole("button", { name: /previous/i }));

    const parameters = h.flows.calls[0]?.parameters as { existingOnly?: boolean };
    expect(parameters.existingOnly).toBe(true);
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
npx vitest run src/code-blocks/nav/ui/NavigationCodeBlock.test.ts -t "arrows"
```

Expected: FAIL — no buttons rendered yet.

- [ ] **Step 3: Update `NavigationCodeBlock.vue`**

Add to the `<script setup>`:

```ts
import { Flows } from "@/infrastructure/flows";
import { defineOpenMode } from "@/infrastructure/host";
import { OpenDateFlow } from "@/journals";
import UiIconButton from "@/ui/UiIconButton.vue";
import { m } from "@/i18n";

const flows = useService(Flows);

function openAdjacent(anchor: AnchorString | null, event: MouseEvent): void {
  const j = journal.value;
  if (!j || !anchor) return;
  void flows.invoke(OpenDateFlow, {
    anchor,
    journalNames: [j.name],
    existingOnly: j.navBlock.type === "existing",
    openMode: defineOpenMode(event),
  });
}
```

Add an i18n message in `messages/en.json` for the button names:

```json
"code_blocks_nav_previous": "Previous",
"code_blocks_nav_next": "Next",
```

Update the `<template>` block — replace the existing `<NavBlock v-if="adjacent.previous">...` / `<NavBlock v-if="adjacent.next">...` blocks with:

```vue
<div v-if="adjacent.previous" class="nav-block-relative">
  <NavBlock
    :journal
    :ref-date="adjacent.previous"
    :period="periodForJournal(journal.write, adjacent.previous)"
  />
  <UiIconButton
    icon="arrow-left"
    class="nav-prev"
    :aria-label="m.code_blocks_nav_previous()"
    @click="(event: MouseEvent) => openAdjacent(adjacent.previous, event)"
  />
</div>
<div v-else class="nav-block-placeholder" />

<!-- current block stays unchanged -->

<div v-if="adjacent.next" class="nav-block-relative">
  <UiIconButton
    icon="arrow-right"
    class="nav-next"
    :aria-label="m.code_blocks_nav_next()"
    @click="(event: MouseEvent) => openAdjacent(adjacent.next, event)"
  />
  <NavBlock
    :journal
    :ref-date="adjacent.next"
    :period="periodForJournal(journal.write, adjacent.next)"
  />
</div>
<div v-else class="nav-block-placeholder" />
```

`UiIconButton` uses `<UiButton>` underneath which exposes `aria-label` via the button element; the test query `getByRole("button", { name: /previous/i })` matches it. If `UiIconButton` does not forward `aria-label`, add a `tooltip` prop instead — verify with the test.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/code-blocks/nav/ui/NavigationCodeBlock.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/code-blocks/nav/ui/NavigationCodeBlock.vue src/code-blocks/nav/ui/NavigationCodeBlock.test.ts messages/en.json
git commit -m "feat(code-blocks): nav block arrow buttons open prev/next"
```

---

## Task 14 — Row click link routing

Verifies the per-row `link` kinds (`self`, `journal`, period, `none`) trigger the correct dispatch in `NavBlockRow`.

**Files:**

- Modify: `src/code-blocks/nav/ui/NavigationCodeBlock.test.ts`

- [ ] **Step 1: Write failing tests**

Append:

```ts
describe("NavigationCodeBlock row click routing", () => {
  function dailyWithRows(rows: JournalConfig["navBlock"]["rows"]): JournalConfig {
    const base = journalDefaultsFor({ type: "day" }, "daily");
    return { ...base, navBlock: { ...base.navBlock, rows } };
  }

  it("opens the current entry via WorkspaceService.openNote on a 'self' row click", async () => {
    const journal = dailyWithRows([
      {
        template: "today",
        fontSize: 1,
        bold: false,
        italic: false,
        color: { type: "transparent" },
        background: { type: "transparent" },
        link: "self",
        journal: "",
        addDecorations: false,
      },
    ]);
    const h = buildHarness({ daily: journal });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.index.byAnchor.set("daily::2026-05-27", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily"] }];
    mount(h, "Daily/2026-05-27.md");

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getAllByText("today")[0]!);
    expect(h.workspace.openNoteCalls.map((c) => c.path)).toEqual(["Daily/2026-05-27.md"]);
    expect(h.flows.calls).toHaveLength(0);
  });

  it("invokes OpenDateFlow with the row's journal for link 'journal'", async () => {
    const journal = dailyWithRows([
      {
        template: "go",
        fontSize: 1,
        bold: false,
        italic: false,
        color: { type: "transparent" },
        background: { type: "transparent" },
        link: "journal",
        journal: "weekly",
        addDecorations: false,
      },
    ]);
    const h = buildHarness({ daily: journal, weekly: journalDefaultsFor({ type: "week" }, "weekly") });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily", "weekly"] }];
    mount(h, "Daily/2026-05-27.md");

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getAllByText("go")[0]!);
    const parameters = h.flows.calls[0]?.parameters as { journalNames: string[] };
    expect(parameters.journalNames).toEqual(["weekly"]);
  });

  it("invokes OpenDateFlow with all matching shelf journals for a period kind link", async () => {
    const journal = dailyWithRows([
      {
        template: "wk",
        fontSize: 1,
        bold: false,
        italic: false,
        color: { type: "transparent" },
        background: { type: "transparent" },
        link: "week",
        journal: "",
        addDecorations: false,
      },
    ]);
    const h = buildHarness({
      daily: journal,
      weekly1: journalDefaultsFor({ type: "week" }, "weekly1"),
      weekly2: journalDefaultsFor({ type: "week" }, "weekly2"),
    });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily", "weekly1", "weekly2"] }];
    mount(h, "Daily/2026-05-27.md");

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getAllByText("wk")[0]!);
    const parameters = h.flows.calls[0]?.parameters as { journalNames: string[] };
    expect(parameters.journalNames.sort()).toEqual(["weekly1", "weekly2"]);
  });

  it("does nothing for a 'none' row click", async () => {
    const journal = dailyWithRows([
      {
        template: "static",
        fontSize: 1,
        bold: false,
        italic: false,
        color: { type: "transparent" },
        background: { type: "transparent" },
        link: "none",
        journal: "",
        addDecorations: false,
      },
    ]);
    const h = buildHarness({ daily: journal });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily"] }];
    mount(h, "Daily/2026-05-27.md");

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getAllByText("static")[0]!);
    expect(h.workspace.openNoteCalls).toHaveLength(0);
    expect(h.flows.calls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
npx vitest run src/code-blocks/nav/ui/NavigationCodeBlock.test.ts -t "row click routing"
```

Expected: all four tests PASS — the `NavBlockRow` from Task 9 already implements these handlers.

- [ ] **Step 3: Commit**

```bash
git add src/code-blocks/nav/ui/NavigationCodeBlock.test.ts
git commit -m "test(code-blocks): nav row click routing"
```

---

## Task 15 — Context menu (single + multi target)

**Files:**

- Modify: `src/code-blocks/nav/ui/NavigationCodeBlock.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { fireEvent } from "@testing-library/vue";
import { Menu } from "obsidian";

describe("NavigationCodeBlock context menu", () => {
  it("opens the file menu for a single matching path", async () => {
    const base = journalDefaultsFor({ type: "day" }, "daily");
    const journal: JournalConfig = {
      ...base,
      navBlock: {
        ...base.navBlock,
        rows: [
          {
            template: "today",
            fontSize: 1,
            bold: false,
            italic: false,
            color: { type: "transparent" },
            background: { type: "transparent" },
            link: "self",
            journal: "",
            addDecorations: false,
          },
        ],
      },
    };
    const h = buildHarness({ daily: journal });
    const entry = {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    };
    h.index.byPath.set("Daily/2026-05-27.md", entry);
    h.index.byAnchor.set("daily::2026-05-27", entry);
    h.shelves.shelves = [{ name: "main", journals: ["daily"] }];
    mount(h, "Daily/2026-05-27.md");

    await fireEvent.contextMenu(screen.getAllByText("today")[0]!);

    expect(h.workspace.fileMenuCalls.map((c) => c.path)).toEqual(["Daily/2026-05-27.md"]);
  });

  it("opens an obsidian Menu listing every matching path when there are multiple", async () => {
    const showAtSpy = vi.spyOn(Menu.prototype, "showAtMouseEvent");
    const addItemSpy = vi.spyOn(Menu.prototype, "addItem");

    const base = journalDefaultsFor({ type: "day" }, "daily");
    const journal: JournalConfig = {
      ...base,
      navBlock: {
        ...base.navBlock,
        rows: [
          {
            template: "wk",
            fontSize: 1,
            bold: false,
            italic: false,
            color: { type: "transparent" },
            background: { type: "transparent" },
            link: "week",
            journal: "",
            addDecorations: false,
          },
        ],
      },
    };
    const h = buildHarness({
      daily: journal,
      weekly1: journalDefaultsFor({ type: "week" }, "weekly1"),
      weekly2: journalDefaultsFor({ type: "week" }, "weekly2"),
    });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.index.byAnchor.set("weekly1::2026-05-27", {
      journalName: "weekly1",
      anchor: "2026-05-27" as AnchorString,
      path: "Weekly1/W22.md" as VaultPath,
    });
    h.index.byAnchor.set("weekly2::2026-05-27", {
      journalName: "weekly2",
      anchor: "2026-05-27" as AnchorString,
      path: "Weekly2/W22.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily", "weekly1", "weekly2"] }];
    mount(h, "Daily/2026-05-27.md");

    await fireEvent.contextMenu(screen.getAllByText("wk")[0]!);

    expect(addItemSpy).toHaveBeenCalledTimes(2);
    expect(showAtSpy).toHaveBeenCalledTimes(1);
    expect(h.workspace.fileMenuCalls).toHaveLength(0);

    showAtSpy.mockRestore();
    addItemSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
npx vitest run src/code-blocks/nav/ui/NavigationCodeBlock.test.ts -t "context menu"
```

Expected: PASS — handlers already exist in Task 9. If the obsidian mock's `Menu` is missing `showAtMouseEvent` or `addItem`, extend `__mocks__/obsidian.ts` to add stub methods that vitest can spy on:

```ts
// __mocks__/obsidian.ts (only if Menu is incomplete)
export class Menu {
  addItem(_cb: (item: MenuItem) => void): this {
    return this;
  }
  showAtMouseEvent(_event: MouseEvent): void {}
}
class MenuItem {
  setTitle(_title: string): this {
    return this;
  }
  onClick(_cb: () => void): this {
    return this;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/code-blocks/nav/ui/NavigationCodeBlock.test.ts __mocks__/obsidian.ts
git commit -m "test(code-blocks): nav row context menu"
```

(Drop `__mocks__/obsidian.ts` from the commit if no mock update was needed.)

---

## Task 16 — Ctrl/cmd hover preview

**Files:**

- Modify: `src/code-blocks/nav/ui/NavigationCodeBlock.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe("NavigationCodeBlock hover preview", () => {
  it("triggers hover preview when pointer enters a row with ctrl held", async () => {
    const base = journalDefaultsFor({ type: "day" }, "daily");
    const journal: JournalConfig = {
      ...base,
      navBlock: {
        ...base.navBlock,
        rows: [
          {
            template: "today",
            fontSize: 1,
            bold: false,
            italic: false,
            color: { type: "transparent" },
            background: { type: "transparent" },
            link: "self",
            journal: "",
            addDecorations: false,
          },
        ],
      },
    };
    const h = buildHarness({ daily: journal });
    const entry = {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    };
    h.index.byPath.set("Daily/2026-05-27.md", entry);
    h.index.byAnchor.set("daily::2026-05-27", entry);
    h.shelves.shelves = [{ name: "main", journals: ["daily"] }];
    mount(h, "Daily/2026-05-27.md");

    await fireEvent.pointerEnter(screen.getAllByText("today")[0]!, { ctrlKey: true });

    expect(h.workspace.hoverCalls.map((c) => c.path)).toEqual(["Daily/2026-05-27.md"]);
  });

  it("does not trigger hover preview without ctrl/meta", async () => {
    const base = journalDefaultsFor({ type: "day" }, "daily");
    const journal: JournalConfig = {
      ...base,
      navBlock: {
        ...base.navBlock,
        rows: [
          {
            template: "today",
            fontSize: 1,
            bold: false,
            italic: false,
            color: { type: "transparent" },
            background: { type: "transparent" },
            link: "self",
            journal: "",
            addDecorations: false,
          },
        ],
      },
    };
    const h = buildHarness({ daily: journal });
    const entry = {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    };
    h.index.byPath.set("Daily/2026-05-27.md", entry);
    h.index.byAnchor.set("daily::2026-05-27", entry);
    h.shelves.shelves = [{ name: "main", journals: ["daily"] }];
    mount(h, "Daily/2026-05-27.md");

    await fireEvent.pointerEnter(screen.getAllByText("today")[0]!);

    expect(h.workspace.hoverCalls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
npx vitest run src/code-blocks/nav/ui/NavigationCodeBlock.test.ts -t "hover preview"
```

Expected: PASS — handler implemented in Task 9.

- [ ] **Step 3: Commit**

```bash
git add src/code-blocks/nav/ui/NavigationCodeBlock.test.ts
git commit -m "test(code-blocks): nav row ctrl-hover preview"
```

---

## Task 17 — Decorations integration

Assert that `<CellDecoration>` wraps the row text when `addDecorations` is set, and wraps the whole column when `decorateWholeBlock` is set.

**Files:**

- Modify: `src/code-blocks/nav/ui/NavigationCodeBlock.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe("NavigationCodeBlock decorations", () => {
  it("wraps individual row text with CellDecoration when addDecorations is true", () => {
    const base = journalDefaultsFor({ type: "day" }, "daily");
    const journal: JournalConfig = {
      ...base,
      navBlock: {
        ...base.navBlock,
        decorateWholeBlock: false,
        rows: [
          {
            template: "today",
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
    const h = buildHarness({ daily: journal });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily"] }];
    mount(h, "Daily/2026-05-27.md");

    const decorations = document.querySelectorAll("[data-testid='cell-decoration']");
    // 3 columns × 1 row each = 3 decorated rows
    expect(decorations.length).toBe(3);
  });

  it("wraps the entire column with CellDecoration when decorateWholeBlock is true", () => {
    const base = journalDefaultsFor({ type: "day" }, "daily");
    const journal: JournalConfig = {
      ...base,
      navBlock: {
        ...base.navBlock,
        decorateWholeBlock: true,
        rows: [
          {
            template: "today",
            fontSize: 1,
            bold: false,
            italic: false,
            color: { type: "transparent" },
            background: { type: "transparent" },
            link: "none",
            journal: "",
            addDecorations: false,
          },
        ],
      },
    };
    const h = buildHarness({ daily: journal });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily"] }];
    mount(h, "Daily/2026-05-27.md");

    const decorations = document.querySelectorAll("[data-testid='cell-decoration']");
    expect(decorations.length).toBe(3);
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
npx vitest run src/code-blocks/nav/ui/NavigationCodeBlock.test.ts -t "decorations"
```

Expected: PASS — `CellDecoration` is rendered when the flag is set (no decoration styles populated; the wrapper is still in the DOM with empty styles).

- [ ] **Step 3: Commit**

```bash
git add src/code-blocks/nav/ui/NavigationCodeBlock.test.ts
git commit -m "test(code-blocks): nav decorations wrapping"
```

---

## Task 18 — `defineCodeBlock` value

**Files:**

- Create: `src/code-blocks/nav/nav-block.ts`

- [ ] **Step 1: Implement**

```ts
import * as v from "valibot";

import { defineCodeBlock } from "@/infrastructure/host";

import NavigationCodeBlock from "./ui/NavigationCodeBlock.vue";

export const navigationCodeBlock = defineCodeBlock({
  keys: ["journal-nav", "calendar-nav", "interval-nav"],
  schema: v.object({}),
  component: NavigationCodeBlock,
  cssClass: ["journal-nav-code-block"],
});
```

- [ ] **Step 2: Verify type-check passes**

```bash
npm run check:types
```

Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/code-blocks/nav/nav-block.ts
git commit -m "feat(code-blocks): defineCodeBlock value for navigation"
```

---

## Task 19 — Register the navigation block in the module

**Files:**

- Modify: `src/code-blocks/module.ts`

- [ ] **Step 1: Add the registration**

Modify `src/code-blocks/module.ts` to include the new value:

```ts
import type { Module } from "@/infrastructure/di";
import { CodeBlockDefinitionToken } from "@/infrastructure/host";

import { homeCodeBlock } from "./home/home-block";
import { navigationCodeBlock } from "./nav/nav-block";

export const codeBlocksModule: Module = {
  register(c) {
    c.register(CodeBlockDefinitionToken).useValue(homeCodeBlock);
    c.register(CodeBlockDefinitionToken).useValue(navigationCodeBlock);
  },
};
```

- [ ] **Step 2: Verify type-check passes**

```bash
npm run check:types
```

Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/code-blocks/module.ts
git commit -m "feat(code-blocks): register navigation block in module"
```

---

## Task 20 — Final verification gates

**Files:** none (verification only).

- [ ] **Step 1: Run the test suite**

```bash
npm test
```

Expected: all tests PASS, no skips introduced by this work.

- [ ] **Step 2: Run the type-check**

```bash
npm run check:types
```

Expected: 0 errors.

- [ ] **Step 3: Run the lint**

```bash
npm run check:lint
```

Expected: 0 errors. No `eslint-disable` comments added.

- [ ] **Step 4: Manual sanity (optional — UI changes)**

Launch the obsidian dev vault (`npm run dev` or the project's equivalent), drop a `journal-nav` (and `calendar-nav` / `interval-nav`) code-block into a note that belongs to a daily journal, and confirm:

- Three columns render with prev/current/next dates.
- Arrow buttons open the adjacent dates.
- Row clicks navigate; "self" opens the current note; period-kind rows open the matching journal entries.
- Right-click opens the file menu (or a sub-menu when multiple paths match).
- Ctrl/cmd-hover shows the page preview.
- A journal with `decorateWholeBlock: true` or rows with `addDecorations: true` paints cell decorations.
