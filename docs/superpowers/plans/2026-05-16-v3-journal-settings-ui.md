# v3 Journal Settings UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port v2's per-journal settings UI to v3 for the subset of fields that already live on `JournalConfig`: a dashboard block listing journals with add / edit / rename / delete affordances, an edit subpage for tuning timeline + sequential numbers + date format + frontmatter property names, five flow classes orchestrating modal-driven mutations, a `JournalLifecycleService` exposing collection ops, and ~52 paraglide message keys (introducing a `common_*` namespace for generic action labels).

**Architecture:** All new code lives under `src/journals/settings/` (mirroring `src/calendar/settings/`). A `JournalLifecycleService` does collection-only data ops (no UI awareness). Five `Flow<P, R, FlowError>` classes (`AddJournalFlow`, `RenameJournalFlow`, `DeleteJournalFlow`, `EditFrontmatterFieldFlow`, `EditSequencePropertyFlow`) orchestrate modal-plus-mutation paths through `attempt.in(this, async function* () { … })`. Five `defineModal` definitions back the modals. Vue components consume these via `useService(Flows).invoke(...)`. The edit subpage takes the `journalName`, binds directly to the reactive `collection.entries[journalName]` proxy (so autosave is automatic via `SettingsService`'s 300ms debounce), and pops itself when the journal disappears. The journals settings module is wired into `src/main.ts` between `journalsModule` and the end of autoLoad — it's UI-only and depends on the journals + settings + modals + flows modules already being registered.

**Tech Stack:** TypeScript, Vue 3 (`<script setup>` SFCs), valibot (modal form schemas), vee-validate + `@vee-validate/valibot` (form state + error bag), ts-pattern (discriminated dispatch), Vitest + `@testing-library/vue` + `@testing-library/user-event` (tests), paraglide (i18n) — all already in the project.

**Spec:** `docs/superpowers/specs/2026-05-16-v3-journal-settings-ui-design.md`

---

## File map

**Create:**

- `src/journals/settings/errors.ts` — `InvalidJournalNameError`, `JournalNameTakenError`, `UnknownJournalError`, `UnknownSequenceSourceError`, `JournalLifecycleFlowError`, `toFlowError` helper
- `src/journals/settings/errors.test.ts`
- `src/journals/settings/lifecycle.ts` — `JournalLifecycleService`
- `src/journals/settings/lifecycle.test.ts`
- `src/journals/settings/describe-write.ts` — `describeWrite(write)` pure helper
- `src/journals/settings/describe-write.test.ts`
- `src/journals/settings/module.ts` — `journalsSettingsModule`
- `src/journals/settings/flows/add-journal.flow.ts`
- `src/journals/settings/flows/add-journal.flow.test.ts`
- `src/journals/settings/flows/rename-journal.flow.ts`
- `src/journals/settings/flows/rename-journal.flow.test.ts`
- `src/journals/settings/flows/delete-journal.flow.ts`
- `src/journals/settings/flows/delete-journal.flow.test.ts`
- `src/journals/settings/flows/edit-frontmatter-field.flow.ts`
- `src/journals/settings/flows/edit-frontmatter-field.flow.test.ts`
- `src/journals/settings/flows/edit-sequence-property.flow.ts`
- `src/journals/settings/flows/edit-sequence-property.flow.test.ts`
- `src/journals/settings/ui/DateFormatPreview.vue`
- `src/journals/settings/ui/DateFormatPreview.test.ts`
- `src/journals/settings/ui/add-journal-modal.ts`
- `src/journals/settings/ui/AddJournalModal.vue`
- `src/journals/settings/ui/AddJournalModal.test.ts`
- `src/journals/settings/ui/rename-journal-modal.ts`
- `src/journals/settings/ui/RenameJournalModal.vue`
- `src/journals/settings/ui/RenameJournalModal.test.ts`
- `src/journals/settings/ui/delete-journal-modal.ts`
- `src/journals/settings/ui/DeleteJournalModal.vue`
- `src/journals/settings/ui/DeleteJournalModal.test.ts`
- `src/journals/settings/ui/edit-frontmatter-field-modal.ts`
- `src/journals/settings/ui/EditFrontmatterFieldModal.vue`
- `src/journals/settings/ui/EditFrontmatterFieldModal.test.ts`
- `src/journals/settings/ui/edit-sequence-property-modal.ts`
- `src/journals/settings/ui/EditSequencePropertyModal.vue`
- `src/journals/settings/ui/EditSequencePropertyModal.test.ts`
- `src/journals/settings/ui/journals-subpage.ts` — `defineSubpage<{ journalName }>`
- `src/journals/settings/ui/JournalEditSubpage.vue`
- `src/journals/settings/ui/JournalEditSubpage.test.ts`
- `src/journals/settings/ui/JournalsDashboardBlock.vue`
- `src/journals/settings/ui/JournalsDashboardBlock.test.ts`

**Modify:**

- `messages/en.json` — add the journal-settings i18n keys + `common_*` namespace
- `src/main.ts` — register `journalsSettingsModule` after `journalsModule`
- `src/journals/index.ts` — re-export `journalsSettingsModule` (kept consistent with `calendarSettingsModule`)

---

## Pre-flight

Run the baseline checks before starting any task so failures attributable to existing state don't get blamed on the new code:

```bash
npm run check:types
npm run check:lint
npm run test
```

All three must pass. If any fail unrelated to this work, fix or document the discrepancy before proceeding.

---

## Task 0: i18n message keys

**Background.** All five modals + the dashboard + the edit subpage call paraglide messages by key. The paraglide vite plugin compiles `messages/en.json` → `src/i18n/paraglide/messages.js` on every build/test run, so adding keys here is the only required step — no codegen command. Variant keys use the paraglide `declarations` + `match` shape (see `calendar_preset_name` for precedent at `messages/en.json:31-42`).

**Files:**

- Modify: `messages/en.json` — add the keys listed below; preserve existing keys

- [ ] **Step 1: Open the messages file and add common keys.** Insert the following keys (alphabetically sorted within the file). Use the exact wording shown.

```json
"common_action_cancel": "Cancel",
"common_action_close": "Close",
"common_action_submit": "Save",
```

- [ ] **Step 2: Add the journal_write variant key.**

```json
"journal_write": [
  {
    "declarations": ["input type", "input every", "input duration"],
    "selectors": ["type"],
    "match": {
      "type=day": "daily",
      "type=week": "weekly",
      "type=month": "monthly",
      "type=quarter": "quarterly",
      "type=year": "annually",
      "type=custom": "every {duration} {every}"
    }
  }
],
```

- [ ] **Step 3: Add the timeline-end variant keys.**

```json
"journal_edit_end_kind": [
  {
    "declarations": ["input kind"],
    "selectors": ["kind"],
    "match": {
      "kind=never": "Never",
      "kind=date": "After date",
      "kind=repeats": "After repeating"
    }
  }
],
"journal_edit_end_description": [
  {
    "declarations": ["input kind"],
    "selectors": ["kind"],
    "match": {
      "kind=never": "Writing continues indefinitely.",
      "kind=date": "New notes after this date won't be created.",
      "kind=repeats": "After creating this many notes, new notes won't be created."
    }
  }
],
```

- [ ] **Step 4: Add the reset + delete-mode + frontmatter-field variant keys.**

```json
"journal_edit_reset_option": [
  {
    "declarations": ["input kind"],
    "selectors": ["kind"],
    "match": {
      "kind=never": "Continuous",
      "kind=after": "Resets after"
    }
  }
],
"journal_delete_mode_option": [
  {
    "declarations": ["input mode"],
    "selectors": ["mode"],
    "match": {
      "mode=keep": "Keep notes",
      "mode=clear": "Clear journal data (not yet supported)",
      "mode=delete": "Delete notes (not yet supported)"
    }
  }
],
"journal_fm_field_modal_title": [
  {
    "declarations": ["input field"],
    "selectors": ["field"],
    "match": {
      "field=dateField": "Edit date property name",
      "field=startDateField": "Edit start date property name",
      "field=endDateField": "Edit end date property name"
    }
  }
],
"journal_fm_field_label": [
  {
    "declarations": ["input field"],
    "selectors": ["field"],
    "match": {
      "field=dateField": "Date property name",
      "field=startDateField": "Start date property name",
      "field=endDateField": "End date property name"
    }
  }
],
```

- [ ] **Step 5: Add the shared/flat keys.** Insert each as a plain string entry. The values below are authored copy; adjust wording only if a key already exists or is taken.

```json
"journal_name_required_error": "Journal name is required.",
"journal_name_unique_error": "Journal name must be unique.",
"journal_anchor_format_error": "Date must be YYYY-MM-DD.",
"journal_notes_not_rewritten_hint": "Existing notes are not rewritten. You may need to update them manually.",
"journal_property_name_required": "Property name is required.",
"journal_property_modal_current_label": "Current name",
"journal_property_modal_new_label": "New name",
"journal_flow_failure": "Journal action failed ({kind}).",
"journal_dashboard_section_title": "Journals",
"journal_dashboard_empty": "No journals created yet.",
"journal_dashboard_add": "Add journal",
"journal_dashboard_edit": "Edit",
"journal_dashboard_rename": "Rename",
"journal_dashboard_delete": "Delete",
"journal_add_modal_title": "Add journal",
"journal_add_modal_name_label": "Journal name",
"journal_add_modal_write_label": "I'll be writing",
"journal_add_modal_every_label": "Every",
"journal_add_modal_duration_label": "Duration",
"journal_add_modal_anchor_label": "Start date",
"journal_add_modal_anchor_description": "This date is used to count custom intervals from. It cannot be changed after creating the journal.",
"journal_rename_modal_title": "Rename {name}",
"journal_rename_modal_new_label": "New name",
"journal_rename_modal_same_as_current_error": "New name must differ from current name.",
"journal_delete_modal_title": "Remove {name}",
"journal_delete_mode_label": "What to do with connected notes",
"journal_delete_mode_not_implemented_hint": "Clear and Delete modes will land with the notes-IO service.",
"journal_sequence_property_modal_title": "Edit sequential number property name",
"journal_edit_back_tooltip": "Back to list",
"journal_edit_rename_tooltip": "Rename journal",
"journal_edit_header_title": "Configuring {name} (writing {writing})",
"journal_edit_section_timeline": "Timeline",
"journal_edit_section_sequential_numbers": "Sequential numbers",
"journal_edit_section_frontmatter": "Frontmatter",
"journal_edit_start_writing_label": "Start writing on",
"journal_edit_start_writing_description": "New notes prior to this date won't be created.",
"journal_edit_start_writing_custom_locked": "Start date for custom intervals cannot be changed: it is used to count intervals from.",
"journal_edit_end_writing_label": "End writing",
"journal_edit_sequence_enabled_label": "Enable sequential numbers",
"journal_edit_sequence_enabled_description": "Assign numbers to notes (e.g. Day 1, Day 2, …).",
"journal_edit_anchor_label": "Anchor date",
"journal_edit_anchor_start_used": "Start date is used as anchor date.",
"journal_edit_start_number_label": "Start number",
"journal_edit_start_number_description": "Number assigned at the anchor date.",
"journal_edit_reset_label": "Reset",
"journal_edit_reset_description": "How the number changes over time.",
"journal_edit_reset_count_suffix": "repeats",
"journal_edit_allow_before_label": "Allow before anchor",
"journal_edit_allow_before_description": "Allow indexing before the anchor date. May produce negative numbers.",
"journal_edit_sequence_property_label": "Property name",
"journal_edit_date_format_label": "Default date format",
"journal_edit_date_format_description": "Used to format dates if not defined in variables (like {{date}}).",
"journal_edit_date_format_moment_doc_link": "moment.js format reference",
"journal_edit_fm_start_toggle_label": "Add start date property?",
"journal_edit_fm_start_description": "For weekly journals that span two years, the start date can differ from the date property.",
"journal_edit_fm_end_toggle_label": "Add end date property?",
```

- [ ] **Step 6: Run lint + typecheck + test to confirm the i18n compile step succeeds.**

Run:

```bash
npm run check:lint && npm run check:types && npm run test -- --run --reporter=verbose --watch=false src/i18n/init-locale.test.ts
```

Expected: all pass. The paraglide plugin is wired into the vite test config, so running any test triggers a recompile of `src/i18n/paraglide/`. If a key has syntax errors, vitest fails early with a paraglide compilation error pointing at the bad entry.

- [ ] **Step 7: Commit.**

```bash
git add messages/en.json
git -c commit.gpgsign=false commit -m "i18n(journals): add settings UI message keys and common_* namespace"
```

---

## Task 1: errors.ts

**Files:**

- Create: `src/journals/settings/errors.ts`
- Create: `src/journals/settings/errors.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `src/journals/settings/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { FlowError } from "@/infrastructure/flows";

import {
  InvalidJournalNameError,
  JournalLifecycleFlowError,
  JournalNameTakenError,
  UnknownJournalError,
  UnknownSequenceSourceError,
  toFlowError,
} from "./errors";

describe("InvalidJournalNameError", () => {
  it("has kind 'invalid-name'", () => {
    expect(new InvalidJournalNameError("bad").kind).toBe("invalid-name");
  });
});

describe("JournalNameTakenError", () => {
  it("exposes the conflicting name", () => {
    const err = new JournalNameTakenError("daily");
    expect(err.kind).toBe("name-taken");
    expect(err.name).toBe("daily");
  });
});

describe("UnknownJournalError", () => {
  it("exposes the missing journal name", () => {
    const err = new UnknownJournalError("ghost");
    expect(err.kind).toBe("unknown-journal");
    expect(err.journalName).toBe("ghost");
  });
});

describe("UnknownSequenceSourceError", () => {
  it("exposes the journal name and source index", () => {
    const err = new UnknownSequenceSourceError("daily", 2);
    expect(err.kind).toBe("unknown-sequence-source");
    expect(err.journalName).toBe("daily");
    expect(err.sourceIndex).toBe(2);
  });
});

describe("toFlowError", () => {
  it("wraps a lifecycle error in JournalLifecycleFlowError", () => {
    const cause = new JournalNameTakenError("daily");
    const wrapped = toFlowError(cause);
    expect(wrapped).toBeInstanceOf(JournalLifecycleFlowError);
    expect(wrapped).toBeInstanceOf(FlowError);
    expect(wrapped.cause).toBe(cause);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

Run:

```bash
npm run test -- --run src/journals/settings/errors.test.ts
```

Expected: FAIL with "Cannot find module './errors'" or equivalent.

- [ ] **Step 3: Create `src/journals/settings/errors.ts`.**

```ts
import { FlowError } from "@/infrastructure/flows";

export class InvalidJournalNameError extends Error {
  readonly kind = "invalid-name" as const;
  constructor(public readonly attemptedName: string) {
    super(`Invalid journal name: ${JSON.stringify(attemptedName)}`);
    this.name = "InvalidJournalNameError";
  }
}

export class JournalNameTakenError extends Error {
  readonly kind = "name-taken" as const;
  constructor(public readonly name: string) {
    super(`Journal name already in use: ${name}`);
    this.name = "JournalNameTakenError";
  }
}

export class UnknownJournalError extends Error {
  readonly kind = "unknown-journal" as const;
  constructor(public readonly journalName: string) {
    super(`Unknown journal: ${journalName}`);
    this.name = "UnknownJournalError";
  }
}

export class UnknownSequenceSourceError extends Error {
  readonly kind = "unknown-sequence-source" as const;
  constructor(
    public readonly journalName: string,
    public readonly sourceIndex: number,
  ) {
    super(`Unknown sequence source ${sourceIndex} on journal ${journalName}`);
    this.name = "UnknownSequenceSourceError";
  }
}

export type JournalLifecycleError =
  | InvalidJournalNameError
  | JournalNameTakenError
  | UnknownJournalError
  | UnknownSequenceSourceError;

export class JournalLifecycleFlowError extends FlowError {
  readonly kind = "journal-lifecycle" as const;
  constructor(public override readonly cause: JournalLifecycleError) {
    super(cause.message);
    this.name = "JournalLifecycleFlowError";
  }
}

export function toFlowError(cause: JournalLifecycleError): JournalLifecycleFlowError {
  return new JournalLifecycleFlowError(cause);
}
```

- [ ] **Step 4: Run the test to verify it passes.**

Run:

```bash
npm run test -- --run src/journals/settings/errors.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Run lint + typecheck.**

```bash
npm run check:lint && npm run check:types
```

Expected: both pass.

- [ ] **Step 6: Commit.**

```bash
git add src/journals/settings/errors.ts src/journals/settings/errors.test.ts
git -c commit.gpgsign=false commit -m "feat(journals): lifecycle + flow errors for settings UI"
```

---

## Task 2: `JournalLifecycleService`

**Background.** Data-only service. `inject(SettingsService)` resolves the live settings; `getCollection(journalConfigCollection)` returns the reactive collection handle whose `add` / `remove` / `get` are the only mutations this service performs. `JournalsIndex` is not touched (see spec rationale: `NumberingService` fingerprints its cache by stringified `numbering` and reads config fresh per call, so deletes/renames produce unreachable cache entries rather than stale reads).

**Files:**

- Create: `src/journals/settings/lifecycle.ts`
- Create: `src/journals/settings/lifecycle.test.ts`

- [ ] **Step 1: Write the failing tests.**

Create `src/journals/settings/lifecycle.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";
import { Err, Ok } from "@/infrastructure/result";
import { journalConfigCollection, type JournalConfig } from "@/journals";
import { SettingsService } from "@/settings";
import { createSettingsService } from "@/settings/testing";

import { InvalidJournalNameError, JournalNameTakenError, UnknownJournalError } from "./errors";
import { JournalLifecycleService } from "./lifecycle";

function build(raw?: unknown): { service: JournalLifecycleService; settings: SettingsService; container: Container } {
  const { service, container } = createSettingsService({
    collections: [journalConfigCollection],
    raw,
  });
  container.register(JournalLifecycleService).useClass(JournalLifecycleService);
  return { service: container.resolve(JournalLifecycleService), settings: service, container };
}

async function buildInitialised(raw?: unknown) {
  const { service, settings, container } = build(raw);
  const result = await settings.initialize();
  expect(result.kind).toBe("ok");
  return { service, settings, container };
}

describe("JournalLifecycleService.create", () => {
  it("adds a fixed-write journal to the collection with defaults", async () => {
    const { service, settings } = await buildInitialised();
    const result = service.create("daily", { type: "day" });
    expect(result.kind).toBe("ok");
    const stored = settings.getCollection(journalConfigCollection).get("daily");
    expect(stored?.name).toBe("daily");
    expect(stored?.write).toEqual({ type: "day" });
  });

  it("rejects an empty name", async () => {
    const { service } = await buildInitialised();
    const result = service.create("", { type: "day" });
    expect(result).toBeInstanceOf(Err);
    expect(result.kind === "err" && result.error).toBeInstanceOf(InvalidJournalNameError);
  });

  it("rejects an already-used name", async () => {
    const { service } = await buildInitialised();
    service.create("daily", { type: "day" });
    const result = service.create("daily", { type: "week" });
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalNameTakenError);
  });
});

describe("JournalLifecycleService.rename", () => {
  it("moves the entry to the new key and clears the old", async () => {
    const { service, settings } = await buildInitialised();
    service.create("daily", { type: "day" });
    const result = service.rename("daily", "morning");
    expect(result.kind).toBe("ok");
    const col = settings.getCollection(journalConfigCollection);
    expect(col.get("daily")).toBeUndefined();
    expect(col.get("morning")?.name).toBe("morning");
  });

  it("rejects renaming an unknown journal", async () => {
    const { service } = await buildInitialised();
    const result = service.rename("missing", "x");
    expect(result.kind === "err" && result.error).toBeInstanceOf(UnknownJournalError);
  });

  it("rejects renaming to an already-used name", async () => {
    const { service } = await buildInitialised();
    service.create("a", { type: "day" });
    service.create("b", { type: "week" });
    const result = service.rename("a", "b");
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalNameTakenError);
  });

  it("rejects renaming to the same name", async () => {
    const { service } = await buildInitialised();
    service.create("a", { type: "day" });
    const result = service.rename("a", "a");
    expect(result.kind === "err" && result.error).toBeInstanceOf(InvalidJournalNameError);
  });

  it("rejects renaming to an empty string", async () => {
    const { service } = await buildInitialised();
    service.create("a", { type: "day" });
    const result = service.rename("a", "");
    expect(result.kind === "err" && result.error).toBeInstanceOf(InvalidJournalNameError);
  });
});

describe("JournalLifecycleService.delete", () => {
  it("removes the entry from the collection", async () => {
    const { service, settings } = await buildInitialised();
    service.create("daily", { type: "day" });
    const result = service.delete("daily");
    expect(result.kind).toBe("ok");
    expect(settings.getCollection(journalConfigCollection).get("daily")).toBeUndefined();
  });

  it("rejects deleting an unknown journal", async () => {
    const { service } = await buildInitialised();
    const result = service.delete("missing");
    expect(result.kind === "err" && result.error).toBeInstanceOf(UnknownJournalError);
  });
});

describe("JournalLifecycleService.rename — payload preservation", () => {
  it("carries over every other field unchanged", async () => {
    const { service, settings } = await buildInitialised();
    service.create("a", { type: "day" });
    const col = settings.getCollection(journalConfigCollection);
    const original = col.get("a") as JournalConfig;
    original.dateFormat = "YYYY/MM/DD";
    original.numbering.enabled = true;
    const r = service.rename("a", "b");
    expect(r.kind).toBe("ok");
    const renamed = col.get("b") as JournalConfig;
    expect(renamed.dateFormat).toBe("YYYY/MM/DD");
    expect(renamed.numbering.enabled).toBe(true);
    expect(renamed.name).toBe("b");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

Run:

```bash
npm run test -- --run src/journals/settings/lifecycle.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/journals/settings/lifecycle.ts`.**

```ts
import { inject } from "@/infrastructure/di";
import { attempt, Err, Ok, type Result } from "@/infrastructure/result";
import { journalConfigCollection, journalDefaultsFor, type JournalConfig, type JournalWrite } from "@/journals";
import { SettingsService } from "@/settings";

import { InvalidJournalNameError, JournalNameTakenError, UnknownJournalError } from "./errors";

export class JournalLifecycleService {
  readonly #settings = inject(SettingsService);

  create(name: string, write: JournalWrite): Result<JournalConfig, InvalidJournalNameError | JournalNameTakenError> {
    return attempt.in(this, function* () {
      if (name.length === 0) yield* new Err<never, InvalidJournalNameError>(new InvalidJournalNameError(name));
      const collection = this.#settings.getCollection(journalConfigCollection);
      if (collection.get(name) !== undefined) {
        yield* new Err<never, JournalNameTakenError>(new JournalNameTakenError(name));
      }
      const created = collection.add(name, journalDefaultsFor(write, name)) as JournalConfig;
      return created;
    });
  }

  rename(
    oldName: string,
    newName: string,
  ): Result<void, UnknownJournalError | InvalidJournalNameError | JournalNameTakenError> {
    return attempt.in(this, function* () {
      if (newName.length === 0 || newName === oldName) {
        yield* new Err<never, InvalidJournalNameError>(new InvalidJournalNameError(newName));
      }
      const collection = this.#settings.getCollection(journalConfigCollection);
      const existing = collection.get(oldName) as JournalConfig | undefined;
      if (!existing) yield* new Err<never, UnknownJournalError>(new UnknownJournalError(oldName));
      if (collection.get(newName) !== undefined) {
        yield* new Err<never, JournalNameTakenError>(new JournalNameTakenError(newName));
      }
      collection.add(newName, { ...(existing as JournalConfig), name: newName });
      collection.remove(oldName);
      return undefined;
    });
  }

  delete(name: string): Result<void, UnknownJournalError> {
    const collection = this.#settings.getCollection(journalConfigCollection);
    if (collection.get(name) === undefined) return new Err(new UnknownJournalError(name));
    collection.remove(name);
    return new Ok(undefined);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes.**

Run:

```bash
npm run test -- --run src/journals/settings/lifecycle.test.ts
```

Expected: PASS (10 tests).

- [ ] **Step 5: Run lint + typecheck.**

```bash
npm run check:lint && npm run check:types
```

Expected: both pass.

- [ ] **Step 6: Commit.**

```bash
git add src/journals/settings/lifecycle.ts src/journals/settings/lifecycle.test.ts
git -c commit.gpgsign=false commit -m "feat(journals): JournalLifecycleService create/rename/delete"
```

---

## Task 3: `describe-write` helper

**Background.** Pure function returning the variant args for `m.journal_write(...)`. The dashboard row uses it to render the "writing daily" flair; the edit header uses it for the same purpose.

**Files:**

- Create: `src/journals/settings/describe-write.ts`
- Create: `src/journals/settings/describe-write.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `src/journals/settings/describe-write.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { describeWrite } from "./describe-write";

describe("describeWrite", () => {
  it("returns just the type for fixed writes", () => {
    expect(describeWrite({ type: "day" })).toEqual({ type: "day" });
    expect(describeWrite({ type: "week" })).toEqual({ type: "week" });
    expect(describeWrite({ type: "month" })).toEqual({ type: "month" });
    expect(describeWrite({ type: "quarter" })).toEqual({ type: "quarter" });
    expect(describeWrite({ type: "year" })).toEqual({ type: "year" });
  });

  it("includes every+duration for custom writes", () => {
    expect(describeWrite({ type: "custom", every: "week", duration: 3, anchorDate: "2024-01-01" as never })).toEqual({
      type: "custom",
      every: "week",
      duration: 3,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

Run:

```bash
npm run test -- --run src/journals/settings/describe-write.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/journals/settings/describe-write.ts`.**

```ts
import { match } from "ts-pattern";

import type { JournalWrite } from "@/journals";

export type WriteDescriptor =
  | { type: "day" | "week" | "month" | "quarter" | "year" }
  | { type: "custom"; every: "day" | "week" | "month" | "quarter" | "year"; duration: number };

export function describeWrite(write: JournalWrite): WriteDescriptor {
  return match(write)
    .with({ type: "custom" }, ({ every, duration }) => ({ type: "custom" as const, every, duration }))
    .otherwise(({ type }) => ({ type }));
}
```

- [ ] **Step 4: Run the test to verify it passes.**

Run:

```bash
npm run test -- --run src/journals/settings/describe-write.test.ts
```

Expected: PASS.

- [ ] **Step 5: Lint + typecheck + commit.**

```bash
npm run check:lint && npm run check:types
git add src/journals/settings/describe-write.ts src/journals/settings/describe-write.test.ts
git -c commit.gpgsign=false commit -m "feat(journals): describeWrite helper for write i18n"
```

---

## Task 4: `DateFormatPreview` component

**Background.** Tiny component that renders today's date formatted by `moment` through the v3 `Clock` boundary. `Clock.now().format(pattern)` is called inside a computed; no `moment` import here.

**Files:**

- Create: `src/journals/settings/ui/DateFormatPreview.vue`
- Create: `src/journals/settings/ui/DateFormatPreview.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `src/journals/settings/ui/DateFormatPreview.test.ts`:

```ts
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installTestCalendar } from "@/calendar/testing";

import DateFormatPreview from "./DateFormatPreview.vue";

describe("DateFormatPreview", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
    cleanup();
  });

  it("renders today's date formatted with the given pattern", () => {
    render(DateFormatPreview, { props: { format: "YYYY" } });
    expect(screen.getByText(/^\d{4}$/)).toBeTruthy();
  });

  it("renders custom delimiters in the pattern", () => {
    render(DateFormatPreview, { props: { format: "YYYY/MM" } });
    expect(screen.getByText(/^\d{4}\/\d{2}$/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

Run:

```bash
npm run test -- --run src/journals/settings/ui/DateFormatPreview.test.ts
```

Expected: FAIL — Vue component not found.

- [ ] **Step 3: Create `src/journals/settings/ui/DateFormatPreview.vue`.**

```vue
<script setup lang="ts">
import { computed } from "vue";

import { Clock } from "@/calendar";

const { format } = defineProps<{ format: string }>();

const rendered = computed(() => Clock.now().format(format));
</script>

<template>
  <span class="journal-date-format-preview">{{ rendered }}</span>
</template>
```

- [ ] **Step 4: Run the test to verify it passes.**

Run:

```bash
npm run test -- --run src/journals/settings/ui/DateFormatPreview.test.ts
```

Expected: PASS.

- [ ] **Step 5: Lint + typecheck + commit.**

```bash
npm run check:lint && npm run check:types
git add src/journals/settings/ui/DateFormatPreview.vue src/journals/settings/ui/DateFormatPreview.test.ts
git -c commit.gpgsign=false commit -m "feat(journals): DateFormatPreview component"
```

---

## Task 5: `AddJournalModal` + definition

**Background.** Modal collects `name` + `write` (with `every` / `duration` / `anchorDate` for custom). vee-validate + valibot. Uniqueness check pulls live from the reactive collection via `useService(SettingsService)`.

**Files:**

- Create: `src/journals/settings/ui/add-journal-modal.ts`
- Create: `src/journals/settings/ui/AddJournalModal.vue`
- Create: `src/journals/settings/ui/AddJournalModal.test.ts`

- [ ] **Step 1: Write the failing test for the definition.**

Create `src/journals/settings/ui/AddJournalModal.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { createSettingsService } from "@/settings/testing";

import AddJournalModal from "./AddJournalModal.vue";
import { addJournalModal } from "./add-journal-modal";

import type { ModalApi } from "@/infrastructure/host/modals/types";

interface Outcome {
  kind: "submit" | "cancel";
  value?: unknown;
}

async function mountWithApi(initial?: unknown): Promise<{ outcome: () => Outcome | undefined; container: Container }> {
  const { service: settings, container } = createSettingsService({
    collections: [journalConfigCollection],
    raw: initial ?? { version: 3, journals: {} },
  });
  await settings.initialize();
  let outcome: Outcome | undefined;
  const api: ModalApi<unknown> = {
    submit: (value) => {
      outcome = { kind: "submit", value };
    },
    cancel: () => {
      outcome = { kind: "cancel" };
    },
  };
  render(AddJournalModal, {
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
            provideModalApiOnApp(app, api);
          },
        },
      ],
    },
  });
  return { outcome: () => outcome, container };
}

afterEach(() => cleanup());

describe("addJournalModal definition", () => {
  it("uses the add-journal modal title", () => {
    expect(addJournalModal.title()).toBe(m.journal_add_modal_title());
  });
});

describe("AddJournalModal", () => {
  it("submits a fixed-write journal payload on save", async () => {
    const { outcome } = await mountWithApi();
    await userEvent.type(screen.getByLabelText(m.journal_add_modal_name_label()), "daily");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    expect(outcome()).toEqual({ kind: "submit", value: { name: "daily", write: { type: "day" } } });
  });

  it("submits a custom-write payload with every/duration/anchorDate", async () => {
    const { outcome } = await mountWithApi();
    await userEvent.type(screen.getByLabelText(m.journal_add_modal_name_label()), "sprints");
    await userEvent.selectOptions(screen.getByLabelText(m.journal_add_modal_write_label()), "custom");
    await userEvent.clear(screen.getByLabelText(m.journal_add_modal_duration_label()));
    await userEvent.type(screen.getByLabelText(m.journal_add_modal_duration_label()), "2");
    await userEvent.selectOptions(screen.getByLabelText(m.journal_add_modal_every_label()), "week");
    await userEvent.type(screen.getByLabelText(m.journal_add_modal_anchor_label()), "2024-01-01");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    expect(outcome()).toEqual({
      kind: "submit",
      value: {
        name: "sprints",
        write: { type: "custom", every: "week", duration: 2, anchorDate: "2024-01-01" },
      },
    });
  });

  it("blocks submission when name is empty", async () => {
    const { outcome } = await mountWithApi();
    await userEvent.click(screen.getByText(m.common_action_submit()));
    expect(screen.getByText(m.journal_name_required_error())).toBeTruthy();
    expect(outcome()).toBeUndefined();
  });

  it("blocks submission when name collides with an existing journal", async () => {
    const { outcome } = await mountWithApi({
      version: 3,
      journals: {
        daily: {
          name: "daily",
          write: { type: "day" },
          timeline: { start: "", end: { kind: "never" } },
          dateFormat: "YYYY-MM-DD",
          frontmatter: {
            dateField: "journal-date",
            startDateField: "journal-start-date",
            endDateField: "journal-end-date",
            addStartDate: false,
            addEndDate: false,
          },
          numbering: { enabled: false, anchorDate: "", allowBefore: false, sources: [] },
        },
      },
    });
    await userEvent.type(screen.getByLabelText(m.journal_add_modal_name_label()), "daily");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    expect(screen.getByText(m.journal_name_unique_error())).toBeTruthy();
    expect(outcome()).toBeUndefined();
  });

  it("blocks submission when anchor date is missing for custom write", async () => {
    const { outcome } = await mountWithApi();
    await userEvent.type(screen.getByLabelText(m.journal_add_modal_name_label()), "x");
    await userEvent.selectOptions(screen.getByLabelText(m.journal_add_modal_write_label()), "custom");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    expect(screen.getByText(m.journal_anchor_format_error())).toBeTruthy();
    expect(outcome()).toBeUndefined();
  });

  it("cancels when the user clicks Cancel", async () => {
    const { outcome } = await mountWithApi();
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(outcome()).toEqual({ kind: "cancel" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

Run:

```bash
npm run test -- --run src/journals/settings/ui/AddJournalModal.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/journals/settings/ui/add-journal-modal.ts`.**

```ts
import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";
import type { JournalWrite } from "@/journals";

import AddJournalModal from "./AddJournalModal.vue";

import type { Component } from "vue";

export const addJournalModal = defineModal<void, { name: string; write: JournalWrite }>({
  component: AddJournalModal as Component,
  title: () => m.journal_add_modal_title(),
});
```

- [ ] **Step 4: Create `src/journals/settings/ui/AddJournalModal.vue`.**

```vue
<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/valibot";
import { useForm } from "vee-validate";
import * as v from "valibot";
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModalApi } from "@/infrastructure/host/modals";
import { journalConfigCollection, type JournalWrite } from "@/journals";
import { SettingsService } from "@/settings";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

const api = useModalApi<{ name: string; write: JournalWrite }>();
const settings = useService(SettingsService);
const collection = computed(() => settings.getCollection(journalConfigCollection));

const anchorRegex = /^\d{4}-\d{2}-\d{2}$/;

const { defineField, errorBag, handleSubmit, values } = useForm({
  initialValues: {
    name: "",
    type: "day" as JournalWrite["type"],
    every: "day" as Exclude<JournalWrite["type"], "custom">,
    duration: 1,
    anchorDate: "",
  },
  validationSchema: toTypedSchema(
    v.pipe(
      v.object({
        name: v.pipe(
          v.string(),
          v.nonEmpty(m.journal_name_required_error()),
          v.check(
            (value) => value.length === 0 || collection.value.get(value) === undefined,
            m.journal_name_unique_error(),
          ),
        ),
        type: v.picklist(["day", "week", "month", "quarter", "year", "custom"]),
        every: v.picklist(["day", "week", "month", "quarter", "year"]),
        duration: v.pipe(v.number(), v.integer(), v.minValue(1)),
        anchorDate: v.string(),
      }),
      v.forward(
        v.partialCheck(
          [["type"], ["anchorDate"]],
          ({ type, anchorDate }) => (type === "custom" ? anchorRegex.test(anchorDate) : true),
          m.journal_anchor_format_error(),
        ),
        ["anchorDate"],
      ),
    ),
  ),
});

const [name, nameAttrs] = defineField("name");
const [type, typeAttrs] = defineField("type");
const [every, everyAttrs] = defineField("every");
const [duration, durationAttrs] = defineField("duration");
const [anchorDate, anchorDateAttrs] = defineField("anchorDate");

const isCustom = computed(() => values.type === "custom");

const onSubmit = handleSubmit((vs) => {
  const write: JournalWrite =
    vs.type === "custom"
      ? { type: "custom", every: vs.every, duration: vs.duration, anchorDate: vs.anchorDate as never }
      : { type: vs.type };
  api.submit({ name: vs.name, write });
});
</script>

<template>
  <form @submit.prevent="onSubmit">
    <UiSettingRow :name="m.journal_add_modal_name_label()">
      <template #description>
        <span v-for="error of errorBag.name" :key="error" class="journal-form-error">{{ error }}</span>
      </template>
      <UiTextInput v-model="name" v-bind="nameAttrs" />
    </UiSettingRow>
    <UiSettingRow :name="m.journal_add_modal_write_label()">
      <UiDropdown v-model="type" v-bind="typeAttrs">
        <option value="day">{{ m.journal_write({ type: "day" }) }}</option>
        <option value="week">{{ m.journal_write({ type: "week" }) }}</option>
        <option value="month">{{ m.journal_write({ type: "month" }) }}</option>
        <option value="quarter">{{ m.journal_write({ type: "quarter" }) }}</option>
        <option value="year">{{ m.journal_write({ type: "year" }) }}</option>
        <option value="custom">custom</option>
      </UiDropdown>
    </UiSettingRow>
    <UiSettingRow v-if="isCustom" :name="m.journal_add_modal_duration_label()">
      <UiNumberInput v-model="duration" v-bind="durationAttrs" :min="1" />
    </UiSettingRow>
    <UiSettingRow v-if="isCustom" :name="m.journal_add_modal_every_label()">
      <UiDropdown v-model="every" v-bind="everyAttrs">
        <option value="day">day</option>
        <option value="week">week</option>
        <option value="month">month</option>
        <option value="quarter">quarter</option>
        <option value="year">year</option>
      </UiDropdown>
    </UiSettingRow>
    <UiSettingRow v-if="isCustom" :name="m.journal_add_modal_anchor_label()">
      <template #description>
        <div>{{ m.journal_add_modal_anchor_description() }}</div>
        <span v-for="error of errorBag.anchorDate" :key="error" class="journal-form-error">{{ error }}</span>
      </template>
      <UiTextInput v-model="anchorDate" v-bind="anchorDateAttrs" placeholder="YYYY-MM-DD" />
    </UiSettingRow>
    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta type="submit">{{ m.common_action_submit() }}</UiButton>
    </UiSettingRow>
  </form>
</template>

<style scoped>
.journal-form-error {
  color: var(--text-error);
  display: block;
}
</style>
```

- [ ] **Step 5: Run the test to verify it passes.**

Run:

```bash
npm run test -- --run src/journals/settings/ui/AddJournalModal.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 6: Lint + typecheck + commit.**

```bash
npm run check:lint && npm run check:types
git add src/journals/settings/ui/AddJournalModal.vue src/journals/settings/ui/add-journal-modal.ts src/journals/settings/ui/AddJournalModal.test.ts
git -c commit.gpgsign=false commit -m "feat(journals): AddJournalModal definition + component"
```

---

## Task 6: `RenameJournalModal` + definition

**Files:**

- Create: `src/journals/settings/ui/rename-journal-modal.ts`
- Create: `src/journals/settings/ui/RenameJournalModal.vue`
- Create: `src/journals/settings/ui/RenameJournalModal.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `src/journals/settings/ui/RenameJournalModal.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { createSettingsService } from "@/settings/testing";

import RenameJournalModal from "./RenameJournalModal.vue";
import { renameJournalModal } from "./rename-journal-modal";

import type { ModalApi } from "@/infrastructure/host/modals/types";

interface Outcome {
  kind: "submit" | "cancel";
  value?: unknown;
}

async function mountWithApi(currentName: string, initial?: unknown) {
  const { service: settings, container } = createSettingsService({
    collections: [journalConfigCollection],
    raw: initial ?? { version: 3, journals: { [currentName]: makeConfig(currentName) } },
  });
  await settings.initialize();
  let outcome: Outcome | undefined;
  const api: ModalApi<unknown> = {
    submit: (value) => {
      outcome = { kind: "submit", value };
    },
    cancel: () => {
      outcome = { kind: "cancel" };
    },
  };
  render(RenameJournalModal, {
    props: { currentName },
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
            provideModalApiOnApp(app, api);
          },
        },
      ],
    },
  });
  return { outcome: () => outcome, container };
}

function makeConfig(name: string) {
  return {
    name,
    write: { type: "day" as const },
    timeline: { start: "", end: { kind: "never" as const } },
    dateFormat: "YYYY-MM-DD",
    frontmatter: {
      dateField: "journal-date",
      startDateField: "journal-start-date",
      endDateField: "journal-end-date",
      addStartDate: false,
      addEndDate: false,
    },
    numbering: { enabled: false, anchorDate: "", allowBefore: false, sources: [] },
  };
}

afterEach(() => cleanup());

describe("renameJournalModal definition", () => {
  it("uses the rename title with the current name", () => {
    expect(renameJournalModal.title({ currentName: "daily" })).toBe(m.journal_rename_modal_title({ name: "daily" }));
  });
});

describe("RenameJournalModal", () => {
  it("submits the new name", async () => {
    const { outcome } = await mountWithApi("daily");
    await userEvent.clear(screen.getByLabelText(m.journal_rename_modal_new_label()));
    await userEvent.type(screen.getByLabelText(m.journal_rename_modal_new_label()), "morning");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    expect(outcome()).toEqual({ kind: "submit", value: { newName: "morning" } });
  });

  it("blocks submission when new name equals current", async () => {
    const { outcome } = await mountWithApi("daily");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    expect(screen.getByText(m.journal_rename_modal_same_as_current_error())).toBeTruthy();
    expect(outcome()).toBeUndefined();
  });

  it("blocks submission when new name collides with another journal", async () => {
    const initial = {
      version: 3,
      journals: { daily: makeConfig("daily"), morning: makeConfig("morning") },
    };
    const { outcome } = await mountWithApi("daily", initial);
    await userEvent.clear(screen.getByLabelText(m.journal_rename_modal_new_label()));
    await userEvent.type(screen.getByLabelText(m.journal_rename_modal_new_label()), "morning");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    expect(screen.getByText(m.journal_name_unique_error())).toBeTruthy();
    expect(outcome()).toBeUndefined();
  });

  it("blocks submission when new name is empty", async () => {
    const { outcome } = await mountWithApi("daily");
    await userEvent.clear(screen.getByLabelText(m.journal_rename_modal_new_label()));
    await userEvent.click(screen.getByText(m.common_action_submit()));
    expect(screen.getByText(m.journal_name_required_error())).toBeTruthy();
    expect(outcome()).toBeUndefined();
  });

  it("renders the notes-not-rewritten hint", async () => {
    await mountWithApi("daily");
    expect(screen.getByText(m.journal_notes_not_rewritten_hint())).toBeTruthy();
  });

  it("cancels when the user clicks Cancel", async () => {
    const { outcome } = await mountWithApi("daily");
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(outcome()).toEqual({ kind: "cancel" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

```bash
npm run test -- --run src/journals/settings/ui/RenameJournalModal.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `src/journals/settings/ui/rename-journal-modal.ts`.**

```ts
import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import RenameJournalModal from "./RenameJournalModal.vue";

import type { Component } from "vue";

export const renameJournalModal = defineModal<{ currentName: string }, { newName: string }>({
  component: RenameJournalModal as Component,
  title: ({ currentName }) => m.journal_rename_modal_title({ name: currentName }),
});
```

- [ ] **Step 4: Create `src/journals/settings/ui/RenameJournalModal.vue`.**

```vue
<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/valibot";
import { useForm } from "vee-validate";
import * as v from "valibot";
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModalApi } from "@/infrastructure/host/modals";
import { journalConfigCollection } from "@/journals";
import { SettingsService } from "@/settings";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

const { currentName } = defineProps<{ currentName: string }>();
const api = useModalApi<{ newName: string }>();
const settings = useService(SettingsService);
const collection = computed(() => settings.getCollection(journalConfigCollection));

const { defineField, errorBag, handleSubmit } = useForm({
  initialValues: { newName: currentName },
  validationSchema: toTypedSchema(
    v.object({
      newName: v.pipe(
        v.string(),
        v.nonEmpty(m.journal_name_required_error()),
        v.check((value) => value !== currentName, m.journal_rename_modal_same_as_current_error()),
        v.check(
          (value) => value === "" || value === currentName || collection.value.get(value) === undefined,
          m.journal_name_unique_error(),
        ),
      ),
    }),
  ),
});

const [newName, newNameAttrs] = defineField("newName");

const onSubmit = handleSubmit((vs) => {
  api.submit({ newName: vs.newName });
});
</script>

<template>
  <form @submit.prevent="onSubmit">
    <UiSettingRow :name="m.journal_rename_modal_new_label()">
      <template #description>
        <div>{{ m.journal_notes_not_rewritten_hint() }}</div>
        <span v-for="error of errorBag.newName" :key="error" class="journal-form-error">{{ error }}</span>
      </template>
      <UiTextInput v-model="newName" v-bind="newNameAttrs" />
    </UiSettingRow>
    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta type="submit">{{ m.common_action_submit() }}</UiButton>
    </UiSettingRow>
  </form>
</template>

<style scoped>
.journal-form-error {
  color: var(--text-error);
  display: block;
}
</style>
```

- [ ] **Step 5: Run the test to verify it passes.**

```bash
npm run test -- --run src/journals/settings/ui/RenameJournalModal.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 6: Lint + typecheck + commit.**

```bash
npm run check:lint && npm run check:types
git add src/journals/settings/ui/RenameJournalModal.vue src/journals/settings/ui/rename-journal-modal.ts src/journals/settings/ui/RenameJournalModal.test.ts
git -c commit.gpgsign=false commit -m "feat(journals): RenameJournalModal definition + component"
```

---

## Task 7: `DeleteJournalModal` + definition

**Background.** Dropdown over `keep | clear | delete`. `clear` and `delete` are rendered with `disabled`; selected value always lands on `keep`. Hint message clarifies that only `keep` is wired.

**Files:**

- Create: `src/journals/settings/ui/delete-journal-modal.ts`
- Create: `src/journals/settings/ui/DeleteJournalModal.vue`
- Create: `src/journals/settings/ui/DeleteJournalModal.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `src/journals/settings/ui/DeleteJournalModal.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";

import DeleteJournalModal from "./DeleteJournalModal.vue";
import { deleteJournalModal } from "./delete-journal-modal";

import type { ModalApi } from "@/infrastructure/host/modals/types";

interface Outcome {
  kind: "submit" | "cancel";
  value?: unknown;
}

function mountWithApi(journalName: string) {
  let outcome: Outcome | undefined;
  const api: ModalApi<unknown> = {
    submit: (value) => {
      outcome = { kind: "submit", value };
    },
    cancel: () => {
      outcome = { kind: "cancel" };
    },
  };
  render(DeleteJournalModal, {
    props: { journalName },
    global: {
      plugins: [
        {
          install(app) {
            provideModalApiOnApp(app, api);
          },
        },
      ],
    },
  });
  return { outcome: () => outcome };
}

afterEach(() => cleanup());

describe("deleteJournalModal definition", () => {
  it("uses the delete title with the journal name", () => {
    expect(deleteJournalModal.title({ journalName: "daily" })).toBe(m.journal_delete_modal_title({ name: "daily" }));
  });
});

describe("DeleteJournalModal", () => {
  it("submits with mode keep", async () => {
    const { outcome } = mountWithApi("daily");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    expect(outcome()).toEqual({ kind: "submit", value: { mode: "keep" } });
  });

  it("renders the not-implemented hint", () => {
    mountWithApi("daily");
    expect(screen.getByText(m.journal_delete_mode_not_implemented_hint())).toBeTruthy();
  });

  it("renders clear and delete options as disabled", () => {
    mountWithApi("daily");
    const clearOption = screen.getByText(m.journal_delete_mode_option({ mode: "clear" })) as HTMLOptionElement;
    const deleteOption = screen.getByText(m.journal_delete_mode_option({ mode: "delete" })) as HTMLOptionElement;
    expect(clearOption.disabled).toBe(true);
    expect(deleteOption.disabled).toBe(true);
  });

  it("cancels when the user clicks Cancel", async () => {
    const { outcome } = mountWithApi("daily");
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(outcome()).toEqual({ kind: "cancel" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

```bash
npm run test -- --run src/journals/settings/ui/DeleteJournalModal.test.ts
```

- [ ] **Step 3: Create `src/journals/settings/ui/delete-journal-modal.ts`.**

```ts
import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import DeleteJournalModal from "./DeleteJournalModal.vue";

import type { Component } from "vue";

export const deleteJournalModal = defineModal<{ journalName: string }, { mode: "keep" }>({
  component: DeleteJournalModal as Component,
  title: ({ journalName }) => m.journal_delete_modal_title({ name: journalName }),
});
```

- [ ] **Step 4: Create `src/journals/settings/ui/DeleteJournalModal.vue`.**

```vue
<script setup lang="ts">
import { ref } from "vue";

import { m } from "@/i18n";
import { useModalApi } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

defineProps<{ journalName: string }>();

const api = useModalApi<{ mode: "keep" }>();
const mode = ref<"keep">("keep");

function submit(): void {
  api.submit({ mode: mode.value });
}
</script>

<template>
  <UiSettingRow :name="m.journal_delete_mode_label()">
    <template #description>{{ m.journal_delete_mode_not_implemented_hint() }}</template>
    <UiDropdown v-model="mode">
      <option value="keep">{{ m.journal_delete_mode_option({ mode: "keep" }) }}</option>
      <option value="clear" disabled>{{ m.journal_delete_mode_option({ mode: "clear" }) }}</option>
      <option value="delete" disabled>{{ m.journal_delete_mode_option({ mode: "delete" }) }}</option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow controls-only>
    <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
    <UiButton cta @click="submit">{{ m.common_action_submit() }}</UiButton>
  </UiSettingRow>
</template>
```

- [ ] **Step 5: Run the test to verify it passes.**

```bash
npm run test -- --run src/journals/settings/ui/DeleteJournalModal.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 6: Lint + typecheck + commit.**

```bash
npm run check:lint && npm run check:types
git add src/journals/settings/ui/DeleteJournalModal.vue src/journals/settings/ui/delete-journal-modal.ts src/journals/settings/ui/DeleteJournalModal.test.ts
git -c commit.gpgsign=false commit -m "feat(journals): DeleteJournalModal with keep/clear/delete dropdown"
```

---

## Task 8: `EditFrontmatterFieldModal` + definition

**Background.** Edits one of `dateField | startDateField | endDateField` on `config.frontmatter`. Title is a variant on `fieldName`. Read-only current value, single text input. Does not touch existing notes.

**Files:**

- Create: `src/journals/settings/ui/edit-frontmatter-field-modal.ts`
- Create: `src/journals/settings/ui/EditFrontmatterFieldModal.vue`
- Create: `src/journals/settings/ui/EditFrontmatterFieldModal.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `src/journals/settings/ui/EditFrontmatterFieldModal.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { createSettingsService } from "@/settings/testing";

import EditFrontmatterFieldModal from "./EditFrontmatterFieldModal.vue";
import { editFrontmatterFieldModal } from "./edit-frontmatter-field-modal";

import type { ModalApi } from "@/infrastructure/host/modals/types";

interface Outcome {
  kind: "submit" | "cancel";
  value?: unknown;
}

function makeConfig(
  name: string,
  frontmatter: Partial<{ dateField: string; startDateField: string; endDateField: string }>,
) {
  return {
    name,
    write: { type: "day" as const },
    timeline: { start: "", end: { kind: "never" as const } },
    dateFormat: "YYYY-MM-DD",
    frontmatter: {
      dateField: "journal-date",
      startDateField: "journal-start-date",
      endDateField: "journal-end-date",
      addStartDate: false,
      addEndDate: false,
      ...frontmatter,
    },
    numbering: { enabled: false, anchorDate: "", allowBefore: false, sources: [] },
  };
}

async function mountWithApi(
  journalName: string,
  fieldName: "dateField" | "startDateField" | "endDateField",
  fmOverride: Partial<{ dateField: string; startDateField: string; endDateField: string }> = {},
) {
  const raw = { version: 3, journals: { [journalName]: makeConfig(journalName, fmOverride) } };
  const { service: settings, container } = createSettingsService({ collections: [journalConfigCollection], raw });
  await settings.initialize();
  let outcome: Outcome | undefined;
  const api: ModalApi<unknown> = {
    submit: (value) => {
      outcome = { kind: "submit", value };
    },
    cancel: () => {
      outcome = { kind: "cancel" };
    },
  };
  render(EditFrontmatterFieldModal, {
    props: { journalName, fieldName },
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
            provideModalApiOnApp(app, api);
          },
        },
      ],
    },
  });
  return { outcome: () => outcome };
}

afterEach(() => cleanup());

describe("editFrontmatterFieldModal definition", () => {
  it("uses the per-field title", () => {
    expect(editFrontmatterFieldModal.title({ journalName: "daily", fieldName: "dateField" })).toBe(
      m.journal_fm_field_modal_title({ field: "dateField" }),
    );
  });
});

describe("EditFrontmatterFieldModal", () => {
  it("renders the current value", async () => {
    await mountWithApi("daily", "dateField", { dateField: "my-date" });
    expect(screen.getByText("my-date")).toBeTruthy();
  });

  it("submits the new value", async () => {
    const { outcome } = await mountWithApi("daily", "dateField");
    await userEvent.clear(screen.getByLabelText(m.journal_property_modal_new_label()));
    await userEvent.type(screen.getByLabelText(m.journal_property_modal_new_label()), "occurred-on");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    expect(outcome()).toEqual({ kind: "submit", value: { newValue: "occurred-on" } });
  });

  it("blocks submission when new value is empty", async () => {
    const { outcome } = await mountWithApi("daily", "dateField");
    await userEvent.clear(screen.getByLabelText(m.journal_property_modal_new_label()));
    await userEvent.click(screen.getByText(m.common_action_submit()));
    expect(screen.getByText(m.journal_property_name_required())).toBeTruthy();
    expect(outcome()).toBeUndefined();
  });

  it("cancels when the user clicks Cancel", async () => {
    const { outcome } = await mountWithApi("daily", "dateField");
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(outcome()).toEqual({ kind: "cancel" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

```bash
npm run test -- --run src/journals/settings/ui/EditFrontmatterFieldModal.test.ts
```

- [ ] **Step 3: Create `src/journals/settings/ui/edit-frontmatter-field-modal.ts`.**

```ts
import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import EditFrontmatterFieldModal from "./EditFrontmatterFieldModal.vue";

import type { Component } from "vue";

export type FrontmatterFieldName = "dateField" | "startDateField" | "endDateField";

export const editFrontmatterFieldModal = defineModal<
  { journalName: string; fieldName: FrontmatterFieldName },
  { newValue: string }
>({
  component: EditFrontmatterFieldModal as Component,
  title: ({ fieldName }) => m.journal_fm_field_modal_title({ field: fieldName }),
});
```

- [ ] **Step 4: Create `src/journals/settings/ui/EditFrontmatterFieldModal.vue`.**

```vue
<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/valibot";
import { useForm } from "vee-validate";
import * as v from "valibot";
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModalApi } from "@/infrastructure/host/modals";
import { journalConfigCollection } from "@/journals";
import { SettingsService } from "@/settings";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

import type { FrontmatterFieldName } from "./edit-frontmatter-field-modal";

const { journalName, fieldName } = defineProps<{ journalName: string; fieldName: FrontmatterFieldName }>();
const api = useModalApi<{ newValue: string }>();
const settings = useService(SettingsService);
const currentValue = computed(() => {
  const config = settings.getCollection(journalConfigCollection).get(journalName);
  return (config?.frontmatter[fieldName] as string | undefined) ?? "";
});

const { defineField, errorBag, handleSubmit } = useForm({
  initialValues: { newValue: currentValue.value },
  validationSchema: toTypedSchema(
    v.object({ newValue: v.pipe(v.string(), v.nonEmpty(m.journal_property_name_required())) }),
  ),
});

const [newValue, newValueAttrs] = defineField("newValue");

const onSubmit = handleSubmit((vs) => api.submit({ newValue: vs.newValue }));
</script>

<template>
  <form @submit.prevent="onSubmit">
    <UiSettingRow :name="m.journal_property_modal_current_label()">{{ currentValue }}</UiSettingRow>
    <UiSettingRow :name="m.journal_property_modal_new_label()">
      <template #description>
        <div>{{ m.journal_notes_not_rewritten_hint() }}</div>
        <span v-for="error of errorBag.newValue" :key="error" class="journal-form-error">{{ error }}</span>
      </template>
      <UiTextInput v-model="newValue" v-bind="newValueAttrs" />
    </UiSettingRow>
    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta type="submit">{{ m.common_action_submit() }}</UiButton>
    </UiSettingRow>
  </form>
</template>

<style scoped>
.journal-form-error {
  color: var(--text-error);
  display: block;
}
</style>
```

- [ ] **Step 5: Run the test to verify it passes.**

```bash
npm run test -- --run src/journals/settings/ui/EditFrontmatterFieldModal.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 6: Lint + typecheck + commit.**

```bash
npm run check:lint && npm run check:types
git add src/journals/settings/ui/EditFrontmatterFieldModal.vue src/journals/settings/ui/edit-frontmatter-field-modal.ts src/journals/settings/ui/EditFrontmatterFieldModal.test.ts
git -c commit.gpgsign=false commit -m "feat(journals): EditFrontmatterFieldModal definition + component"
```

---

## Task 9: `EditSequencePropertyModal` + definition

**Background.** Edits `numbering.sources[sourceIndex].frontmatterKey`. Separate from the frontmatter-field modal so multi-source UI expansion is localized here.

**Files:**

- Create: `src/journals/settings/ui/edit-sequence-property-modal.ts`
- Create: `src/journals/settings/ui/EditSequencePropertyModal.vue`
- Create: `src/journals/settings/ui/EditSequencePropertyModal.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `src/journals/settings/ui/EditSequencePropertyModal.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { createSettingsService } from "@/settings/testing";

import EditSequencePropertyModal from "./EditSequencePropertyModal.vue";
import { editSequencePropertyModal } from "./edit-sequence-property-modal";

import type { ModalApi } from "@/infrastructure/host/modals/types";

interface Outcome {
  kind: "submit" | "cancel";
  value?: unknown;
}

function makeConfig(name: string, frontmatterKey = "journal-index") {
  return {
    name,
    write: { type: "day" as const },
    timeline: { start: "", end: { kind: "never" as const } },
    dateFormat: "YYYY-MM-DD",
    frontmatter: {
      dateField: "journal-date",
      startDateField: "journal-start-date",
      endDateField: "journal-end-date",
      addStartDate: false,
      addEndDate: false,
    },
    numbering: {
      enabled: true,
      anchorDate: "",
      allowBefore: false,
      sources: [{ variable: "index", frontmatterKey, anchorValue: 1, reset: { kind: "never" as const } }],
    },
  };
}

async function mountWithApi(journalName: string, sourceIndex = 0, frontmatterKey = "journal-index") {
  const raw = { version: 3, journals: { [journalName]: makeConfig(journalName, frontmatterKey) } };
  const { service: settings, container } = createSettingsService({ collections: [journalConfigCollection], raw });
  await settings.initialize();
  let outcome: Outcome | undefined;
  const api: ModalApi<unknown> = {
    submit: (value) => {
      outcome = { kind: "submit", value };
    },
    cancel: () => {
      outcome = { kind: "cancel" };
    },
  };
  render(EditSequencePropertyModal, {
    props: { journalName, sourceIndex },
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
            provideModalApiOnApp(app, api);
          },
        },
      ],
    },
  });
  return { outcome: () => outcome };
}

afterEach(() => cleanup());

describe("editSequencePropertyModal definition", () => {
  it("uses the sequence property title", () => {
    expect(editSequencePropertyModal.title({ journalName: "daily", sourceIndex: 0 })).toBe(
      m.journal_sequence_property_modal_title(),
    );
  });
});

describe("EditSequencePropertyModal", () => {
  it("renders the current frontmatterKey", async () => {
    await mountWithApi("daily", 0, "sprint-no");
    expect(screen.getByText("sprint-no")).toBeTruthy();
  });

  it("submits the new value", async () => {
    const { outcome } = await mountWithApi("daily");
    await userEvent.clear(screen.getByLabelText(m.journal_property_modal_new_label()));
    await userEvent.type(screen.getByLabelText(m.journal_property_modal_new_label()), "n");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    expect(outcome()).toEqual({ kind: "submit", value: { newValue: "n" } });
  });

  it("blocks submission when new value is empty", async () => {
    const { outcome } = await mountWithApi("daily");
    await userEvent.clear(screen.getByLabelText(m.journal_property_modal_new_label()));
    await userEvent.click(screen.getByText(m.common_action_submit()));
    expect(screen.getByText(m.journal_property_name_required())).toBeTruthy();
    expect(outcome()).toBeUndefined();
  });

  it("cancels when the user clicks Cancel", async () => {
    const { outcome } = await mountWithApi("daily");
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(outcome()).toEqual({ kind: "cancel" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

```bash
npm run test -- --run src/journals/settings/ui/EditSequencePropertyModal.test.ts
```

- [ ] **Step 3: Create `src/journals/settings/ui/edit-sequence-property-modal.ts`.**

```ts
import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import EditSequencePropertyModal from "./EditSequencePropertyModal.vue";

import type { Component } from "vue";

export const editSequencePropertyModal = defineModal<
  { journalName: string; sourceIndex: number },
  { newValue: string }
>({
  component: EditSequencePropertyModal as Component,
  title: () => m.journal_sequence_property_modal_title(),
});
```

- [ ] **Step 4: Create `src/journals/settings/ui/EditSequencePropertyModal.vue`.**

```vue
<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/valibot";
import { useForm } from "vee-validate";
import * as v from "valibot";
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModalApi } from "@/infrastructure/host/modals";
import { journalConfigCollection } from "@/journals";
import { SettingsService } from "@/settings";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

const { journalName, sourceIndex } = defineProps<{ journalName: string; sourceIndex: number }>();
const api = useModalApi<{ newValue: string }>();
const settings = useService(SettingsService);
const currentValue = computed(() => {
  const config = settings.getCollection(journalConfigCollection).get(journalName);
  return config?.numbering.sources[sourceIndex]?.frontmatterKey ?? "";
});

const { defineField, errorBag, handleSubmit } = useForm({
  initialValues: { newValue: currentValue.value },
  validationSchema: toTypedSchema(
    v.object({ newValue: v.pipe(v.string(), v.nonEmpty(m.journal_property_name_required())) }),
  ),
});

const [newValue, newValueAttrs] = defineField("newValue");

const onSubmit = handleSubmit((vs) => api.submit({ newValue: vs.newValue }));
</script>

<template>
  <form @submit.prevent="onSubmit">
    <UiSettingRow :name="m.journal_property_modal_current_label()">{{ currentValue }}</UiSettingRow>
    <UiSettingRow :name="m.journal_property_modal_new_label()">
      <template #description>
        <div>{{ m.journal_notes_not_rewritten_hint() }}</div>
        <span v-for="error of errorBag.newValue" :key="error" class="journal-form-error">{{ error }}</span>
      </template>
      <UiTextInput v-model="newValue" v-bind="newValueAttrs" />
    </UiSettingRow>
    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta type="submit">{{ m.common_action_submit() }}</UiButton>
    </UiSettingRow>
  </form>
</template>

<style scoped>
.journal-form-error {
  color: var(--text-error);
  display: block;
}
</style>
```

- [ ] **Step 5: Run the test to verify it passes.**

```bash
npm run test -- --run src/journals/settings/ui/EditSequencePropertyModal.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 6: Lint + typecheck + commit.**

```bash
npm run check:lint && npm run check:types
git add src/journals/settings/ui/EditSequencePropertyModal.vue src/journals/settings/ui/edit-sequence-property-modal.ts src/journals/settings/ui/EditSequencePropertyModal.test.ts
git -c commit.gpgsign=false commit -m "feat(journals): EditSequencePropertyModal for numbering frontmatter key"
```

---

## Task 10: `AddJournalFlow`

**Background.** Opens the add modal, calls `lifecycle.create`, pushes the edit subpage. Composed with `attempt.in(this, async function* () { … })`. The subpage `defineSubpage` is in task 15 — to keep this task's tests local, we stub it: until Task 15 lands, the flow imports a placeholder symbol that resolves later. To avoid the cycle, define a tiny `journals-subpage.ts` shell here first (Task 15 fills out the Vue component).

**Files:**

- Create: `src/journals/settings/ui/journals-subpage.ts` (shell)
- Create: `src/journals/settings/flows/add-journal.flow.ts`
- Create: `src/journals/settings/flows/add-journal.flow.test.ts`

- [ ] **Step 1: Create the subpage shell.**

`src/journals/settings/ui/journals-subpage.ts`:

```ts
import { defineSubpage } from "@/settings";
import { defineAsyncComponent } from "vue";

const JournalEditSubpage = defineAsyncComponent(() => import("./JournalEditSubpage.vue"));

export const journalEditSubpage = defineSubpage<{ journalName: string }>({
  key: "journal-edit",
  component: JournalEditSubpage,
});
```

Until Task 15 creates `JournalEditSubpage.vue`, attempting to mount the subpage will fail at runtime — but the flow tests stub `SettingsUiService.push` so they never actually resolve the component. The async import is sufficient to satisfy module resolution.

- [ ] **Step 2: Write the failing test.**

Create `src/journals/settings/flows/add-journal.flow.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { Container } from "@/infrastructure/di";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { LoggerFactoryToken, LoggerFactory, LogSinkMultiToken } from "@/infrastructure/logger";
import { MemorySink } from "@/infrastructure/logger/testing";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { SettingsService, SettingsUiService } from "@/settings";
import { createSettingsService } from "@/settings/testing";

import { JournalLifecycleService } from "../lifecycle";
import { JournalNameTakenError, JournalLifecycleFlowError } from "../errors";
import { addJournalModal } from "../ui/add-journal-modal";
import { journalEditSubpage } from "../ui/journals-subpage";

import { AddJournalFlow } from "./add-journal.flow";

async function build() {
  const { service: settings, container } = createSettingsService({ collections: [journalConfigCollection] });
  await settings.initialize();
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(LogSinkMultiToken).useValue(new MemorySink());
  container.register(LoggerFactoryToken).useClass(LoggerFactory);
  container.register(SettingsUiService).useClass(SettingsUiService);
  container.register(JournalLifecycleService).useClass(JournalLifecycleService);
  container.register(Flows).useClass(Flows);
  container.register(AddJournalFlow).useClass(AddJournalFlow);
  return { container, settings, modals, flows: container.resolve(Flows), ui: container.resolve(SettingsUiService) };
}

describe("AddJournalFlow", () => {
  it("creates the journal and pushes the edit subpage on submit", async () => {
    const { flows, modals, ui, settings } = await build();
    const promise = flows.invoke(AddJournalFlow, undefined);
    modals.lastOpen<void, { name: string; write: { type: "day" } }>().submit({ name: "daily", write: { type: "day" } });
    const result = await promise;
    expect(result.kind).toBe("ok");
    expect(result.kind === "ok" && result.value).toEqual({ name: "daily" });
    expect(settings.getCollection(journalConfigCollection).get("daily")).toBeDefined();
    expect(ui.current.value?.subpage.key).toBe("journal-edit");
    expect(ui.current.value?.props).toEqual({ journalName: "daily" });
  });

  it("emits UserAborted('add-journal-modal') when the user cancels", async () => {
    const { flows, modals } = await build();
    const promise = flows.invoke(AddJournalFlow, undefined);
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind).toBe("err");
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(result.kind === "err" && (result.error as UserAborted).source).toBe("add-journal-modal");
  });

  it("maps a lifecycle error to JournalLifecycleFlowError", async () => {
    const { flows, modals, settings } = await build();
    settings
      .getCollection(journalConfigCollection)
      .add("daily", {
        name: "daily",
        write: { type: "day" },
        timeline: { start: "", end: { kind: "never" } },
        dateFormat: "YYYY-MM-DD",
        frontmatter: {
          dateField: "journal-date",
          startDateField: "journal-start-date",
          endDateField: "journal-end-date",
          addStartDate: false,
          addEndDate: false,
        },
        numbering: { enabled: false, anchorDate: "", allowBefore: false, sources: [] },
      } as never);
    const promise = flows.invoke(AddJournalFlow, undefined);
    modals.lastOpen<void, { name: string; write: { type: "day" } }>().submit({ name: "daily", write: { type: "day" } });
    const result = await promise;
    expect(result.kind).toBe("err");
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalLifecycleFlowError);
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      JournalNameTakenError,
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it fails.**

```bash
npm run test -- --run src/journals/settings/flows/add-journal.flow.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Create `src/journals/settings/flows/add-journal.flow.ts`.**

```ts
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";
import { SettingsUiService } from "@/settings";

import { toFlowError } from "../errors";
import { JournalLifecycleService } from "../lifecycle";
import { addJournalModal } from "../ui/add-journal-modal";
import { journalEditSubpage } from "../ui/journals-subpage";

export class AddJournalFlow implements Flow<void, { name: string }, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #lifecycle = inject(JournalLifecycleService);
  readonly #ui = inject(SettingsUiService);

  execute(): AsyncResult<{ name: string }, FlowError> {
    return attempt.in(this, async function* () {
      const submitted = yield* this.#modals
        .open(addJournalModal, undefined)
        .mapErr(() => new UserAborted("add-journal-modal"));
      yield* this.#lifecycle.create(submitted.name, submitted.write).mapErr(toFlowError);
      this.#ui.push(journalEditSubpage, { journalName: submitted.name });
      return { name: submitted.name };
    });
  }
}
```

- [ ] **Step 5: Run the test to verify it passes.**

```bash
npm run test -- --run src/journals/settings/flows/add-journal.flow.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 6: Lint + typecheck + commit.**

```bash
npm run check:lint && npm run check:types
git add src/journals/settings/ui/journals-subpage.ts src/journals/settings/flows/add-journal.flow.ts src/journals/settings/flows/add-journal.flow.test.ts
git -c commit.gpgsign=false commit -m "feat(journals): AddJournalFlow + edit-subpage shell"
```

---

## Task 11: `RenameJournalFlow`

**Files:**

- Create: `src/journals/settings/flows/rename-journal.flow.ts`
- Create: `src/journals/settings/flows/rename-journal.flow.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `src/journals/settings/flows/rename-journal.flow.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { LoggerFactoryToken, LoggerFactory, LogSinkMultiToken } from "@/infrastructure/logger";
import { MemorySink } from "@/infrastructure/logger/testing";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { SettingsService, SettingsUiService } from "@/settings";
import { createSettingsService } from "@/settings/testing";

import { JournalLifecycleFlowError, UnknownJournalError } from "../errors";
import { JournalLifecycleService } from "../lifecycle";

import { RenameJournalFlow } from "./rename-journal.flow";

async function build() {
  const { service: settings, container } = createSettingsService({ collections: [journalConfigCollection] });
  await settings.initialize();
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(LogSinkMultiToken).useValue(new MemorySink());
  container.register(LoggerFactoryToken).useClass(LoggerFactory);
  container.register(SettingsUiService).useClass(SettingsUiService);
  container.register(JournalLifecycleService).useClass(JournalLifecycleService);
  container.register(Flows).useClass(Flows);
  container.register(RenameJournalFlow).useClass(RenameJournalFlow);
  return { container, settings, modals, flows: container.resolve(Flows) };
}

describe("RenameJournalFlow", () => {
  it("renames the journal on submit", async () => {
    const { flows, settings, modals } = await build();
    settings
      .getCollection(journalConfigCollection)
      .add("daily", {
        name: "daily",
        write: { type: "day" },
        timeline: { start: "", end: { kind: "never" } },
        dateFormat: "YYYY-MM-DD",
        frontmatter: {
          dateField: "journal-date",
          startDateField: "journal-start-date",
          endDateField: "journal-end-date",
          addStartDate: false,
          addEndDate: false,
        },
        numbering: { enabled: false, anchorDate: "", allowBefore: false, sources: [] },
      } as never);
    const promise = flows.invoke(RenameJournalFlow, { journalName: "daily" });
    modals.lastOpen<{ currentName: string }, { newName: string }>().submit({ newName: "morning" });
    const result = await promise;
    expect(result.kind).toBe("ok");
    expect(result.kind === "ok" && result.value).toEqual({ newName: "morning" });
    const col = settings.getCollection(journalConfigCollection);
    expect(col.get("daily")).toBeUndefined();
    expect(col.get("morning")?.name).toBe("morning");
  });

  it("emits UserAborted on cancel", async () => {
    const { flows, modals, settings } = await build();
    settings
      .getCollection(journalConfigCollection)
      .add("daily", {
        name: "daily",
        write: { type: "day" },
        timeline: { start: "", end: { kind: "never" } },
        dateFormat: "YYYY-MM-DD",
        frontmatter: {
          dateField: "journal-date",
          startDateField: "journal-start-date",
          endDateField: "journal-end-date",
          addStartDate: false,
          addEndDate: false,
        },
        numbering: { enabled: false, anchorDate: "", allowBefore: false, sources: [] },
      } as never);
    const promise = flows.invoke(RenameJournalFlow, { journalName: "daily" });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind).toBe("err");
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(result.kind === "err" && (result.error as UserAborted).source).toBe("rename-journal-modal");
  });

  it("maps lifecycle error to JournalLifecycleFlowError when journal is unknown", async () => {
    const { flows, modals } = await build();
    const promise = flows.invoke(RenameJournalFlow, { journalName: "ghost" });
    modals.lastOpen<{ currentName: string }, { newName: string }>().submit({ newName: "x" });
    const result = await promise;
    expect(result.kind).toBe("err");
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalLifecycleFlowError);
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      UnknownJournalError,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

```bash
npm run test -- --run src/journals/settings/flows/rename-journal.flow.test.ts
```

- [ ] **Step 3: Create `src/journals/settings/flows/rename-journal.flow.ts`.**

```ts
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import { toFlowError } from "../errors";
import { JournalLifecycleService } from "../lifecycle";
import { renameJournalModal } from "../ui/rename-journal-modal";

export class RenameJournalFlow implements Flow<{ journalName: string }, { newName: string }, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #lifecycle = inject(JournalLifecycleService);

  execute(params: { journalName: string }): AsyncResult<{ newName: string }, FlowError> {
    return attempt.in(this, async function* () {
      const submitted = yield* this.#modals
        .open(renameJournalModal, { currentName: params.journalName })
        .mapErr(() => new UserAborted("rename-journal-modal"));
      yield* this.#lifecycle.rename(params.journalName, submitted.newName).mapErr(toFlowError);
      return { newName: submitted.newName };
    });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes.**

```bash
npm run test -- --run src/journals/settings/flows/rename-journal.flow.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Lint + typecheck + commit.**

```bash
npm run check:lint && npm run check:types
git add src/journals/settings/flows/rename-journal.flow.ts src/journals/settings/flows/rename-journal.flow.test.ts
git -c commit.gpgsign=false commit -m "feat(journals): RenameJournalFlow"
```

---

## Task 12: `DeleteJournalFlow`

**Background.** Pops the edit subpage if the deleted journal is the current subpage's prop.

**Files:**

- Create: `src/journals/settings/flows/delete-journal.flow.ts`
- Create: `src/journals/settings/flows/delete-journal.flow.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `src/journals/settings/flows/delete-journal.flow.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { LoggerFactoryToken, LoggerFactory, LogSinkMultiToken } from "@/infrastructure/logger";
import { MemorySink } from "@/infrastructure/logger/testing";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { SettingsUiService } from "@/settings";
import { createSettingsService } from "@/settings/testing";

import { JournalLifecycleFlowError, UnknownJournalError } from "../errors";
import { JournalLifecycleService } from "../lifecycle";
import { journalEditSubpage } from "../ui/journals-subpage";

import { DeleteJournalFlow } from "./delete-journal.flow";

async function build() {
  const { service: settings, container } = createSettingsService({ collections: [journalConfigCollection] });
  await settings.initialize();
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(LogSinkMultiToken).useValue(new MemorySink());
  container.register(LoggerFactoryToken).useClass(LoggerFactory);
  container.register(SettingsUiService).useClass(SettingsUiService);
  container.register(JournalLifecycleService).useClass(JournalLifecycleService);
  container.register(Flows).useClass(Flows);
  container.register(DeleteJournalFlow).useClass(DeleteJournalFlow);
  return { container, settings, modals, flows: container.resolve(Flows), ui: container.resolve(SettingsUiService) };
}

describe("DeleteJournalFlow", () => {
  it("deletes the journal on submit", async () => {
    const { flows, settings, modals } = await build();
    settings
      .getCollection(journalConfigCollection)
      .add("daily", {
        name: "daily",
        write: { type: "day" },
        timeline: { start: "", end: { kind: "never" } },
        dateFormat: "YYYY-MM-DD",
        frontmatter: {
          dateField: "journal-date",
          startDateField: "journal-start-date",
          endDateField: "journal-end-date",
          addStartDate: false,
          addEndDate: false,
        },
        numbering: { enabled: false, anchorDate: "", allowBefore: false, sources: [] },
      } as never);
    const promise = flows.invoke(DeleteJournalFlow, { journalName: "daily" });
    modals.lastOpen<{ journalName: string }, { mode: "keep" }>().submit({ mode: "keep" });
    const result = await promise;
    expect(result.kind).toBe("ok");
    expect(settings.getCollection(journalConfigCollection).get("daily")).toBeUndefined();
  });

  it("pops the edit subpage when it points at the deleted journal", async () => {
    const { flows, settings, modals, ui } = await build();
    settings
      .getCollection(journalConfigCollection)
      .add("daily", {
        name: "daily",
        write: { type: "day" },
        timeline: { start: "", end: { kind: "never" } },
        dateFormat: "YYYY-MM-DD",
        frontmatter: {
          dateField: "journal-date",
          startDateField: "journal-start-date",
          endDateField: "journal-end-date",
          addStartDate: false,
          addEndDate: false,
        },
        numbering: { enabled: false, anchorDate: "", allowBefore: false, sources: [] },
      } as never);
    ui.push(journalEditSubpage, { journalName: "daily" });
    const promise = flows.invoke(DeleteJournalFlow, { journalName: "daily" });
    modals.lastOpen<{ journalName: string }, { mode: "keep" }>().submit({ mode: "keep" });
    await promise;
    expect(ui.current.value).toBeNull();
  });

  it("leaves a different journal's subpage alone", async () => {
    const { flows, settings, modals, ui } = await build();
    const proto = {
      name: "x",
      write: { type: "day" },
      timeline: { start: "", end: { kind: "never" } },
      dateFormat: "YYYY-MM-DD",
      frontmatter: {
        dateField: "journal-date",
        startDateField: "journal-start-date",
        endDateField: "journal-end-date",
        addStartDate: false,
        addEndDate: false,
      },
      numbering: { enabled: false, anchorDate: "", allowBefore: false, sources: [] },
    } as never;
    settings.getCollection(journalConfigCollection).add("daily", proto);
    settings.getCollection(journalConfigCollection).add("morning", proto);
    ui.push(journalEditSubpage, { journalName: "morning" });
    const promise = flows.invoke(DeleteJournalFlow, { journalName: "daily" });
    modals.lastOpen<{ journalName: string }, { mode: "keep" }>().submit({ mode: "keep" });
    await promise;
    expect(ui.current.value?.subpage.key).toBe("journal-edit");
    expect(ui.current.value?.props).toEqual({ journalName: "morning" });
  });

  it("emits UserAborted on cancel", async () => {
    const { flows, modals, settings } = await build();
    settings
      .getCollection(journalConfigCollection)
      .add("daily", {
        name: "daily",
        write: { type: "day" },
        timeline: { start: "", end: { kind: "never" } },
        dateFormat: "YYYY-MM-DD",
        frontmatter: {
          dateField: "journal-date",
          startDateField: "journal-start-date",
          endDateField: "journal-end-date",
          addStartDate: false,
          addEndDate: false,
        },
        numbering: { enabled: false, anchorDate: "", allowBefore: false, sources: [] },
      } as never);
    const promise = flows.invoke(DeleteJournalFlow, { journalName: "daily" });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind).toBe("err");
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(result.kind === "err" && (result.error as UserAborted).source).toBe("delete-journal-modal");
  });

  it("maps lifecycle error to JournalLifecycleFlowError when journal is unknown", async () => {
    const { flows, modals } = await build();
    const promise = flows.invoke(DeleteJournalFlow, { journalName: "ghost" });
    modals.lastOpen<{ journalName: string }, { mode: "keep" }>().submit({ mode: "keep" });
    const result = await promise;
    expect(result.kind).toBe("err");
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalLifecycleFlowError);
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      UnknownJournalError,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

```bash
npm run test -- --run src/journals/settings/flows/delete-journal.flow.test.ts
```

- [ ] **Step 3: Create `src/journals/settings/flows/delete-journal.flow.ts`.**

```ts
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";
import { SettingsUiService } from "@/settings";

import { toFlowError } from "../errors";
import { JournalLifecycleService } from "../lifecycle";
import { deleteJournalModal } from "../ui/delete-journal-modal";

export class DeleteJournalFlow implements Flow<{ journalName: string }, void, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #lifecycle = inject(JournalLifecycleService);
  readonly #ui = inject(SettingsUiService);

  execute(params: { journalName: string }): AsyncResult<void, FlowError> {
    return attempt.in(this, async function* () {
      yield* this.#modals
        .open(deleteJournalModal, { journalName: params.journalName })
        .mapErr(() => new UserAborted("delete-journal-modal"));
      yield* this.#lifecycle.delete(params.journalName).mapErr(toFlowError);
      const current = this.#ui.current.value;
      if (
        current?.subpage.key === "journal-edit" &&
        (current.props as { journalName: string }).journalName === params.journalName
      ) {
        this.#ui.pop();
      }
      return undefined;
    });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes.**

```bash
npm run test -- --run src/journals/settings/flows/delete-journal.flow.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Lint + typecheck + commit.**

```bash
npm run check:lint && npm run check:types
git add src/journals/settings/flows/delete-journal.flow.ts src/journals/settings/flows/delete-journal.flow.test.ts
git -c commit.gpgsign=false commit -m "feat(journals): DeleteJournalFlow with subpage auto-pop"
```

---

## Task 13: `EditFrontmatterFieldFlow`

**Background.** Mutates `config.frontmatter[fieldName]` via the reactive collection proxy.

**Files:**

- Create: `src/journals/settings/flows/edit-frontmatter-field.flow.ts`
- Create: `src/journals/settings/flows/edit-frontmatter-field.flow.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `src/journals/settings/flows/edit-frontmatter-field.flow.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { LoggerFactoryToken, LoggerFactory, LogSinkMultiToken } from "@/infrastructure/logger";
import { MemorySink } from "@/infrastructure/logger/testing";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { createSettingsService } from "@/settings/testing";

import { JournalLifecycleFlowError, UnknownJournalError } from "../errors";

import { EditFrontmatterFieldFlow } from "./edit-frontmatter-field.flow";

async function build() {
  const { service: settings, container } = createSettingsService({ collections: [journalConfigCollection] });
  await settings.initialize();
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(LogSinkMultiToken).useValue(new MemorySink());
  container.register(LoggerFactoryToken).useClass(LoggerFactory);
  container.register(Flows).useClass(Flows);
  container.register(EditFrontmatterFieldFlow).useClass(EditFrontmatterFieldFlow);
  return { container, settings, modals, flows: container.resolve(Flows) };
}

function seed(settings: ReturnType<Awaited<ReturnType<typeof build>>["settings"]>, name = "daily") {
  settings
    .getCollection(journalConfigCollection)
    .add(name, {
      name,
      write: { type: "day" },
      timeline: { start: "", end: { kind: "never" } },
      dateFormat: "YYYY-MM-DD",
      frontmatter: {
        dateField: "journal-date",
        startDateField: "journal-start-date",
        endDateField: "journal-end-date",
        addStartDate: false,
        addEndDate: false,
      },
      numbering: { enabled: false, anchorDate: "", allowBefore: false, sources: [] },
    } as never);
}

describe("EditFrontmatterFieldFlow", () => {
  it("mutates dateField on submit", async () => {
    const { flows, settings, modals } = await build();
    seed(settings);
    const promise = flows.invoke(EditFrontmatterFieldFlow, { journalName: "daily", fieldName: "dateField" });
    modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "happened-on" });
    const result = await promise;
    expect(result.kind).toBe("ok");
    expect(settings.getCollection(journalConfigCollection).get("daily")?.frontmatter.dateField).toBe("happened-on");
  });

  it("mutates startDateField on submit", async () => {
    const { flows, settings, modals } = await build();
    seed(settings);
    const promise = flows.invoke(EditFrontmatterFieldFlow, { journalName: "daily", fieldName: "startDateField" });
    modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "begins-on" });
    await promise;
    expect(settings.getCollection(journalConfigCollection).get("daily")?.frontmatter.startDateField).toBe("begins-on");
  });

  it("mutates endDateField on submit", async () => {
    const { flows, settings, modals } = await build();
    seed(settings);
    const promise = flows.invoke(EditFrontmatterFieldFlow, { journalName: "daily", fieldName: "endDateField" });
    modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "ends-on" });
    await promise;
    expect(settings.getCollection(journalConfigCollection).get("daily")?.frontmatter.endDateField).toBe("ends-on");
  });

  it("emits UserAborted on cancel", async () => {
    const { flows, settings, modals } = await build();
    seed(settings);
    const promise = flows.invoke(EditFrontmatterFieldFlow, { journalName: "daily", fieldName: "dateField" });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind).toBe("err");
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(result.kind === "err" && (result.error as UserAborted).source).toBe("edit-frontmatter-field-modal");
  });

  it("rejects when the journal does not exist", async () => {
    const { flows } = await build();
    const result = await flows.invoke(EditFrontmatterFieldFlow, { journalName: "ghost", fieldName: "dateField" });
    expect(result.kind).toBe("err");
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalLifecycleFlowError);
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      UnknownJournalError,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

```bash
npm run test -- --run src/journals/settings/flows/edit-frontmatter-field.flow.test.ts
```

- [ ] **Step 3: Create `src/journals/settings/flows/edit-frontmatter-field.flow.ts`.**

```ts
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { journalConfigCollection } from "@/journals";
import { attempt, Err, type AsyncResult } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { toFlowError, UnknownJournalError } from "../errors";
import { editFrontmatterFieldModal, type FrontmatterFieldName } from "../ui/edit-frontmatter-field-modal";

export class EditFrontmatterFieldFlow implements Flow<
  { journalName: string; fieldName: FrontmatterFieldName },
  { newValue: string },
  FlowError
> {
  readonly #modals = inject(ModalService);
  readonly #settings = inject(SettingsService);

  execute(params: {
    journalName: string;
    fieldName: FrontmatterFieldName;
  }): AsyncResult<{ newValue: string }, FlowError> {
    return attempt.in(this, async function* () {
      const collection = this.#settings.getCollection(journalConfigCollection);
      const config = collection.get(params.journalName);
      if (!config) {
        yield* new Err<never, FlowError>(toFlowError(new UnknownJournalError(params.journalName)));
      }
      const submitted = yield* this.#modals
        .open(editFrontmatterFieldModal, { journalName: params.journalName, fieldName: params.fieldName })
        .mapErr(() => new UserAborted("edit-frontmatter-field-modal"));
      // `config` is non-null here (yielded out above on undefined).
      (config as NonNullable<typeof config>).frontmatter[params.fieldName] = submitted.newValue;
      return { newValue: submitted.newValue };
    });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes.**

```bash
npm run test -- --run src/journals/settings/flows/edit-frontmatter-field.flow.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Lint + typecheck + commit.**

```bash
npm run check:lint && npm run check:types
git add src/journals/settings/flows/edit-frontmatter-field.flow.ts src/journals/settings/flows/edit-frontmatter-field.flow.test.ts
git -c commit.gpgsign=false commit -m "feat(journals): EditFrontmatterFieldFlow"
```

---

## Task 14: `EditSequencePropertyFlow`

**Background.** Mutates `config.numbering.sources[sourceIndex].frontmatterKey`. Pre-validates that both journal and source index exist.

**Files:**

- Create: `src/journals/settings/flows/edit-sequence-property.flow.ts`
- Create: `src/journals/settings/flows/edit-sequence-property.flow.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `src/journals/settings/flows/edit-sequence-property.flow.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { LoggerFactoryToken, LoggerFactory, LogSinkMultiToken } from "@/infrastructure/logger";
import { MemorySink } from "@/infrastructure/logger/testing";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { createSettingsService } from "@/settings/testing";

import { JournalLifecycleFlowError, UnknownJournalError, UnknownSequenceSourceError } from "../errors";

import { EditSequencePropertyFlow } from "./edit-sequence-property.flow";

async function build() {
  const { service: settings, container } = createSettingsService({ collections: [journalConfigCollection] });
  await settings.initialize();
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(LogSinkMultiToken).useValue(new MemorySink());
  container.register(LoggerFactoryToken).useClass(LoggerFactory);
  container.register(Flows).useClass(Flows);
  container.register(EditSequencePropertyFlow).useClass(EditSequencePropertyFlow);
  return { container, settings, modals, flows: container.resolve(Flows) };
}

function seed(settings: Awaited<ReturnType<typeof build>>["settings"], name = "daily", withSource = true) {
  settings.getCollection(journalConfigCollection).add(name, {
    name,
    write: { type: "day" },
    timeline: { start: "", end: { kind: "never" } },
    dateFormat: "YYYY-MM-DD",
    frontmatter: {
      dateField: "journal-date",
      startDateField: "journal-start-date",
      endDateField: "journal-end-date",
      addStartDate: false,
      addEndDate: false,
    },
    numbering: {
      enabled: true,
      anchorDate: "",
      allowBefore: false,
      sources: withSource
        ? [{ variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } }]
        : [],
    },
  } as never);
}

describe("EditSequencePropertyFlow", () => {
  it("mutates sources[sourceIndex].frontmatterKey", async () => {
    const { flows, settings, modals } = await build();
    seed(settings);
    const promise = flows.invoke(EditSequencePropertyFlow, { journalName: "daily", sourceIndex: 0 });
    modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "sprint-no" });
    const result = await promise;
    expect(result.kind).toBe("ok");
    expect(settings.getCollection(journalConfigCollection).get("daily")?.numbering.sources[0]?.frontmatterKey).toBe(
      "sprint-no",
    );
  });

  it("emits UserAborted on cancel", async () => {
    const { flows, settings, modals } = await build();
    seed(settings);
    const promise = flows.invoke(EditSequencePropertyFlow, { journalName: "daily", sourceIndex: 0 });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind).toBe("err");
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(result.kind === "err" && (result.error as UserAborted).source).toBe("edit-sequence-property-modal");
  });

  it("rejects when the journal does not exist", async () => {
    const { flows } = await build();
    const result = await flows.invoke(EditSequencePropertyFlow, { journalName: "ghost", sourceIndex: 0 });
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalLifecycleFlowError);
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      UnknownJournalError,
    );
  });

  it("rejects when the source index is out of range", async () => {
    const { flows, settings } = await build();
    seed(settings, "daily", false);
    const result = await flows.invoke(EditSequencePropertyFlow, { journalName: "daily", sourceIndex: 0 });
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalLifecycleFlowError);
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      UnknownSequenceSourceError,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

```bash
npm run test -- --run src/journals/settings/flows/edit-sequence-property.flow.test.ts
```

- [ ] **Step 3: Create `src/journals/settings/flows/edit-sequence-property.flow.ts`.**

```ts
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { journalConfigCollection } from "@/journals";
import { attempt, Err, type AsyncResult } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { toFlowError, UnknownJournalError, UnknownSequenceSourceError } from "../errors";
import { editSequencePropertyModal } from "../ui/edit-sequence-property-modal";

export class EditSequencePropertyFlow implements Flow<
  { journalName: string; sourceIndex: number },
  { newValue: string },
  FlowError
> {
  readonly #modals = inject(ModalService);
  readonly #settings = inject(SettingsService);

  execute(params: { journalName: string; sourceIndex: number }): AsyncResult<{ newValue: string }, FlowError> {
    return attempt.in(this, async function* () {
      const collection = this.#settings.getCollection(journalConfigCollection);
      const config = collection.get(params.journalName);
      if (!config) {
        yield* new Err<never, FlowError>(toFlowError(new UnknownJournalError(params.journalName)));
      }
      const source = (config as NonNullable<typeof config>).numbering.sources[params.sourceIndex];
      if (!source) {
        yield* new Err<never, FlowError>(
          toFlowError(new UnknownSequenceSourceError(params.journalName, params.sourceIndex)),
        );
      }
      const submitted = yield* this.#modals
        .open(editSequencePropertyModal, { journalName: params.journalName, sourceIndex: params.sourceIndex })
        .mapErr(() => new UserAborted("edit-sequence-property-modal"));
      (source as NonNullable<typeof source>).frontmatterKey = submitted.newValue;
      return { newValue: submitted.newValue };
    });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes.**

```bash
npm run test -- --run src/journals/settings/flows/edit-sequence-property.flow.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Lint + typecheck + commit.**

```bash
npm run check:lint && npm run check:types
git add src/journals/settings/flows/edit-sequence-property.flow.ts src/journals/settings/flows/edit-sequence-property.flow.test.ts
git -c commit.gpgsign=false commit -m "feat(journals): EditSequencePropertyFlow"
```

---

## Task 15: `JournalEditSubpage`

**Background.** Long form bound directly to the reactive `config = collection.get(journalName)` proxy. Stale-guard pops on missing journal. Three collapsible sections (timeline / sequential numbers / frontmatter) + the date-format row.

**Files:**

- Modify: `src/journals/settings/ui/journals-subpage.ts` (replace shell with direct import)
- Create: `src/journals/settings/ui/JournalEditSubpage.vue`
- Create: `src/journals/settings/ui/JournalEditSubpage.test.ts`

- [ ] **Step 1: Replace the subpage shell with a direct import.**

Edit `src/journals/settings/ui/journals-subpage.ts`:

```ts
import { defineSubpage } from "@/settings";

import JournalEditSubpage from "./JournalEditSubpage.vue";

import type { Component } from "vue";

export const journalEditSubpage = defineSubpage<{ journalName: string }>({
  key: "journal-edit",
  component: JournalEditSubpage as Component,
});
```

- [ ] **Step 2: Write the failing test.**

Create `src/journals/settings/ui/JournalEditSubpage.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installTestCalendar } from "@/calendar/testing";
import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { createSettingsService } from "@/settings/testing";
import { SettingsService } from "@/settings";

import { EditFrontmatterFieldFlow } from "../flows/edit-frontmatter-field.flow";
import { EditSequencePropertyFlow } from "../flows/edit-sequence-property.flow";
import { RenameJournalFlow } from "../flows/rename-journal.flow";

import JournalEditSubpage from "./JournalEditSubpage.vue";

async function setup(initial?: unknown) {
  const raw = initial ?? defaultRaw();
  const { service: settings, container } = createSettingsService({ collections: [journalConfigCollection], raw });
  await settings.initialize();
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container.register(Flows).useClass(Flows);
  const flows = container.resolve(Flows);
  vi.spyOn(flows, "invoke");
  container.register(Flows).useValue(flows);
  return { container, settings, flows };
}

function defaultRaw(name = "daily") {
  return {
    version: 3,
    journals: {
      [name]: {
        name,
        write: { type: "day" },
        timeline: { start: "", end: { kind: "never" } },
        dateFormat: "YYYY-MM-DD",
        frontmatter: {
          dateField: "journal-date",
          startDateField: "journal-start-date",
          endDateField: "journal-end-date",
          addStartDate: false,
          addEndDate: false,
        },
        numbering: { enabled: false, anchorDate: "", allowBefore: false, sources: [] },
      },
    },
  };
}

function mount(container: Container, journalName: string, nav?: { back?: () => void; push?: () => void }) {
  return render(JournalEditSubpage, {
    props: { journalName, nav: { back: nav?.back ?? (() => undefined), push: nav?.push ?? (() => undefined) } },
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

let teardown: () => void;
beforeEach(() => {
  ({ teardown } = installTestCalendar());
});
afterEach(() => {
  teardown();
  cleanup();
});

describe("JournalEditSubpage", () => {
  it("renders the header with the journal name and write description", async () => {
    const { container } = await setup();
    mount(container, "daily");
    expect(
      screen.getByText(m.journal_edit_header_title({ name: "daily", writing: m.journal_write({ type: "day" }) })),
    ).toBeTruthy();
  });

  it("calls nav.back when the back button is clicked", async () => {
    const back = vi.fn();
    const { container } = await setup();
    mount(container, "daily", { back });
    await userEvent.click(screen.getByLabelText(m.journal_edit_back_tooltip()));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("invokes RenameJournalFlow when the rename pencil is clicked", async () => {
    const { container, flows } = await setup();
    mount(container, "daily");
    await userEvent.click(screen.getByLabelText(m.journal_edit_rename_tooltip()));
    expect(flows.invoke).toHaveBeenCalledWith(RenameJournalFlow, { journalName: "daily" });
  });

  it("calls nav.back when the underlying journal disappears", async () => {
    const back = vi.fn();
    const { container, settings } = await setup();
    mount(container, "daily", { back });
    settings.getCollection(journalConfigCollection).remove("daily");
    await Promise.resolve();
    expect(back).toHaveBeenCalled();
  });

  it("persists changes to dateFormat through the reactive collection", async () => {
    const { container, settings } = await setup();
    mount(container, "daily");
    const input = screen.getByLabelText(m.journal_edit_date_format_label()) as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "YYYY/MM");
    expect(settings.getCollection(journalConfigCollection).get("daily")?.dateFormat).toBe("YYYY/MM");
  });

  it("toggling sequential numbers materializes sources[0]", async () => {
    const { container, settings } = await setup();
    mount(container, "daily");
    await userEvent.click(screen.getByText(m.journal_edit_section_sequential_numbers()));
    const toggle = screen.getByLabelText(m.journal_edit_sequence_enabled_label()) as HTMLInputElement;
    await userEvent.click(toggle);
    const config = settings.getCollection(journalConfigCollection).get("daily")!;
    expect(config.numbering.enabled).toBe(true);
    expect(config.numbering.sources[0]).toEqual({
      variable: "index",
      frontmatterKey: "journal-index",
      anchorValue: 1,
      reset: { kind: "never" },
    });
  });

  it("hides allow-before when start date is set", async () => {
    const raw = defaultRaw();
    raw.journals.daily.numbering = {
      enabled: true,
      anchorDate: "",
      allowBefore: false,
      sources: [{ variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } }],
    } as never;
    raw.journals.daily.timeline = { start: "2024-01-01", end: { kind: "never" } } as never;
    const { container } = await setup(raw);
    mount(container, "daily");
    await userEvent.click(screen.getByText(m.journal_edit_section_sequential_numbers()));
    expect(screen.queryByLabelText(m.journal_edit_allow_before_label())).toBeNull();
  });

  it("invokes EditFrontmatterFieldFlow when the date-field pencil is clicked", async () => {
    const { container, flows } = await setup();
    mount(container, "daily");
    await userEvent.click(screen.getByText(m.journal_edit_section_frontmatter()));
    await userEvent.click(screen.getByLabelText(`${m.journal_fm_field_label({ field: "dateField" })} edit`));
    expect(flows.invoke).toHaveBeenCalledWith(EditFrontmatterFieldFlow, {
      journalName: "daily",
      fieldName: "dateField",
    });
  });

  it("invokes EditSequencePropertyFlow when the sequence property pencil is clicked", async () => {
    const raw = defaultRaw();
    raw.journals.daily.numbering = {
      enabled: true,
      anchorDate: "",
      allowBefore: false,
      sources: [{ variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } }],
    } as never;
    const { container, flows } = await setup(raw);
    mount(container, "daily");
    await userEvent.click(screen.getByText(m.journal_edit_section_sequential_numbers()));
    await userEvent.click(screen.getByLabelText(`${m.journal_edit_sequence_property_label()} edit`));
    expect(flows.invoke).toHaveBeenCalledWith(EditSequencePropertyFlow, {
      journalName: "daily",
      sourceIndex: 0,
    });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails.**

```bash
npm run test -- --run src/journals/settings/ui/JournalEditSubpage.test.ts
```

- [ ] **Step 4: Create `src/journals/settings/ui/JournalEditSubpage.vue`.**

```vue
<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { journalConfigCollection, type JournalConfig, type TimelineEnd, type NumberingReset } from "@/journals";
import { SettingsService } from "@/settings";
import type { SubpageNav } from "@/settings";
import UiButton from "@/ui/UiButton.vue";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { describeWrite } from "../describe-write";
import { EditFrontmatterFieldFlow } from "../flows/edit-frontmatter-field.flow";
import { EditSequencePropertyFlow } from "../flows/edit-sequence-property.flow";
import { RenameJournalFlow } from "../flows/rename-journal.flow";

import DateFormatPreview from "./DateFormatPreview.vue";

const { journalName, nav } = defineProps<{ journalName: string; nav: SubpageNav }>();

const settings = useService(SettingsService);
const flows = useService(Flows);
const collection = settings.getCollection(journalConfigCollection);
const config = computed<JournalConfig | undefined>(() => collection.get(journalName) as JournalConfig | undefined);

watchEffect(() => {
  if (!config.value) nav.back();
});

const anchorRegex = /^\d{4}-\d{2}-\d{2}$/;

const writing = computed(() => (config.value ? m.journal_write(describeWrite(config.value.write)) : ""));

const timelineOpen = ref(true);
const sequenceOpen = ref(false);
const frontmatterOpen = ref(false);

const startError = computed(() =>
  config.value && config.value.timeline.start.length > 0 && !anchorRegex.test(config.value.timeline.start)
    ? m.journal_anchor_format_error()
    : "",
);
const endDateError = computed(() =>
  config.value && config.value.timeline.end.kind === "date" && !anchorRegex.test(config.value.timeline.end.date)
    ? m.journal_anchor_format_error()
    : "",
);
const anchorError = computed(() =>
  config.value && config.value.numbering.anchorDate.length > 0 && !anchorRegex.test(config.value.numbering.anchorDate)
    ? m.journal_anchor_format_error()
    : "",
);

function clearStart(): void {
  if (config.value && config.value.write.type !== "custom") {
    config.value.timeline.start = "" as never;
  }
}

function setEndKind(kind: TimelineEnd["kind"]): void {
  if (!config.value) return;
  if (kind === "never") config.value.timeline.end = { kind: "never" };
  else if (kind === "date") config.value.timeline.end = { kind: "date", date: "" as never };
  else config.value.timeline.end = { kind: "repeats", count: 1 };
}

function setResetKind(kind: NumberingReset["kind"]): void {
  const source = config.value?.numbering.sources[0];
  if (!source) return;
  source.reset = kind === "never" ? { kind: "never" } : { kind: "after", count: 2 };
}

function onSequenceToggle(value: boolean): void {
  if (!config.value) return;
  config.value.numbering.enabled = value;
  if (value && config.value.numbering.sources.length === 0) {
    config.value.numbering.sources.push({
      variable: "index",
      frontmatterKey: "journal-index",
      anchorValue: 1,
      reset: { kind: "never" },
    });
  }
}

function rename(): void {
  void flows.invoke(RenameJournalFlow, { journalName });
}
function editFm(fieldName: "dateField" | "startDateField" | "endDateField"): void {
  void flows.invoke(EditFrontmatterFieldFlow, { journalName, fieldName });
}
function editSequenceKey(): void {
  void flows.invoke(EditSequencePropertyFlow, { journalName, sourceIndex: 0 });
}
</script>

<template>
  <div v-if="config">
    <UiSettingRow heading>
      <template #name>
        {{ m.journal_edit_header_title({ name: journalName, writing }) }}
      </template>
      <UiIconButton icon="pencil" :tooltip="m.journal_edit_rename_tooltip()" @click="rename" />
      <UiIconButton icon="chevron-left" :tooltip="m.journal_edit_back_tooltip()" @click="nav.back()" />
    </UiSettingRow>

    <UiCollapsibleBlock v-model:expanded="timelineOpen">
      <template #trigger>
        <span class="journal-section-heading">
          <UiIcon name="calendar-range" />
          <span>{{ m.journal_edit_section_timeline() }}</span>
        </span>
      </template>

      <UiSettingRow :name="m.journal_edit_start_writing_label()">
        <template #description>
          <div>{{ m.journal_edit_start_writing_description() }}</div>
          <div v-if="config.write.type === 'custom'" class="journal-hint">
            {{ m.journal_edit_start_writing_custom_locked() }}
          </div>
          <span v-if="startError" class="journal-form-error">{{ startError }}</span>
        </template>
        <span v-if="config.write.type === 'custom'">{{ config.write.anchorDate }}</span>
        <template v-else>
          <UiTextInput v-model="config.timeline.start" placeholder="YYYY-MM-DD" />
          <UiIconButton
            v-if="config.timeline.start"
            icon="trash"
            :tooltip="m.common_action_close()"
            @click="clearStart"
          />
        </template>
      </UiSettingRow>

      <UiSettingRow :name="m.journal_edit_end_writing_label()">
        <template #description>
          {{ m.journal_edit_end_description({ kind: config.timeline.end.kind }) }}
          <span v-if="endDateError" class="journal-form-error">{{ endDateError }}</span>
        </template>
        <UiDropdown
          :model-value="config.timeline.end.kind"
          @update:model-value="setEndKind($event as TimelineEnd['kind'])"
        >
          <option value="never">{{ m.journal_edit_end_kind({ kind: "never" }) }}</option>
          <option value="date">{{ m.journal_edit_end_kind({ kind: "date" }) }}</option>
          <option value="repeats">{{ m.journal_edit_end_kind({ kind: "repeats" }) }}</option>
        </UiDropdown>
        <UiTextInput
          v-if="config.timeline.end.kind === 'date'"
          v-model="config.timeline.end.date"
          placeholder="YYYY-MM-DD"
        />
        <UiNumberInput v-if="config.timeline.end.kind === 'repeats'" v-model="config.timeline.end.count" :min="1" />
      </UiSettingRow>
    </UiCollapsibleBlock>

    <UiCollapsibleBlock v-model:expanded="sequenceOpen">
      <template #trigger>
        <span class="journal-section-heading">
          <UiIcon name="hash" />
          <span>{{ m.journal_edit_section_sequential_numbers() }}</span>
        </span>
      </template>

      <UiSettingRow :name="m.journal_edit_sequence_enabled_label()">
        <template #description>{{ m.journal_edit_sequence_enabled_description() }}</template>
        <UiToggle :model-value="config.numbering.enabled" @update:model-value="onSequenceToggle" />
      </UiSettingRow>

      <template v-if="config.numbering.enabled && config.numbering.sources[0]">
        <UiSettingRow :name="m.journal_edit_anchor_label()">
          <template #description>
            <span v-if="config.timeline.start">{{ m.journal_edit_anchor_start_used() }}</span>
            <span v-else-if="anchorError" class="journal-form-error">{{ anchorError }}</span>
          </template>
          <span v-if="config.timeline.start">{{ config.timeline.start }}</span>
          <UiTextInput v-else v-model="config.numbering.anchorDate" placeholder="YYYY-MM-DD" />
        </UiSettingRow>

        <UiSettingRow :name="m.journal_edit_start_number_label()">
          <template #description>{{ m.journal_edit_start_number_description() }}</template>
          <UiNumberInput v-model="config.numbering.sources[0].anchorValue" :min="1" />
        </UiSettingRow>

        <UiSettingRow :name="m.journal_edit_reset_label()">
          <template #description>{{ m.journal_edit_reset_description() }}</template>
          <UiDropdown
            :model-value="config.numbering.sources[0].reset.kind"
            @update:model-value="setResetKind($event as NumberingReset['kind'])"
          >
            <option value="never">{{ m.journal_edit_reset_option({ kind: "never" }) }}</option>
            <option value="after">{{ m.journal_edit_reset_option({ kind: "after" }) }}</option>
          </UiDropdown>
          <template v-if="config.numbering.sources[0].reset.kind === 'after'">
            <UiNumberInput v-model="config.numbering.sources[0].reset.count" :min="2" />
            <span>{{ m.journal_edit_reset_count_suffix() }}</span>
          </template>
        </UiSettingRow>

        <UiSettingRow
          v-if="!config.timeline.start && config.numbering.sources[0].reset.kind === 'never'"
          :name="m.journal_edit_allow_before_label()"
        >
          <template #description>{{ m.journal_edit_allow_before_description() }}</template>
          <UiToggle v-model="config.numbering.allowBefore" />
        </UiSettingRow>

        <UiSettingRow :name="m.journal_edit_sequence_property_label()">
          {{ config.numbering.sources[0].frontmatterKey }}
          <UiIconButton
            icon="pencil"
            :tooltip="`${m.journal_edit_sequence_property_label()} edit`"
            @click="editSequenceKey"
          />
        </UiSettingRow>
      </template>
    </UiCollapsibleBlock>

    <UiSettingRow :name="m.journal_edit_date_format_label()">
      <template #description>
        <div>{{ m.journal_edit_date_format_description() }}</div>
        <a target="_blank" href="https://momentjs.com/docs/#/displaying/format/">
          {{ m.journal_edit_date_format_moment_doc_link() }}
        </a>
        <DateFormatPreview :format="config.dateFormat" />
      </template>
      <UiTextInput v-model="config.dateFormat" />
    </UiSettingRow>

    <UiCollapsibleBlock v-model:expanded="frontmatterOpen">
      <template #trigger>
        <span class="journal-section-heading">
          <UiIcon name="table-properties" />
          <span>{{ m.journal_edit_section_frontmatter() }}</span>
        </span>
      </template>

      <UiSettingRow :name="m.journal_fm_field_label({ field: 'dateField' })">
        {{ config.frontmatter.dateField }}
        <UiIconButton
          icon="pencil"
          :tooltip="`${m.journal_fm_field_label({ field: 'dateField' })} edit`"
          @click="editFm('dateField')"
        />
      </UiSettingRow>

      <UiSettingRow :name="m.journal_edit_fm_start_toggle_label()">
        <template #description>{{ m.journal_edit_fm_start_description() }}</template>
        <UiToggle v-model="config.frontmatter.addStartDate" />
      </UiSettingRow>
      <UiSettingRow
        v-if="config.frontmatter.addStartDate"
        :name="m.journal_fm_field_label({ field: 'startDateField' })"
      >
        {{ config.frontmatter.startDateField }}
        <UiIconButton
          icon="pencil"
          :tooltip="`${m.journal_fm_field_label({ field: 'startDateField' })} edit`"
          @click="editFm('startDateField')"
        />
      </UiSettingRow>

      <UiSettingRow :name="m.journal_edit_fm_end_toggle_label()">
        <UiToggle v-model="config.frontmatter.addEndDate" />
      </UiSettingRow>
      <UiSettingRow v-if="config.frontmatter.addEndDate" :name="m.journal_fm_field_label({ field: 'endDateField' })">
        {{ config.frontmatter.endDateField }}
        <UiIconButton
          icon="pencil"
          :tooltip="`${m.journal_fm_field_label({ field: 'endDateField' })} edit`"
          @click="editFm('endDateField')"
        />
      </UiSettingRow>
    </UiCollapsibleBlock>
  </div>
</template>

<style scoped>
.journal-section-heading {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2-2);
  font-weight: var(--font-semibold);
}
.journal-hint {
  color: var(--text-warning);
}
.journal-form-error {
  color: var(--text-error);
  display: block;
}
</style>
```

- [ ] **Step 5: Run the test to verify it passes.**

```bash
npm run test -- --run src/journals/settings/ui/JournalEditSubpage.test.ts
```

Expected: PASS (9 tests).

- [ ] **Step 6: Lint + typecheck + commit.**

```bash
npm run check:lint && npm run check:types
git add src/journals/settings/ui/JournalEditSubpage.vue src/journals/settings/ui/JournalEditSubpage.test.ts src/journals/settings/ui/journals-subpage.ts
git -c commit.gpgsign=false commit -m "feat(journals): JournalEditSubpage with timeline/sequence/fm sections"
```

---

## Task 16: `JournalsDashboardBlock`

**Background.** Lists journals from `collection.entries`. Each row has edit (push subpage directly), rename (flow), delete (flow). Add-journal button at top.

**Files:**

- Create: `src/journals/settings/ui/JournalsDashboardBlock.vue`
- Create: `src/journals/settings/ui/JournalsDashboardBlock.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `src/journals/settings/ui/JournalsDashboardBlock.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { SettingsService, SettingsUiService } from "@/settings";
import { createSettingsService } from "@/settings/testing";

import { AddJournalFlow } from "../flows/add-journal.flow";
import { DeleteJournalFlow } from "../flows/delete-journal.flow";
import { RenameJournalFlow } from "../flows/rename-journal.flow";

import JournalsDashboardBlock from "./JournalsDashboardBlock.vue";
import { journalEditSubpage } from "./journals-subpage";

function makeJournal(name: string) {
  return {
    name,
    write: { type: "day" as const },
    timeline: { start: "", end: { kind: "never" as const } },
    dateFormat: "YYYY-MM-DD",
    frontmatter: {
      dateField: "journal-date",
      startDateField: "journal-start-date",
      endDateField: "journal-end-date",
      addStartDate: false,
      addEndDate: false,
    },
    numbering: { enabled: false, anchorDate: "", allowBefore: false, sources: [] },
  };
}

async function setup(initialJournals: string[] = []) {
  const raw =
    initialJournals.length === 0
      ? undefined
      : { version: 3, journals: Object.fromEntries(initialJournals.map((n) => [n, makeJournal(n)])) };
  const { service: settings, container } = createSettingsService({ collections: [journalConfigCollection], raw });
  await settings.initialize();
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container.register(SettingsUiService).useClass(SettingsUiService);
  container.register(Flows).useClass(Flows);
  const flows = container.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  container.register(Flows).useValue(flows);
  return { container, settings, flows, ui: container.resolve(SettingsUiService) };
}

function mount(container: Container) {
  return render(JournalsDashboardBlock, {
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

afterEach(() => cleanup());

describe("JournalsDashboardBlock", () => {
  it("shows the empty state when no journals exist", async () => {
    const { container } = await setup();
    mount(container);
    expect(screen.getByText(m.journal_dashboard_empty())).toBeTruthy();
  });

  it("renders one row per journal sorted by name", async () => {
    const { container } = await setup(["zeta", "alpha"]);
    mount(container);
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]?.textContent).toContain("alpha");
    expect(rows[1]?.textContent).toContain("zeta");
  });

  it("invokes AddJournalFlow when Add is clicked", async () => {
    const { container, flows } = await setup();
    mount(container);
    await userEvent.click(screen.getByText(m.journal_dashboard_add()));
    expect(flows.invoke).toHaveBeenCalledWith(AddJournalFlow, undefined);
  });

  it("pushes the edit subpage when Edit is clicked", async () => {
    const { container, ui } = await setup(["daily"]);
    mount(container);
    await userEvent.click(screen.getByLabelText(`${m.journal_dashboard_edit()} daily`));
    expect(ui.current.value?.subpage.key).toBe("journal-edit");
    expect(ui.current.value?.props).toEqual({ journalName: "daily" });
  });

  it("invokes RenameJournalFlow when Rename is clicked", async () => {
    const { container, flows } = await setup(["daily"]);
    mount(container);
    await userEvent.click(screen.getByLabelText(`${m.journal_dashboard_rename()} daily`));
    expect(flows.invoke).toHaveBeenCalledWith(RenameJournalFlow, { journalName: "daily" });
  });

  it("invokes DeleteJournalFlow when Delete is clicked", async () => {
    const { container, flows } = await setup(["daily"]);
    mount(container);
    await userEvent.click(screen.getByLabelText(`${m.journal_dashboard_delete()} daily`));
    expect(flows.invoke).toHaveBeenCalledWith(DeleteJournalFlow, { journalName: "daily" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

```bash
npm run test -- --run src/journals/settings/ui/JournalsDashboardBlock.test.ts
```

- [ ] **Step 3: Create `src/journals/settings/ui/JournalsDashboardBlock.vue`.**

```vue
<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { journalConfigCollection, type JournalConfig } from "@/journals";
import { SettingsService, SettingsUiService } from "@/settings";
import UiButton from "@/ui/UiButton.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { describeWrite } from "../describe-write";
import { AddJournalFlow } from "../flows/add-journal.flow";
import { DeleteJournalFlow } from "../flows/delete-journal.flow";
import { RenameJournalFlow } from "../flows/rename-journal.flow";

import { journalEditSubpage } from "./journals-subpage";

const settings = useService(SettingsService);
const ui = useService(SettingsUiService);
const flows = useService(Flows);
const collection = settings.getCollection(journalConfigCollection);

const entries = computed<[string, JournalConfig][]>(() =>
  Object.entries(collection.entries as Record<string, JournalConfig>).sort(([a], [b]) => a.localeCompare(b)),
);

function add(): void {
  void flows.invoke(AddJournalFlow, undefined);
}
function edit(journalName: string): void {
  ui.push(journalEditSubpage, { journalName });
}
function rename(journalName: string): void {
  void flows.invoke(RenameJournalFlow, { journalName });
}
function remove(journalName: string): void {
  void flows.invoke(DeleteJournalFlow, { journalName });
}
</script>

<template>
  <UiSettingRow heading>
    <template #name>{{ m.journal_dashboard_section_title() }}</template>
    <UiButton cta @click="add">{{ m.journal_dashboard_add() }}</UiButton>
  </UiSettingRow>
  <UiSettingRow v-if="entries.length === 0" no-controls>
    <template #description>{{ m.journal_dashboard_empty() }}</template>
  </UiSettingRow>
  <ul v-else class="journal-dashboard-list">
    <li v-for="[name, config] in entries" :key="name">
      <UiSettingRow>
        <template #name>
          {{ name }}
          <span class="flair">{{ m.journal_write(describeWrite(config.write)) }}</span>
        </template>
        <UiIconButton icon="pencil" :tooltip="`${m.journal_dashboard_edit()} ${name}`" @click="edit(name)" />
        <UiIconButton
          icon="case-sensitive"
          :tooltip="`${m.journal_dashboard_rename()} ${name}`"
          @click="rename(name)"
        />
        <UiIconButton icon="trash-2" :tooltip="`${m.journal_dashboard_delete()} ${name}`" @click="remove(name)" />
      </UiSettingRow>
    </li>
  </ul>
</template>

<style scoped>
.journal-dashboard-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
</style>
```

- [ ] **Step 4: Run the test to verify it passes.**

```bash
npm run test -- --run src/journals/settings/ui/JournalsDashboardBlock.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Lint + typecheck + commit.**

```bash
npm run check:lint && npm run check:types
git add src/journals/settings/ui/JournalsDashboardBlock.vue src/journals/settings/ui/JournalsDashboardBlock.test.ts
git -c commit.gpgsign=false commit -m "feat(journals): JournalsDashboardBlock with add/edit/rename/delete"
```

---

## Task 17: Module wiring + main.ts + barrel

**Files:**

- Create: `src/journals/settings/module.ts`
- Modify: `src/journals/index.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Create the module.**

`src/journals/settings/module.ts`:

```ts
import type { Module } from "@/infrastructure/di";
import { DashboardBlockToken, defineDashboardBlock, SubpageToken } from "@/settings";

import { AddJournalFlow } from "./flows/add-journal.flow";
import { DeleteJournalFlow } from "./flows/delete-journal.flow";
import { EditFrontmatterFieldFlow } from "./flows/edit-frontmatter-field.flow";
import { EditSequencePropertyFlow } from "./flows/edit-sequence-property.flow";
import { RenameJournalFlow } from "./flows/rename-journal.flow";
import { JournalLifecycleService } from "./lifecycle";
import JournalsDashboardBlock from "./ui/JournalsDashboardBlock.vue";
import { journalEditSubpage } from "./ui/journals-subpage";

import type { Component } from "vue";

export const journalsSettingsModule: Module = {
  register(c) {
    c.register(JournalLifecycleService).useClass(JournalLifecycleService);
    c.register(AddJournalFlow).useClass(AddJournalFlow);
    c.register(RenameJournalFlow).useClass(RenameJournalFlow);
    c.register(DeleteJournalFlow).useClass(DeleteJournalFlow);
    c.register(EditFrontmatterFieldFlow).useClass(EditFrontmatterFieldFlow);
    c.register(EditSequencePropertyFlow).useClass(EditSequencePropertyFlow);
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "journals", component: JournalsDashboardBlock as Component, order: 5 }),
    );
    c.register(SubpageToken).useValue(journalEditSubpage);
  },
};
```

- [ ] **Step 2: Update the journals barrel.**

Edit `src/journals/index.ts` to add at the bottom:

```ts
export { journalsSettingsModule } from "./settings/module";
```

- [ ] **Step 3: Wire into main.ts.**

Edit `src/main.ts` — add the import alongside `journalsModule` and register the module after `journalsModule`:

```ts
import { journalsModule } from "@/journals/module";
import { journalsSettingsModule } from "@/journals";
```

And in `onload`:

```ts
container.addModule(journalsModule);
container.addModule(journalsSettingsModule);
```

- [ ] **Step 4: Run the full suite.**

```bash
npm run check:lint && npm run check:types && npm run test -- --run
```

Expected: all tests pass.

- [ ] **Step 5: Commit.**

```bash
git add src/journals/settings/module.ts src/journals/index.ts src/main.ts
git -c commit.gpgsign=false commit -m "feat(journals): wire journalsSettingsModule into main.ts"
```

---

## Task 18: Manual UI smoke

**Background.** Type/lint/test coverage doesn't prove the dashboard renders inside an Obsidian-shell settings tab or that the flows wire to real modals. This step runs the dev build inside a test vault.

- [ ] **Step 1: Build the plugin.**

```bash
npm run build
```

Expected: build succeeds; `main.js` + `styles.css` updated in `build/`.

- [ ] **Step 2: Open the test vault and reload the plugin.**

In Obsidian (or your test vault under `test-vault/`), open Settings → Plugin settings → Journal. Verify:

- The "Journals" section appears above "Calendar".
- "No journals created yet." is shown when the collection is empty.
- Clicking "Add journal" opens a modal with name + write fields. Submit with a fixed write → modal closes, edit subpage shows up.
- The edit subpage shows three collapsible sections (Timeline / Sequential numbers / Frontmatter) plus the date-format row.
- Toggle a date format value → DateFormatPreview re-renders.
- Enable Sequential numbers → property name row appears.
- Click the date-property pencil → modal opens with the current value pre-filled. Submit → row updates.
- From the dashboard list, click rename → modal. Submit → row reflects the new name.
- Click delete → confirmation modal with disabled options. Submit Keep → row removed.

- [ ] **Step 3: Inspect `data.json` after each action** (`test-vault/.obsidian/plugins/<your-plugin>/data.json`). Verify the `journals` map matches the on-screen state.

- [ ] **Step 4: If a smoke step fails, file the bug locally** (don't paper over it with disabled tests); fix the bug and re-run the relevant `npm run test -- --run path/...`.

- [ ] **Step 5: Final commit (only if any cleanup needed).**

```bash
git status
# If anything is staged, commit with a focused message; otherwise skip.
```

---

## Closing checks

Run once at the end:

```bash
npm run check:lint
npm run check:types
npm run test -- --run
```

All three must pass. Then verify there are no orphaned files:

```bash
git status
git log --oneline -25
```

The branch should show one focused commit per task (18 commits in this plan, or 19 if Task 18 produced a cleanup commit).

---

## Self-review notes (already applied to the plan above)

- **Spec coverage:** Every section in `2026-05-16-v3-journal-settings-ui-design.md` has at least one task. The five flows are Tasks 10–14; the five modals are Tasks 5–9; the dashboard block is Task 16; the edit subpage is Task 15; the lifecycle service is Task 2; errors are Task 1; describe-write is Task 3; DateFormatPreview is Task 4; i18n keys are Task 0; module + main.ts wiring is Task 17.
- **Placeholder scan:** No "TBD"/"TODO"/"similar to Task N"/"appropriate error handling". Every code block is the actual file content. Test files are written before the source files in every TDD task.
- **Type consistency:** `FrontmatterFieldName` is defined once in `edit-frontmatter-field-modal.ts` and reused by the flow + edit subpage. `WriteDescriptor` defined once in `describe-write.ts`. `JournalLifecycleError` (union) defined in `errors.ts` and consumed by `toFlowError`. Flow method signatures match the modal definitions' generic params (`AddJournalFlow.execute()` returns `AsyncResult<{name}, FlowError>`; the modal resolves `{name, write}` which the flow destructures).
- **Cross-task ordering:** The `journals-subpage.ts` shell is created in Task 10 (when `AddJournalFlow` first needs it), then replaced with the real Vue import in Task 15 once the component exists. This avoids forward-import issues for the flow tests.
