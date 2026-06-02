# Port Legacy Data Migrations to v3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate every legacy `data.json` (v1 / v2 / old-monolithic-v3) into the new v3 slice/collection storage shape, non-interactively, plus a one-time runtime pass that rewrites legacy v1 note frontmatter.

**Architecture:** Three pure-data migrations registered on `MigrationToken` run a `0→2→3→4` chain. `0→2` and `2→3` emit the old monolithic shape; `3→4` reshapes it onto the new slice/collection keys. A `pendingNoteMigration` marker (written by `0→2`, carried through to a dedicated slice) bridges to a post-`autoLoad` `DataMigrationService` that rewrites v1 note frontmatter via the v3 runtime services.

**Tech Stack:** TypeScript, valibot, Vue reactivity, the repo's `Result`/`AsyncResult`/`Option` infrastructure, vitest. Migrations live in `src/settings/legacy/`.

**Spec:** `docs/superpowers/specs/2026-06-02-port-legacy-data-migrations-design.md`

---

## Reference facts (read once before starting)

These are verified against the codebase; tasks below depend on them.

- Migration runner: `src/settings/migrations.ts` — `runMigrations(raw, migrations, targetVersion)`. Reads `raw.version ?? 0`, finds a migration whose `fromVersion` matches, applies, advances. `fromVersion === toVersion` migrations are skipped. Non-contiguous jumps (e.g. `0→2`) are allowed.
- `Migration` type: `src/settings/schema.ts:40` — `{ fromVersion: number; toVersion: number; migrate(raw: Record<string, unknown>): Record<string, unknown> }`.
- `CURRENT_VERSION`: `src/settings/version.ts` (currently `3`).
- Slice/collection definitions and tokens: `src/settings/schema.ts`, `src/settings/tokens.ts`. `MigrationToken`, `SliceDefinitionToken`, `CollectionDefinitionToken` are multi-tokens.
- Settings test harness: `src/settings/testing.ts` — `createSettingsService({ raw, slices, collections, migrations })`.
- Target schemas (new shape): `src/journals/config.ts` (`journalConfigSchema`, `journalConfigCollection`, `journalDefaultsFor`), `src/shelves/config.ts` (`shelvesCollection`), `src/commands/config.ts` (`commandCollection`, `commandConfigSchema`), `src/calendar/settings/slice.ts` (`calendarSlice` — `variant("mode", [locale, custom])`), `src/notes-calendar/appearance/slice.ts` (`appearanceSlice`), `src/journals/startup/slice.ts` (`startupSlice` — `{ journalName }`), `src/views/config.ts` (`viewsCollection`), `src/views/default-view.ts` (`defaultCalendarView()`, `DEFAULT_CALENDAR_VIEW_ID`).
- Old source to port: `src/_old-code/migrations/components/v1-v2/v1-v2.ts`, `src/_old-code/migrations/components/v2-v3.ts`, `src/_old-code/types/old-settings.types.ts`, `src/_old-code/types/settings.types.ts`, `src/_old-code/journals/journal-defaults.ts`, `src/_old-code/defaults.ts`, `src/_old-code/calendar.ts:21` (`calculateDoy`).
- Runtime services for Phase B: `NotesService.allMarkdownNotes(): VaultPath[]` and `NotesService.updateFrontmatter(path, mutate): AsyncResult<void, …>` (`src/infrastructure/host/internal/notes-service.ts`), `NoteMetadataService.get(path): Option<NoteMetadata>` with `.properties` (`…/note-metadata-service.ts`), `CycleService.anchorOf(name, date): Option<AnchorString>` (`src/journals/cycle.ts`), `CalendarDate.parse(input, format?): Result<CalendarDate, ParseError>` (`src/calendar/calendar-date.ts`), `JournalsRepository.get/has` (`src/journals/repository.ts`). Exports via `@/infrastructure/host`, `@/journals`, `@/calendar`.
- `main.ts` wiring point: `src/main.ts` — services with `.initialize()` are resolved after `container.autoLoad()`.

**Conventions (from repo memory — follow strictly):**

- Run `npm run test`, `npm run check:types`, `npm run check:lint` (npm, not pnpm). No e2e.
- Colocate `*.test.ts` with implementation. Use `expectTypeOf` for type assertions, never `@ts-expect-error`.
- No `eslint-disable`. No `Co-Authored-By` trailer. Commit to the **current branch** (`v3-ai`); never branch.
- One behavior per test; black-box assertions; nested `describe()` for scope; no wiring/barrel-shape tests.
- Errors live in the feature's `errors.ts`. Zero-arg DI modules export a plain `const xModule: Module = {…}`.
- `ts-pattern` `match().with().exhaustive()` for discriminated-union dispatch (not `switch`).

---

## File Structure

```
src/settings/
  version.ts                         MODIFY: CURRENT_VERSION 3 -> 4
  legacy/
    old-shapes.ts                    CREATE: frozen legacy types + calculateDoy + defaultCommands
    pending-note-migration.ts        CREATE: marker schema + slice definition
    journal-conversion.ts            CREATE: ported prepareCalendar/IntervalJournalSettings + name allocator
    v1-to-v2.ts                      CREATE: Migration {0->2}
    v2-to-v3.ts                      CREATE: Migration {2->3}
    v3-to-v4.ts                      CREATE: Migration {3->4} reshape
    data-migration-service.ts        CREATE: runtime note-frontmatter rewrite
    module.ts                        CREATE: legacyMigrationsModule
    index.ts                         CREATE: barrel
    journal-conversion.test.ts
    v1-to-v2.test.ts
    v2-to-v3.test.ts
    v3-to-v4.test.ts
    chain.test.ts
    pending-note-migration.test.ts
    data-migration-service.test.ts
src/main.ts                          MODIFY: register legacyMigrationsModule + run DataMigrationService
```

---

# Phase A — Settings reshape (pure data)

## Task A1: Frozen legacy types + helpers

**Files:**

- Create: `src/settings/legacy/old-shapes.ts`

No test (type/const declarations only; exercised through migrations in later tasks).

- [ ] **Step 1: Create `old-shapes.ts`**

Copy the legacy type shapes verbatim from `_old-code` (do **not** import from `_old-code`). Include exactly the types the migrations read:

- From `src/_old-code/types/old-settings.types.ts`: `PluginSettingsV1`, `CalendarConfig`, `CalendarSection`, `IntervalConfig`, `JournalConfigV1`, the local `CalendarGranularity` and `JournalCaseConfig`.
- From `src/_old-code/types/settings.types.ts`: `OpenMode`, the old monolithic `PluginSettings` (rename to `OldPluginSettings`), `JournalSettings` (rename to `OldJournalSettings`), `ShelfSettings` (→ `OldShelfSettings`), `PluginCommand` (→ `OldPluginCommand`), `JournalCommand` (→ `OldJournalCommand`), `NavBlockRow` (→ `OldNavBlockRow`), `ColorSettings`, `JournalDecoration` and its condition/style member types, the write/end union members. Keep field names identical to the originals.

Also port these two small values (frozen copies):

```ts
// calculateDoy — from src/_old-code/calendar.ts:21
export function calculateDoy(firstDayOfWeek: number, firstWeekOfYear: number): number {
  return 7 + firstDayOfWeek - firstWeekOfYear;
}
```

```ts
// emptyNavRow — from src/_old-code/journals/journal-defaults.ts:20
export const emptyNavRow: OldNavBlockRow = {
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

// defaultDateFormats — from src/_old-code/journals/journal-defaults.ts:12
export const defaultDateFormats: Record<OldJournalSettings["write"]["type"], string> = {
  day: "YYYY-MM-DD",
  week: "YYYY-[W]w",
  month: "YYYY-MM",
  quarter: "YYYY-[Q]Q",
  year: "YYYY",
  custom: "YYYY-MM-DD",
};
```

```ts
// defaultCommands — the old default command list from src/_old-code/defaults.ts
// (PluginCommand[]). Copy the full array (day/week/month/quarter/year x same/next/previous
// "Open ..." entries) verbatim into a frozen const:
export const defaultCommands: OldPluginCommand[] = [
  /* copy from _old-code/defaults.ts */
];
```

> The plan does not reproduce all ~15 default command entries; copy them exactly from `src/_old-code/defaults.ts` (the `defaultPluginSettings.commands` array). Each entry is `{ name, writeType, type, openMode, showInRibbon, icon }`.

Also port `journalDefaultsBasedOnType` support: the migrations need a default `OldJournalSettings` skeleton. Copy `defaultJournalSettings` from `src/_old-code/defaults.ts:174` as `defaultOldJournalSettings: OldJournalSettings`, and the `prepareJournalDefaultsBasedOnType` + `defaultNavBlocks` logic referenced by the conversion (from `src/_old-code/journals/journal-defaults.ts`) as a function `oldJournalDefaultsBasedOnType(write): Partial<OldJournalSettings>`. Copy those bodies verbatim, retyped against the `Old*` names.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "legacy/old-shapes" || echo "clean"`
Expected: `clean` (file type-checks; unused exports are fine for now).

- [ ] **Step 3: Commit**

```bash
git add src/settings/legacy/old-shapes.ts
git commit -m "feat(migrations): frozen legacy settings types and helpers"
```

---

## Task A2: `pendingNoteMigration` marker schema + slice

**Files:**

- Create: `src/settings/legacy/pending-note-migration.ts`
- Test: `src/settings/legacy/pending-note-migration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { pendingNoteMigrationSlice, pendingNoteMigrationSchema } from "./pending-note-migration";

describe("pendingNoteMigration slice", () => {
  it("defaults to an empty list", () => {
    expect(pendingNoteMigrationSlice.defaults).toEqual([]);
  });

  it("parses an interval marker entry", () => {
    const entry = { oldJournalId: "abc", kind: "interval", name: "My Interval" };
    expect(v.parse(pendingNoteMigrationSchema, [entry])).toEqual([entry]);
  });

  it("parses a calendar marker entry with a section map", () => {
    const entry = {
      oldJournalId: "abc",
      kind: "calendar",
      sectionToName: { day: "My Journal Day", week: "My Journal Week" },
    };
    expect(v.parse(pendingNoteMigrationSchema, [entry])).toEqual([entry]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/settings/legacy/pending-note-migration.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import * as v from "valibot";

import { defineSlice } from "@/settings";

const sectionName = v.picklist(["day", "week", "month", "quarter", "year"] as const);

const intervalMarker = v.object({
  oldJournalId: v.string(),
  kind: v.literal("interval"),
  name: v.string(),
});

const calendarMarker = v.object({
  oldJournalId: v.string(),
  kind: v.literal("calendar"),
  sectionToName: v.record(sectionName, v.string()),
});

export const pendingNoteMigrationSchema = v.array(v.variant("kind", [intervalMarker, calendarMarker]));

export type PendingNoteMigration = v.InferOutput<typeof pendingNoteMigrationSchema>[number];

export const PENDING_NOTE_MIGRATION_KEY = "pendingNoteMigration";

export const pendingNoteMigrationSlice = defineSlice(PENDING_NOTE_MIGRATION_KEY, pendingNoteMigrationSchema, []);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/settings/legacy/pending-note-migration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/settings/legacy/pending-note-migration.ts src/settings/legacy/pending-note-migration.test.ts
git commit -m "feat(migrations): pendingNoteMigration marker slice"
```

---

## Task A3: Journal conversion + name allocator (v1 journals → old v2 JournalSettings)

**Files:**

- Create: `src/settings/legacy/journal-conversion.ts`
- Test: `src/settings/legacy/journal-conversion.test.ts`

This ports `prepareCalendarJournalSettings` / `prepareIntervalJournalSettings` from `src/_old-code/migrations/components/v1-v2/v1-v2.ts` and adds the name allocator.

- [ ] **Step 1: Write the failing tests** (port the representative behaviors from `_old-code/.../v1-v2.test.ts`, retargeted to the new function names; add allocator + section-name tests)

```ts
import { describe, expect, it } from "vitest";

import {
  allocateName,
  prepareCalendarJournalSettings,
  prepareIntervalJournalSettings,
  type ConfiguredNames,
} from "./journal-conversion";

import type { CalendarConfig, IntervalConfig } from "./old-shapes";

function calendarFixture(): CalendarConfig {
  const section = {
    enabled: true,
    openMode: "active" as const,
    nameTemplate: "",
    dateFormat: "",
    folder: "",
    template: "",
    ribbon: { show: false, icon: "", tooltip: "" },
    createOnStartup: false,
  };
  return {
    type: "calendar",
    id: "test-id",
    name: "Test name",
    rootFolder: "",
    openOnStartup: false,
    startupSection: "day",
    day: { ...section },
    week: { ...section },
    month: { ...section },
    quarter: { ...section },
    year: { ...section },
  };
}

function intervalFixture(): IntervalConfig {
  return {
    id: "test-id",
    type: "interval",
    name: "Test Interval",
    duration: 2,
    granularity: "week",
    start_date: "2022-02-01",
    start_index: 1,
    numeration_type: "increment",
    end_type: "never",
    end_date: "",
    repeats: 1,
    limitCreation: false,
    openOnStartup: false,
    openMode: "active",
    nameTemplate: "",
    navNameTemplate: "",
    navDatesTemplate: "",
    dateFormat: "",
    folder: "test-folder",
    template: "",
    ribbon: { show: false, icon: "", tooltip: "" },
    createOnStartup: true,
    calendar_view: { order: "chrono" },
  };
}

const names: ConfiguredNames = {
  shelf: "Test shelf",
  day: "Daily notes",
  week: "Weekly notes",
  month: "Monthly notes",
  quarter: "Quarterly notes",
  year: "Yearly notes",
};

describe("prepareCalendarJournalSettings", () => {
  it("converts a daily section to a day journal", () => {
    const s = prepareCalendarJournalSettings(calendarFixture(), "day", names, false, false);
    expect(s.write).toEqual({ type: "day" });
    expect(s.name).toBe(names.day);
    expect(s.dateFormat).toBe("YYYY-MM-DD");
  });

  it("adds to the shelf when requested", () => {
    const s = prepareCalendarJournalSettings(calendarFixture(), "day", names, true, false);
    expect(s.shelves).toEqual([names.shelf]);
  });

  it("prefixes the root folder when configured", () => {
    const old = calendarFixture();
    old.rootFolder = "root-folder";
    old.day.folder = "test-folder";
    const s = prepareCalendarJournalSettings(old, "day", names, false, false);
    expect(s.folder).toBe("root-folder/test-folder");
  });

  it("enables start/end date frontmatter only when requested", () => {
    const s = prepareCalendarJournalSettings(calendarFixture(), "day", names, false, true);
    expect(s.frontmatter.addStartDate).toBe(true);
    expect(s.frontmatter.addEndDate).toBe(true);
  });
});

describe("prepareIntervalJournalSettings", () => {
  it("converts to a custom write interval", () => {
    const s = prepareIntervalJournalSettings(intervalFixture(), false);
    expect(s.write).toEqual({ type: "custom", anchorDate: "2022-02-01", every: "week", duration: 2 });
  });

  it("computes the year-reset divisor for weeks", () => {
    const old = intervalFixture();
    old.numeration_type = "year";
    old.granularity = "week";
    old.duration = 2;
    const s = prepareIntervalJournalSettings(old, false);
    expect(s.index).toMatchObject({ type: "reset_after", resetAfter: 26 });
  });
});

describe("allocateName", () => {
  it("returns the proposed name when free", () => {
    const used = new Set<string>();
    expect(allocateName("My Journal Day", used)).toBe("My Journal Day");
  });

  it("suffixes a counter on collision and reserves it", () => {
    const used = new Set<string>(["Daily"]);
    expect(allocateName("Daily", used)).toBe("Daily 2");
    expect(allocateName("Daily", used)).toBe("Daily 3");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- src/settings/legacy/journal-conversion.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Port `prepareCalendarJournalSettings` and `prepareIntervalJournalSettings` verbatim from `src/_old-code/migrations/components/v1-v2/v1-v2.ts` (lines 65–179 and 250–300), with these mechanical changes only:

- Import the `Old*` types and helpers from `./old-shapes` (`defaultOldJournalSettings`, `oldJournalDefaultsBasedOnType`, `emptyNavRow`, `defaultDateFormats`, `OldJournalSettings`, `CalendarConfig`, `IntervalConfig`, `OldJournalCommand`).
- Replace `JournalAnchorDate(x)` with the plain string `x` (the old shape stored anchor dates as strings; `OldJournalSettings.index.anchorDate` is `string`).
- Replace `deepCopy(...)` with `structuredClone(...)`.
- Keep the function signatures: `prepareCalendarJournalSettings(old, section, names, addShelf, keepFrontmatter)` and `prepareIntervalJournalSettings(old, keepFrontmatter)`.
- Export `ConfiguredNames` (copy the interface from `v1-v2.ts:24`).
- `DEFAULT_RIBBON_TOOLTIPS` and `defaultDateFormats` come along (copy `DEFAULT_RIBBON_TOOLTIPS` from `v1-v2.ts:16`).

Add the allocator:

```ts
export function allocateName(proposed: string, used: Set<string>): string {
  if (!used.has(proposed)) {
    used.add(proposed);
    return proposed;
  }
  let n = 2;
  while (used.has(`${proposed} ${n}`)) n++;
  const name = `${proposed} ${n}`;
  used.add(name);
  return name;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- src/settings/legacy/journal-conversion.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/settings/legacy/journal-conversion.ts src/settings/legacy/journal-conversion.test.ts
git commit -m "feat(migrations): port v1 journal conversion and add name allocator"
```

---

## Task A4: Migration `0→2` (v1 → old monolithic v2 + marker)

**Files:**

- Create: `src/settings/legacy/v1-to-v2.ts`
- Test: `src/settings/legacy/v1-to-v2.test.ts`

This builds the old monolithic v2 shape from `PluginSettingsV1`, applying the locked defaults (shelf per calendar journal named after it; `"{name} {section}"` section names; `keepFrontmatter = false`), and records the `pendingNoteMigration` marker.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";

import { v1ToV2Migration } from "./v1-to-v2";

import type { PluginSettingsV1 } from "./old-shapes";

function section(enabled: boolean) {
  return {
    enabled,
    openMode: "active" as const,
    nameTemplate: "",
    dateFormat: "",
    folder: "",
    template: "",
    ribbon: { show: false, icon: "", tooltip: "" },
    createOnStartup: false,
  };
}

function v1Fixture(): PluginSettingsV1 {
  return {
    journals: {
      cal: {
        type: "calendar",
        id: "cal",
        name: "My Journal",
        rootFolder: "",
        openOnStartup: false,
        startupSection: "day",
        day: section(true),
        week: section(true),
        month: section(false),
        quarter: section(false),
        year: section(false),
      },
      int: {
        id: "int",
        type: "interval",
        name: "Sprints",
        duration: 2,
        granularity: "week",
        start_date: "2022-02-01",
        start_index: 1,
        numeration_type: "increment",
        end_type: "never",
        end_date: "",
        repeats: 1,
        limitCreation: false,
        openOnStartup: false,
        openMode: "active",
        nameTemplate: "",
        navNameTemplate: "",
        navDatesTemplate: "",
        dateFormat: "",
        folder: "",
        template: "",
        ribbon: { show: false, icon: "", tooltip: "" },
        createOnStartup: false,
        calendar_view: { order: "chrono" },
      },
    },
    calendar: { firstDayOfWeek: 1, firstWeekOfYear: 4 },
    calendar_view: { leaf: "left", weeks: "left" },
  };
}

describe("v1ToV2Migration", () => {
  it("targets version 0 -> 2", () => {
    expect(v1ToV2Migration.fromVersion).toBe(0);
    expect(v1ToV2Migration.toVersion).toBe(2);
  });

  it("splits a calendar journal into one journal per enabled section", () => {
    const out = v1ToV2Migration.migrate(v1Fixture() as unknown as Record<string, unknown>);
    const journals = out.journals as Record<string, unknown>;
    expect(Object.keys(journals)).toEqual(expect.arrayContaining(["My Journal Day", "My Journal Week", "Sprints"]));
    expect(journals["My Journal Month"]).toBeUndefined();
  });

  it("groups calendar sections under a shelf named after the old journal", () => {
    const out = v1ToV2Migration.migrate(v1Fixture() as unknown as Record<string, unknown>);
    const shelves = out.shelves as Record<string, { name: string; journals: string[] }>;
    expect(shelves["My Journal"].journals).toEqual(["My Journal Day", "My Journal Week"]);
  });

  it("carries the locale sentinel through unchanged", () => {
    const v1 = v1Fixture();
    v1.calendar.firstDayOfWeek = -1;
    const out = v1ToV2Migration.migrate(v1 as unknown as Record<string, unknown>);
    expect((out.calendar as { dow: number }).dow).toBe(-1);
  });

  it("records a calendar marker keyed by old id with final journal names", () => {
    const out = v1ToV2Migration.migrate(v1Fixture() as unknown as Record<string, unknown>);
    const marker = out.pendingNoteMigration as Array<Record<string, unknown>>;
    expect(marker).toContainEqual({
      oldJournalId: "cal",
      kind: "calendar",
      sectionToName: { day: "My Journal Day", week: "My Journal Week" },
    });
    expect(marker).toContainEqual({ oldJournalId: "int", kind: "interval", name: "Sprints" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- src/settings/legacy/v1-to-v2.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import {
  calculateDoy,
  defaultCommands,
  type CalendarConfig,
  type IntervalConfig,
  type OldJournalSettings,
  type OldShelfSettings,
  type PluginSettingsV1,
} from "./old-shapes";
import {
  allocateName,
  prepareCalendarJournalSettings,
  prepareIntervalJournalSettings,
  type ConfiguredNames,
} from "./journal-conversion";
import { type PendingNoteMigration } from "./pending-note-migration";

import type { Migration } from "@/settings";

const SECTIONS = ["day", "week", "month", "quarter", "year"] as const;

export const v1ToV2Migration: Migration = {
  fromVersion: 0,
  toVersion: 2,
  migrate(raw) {
    const old = raw as unknown as PluginSettingsV1;

    const journals: Record<string, OldJournalSettings> = {};
    const shelves: Record<string, OldShelfSettings> = {};
    const marker: PendingNoteMigration[] = [];
    const used = new Set<string>();

    for (const config of Object.values(old.journals)) {
      if (config.type === "interval") {
        const name = allocateName(config.name, used);
        const settings = prepareIntervalJournalSettings(config, false);
        settings.name = name;
        journals[name] = settings;
        marker.push({ oldJournalId: config.id, kind: "interval", name });
      } else {
        const sectionToName: Partial<Record<(typeof SECTIONS)[number], string>> = {};
        const shelfName = config.name;
        // ConfiguredNames default: shelf = old name, section names = "{old name} {section}"
        const names: ConfiguredNames = {
          shelf: shelfName,
          day: `${config.name} day`,
          week: `${config.name} week`,
          month: `${config.name} month`,
          quarter: `${config.name} quarter`,
          year: `${config.name} year`,
        };
        const shelfJournals: string[] = [];
        for (const section of SECTIONS) {
          if (!config[section].enabled) continue;
          const name = allocateName(names[section], used);
          const settings = prepareCalendarJournalSettings(config, section, names, true, false);
          settings.name = name;
          settings.shelves = [shelfName];
          journals[name] = settings;
          shelfJournals.push(name);
          sectionToName[section] = name;
        }
        if (shelfJournals.length > 0) {
          shelves[shelfName] = { name: shelfName, journals: shelfJournals, commands: [] };
          marker.push({ oldJournalId: config.id, kind: "calendar", sectionToName });
        }
      }
    }

    const dow = old.calendar.firstDayOfWeek;
    const doy = dow === -1 ? 1 : calculateDoy(dow, old.calendar.firstWeekOfYear);

    return {
      version: 2,
      journals,
      shelves,
      commands: structuredClone(defaultCommands),
      calendar: { dow, doy, global: false },
      calendarView: {
        leaf: old.calendar_view.leaf,
        weeks: old.calendar_view.weeks,
      },
      openOnStartup: "",
      pendingNoteMigration: marker,
    } as Record<string, unknown>;
  },
};
```

> Note: section names use the raw section word per the locked decision (`"My Journal day"` from `names`, displayed as title-case in the spec example only). If the user-facing capitalization (`"My Journal Day"`) is desired, capitalize the section word in `names`; the tests above assume capitalized — make `names` use `` `${config.name} Day` `` etc. **Use capitalized section words** to match the approved `"My Journal Day"` format and the tests.

Adjust the `names` object to capitalized section words: `day: \`${config.name} Day\``, `week: \`${config.name} Week\``, `month: \`${config.name} Month\``, `quarter: \`${config.name} Quarter\``, `year: \`${config.name} Year\``.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- src/settings/legacy/v1-to-v2.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/settings/legacy/v1-to-v2.ts src/settings/legacy/v1-to-v2.test.ts
git commit -m "feat(migrations): v1 to v2 migration with sensible defaults"
```

---

## Task A5: Migration `2→3`

**Files:**

- Create: `src/settings/legacy/v2-to-v3.ts`
- Test: `src/settings/legacy/v2-to-v3.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { v2ToV3Migration } from "./v2-to-v3";

describe("v2ToV3Migration", () => {
  it("targets version 2 -> 3", () => {
    expect(v2ToV3Migration.fromVersion).toBe(2);
    expect(v2ToV3Migration.toVersion).toBe(3);
  });

  it("back-fills commands when absent", () => {
    const out = v2ToV3Migration.migrate({ version: 2 });
    expect(Array.isArray(out.commands)).toBe(true);
    expect((out.commands as unknown[]).length).toBeGreaterThan(0);
  });

  it("back-fills per-shelf commands and dismissedNotifications", () => {
    const out = v2ToV3Migration.migrate({ version: 2, shelves: { a: { name: "a", journals: [] } } });
    expect((out.shelves as Record<string, { commands: unknown[] }>).a.commands).toEqual([]);
    expect(out.dismissedNotifications).toEqual([]);
  });

  it("preserves existing commands", () => {
    const existing = [{ name: "keep" }];
    const out = v2ToV3Migration.migrate({ version: 2, commands: existing });
    expect(out.commands).toBe(existing);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- src/settings/legacy/v2-to-v3.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (direct port of `src/_old-code/migrations/components/v2-v3.ts`)

```ts
import { defaultCommands } from "./old-shapes";

import type { Migration } from "@/settings";

export const v2ToV3Migration: Migration = {
  fromVersion: 2,
  toVersion: 3,
  migrate(raw) {
    raw.commands ??= structuredClone(defaultCommands);
    const shelves = (raw.shelves ?? {}) as Record<string, { commands?: unknown[] }>;
    for (const shelf of Object.values(shelves)) shelf.commands ??= [];
    raw.dismissedNotifications ??= [];
    return raw;
  },
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- src/settings/legacy/v2-to-v3.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/settings/legacy/v2-to-v3.ts src/settings/legacy/v2-to-v3.test.ts
git commit -m "feat(migrations): v2 to v3 field back-fills"
```

---

## Task A6: Migration `3→4` — reshape monolithic → slices/collections

**Files:**

- Create: `src/settings/legacy/v3-to-v4.ts`
- Test: `src/settings/legacy/v3-to-v4.test.ts`

This is the largest mapper. Implement it as one `migrate` that delegates to small per-key reshape functions in the same file. Use `nanoid()` for generated collection ids.

### Mapping rules (authoritative)

**`journals{}` (`OldJournalSettings`) → `journals` collection (`JournalConfig`), keyed by `nanoid()`:**

- Carry across unchanged: `name`, `write`, `confirmCreation`, `autoCreate`, `nameTemplate`, `dateFormat`, `folder`, `templates`, `decorations`, `navBlock`.
- `timeline = { start: old.start, end: mapEnd(old.end) }` where `mapEnd({type:"never"}) = {kind:"never"}`, `{type:"date",date} = {kind:"date",date}`, `{type:"repeats",repeats} = {kind:"repeats",count:repeats}`.
- `numbering = { enabled: old.index.enabled, anchorDate: old.index.anchorDate, allowBefore: old.index.allowBefore, sources: [{ variable: "index", frontmatterKey: old.frontmatter.indexField, anchorValue: old.index.anchorIndex, reset: old.index.type === "reset_after" ? { kind: "after", count: old.index.resetAfter } : { kind: "never" } }] }`.
- `intervalBlock = { type: "create", rows: old.calendarViewBlock.rows, decorateWholeBlock: old.calendarViewBlock.decorateWholeBlock }`.
- `frontmatter = { dateField: old.frontmatter.dateField, startDateField: old.frontmatter.startDateField, endDateField: old.frontmatter.endDateField, addStartDate: old.frontmatter.addStartDate, addEndDate: old.frontmatter.addEndDate }`.
- Each `old.commands[]` entry → push into the commands output (see below) with `target: { kind: "journal", journalName: old.name }`.

**`shelves{}` (`OldShelfSettings`) → `shelves` collection (`{ name, journals }`), keyed by `nanoid()`:**

- Carry `name`, `journals`. Each `old.commands[]` → commands output with `target: { kind: "shelf", shelfName: old.name, writeType: cmd.writeType }`.

**`commands[]` (`OldPluginCommand`) → `commands` collection, keyed by `nanoid()`:**

- `{ name, icon, showInRibbon, openMode, type, context: "today", target: { kind: "all", writeType: cmd.writeType } }`.

**Per-journal / per-shelf commands** are appended to the same commands output. A shared `OldJournalCommand`→new-command mapping: `{ name, icon, showInRibbon, openMode, type, context: cmd.context, target }` (journal commands carry their own `context`; plugin/shelf commands use `"today"`).

**`calendar{dow,doy,global}` → `calendar` slice:** `dow === -1 ? { mode: "locale" } : { mode: "custom", dow, doy, global }`.

**`calendarView.todayStyle/activeStyle` → `appearance` slice:** `{ today: { color: calendarView.todayStyle.color, background: calendarView.todayStyle.background }, active: { color: calendarView.activeStyle.color, background: calendarView.activeStyle.background } }`. When `calendarView` or a style is absent, omit `appearance` (let the slice seed its default).

**`calendarView.{leaf,weeks,display,todayMode,pickMode}` → seeded default view in `views` collection:** start from `defaultCalendarView()` (import from `@/views`), patch:

- `view.leaf = calendarView.leaf` (`"left"|"right"`).
- Month-calendar block (`block.key === "month-calendar"`) `config.weeks = calendarView.weeks` (`"none"|"left"|"right"`).
- The `current` button item (toolbar block → items → `item.config.action.type === "current"`) `config.action.mode = mapMode(calendarView.todayMode)`.
- The `pick-date` button item (`action.type === "pick-date"`) `config.action.mode = mapMode(calendarView.pickMode)`.
- `mapMode`: `"navigate" → "navigate"`, `"create" → "create"`, `"switch_date" → "select-only"`.
- `display === "week"` → replace the `month-calendar` block with a `week-calendar` block: `{ id: <keep same instance id>, key: "week-calendar", config: { before: 0, after: 0, hideWeekends: false, weeks: calendarView.weeks ?? "left" } }`. `display === "month" | "day"` → keep month-calendar.
- Emit `{ [DEFAULT_CALENDAR_VIEW_ID]: patchedView }` under `views`. When `calendarView` is absent, omit `views` (the collection seed produces the pristine default).

**`openOnStartup` (string) → `startup` slice:** `{ journalName: old.openOnStartup ?? "" }`.

**`pendingNoteMigration` → carried forward verbatim** (must be copied explicitly into the output object).

**Dropped:** `ui`, `useShelves`, `showReloadHint`, `pendingMigrations`, `dismissedNotifications`, and the old `version` (the runner sets `version: 4`).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";

import { DEFAULT_CALENDAR_VIEW_ID } from "@/views";

import { v3ToV4Migration } from "./v3-to-v4";

function monolithV3() {
  return {
    version: 3,
    journals: {
      "My Journal Day": {
        name: "My Journal Day",
        write: { type: "day" },
        confirmCreation: false,
        autoCreate: false,
        nameTemplate: "{{date}}",
        dateFormat: "YYYY-MM-DD",
        folder: "",
        templates: [],
        start: "",
        end: { type: "never" },
        index: { enabled: false, anchorDate: "", anchorIndex: 1, allowBefore: false, type: "increment", resetAfter: 0 },
        commands: [],
        decorations: [],
        navBlock: { type: "create", rows: [], decorateWholeBlock: false },
        calendarViewBlock: { rows: [], decorateWholeBlock: false },
        frontmatter: {
          dateField: "journal-date",
          addStartDate: false,
          startDateField: "journal-start-date",
          addEndDate: false,
          endDateField: "journal-end-date",
          indexField: "journal-index",
        },
      },
    },
    shelves: { "My Journal": { name: "My Journal", journals: ["My Journal Day"], commands: [] } },
    commands: [
      { name: "Open today's note", writeType: "day", type: "same", openMode: "tab", showInRibbon: false, icon: "" },
    ],
    calendar: { dow: 1, doy: 4, global: false },
    calendarView: {
      display: "month",
      leaf: "left",
      weeks: "left",
      todayMode: "create",
      pickMode: "navigate",
      todayStyle: { color: { type: "theme", name: "a" }, background: { type: "transparent" } },
      activeStyle: { color: { type: "theme", name: "b" }, background: { type: "transparent" } },
    },
    openOnStartup: "My Journal Day",
    pendingNoteMigration: [{ oldJournalId: "cal", kind: "calendar", sectionToName: { day: "My Journal Day" } }],
  };
}

describe("v3ToV4Migration", () => {
  it("targets version 3 -> 4", () => {
    expect(v3ToV4Migration.fromVersion).toBe(3);
    expect(v3ToV4Migration.toVersion).toBe(4);
  });

  it("reshapes a journal into the new config shape", () => {
    const out = v3ToV4Migration.migrate(monolithV3());
    const journals = Object.values(out.journals as Record<string, Record<string, unknown>>);
    expect(journals).toHaveLength(1);
    const j = journals[0];
    expect(j.timeline).toEqual({ start: "", end: { kind: "never" } });
    expect(j.numbering).toMatchObject({
      enabled: false,
      sources: [{ variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } }],
    });
    expect(j.intervalBlock).toEqual({ type: "create", rows: [], decorateWholeBlock: false });
    expect(j).not.toHaveProperty("start");
    expect(j).not.toHaveProperty("index");
  });

  it("maps a plugin command to an all-target command", () => {
    const out = v3ToV4Migration.migrate(monolithV3());
    const cmd = Object.values(out.commands as Record<string, Record<string, unknown>>)[0];
    expect(cmd.target).toEqual({ kind: "all", writeType: "day" });
    expect(cmd.context).toBe("today");
  });

  it("maps a custom-week calendar to the custom mode", () => {
    const out = v3ToV4Migration.migrate(monolithV3());
    expect(out.calendar).toEqual({ mode: "custom", dow: 1, doy: 4, global: false });
  });

  it("maps the locale sentinel to locale mode", () => {
    const data = monolithV3();
    data.calendar = { dow: -1, doy: 1, global: false };
    const out = v3ToV4Migration.migrate(data);
    expect(out.calendar).toEqual({ mode: "locale" });
  });

  it("moves calendar styles into the appearance slice", () => {
    const out = v3ToV4Migration.migrate(monolithV3());
    expect(out.appearance).toMatchObject({ today: { color: { type: "theme", name: "a" } } });
  });

  it("patches the seeded default view's leaf, weeks and button modes", () => {
    const out = v3ToV4Migration.migrate(monolithV3());
    const view = (out.views as Record<string, any>)[DEFAULT_CALENDAR_VIEW_ID];
    expect(view.leaf).toBe("left");
    const monthBlock = view.blocks.find((b: any) => b.key === "month-calendar");
    expect(monthBlock.config.weeks).toBe("left");
    const items = view.blocks.find((b: any) => b.key === "toolbar").config.items;
    expect(items.find((i: any) => i.config?.action?.type === "current").config.action.mode).toBe("create");
    expect(items.find((i: any) => i.config?.action?.type === "pick-date").config.action.mode).toBe("navigate");
  });

  it("maps openOnStartup into the startup slice", () => {
    const out = v3ToV4Migration.migrate(monolithV3());
    expect(out.startup).toEqual({ journalName: "My Journal Day" });
  });

  it("carries the pendingNoteMigration marker forward", () => {
    const out = v3ToV4Migration.migrate(monolithV3());
    expect(out.pendingNoteMigration).toEqual([
      { oldJournalId: "cal", kind: "calendar", sectionToName: { day: "My Journal Day" } },
    ]);
  });

  it("drops legacy-only keys", () => {
    const data = { ...monolithV3(), ui: { calendarShelf: null }, useShelves: true, dismissedNotifications: ["x"] };
    const out = v3ToV4Migration.migrate(data);
    expect(out).not.toHaveProperty("ui");
    expect(out).not.toHaveProperty("useShelves");
    expect(out).not.toHaveProperty("dismissedNotifications");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- src/settings/legacy/v3-to-v4.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `v3-to-v4.ts`

Implement the mapping rules above. Skeleton (fill the per-key reshapers per the rules):

```ts
import { nanoid } from "nanoid";
import { match } from "ts-pattern";

import { DEFAULT_CALENDAR_VIEW_ID, defaultCalendarView } from "@/views";

import type { OldJournalSettings, OldPluginSettings } from "./old-shapes";
import type { Migration } from "@/settings";

export const v3ToV4Migration: Migration = {
  fromVersion: 3,
  toVersion: 4,
  migrate(raw) {
    const old = raw as unknown as OldPluginSettings;
    const commands: Record<string, unknown> = {};

    const journals: Record<string, unknown> = {};
    for (const j of Object.values(old.journals ?? {})) {
      journals[nanoid()] = reshapeJournal(j);
      for (const c of j.commands ?? []) {
        commands[nanoid()] = reshapeCommand(c, { kind: "journal", journalName: j.name }, c.context);
      }
    }

    const shelves: Record<string, unknown> = {};
    for (const s of Object.values(old.shelves ?? {})) {
      shelves[nanoid()] = { name: s.name, journals: s.journals };
      for (const c of s.commands ?? []) {
        commands[nanoid()] = reshapeCommand(c, { kind: "shelf", shelfName: s.name, writeType: c.writeType }, "today");
      }
    }

    for (const c of old.commands ?? []) {
      commands[nanoid()] = reshapeCommand(c, { kind: "all", writeType: c.writeType }, "today");
    }

    const out: Record<string, unknown> = {
      journals,
      shelves,
      commands,
      calendar: reshapeCalendar(old.calendar),
      startup: { journalName: old.openOnStartup ?? "" },
      pendingNoteMigration: old.pendingNoteMigration ?? [],
    };

    const appearance = reshapeAppearance(old.calendarView);
    if (appearance) out.appearance = appearance;
    const views = reshapeViews(old.calendarView);
    if (views) out.views = views;

    return out;
  },
};

// reshapeJournal, reshapeCommand, reshapeCalendar, reshapeAppearance, reshapeViews
// implement the mapping rules documented above. Use defaultCalendarView() as the
// base for reshapeViews and patch by block key / action type.
```

Notes for the reshapers:

- `reshapeCalendar(c)`: `c.dow === -1 ? { mode: "locale" } : { mode: "custom", dow: c.dow, doy: c.doy, global: c.global }`.
- `reshapeAppearance(cv)`: return `undefined` if `cv?.todayStyle` or `cv?.activeStyle` is missing.
- `reshapeViews(cv)`: return `undefined` if `cv` is missing. Otherwise `structuredClone(defaultCalendarView())`, patch `.leaf`, the `month-calendar` block `config.weeks`, the `current`/`pick-date` button `config.action.mode` (via `mapMode`), and swap to `week-calendar` when `cv.display === "week"`. Return `{ [DEFAULT_CALENDAR_VIEW_ID]: view }`.
- `OldPluginSettings` must include the optional `pendingNoteMigration?: unknown[]` field (add it to the type in `old-shapes.ts` if not present — it is written by `0→2`, not part of the original v2/v3 shape).

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- src/settings/legacy/v3-to-v4.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/settings/legacy/v3-to-v4.ts src/settings/legacy/v3-to-v4.test.ts src/settings/legacy/old-shapes.ts
git commit -m "feat(migrations): reshape monolithic v3 into v4 slices and collections"
```

---

## Task A7: Chain test (0→2→3→4 end-to-end)

**Files:**

- Test: `src/settings/legacy/chain.test.ts`

Proves the three migrations compose through `runMigrations` to the new shape, and that the result hydrates cleanly through the real slice/collection parsers.

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, it } from "vitest";

import { journalConfigCollection } from "@/journals/config";
import { runMigrations } from "@/settings/migrations";

import { legacyMigrations } from "./index";

import type { PluginSettingsV1 } from "./old-shapes";

function v1(): PluginSettingsV1 {
  return {
    journals: {
      int: {
        id: "int",
        type: "interval",
        name: "Sprints",
        duration: 2,
        granularity: "week",
        start_date: "2022-02-01",
        start_index: 1,
        numeration_type: "increment",
        end_type: "never",
        end_date: "",
        repeats: 1,
        limitCreation: false,
        openOnStartup: false,
        openMode: "active",
        nameTemplate: "",
        navNameTemplate: "",
        navDatesTemplate: "",
        dateFormat: "",
        folder: "",
        template: "",
        ribbon: { show: false, icon: "", tooltip: "" },
        createOnStartup: false,
        calendar_view: { order: "chrono" },
      },
    },
    calendar: { firstDayOfWeek: 1, firstWeekOfYear: 4 },
    calendar_view: { leaf: "left", weeks: "left" },
  };
}

describe("legacy migration chain", () => {
  it("migrates a v1 blob (no version) up to version 4", () => {
    const result = runMigrations(v1() as unknown as Record<string, unknown>, legacyMigrations, 4);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.value.version).toBe(4);
  });

  it("produces journals that parse against the new collection schema", () => {
    const result = runMigrations(v1() as unknown as Record<string, unknown>, legacyMigrations, 4);
    if (result.kind !== "ok") throw new Error("expected ok");
    const journals = result.value.journals as Record<string, unknown>;
    const item = Object.values(journals)[0];
    const parsed = (await import("valibot")).safeParse(journalConfigCollection.itemSchema, item);
    expect(parsed.success).toBe(true);
  });
});
```

> If top-level `await import` is awkward, import `safeParse` and `journalConfigSchema` at the top instead.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- src/settings/legacy/chain.test.ts`
Expected: FAIL — `legacyMigrations` not exported yet.

- [ ] **Step 3: Create the barrel** `src/settings/legacy/index.ts`

```ts
import { v1ToV2Migration } from "./v1-to-v2";
import { v2ToV3Migration } from "./v2-to-v3";
import { v3ToV4Migration } from "./v3-to-v4";

import type { Migration } from "@/settings";

export { pendingNoteMigrationSlice } from "./pending-note-migration";
export { DataMigrationService } from "./data-migration-service";
export { legacyMigrationsModule } from "./module";

export const legacyMigrations: readonly Migration[] = [v1ToV2Migration, v2ToV3Migration, v3ToV4Migration];
```

> `DataMigrationService` and `legacyMigrationsModule` are created in Phase B; if running A7 before Phase B, temporarily omit those two export lines and add them back in Task B2.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- src/settings/legacy/chain.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/settings/legacy/index.ts src/settings/legacy/chain.test.ts
git commit -m "test(migrations): end-to-end legacy migration chain"
```

---

## Task A8: Bump version + register migrations + wire module

**Files:**

- Modify: `src/settings/version.ts`
- Create: `src/settings/legacy/module.ts`
- Modify: `src/main.ts`
- Test: `src/settings/legacy/module.test.ts` (behavioral: a v1 blob loads into the real services as v4)

- [ ] **Step 1: Write the failing test** (loads a legacy blob through `createSettingsService` with the real legacy migrations + the journals collection registered, asserts the journal survived)

```ts
import { describe, expect, it } from "vitest";

import { journalConfigCollection } from "@/journals/config";
import { createSettingsService } from "@/settings/testing";

import { legacyMigrations } from "./index";
import { pendingNoteMigrationSlice } from "./pending-note-migration";

describe("legacy migrations integration", () => {
  it("loads a v1 interval journal into the journals collection at version 4", async () => {
    const raw = {
      journals: {
        int: {
          id: "int",
          type: "interval",
          name: "Sprints",
          duration: 2,
          granularity: "week",
          start_date: "2022-02-01",
          start_index: 1,
          numeration_type: "increment",
          end_type: "never",
          end_date: "",
          repeats: 1,
          limitCreation: false,
          openOnStartup: false,
          openMode: "active",
          nameTemplate: "",
          navNameTemplate: "",
          navDatesTemplate: "",
          dateFormat: "",
          folder: "",
          template: "",
          ribbon: { show: false, icon: "", tooltip: "" },
          createOnStartup: false,
          calendar_view: { order: "chrono" },
        },
      },
      calendar: { firstDayOfWeek: 1, firstWeekOfYear: 4 },
      calendar_view: { leaf: "left", weeks: "left" },
    };

    const { service } = createSettingsService({
      raw,
      collections: [journalConfigCollection],
      slices: [pendingNoteMigrationSlice],
      migrations: legacyMigrations,
    });
    const init = await service.initialize();
    expect(init.kind).toBe("ok");

    const journals = service.recordOf(journalConfigCollection);
    expect(Object.values(journals).map((j) => j.name)).toContain("Sprints");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- src/settings/legacy/module.test.ts`
Expected: FAIL — `CURRENT_VERSION` is still 3, so `runMigrations(..., 3)` stops at 3 and never reshapes; the journal item is the old shape and resets. (Or a version mismatch.)

- [ ] **Step 3: Bump the version**

Edit `src/settings/version.ts`:

```ts
export const CURRENT_VERSION = 4;
```

- [ ] **Step 4: Create `legacyMigrationsModule`** `src/settings/legacy/module.ts`

```ts
import { MigrationToken, SliceDefinitionToken } from "@/settings";

import { DataMigrationService } from "./data-migration-service";
import { pendingNoteMigrationSlice } from "./pending-note-migration";
import { v1ToV2Migration } from "./v1-to-v2";
import { v2ToV3Migration } from "./v2-to-v3";
import { v3ToV4Migration } from "./v3-to-v4";

import type { Module } from "@/infrastructure/di";

export const legacyMigrationsModule: Module = {
  register(c) {
    c.register(MigrationToken).useValue(v1ToV2Migration);
    c.register(MigrationToken).useValue(v2ToV3Migration);
    c.register(MigrationToken).useValue(v3ToV4Migration);
    c.register(SliceDefinitionToken).useValue(pendingNoteMigrationSlice);
    c.register(DataMigrationService).useClass(DataMigrationService);
  },
};
```

> `DataMigrationService` is created in Phase B. If implementing strictly in order, stub it as an empty class with `initialize(): AsyncResult<void, never> { return AsyncResult.ok(); }` now and flesh it out in Task B1, OR do Task B1 before this step. Recommended: do B1 first, then this registration. The module test above does not need the service.

- [ ] **Step 5: Register the module in `main.ts`**

Add the import and `container.addModule(legacyMigrationsModule)` **before** `SettingsService.initialize()` is resolved (so the migrations are registered when `initialize` runs). Place it right after `container.addModule(settingsModule);`:

```ts
import { legacyMigrationsModule } from "@/settings/legacy";
// ...
container.addModule(settingsModule);
container.addModule(legacyMigrationsModule);
```

- [ ] **Step 6: Run to verify it passes**

Run: `npm run test -- src/settings/legacy/module.test.ts`
Expected: PASS.

- [ ] **Step 7: Full gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass. Fix any test that asserted `CURRENT_VERSION === 3` to expect `4`.

- [ ] **Step 8: Commit**

```bash
git add src/settings/version.ts src/settings/legacy/module.ts src/settings/legacy/module.test.ts src/main.ts src/settings/legacy/index.ts
git commit -m "feat(migrations): register legacy migrations and bump settings version to 4"
```

---

# Phase B — Runtime note-frontmatter rewrite

## Task B1: `DataMigrationService`

**Files:**

- Create: `src/settings/legacy/data-migration-service.ts`
- Test: `src/settings/legacy/data-migration-service.test.ts`

Rewrites legacy v1 note frontmatter using the marker + v3 runtime services, then clears the marker.

### Behavior

For each `pendingNoteMigration` entry, for each markdown note whose `journal` frontmatter equals the entry's `oldJournalId`:

- Determine the target v3 journal name: interval → `entry.name`; calendar → `entry.sectionToName[note's "journal-section"]`.
- If no target name (e.g. calendar note with an unknown/missing section) → treat as orphan: strip `journal`, `journal-section`, `journal-start-date`, `journal-end-date`, `journal-interval-index`, `journal-date`, `journal-index`.
- Resolve the note's date: read `journal-start-date` (the v1 anchor source) as the date string, `CalendarDate.parse(date)`, then `CycleService.anchorOf(targetName, parsedDate)`.
  - Resolved → set `journal = targetName`, `journal-date = date`, move `journal-interval-index` → `journal-index` (delete the old key), delete `journal-section`. Honor the journal's `addStartDate`/`addEndDate` (look up via `JournalsRepository.get(targetName)`): when false, delete `journal-start-date`/`journal-end-date`; when true, keep them.
  - Unresolved / journal not registered → orphan-strip as above.
- After processing all entries, set the `pendingNoteMigration` slice to `[]`.

> Use `JournalsRepository.get(name).frontmatter.dateField/startDateField/endDateField` for the exact field names rather than hardcoding, matching `_old-code`'s use of `journal.frontmatterDate` etc. The new-key constants (`journal`, `journal-date`, `journal-index`) are the defaults in `src/journals/config.ts` (`FRONTMATTER_NAME_KEY`, `DEFAULT_FRONTMATTER_KEYS`). The **legacy** keys (`journal-section`, `journal-interval-index`, `journal-start-date`, `journal-end-date`) are migration-local string literals — define them as `const` in this file.

- [ ] **Step 1: Write the failing tests** (against the host fakes)

First locate the host fakes: `grep -rn "FakeNotesService\|FakeNoteMetadata\|export" src/infrastructure/host/testing*`. Use whatever fake/builder the host testing barrel exposes to (a) register notes with frontmatter and (b) read back frontmatter. If no fake exists for `NotesService`/`NoteMetadataService`, construct the service with hand-written minimal stubs that implement only the methods used (`allMarkdownNotes`, `updateFrontmatter`, `get`) — acceptable per the repo's "construct minimal stubs in the test" pattern; do not add stubs to production code.

```ts
import { describe, expect, it } from "vitest";

// Construct DataMigrationService with stubbed NotesService / NoteMetadataService /
// CycleService / JournalsRepository. Each stub implements only the methods used.

describe("DataMigrationService", () => {
  it("renames a calendar note's frontmatter to the v3 journal name", async () => {
    // note "a.md": { journal: "cal", "journal-start-date": "2022-01-01",
    //               "journal-end-date": "2022-01-31", "journal-section": "month" }
    // marker: [{ oldJournalId: "cal", kind: "calendar", sectionToName: { month: "My Journal Month" } }]
    // CycleService.anchorOf("My Journal Month", <2022-01-01>) -> Some("2022-01-01")
    // repo.get("My Journal Month").frontmatter.{addStartDate:false, addEndDate:false, ...}
    // EXPECT after run: { journal: "My Journal Month", "journal-date": "2022-01-01" }
  });

  it("moves journal-interval-index to journal-index for interval notes", async () => {
    // note: { journal: "int", "journal-start-date": "2022-01-01", "journal-interval-index": 1 }
    // marker: [{ oldJournalId: "int", kind: "interval", name: "Sprints" }]
    // EXPECT: { journal: "Sprints", "journal-date": "2022-01-01", "journal-index": 1 }
  });

  it("strips journal keys from a note whose date cannot be resolved", async () => {
    // anchorOf -> None  => EXPECT all journal-* keys removed
  });

  it("clears the marker slice after running", async () => {
    // EXPECT pendingNoteMigration slice state === []
  });

  it("no-ops when the marker is empty", async () => {
    // EXPECT updateFrontmatter never called
  });
});
```

Fill each test body with concrete stub objects and assertions on the resulting frontmatter (mutate a captured `Record<string, unknown>` inside the `updateFrontmatter` stub so the test can read it back). One behavior per test.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- src/settings/legacy/data-migration-service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `data-migration-service.ts`

```ts
import { CalendarDate } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { NoteMetadataService, NotesService } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";
import { CycleService, JournalsRepository } from "@/journals";
import { FRONTMATTER_NAME_KEY } from "@/journals/config";
import { SettingsService } from "@/settings";

import { pendingNoteMigrationSlice, type PendingNoteMigration } from "./pending-note-migration";

const LEGACY_SECTION_KEY = "journal-section";
const LEGACY_INTERVAL_INDEX_KEY = "journal-interval-index";
const LEGACY_START_DATE_KEY = "journal-start-date";
const LEGACY_END_DATE_KEY = "journal-end-date";

export class DataMigrationService {
  readonly #settings = inject(SettingsService);
  readonly #notes = inject(NotesService);
  readonly #metadata = inject(NoteMetadataService);
  readonly #cycle = inject(CycleService);
  readonly #journals = inject(JournalsRepository);

  async initialize(): Promise<void> {
    const slice = this.#settings.getSlice(pendingNoteMigrationSlice);
    const pending = slice.state;
    if (pending.length === 0) return;

    const byOldId = new Map<string, PendingNoteMigration>();
    for (const entry of pending) byOldId.set(entry.oldJournalId, entry);

    for (const path of this.#notes.allMarkdownNotes()) {
      const meta = this.#metadata.get(path);
      if (meta.kind !== "some") continue; // adjust to the Option API in use
      const fm = meta.value.properties;
      const oldId = fm[FRONTMATTER_NAME_KEY];
      if (typeof oldId !== "string") continue;
      const entry = byOldId.get(oldId);
      if (!entry) continue;

      const targetName =
        entry.kind === "interval"
          ? entry.name
          : entry.sectionToName[String(fm[LEGACY_SECTION_KEY]) as keyof typeof entry.sectionToName];

      await this.#rewrite(path, targetName, fm);
    }

    slice.state = [];
  }

  async #rewrite(path: string, targetName: string | undefined, fm: Record<string, unknown>): Promise<void> {
    const date = fm[LEGACY_START_DATE_KEY];
    const config = targetName ? this.#journals.get(targetName) : undefined;
    const parsed = typeof date === "string" ? CalendarDate.parse(date) : undefined;
    const anchor = targetName && parsed?.kind === "ok" ? this.#cycle.anchorOf(targetName, parsed.value) : undefined;

    await this.#notes.updateFrontmatter(path as never, (out) => {
      const resolved = targetName && config?.kind === "some" && anchor?.kind === "some";
      if (!resolved) {
        for (const key of [
          FRONTMATTER_NAME_KEY,
          LEGACY_SECTION_KEY,
          LEGACY_START_DATE_KEY,
          LEGACY_END_DATE_KEY,
          LEGACY_INTERVAL_INDEX_KEY,
          "journal-date",
          "journal-index",
        ]) {
          delete out[key];
        }
        return;
      }
      const cfg = config!.value;
      out[FRONTMATTER_NAME_KEY] = targetName;
      out[cfg.frontmatter.dateField] = date;
      if (LEGACY_INTERVAL_INDEX_KEY in out) {
        const indexKey = cfg.numbering.sources[0]?.frontmatterKey ?? "journal-index";
        out[indexKey] = out[LEGACY_INTERVAL_INDEX_KEY];
        delete out[LEGACY_INTERVAL_INDEX_KEY];
      }
      delete out[LEGACY_SECTION_KEY];
      if (!cfg.frontmatter.addStartDate) delete out[LEGACY_START_DATE_KEY];
      if (!cfg.frontmatter.addEndDate) delete out[LEGACY_END_DATE_KEY];
    });
  }
}
```

> Adjust `.kind === "some"` / `Result.kind` / `AsyncResult` handling to the exact `Option`/`Result` API in this repo (check `src/infrastructure/result`). The `updateFrontmatter` call returns an `AsyncResult`; `await` it and ignore the error (a single note failing should not abort the batch) — or log via the logger factory if one is conventional here. Keep `initialize` returning a plain `Promise<void>` to match how `main.ts` calls the other startup services, OR return `AsyncResult<void, never>` if that matches the sibling services more closely (see `StartupOpenService`). Match the sibling pattern.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- src/settings/legacy/data-migration-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/settings/legacy/data-migration-service.ts src/settings/legacy/data-migration-service.test.ts
git commit -m "feat(migrations): runtime note-frontmatter rewrite service"
```

---

## Task B2: Wire `DataMigrationService` into startup

**Files:**

- Modify: `src/main.ts`
- Modify: `src/settings/legacy/index.ts` (ensure `DataMigrationService` + `legacyMigrationsModule` exported)

- [ ] **Step 1: Ensure exports**

Confirm `src/settings/legacy/index.ts` exports `DataMigrationService` and `legacyMigrationsModule` (added in Task A7's barrel / created in A8). Make sure `legacyMigrationsModule` registers `DataMigrationService` (done in A8 Step 4).

- [ ] **Step 2: Resolve the service after `autoLoad`**

In `src/main.ts`, after the existing `container.resolve(...).initialize()` calls (after `StartupOpenService`), add:

```ts
import { DataMigrationService } from "@/settings/legacy";
// ...
await container.resolve(DataMigrationService).initialize();
```

Place it after `VaultSubscriptionService.initialize()` so the journals index has synced from frontmatter and journals are registered in the repository.

- [ ] **Step 3: Full gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts src/settings/legacy/index.ts
git commit -m "feat(migrations): run note-frontmatter rewrite on startup"
```

---

## Final verification

- [ ] **Run all gates one more time:**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all green.

- [ ] **Manual sanity (optional):** load a real legacy `data.json` (v1 and v2 samples) into a dev vault and confirm journals/shelves/commands appear and old notes reconnect. Use the `/run` skill if a quick app launch is wanted.

---

## Self-review notes (addressed)

- **Spec coverage:** version chain (A8) · file layout (all tasks) · `0→2` defaults incl. shelf/section-names/dedup/marker (A3, A4) · `2→3` (A5) · `3→4` full mapping incl. carry-forward + dropped keys + calendarView→views with todayMode/pickMode (A6) · runtime note pass (B1, B2) · testing strategy (every task + A7 chain). No spec section is unimplemented.
- **`weekdays` write:** intentionally not handled (spec: impossible to create); the lenient parser is the backstop. No task needed.
- **Type consistency:** `legacyMigrations` (A7), `legacyMigrationsModule` (A8), `pendingNoteMigrationSlice` / `PENDING_NOTE_MIGRATION_KEY` (A2), `DataMigrationService.initialize` (B1/B2) names are used consistently across tasks.
- **Open verification points flagged inline** (not placeholders — concrete "match the sibling pattern" instructions): exact `Option`/`Result` member access in B1; exact host fake availability in B1 Step 1; `initialize` return type matching sibling startup services.
