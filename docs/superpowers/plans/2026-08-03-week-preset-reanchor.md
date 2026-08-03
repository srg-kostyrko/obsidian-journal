# Weekly Note Re-anchoring on Week Preset Change — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the user changes the week preset, rewrite every connected weekly note's `journal-date` (and its start/end fields) so the note keeps its week number and stays connected to its journal.

**Architecture:** A week's identity — the (week-year, week-number) pair — is read from every connected weekly note while the old grid is still in force, the calendar slice is written, and after Vue flushes (so `CalendarSettingsBridge` has applied the new grid) each note's frontmatter is rewritten at the anchor that same pair resolves to under the new grid. The re-anchor runs in a journals-side service reached through a DI token declared on the calendar side, because `@/calendar` must not import `@/journals`.

**Tech Stack:** TypeScript, Vue 3 (`nextTick`, reactivity), moment (week arithmetic via `localMoment`), valibot (settings schemas), vitest + @testing-library/vue (unit), WebdriverIO (e2e), paraglide (i18n).

## Global Constraints

- The re-anchor rule is **keep the week number**: identity is (week-year, week-number), never the calendar year. `WeekPeriod.year` is already the week-year — use it, never `.format("YYYY")` or a calendar year.
- Scope is journals whose `write.type === "week"`. Custom intervals with `every: "week"` are out of scope — they step from their own configured anchor.
- Notes are never renamed, only their frontmatter is rewritten.
- `@/calendar` must not import `@/journals`, directly or transitively. `import-x/no-cycle` is an ESLint **error** (`eslint.config.mjs:168`), and `@/calendar` → `settings/module.ts` → `ui/CalendarWeekBlock.vue` means any journals import from that component closes a cycle.
- Never add `eslint-disable` comments; fix the code instead.
- New `messages/en.json` strings follow `docs/2026-07-13-ux-text-audit.md` §A (sentence case, en-US). After editing `messages/en.json`, run `npm run compile:i18n`. `src/i18n/paraglide` is generated and git-ignored — never stage it.
- Every task ends green on `npm test`, `npm run check:types`, and `npm run check:lint`.
- Never add a `Co-Authored-By` trailer. Commit to the current branch (`v3-ai`); do not create branches.
- One behavior per test; test names are subject+verb behavior descriptions with no "and"/comma lists.

---

## File Structure

**Create:**

- `src/calendar/settings/week-preset-applier.ts` — the DI seam: a `WeekPresetApplier` interface plus its token. Lives in calendar so the calendar component can import it without reaching into journals.
- `src/journals/settings/week-preset-service.ts` — implements `WeekPresetApplier`: snapshot → write slice → settle → re-anchor → notice.
- `src/journals/settings/week-preset-service.test.ts`
- `e2e/fixtures/e2e-week-preset/.obsidian/plugins/journals/data.json` — weekly journal with start/end date fields on and an ISO week preset pinned.
- `e2e/integration/week-preset.e2e.ts`

**Modify:**

- `src/calendar/period-week.ts` — add `WeekPeriod.ofWeek`.
- `src/calendar/period-week.test.ts`
- `src/calendar/index.ts` — export the applier seam.
- `src/journals/notes/note-connection.ts` — add `reanchorAll` + `ReanchorReport`.
- `src/journals/notes/note-connection.test.ts`
- `src/journals/settings/module.ts` — register the service against the token.
- `src/calendar/settings/ui/CalendarWeekBlock.vue:71-76` — call the applier instead of assigning the slice.
- `src/calendar/settings/ui/CalendarWeekBlock.test.ts`
- `src/calendar/settings/ui/WeekPresetPickerModal.vue` — add the heads-up line.
- `messages/en.json` — two new strings.
- `e2e/support/settings.ts` — add `clickRowButton`.

---

### Task 1: Resolve a week from its (week-year, week-number) pair

`WeekPeriod` can already go from a date to a week number. This adds the inverse, which is what turns a snapshotted week identity back into an anchor under the new grid.

**Files:**

- Modify: `src/calendar/period-week.ts`
- Test: `src/calendar/period-week.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `WeekPeriod.ofWeek(weekYear: number, weekOfYear: number): WeekPeriod`. Resolves against the currently installed week configuration. `WeekPeriod` is already exported from `@/calendar`.

- [ ] **Step 1: Write the failing tests**

Add this `describe` block to `src/calendar/period-week.test.ts`, as a sibling of the existing `describe("containing", ...)`. Note the existing file's `beforeEach` installs an ISO calendar (`installTestCalendar()` defaults to `dow: 1, doy: 4`); the Western case installs its own.

```ts
describe("ofWeek", () => {
  it("resolves a mid-year week to its Monday under ISO 8601", () => {
    expect(WeekPeriod.ofWeek(2026, 23).anchor.toAnchor()).toBe("2026-06-01");
  });

  it("resolves week 1 to the previous December when the week straddles January 1", () => {
    expect(WeekPeriod.ofWeek(2026, 1).anchor.toAnchor()).toBe("2025-12-29");
  });

  it("resolves the same week to its Sunday under a Sunday-start grid", () => {
    teardown();
    ({ teardown } = installTestCalendar({ dow: 0, doy: 6 }));
    expect(WeekPeriod.ofWeek(2026, 23).anchor.toAnchor()).toBe("2026-05-31");
  });

  it("round-trips a week number through containing", () => {
    const week = WeekPeriod.ofWeek(2026, 40);
    expect(WeekPeriod.containing(week.anchor).weekOfYear).toBe(40);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/calendar/period-week.test.ts`
Expected: FAIL — `WeekPeriod.ofWeek is not a function`.

- [ ] **Step 3: Implement `ofWeek`**

In `src/calendar/period-week.ts`, add the static immediately after `containing` (line 7-9). The private constructor is reachable from a static of the same class.

```ts
  // Seeded mid-year rather than from "now": setting weekYear while the current instant sits in
  // week 53 clamps in a 52-week target year, and June 15 is in week-year Y for every Y and grid.
  static ofWeek(weekYear: number, weekOfYear: number): WeekPeriod {
    const seed = localMoment(`${weekYear}-06-15`, "YYYY-MM-DD", true);
    return new WeekPeriod(seed.weekYear(weekYear).week(weekOfYear));
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/calendar/period-week.test.ts`
Expected: PASS (all four new tests plus the pre-existing ones).

- [ ] **Step 5: Run the gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/calendar/period-week.ts src/calendar/period-week.test.ts
git commit -m "feat(calendar): resolve a week period from its week-year and number"
```

---

### Task 2: Re-anchor a journal's connected notes in bulk

**Files:**

- Modify: `src/journals/notes/note-connection.ts`
- Test: `src/journals/notes/note-connection.test.ts`

**Interfaces:**

- Consumes: nothing from Task 1 (this task is grid-agnostic — it is handed finished target anchors).
- Produces:
  - `export interface ReanchorReport { readonly rewritten: number; readonly failed: number }`
  - `NoteConnectionService.reanchorAll(journalName: string, targets: ReadonlyMap<VaultPath, AnchorString>): AsyncResult<ReanchorReport, never>`

**Behavior:** for each note currently connected to `journalName`, look up its target anchor by path. Skip notes with no target or a target equal to their current anchor. Rewrite the rest through `FrontmatterService.buildMetadata` + `writeMutator`, so the date field, the start/end fields (each still subject to its own `add*` toggle) and any numbering keys are all recomputed at the new anchor. Best-effort per note, like `reapplyAll`. A target already claimed by another note is refused rather than overwritten and counts as failed.

- [ ] **Step 1: Write the failing tests**

Add to `src/journals/notes/note-connection.test.ts`. The file already has `build(repo, notes, modals)`, `fixedJournal`, `readFrontmatter`, and installs a test calendar in `beforeEach`. Add this helper above the new `describe`:

```ts
function weeklyWith(patch: { addStartDate?: boolean; addEndDate?: boolean } = {}) {
  const weekly = fixedJournal("weekly", { type: "week" });
  return { weekly: { ...weekly, frontmatter: { ...weekly.frontmatter, ...patch } } };
}
```

Then the new block:

```ts
describe("reanchorAll", () => {
  it("writes the target anchor into the date field", async () => {
    const notes = new FakeNotesService();
    notes.seed("week/2026-W23.md" as VaultPath, "", { journal: "weekly", "journal-date": "2026-06-01" });
    const { container, index } = build(fakeRepo(weeklyWith()), notes, new FakeModalService());
    index.register({
      journalName: "weekly",
      anchor: anchor("2026-06-01"),
      path: "week/2026-W23.md" as VaultPath,
    });

    await container
      .resolve(NoteConnectionService)
      .reanchorAll("weekly", new Map([["week/2026-W23.md" as VaultPath, anchor("2026-05-31")]]));

    expect(notes.frontmatterOf("week/2026-W23.md" as VaultPath)?.["journal-date"]).toBe("2026-05-31");
  });

  it("recomputes the start date field from the new anchor", async () => {
    const notes = new FakeNotesService();
    notes.seed("week/2026-W23.md" as VaultPath, "", {
      journal: "weekly",
      "journal-date": "2026-06-01",
      "journal-start-date": "2026-06-01",
    });
    const { container, index } = build(fakeRepo(weeklyWith({ addStartDate: true })), notes, new FakeModalService());
    index.register({
      journalName: "weekly",
      anchor: anchor("2026-06-01"),
      path: "week/2026-W23.md" as VaultPath,
    });

    await container
      .resolve(NoteConnectionService)
      .reanchorAll("weekly", new Map([["week/2026-W23.md" as VaultPath, anchor("2026-05-31")]]));

    expect(notes.frontmatterOf("week/2026-W23.md" as VaultPath)?.["journal-start-date"]).toBe("2026-05-31");
  });

  it("leaves a note whose target equals its current anchor untouched", async () => {
    const notes = new FakeNotesService();
    notes.seed("week/2026-W23.md" as VaultPath, "", { journal: "weekly", "journal-date": "2026-06-01" });
    const { container, index } = build(fakeRepo(weeklyWith()), notes, new FakeModalService());
    index.register({
      journalName: "weekly",
      anchor: anchor("2026-06-01"),
      path: "week/2026-W23.md" as VaultPath,
    });
    const spy = vi.spyOn(notes, "updateFrontmatter");

    await container
      .resolve(NoteConnectionService)
      .reanchorAll("weekly", new Map([["week/2026-W23.md" as VaultPath, anchor("2026-06-01")]]));

    expect(spy).not.toHaveBeenCalled();
  });

  it("reports how many notes it rewrote", async () => {
    const notes = new FakeNotesService();
    notes.seed("week/2026-W23.md" as VaultPath, "", { journal: "weekly", "journal-date": "2026-06-01" });
    notes.seed("week/2026-W24.md" as VaultPath, "", { journal: "weekly", "journal-date": "2026-06-08" });
    const { container, index } = build(fakeRepo(weeklyWith()), notes, new FakeModalService());
    index.register({ journalName: "weekly", anchor: anchor("2026-06-01"), path: "week/2026-W23.md" as VaultPath });
    index.register({ journalName: "weekly", anchor: anchor("2026-06-08"), path: "week/2026-W24.md" as VaultPath });

    const report = expectOk(
      await container.resolve(NoteConnectionService).reanchorAll(
        "weekly",
        new Map([
          ["week/2026-W23.md" as VaultPath, anchor("2026-05-31")],
          ["week/2026-W24.md" as VaultPath, anchor("2026-06-07")],
        ]),
      ),
    );

    expect(report.rewritten).toBe(2);
  });

  it("keeps rewriting the remaining notes after one note fails", async () => {
    const notes = new FakeNotesService();
    notes.seed("week/2026-W23.md" as VaultPath, "", { journal: "weekly", "journal-date": "2026-06-01" });
    notes.seed("week/2026-W24.md" as VaultPath, "", { journal: "weekly", "journal-date": "2026-06-08" });
    const { container, index } = build(fakeRepo(weeklyWith()), notes, new FakeModalService());
    index.register({ journalName: "weekly", anchor: anchor("2026-06-01"), path: "week/2026-W23.md" as VaultPath });
    index.register({ journalName: "weekly", anchor: anchor("2026-06-08"), path: "week/2026-W24.md" as VaultPath });
    vi.spyOn(notes, "updateFrontmatter").mockImplementationOnce(() =>
      AsyncResult.err(new NoteNotFoundError("week/2026-W23.md" as VaultPath)),
    );

    await container.resolve(NoteConnectionService).reanchorAll(
      "weekly",
      new Map([
        ["week/2026-W23.md" as VaultPath, anchor("2026-05-31")],
        ["week/2026-W24.md" as VaultPath, anchor("2026-06-07")],
      ]),
    );

    expect(notes.frontmatterOf("week/2026-W24.md" as VaultPath)?.["journal-date"]).toBe("2026-06-07");
  });

  it("counts a note whose write failed as failed", async () => {
    const notes = new FakeNotesService();
    notes.seed("week/2026-W23.md" as VaultPath, "", { journal: "weekly", "journal-date": "2026-06-01" });
    const { container, index } = build(fakeRepo(weeklyWith()), notes, new FakeModalService());
    index.register({ journalName: "weekly", anchor: anchor("2026-06-01"), path: "week/2026-W23.md" as VaultPath });
    vi.spyOn(notes, "updateFrontmatter").mockImplementation(() =>
      AsyncResult.err(new NoteNotFoundError("week/2026-W23.md" as VaultPath)),
    );

    const report = expectOk(
      await container
        .resolve(NoteConnectionService)
        .reanchorAll("weekly", new Map([["week/2026-W23.md" as VaultPath, anchor("2026-05-31")]])),
    );

    expect(report.failed).toBe(1);
  });

  it("refuses a target already held by a note that is staying put", async () => {
    const notes = new FakeNotesService();
    notes.seed("week/2026-W23.md" as VaultPath, "", { journal: "weekly", "journal-date": "2026-06-01" });
    notes.seed("week/2026-W24.md" as VaultPath, "", { journal: "weekly", "journal-date": "2026-06-08" });
    const { container, index } = build(fakeRepo(weeklyWith()), notes, new FakeModalService());
    index.register({ journalName: "weekly", anchor: anchor("2026-06-01"), path: "week/2026-W23.md" as VaultPath });
    index.register({ journalName: "weekly", anchor: anchor("2026-06-08"), path: "week/2026-W24.md" as VaultPath });

    // W23 is told to move onto W24's anchor, which W24 keeps (no target of its own).
    await container
      .resolve(NoteConnectionService)
      .reanchorAll("weekly", new Map([["week/2026-W23.md" as VaultPath, anchor("2026-06-08")]]));

    expect(notes.frontmatterOf("week/2026-W23.md" as VaultPath)?.["journal-date"]).toBe("2026-06-01");
  });
});
```

Add the imports the new tests need to the top of the file: `LoggerFactoryToken` is already provided by `LoggerModule` in `build`, so only `NoteNotFoundError` (already imported), `AsyncResult` (already imported), `expectOk` (already imported), `anchor` (already imported) are in play. Verify each is present before adding.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/journals/notes/note-connection.test.ts -t reanchorAll`
Expected: FAIL — `reanchorAll is not a function`.

- [ ] **Step 3: Implement `reanchorAll`**

In `src/journals/notes/note-connection.ts`:

Add to the imports:

```ts
import { LoggerFactoryToken } from "@/infrastructure/logger";
```

Add the report type next to the existing `ConnectError` / `DisconnectError` aliases:

```ts
export interface ReanchorReport {
  readonly rewritten: number;
  readonly failed: number;
}

type ReanchorError = NoteNotFoundError | FrontmatterError | JournalNotFoundError;
```

`JournalNotFoundError` comes from `../errors`; add it to that import as a type-only import.

Add the logger field alongside the other injected fields:

```ts
  readonly #logger = inject(LoggerFactoryToken).named("note-connection");
```

Add the two methods after `reapplyAll`:

```ts
  #reanchorOne(journalName: string, path: VaultPath, anchor: AnchorString): AsyncResult<void, ReanchorError> {
    return attempt.in(this, async function* (this: NoteConnectionService) {
      const metadata = yield* this.#frontmatter.buildMetadata(journalName, anchor);
      const mutator = yield* this.#frontmatter.writeMutator(journalName, metadata);
      yield* this.#notes.updateFrontmatter(path, mutator).tapErr((error) => {
        this.#logger.warn("failed to re-anchor note", { path, anchor, error });
      });
    });
  }

  // Targets are resolved by the caller (which alone knows the old and new week grids); this
  // only has to apply them without letting two notes land on the same anchor.
  reanchorAll(journalName: string, targets: ReadonlyMap<VaultPath, AnchorString>): AsyncResult<ReanchorReport, never> {
    const entries = [...this.#index.entriesFor(journalName)];
    const claimed = new Set<AnchorString>();
    const moves: { path: VaultPath; to: AnchorString }[] = [];
    let blocked = 0;

    // Notes that are staying put keep their slot, so a mover cannot displace one.
    for (const [anchor, path] of entries) {
      const target = targets.get(path);
      if (target === undefined || target === anchor) claimed.add(anchor);
    }
    for (const [anchor, path] of entries) {
      const target = targets.get(path);
      if (target === undefined || target === anchor) continue;
      // A grid change can leave a year one week shorter, collapsing two weeks onto one anchor.
      // The loser keeps its old date rather than overwriting the winner's note.
      if (claimed.has(target)) {
        blocked += 1;
        this.#logger.warn("re-anchor target already claimed", { journalName, path, target });
        continue;
      }
      claimed.add(target);
      moves.push({ path, to: target });
    }

    const settled = Promise.all(moves.map((move) => this.#reanchorOne(journalName, move.path, move.to))).then(
      (results) => {
        const rewritten = results.filter((result) => result.isOk()).length;
        return { rewritten, failed: blocked + results.length - rewritten };
      },
    );
    return AsyncResult.fromPromise(settled, () => undefined as never);
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/journals/notes/note-connection.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/journals/notes/note-connection.ts src/journals/notes/note-connection.test.ts
git commit -m "feat(journals): re-anchor a journal's connected notes in bulk"
```

---

### Task 3: Apply a week preset and re-anchor weekly notes

**Files:**

- Create: `src/calendar/settings/week-preset-applier.ts`
- Create: `src/journals/settings/week-preset-service.ts`
- Create: `src/journals/settings/week-preset-service.test.ts`
- Modify: `src/calendar/index.ts`
- Modify: `src/journals/settings/module.ts`
- Modify: `messages/en.json`

**Interfaces:**

- Consumes: `WeekPeriod.ofWeek` (Task 1), `NoteConnectionService.reanchorAll` + `ReanchorReport` (Task 2).
- Produces:
  - `export interface WeekPresetApplier { apply(next: CalendarSliceState): AsyncResult<void, never> }`
  - `export const WeekPresetApplierToken` — a `createToken<WeekPresetApplier>("calendar.weekPresetApplier")`, re-exported from `@/calendar`.
  - `export class WeekPresetService implements WeekPresetApplier`, registered against that token.

**Why a token:** `@/calendar/index.ts` → `settings/module.ts` → `ui/CalendarWeekBlock.vue`. If that component imported the journals service directly, the journals side's own `@/calendar` imports would close a cycle, which `import-x/no-cycle` rejects. Calendar declares the seam; journals fills it.

- [ ] **Step 1: Add the i18n strings**

In `messages/en.json`, add these two keys (keep the file's existing alphabetical-ish grouping of `calendar_*` keys):

```json
  "calendar_picker_reanchor_hint": "Weekly notes keep their week number. Their dates are updated to match the new configuration.",
  "calendar_reanchor_failed_notice": [
    {
      "declarations": ["input count"],
      "selectors": ["count"],
      "match": {
        "count=1": "1 weekly note could not be updated to the new week configuration.",
        "count=*": "{count} weekly notes could not be updated to the new week configuration."
      }
    }
  ],
```

Run: `npm run compile:i18n`
Expected: succeeds; `m.calendar_picker_reanchor_hint` and `m.calendar_reanchor_failed_notice` become available. Do not stage `src/i18n/paraglide`.

- [ ] **Step 2: Write the failing tests**

Create `src/journals/settings/week-preset-service.test.ts`:

```ts
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Calendar, WeekPeriod, calendarSlice } from "@/calendar";
import { date, installTestCalendar, testCalendar } from "@/calendar/testing";
import { CalendarSettingsBridge } from "@/calendar/settings/bridge";
import { Container } from "@/infrastructure/di";
import { NoteMetadataService, NoticeService, NotesService, TemplaterService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNoticeService, FakeNotesService, FakeTemplaterService } from "@/infrastructure/host/testing";
import { LoggerModule } from "@/infrastructure/logger";
import { SettingsService } from "@/settings";
import { createSettingsService } from "@/settings/testing";
import { TemplateEngine } from "@/templates";

import { CycleService } from "../cycle";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { NoteConnectionService } from "../notes/note-connection";
import { NoteCreationService } from "../notes/note-creation";
import { NotePathService } from "../notes/note-path";
import { SelfWriteGuard } from "../notes/self-write-guard";
import { TemplateContentService } from "../notes/template-content";
import { NumberingService } from "../numbering";
import { JournalsRepository } from "../repository";
import { customJournal, fakeRepo, fixedJournal } from "../testing";

import { WeekPresetService } from "./week-preset-service";

import type { JournalConfig } from "../config";

const ISO = { mode: "custom", dow: 1, doy: 4, global: false } as const;
const WESTERN = { mode: "custom", dow: 0, doy: 6, global: false } as const;

function weekly(patch: { addStartDate?: boolean; addEndDate?: boolean } = {}): Record<string, JournalConfig> {
  const config = fixedJournal("weekly", { type: "week" });
  return { weekly: { ...config, frontmatter: { ...config.frontmatter, ...patch } } };
}

async function build(journals: Record<string, JournalConfig>) {
  const notes = new FakeNotesService();
  const settings = createSettingsService({
    slices: [calendarSlice],
    raw: { version: 4, calendar: ISO },
  });
  const c = settings.container;
  c.addModule(LoggerModule);
  c.register(Calendar).useValue(testCalendar());
  c.register(NotesService).useValue(notes as unknown as NotesService);
  c.register(NoticeService).useValue(new FakeNoticeService() as unknown as NoticeService);
  c.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  c.register(TemplaterService).useValue(new FakeTemplaterService() as unknown as TemplaterService);
  c.register(JournalsRepository).useValue(fakeRepo(journals));
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  c.register(TemplateEngine).useClass(TemplateEngine);
  c.register(TemplateContentService).useClass(TemplateContentService);
  c.register(NotePathService).useClass(NotePathService);
  c.register(SelfWriteGuard).useClass(SelfWriteGuard);
  c.register(NoteCreationService).useClass(NoteCreationService);
  c.register(NoteConnectionService).useClass(NoteConnectionService);
  c.register(CalendarSettingsBridge).useClass(CalendarSettingsBridge);
  c.register(WeekPresetService).useClass(WeekPresetService);

  await settings.service.initialize();
  // Resolving the bridge starts the watchEffect that applies the grid, exactly as autoLoad does.
  c.resolve(CalendarSettingsBridge);

  return { container: c, notes, index: c.resolve(JournalsIndex), service: c.resolve(WeekPresetService) };
}

function seedWeek(notes: FakeNotesService, index: JournalsIndex, path: string, date: string): void {
  notes.seed(path as VaultPath, "", { journal: "weekly", "journal-date": date });
  index.register({ journalName: "weekly", anchor: date as never, path: path as VaultPath });
}

describe("WeekPresetService", () => {
  let teardown: () => void;

  beforeEach(() => {
    ({ teardown } = installTestCalendar({ dow: 1, doy: 4 }));
  });
  afterEach(() => {
    teardown();
  });

  it("moves a weekly note's date onto the new grid's week start", async () => {
    const { notes, index, service } = await build(weekly());
    seedWeek(notes, index, "week/2026-W23.md", "2026-06-01");

    await service.apply(WESTERN);

    expect(notes.frontmatterOf("week/2026-W23.md" as VaultPath)?.["journal-date"]).toBe("2026-05-31");
  });

  it("keeps the note's week number across the change", async () => {
    const { notes, index, service } = await build(weekly());
    seedWeek(notes, index, "week/2026-W23.md", "2026-06-01");

    await service.apply(WESTERN);

    // Read the date the service actually wrote and ask the new grid what week it is —
    // asserting a hardcoded date here would pass without the note being touched at all.
    const written = String(notes.frontmatterOf("week/2026-W23.md" as VaultPath)?.["journal-date"]);
    expect(WeekPeriod.containing(date(written)).weekOfYear).toBe(23);
  });

  it("keeps the week-year of a note whose week straddles January 1", async () => {
    const { notes, index, service } = await build(weekly());
    // ISO week 1 of 2026 starts on 2025-12-29; under the Western grid it starts on 2025-12-28.
    seedWeek(notes, index, "week/2026-W01.md", "2025-12-29");

    await service.apply(WESTERN);

    expect(notes.frontmatterOf("week/2026-W01.md" as VaultPath)?.["journal-date"]).toBe("2025-12-28");
  });

  it("recomputes the start date field against the new grid", async () => {
    const { notes, index, service } = await build(weekly({ addStartDate: true }));
    seedWeek(notes, index, "week/2026-W23.md", "2026-06-01");

    await service.apply(WESTERN);

    expect(notes.frontmatterOf("week/2026-W23.md" as VaultPath)?.["journal-start-date"]).toBe("2026-05-31");
  });

  it("recomputes the end date field against the new grid", async () => {
    const { notes, index, service } = await build(weekly({ addEndDate: true }));
    seedWeek(notes, index, "week/2026-W23.md", "2026-06-01");

    await service.apply(WESTERN);

    expect(notes.frontmatterOf("week/2026-W23.md" as VaultPath)?.["journal-end-date"]).toBe("2026-06-06");
  });

  it("stores the new preset in the calendar slice", async () => {
    const { container, service } = await build(weekly());

    await service.apply(WESTERN);

    expect(container.resolve(SettingsService).getSlice(calendarSlice).state).toEqual(WESTERN);
  });

  it("leaves weekly notes alone when only the global flag changes", async () => {
    const { notes, index, service } = await build(weekly());
    seedWeek(notes, index, "week/2026-W23.md", "2026-06-01");

    await service.apply({ ...ISO, global: true });

    expect(notes.frontmatterOf("week/2026-W23.md" as VaultPath)?.["journal-date"]).toBe("2026-06-01");
  });

  it("leaves a month journal's notes alone", async () => {
    const monthly = fixedJournal("monthly", { type: "month" });
    const { notes, index, service } = await build({ ...weekly(), monthly });
    notes.seed("month/2026-06.md" as VaultPath, "", { journal: "monthly", "journal-date": "2026-06-01" });
    index.register({ journalName: "monthly", anchor: "2026-06-01" as never, path: "month/2026-06.md" as VaultPath });

    await service.apply(WESTERN);

    expect(notes.frontmatterOf("month/2026-06.md" as VaultPath)?.["journal-date"]).toBe("2026-06-01");
  });

  it("leaves a custom weekly interval's notes alone", async () => {
    const sprints = customJournal("sprints", "week", 2, "2026-06-01");
    const { notes, index, service } = await build({ ...weekly(), sprints });
    notes.seed("sprints/1.md" as VaultPath, "", { journal: "sprints", "journal-date": "2026-06-01" });
    index.register({ journalName: "sprints", anchor: "2026-06-01" as never, path: "sprints/1.md" as VaultPath });

    await service.apply(WESTERN);

    expect(notes.frontmatterOf("sprints/1.md" as VaultPath)?.["journal-date"]).toBe("2026-06-01");
  });
});
```

The import block above already covers everything the tests reference. If `check:types` reports an unused import after you finish, delete it rather than keeping it for symmetry.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/journals/settings/week-preset-service.test.ts`
Expected: FAIL — cannot resolve `./week-preset-service`.

- [ ] **Step 4: Create the calendar-side seam**

Create `src/calendar/settings/week-preset-applier.ts`:

```ts
import { createToken } from "@/infrastructure/di";

import type { AsyncResult } from "@/infrastructure/result";

import type { CalendarSliceState } from "./slice";

// Applying a week preset also has to re-anchor every weekly note, which only the journals
// layer can do. Calendar declares the seam and journals registers the implementation, because
// an import the other way (calendar -> journals) would close a module cycle.
export interface WeekPresetApplier {
  apply(next: CalendarSliceState): AsyncResult<void, never>;
}

export const WeekPresetApplierToken = createToken<WeekPresetApplier>("calendar.weekPresetApplier");
```

In `src/calendar/index.ts`, add alongside the other settings exports:

```ts
export { WeekPresetApplierToken, type WeekPresetApplier } from "./settings/week-preset-applier";
```

- [ ] **Step 5: Implement the service**

Create `src/journals/settings/week-preset-service.ts`:

```ts
import { nextTick } from "vue";

import { CalendarDate, WeekPeriod, calendarSlice } from "@/calendar";
import type { AnchorString, CalendarSliceState, WeekPresetApplier } from "@/calendar";
import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { NoticeService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { attempt, type AsyncResult } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { JournalsIndex } from "../journals-index";
import { NoteConnectionService } from "../notes/note-connection";
import { JournalsRepository } from "../repository";

interface WeekSnapshot {
  readonly journalName: string;
  readonly notes: readonly { readonly path: VaultPath; readonly weekYear: number; readonly weekOfYear: number }[];
}

export class WeekPresetService implements WeekPresetApplier {
  readonly #settings = inject(SettingsService);
  readonly #journals = inject(JournalsRepository);
  readonly #index = inject(JournalsIndex);
  readonly #connection = inject(NoteConnectionService);
  readonly #notices = inject(NoticeService);

  apply(next: CalendarSliceState): AsyncResult<void, never> {
    // Week identity has to be read before the grid moves; afterwards the old numbering is gone.
    const snapshots = this.#snapshot();
    this.#settings.getSlice(calendarSlice).state = next;
    return this.#reanchor(snapshots);
  }

  #snapshot(): readonly WeekSnapshot[] {
    const weekly = [
      ...this.#journals
        .find()
        .filter((config) => config.write.type === "week")
        .list(),
    ];
    return weekly.map((config) => ({
      journalName: config.name,
      notes: [...this.#index.entriesFor(config.name)].map(([anchor, path]) => {
        const week = WeekPeriod.containing(CalendarDate.fromAnchor(anchor));
        return { path, weekYear: week.year, weekOfYear: week.weekOfYear };
      }),
    }));
  }

  #reanchor(snapshots: readonly WeekSnapshot[]): AsyncResult<void, never> {
    return attempt.in(this, async function* (this: WeekPresetService) {
      // CalendarSettingsBridge applies the new grid from a watchEffect, which flushes on
      // nextTick — read week boundaries before that and they still describe the old grid.
      await nextTick();
      let failed = 0;
      for (const { journalName, notes } of snapshots) {
        const targets = new Map<VaultPath, AnchorString>(
          notes.map(({ path, weekYear, weekOfYear }) => [
            path,
            WeekPeriod.ofWeek(weekYear, weekOfYear).anchor.toAnchor(),
          ]),
        );
        const report = yield* this.#connection.reanchorAll(journalName, targets);
        failed += report.failed;
      }
      if (failed > 0) this.#notices.show(m.calendar_reanchor_failed_notice({ count: failed }));
    });
  }
}
```

- [ ] **Step 6: Register the service against the token**

In `src/journals/settings/module.ts`, add the import and the binding:

```ts
import { WeekPresetApplierToken } from "@/calendar";

import { WeekPresetService } from "./week-preset-service";
```

and inside `register(c)`:

```ts
c.register(WeekPresetService).useClass(WeekPresetService);
c.register(WeekPresetApplierToken).useFactory(() => inject(WeekPresetService));
```

`useFactory` takes a zero-argument factory, and `inject` inside it resolves from the active
resolver — the same token-aliasing idiom as `src/infrastructure/logger/module.ts:13`. Add
`import { inject } from "@/infrastructure/di";` to the module's imports.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/journals/settings/week-preset-service.test.ts`
Expected: PASS.

If the "recomputes the start/end date field" tests fail with the _old_ grid's values, the `await nextTick()` is not settling the bridge — do not delete the assertion; instead await the bridge's effect explicitly (`await nextTick(); await nextTick();` reproduces a second flush) and leave a comment recording why.

- [ ] **Step 8: Run the gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all green. `check:lint` is the gate that proves no import cycle was introduced.

- [ ] **Step 9: Commit**

```bash
git add src/calendar/settings/week-preset-applier.ts src/calendar/index.ts \
  src/journals/settings/week-preset-service.ts src/journals/settings/week-preset-service.test.ts \
  src/journals/settings/module.ts messages/en.json
git commit -m "feat(journals): re-anchor weekly notes when the week preset changes"
```

---

### Task 4: Route the settings UI through the applier

**Files:**

- Modify: `src/calendar/settings/ui/CalendarWeekBlock.vue:71-76`
- Modify: `src/calendar/settings/ui/CalendarWeekBlock.test.ts`
- Modify: `src/calendar/settings/ui/WeekPresetPickerModal.vue`

**Interfaces:**

- Consumes: `WeekPresetApplierToken` (Task 3).
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

In `src/calendar/settings/ui/CalendarWeekBlock.test.ts`, register a stub applier in `setupContainer` and return it:

```ts
const applier = { apply: vi.fn(() => AsyncResult.ok()) };
container.register(WeekPresetApplierToken).useValue(applier);
```

with `import { WeekPresetApplierToken } from "@/calendar";` added to the imports, and `applier` added to the returned object.

Add this test to the existing `describe("CalendarWeekBlock", ...)`:

```ts
it("hands the picked preset to the applier", async () => {
  const { container, settings, modalService, applier } = setupContainer();
  await settings.initialize();
  vi.mocked(modalService.open).mockReturnValue(
    AsyncResult.ok({ mode: "custom", dow: 0, doy: 6, global: false }) as never,
  );
  mount(container);
  await openSection();

  await userEvent.click(screen.getByText(m.calendar_week_config_change()));

  expect(applier.apply).toHaveBeenCalledWith({ mode: "custom", dow: 0, doy: 6, global: false });
});
```

Any existing test in this file that asserts the slice changed after the picker resolves must be updated to assert through `applier.apply` instead — the component no longer writes the slice. Read the file and adjust those assertions rather than deleting the tests.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/calendar/settings/ui/CalendarWeekBlock.test.ts`
Expected: FAIL — `applier.apply` never called (the component still assigns the slice).

- [ ] **Step 3: Wire the component**

In `src/calendar/settings/ui/CalendarWeekBlock.vue`, add to the imports:

```ts
import { WeekPresetApplierToken } from "../week-preset-applier";
```

add the injection next to the other `useService` calls:

```ts
const applyPreset = useService(WeekPresetApplierToken);
```

and replace the body of `change()` (lines 71-76):

```ts
function change(): void {
  void modals.open(weekPresetPickerModal, { current: slice.state }).tap((value) => {
    if (touchesGlobalPatch(slice.state, value)) reloadHint.request();
    // The applier owns the slice write: the new preset and the notes re-anchored onto it have
    // to move together, or the notes drop out of the index.
    void applyPreset.apply(value);
  });
}
```

- [ ] **Step 4: Add the heads-up line to the picker**

In `src/calendar/settings/ui/WeekPresetPickerModal.vue`, give the final action row a description:

```html
<UiSettingRow>
  <template #description>{{ m.calendar_picker_reanchor_hint() }}</template>
  <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
  <UiButton cta @click="update">{{ m.calendar_picker_update_action() }}</UiButton>
</UiSettingRow>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/calendar/settings/ui/`
Expected: PASS.

- [ ] **Step 6: Run the gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/calendar/settings/ui/CalendarWeekBlock.vue src/calendar/settings/ui/CalendarWeekBlock.test.ts \
  src/calendar/settings/ui/WeekPresetPickerModal.vue
git commit -m "feat(calendar): apply a week preset through the re-anchoring applier"
```

---

### Task 5: Prove it against a real vault

The unit tests pass even if a re-anchored note falls out of `JournalsIndex`, because that drop happens in Obsidian's metadata round-trip. Only e2e covers it.

**Files:**

- Create: `e2e/fixtures/e2e-week-preset/.obsidian/plugins/journals/data.json`
- Create: `e2e/integration/week-preset.e2e.ts`
- Modify: `e2e/support/settings.ts`

**Interfaces:**

- Consumes: everything from Tasks 1-4.
- Produces: `clickRowButton(rowName: string, text: string): Promise<void>` in `e2e/support/settings.ts`.

- [ ] **Step 1: Create the fixture**

Create `e2e/fixtures/e2e-week-preset/.obsidian/plugins/journals/data.json`. The `calendar` slice is pinned so the run does not depend on the test machine's locale, and both date fields are on so the e2e can check all three.

```json
{
  "version": 4,
  "calendar": {
    "mode": "custom",
    "dow": 1,
    "doy": 4,
    "global": false
  },
  "journals": {
    "weekly": {
      "name": "weekly",
      "write": {
        "type": "week"
      },
      "folder": "week",
      "timeline": {
        "start": "2026-01-01",
        "end": {
          "kind": "never"
        }
      },
      "dateFormat": "YYYY-[W]ww",
      "frontmatter": {
        "dateField": "journal-date",
        "startDateField": "journal-start-date",
        "endDateField": "journal-end-date",
        "addStartDate": true,
        "addEndDate": true
      },
      "numbering": {
        "enabled": false,
        "anchorDate": "",
        "allowBefore": false,
        "sources": []
      }
    }
  }
}
```

- [ ] **Step 2: Add the row-scoped button helper**

In `e2e/support/settings.ts`, add next to `clickButton`:

```ts
// The week-configuration modal renders one "Use" button per preset row, so the plain
// button=text selector would always hit the first. Scope by the row's visible name.
export async function clickRowButton(rowName: string, text: string): Promise<void> {
  await $(
    `//div[contains(@class,"setting-item")][.//div[contains(@class,"setting-item-name")][normalize-space(.)="${rowName}"]]//button[normalize-space(.)="${text}"]`,
  ).click();
}
```

- [ ] **Step 3: Write the e2e spec**

Create `e2e/integration/week-preset.e2e.ts`:

```ts
import { browser, expect } from "@wdio/globals";

import { clickButton, clickRowButton, expandSection, openSettings } from "../support/settings.js";
import { createNote, frontmatterOf, waitForFrontmatter, waitForJournalFrontmatter } from "../support/vault.js";

// Changing the week preset moves the week grid, so every weekly note's stored date stops being
// its week's first day. parseEntry rejects a non-canonical anchor, so an un-re-anchored note
// silently drops out of JournalsIndex and its calendar cell reads as empty. That drop only
// happens through Obsidian's real metadataCache round-trip, which unit tests do not exercise.

async function switchToWesternPreset(): Promise<void> {
  await openSettings();
  await expandSection("Calendar");
  await clickButton("Change");
  await clickRowButton("Western traditional", "Use");
  await clickButton("Update");
}

describe("week preset change", () => {
  beforeEach(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-week-preset", plugins: ["journals"] });
  });

  it("moves a connected weekly note's date onto the new grid", async () => {
    await createNote("week/2026-W23.md");
    await waitForJournalFrontmatter("week/2026-W23.md", { journal: "weekly", date: "2026-06-01" });

    await switchToWesternPreset();

    await waitForFrontmatter(
      "week/2026-W23.md",
      (frontmatter) => frontmatter["journal-date"] === "2026-05-31",
      "weekly note was not re-anchored onto the Western week grid",
    );
  });

  it("updates the note's start and end dates to the new week", async () => {
    await createNote("week/2026-W23.md");
    await waitForJournalFrontmatter("week/2026-W23.md", { journal: "weekly", date: "2026-06-01" });

    await switchToWesternPreset();

    await waitForFrontmatter(
      "week/2026-W23.md",
      (frontmatter) => frontmatter["journal-start-date"] === "2026-05-31",
      "weekly note's start date was not recomputed",
    );
    expect((await frontmatterOf("week/2026-W23.md"))?.["journal-end-date"]).toBe("2026-06-06");
  });

  it("keeps the note connected to its journal after the change", async () => {
    await createNote("week/2026-W23.md");
    await waitForJournalFrontmatter("week/2026-W23.md", { journal: "weekly", date: "2026-06-01" });

    await switchToWesternPreset();

    await waitForJournalFrontmatter("week/2026-W23.md", { journal: "weekly", date: "2026-05-31" });
    expect((await frontmatterOf("week/2026-W23.md"))?.journal).toBe("weekly");
  });
});
```

- [ ] **Step 4: Run the e2e suite**

Run: `npm run test:e2e:integration`
Expected: the three new specs pass along with the existing integration specs.

If `expandSection("Calendar")` does not find the section, read the rendered label from `m.common_label_calendar()` in `messages/en.json` and use the exact text. If the settings window does not open, check `e2e/support/settings.ts:openSettings` — Obsidian 1.13 pops settings into its own window.

- [ ] **Step 5: Run the unit gates too**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add e2e/fixtures/e2e-week-preset e2e/integration/week-preset.e2e.ts e2e/support/settings.ts
git commit -m "test(e2e): cover weekly note re-anchoring on a week preset change"
```

---

## Verification

After Task 5, confirm the whole change end to end:

- [ ] `npm test` — all unit tests pass
- [ ] `npm run check:types` — clean
- [ ] `npm run check:lint` — clean (this is the import-cycle gate)
- [ ] `npm run test:e2e:integration` — the three new week-preset specs pass
- [ ] `git log --oneline -5` — five focused commits, none carrying a `Co-Authored-By` trailer, none on a new branch
