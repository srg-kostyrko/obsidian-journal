# Bulk Add Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the v2 "bulk add notes" feature in v3 — scan a folder, filter notes, extract a date from each note's title or a property, connect each matching note to a journal at the resolved anchor, with per-note handling of existing-note / wrong-folder / wrong-name (skip/override/merge/move/rename/ask) and a dry-run preview. Closes feature-gap #1.

**Architecture:** A `BulkAddService` does the pure work in two phases — `plan(journalName, params)` scans the folder, filters via the reused decoration title/tag/property condition evaluators, extracts+parses the date (a ported `formatToRegexp` finds the date inside a title/property string), snaps it to the journal anchor (`CycleService.anchorOf` + `TimelineService.contains`), and builds a per-note plan with each sub-decision either resolved from params or left "ask"; `apply(journalName, actions, dryRun)` executes resolved actions by reusing `NoteConnectionService.connect`/`disconnect` (plus read+append+delete for merge), logging per note. A `BulkAddFlow` chains a configure modal (vee-validate form → params) and a process modal (resolve "ask" decisions, run, show log). A button on the per-journal settings page launches it.

**Tech Stack:** TypeScript, `AsyncResult`/`Result` + `attempt.in`, valibot + `@vee-validate/valibot`, ts-pattern, DI (`inject`/`useService`), Vue 3 SFC modals (`defineModal`/`useModal`), Obsidian `moment` via `localMoment`, Vitest + `@testing-library/vue`, paraglide i18n.

**Depends on:** the connect/disconnect plan (`NoteConnectionService`, commit range `8ae32da9..ffb8cb30`) — already landed. Reuses `src/decorations/` condition schemas/evaluators/editors and `NoteMetadataService`.

---

## File Structure

All new code lives under `src/journals/notes/bulk-add/` (a sub-feature: it gets its own `module.ts`, wired into `journalNotesModule`).

- `src/decorations/config.ts` (modify) — export `filterConditionSchema` + `FilterCondition` (the title|tag|property subset) for reuse.
- `src/decorations/index.ts` (modify) — re-export the above if the barrel is the import surface.
- `src/journals/notes/bulk-add/config.ts` (create) — `BulkAddParams` type + `bulkAddParamsSchema` (vee-validate) + decision enums.
- `src/journals/notes/bulk-add/format-to-regexp.ts` (create) — ported date-extraction regexp builder.
- `src/journals/notes/bulk-add/format-to-regexp.test.ts` (create).
- `src/journals/notes/bulk-add/bulk-add-service.ts` (create) — `BulkAddService.plan` + `.apply`, plan/result types.
- `src/journals/notes/bulk-add/bulk-add-service.test.ts` (create).
- `src/journals/notes/bulk-add/ui/modals.ts` (create) — `configureBulkAddModal`, `processBulkAddModal` definitions.
- `src/journals/notes/bulk-add/ui/ConfigureBulkAddModal.vue` (+ `.test.ts`) (create).
- `src/journals/notes/bulk-add/ui/ProcessBulkAddModal.vue` (+ `.test.ts`) (create).
- `src/journals/notes/bulk-add/flows/bulk-add.flow.ts` (+ `.test.ts`) (create).
- `src/journals/notes/bulk-add/module.ts` (create) — registers `BulkAddService` + `BulkAddFlow`.
- `src/journals/notes/module.ts` (modify) — `bulkAddModule.register(c)`.
- `src/journals/settings/ui/JournalEditSubpage.vue` (modify) — add a "Bulk add notes" button invoking `BulkAddFlow`.
- `messages/en.json` (modify) — new messages; regenerate paraglide with `npm run compile:i18n`.

### Shared types (defined in Task 2 / Task 4, referenced throughout — names are fixed here)

```ts
// config.ts
export type DatePlace = "title" | "property";
export type FilterCombinator = "no" | "and" | "or";
export type ExistingNoteParam = "skip" | "override" | "merge" | "ask";
export type OtherFolderParam = "keep" | "move" | "ask";
export type OtherNameParam = "keep" | "rename" | "ask";

export interface BulkAddParams {
  folder: string;
  datePlace: DatePlace;
  propertyName: string;
  dateFormat: string;
  filterCombinator: FilterCombinator;
  filters: FilterCondition[]; // FilterCondition = title|tag|property condition (reused from decorations)
  existingNote: ExistingNoteParam;
  otherFolder: OtherFolderParam;
  otherName: OtherNameParam;
  dryRun: boolean;
}

// bulk-add-service.ts
export type SkipReason = "already-connected" | "filtered" | "no-date" | "unparseable-date" | "out-of-bounds";
export interface PlannedSkip {
  kind: "skip";
  path: VaultPath;
  reason: SkipReason;
}
export interface PlannedAction {
  kind: "action";
  path: VaultPath;
  anchor: AnchorString;
  occupant?: VaultPath; // a note already connected at this anchor (≠ path)
  existing: "none" | "skip" | "override" | "merge" | "ask"; // "none" iff no occupant
  folder: "n/a" | "keep" | "move" | "ask"; // "n/a" iff folder already matches configured
  name: "n/a" | "keep" | "rename" | "ask"; // "n/a" iff name already matches configured
}
export type PlannedNote = PlannedSkip | PlannedAction;
export interface BulkPlan {
  notes: PlannedNote[];
}

export interface ResolvedAction {
  path: VaultPath;
  anchor: AnchorString;
  existing: "none" | "skip" | "override" | "merge"; // resolved (no "ask")
  move: boolean;
  rename: boolean;
}
export interface BulkLogEntry {
  path: VaultPath;
  actions: string[];
}
```

---

## Phase 1 — Filters reuse + params + date extraction + planner (Checkpoint A)

### Task 1: Export the filter-condition subset from decorations

The bulk-add filters are exactly the decoration TITLE/TAG/PROPERTY conditions (same domain meaning: "match a note by its content"). Reuse the existing schemas + evaluators rather than redefining.

**Files:**

- Modify: `src/decorations/config.ts`
- Modify: `src/decorations/index.ts` (only if it's the public import surface — verify)
- Test: `src/decorations/config.test.ts` (if one exists; otherwise no test — this is a pure re-export, and "don't test the wiring" applies)

- [ ] **Step 1: Add the exported subset schema + type**

In `src/decorations/config.ts`, the objects `titleCondition`, `tagCondition`, and `propertyCondition` already exist (they're combined into `decorationConditionSchema`). Add, immediately after `const propertyCondition = v.union([...])` (around line 141):

```ts
export const filterConditionSchema = v.union([titleCondition, tagCondition, propertyCondition]);
export type FilterCondition = v.InferOutput<typeof filterConditionSchema>;
```

- [ ] **Step 2: Re-export from the barrel if needed**

Check `src/decorations/index.ts`. If it re-exports config types (e.g. `export type { JournalDecorationCondition } from "./config"`), add `filterConditionSchema` and `FilterCondition` to the same export. If bulk-add will import directly from `@/decorations/config`, confirm that path is used elsewhere and skip the barrel edit.

- [ ] **Step 3: Verify it compiles**

Run: `npm run check:types`
Expected: clean. (No behavior test — this is a re-export; the existing decoration condition tests already cover the schemas.)

- [ ] **Step 4: Commit**

```bash
git add src/decorations/config.ts src/decorations/index.ts
git commit -m "feat(decorations): export filter-condition subset for reuse"
```

---

### Task 2: `BulkAddParams` config + schema

**Files:**

- Create: `src/journals/notes/bulk-add/config.ts`

- [ ] **Step 1: Write the config module**

Create `src/journals/notes/bulk-add/config.ts`:

```ts
import * as v from "valibot";

import { filterConditionSchema, type FilterCondition } from "@/decorations/config";

export type DatePlace = "title" | "property";
export type FilterCombinator = "no" | "and" | "or";
export type ExistingNoteParam = "skip" | "override" | "merge" | "ask";
export type OtherFolderParam = "keep" | "move" | "ask";
export type OtherNameParam = "keep" | "rename" | "ask";

export interface BulkAddParams {
  folder: string;
  datePlace: DatePlace;
  propertyName: string;
  dateFormat: string;
  filterCombinator: FilterCombinator;
  filters: FilterCondition[];
  existingNote: ExistingNoteParam;
  otherFolder: OtherFolderParam;
  otherName: OtherNameParam;
  dryRun: boolean;
}

export const bulkAddParamsSchema = v.object({
  folder: v.string(),
  datePlace: v.picklist(["title", "property"]),
  propertyName: v.string(),
  dateFormat: v.pipe(v.string(), v.minLength(1)),
  filterCombinator: v.picklist(["no", "and", "or"]),
  filters: v.array(filterConditionSchema),
  existingNote: v.picklist(["skip", "override", "merge", "ask"]),
  otherFolder: v.picklist(["keep", "move", "ask"]),
  otherName: v.picklist(["keep", "rename", "ask"]),
  dryRun: v.boolean(),
});

export const defaultBulkAddParams = (): BulkAddParams => ({
  folder: "",
  datePlace: "title",
  propertyName: "",
  dateFormat: "YYYY-MM-DD",
  filterCombinator: "no",
  filters: [],
  existingNote: "skip",
  otherFolder: "keep",
  otherName: "keep",
  dryRun: true,
});
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run check:types`
Expected: clean. (No standalone test — the schema is exercised through the planner tests and the modal; a schema-shape test would be a wiring test, which this repo skips.)

- [ ] **Step 3: Commit**

```bash
git add src/journals/notes/bulk-add/config.ts
git commit -m "feat(journals): add bulk-add params schema"
```

---

### Task 3: Port `formatToRegexp` (extract a date from a title/property string)

v2 matched the date _inside_ a longer string via a regexp derived from the moment format. Port it so the same titles parse.

**Files:**

- Create: `src/journals/notes/bulk-add/format-to-regexp.ts`
- Test: `src/journals/notes/bulk-add/format-to-regexp.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/journals/notes/bulk-add/format-to-regexp.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installTestCalendar } from "@/calendar/testing";

import { formatToRegexp } from "./format-to-regexp";

describe("formatToRegexp", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => teardown());

  it("matches an ISO date embedded in a longer title", () => {
    const re = formatToRegexp("YYYY-MM-DD");
    const match = "Daily note 2026-06-01 draft".match(re);
    expect(match?.[0]).toBe("2026-06-01");
  });

  it("matches a date with literal text in the format", () => {
    const re = formatToRegexp("[Week] YYYY-MM-DD");
    const match = "Week 2026-06-01".match(re);
    expect(match?.[0]).toBe("Week 2026-06-01");
  });

  it("does not match a string with no date", () => {
    const re = formatToRegexp("YYYY-MM-DD");
    expect("no date here".match(re)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/journals/notes/bulk-add/format-to-regexp.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement (ported from v2 `src/_old-code/utils/moment.ts`)**

Create `src/journals/notes/bulk-add/format-to-regexp.ts`. This is a faithful port; the one v3 adaptation is reading locale data from `localMoment()` (current locale) instead of a module-level `moment.localeData()` snapshot, so it respects the configured calendar locale at call time.

```ts
import { localMoment } from "@/calendar";

const SUPPORTED_SYMBOLS = new Set(["o", "M", "Q", "D", "d", "w", "W", "Y"]);

function buildParts(): Map<string, string> {
  const localeData = localMoment().localeData();
  // The ordinal parse regex is locale-internal; fall back to a generic ordinal if absent.
  const ordinalParse =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- moment locale internals are untyped
    String((localeData as any)._config?.dayOfMonthOrdinalParse ?? /\d{1,2}(th|st|nd|rd)/)
      .replace(String.raw`/\d{1,2}`, "")
      .slice(0, -1);
  return new Map([
    ["o", ordinalParse],
    ["M", "([1-9]|1[0-2])"],
    ["MM", "(0[1-9]|1[0-2])"],
    ["MMM", "(" + localeData.monthsShort().join("|") + ")"],
    ["MMMM", "(" + localeData.months().join("|") + ")"],
    ["Q", "[1-4]"],
    ["D", "[0-9]{1,2}"],
    ["DD", "[0-9]{2}"],
    ["DDD", "[1-9]{1,3}"],
    ["DDDD", "[1-9]{3}"],
    ["d", "[0-6]"],
    ["dd", "(" + localeData.weekdaysMin().join("|") + ")"],
    ["ddd", "(" + localeData.weekdaysShort().join("|") + ")"],
    ["dddd", "(" + localeData.weekdays().join("|") + ")"],
    ["w", "[0-9]{1,2}"],
    ["ww", "[0-9]{2}"],
    ["W", "[0-9]{1,2}"],
    ["WW", "[0-9]{2}"],
    ["YY", "[0-9]{2}"],
    ["YYYY", "[0-9]{4}"],
  ]);
}

export function formatToRegexp(format: string): RegExp {
  const parts: string[] = [];
  const formatParts = buildParts();

  let lastChar = "";
  let lastCharCount = 0;
  let exact = false;
  let exactText = "";

  const flush = (): void => {
    if (lastCharCount > 0) {
      const prepared = formatParts.get(lastChar.repeat(lastCharCount));
      if (prepared) parts.push(prepared);
      lastCharCount = 0;
      lastChar = "";
    }
  };

  for (const char of format) {
    if (exact) {
      if (char === "]") {
        parts.push(exactText);
        exact = false;
        exactText = "";
      } else {
        exactText += char;
      }
    } else if (char === "[") {
      flush();
      exact = true;
    } else if (SUPPORTED_SYMBOLS.has(char)) {
      if (lastChar === char) {
        lastCharCount++;
      } else {
        flush();
        lastCharCount = 1;
        lastChar = char;
      }
    } else {
      flush();
      parts.push(char.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`));
    }
  }
  flush();

  return new RegExp(parts.join(""));
}
```

If the `eslint-disable` line trips the repo's "no lint silencing" rule (it may — that rule is enforced), instead read the ordinal via a typed narrowing helper: define `function ordinalParse(localeData: ReturnType<typeof localMoment>["localeData"] extends () => infer L ? L : never): string` is overkill — simpler: wrap the access in a small `function readOrdinal(ld: unknown): string` that does the `as { _config?: { dayOfMonthOrdinalParse?: unknown } }` narrowing in ONE expression and returns a string, with a WHY comment that moment locale internals are untyped. Use whichever keeps `check:lint` clean WITHOUT an eslint-disable. Verify against `npm run check:lint`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/journals/notes/bulk-add/format-to-regexp.test.ts`
Expected: PASS.

- [ ] **Step 5: Gates + commit**

Run: `npm run test -- src/journals/notes/bulk-add/format-to-regexp.test.ts && npm run check:types && npm run check:lint`

```bash
git add src/journals/notes/bulk-add/format-to-regexp.ts src/journals/notes/bulk-add/format-to-regexp.test.ts
git commit -m "feat(journals): port date-extraction regexp for bulk-add"
```

---

### Task 4: `BulkAddService.plan`

**Files:**

- Create: `src/journals/notes/bulk-add/bulk-add-service.ts`
- Test: `src/journals/notes/bulk-add/bulk-add-service.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/journals/notes/bulk-add/bulk-add-service.test.ts`. Build a container mirroring `src/journals/notes/note-creation.test.ts`'s `build()`, additionally registering `BulkAddService`, `JournalsIndex` (`useClass`), `NoteMetadataService` via `FakeNoteMetadataService`, and `NoteConnectionService` (`useClass`). Use `FakeNotesService` (seed files) and `FakeNoteMetadataService` (`setMetadata`). One journal: `fakeRepo({ daily: fixedJournal("daily", { type: "day" }, { folder: "Journal" }) })`. `installTestCalendar()` in `beforeEach`.

```ts
describe("BulkAddService.plan", () => {
  it("skips a note that is already connected", async () => {
    const { service, notes, index } = build();
    notes.seed("src/2026-06-01.md" as VaultPath, "", {});
    index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: "src/2026-06-01.md" as VaultPath });
    const plan = await service.plan("daily", params({ folder: "src" }));
    const note = expectOk(plan).notes.find((n) => n.path === "src/2026-06-01.md");
    expect(note).toEqual({ kind: "skip", path: "src/2026-06-01.md", reason: "already-connected" });
  });

  it("skips a note that fails the filters", async () => {
    const { service, notes, metadata } = build();
    notes.seed("src/2026-06-01.md" as VaultPath);
    metadata.setMetadata("src/2026-06-01.md" as VaultPath, {
      title: "2026-06-01",
      tags: [],
      properties: {},
      tasks: [],
    });
    const plan = await service.plan(
      "daily",
      params({
        folder: "src",
        filterCombinator: "and",
        filters: [{ type: "title", condition: "contains", value: "meeting" }],
      }),
    );
    const note = expectOk(plan).notes.find((n) => n.path === "src/2026-06-01.md");
    expect(note?.kind === "skip" && note.reason).toBe("filtered");
  });

  it("skips a note whose title has no parseable date", async () => {
    const { service, notes, metadata } = build();
    notes.seed("src/hello.md" as VaultPath);
    metadata.setMetadata("src/hello.md" as VaultPath, { title: "hello", tags: [], properties: {}, tasks: [] });
    const plan = await service.plan("daily", params({ folder: "src" }));
    const note = expectOk(plan).notes.find((n) => n.path === "src/hello.md");
    expect(note?.kind === "skip" && note.reason).toBe("no-date");
  });

  it("plans a connect action for a matching note, resolving decisions from params", async () => {
    const { service, notes, metadata } = build();
    notes.seed("src/2026-06-01.md" as VaultPath);
    metadata.setMetadata("src/2026-06-01.md" as VaultPath, {
      title: "2026-06-01",
      tags: [],
      properties: {},
      tasks: [],
    });
    const plan = await service.plan("daily", params({ folder: "src", otherFolder: "move", otherName: "keep" }));
    const note = expectOk(plan).notes.find((n) => n.path === "src/2026-06-01.md");
    expect(note?.kind).toBe("action");
    expect(note?.kind === "action" && note.anchor).toBe("2026-06-01");
    // src/2026-06-01.md → configured folder is "Journal", so folder differs → resolved to "move"
    expect(note?.kind === "action" && note.folder).toBe("move");
  });

  it("marks the existing-note decision as ask when params say ask and an occupant exists", async () => {
    const { service, notes, metadata, index } = build();
    notes.seed("Journal/2026-06-01.md" as VaultPath, "", { journal: "daily", "journal-date": "2026-06-01" });
    index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: "Journal/2026-06-01.md" as VaultPath });
    notes.seed("src/note.md" as VaultPath);
    metadata.setMetadata("src/note.md" as VaultPath, { title: "2026-06-01", tags: [], properties: {}, tasks: [] });
    const plan = await service.plan("daily", params({ folder: "src", existingNote: "ask" }));
    const note = expectOk(plan).notes.find((n) => n.path === "src/note.md");
    expect(note?.kind === "action" && note.occupant).toBe("Journal/2026-06-01.md");
    expect(note?.kind === "action" && note.existing).toBe("ask");
  });
});
```

Provide local helpers in the test file: `params(overrides)` spreads `defaultBulkAddParams()` (filterCombinator default "no" so unfiltered) with overrides; `expectOk` from `@/infrastructure/result/testing`; `anchor` from `@/calendar/testing`. Note: a note already connected (`src/2026-06-01.md` registered) must list under its folder — seed it in `src` so `listInFolder("src")` returns it.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/journals/notes/bulk-add/bulk-add-service.test.ts`
Expected: FAIL — module/`plan` missing.

- [ ] **Step 3: Implement `plan`**

Create `src/journals/notes/bulk-add/bulk-add-service.ts`:

```ts
import { match } from "ts-pattern";

import { CalendarDate, type AnchorString } from "@/calendar";
import { checkProperty, checkTag, checkTitle } from "@/decorations/engine-checks";
import type { FilterCondition } from "@/decorations/config";
import { inject } from "@/infrastructure/di";
import { NoteMetadataService, NotesService } from "@/infrastructure/host";
import type { FolderNotFoundError, NoteMetadata, VaultPath } from "@/infrastructure/host";
import { AsyncResult, attempt } from "@/infrastructure/result";

import { CycleService } from "../../cycle";
import { JournalsIndex } from "../../journals-index";
import { TimelineService } from "../../timeline";
import { FrontmatterService } from "../../frontmatter";
import { NoteConnectionService } from "../note-connection";
import { NotePathService } from "../note-path";
import { splitVaultPath } from "../vault-path";

import { formatToRegexp } from "./format-to-regexp";

import type { BulkAddParams } from "./config";

export type SkipReason = "already-connected" | "filtered" | "no-date" | "unparseable-date" | "out-of-bounds";
export interface PlannedSkip {
  kind: "skip";
  path: VaultPath;
  reason: SkipReason;
}
export interface PlannedAction {
  kind: "action";
  path: VaultPath;
  anchor: AnchorString;
  occupant?: VaultPath;
  existing: "none" | "skip" | "override" | "merge" | "ask";
  folder: "n/a" | "keep" | "move" | "ask";
  name: "n/a" | "keep" | "rename" | "ask";
}
export type PlannedNote = PlannedSkip | PlannedAction;
export interface BulkPlan {
  notes: PlannedNote[];
}

export interface ResolvedAction {
  path: VaultPath;
  anchor: AnchorString;
  existing: "none" | "skip" | "override" | "merge";
  move: boolean;
  rename: boolean;
}
export interface BulkLogEntry {
  path: VaultPath;
  actions: string[];
}

export class BulkAddService {
  readonly #notes = inject(NotesService);
  readonly #metadata = inject(NoteMetadataService);
  readonly #index = inject(JournalsIndex);
  readonly #cycle = inject(CycleService);
  readonly #timeline = inject(TimelineService);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #path = inject(NotePathService);
  readonly #connection = inject(NoteConnectionService);

  plan(journalName: string, params: BulkAddParams): AsyncResult<BulkPlan, FolderNotFoundError> {
    return attempt.in(this, async function* (this: BulkAddService) {
      const paths = yield* this.#notes.listInFolder(params.folder as VaultPath);
      const dateRegexp = formatToRegexp(params.dateFormat);
      const notes: PlannedNote[] = [];
      for (const path of paths) {
        notes.push(this.#planNote(journalName, path, params, dateRegexp));
      }
      return { notes };
    });
  }

  #planNote(journalName: string, path: VaultPath, params: BulkAddParams, dateRegexp: RegExp): PlannedNote {
    if (this.#index.entryByPath(path).isSome()) return { kind: "skip", path, reason: "already-connected" };

    const metadata = this.#metadata.get(path).getOr(null);
    if (!this.#passesFilters(params, metadata)) return { kind: "skip", path, reason: "filtered" };

    const source =
      params.datePlace === "title"
        ? (metadata?.title ?? splitVaultPath(path)[1].replace(/\.md$/, ""))
        : this.#stringProperty(metadata, params.propertyName);
    if (source === undefined) return { kind: "skip", path, reason: "no-date" };

    const dateMatch = source.match(dateRegexp);
    if (!dateMatch) return { kind: "skip", path, reason: "no-date" };
    const parsed = CalendarDate.parse(dateMatch[0], params.dateFormat);
    if (!parsed.isOk()) return { kind: "skip", path, reason: "unparseable-date" };

    const anchorOpt = this.#cycle.anchorOf(journalName, parsed.value);
    if (anchorOpt.isNone()) return { kind: "skip", path, reason: "unparseable-date" };
    const anchor = anchorOpt.value;
    if (!this.#timeline.contains(journalName, anchor)) return { kind: "skip", path, reason: "out-of-bounds" };

    const occupantOpt = this.#index.entryByAnchor(journalName, anchor);
    const occupant = occupantOpt.isSome() && occupantOpt.value.path !== path ? occupantOpt.value.path : undefined;

    const configured = this.#path.pathFor(journalName, { journalName, anchor }).getOr(path);
    const [curFolder, curName] = splitVaultPath(path);
    const [cfgFolder, cfgName] = splitVaultPath(configured);

    return {
      kind: "action",
      path,
      anchor,
      ...(occupant === undefined ? {} : { occupant }),
      existing: occupant === undefined ? "none" : params.existingNote,
      folder: cfgFolder === curFolder ? "n/a" : params.otherFolder,
      name: cfgName === curName ? "n/a" : params.otherName,
    };
  }

  #passesFilters(params: BulkAddParams, metadata: NoteMetadata | null): boolean {
    if (params.filterCombinator === "no" || params.filters.length === 0) return true;
    const results = params.filters.map((f) => this.#checkFilter(f, metadata));
    return params.filterCombinator === "and" ? results.every(Boolean) : results.some(Boolean);
  }

  #checkFilter(filter: FilterCondition, metadata: NoteMetadata | null): boolean {
    return match(filter)
      .with({ type: "title" }, (c) => checkTitle(c, metadata))
      .with({ type: "tag" }, (c) => checkTag(c, metadata))
      .with({ type: "property" }, (c) => checkProperty(c, metadata))
      .exhaustive();
  }

  #stringProperty(metadata: NoteMetadata | null, name: string): string | undefined {
    if (!metadata || !(name in metadata.properties)) return undefined;
    const raw = metadata.properties[name];
    return typeof raw === "string" ? raw : undefined;
  }
}
```

Notes:

- `CalendarDate.parse(input, format)` and `localMoment` are exact (verified). `pathFor` takes a `JournalMetadata` — `{ journalName, anchor }` is the minimal valid metadata (numbers/endDate optional).
- `splitVaultPath` is the shared helper from `../vault-path`.
- The `apply` method is added in Task 5 (Phase 2). Lint may flag `attempt`/`AsyncResult`/`NoteConnectionService`/`FrontmatterService` as unused until then — if so, commit Tasks 4 and 5 together (same checkpoint). `FrontmatterService` is imported now for Task 5's merge/connect metadata.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/journals/notes/bulk-add/bulk-add-service.test.ts`
Expected: PASS (the plan tests).

- [ ] **Step 5: Commit (with Task 5 — see note)**

Hold until Task 5 lands if lint flags unused imports; otherwise:

```bash
git add src/journals/notes/bulk-add/bulk-add-service.ts src/journals/notes/bulk-add/bulk-add-service.test.ts
git commit -m "feat(journals): add BulkAddService.plan"
```

---

### Checkpoint A

```bash
npm run test && npm run check:types && npm run check:lint
```

The planner (folder scan, filters, date extraction, anchor snapping, decision resolution) is complete and fully unit-tested.

---

## Phase 2 — Executor (Checkpoint B)

### Task 5: `BulkAddService.apply`

**Files:**

- Modify: `src/journals/notes/bulk-add/bulk-add-service.ts`
- Modify: `src/journals/notes/bulk-add/bulk-add-service.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `bulk-add-service.test.ts`:

```ts
describe("BulkAddService.apply", () => {
  it("connects a note with move when resolved that way", async () => {
    const { service, notes } = build();
    notes.seed("src/note.md" as VaultPath, "body");
    const log = expectOk(
      await service.apply(
        "daily",
        [
          {
            path: "src/note.md" as VaultPath,
            anchor: anchor("2026-06-01"),
            existing: "none",
            move: true,
            rename: true,
          },
        ],
        false,
      ),
    );
    expect(notes.find("src/note.md" as VaultPath).isNone()).toBe(true);
    expect(notes.find("Journal/2026-06-01.md" as VaultPath).isSome()).toBe(true);
    expect(log[0]?.path).toBe("src/note.md");
  });

  it("merges into the occupant and deletes the source", async () => {
    const { service, notes, index } = build();
    notes.seed("Journal/2026-06-01.md" as VaultPath, "OCCUPANT", { journal: "daily", "journal-date": "2026-06-01" });
    index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: "Journal/2026-06-01.md" as VaultPath });
    notes.seed("src/note.md" as VaultPath, "SOURCE");
    await service.apply(
      "daily",
      [
        {
          path: "src/note.md" as VaultPath,
          anchor: anchor("2026-06-01"),
          existing: "merge",
          move: false,
          rename: false,
        },
      ],
      false,
    );
    expect(notes.find("src/note.md" as VaultPath).isNone()).toBe(true);
    expect(expectOk(await notes.read("Journal/2026-06-01.md" as VaultPath))).toContain("SOURCE");
  });

  it("performs no file changes in dry-run but still logs intended actions", async () => {
    const { service, notes } = build();
    notes.seed("src/note.md" as VaultPath, "body");
    const log = expectOk(
      await service.apply(
        "daily",
        [
          {
            path: "src/note.md" as VaultPath,
            anchor: anchor("2026-06-01"),
            existing: "none",
            move: true,
            rename: true,
          },
        ],
        true,
      ),
    );
    expect(notes.find("src/note.md" as VaultPath).isSome()).toBe(true); // unchanged
    expect(notes.find("Journal/2026-06-01.md" as VaultPath).isNone()).toBe(true);
    expect(log[0]?.actions.length).toBeGreaterThan(0);
  });

  it("skips a note resolved as existing=skip", async () => {
    const { service, notes } = build();
    notes.seed("src/note.md" as VaultPath, "body");
    await service.apply(
      "daily",
      [
        {
          path: "src/note.md" as VaultPath,
          anchor: anchor("2026-06-01"),
          existing: "skip",
          move: false,
          rename: false,
        },
      ],
      false,
    );
    expect(notes.find("src/note.md" as VaultPath).isSome()).toBe(true);
    expect(notes.find("Journal/2026-06-01.md" as VaultPath).isNone()).toBe(true);
  });

  it("records a per-note error without aborting the batch", async () => {
    const { service, notes } = build();
    notes.seed("src/ok.md" as VaultPath, "body");
    // "src/missing.md" is NOT seeded → connect's attach/rename will fail for it
    const log = expectOk(
      await service.apply(
        "daily",
        [
          {
            path: "src/missing.md" as VaultPath,
            anchor: anchor("2026-06-01"),
            existing: "none",
            move: false,
            rename: false,
          },
          {
            path: "src/ok.md" as VaultPath,
            anchor: anchor("2026-06-02"),
            existing: "none",
            move: false,
            rename: false,
          },
        ],
        false,
      ),
    );
    expect(log).toHaveLength(2);
    expect(log[1]?.path).toBe("src/ok.md");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/journals/notes/bulk-add/bulk-add-service.test.ts`
Expected: FAIL — `apply` missing.

- [ ] **Step 3: Implement `apply`**

Add these methods to `BulkAddService` (after `plan`):

```ts
apply(journalName: string, actions: ResolvedAction[], dryRun: boolean): AsyncResult<BulkLogEntry[], never> {
  return attempt.in(this, async function* (this: BulkAddService) {
    const log: BulkLogEntry[] = [];
    for (const action of actions) {
      log.push(await this.#applyOne(journalName, action, dryRun));
    }
    return log;
  });
}

async #applyOne(journalName: string, action: ResolvedAction, dryRun: boolean): Promise<BulkLogEntry> {
  const actions: string[] = [];
  if (action.existing === "skip") {
    actions.push(`Skipped: a note is already connected to ${action.anchor}.`);
    return { path: action.path, actions };
  }
  if (action.existing === "merge") {
    actions.push(`Merged into the note already connected to ${action.anchor}; source deleted.`);
    if (!dryRun) {
      const occupant = this.#index.entryByAnchor(journalName, action.anchor);
      if (occupant.isSome()) {
        const result = await attempt.in(this, async function* (this: BulkAddService) {
          const content = yield* this.#notes.read(action.path);
          yield* this.#notes.append(occupant.value.path, `\n${content}`);
          yield* this.#notes.delete(action.path);
          return;
        });
        if (result.kind === "err") actions.push(`Failed: ${result.error.message}`);
      } else {
        actions.push("Failed: the occupant disappeared before merge.");
      }
    }
    return { path: action.path, actions };
  }

  const override = action.existing === "override";
  if (override) actions.push(`Replaced the note already connected to ${action.anchor}.`);
  if (action.move) actions.push("Moved into the journal's folder.");
  if (action.rename) actions.push("Renamed to match the journal.");
  actions.push(`Connected to ${journalName} at ${action.anchor}.`);

  if (!dryRun) {
    const result = await this.#connection.connect(journalName, action.path, action.anchor, {
      override,
      move: action.move,
      rename: action.rename,
    });
    if (result.kind === "err") actions.push(`Failed: ${result.error.message}`);
  }
  return { path: action.path, actions };
}
```

(`this.#frontmatter` is unused by `apply` — if Task 4 imported `FrontmatterService` solely for this, remove that import now since `connect` builds metadata itself. Confirm `check:lint` is clean.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/journals/notes/bulk-add/bulk-add-service.test.ts`
Expected: PASS (all plan + apply tests).

- [ ] **Step 5: Register the service + gates + commit**

Create `src/journals/notes/bulk-add/module.ts`:

```ts
import type { Module } from "@/infrastructure/di";

import { BulkAddService } from "./bulk-add-service";

export const bulkAddModule: Module = {
  register(c) {
    c.register(BulkAddService).useClass(BulkAddService);
  },
};
```

Wire into `src/journals/notes/module.ts`: add `import { bulkAddModule } from "./bulk-add/module";` and `bulkAddModule.register(c);` inside `register(c)`.

Run: `npm run test && npm run check:types && npm run check:lint`

```bash
git add src/journals/notes/bulk-add/bulk-add-service.ts src/journals/notes/bulk-add/bulk-add-service.test.ts src/journals/notes/bulk-add/module.ts src/journals/notes/module.ts
git commit -m "feat(journals): add BulkAddService.apply and register module"
```

(If Task 4 was held, include its files in this commit.)

---

### Checkpoint B

```bash
npm run test && npm run check:types && npm run check:lint
```

The full bulk-add engine (plan + apply, including merge/override/move/rename/skip, dry-run, and per-note error capture) is complete and unit-tested. No UI yet.

---

## Phase 3 — UI: modals, flow, settings entry (Checkpoint C)

### Task 6: i18n messages

**Files:**

- Modify: `messages/en.json`

- [ ] **Step 1: Add messages**

Add these keys to `messages/en.json` (flat snake*case, grouped with other `\*\_modal*_`/`command\__` keys):

```json
"bulk_add_command": "Bulk add notes to this journal",
"bulk_add_configure_title": "Add notes to {journalName}",
"bulk_add_folder_label": "Source folder",
"bulk_add_date_place_label": "Read the date from",
"bulk_add_date_place_title": "Note title",
"bulk_add_date_place_property": "A property",
"bulk_add_property_name_label": "Property name",
"bulk_add_date_format_label": "Date format",
"bulk_add_filter_combinator_label": "Filter notes",
"bulk_add_filter_combinator_no": "No filter",
"bulk_add_filter_combinator_and": "Match all conditions",
"bulk_add_filter_combinator_or": "Match any condition",
"bulk_add_add_filter": "Add condition",
"bulk_add_existing_label": "When a note is already connected to that date",
"bulk_add_other_folder_label": "When the folder differs",
"bulk_add_other_name_label": "When the name differs",
"bulk_add_option_skip": "Skip",
"bulk_add_option_override": "Replace",
"bulk_add_option_merge": "Merge",
"bulk_add_option_keep": "Keep",
"bulk_add_option_move": "Move",
"bulk_add_option_rename": "Rename",
"bulk_add_option_ask": "Ask for each",
"bulk_add_dry_run_label": "Dry run (preview only)",
"bulk_add_next": "Continue",
"bulk_add_process_title": "Add notes to {journalName}",
"bulk_add_run": "Run",
"bulk_add_close": "Close",
"bulk_add_skipped_count": "{count} note(s) skipped",
"bulk_add_planned_count": "{count} note(s) to process",
"bulk_add_skip_reason_already_connected": "Already connected",
"bulk_add_skip_reason_filtered": "Filtered out",
"bulk_add_skip_reason_no_date": "No date found",
"bulk_add_skip_reason_unparseable_date": "Date could not be parsed",
"bulk_add_skip_reason_out_of_bounds": "Outside the journal's timeline"
```

- [ ] **Step 2: Regenerate paraglide + verify**

Run: `npm run compile:i18n` (the generated output under `src/i18n/paraglide/` is gitignored — do NOT commit it).
Run: `npm run check:types` (fails if any `m.*` accessor is missing).
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add messages/en.json
git commit -m "i18n: bulk-add messages"
```

---

### Task 7: Modal definitions + Configure modal

**Files:**

- Create: `src/journals/notes/bulk-add/ui/modals.ts`
- Create: `src/journals/notes/bulk-add/ui/ConfigureBulkAddModal.vue`
- Test: `src/journals/notes/bulk-add/ui/ConfigureBulkAddModal.test.ts`

- [ ] **Step 1: Modal definitions**

Create `src/journals/notes/bulk-add/ui/modals.ts`:

```ts
import { defineModal } from "@/infrastructure/host/modals";
import { m } from "@/i18n";

import type { BulkAddParams } from "../config";
import type { BulkPlan } from "../bulk-add-service";

import ConfigureBulkAddModal from "./ConfigureBulkAddModal.vue";
import ProcessBulkAddModal from "./ProcessBulkAddModal.vue";

export const configureBulkAddModal = defineModal<BulkAddParams>()({
  component: ConfigureBulkAddModal,
  title: ({ journalName }: { journalName: string }) => m.bulk_add_configure_title({ journalName }),
  width: 700,
});

export interface ProcessBulkAddProps {
  journalName: string;
  plan: BulkPlan;
  params: BulkAddParams;
}

export const processBulkAddModal = defineModal()({
  component: ProcessBulkAddModal,
  title: ({ journalName }: ProcessBulkAddProps) => m.bulk_add_process_title({ journalName }),
  width: 700,
});
```

- [ ] **Step 2: Configure modal component**

Create `src/journals/notes/bulk-add/ui/ConfigureBulkAddModal.vue`. It is a vee-validate form (mirrors `src/decorations/settings/ui/EditDecorationModal.vue` for the conditions field-array) that submits a `BulkAddParams`. Reuses `ConditionItem` from decorations for each filter, and `FolderInput` for the source folder. The "Add condition" menu offers only title/tag/property.

```vue
<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/valibot";
import { useForm, useFieldArray } from "vee-validate";

import { defaultCondition } from "@/decorations/defaults";
import type { FilterCondition } from "@/decorations/config";
import { useModal } from "@/infrastructure/host/modals";
import { m } from "@/i18n";
import ConditionItem from "@/decorations/settings/ui/ConditionItem.vue";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import FolderInput from "@/journals/settings/ui/FolderInput.vue";

import { bulkAddParamsSchema, defaultBulkAddParams, type BulkAddParams } from "../config";

defineProps<{ journalName: string }>();
const api = useModal<BulkAddParams>();

const { values, handleSubmit, setFieldValue } = useForm<BulkAddParams>({
  initialValues: defaultBulkAddParams(),
  validationSchema: toTypedSchema(bulkAddParamsSchema),
});

const filters = useFieldArray<FilterCondition>("filters");

function addFilter(type: "title" | "tag" | "property"): void {
  filters.push(defaultCondition(type) as FilterCondition);
}

const onSubmit = handleSubmit((params) => {
  api.submit(params);
});
</script>

<template>
  <form @submit="onSubmit">
    <UiSettingRow>
      <template #name>{{ m.bulk_add_folder_label() }}</template>
      <FolderInput :model-value="values.folder" @update:model-value="(v) => setFieldValue('folder', v)" />
    </UiSettingRow>

    <UiSettingRow>
      <template #name>{{ m.bulk_add_date_place_label() }}</template>
      <UiDropdown
        :model-value="values.datePlace"
        @update:model-value="(v) => setFieldValue('datePlace', v as BulkAddParams['datePlace'])"
      >
        <option value="title">{{ m.bulk_add_date_place_title() }}</option>
        <option value="property">{{ m.bulk_add_date_place_property() }}</option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow v-if="values.datePlace === 'property'">
      <template #name>{{ m.bulk_add_property_name_label() }}</template>
      <input
        :value="values.propertyName"
        @input="(e) => setFieldValue('propertyName', (e.target as HTMLInputElement).value)"
      />
    </UiSettingRow>

    <UiSettingRow>
      <template #name>{{ m.bulk_add_date_format_label() }}</template>
      <input
        :value="values.dateFormat"
        @input="(e) => setFieldValue('dateFormat', (e.target as HTMLInputElement).value)"
      />
    </UiSettingRow>

    <UiSettingRow>
      <template #name>{{ m.bulk_add_filter_combinator_label() }}</template>
      <UiDropdown
        :model-value="values.filterCombinator"
        @update:model-value="(v) => setFieldValue('filterCombinator', v as BulkAddParams['filterCombinator'])"
      >
        <option value="no">{{ m.bulk_add_filter_combinator_no() }}</option>
        <option value="and">{{ m.bulk_add_filter_combinator_and() }}</option>
        <option value="or">{{ m.bulk_add_filter_combinator_or() }}</option>
      </UiDropdown>
    </UiSettingRow>

    <template v-if="values.filterCombinator !== 'no'">
      <UiSettingRow v-for="(filter, i) of values.filters" :key="i">
        <ConditionItem :name="`filters.${i}`" :condition="filter" />
        <UiIconButton icon="trash" @click="filters.remove(i)" />
      </UiSettingRow>
      <UiSettingRow>
        <UiButton @click="addFilter('title')"
          >{{ m.bulk_add_add_filter() }}: {{ m.bulk_add_date_place_title() }}</UiButton
        >
        <UiButton @click="addFilter('tag')">{{ m.bulk_add_add_filter() }}: tag</UiButton>
        <UiButton @click="addFilter('property')">{{ m.bulk_add_add_filter() }}: property</UiButton>
      </UiSettingRow>
    </template>

    <UiSettingRow>
      <template #name>{{ m.bulk_add_existing_label() }}</template>
      <UiDropdown
        :model-value="values.existingNote"
        @update:model-value="(v) => setFieldValue('existingNote', v as BulkAddParams['existingNote'])"
      >
        <option value="skip">{{ m.bulk_add_option_skip() }}</option>
        <option value="override">{{ m.bulk_add_option_override() }}</option>
        <option value="merge">{{ m.bulk_add_option_merge() }}</option>
        <option value="ask">{{ m.bulk_add_option_ask() }}</option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow>
      <template #name>{{ m.bulk_add_other_folder_label() }}</template>
      <UiDropdown
        :model-value="values.otherFolder"
        @update:model-value="(v) => setFieldValue('otherFolder', v as BulkAddParams['otherFolder'])"
      >
        <option value="keep">{{ m.bulk_add_option_keep() }}</option>
        <option value="move">{{ m.bulk_add_option_move() }}</option>
        <option value="ask">{{ m.bulk_add_option_ask() }}</option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow>
      <template #name>{{ m.bulk_add_other_name_label() }}</template>
      <UiDropdown
        :model-value="values.otherName"
        @update:model-value="(v) => setFieldValue('otherName', v as BulkAddParams['otherName'])"
      >
        <option value="keep">{{ m.bulk_add_option_keep() }}</option>
        <option value="rename">{{ m.bulk_add_option_rename() }}</option>
        <option value="ask">{{ m.bulk_add_option_ask() }}</option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow>
      <template #name>{{ m.bulk_add_dry_run_label() }}</template>
      <UiToggle :model-value="values.dryRun" @update:model-value="(v) => setFieldValue('dryRun', v)" />
    </UiSettingRow>

    <UiSettingRow>
      <UiButton cta type="submit">{{ m.bulk_add_next() }}</UiButton>
    </UiSettingRow>
  </form>
</template>
```

Before writing, verify: `defaultCondition` is exported from `@/decorations/defaults` and accepts a condition `type` (check `EditDecorationModal.vue`'s import). Confirm `UiIconButton` exists (used by `EditDecorationModal`). Confirm `useFieldArray`/`useForm`/`toTypedSchema` import paths match `EditDecorationModal.vue`. If `ConditionItem`/`FolderInput` aren't exported from a barrel, import by file path as shown. Adapt the binding style (`setFieldValue` vs `v-model` via `useField`) to whatever `EditDecorationModal.vue` actually does, keeping the field names identical (`filters.${i}`) so `ConditionItem` works — report any deviation.

- [ ] **Step 3: Component test**

Create `src/journals/notes/bulk-add/ui/ConfigureBulkAddModal.test.ts`. Mount with `provideInjectorOnApp` (a container with `NotesService` = `FakeNotesService` for `FolderInput`'s folder suggest, and whatever `ConditionItem`'s leaves need — for a no-filter submit they need nothing) + `provideModalApiOnApp`. Keep it to behaviors that don't require deep DI:

```ts
describe("ConfigureBulkAddModal", () => {
  it("submits the default params when Continue is clicked", async () => {
    const { submit } = mountModal();
    await userEvent.click(screen.getByText(m.bulk_add_next()));
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ datePlace: "title", filterCombinator: "no", dryRun: true }),
    );
  });

  it("reveals the property-name field only when reading the date from a property", async () => {
    mountModal();
    expect(screen.queryByText(m.bulk_add_property_name_label())).toBeNull();
    // switch the date-place dropdown to "property"
    const dropdowns = screen.getAllByRole("combobox");
    await userEvent.selectOptions(dropdowns[1], "property"); // [0]=date place? confirm order; adjust index by querying near the label
    expect(screen.getByText(m.bulk_add_property_name_label())).toBeTruthy();
  });
});
```

`mountModal` builds the container (register `NotesService` with a `FakeNotesService`) and renders with both providers, returning `{ submit, cancel }`. If the dropdown-index approach is brittle, scope the query via the `UiSettingRow` containing the date-place label. Keep assertions black-box.

- [ ] **Step 4: Run + gates**

Run: `npm run test -- src/journals/notes/bulk-add/ui/ConfigureBulkAddModal.test.ts && npm run check:types && npm run check:lint`

- [ ] **Step 5: Commit**

```bash
git add src/journals/notes/bulk-add/ui/modals.ts src/journals/notes/bulk-add/ui/ConfigureBulkAddModal.vue src/journals/notes/bulk-add/ui/ConfigureBulkAddModal.test.ts
git commit -m "feat(journals): add bulk-add configure modal"
```

---

### Task 8: Process modal

**Files:**

- Create: `src/journals/notes/bulk-add/ui/ProcessBulkAddModal.vue`
- Test: `src/journals/notes/bulk-add/ui/ProcessBulkAddModal.test.ts`

- [ ] **Step 1: Component**

Create `src/journals/notes/bulk-add/ui/ProcessBulkAddModal.vue`. It receives the plan, lets the user resolve any `"ask"` decisions, runs `BulkAddService.apply` (injected), and shows the per-note log. Returns void on Close.

```vue
<script setup lang="ts">
import { ref } from "vue";

import { useService } from "@/infrastructure/di";
import { useModal } from "@/infrastructure/host/modals";
import { m } from "@/i18n";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { BulkAddService, type BulkLogEntry, type PlannedAction, type PlannedNote } from "../bulk-add-service";
import type { BulkAddParams } from "../config";

const props = defineProps<{ journalName: string; plan: { notes: PlannedNote[] }; params: BulkAddParams }>();
const api = useModal();
const service = useService(BulkAddService);

const actions = props.plan.notes.filter((n): n is PlannedAction => n.kind === "action");
const skips = props.plan.notes.filter((n) => n.kind === "skip");

// Per-note resolution for "ask" decisions, keyed by path.
const existing = ref<Record<string, "skip" | "override" | "merge">>(
  Object.fromEntries(
    actions.map((a) => [a.path, a.existing === "ask" ? "skip" : a.existing === "none" ? "skip" : a.existing]),
  ),
);
const move = ref<Record<string, boolean>>(Object.fromEntries(actions.map((a) => [a.path, a.folder === "move"])));
const rename = ref<Record<string, boolean>>(Object.fromEntries(actions.map((a) => [a.path, a.name === "rename"])));

const log = ref<BulkLogEntry[] | null>(null);

async function run(): Promise<void> {
  const resolved = actions.map((a) => ({
    path: a.path,
    anchor: a.anchor,
    existing: a.occupant === undefined ? ("none" as const) : (existing.value[a.path] ?? "skip"),
    move: a.folder === "ask" ? (move.value[a.path] ?? false) : a.folder === "move",
    rename: a.name === "ask" ? (rename.value[a.path] ?? false) : a.name === "rename",
  }));
  const result = await service.apply(props.journalName, resolved, props.params.dryRun);
  if (result.kind === "ok") log.value = result.value;
}

function close(): void {
  // Normal completion of the flow — submit (void), not cancel; cancel/dismiss maps to UserAborted upstream.
  api.submit();
}
</script>

<template>
  <div>
    <UiSettingRow no-controls>
      <template #description>
        {{ m.bulk_add_planned_count({ count: actions.length }) }} ·
        {{ m.bulk_add_skipped_count({ count: skips.length }) }}
      </template>
    </UiSettingRow>

    <template v-if="log === null">
      <UiSettingRow v-for="action of actions" :key="action.path">
        <template #name>{{ action.path }} → {{ action.anchor }}</template>
        <UiDropdown
          v-if="action.occupant !== undefined && action.existing === 'ask'"
          :model-value="existing[action.path]"
          @update:model-value="(v) => (existing[action.path] = v as 'skip' | 'override' | 'merge')"
        >
          <option value="skip">{{ m.bulk_add_option_skip() }}</option>
          <option value="override">{{ m.bulk_add_option_override() }}</option>
          <option value="merge">{{ m.bulk_add_option_merge() }}</option>
        </UiDropdown>
      </UiSettingRow>
      <UiSettingRow>
        <UiButton cta @click="run">{{ m.bulk_add_run() }}</UiButton>
      </UiSettingRow>
    </template>

    <template v-else>
      <UiSettingRow v-for="entry of log" :key="entry.path">
        <template #name>{{ entry.path }}</template>
        <template #description>
          <div v-for="(line, i) of entry.actions" :key="i">{{ line }}</div>
        </template>
      </UiSettingRow>
      <UiSettingRow>
        <UiButton cta @click="close">{{ m.bulk_add_close() }}</UiButton>
      </UiSettingRow>
    </template>
  </div>
</template>
```

This intentionally only surfaces the existing-note "ask" as an interactive control (the most consequential). Folder/name "ask" default to the planned booleans; if you want move/name "ask" dropdowns too, add them the same way — but keep the component focused; do not over-build beyond resolving the decisions the planner produced.

Verify: `UiSettingRow` supports a `no-controls` prop (used in `EditDecorationModal.vue:104`). Confirm `useModal()` with no type param returns an api whose `cancel()` closes (it does — `confirmCreationModal` uses `useModal<boolean>()`; here the result is void).

- [ ] **Step 2: Component test**

Create `src/journals/notes/bulk-add/ui/ProcessBulkAddModal.test.ts`. Build a container registering `BulkAddService` as a fake whose `apply` is a `vi.fn(() => AsyncResult.ok([{ path: "src/a.md", actions: ["Connected"] }]))`. Provide injector + modal api.

```ts
describe("ProcessBulkAddModal", () => {
  it("shows the action log after running", async () => {
    const apply = vi.fn(() =>
      AsyncResult.ok([{ path: "src/a.md" as VaultPath, actions: ["Connected to daily at 2026-06-01."] }]),
    );
    mountModal({
      apply,
      plan: {
        notes: [
          {
            kind: "action",
            path: "src/a.md" as VaultPath,
            anchor: "2026-06-01" as AnchorString,
            existing: "none",
            folder: "n/a",
            name: "n/a",
          },
        ],
      },
    });
    await userEvent.click(screen.getByText(m.bulk_add_run()));
    expect(await screen.findByText("Connected to daily at 2026-06-01.")).toBeTruthy();
  });

  it("calls apply with the dry-run flag from params", async () => {
    const apply = vi.fn(() => AsyncResult.ok([]));
    mountModal({ apply, dryRun: true, plan: { notes: [] } });
    await userEvent.click(screen.getByText(m.bulk_add_run()));
    expect(apply).toHaveBeenCalledWith("daily", expect.any(Array), true);
  });
});
```

`mountModal` builds a container with `BulkAddService` → `{ apply } as unknown as BulkAddService`, provides injector + modal api, renders with `{ journalName: "daily", plan, params: { ...defaultBulkAddParams(), dryRun } }`.

- [ ] **Step 3: Run + gates + commit**

Run: `npm run test -- src/journals/notes/bulk-add/ui/ProcessBulkAddModal.test.ts && npm run check:types && npm run check:lint`

```bash
git add src/journals/notes/bulk-add/ui/ProcessBulkAddModal.vue src/journals/notes/bulk-add/ui/ProcessBulkAddModal.test.ts
git commit -m "feat(journals): add bulk-add process modal"
```

---

### Task 9: `BulkAddFlow` (chain the two modals)

**Files:**

- Create: `src/journals/notes/bulk-add/flows/bulk-add.flow.ts`
- Test: `src/journals/notes/bulk-add/flows/bulk-add.flow.test.ts`
- Modify: `src/journals/notes/bulk-add/module.ts`

- [ ] **Step 1: Failing test**

Create `src/journals/notes/bulk-add/flows/bulk-add.flow.test.ts` (mirror `connect-note.flow.test.ts`): register `Flows`, `FakeModalService` as `ModalService`, and a fake `BulkAddService` whose `plan` returns `AsyncResult.ok({ notes: [] })`. Drive the two modals via `modals.lastOpen()`.

```ts
describe("BulkAddFlow", () => {
  it("plans with the configured params then opens the process modal", async () => {
    const { flows, modals, service } = build();
    const promise = flows.invoke(BulkAddFlow, { journalName: "daily" });
    // first modal: configure → submit params
    modals.lastOpen().submit({ ...defaultBulkAddParams(), folder: "src" });
    await Promise.resolve();
    // plan was called, second modal opened
    expect(service.plan).toHaveBeenCalledWith("daily", expect.objectContaining({ folder: "src" }));
    modals.lastOpen().cancel(); // close process modal
    await promise;
  });

  it("aborts cleanly when the configure modal is cancelled", async () => {
    const { flows, modals, service } = build();
    const promise = flows.invoke(BulkAddFlow, { journalName: "daily" });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind).toBe("err");
    expect(service.plan).not.toHaveBeenCalled();
  });
});
```

`build()` registers: `ModalService` (FakeModalService), `BulkAddService` (`{ plan: vi.fn(() => AsyncResult.ok({ notes: [] })) } as unknown as BulkAddService`), `Flows`, `BulkAddFlow`.

- [ ] **Step 2: Run, confirm FAIL.**

Run: `npm run test -- src/journals/notes/bulk-add/flows/bulk-add.flow.test.ts`

- [ ] **Step 3: Implement**

Create `src/journals/notes/bulk-add/flows/bulk-add.flow.ts`:

```ts
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import type { FolderNotFoundError } from "@/infrastructure/host";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import { BulkAddService } from "../bulk-add-service";
import { configureBulkAddModal, processBulkAddModal } from "../ui/modals";

export class BulkAddFlow implements Flow<{ journalName: string }, void, FolderNotFoundError | UserAborted> {
  readonly #modals = inject(ModalService);
  readonly #service = inject(BulkAddService);

  execute(parameters: { journalName: string }): AsyncResult<void, FolderNotFoundError | UserAborted> {
    return attempt.in(this, async function* (this: BulkAddFlow) {
      const params = yield* this.#modals
        .open(configureBulkAddModal, { journalName: parameters.journalName })
        .mapErr(() => new UserAborted("bulk-add-configure-modal"));

      const plan = yield* this.#service.plan(parameters.journalName, params);

      yield* this.#modals
        .open(processBulkAddModal, { journalName: parameters.journalName, plan, params })
        .mapErr(() => new UserAborted("bulk-add-process-modal"));
      return;
    });
  }
}
```

(The process modal performs `apply` internally and resolves with `cancel()` on Close — the flow treats that as a benign `UserAborted`, which the command path will ignore.)

- [ ] **Step 4: Register the flow**

In `src/journals/notes/bulk-add/module.ts`, add `import { BulkAddFlow } from "./flows/bulk-add.flow";` and `c.register(BulkAddFlow).useClass(BulkAddFlow);`.

- [ ] **Step 5: Run + gates + commit**

Run: `npm run test -- src/journals/notes/bulk-add/flows/bulk-add.flow.test.ts && npm run check:types && npm run check:lint`

```bash
git add src/journals/notes/bulk-add/flows/bulk-add.flow.ts src/journals/notes/bulk-add/flows/bulk-add.flow.test.ts src/journals/notes/bulk-add/module.ts
git commit -m "feat(journals): add BulkAddFlow"
```

---

### Task 10: Settings entry point

**Files:**

- Modify: `src/journals/settings/ui/JournalEditSubpage.vue`

- [ ] **Step 1: Add the button + handler**

`JournalEditSubpage.vue` already has `const flows = useService(Flows);` and a per-journal `journalName`, and a `rename()` handler invoking a flow (`void flows.invoke(RenameJournalFlow, { journalName })`). Add a parallel handler and a button near the existing journal actions:

In `<script setup>`, import the flow and add a handler:

```ts
import { BulkAddFlow } from "@/journals/notes/bulk-add/flows/bulk-add.flow";
```

```ts
function bulkAdd(): void {
  void flows.invoke(BulkAddFlow, { journalName });
}
```

In the template, next to the existing rename/actions area, add:

```vue
<UiButton @click="bulkAdd">{{ m.bulk_add_command() }}</UiButton>
```

Match the surrounding button/markup style in that file (it uses `UiButton`/`UiIconButton`). Place it where v2 had it conceptually — a per-journal action. If `BulkAddFlow`'s import path crosses a barrel boundary that the lint `import/order` rules object to, import from a barrel if one exists; otherwise the direct path is fine (other code imports flows by path).

- [ ] **Step 2: Manual + automated check**

There may be an existing `JournalEditSubpage.test.ts`. If so, add ONE behavior test: clicking the bulk-add button invokes `BulkAddFlow`. Follow that file's existing harness (it provides an injector with a fake `Flows`); assert `flows.invoke` was called with `BulkAddFlow` + `{ journalName }`. If wiring a full render is disproportionate (the subpage is large), it is acceptable to rely on the flow/modal tests already written and skip a subpage-level test — but prefer the small test if the harness already exists.

- [ ] **Step 3: Gates + commit**

Run: `npm run test && npm run check:types && npm run check:lint`

```bash
git add src/journals/settings/ui/JournalEditSubpage.vue
git commit -m "feat(journals): launch bulk-add from journal settings"
```

---

### Checkpoint C (feature complete)

```bash
npm run test && npm run check:types && npm run check:lint
```

Manually verify in Obsidian: open a journal's settings → **Bulk add notes** → pick a source folder, set the date source/format, optionally add filters and choose existing/folder/name handling, leave dry-run on → Continue → review the plan → Run → confirm the log; then re-run with dry-run off and confirm notes connect, move/rename, merge, and skip as configured. Closes gap #1.

---

## Notes for the implementer

- **Reuse, don't redefine:** filters use the decoration condition schemas/evaluators/editors; connect/override/move/rename/merge reuse `NoteConnectionService` + `NotesService`. Do not reimplement these.
- **The index auto-syncs from frontmatter** — `apply` never touches `JournalsIndex` directly (connect/disconnect write frontmatter; the subscription updates the index). The planner only READS the index.
- **Conventions:** errors in `errors.ts`; no lint silencing (resolve the moment-internals access without `eslint-disable` if the rule is enforced); no WHAT-comments; ts-pattern for union dispatch; field-initializer DI; black-box tests; one behavior per test; testing-library (role/text queries) for components. Do not commit generated paraglide output. Do not reformat files outside each task's set (revert stray hook edits to e.g. `src/calendar/**`).
- **Dry-run default is ON** (`defaultBulkAddParams`), matching a safe-by-default bulk operation.
