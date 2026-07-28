# Empty Note Name Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A journal whose name template resolves to an empty note name warns in settings and refuses to create a note, instead of silently writing a hidden `.md` dotfile.

**Architecture:** The guard becomes an invariant of `NotePathService.pathFor`, which starts returning a new `EmptyNoteNameError`. Every caller that derives a path inherits the refusal for free. A `UserFacingFlowError` seam in `infrastructure/flows` lets that error carry its own localized notice instead of riding the generic "something went wrong" message. In settings, `NoteNamePreview` — which already resolves the name and already hides when it comes out empty — says so instead.

**Tech Stack:** TypeScript, Vue 3 SFCs, valibot, vitest + @testing-library/vue, WebdriverIO (wdio) for e2e, paraglide for i18n.

**Spec:** `docs/superpowers/specs/2026-07-28-empty-name-template-warning-design.md`

## Global Constraints

- New user-facing strings go in `messages/en.json` only, then `npm run compile:i18n`. `src/i18n/paraglide` is generated and **never staged**.
- Copy follows §A of `docs/2026-07-13-ux-text-audit.md`: sentence case, en-US, statement + `so`-clause + imperative fix.
- Every `Error` subclass lives in its feature's `errors.ts`, never inline in the consumer file.
- No `eslint-disable` comments. Fix the code instead.
- Tests colocate as `*.test.ts` beside the implementation. One behavior per test. Test names are subject+verb behavior descriptions with no "and"/comma lists. Scope nests via `describe()`, never via dashes or colons in one label.
- Only WHY-comments. No comment restates what the code says, and no comment references a spec or requirement number.
- Commit to the current branch (`v3-ai`). Never create a branch. Never add a `Co-Authored-By` trailer.
- Quality gates for every task: `npm test`, `npm run check:types`, `npm run check:lint` (npm, not pnpm).

---

### Task 1: `UserFacingFlowError` seam in the flows layer

`Flows.invoke` currently funnels every non-benign error into `m.flow_failure_notice({ error })`, interpolating the raw untranslated `Error.message`. This task adds an opt-in interface an error can implement to supply its own notice. No journal code changes yet — this is pure infrastructure, mirroring the `BenignFlowError` pattern that already lives in the same file.

**Files:**

- Modify: `src/infrastructure/flows/errors.ts`
- Modify: `src/infrastructure/flows/flows.ts:46-58`
- Modify: `src/infrastructure/flows/index.ts`
- Test: `src/infrastructure/flows/flows.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `interface UserFacingFlowError { readonly userNotice: string }`
  - `function isUserFacingFlowError(error: unknown): error is UserFacingFlowError`
  - Both exported from `@/infrastructure/flows`.

- [ ] **Step 1: Write the failing test**

In `src/infrastructure/flows/flows.test.ts`, add the fixture classes next to the existing `BenignError` / `BenignFailingFlow` pair (around line 40-53):

```ts
class UserFacingError extends FlowError implements UserFacingFlowError {
  readonly kind = "user-facing-error" as const;
  readonly userNotice = "Journal “daily” cannot create a note.";
  constructor() {
    super("user facing failure");
    this.name = "UserFacingError";
  }
}

class UserFacingFailingFlow implements Flow<null, never, UserFacingError> {
  execute(): AsyncResult<never, UserFacingError> {
    return AsyncResult.err(new UserFacingError());
  }
}
```

Extend the existing import at line 10 to pull the type in:

```ts
import { FlowError, UserAborted, type BenignFlowError, type UserFacingFlowError } from "./errors";
```

Add the test inside the existing `describe("invoke", ...)` block, after `it("names the underlying failure in the notice", ...)`:

```ts
it("shows the error's own notice when the flow fails with a user-facing error", async () => {
  c.register(UserFacingFailingFlow).useClass(UserFacingFailingFlow);
  await c.resolve(Flows).invoke(UserFacingFailingFlow, null);
  expect(notices.messages.at(0)).toBe("Journal “daily” cannot create a note.");
});
```

`toBe` rather than `toContain` is deliberate: it proves the generic `flow_failure_notice` wrapper is gone, not merely that the custom text appears somewhere inside it.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/infrastructure/flows/flows.test.ts`
Expected: FAIL — TypeScript cannot resolve `UserFacingFlowError` from `./errors`.

- [ ] **Step 3: Add the interface and predicate**

In `src/infrastructure/flows/errors.ts`, append below `isBenignFlowError`:

```ts
export interface UserFacingFlowError {
  readonly userNotice: string;
}

export function isUserFacingFlowError(error: unknown): error is UserFacingFlowError {
  return typeof error === "object" && error !== null && "userNotice" in error && typeof error.userNotice === "string";
}
```

- [ ] **Step 4: Prefer the error's own notice in `Flows.invoke`**

In `src/infrastructure/flows/flows.ts`, extend the import at line 7:

```ts
import { isBenignFlowError, isUserFacingFlowError, UserAborted } from "./errors";
```

Replace the `this.#notices.show(...)` call inside the `else` branch of `tapErr` (line 56) with:

```ts
this.#notices.show(
  isUserFacingFlowError(error) ? error.userNotice : m.flow_failure_notice({ error: errorMessage(error) }),
);
```

Leave the surrounding comment and the `options?.notify !== false` guard untouched.

- [ ] **Step 5: Export from the barrel**

In `src/infrastructure/flows/index.ts`, extend the two existing lines:

```ts
export { FlowError, isBenignFlowError, isUserFacingFlowError, UserAborted } from "./errors";
export type { BenignFlowError, UserFacingFlowError } from "./errors";
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/infrastructure/flows/flows.test.ts`
Expected: PASS, including the pre-existing `it("names the underlying failure in the notice")` which still asserts the generic path for `DomainError`.

- [ ] **Step 7: Run the quality gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/infrastructure/flows
git commit -m "feat(flows): let an error supply its own user-facing notice"
```

---

### Task 2: `EmptyNoteNameError` and the `pathFor` guard

The core change. `pathFor` renders the bare `nameTemplate` first, rejects a result that trims to empty, and only then builds the path. Three error unions widen so the project still type-checks.

**Files:**

- Modify: `src/journals/notes/errors.ts`
- Modify: `src/journals/notes/note-path.ts:46-66`
- Modify: `src/journals/notes/note-creation.ts:29-38`
- Modify: `src/journals/notes/flows/insert-journal-link.flow.ts:15`
- Modify: `src/journals/notes/index.ts`
- Modify: `src/journals/index.ts:62-73`
- Modify: `messages/en.json`
- Test: `src/journals/notes/note-path.test.ts`

**Interfaces:**

- Consumes: `UserFacingFlowError` from `@/infrastructure/flows` (Task 1).
- Produces:
  - `class EmptyNoteNameError extends JournalsError implements UserFacingFlowError`, constructed as `new EmptyNoteNameError(journalName: string)`, with a public `readonly journalName: string` and a `userNotice` getter.
  - `NotePathService.pathFor(name, metadata): Result<VaultPath, JournalNotFoundError | EmptyNoteNameError>`
  - `NotePathService.pathForDate(name, date): Result<VaultPath, JournalNotFoundError | EmptyNoteNameError>`
  - `EmptyNoteNameError` re-exported from `@/journals`.
  - Message key `journal_note_name_empty_notice` taking `{ journalName }`.

- [ ] **Step 1: Add the notice copy**

In `messages/en.json`, add this key immediately after `"journal_colliding_warning"` (line 1112):

```json
  "journal_note_name_empty_notice": "Journal \"{journalName}\" has a name template that resolves to an empty note name, so no note can be created.",
```

Run: `npm run compile:i18n`
Do not stage `src/i18n/paraglide` — it is git-ignored generated output.

- [ ] **Step 2: Write the failing tests**

In `src/journals/notes/note-path.test.ts`, extend the import at line 30 to include the new error:

```ts
import { AnchorOccupiedError, EmptyNoteNameError } from "./errors";
```

(If `AnchorOccupiedError` is not already imported in this file, import only `EmptyNoteNameError`.)

Add these four tests inside the existing `describe("NotePathService.pathFor", ...)` block, after `it("returns JournalNotFoundError for an unknown journal", ...)`:

```ts
it("returns EmptyNoteNameError when the name template is blank", () => {
  const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "" }) });
  const c = buildContainer(repo);
  const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };
  const result = c.resolve(NotePathService).pathFor("daily", meta);
  expect(result.isErr() && result.error instanceof EmptyNoteNameError).toBe(true);
});

it("returns EmptyNoteNameError when the name template is only whitespace", () => {
  const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "   " }) });
  const c = buildContainer(repo);
  const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };
  const result = c.resolve(NotePathService).pathFor("daily", meta);
  expect(result.isErr() && result.error instanceof EmptyNoteNameError).toBe(true);
});

it("returns EmptyNoteNameError when every variable in the name template renders empty", () => {
  const repo = fakeRepo({
    daily: fixedJournal(
      "daily",
      { type: "day" },
      {
        nameTemplate: "{{index}}",
        numbering: {
          enabled: false,
          anchorDate: anchor("2026-01-01"),
          allowBefore: false,
          sources: [{ variable: "index", frontmatterKey: "index", anchorValue: 1, reset: { kind: "never" } }],
        },
      },
    ),
  });
  const c = buildContainer(repo);
  const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };
  const result = c.resolve(NotePathService).pathFor("daily", meta);
  expect(result.isErr() && result.error instanceof EmptyNoteNameError).toBe(true);
});

it("resolves the path when only the folder template renders empty", () => {
  const repo = fakeRepo({
    daily: fixedJournal("daily", { type: "day" }, { folder: "" }),
  });
  const c = buildContainer(repo);
  const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };
  const result = c.resolve(NotePathService).pathFor("daily", meta);
  expect(result.isOk() && result.value).toBe("2026-05-19.md");
});
```

The third test is the renders-to-empty case: `numbering.enabled` is false, so `contextFor` binds the declared `index` source to the empty string (v2 fidelity — render empty rather than leak the literal token), and `"{{index}}"` renders to nothing. The `numbering` literal matches `numberingSchema` in `src/journals/config.ts:77` and its `numberingSource` at line 70.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/journals/notes/note-path.test.ts`
Expected: FAIL — `EmptyNoteNameError` is not exported from `./errors`.

- [ ] **Step 4: Add the error class**

In `src/journals/notes/errors.ts`, extend the imports:

```ts
import type { AnchorString } from "@/calendar";
import type { BenignFlowError, UserFacingFlowError } from "@/infrastructure/flows";
import { m } from "@/i18n";

import { JournalsError } from "../errors";
```

and append:

```ts
export class EmptyNoteNameError extends JournalsError implements UserFacingFlowError {
  override name = "EmptyNoteNameError";

  constructor(readonly journalName: string) {
    super(`Name template of journal ${journalName} resolves to an empty note name`);
  }

  get userNotice(): string {
    return m.journal_note_name_empty_notice({ journalName: this.journalName });
  }
}
```

Importing `@/i18n` into domain code is established practice here — see `src/journals/notes/journal-picker.ts` and `src/journals/navigation-commands.ts`.

- [ ] **Step 5: Guard `pathFor`**

In `src/journals/notes/note-path.ts`, extend the result import on line 7:

```ts
import { attempt, Err, Ok, Option, type Result } from "@/infrastructure/result";
```

and the local errors import (line 20 region):

```ts
import { EmptyNoteNameError } from "./errors";
```

Widen `pathForDate`'s return type (line 46):

```ts
  pathForDate(name: string, date: CalendarDate): Result<VaultPath, JournalNotFoundError | EmptyNoteNameError> {
```

Its body is unchanged — it is already inside `attempt.in` and propagates.

Replace the whole `pathFor` method (lines 54-66) with:

```ts
  pathFor(name: string, metadata: JournalMetadata): Result<VaultPath, JournalNotFoundError | EmptyNoteNameError> {
    return this.#journals.require(name).flatMap((config) => {
      const context = this.contextFor(config, metadata);
      const noteName = this.#engine.renderString(config.nameTemplate, context);
      // A note named "" becomes the dotfile ".md", which is invisible in the vault.
      // Reject rather than trim: trimming would move every template that renders
      // trailing space to a different path.
      if (noteName.trim() === "") return new Err(new EmptyNoteNameError(name));
      // The rendered note name feeds back into the folder as {{note_name}}/{{title}},
      // so the filename must render first (v2 order).
      const folderContext = this.#withNoteName(context, noteName);
      const folder = config.folder ? this.#engine.renderString(config.folder, folderContext) : "";
      const joined = folder ? `${folder}/${noteName}.md` : `${noteName}.md`;
      return new Ok(normalizePath(joined) as VaultPath);
    });
  }
```

Two things changed besides the guard: `.map` became `.flatMap` so the callback can return an `Err`, and `#withNoteName` now receives `noteName` directly instead of the round-trip `filename.replace(/\.md$/, "")`. The rendered output is identical.

- [ ] **Step 6: Widen the two error unions**

In `src/journals/notes/note-creation.ts`, change the import on line 20 and the union at lines 29-38:

```ts
import { AnchorOccupiedError, EmptyNoteNameError } from "./errors";
```

```ts
export type NoteCreationError =
  | JournalNotFoundError
  | EmptyNoteNameError
  | TemplateRenderError
  | NoteReadError
  | NoteCreateError
  | NoteWriteError
  | NoteNotFoundError
  | FrontmatterError
  | AnchorOccupiedError
  | UserAborted;
```

No body change is needed — line 61's `if (pathResult.kind === "err") return AsyncResult.err(pathResult.error)` already returns it.

`ConnectError` in `src/journals/notes/note-connection.ts:26` is a union that already includes `NoteCreationError`, so it needs no edit.

In `src/journals/notes/flows/insert-journal-link.flow.ts`, add the import and widen line 15:

```ts
import { EmptyNoteNameError } from "../errors";
```

```ts
type InsertJournalLinkError = UserAborted | JournalNotFoundError | EmptyNoteNameError;
```

- [ ] **Step 7: Export from the barrels**

In `src/journals/notes/index.ts`, extend the errors export:

```ts
export { EmptyNoteNameError, JournalNoteCreationError, NoApplicableJournals } from "./errors";
```

In `src/journals/index.ts`, add `EmptyNoteNameError` to the `from "./notes"` block (lines 62-73), keeping the existing ordering style:

```ts
  EmptyNoteNameError,
  JournalNoteCreationError,
  NoApplicableJournals,
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/journals/notes/note-path.test.ts`
Expected: PASS, all four new tests plus every pre-existing `pathFor` test.

- [ ] **Step 9: Run the quality gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all pass. `check:types` is the important one here — it proves no other consumer of `pathFor` or `pathForDate` was left behind by the widened error type.

- [ ] **Step 10: Commit**

```bash
git add src/journals messages/en.json
git commit -m "feat(journals): refuse to resolve a note path with an empty name"
```

---

### Task 3: Verify the invariant propagates to every path-deriving caller

Task 2's whole justification is that callers inherit the refusal without body changes. That claim needs tests, not trust. This task adds no production code.

**Files:**

- Test: `src/journals/notes/note-creation.test.ts`
- Test: `src/journals/notes/note-connection.test.ts`
- Test: `src/journals/notes/bulk-add/bulk-add-service.test.ts`

**Interfaces:**

- Consumes: `EmptyNoteNameError` from `./errors` (Task 2); `fakeRepo` and `fixedJournal` from `../testing` (already imported in all three files).
- Produces: nothing.

- [ ] **Step 1: Write the failing note-creation tests**

In `src/journals/notes/note-creation.test.ts`, extend the errors import on line 30:

```ts
import { AnchorOccupiedError, EmptyNoteNameError } from "./errors";
```

Add to the existing `describe("NoteCreationService.ensureNote", ...)` block:

```ts
it("refuses to create a note when the name template resolves to an empty name", async () => {
  const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "" }) });
  const notes = new FakeNotesService();
  const result = await build(repo, notes, new FakeModalService())
    .resolve(NoteCreationService)
    .ensureNote("daily", meta);
  expect(result.isErr() && result.error instanceof EmptyNoteNameError).toBe(true);
});

it("writes no file when the name template resolves to an empty name", async () => {
  const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "" }) });
  const notes = new FakeNotesService();
  await build(repo, notes, new FakeModalService()).resolve(NoteCreationService).ensureNote("daily", meta);
  expect(notes.find(".md" as VaultPath).isNone()).toBe(true);
});
```

- [ ] **Step 2: Write the failing note-connection tests**

In `src/journals/notes/note-connection.test.ts`, import the error from `./errors` (match the file's existing import style for sibling modules), then add to the existing `describe("connect", ...)` block:

```ts
it("refuses to rename the note when the name template resolves to an empty name", async () => {
  const repo = fakeRepo({
    daily: fixedJournal("daily", { type: "day" }, { folder: "Journal", nameTemplate: "" }),
  });
  const notes = new FakeNotesService();
  const sourcePath = "inbox/note.md" as VaultPath;
  notes.seed(sourcePath, "");
  const { container } = build(repo, notes, new FakeModalService());

  const result = await container
    .resolve(NoteConnectionService)
    .connect("daily", sourcePath, anchor("2026-06-01"), { rename: true, move: true });

  expect(result.isErr() && result.error instanceof EmptyNoteNameError).toBe(true);
});

it("leaves the note in place when it refuses to rename it", async () => {
  const repo = fakeRepo({
    daily: fixedJournal("daily", { type: "day" }, { folder: "Journal", nameTemplate: "" }),
  });
  const notes = new FakeNotesService();
  const sourcePath = "inbox/note.md" as VaultPath;
  notes.seed(sourcePath, "");
  const { container } = build(repo, notes, new FakeModalService());

  await container
    .resolve(NoteConnectionService)
    .connect("daily", sourcePath, anchor("2026-06-01"), { rename: true, move: true });

  expect(notes.find(sourcePath).isSome()).toBe(true);
});

it("connects the note in place when the name template resolves to an empty name", async () => {
  const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "" }) });
  const notes = new FakeNotesService();
  const sourcePath = "inbox/note.md" as VaultPath;
  notes.seed(sourcePath, "");
  const { container } = build(repo, notes, new FakeModalService());

  const result = await container.resolve(NoteConnectionService).connect("daily", sourcePath, anchor("2026-06-01"));

  expect(result.isOk()).toBe(true);
});
```

The third test is the boundary: connect without `rename` or `move` derives no path, so an empty template must not block it.

- [ ] **Step 3: Write the failing bulk-add test**

In `src/journals/notes/bulk-add/bulk-add-service.test.ts`, the shared `build()` helper (line 50) hardcodes its journal config. Give it an override parameter, keeping the current behavior as the default so no existing caller changes:

```ts
function build(journalOverrides: Partial<JournalConfig> = {}): {
  service: BulkAddService;
  notes: FakeNotesService;
  metadata: FakeNoteMetadataService;
  index: JournalsIndex;
} {
  const repo = fakeRepo({
    daily: fixedJournal("daily", { type: "day" }, { folder: "Journal", ...journalOverrides }),
  });
  // ...rest of the body unchanged
```

Add the type import beside the existing ones:

```ts
import type { JournalConfig } from "../../config";
```

Then add this test inside the existing `describe("plan", ...)` block, after `it("plans a connect action resolving the folder decision from params", ...)`:

```ts
it("keeps the note's current path when the configured path cannot resolve", async () => {
  const { service, notes, metadata } = build({ nameTemplate: "" });
  notes.seed("src/2026-06-01.md" as VaultPath);
  metadata.setMetadata("src/2026-06-01.md" as VaultPath, {
    title: "2026-06-01",
    tags: [],
    properties: {},
    tasks: [],
  });
  const planResult = await service.plan("daily", makeParameters({ folder: "src" }));
  expectOk(planResult);
  const note = planResult.value.notes.find((n) => n.path === "src/2026-06-01.md");
  expect(note?.kind === "action" && note.targetPath).toBe("src/2026-06-01.md");
});
```

The journal's folder is `Journal` and the note sits in `src`, so a resolvable configured path would have produced `Journal/2026-06-01.md`. Asserting the target equals the source path is therefore a real assertion, not a tautology.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/journals/notes`
Expected: PASS. These tests describe behavior Task 2 already produced, so they should pass immediately. If any fails, that is a real gap in Task 2's propagation claim — fix `note-path.ts` or the union, not the test.

- [ ] **Step 5: Run the quality gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/journals/notes
git commit -m "test(journals): cover empty-name refusal across path-deriving callers"
```

---

### Task 4: Canonicalize today's anchor in `useTodayMetadata`

`useTodayMetadata` builds metadata from `CalendarDate.today().toAnchor()` — a raw date, not the period's canonical anchor. `NotePathService.pathForDate` resolves through `CycleService.anchorOf` first, and for anything but a Day journal the two differ. Left alone, a Week journal whose template carries a numbering variable can fail to resolve it from a mid-week anchor, render empty, and trip a false empty-name warning in Task 5.

**Files:**

- Modify: `src/journals/settings/ui/use-today-metadata.ts`
- Test: `src/journals/settings/ui/use-today-metadata.test.ts`

**Interfaces:**

- Consumes: `CycleService` from `../../cycle`.
- Produces: `useTodayMetadata(journalName: string): ComputedRef<JournalMetadata | undefined>` — unchanged signature, now returning metadata anchored at the period start.

- [ ] **Step 1: Write the failing test**

In `src/journals/settings/ui/use-today-metadata.test.ts`, the existing `buildContainer` registers only a `daily` journal. Extend it to register a weekly one too, so the canonical anchor differs from today:

```ts
c.register(JournalsRepository).useValue(
  fakeRepo({
    daily: fixedJournal("daily", { type: "day" }),
    weekly: fixedJournal("weekly", { type: "week" }),
  }),
);
```

Then add:

```ts
it("anchors the metadata at the start of today's period", () => {
  const metadata = probe("weekly");
  expect(metadata.value?.anchor).toBe("2026-05-18");
});
```

The suite already pins the clock to 2026-05-19 (a Tuesday) and `installTestCalendar` defaults to `dow: 1`, so the owning week starts Monday 2026-05-18. Today's raw anchor would be `2026-05-19`, which is what makes this a real assertion.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/journals/settings/ui/use-today-metadata.test.ts`
Expected: FAIL with `expected '2026-05-19' to be '2026-05-18'`.

- [ ] **Step 3: Resolve today through `CycleService`**

Replace the body of `src/journals/settings/ui/use-today-metadata.ts`:

```ts
import { computed, type ComputedRef } from "vue";

import { CalendarDate } from "@/calendar";
import { useService } from "@/infrastructure/di";
import { FrontmatterService } from "@/journals";
import type { JournalMetadata } from "@/journals";

import { CycleService } from "../../cycle";

export function useTodayMetadata(journalName: string): ComputedRef<JournalMetadata | undefined> {
  const cycle = useService(CycleService);
  const frontmatter = useService(FrontmatterService);
  return computed(() => {
    // A raw date is not the period's identity: for anything but a day journal it
    // resolves numbering and stored end dates differently from the real note path.
    const anchor = cycle.anchorOf(journalName, CalendarDate.today());
    if (anchor.isNone()) return undefined;
    const result = frontmatter.buildMetadata(journalName, anchor.value);
    return result.isOk() ? result.value : undefined;
  });
}
```

`CycleService` is imported by its direct submodule path rather than from the `@/journals` barrel — `use-collision-check.ts` does the same, and it keeps this file clear of the journals-barrel import cycle.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/journals/settings/ui/use-today-metadata.test.ts`
Expected: PASS, including the existing tests for the daily journal and the unknown-journal case.

- [ ] **Step 5: Run the quality gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all pass. `NoteNamePreview.test.ts` also exercises this composable — if it regresses, the preview was relying on the raw anchor.

- [ ] **Step 6: Commit**

```bash
git add src/journals/settings/ui
git commit -m "fix(journals): anchor the settings preview at the period start"
```

---

### Task 5: Warn in `NoteNamePreview`

`NoteNamePreview` currently collapses two situations into one blank render: the name resolved to nothing, and the name could not be resolved at all. `EmptyNoteNameError` separates them — the first warns, the second stays silent.

**Files:**

- Modify: `src/journals/settings/ui/NoteNamePreview.vue`
- Modify: `messages/en.json`
- Test: `src/journals/settings/ui/NoteNamePreview.test.ts`

**Interfaces:**

- Consumes: `EmptyNoteNameError` from `@/journals` (Task 2); `useTodayMetadata` (Task 4).
- Produces: message key `journal_edit_name_template_empty_warning` (no parameters).

- [ ] **Step 1: Add the warning copy**

In `messages/en.json`, add this key immediately after `"journal_edit_name_template_description"` (line 1192):

```json
  "journal_edit_name_template_empty_warning": "This name template resolves to an empty note name, so no note can be created. Add a variable or some text to it.",
```

Run: `npm run compile:i18n`

- [ ] **Step 2: Write the failing tests**

In `src/journals/settings/ui/NoteNamePreview.test.ts`, the existing `setupDaily(nameTemplate = "{{date}}")` helper already takes the template as a parameter, so the blank case needs no new scaffolding. Extract the repeated `render` call into a local helper just above `describe`, so the new tests do not restate the injector plumbing:

```ts
function renderPreview(container: Container, journalName: string) {
  return render(NoteNamePreview, {
    props: { journalName },
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
```

Import `Container` as a type from `@/infrastructure/di` alongside the existing `provideInjectorOnApp` import, and rewrite the three existing tests to call `renderPreview(container, "daily")`. Then add:

```ts
it("warns when the name template resolves to an empty note name", async () => {
  const container = await setupDaily("");
  renderPreview(container, "daily");
  expect(screen.getByText(m.journal_edit_name_template_empty_warning())).toBeTruthy();
});

it("warns when the name template renders only whitespace", async () => {
  const container = await setupDaily("   ");
  renderPreview(container, "daily");
  expect(screen.getByText(m.journal_edit_name_template_empty_warning())).toBeTruthy();
});

it("renders no warning when the journal no longer exists", async () => {
  const container = await setupDaily();
  const { container: dom } = renderPreview(container, "ghost");
  expect(dom.textContent ?? "").toBe("");
});
```

Add `import { m } from "@/i18n";` to the test file. The third test replaces the existing `it("renders nothing when the journal no longer exists")` — it asserts the same thing under a name that now distinguishes it from the warning case, so delete the old one rather than keeping both.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/journals/settings/ui/NoteNamePreview.test.ts`
Expected: FAIL — `m.journal_edit_name_template_empty_warning` renders no matching element, because the component still hides on an empty name.

- [ ] **Step 4: Distinguish empty from unresolvable**

Replace `src/journals/settings/ui/NoteNamePreview.vue` with:

```vue
<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { EmptyNoteNameError, NotePathService } from "@/journals";

import { useTodayMetadata } from "./use-today-metadata";

const { journalName } = defineProps<{ journalName: string }>();

const path = useService(NotePathService);
const metadata = useTodayMetadata(journalName);

type Resolved = { kind: "name"; basename: string } | { kind: "empty" } | undefined;

const resolved = computed<Resolved>(() => {
  const md = metadata.value;
  if (!md) return undefined;
  const result = path.pathFor(journalName, md);
  if (result.isErr()) {
    return result.error instanceof EmptyNoteNameError ? { kind: "empty" } : undefined;
  }
  const filename = result.value.split("/").pop() ?? result.value;
  return { kind: "name", basename: filename.replace(/\.md$/, "") };
});
</script>

<template>
  <div v-if="resolved?.kind === 'empty'" class="journal-hint">
    {{ m.journal_edit_name_template_empty_warning() }}
  </div>
  <div v-else-if="resolved?.kind === 'name'">
    {{ m.journal_edit_note_name_preview_label() }}
    <b class="u-pop">{{ resolved.basename }}</b>
  </div>
</template>

<style scoped>
.journal-hint {
  color: var(--text-warning);
}
/* Preserve significant whitespace in a resolved filename so spaces render literally. */
b {
  white-space: pre;
}
</style>
```

`.journal-hint` moves in here because `NoteCreationSection.vue`'s styles are scoped and do not reach a child component. Leave `NoteCreationSection.vue`'s own `.journal-hint` rule alone — its collision and invertibility hints still use it.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/journals/settings/ui/NoteNamePreview.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the quality gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/journals/settings/ui messages/en.json
git commit -m "feat(journals): warn when the note name template resolves to nothing"
```

---

### Task 6: End-to-end proof that the notice reaches the screen

The unit tests cover the refusal completely. What they cannot see is the notice travelling through the real `Flows` wiring into Obsidian's notice container — which is the entire reason Task 1's seam exists.

**Files:**

- Create: `e2e/fixtures/e2e-empty-name/.obsidian/plugins/journals/data.json`
- Create: `e2e/journeys/empty-name-template.e2e.ts`
- Modify: `docs/manual-testing-checklist-v3.md:903-913`

**Interfaces:**

- Consumes: `runCommand` from `../support/commands.js`, `waitForNotice` from `../support/notices.js`, `noteExists` from `../support/vault.js`.
- Produces: nothing.

- [ ] **Step 1: Create the fixture vault**

A fixture vault is just its plugin data file. Create `e2e/fixtures/e2e-empty-name/.obsidian/plugins/journals/data.json`:

```json
{
  "version": 4,
  "journals": {
    "daily": {
      "name": "daily",
      "write": { "type": "day" },
      "nameTemplate": "",
      "timeline": { "start": "", "end": { "kind": "never" } },
      "dateFormat": "YYYY-MM-DD",
      "frontmatter": {
        "dateField": "journal-date",
        "startDateField": "journal-start-date",
        "endDateField": "journal-end-date",
        "addStartDate": false,
        "addEndDate": false
      },
      "numbering": { "enabled": false, "anchorDate": "", "allowBefore": false, "sources": [] }
    }
  },
  "commands": {
    "open-today": {
      "name": "Jump to today",
      "icon": "calendar-days",
      "showInRibbon": false,
      "openMode": "active",
      "target": { "kind": "all", "writeType": "day" },
      "type": "same",
      "context": "today"
    }
  }
}
```

The `e2e-` prefix on the directory name is required: a Hyprland scratchpad rule keys off it to route the test Obsidian window off the current workspace.

- [ ] **Step 2: Write the failing e2e spec**

Create `e2e/journeys/empty-name-template.e2e.ts`:

```ts
import { browser } from "@wdio/globals";

import { runCommand } from "../support/commands.js";
import { waitForNotice } from "../support/notices.js";
import { noteExists } from "../support/vault.js";

// e2e-empty-name defines a day journal whose nameTemplate is "", so every note it would
// create resolves to the invisible dotfile ".md". The plugin must refuse and say so.
const NOTICE = 'Journal "daily" has a name template that resolves to an empty note name, so no note can be created.';

describe("empty note name template", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-empty-name", plugins: ["journals"] });
  });

  it("tells the user why no note was created", async () => {
    await runCommand("journals:open-today");
    await waitForNotice(NOTICE);
  });

  it("creates no note", async () => {
    await runCommand("journals:open-today");
    await waitForNotice(NOTICE);
    expect(await noteExists(".md")).toBe(false);
  });
});
```

The second test waits for the notice before asserting, so it cannot pass by checking the vault before the command has finished.

- [ ] **Step 3: Run the e2e spec to verify it fails**

Run: `npm run build && npx wdio run ./wdio.conf.mts --spec e2e/journeys/empty-name-template.e2e.ts`
Expected: FAIL if run against the pre-Task-2 code. Against the current tree it should PASS — Tasks 1, 2 and 5 are what make it pass. If it fails now, the failure is real: read the notice text actually rendered and reconcile it with `journal_note_name_empty_notice` in `messages/en.json`. Curly vs straight quotes and trailing punctuation must match exactly.

- [ ] **Step 4: Run the full e2e suite**

Run: `npm run test:e2e`
Expected: PASS. Watch specifically for `e2e/journeys/bulk-add.e2e.ts` and the connect-note journeys — Task 2 changed what they receive when a path cannot resolve.

- [ ] **Step 5: Add the manual checklist entry**

In `docs/manual-testing-checklist-v3.md`, under §18's "Flow failures reach the user" list (after the timeline-ended item at line 913), add:

```markdown
- [ ] Journal whose **note name template is empty** → the settings field shows a
      warning, and running the journal's open command shows a notice naming the
      journal. No `.md` dotfile appears in the vault.
```

- [ ] **Step 6: Run the quality gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add e2e docs/manual-testing-checklist-v3.md
git commit -m "test(e2e): cover the empty note name template refusal"
```

---

## Two deliberate departures from the spec

**The weekly-numbering regression test moved down a layer.** The spec listed it under
`NoteNamePreview.test.ts` as "does not warn for a Week journal whose template carries a
numbering variable". Task 4 asserts the same regression at its source — that
`useTodayMetadata` anchors at the period start rather than at the raw date — which is
the only thing that could produce the false warning. Re-asserting it through the
component would need a whole second fixture helper for a weekly journal with numbering,
and would be testing the composable a second time through a wrapper. Task 4's test is
the guard; if it goes green while the component still warns, something other than the
anchor is wrong.

**The manual checklist entry goes in §18, not §13.** The spec said §13 (Settings UI
navigation & validation). §13 itself states, at line 736, that field validation belongs
in §18 (Error & recovery surfaces), whose "Flow failures reach the user" list is exactly
the "an item passes only if the user is actually told" class this feature belongs to.

## Not in this plan

The spec's closing section records a related bug found while designing this one and deliberately left alone: `dateFormat` is `v.pipe(v.string(), v.minLength(1))` in `journalConfigSchema` and is bound live to a clearable `UiTextInput`, so clearing it fails schema parse on reload and resets the whole journal to defaults. It needs its own spec. Do not fix it here.

The spec also records that the collision and invertibility hints are **not** suppressed while the name resolves to empty. `useCollisionCheck` self-suppresses once `pathFor` returns `Err`; only `useInvertibilityCheck` can double up, and its message stays true. Do not add gating.
