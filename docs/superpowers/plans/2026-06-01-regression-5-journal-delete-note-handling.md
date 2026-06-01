# Regression #5 — Journal delete `clear`/`delete` note handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the v2 `clear` / `delete` note dispositions when deleting a journal, so connected notes can have their journal frontmatter stripped or be trashed, not just left orphaned.

**Architecture:** Two journal-wide best-effort methods (`disconnectAll`, `deleteAll`) on `NoteConnectionService` snapshot the journal's index entries and run the per-note op concurrently. `DeleteJournalFlow` dispatches on the modal's mode with `ts-pattern` and runs the purge **before** deleting the config (so custom frontmatter keys still resolve). `DeleteJournalModal` is unstubbed: it returns the real selected mode and enables the `clear`/`delete` options.

**Tech Stack:** TypeScript, Vue 3 SFC, `AsyncResult`/`attempt` Result types, `ts-pattern`, vitest, `@testing-library/vue` + `user-event`, paraglide i18n (`messages/en.json`).

Design doc: `docs/superpowers/specs/2026-06-01-regression-5-journal-delete-note-handling-design.md`

**Project conventions to honor (from repo memory):**

- After each task run `npm run test`, `npm run check:types`, `npm run check:lint`.
- One behavior per test; black-box assertions; subject+verb test names; nested `describe`.
- `ts-pattern` `match().with().exhaustive()` for union dispatch (never `switch`).
- Compose Result pipelines with `attempt.in(this, async function* …)`; never shadow `this.#field`.
- No `eslint-disable`, no Co-Authored-By trailer, commit to the current branch (`v3-ai`).

---

## File Structure

- `src/journals/notes/note-connection.ts` — **modify**: add `disconnectAll` / `deleteAll` + private `#purge` helper beside `disconnect`.
- `src/journals/notes/note-connection.test.ts` — **modify**: add `disconnectAll` / `deleteAll` describes.
- `src/journals/settings/ui/modals.ts` — **modify**: widen `deleteJournalModal` result type.
- `src/journals/settings/ui/DeleteJournalModal.vue` — **modify**: return real mode, enable options, drop not-implemented hint.
- `src/journals/settings/ui/DeleteJournalModal.test.ts` — **modify**: select-mode + enabled-option tests; drop hint test.
- `src/journals/settings/flows/delete-journal.flow.ts` — **modify**: capture mode, dispatch purge before config delete, inject `NoteConnectionService`.
- `src/journals/settings/flows/delete-journal.flow.test.ts` — **modify**: register `NoteConnectionService` stand-in; add clear/delete/ordering tests.
- `messages/en.json` — **modify**: remove `journal_delete_mode_not_implemented_hint`; drop "(not yet supported)" from the `clear`/`delete` option strings.

---

## Task 1: `disconnectAll` / `deleteAll` on `NoteConnectionService`

**Files:**

- Modify: `src/journals/notes/note-connection.ts`
- Test: `src/journals/notes/note-connection.test.ts`

- [ ] **Step 1: Update test-file imports**

In `src/journals/notes/note-connection.test.ts`, add `vi` to the vitest import and import the two host errors used to simulate failures.

Change line 1 from:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
```

to:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
```

And add to the `@/infrastructure/host` import (which currently imports `NotesService, TemplaterService` and the `VaultPath` type) the two error classes. The existing host imports are on lines 5-6:

```ts
import { NotesService, TemplaterService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
```

Add below them:

```ts
import { NoteDeleteError, NoteNotFoundError } from "@/infrastructure/host";
```

`AsyncResult` is also used by the new tests and is **not yet imported** in this file. Add it alongside the existing `@/infrastructure/result/testing` import (line 11 imports `expectOk` from `@/infrastructure/result/testing`):

```ts
import { AsyncResult } from "@/infrastructure/result";
```

- [ ] **Step 2: Write the failing tests**

Add these two `describe` blocks inside the top-level `describe("NoteConnectionService", …)` block, after the existing `describe("disconnect", …)` block (before `describe("connect", …)`). The `build`, `readFrontmatter`, `fakeRepo`, `fixedJournal`, `anchor` helpers already exist in this file.

```ts
describe("disconnectAll", () => {
  it("strips the journal's frontmatter keys from every connected note", async () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
    const notes = new FakeNotesService();
    const first = "a.md" as VaultPath;
    const second = "b.md" as VaultPath;
    notes.seed(first, "content", { journal: "daily", "journal-date": "2026-06-01", title: "keep" });
    notes.seed(second, "content", { journal: "daily", "journal-date": "2026-06-02", title: "keep" });
    const { container, index } = build(repo, notes, new FakeModalService());
    index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: first });
    index.register({ journalName: "daily", anchor: anchor("2026-06-02"), path: second });

    await container.resolve(NoteConnectionService).disconnectAll("daily");

    expect(await readFrontmatter(notes, first)).toEqual({ title: "keep" });
    expect(await readFrontmatter(notes, second)).toEqual({ title: "keep" });
  });

  it("clears the remaining notes when one note's update fails", async () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
    const notes = new FakeNotesService();
    const failing = "a.md" as VaultPath;
    const surviving = "b.md" as VaultPath;
    notes.seed(failing, "content", { journal: "daily", "journal-date": "2026-06-01", title: "keep" });
    notes.seed(surviving, "content", { journal: "daily", "journal-date": "2026-06-02", title: "keep" });
    const { container, index } = build(repo, notes, new FakeModalService());
    index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: failing });
    index.register({ journalName: "daily", anchor: anchor("2026-06-02"), path: surviving });
    const original = notes.updateFrontmatter.bind(notes);
    vi.spyOn(notes, "updateFrontmatter").mockImplementation((path, mutate) =>
      path === failing ? AsyncResult.err(new NoteNotFoundError(failing)) : original(path, mutate),
    );

    await container.resolve(NoteConnectionService).disconnectAll("daily");

    expect(await readFrontmatter(notes, surviving)).toEqual({ title: "keep" });
  });
});

describe("deleteAll", () => {
  it("trashes every connected note", async () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
    const notes = new FakeNotesService();
    const first = "a.md" as VaultPath;
    const second = "b.md" as VaultPath;
    notes.seed(first, "content", { journal: "daily", "journal-date": "2026-06-01" });
    notes.seed(second, "content", { journal: "daily", "journal-date": "2026-06-02" });
    const { container, index } = build(repo, notes, new FakeModalService());
    index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: first });
    index.register({ journalName: "daily", anchor: anchor("2026-06-02"), path: second });

    await container.resolve(NoteConnectionService).deleteAll("daily");

    expect(notes.find(first).isNone()).toBe(true);
    expect(notes.find(second).isNone()).toBe(true);
  });

  it("trashes the remaining notes when one note's deletion fails", async () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
    const notes = new FakeNotesService();
    const failing = "a.md" as VaultPath;
    const surviving = "b.md" as VaultPath;
    notes.seed(failing, "content", { journal: "daily", "journal-date": "2026-06-01" });
    notes.seed(surviving, "content", { journal: "daily", "journal-date": "2026-06-02" });
    const { container, index } = build(repo, notes, new FakeModalService());
    index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: failing });
    index.register({ journalName: "daily", anchor: anchor("2026-06-02"), path: surviving });
    const original = notes.delete.bind(notes);
    vi.spyOn(notes, "delete").mockImplementation((path) =>
      path === failing ? AsyncResult.err(new NoteDeleteError(failing, new Error("boom"))) : original(path),
    );

    await container.resolve(NoteConnectionService).deleteAll("daily");

    expect(notes.find(surviving).isNone()).toBe(true);
  });
});
```

Note: `AsyncResult` and `FakeNotesService` are already imported in this test file (`AsyncResult` via `@/infrastructure/result`? — verify; if not imported, add `import { AsyncResult } from "@/infrastructure/result";`). `FakeNotesService` is imported on line 9.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test -- src/journals/notes/note-connection.test.ts`
Expected: FAIL — `disconnectAll` / `deleteAll` are not functions on `NoteConnectionService`.

- [ ] **Step 4: Implement `disconnectAll` / `deleteAll` + `#purge`**

In `src/journals/notes/note-connection.ts`, add these three members to the `NoteConnectionService` class, immediately after the `disconnect(...)` method (around line 95, before `#combine`). No new imports are needed — `AsyncResult`, `VaultPath`, and `this.#index` are already in scope.

```ts
  disconnectAll(journalName: string): AsyncResult<void, never> {
    return this.#purge(journalName, (path) => this.disconnect(path));
  }

  deleteAll(journalName: string): AsyncResult<void, never> {
    return this.#purge(journalName, (path) => this.#notes.delete(path));
  }

  #purge(journalName: string, op: (path: VaultPath) => AsyncResult<void, unknown>): AsyncResult<void, never> {
    const paths = [...this.#index.entriesFor(journalName)].map(([, path]) => path);
    // Best-effort, matching v2: an AsyncResult never rejects, so Promise.all settles even when
    // individual notes fail. We discard the per-note Results so one bad note can't strand the
    // journal config. Spreading entriesFor up front snapshots paths before the ops mutate the index.
    return AsyncResult.fromPromise(
      Promise.all(paths.map((path) => op(path))).then(() => undefined),
      () => undefined as never,
    );
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test -- src/journals/notes/note-connection.test.ts`
Expected: PASS (all `disconnect`, `disconnectAll`, `deleteAll`, `connect` tests green).

- [ ] **Step 6: Type-check and lint**

Run: `npm run check:types && npm run check:lint`
Expected: no errors. (If `check:lint` flags `undefined as never`, do NOT add an eslint-disable — instead restructure to satisfy the rule, e.g. keep the comment and cast; the cast on an unreachable branch is the intended shape.)

- [ ] **Step 7: Commit**

```bash
git add src/journals/notes/note-connection.ts src/journals/notes/note-connection.test.ts
git commit -m "feat(journals): add disconnectAll/deleteAll to NoteConnectionService"
```

---

## Task 2: Unstub `DeleteJournalModal` (mode selection + enabled options)

**Files:**

- Modify: `src/journals/settings/ui/modals.ts:26-29`
- Modify: `src/journals/settings/ui/DeleteJournalModal.vue`
- Modify: `messages/en.json`
- Test: `src/journals/settings/ui/DeleteJournalModal.test.ts`

- [ ] **Step 1: Update the modal-component tests**

Replace the body of `describe("DeleteJournalModal", …)` in `src/journals/settings/ui/DeleteJournalModal.test.ts` (lines 39-74) with the following. Also update the `api` type in `mountModal` (line 17) from `ModalApi<{ mode: "keep" }>` to the union.

Change line 17:

```ts
const api: ModalApi<{ mode: "keep" }> = { submit, cancel };
```

to:

```ts
const api: ModalApi<{ mode: "keep" | "clear" | "delete" }> = { submit, cancel };
```

Replace lines 39-74 (`describe("DeleteJournalModal", …)`) with:

```ts
describe("DeleteJournalModal", () => {
  it("submits with mode keep by default on Delete", async () => {
    const { submit } = mountModal("daily");
    await userEvent.click(screen.getByText(m.common_action_delete()));
    expect(submit).toHaveBeenCalledWith({ mode: "keep" });
  });

  it("submits with the selected mode on Delete", async () => {
    const { submit } = mountModal("daily");
    await userEvent.selectOptions(screen.getByRole("combobox"), "clear");
    await userEvent.click(screen.getByText(m.common_action_delete()));
    expect(submit).toHaveBeenCalledWith({ mode: "clear" });
  });

  it("renders the clear option as enabled", () => {
    mountModal("daily");
    const option = screen.getByText(m.journal_delete_mode_option({ mode: "clear" }));
    expect(option.hasAttribute("disabled")).toBe(false);
  });

  it("renders the delete option as enabled", () => {
    mountModal("daily");
    const option = screen.getByText(m.journal_delete_mode_option({ mode: "delete" }));
    expect(option.hasAttribute("disabled")).toBe(false);
  });

  it("renders the keep option as enabled", () => {
    mountModal("daily");
    const option = screen.getByText(m.journal_delete_mode_option({ mode: "keep" }));
    expect(option.hasAttribute("disabled")).toBe(false);
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = mountModal("daily");
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
```

(The old "renders the not-implemented hint" test is removed because the message is deleted in Step 4.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/journals/settings/ui/DeleteJournalModal.test.ts`
Expected: FAIL — selecting `clear` still submits `{ mode: "keep" }`, and the options still carry `disabled`.

- [ ] **Step 3: Widen the modal result type in `modals.ts`**

In `src/journals/settings/ui/modals.ts`, change line 26 from:

```ts
export const deleteJournalModal = defineModal<{ mode: "keep" }>()({
```

to:

```ts
export const deleteJournalModal = defineModal<{ mode: "keep" | "clear" | "delete" }>()({
```

- [ ] **Step 4: Rewrite `DeleteJournalModal.vue`**

Replace the entire contents of `src/journals/settings/ui/DeleteJournalModal.vue` with:

```vue
<script setup lang="ts">
import { ref } from "vue";

import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

defineProps<{ journalName: string }>();

const api = useModal<{ mode: "keep" | "clear" | "delete" }>();
const mode = ref<"keep" | "clear" | "delete">("keep");

function submit(): void {
  api.submit({ mode: mode.value });
}
</script>

<template>
  <UiSettingRow :name="m.journal_delete_mode_label()">
    <UiDropdown v-model="mode">
      <option value="keep">{{ m.journal_delete_mode_option({ mode: "keep" }) }}</option>
      <option value="clear">{{ m.journal_delete_mode_option({ mode: "clear" }) }}</option>
      <option value="delete">{{ m.journal_delete_mode_option({ mode: "delete" }) }}</option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow controls-only>
    <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
    <UiButton cta warning @click="submit">{{ m.common_action_delete() }}</UiButton>
  </UiSettingRow>
</template>
```

- [ ] **Step 5: Update `messages/en.json`**

Remove the `journal_delete_mode_not_implemented_hint` entry (line 678) and drop the "(not yet supported)" suffixes from the `clear`/`delete` option strings (lines 685-686).

Delete this line entirely:

```json
  "journal_delete_mode_not_implemented_hint": "Clear and Delete modes will land with the notes-IO service.",
```

Change lines 685-686 from:

```json
        "mode=clear": "Clear journal data (not yet supported)",
        "mode=delete": "Delete notes (not yet supported)"
```

to:

```json
        "mode=clear": "Clear journal data",
        "mode=delete": "Delete notes"
```

Verify the JSON stays valid (no dangling comma where the deleted line was — line 677 `journal_delete_mode_label` keeps its trailing comma because `journal_delete_mode_option` still follows it).

- [ ] **Step 6: Run the modal tests to verify they pass**

Run: `npm run test -- src/journals/settings/ui/DeleteJournalModal.test.ts`
Expected: PASS.

If paraglide compiles messages at build/test time and `m.journal_delete_mode_not_implemented_hint` is referenced anywhere else, the type-check in Step 7 will catch it. (Grep confirms the only references are in the modal `.vue` and its test, both updated here.)

- [ ] **Step 7: Type-check and lint**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/journals/settings/ui/modals.ts src/journals/settings/ui/DeleteJournalModal.vue src/journals/settings/ui/DeleteJournalModal.test.ts messages/en.json
git commit -m "feat(journals): let DeleteJournalModal choose keep/clear/delete"
```

---

## Task 3: Wire `DeleteJournalFlow` to purge notes by mode

**Files:**

- Modify: `src/journals/settings/flows/delete-journal.flow.ts`
- Test: `src/journals/settings/flows/delete-journal.flow.test.ts`

- [ ] **Step 1: Update the flow test harness and add dispatch tests**

In `src/journals/settings/flows/delete-journal.flow.test.ts`:

(a) Add imports. `vi` is added to the existing `vitest` import (line 2: `import { describe, expect, it } from "vitest";` → add `vi`). `NoteConnectionService` is **not** re-exported from any barrel, so import it from its module directly. Add:

```ts
import { AsyncResult } from "@/infrastructure/result";
import { NoteConnectionService } from "@/journals/notes/note-connection";
```

(b) Replace the `build` helper (lines 23-41) so it registers a recording `NoteConnectionService` stand-in and returns it:

```ts
async function build(initial: Record<string, JournalConfig> = {}) {
  const { container } = createSettingsService({ collections: [] });
  const storage = reactive<Record<string, JournalConfig>>({ ...initial });
  const events = createNanoEvents<JournalsEvents>();
  const repo = JournalsRepository.fromParts(storage, events);
  const modals = new FakeModalService();
  const connection = {
    disconnectAll: vi.fn((_journalName: string) => AsyncResult.ok()),
    deleteAll: vi.fn((_journalName: string) => AsyncResult.ok()),
  };
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(JournalsRepository).useValue(repo);
  container.register(NoteConnectionService).useValue(connection as unknown as NoteConnectionService);
  container.register(SubpageToken).useValue(journalEditSubpage);
  container.register(SettingsUiService).useClass(SettingsUiService);
  container.register(Flows).useClass(Flows);
  container.register(DeleteJournalFlow).useClass(DeleteJournalFlow);
  return {
    storage,
    modals,
    connection,
    flows: container.resolve(Flows),
    ui: container.resolve(SettingsUiService),
  };
}
```

(c) Update the four existing `modals.lastOpen<{ journalName: string }, { mode: "keep" }>()` generics to the widened result type. Change every occurrence of:

```ts
modals.lastOpen<{ journalName: string }, { mode: "keep" }>();
```

to:

```ts
modals.lastOpen<{ journalName: string }, { mode: "keep" | "clear" | "delete" }>();
```

(d) Add these tests inside `describe("DeleteJournalFlow", …)`:

```ts
it("routes clear mode to disconnectAll", async () => {
  const { flows, modals, connection } = await build({ daily: journalDefaultsFor({ type: "day" }, "daily") });
  const promise = flows.invoke(DeleteJournalFlow, { journalName: "daily" });
  modals.lastOpen<{ journalName: string }, { mode: "keep" | "clear" | "delete" }>().submit({ mode: "clear" });
  await promise;
  expect(connection.disconnectAll).toHaveBeenCalledWith("daily");
  expect(connection.deleteAll).not.toHaveBeenCalled();
});

it("routes delete mode to deleteAll", async () => {
  const { flows, modals, connection } = await build({ daily: journalDefaultsFor({ type: "day" }, "daily") });
  const promise = flows.invoke(DeleteJournalFlow, { journalName: "daily" });
  modals.lastOpen<{ journalName: string }, { mode: "keep" | "clear" | "delete" }>().submit({ mode: "delete" });
  await promise;
  expect(connection.deleteAll).toHaveBeenCalledWith("daily");
  expect(connection.disconnectAll).not.toHaveBeenCalled();
});

it("leaves connected notes untouched when mode is keep", async () => {
  const { flows, modals, connection } = await build({ daily: journalDefaultsFor({ type: "day" }, "daily") });
  const promise = flows.invoke(DeleteJournalFlow, { journalName: "daily" });
  modals.lastOpen<{ journalName: string }, { mode: "keep" | "clear" | "delete" }>().submit({ mode: "keep" });
  await promise;
  expect(connection.disconnectAll).not.toHaveBeenCalled();
  expect(connection.deleteAll).not.toHaveBeenCalled();
});

it("purges connected notes before removing the journal config", async () => {
  const { flows, modals, connection, storage } = await build({
    daily: journalDefaultsFor({ type: "day" }, "daily"),
  });
  let configPresentDuringPurge: boolean | undefined;
  connection.disconnectAll.mockImplementation((journalName: string) => {
    configPresentDuringPurge = storage[journalName] !== undefined;
    return AsyncResult.ok();
  });
  const promise = flows.invoke(DeleteJournalFlow, { journalName: "daily" });
  modals.lastOpen<{ journalName: string }, { mode: "keep" | "clear" | "delete" }>().submit({ mode: "clear" });
  await promise;
  expect(configPresentDuringPurge).toBe(true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/journals/settings/flows/delete-journal.flow.test.ts`
Expected: FAIL — the flow never calls `disconnectAll`/`deleteAll` (and may also fail to construct `DeleteJournalFlow` until Step 3 adds the injection; both are expected red states).

- [ ] **Step 3: Implement the dispatch in the flow**

Replace the entire contents of `src/journals/settings/flows/delete-journal.flow.ts` with:

```ts
import { match } from "ts-pattern";

import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt } from "@/infrastructure/result";
import { toFlowError } from "@/journals/errors";
import { NoteConnectionService } from "@/journals/notes/note-connection";
import { JournalsRepository } from "@/journals/repository";
import { SettingsUiService } from "@/settings";

import { deleteJournalModal } from "../ui/modals";

export class DeleteJournalFlow implements Flow<{ journalName: string }, void, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #repository = inject(JournalsRepository);
  readonly #connection = inject(NoteConnectionService);
  readonly #ui = inject(SettingsUiService);

  execute(parameters: { journalName: string }): AsyncResult<void, FlowError> {
    return attempt.in(this, async function* (this: DeleteJournalFlow) {
      const { mode } = yield* this.#modals
        .open(deleteJournalModal, { journalName: parameters.journalName })
        .mapErr(() => new UserAborted("delete-journal-modal"));

      // Purge before deleting the config: disconnect resolves the journal's custom
      // frontmatter field names from its config, which is gone after repository.delete.
      yield* match(mode)
        .with("clear", () => this.#connection.disconnectAll(parameters.journalName))
        .with("delete", () => this.#connection.deleteAll(parameters.journalName))
        .with("keep", () => AsyncResult.ok())
        .exhaustive();

      yield* this.#repository.delete(parameters.journalName).mapErr(toFlowError);
      const current = this.#ui.current.value;
      if (
        current?.subpage.key === "journal-edit" &&
        (current.props as { journalName: string }).journalName === parameters.journalName
      ) {
        this.#ui.pop();
      }
      return;
    });
  }
}
```

Note the import line changes vs. the original: `AsyncResult` is now imported as a value (was `type AsyncResult`), plus new imports for `match` and `NoteConnectionService`.

- [ ] **Step 4: Run the flow tests to verify they pass**

Run: `npm run test -- src/journals/settings/flows/delete-journal.flow.test.ts`
Expected: PASS (existing keep/pop/abort/unknown tests + new clear/delete/ordering tests).

- [ ] **Step 5: Full test + type-check + lint**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all green. (Full suite, since the modal-result-type widening touches shared types.)

- [ ] **Step 6: Commit**

```bash
git add src/journals/settings/flows/delete-journal.flow.ts src/journals/settings/flows/delete-journal.flow.test.ts
git commit -m "feat(journals): purge notes by mode on journal delete"
```

---

## Task 4: Close the gap in the audit doc

**Files:**

- Modify: `docs/2026-06-01-v2-v3-feature-gaps.md:41-43`

- [ ] **Step 1: Mark item #5 resolved**

In `docs/2026-06-01-v2-v3-feature-gaps.md`, change the item-5 checkbox and append a resolution note. Replace lines 41-43:

```markdown
- [ ] **5. Delete journal: `clear` / `delete` note handling** — stubbed.
  - v2: `removeJournal(name, notesProcessing)` with `keep | clear | delete` via `Journal.clearNotes()` / `deleteNotes()` (`src/_old-code/main.ts:233-259`).
  - v3: `src/journals/settings/ui/DeleteJournalModal.vue` hardcodes `{ mode: "keep" }`; `clear`/`delete` options rendered `disabled` with `journal_delete_mode_not_implemented_hint()`. No `clearNotes`/`deleteNotes` equivalent exists.
```

with:

```markdown
- [x] **5. Delete journal: `clear` / `delete` note handling** — ported.
  - v2: `removeJournal(name, notesProcessing)` with `keep | clear | delete` via `Journal.clearNotes()` / `deleteNotes()` (`src/_old-code/main.ts:233-259`).
  - v3: `NoteConnectionService.disconnectAll` / `deleteAll` (best-effort, snapshot the journal index via `entriesFor`); `DeleteJournalFlow` dispatches on the modal mode and purges before `repository.delete`. `DeleteJournalModal` returns the chosen mode with all options enabled. Delta: `delete` trashes (recoverable) via `NotesService.delete` rather than v2's permanent `vault.delete`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/2026-06-01-v2-v3-feature-gaps.md
git commit -m "docs(journals): mark gap #5 (delete clear/delete) resolved"
```

---

## Self-Review notes

- **Spec coverage:** `disconnectAll`/`deleteAll` (Task 1) ✓; flow ordering + ts-pattern dispatch + `NoteConnectionService` injection (Task 3) ✓; modal widening, enabled options, dropped hint (Task 2) ✓; trash-not-permanent and silent best-effort deltas covered by `deleteAll` using `NotesService.delete` and `#purge` discarding Results ✓; testing items map to Task 1/3 tests ✓.
- **Type consistency:** modal result type `{ mode: "keep" | "clear" | "delete" }` used identically in `modals.ts`, the `.vue`, the modal test, the flow, and the flow test. Method names `disconnectAll`/`deleteAll` consistent across service, flow, and both test files.
- **Import paths verified:** `NoteConnectionService` is not in any barrel, so flow and flow-test import from `@/journals/notes/note-connection`; `AsyncResult` is added to the note-connection test imports (not previously present).

```

```
