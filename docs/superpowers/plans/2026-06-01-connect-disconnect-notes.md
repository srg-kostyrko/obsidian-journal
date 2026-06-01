# Connect / Disconnect Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the v2 "Connect note to a journal" command + modal (which also disconnects) in v3, closing feature-gap #2 and #3.

**Architecture:** A new `NoteConnectionService` (in `src/journals/notes/`) orchestrates the existing `FrontmatterService`, `NotePathService`, `NotesService`, and `NoteCreationService` to connect a note to a journal's period anchor (with optional override/rename/move) and to disconnect a note by stripping its journal frontmatter. The journal index auto-syncs from frontmatter via `VaultSubscriptionService`, so this code never touches the index. A static `connect-note` command opens `ConnectNoteModal`, whose result a `ConnectNoteFlow` dispatches to the service. This plan is the first of two; bulk-add (gap #1) is a separate follow-up plan that reuses `NoteConnectionService`.

**Tech Stack:** TypeScript, `AsyncResult`/`Result` + `attempt.in` generators, valibot config, DI via `inject()`/`useService()`, Vue 3 SFC modals (`defineModal`/`useModal`), Vitest + `@testing-library/vue`, paraglide i18n (`m.*`).

---

## File Structure

- `src/journals/frontmatter.ts` (modify) — add `clearMutator(name)` next to `writeMutator`.
- `src/journals/notes/errors.ts` (modify) — add `AnchorOccupiedError`.
- `src/journals/notes/note-connection.ts` (create) — `NoteConnectionService` with `connect` + `disconnect`.
- `src/journals/notes/note-connection.test.ts` (create) — service unit tests.
- `src/journals/notes/module.ts` (modify) — register `NoteConnectionService`.
- `src/journals/notes/ui/ConnectNoteModal.vue` (create) — the combined connect/disconnect modal.
- `src/journals/notes/ui/ConnectNoteModal.test.ts` (create) — component tests.
- `src/journals/notes/ui/modals.ts` (modify) — add `connectNoteModal` definition + result type.
- `src/journals/notes/flows/connect-note.flow.ts` (create) — opens modal, dispatches result.
- `src/journals/notes/flows/connect-note.flow.test.ts` (create) — flow tests.
- `src/journals/notes/flows/module.ts` (create) — register notes flows.
- `src/journals/notes/note-connection-commands.ts` (create) — registers the static `connect-note` command.
- `src/journals/notes/note-connection-commands.test.ts` (create) — command-registration tests.
- `messages/en.json` (modify) — new i18n messages.
- `src/journals/frontmatter.test.ts` (modify) — `clearMutator` tests.

---

## Phase 1 — Shared foundation + Disconnect (Checkpoint 1)

### Task 1: `FrontmatterService.clearMutator`

**Files:**

- Modify: `src/journals/frontmatter.ts`
- Test: `src/journals/frontmatter.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/journals/frontmatter.test.ts` (follow the existing harness in that file for building a `FrontmatterService` over a journal config whose `frontmatter` fields are `dateField: "journal-date"`, `startDateField: "journal-start-date"`, `endDateField: "journal-end-date"` and one numbering source `{ variable: "index", frontmatterKey: "journal-index" }`):

```ts
describe("clearMutator", () => {
  it("deletes every journal-owned frontmatter key and leaves others intact", () => {
    const service = buildService(); // existing helper in this test file
    const mutator = service.clearMutator("daily");
    expect(mutator.isOk()).toBe(true);
    const fm: Record<string, unknown> = {
      journal: "daily",
      "journal-date": "2026-06-01",
      "journal-start-date": "2026-06-01",
      "journal-end-date": "2026-06-01",
      "journal-index": 12,
      title: "keep me",
    };
    mutator.getOr(() => {})(fm);
    expect(fm).toEqual({ title: "keep me" });
  });

  it("returns an error for an unknown journal", () => {
    const service = buildService();
    expect(service.clearMutator("nope").isErr()).toBe(true);
  });
});
```

If the existing test file's harness helper has a different name than `buildService`, reuse whatever that file already uses to construct a `FrontmatterService` with a known journal config.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/journals/frontmatter.test.ts`
Expected: FAIL — `clearMutator` is not a function.

- [ ] **Step 3: Implement `clearMutator`**

Add this method to `FrontmatterService` in `src/journals/frontmatter.ts`, directly after `writeMutator`:

```ts
clearMutator(name: string): Result<(fm: Record<string, unknown>) => void, JournalNotFoundError> {
  const configOpt = this.#journals.get(name);
  if (configOpt.isNone()) return new Err(new JournalNotFoundError(name));
  const config = configOpt.value;
  const fields = config.frontmatter;

  return new Ok((fm: Record<string, unknown>) => {
    delete fm[FRONTMATTER_NAME_KEY];
    delete fm[fields.dateField];
    delete fm[fields.startDateField];
    delete fm[fields.endDateField];
    for (const source of config.numbering.sources) delete fm[source.frontmatterKey];
  });
}
```

(`Err`, `Ok`, `Result`, `FRONTMATTER_NAME_KEY`, `JournalNotFoundError` are already imported in this file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/journals/frontmatter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journals/frontmatter.ts src/journals/frontmatter.test.ts
git commit -m "feat(journals): add FrontmatterService.clearMutator"
```

---

### Task 2: `AnchorOccupiedError` + `NoteConnectionService.disconnect`

**Files:**

- Modify: `src/journals/notes/errors.ts`
- Create: `src/journals/notes/note-connection.ts`
- Test: `src/journals/notes/note-connection.test.ts`

- [ ] **Step 1: Add the error**

Append to `src/journals/notes/errors.ts`:

```ts
export class AnchorOccupiedError extends JournalsError {
  override name = "AnchorOccupiedError";

  constructor(
    readonly journalName: string,
    readonly anchor: AnchorString,
    readonly occupantPath: string,
  ) {
    super(`Anchor ${anchor} in journal ${journalName} is already held by ${occupantPath}`);
  }
}
```

(`JournalsError` and `AnchorString` are already imported in that file.)

- [ ] **Step 2: Write the failing disconnect test**

Create `src/journals/notes/note-connection.test.ts`. Build the service over the journals DI graph the same way `src/journals/vault-subscription.test.ts` does (it registers `JournalsRepository` via `fakeRepo`, `JournalsIndex`, `CycleService`, `NumberingService`, `FrontmatterService`, `NotesService` as a fake, plus `NotePathService` over a fake `TemplateEngine`). Use a fake `NotesService` that records `updateFrontmatter` calls and a `NoteCreationService` fake that records `attachNote` calls.

```ts
import { describe, expect, it, vi } from "vitest";

import type { VaultPath } from "@/infrastructure/host";

import { JournalsIndex } from "../journals-index";

import { NoteConnectionService } from "./note-connection";

// buildService() returns { service, notes, index, creation } wired per the
// vault-subscription.test.ts harness, with one journal "daily" (daily period,
// folder "Journal", nameTemplate "{{date}}", default frontmatter fields).

describe("NoteConnectionService", () => {
  describe("disconnect", () => {
    it("strips the journal frontmatter keys from a connected note", async () => {
      const { service, notes, index } = buildService();
      index.register({ journalName: "daily", anchor: "2026-06-01", path: "Journal/2026-06-01.md" as VaultPath });
      const captured: Record<string, unknown> = {
        journal: "daily",
        "journal-date": "2026-06-01",
        title: "keep",
      };
      notes.updateFrontmatter = vi.fn((_p: VaultPath, mutate: (fm: Record<string, unknown>) => void) => {
        mutate(captured);
        return AsyncResultOk();
      });

      await service.disconnect("Journal/2026-06-01.md" as VaultPath);

      expect(captured).toEqual({ title: "keep" });
    });

    it("falls back to default keys for an orphaned note with no index entry", async () => {
      const { service, notes } = buildService();
      const captured: Record<string, unknown> = {
        journal: "deleted-journal",
        "journal-date": "2026-06-01",
        "journal-index": 3,
        body: "keep",
      };
      notes.updateFrontmatter = vi.fn((_p: VaultPath, mutate: (fm: Record<string, unknown>) => void) => {
        mutate(captured);
        return AsyncResultOk();
      });

      await service.disconnect("loose-note.md" as VaultPath);

      expect(captured).toEqual({ body: "keep" });
    });
  });
});
```

Use the repo's `AsyncResult.ok()` helper (imported from `@/infrastructure/result`) where the sketch writes `AsyncResultOk()`.

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- src/journals/notes/note-connection.test.ts`
Expected: FAIL — module `./note-connection` not found.

- [ ] **Step 4: Implement the service skeleton + `disconnect`**

Create `src/journals/notes/note-connection.ts`:

```ts
import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { NotesService } from "@/infrastructure/host";
import type {
  FrontmatterError,
  NoteNotFoundError,
  NoteRenameError,
  NoteAlreadyExistsError,
  VaultPath,
} from "@/infrastructure/host";
import { AsyncResult, attempt } from "@/infrastructure/result";

import { FrontmatterService } from "../frontmatter";
import type { JournalNotFoundError } from "../errors";
import { JournalsIndex } from "../journals-index";

import { AnchorOccupiedError } from "./errors";
import { NoteCreationService, type NoteCreationError } from "./note-creation";
import { NotePathService } from "./note-path";

const DEFAULT_JOURNAL_KEYS = ["journal", "journal-date", "journal-start-date", "journal-end-date", "journal-index"];

export type ConnectError =
  | NoteCreationError
  | AnchorOccupiedError
  | NoteRenameError
  | NoteAlreadyExistsError
  | NoteNotFoundError
  | FrontmatterError;

export type DisconnectError = NoteNotFoundError | FrontmatterError;

export interface ConnectOptions {
  override?: boolean;
  rename?: boolean;
  move?: boolean;
}

export class NoteConnectionService {
  readonly #notes = inject(NotesService);
  readonly #path = inject(NotePathService);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #creation = inject(NoteCreationService);
  readonly #index = inject(JournalsIndex);

  disconnect(path: VaultPath): AsyncResult<void, DisconnectError> {
    const entry = this.#index.entryByPath(path);
    const mutator = entry.isSome()
      ? this.#frontmatter.clearMutator(entry.value.journalName).getOr(this.#defaultClear)
      : this.#defaultClear;
    return this.#notes.updateFrontmatter(path, mutator);
  }

  readonly #defaultClear = (fm: Record<string, unknown>): void => {
    for (const key of DEFAULT_JOURNAL_KEYS) delete fm[key];
  };
}
```

(`JournalNotFoundError`, `attempt`, `AsyncResult`, the path/creation services are imported now because Task 3 uses them; that keeps Task 3's diff to one method. Lint will accept them once `connect` lands in the same checkpoint.)

If `check:lint` flags the as-yet-unused imports between Task 2 and Task 3, do Tasks 2 and 3 as a single commit; they belong to the same checkpoint.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- src/journals/notes/note-connection.test.ts`
Expected: PASS for the two `disconnect` tests.

- [ ] **Step 6: Commit (combined with Task 3 — see note)**

Hold the commit until Task 3 lands.

---

### Task 3: `NoteConnectionService.connect`

**Files:**

- Modify: `src/journals/notes/note-connection.ts`
- Modify: `src/journals/notes/note-connection.test.ts`
- Modify: `src/journals/notes/module.ts`

- [ ] **Step 1: Write the failing connect tests**

Add to `src/journals/notes/note-connection.test.ts`:

```ts
describe("connect", () => {
  it("attaches the note at the resolved anchor when the slot is free", async () => {
    const { service, creation } = buildService();
    const attach = vi.spyOn(creation, "attachNote");
    const result = await service.connect("daily", "inbox/note.md" as VaultPath, "2026-06-01");
    expect(result.isOk()).toBe(true);
    expect(attach).toHaveBeenCalledWith("daily", "inbox/note.md", expect.objectContaining({ anchor: "2026-06-01" }));
  });

  it("errors when another note holds the anchor and override is not set", async () => {
    const { service, index } = buildService();
    index.register({ journalName: "daily", anchor: "2026-06-01", path: "Journal/2026-06-01.md" as VaultPath });
    const result = await service.connect("daily", "inbox/note.md" as VaultPath, "2026-06-01");
    expect(result.isErr() && result.error).toBeInstanceOf(AnchorOccupiedError);
  });

  it("disconnects the occupant first when override is set", async () => {
    const { service, index } = buildService();
    index.register({ journalName: "daily", anchor: "2026-06-01", path: "Journal/2026-06-01.md" as VaultPath });
    const disconnect = vi.spyOn(service, "disconnect");
    const result = await service.connect("daily", "inbox/note.md" as VaultPath, "2026-06-01", { override: true });
    expect(result.isOk()).toBe(true);
    expect(disconnect).toHaveBeenCalledWith("Journal/2026-06-01.md");
  });

  it("renames the note to the configured path when rename is set", async () => {
    const { service, notes } = buildService();
    const rename = vi.spyOn(notes, "rename");
    await service.connect("daily", "inbox/note.md" as VaultPath, "2026-06-01", { rename: true, move: true });
    expect(rename).toHaveBeenCalledWith("inbox/note.md", "Journal/2026-06-01.md");
  });
});
```

Add the `AnchorOccupiedError` import to the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/journals/notes/note-connection.test.ts`
Expected: FAIL — `connect` is not a function.

- [ ] **Step 3: Implement `connect`**

Add to `NoteConnectionService` (above `#defaultClear`):

```ts
connect(
  journalName: string,
  path: VaultPath,
  anchor: AnchorString,
  options: ConnectOptions = {},
): AsyncResult<{ path: VaultPath }, ConnectError | JournalNotFoundError> {
  return attempt.in(this, async function* (this: NoteConnectionService) {
    const metadata = yield* this.#frontmatter.buildMetadata(journalName, anchor);

    const occupant = this.#index.entryByAnchor(journalName, anchor);
    if (occupant.isSome() && occupant.value.path !== path) {
      if (!options.override) {
        return yield* AsyncResult.err(new AnchorOccupiedError(journalName, anchor, occupant.value.path));
      }
      yield* this.disconnect(occupant.value.path);
    }

    let target = path;
    if (options.rename || options.move) {
      const configured = yield* this.#path.pathFor(journalName, metadata);
      target = this.#combine(path, configured, options) as VaultPath;
      if (target !== path) yield* this.#notes.rename(path, target).map(() => undefined);
    }

    yield* this.#creation.attachNote(journalName, target, metadata);
    return { path: target };
  });
}

#combine(current: VaultPath, configured: VaultPath, options: ConnectOptions): string {
  const split = (p: string): [string, string] => {
    const i = p.lastIndexOf("/");
    return i === -1 ? ["", p] : [p.slice(0, i), p.slice(i + 1)];
  };
  const [currentFolder, currentName] = split(current);
  const [configuredFolder, configuredName] = split(configured);
  const folder = options.move ? configuredFolder : currentFolder;
  const name = options.rename ? configuredName : currentName;
  return folder ? `${folder}/${name}` : name;
}
```

- [ ] **Step 4: Register the service**

In `src/journals/notes/module.ts`, add the import and registration:

```ts
import { NoteConnectionService } from "./note-connection";
```

```ts
c.register(NoteConnectionService).useClass(NoteConnectionService);
```

- [ ] **Step 5: Run the full gate**

Run: `npm run test -- src/journals/notes/note-connection.test.ts && npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/journals/notes/errors.ts src/journals/notes/note-connection.ts src/journals/notes/note-connection.test.ts src/journals/notes/module.ts
git commit -m "feat(journals): add NoteConnectionService connect/disconnect"
```

---

### Checkpoint 1

Run the full gate and pause for review:

```bash
npm run test && npm run check:types && npm run check:lint
```

Disconnect (gap #3) is complete and reused-ready; connect orchestration is in place for the command in Phase 2.

---

## Phase 2 — Connect command + modal (Checkpoint 2)

### Task 4: i18n messages

**Files:**

- Modify: `messages/en.json`

- [ ] **Step 1: Add messages**

Add these keys to `messages/en.json` (keep alphabetical grouping consistent with neighbors):

```json
"command_connect_note": "Connect note to a journal",
"connect_note_modal_journal_label": "Journal",
"connect_note_modal_date_label": "Date",
"connect_note_modal_override_label": "Replace the note already connected to this date",
"connect_note_modal_rename_label": "Rename file to match the journal",
"connect_note_modal_move_label": "Move file into the journal's folder",
"connect_note_modal_connect": "Connect",
"connect_note_modal_connected_to": "This note is connected to \"{journalName}\".",
"connect_note_modal_disconnect": "Disconnect"
```

There is no compile step to run here; the `m` proxy resolves keys at use. Verify the JSON parses:

Run: `node -e "require('./messages/en.json')"`
Expected: no output, exit 0.

- [ ] **Step 2: Commit**

```bash
git add messages/en.json
git commit -m "i18n: connect-note command and modal messages"
```

---

### Task 5: `ConnectNoteModal.vue` + `connectNoteModal` definition

**Files:**

- Modify: `src/journals/notes/ui/modals.ts`
- Create: `src/journals/notes/ui/ConnectNoteModal.vue`
- Test: `src/journals/notes/ui/ConnectNoteModal.test.ts`

- [ ] **Step 1: Add the modal definition + result type**

In `src/journals/notes/ui/modals.ts` add:

```ts
import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";

import ConnectNoteModal from "./ConnectNoteModal.vue";

export type ConnectNoteResult =
  | { action: "connect"; journalName: string; anchor: AnchorString; override: boolean; rename: boolean; move: boolean }
  | { action: "disconnect" };

export const connectNoteModal = defineModal<ConnectNoteResult>()({
  component: ConnectNoteModal,
  title: (_: { path: VaultPath }) => m.command_connect_note(),
});
```

- [ ] **Step 2: Write the failing component tests**

Create `src/journals/notes/ui/ConnectNoteModal.test.ts`. Build a DI container with the journals graph (mirror `src/journals/vault-subscription.test.ts`: `JournalsRepository` via `fakeRepo` with one journal "daily", plus `JournalsIndex`, `CycleService`, `NumberingService`, `FrontmatterService`, `NotePathService` over a fake `TemplateEngine`) and provide it with `provideInjectorOnApp`, alongside the modal api via `provideModalApiOnApp`.

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { provideInjectorOnApp } from "@/infrastructure/di";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";
import type { VaultPath } from "@/infrastructure/host";

import { JournalsIndex } from "../journals-index";

import ConnectNoteModal from "./ConnectNoteModal.vue";

afterEach(() => cleanup());

// mountModal(path) builds the container described above, registers an index
// (optionally pre-seeded), provides both injector + modal api, and returns
// { submit, cancel, index }.

describe("ConnectNoteModal", () => {
  it("offers Disconnect when the note is already connected", async () => {
    const { submit, index } = mountModal("Journal/2026-06-01.md");
    index.register({ journalName: "daily", anchor: "2026-06-01", path: "Journal/2026-06-01.md" as VaultPath });
    // re-render after seeding (or seed before mount in the helper)
    await userEvent.click(screen.getByText(m.connect_note_modal_disconnect()));
    expect(submit).toHaveBeenCalledWith({ action: "disconnect" });
  });

  it("submits a connect command for an unconnected note", async () => {
    const { submit } = mountModal("inbox/note.md");
    await userEvent.selectOptions(screen.getByLabelText(m.connect_note_modal_journal_label()), "daily");
    await userEvent.click(screen.getByText(m.connect_note_modal_connect()));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ action: "connect", journalName: "daily" }));
  });
});
```

Seed the index in the `mountModal` helper _before_ `render` for the disconnect case so the "already connected" branch is active at mount.

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- src/journals/notes/ui/ConnectNoteModal.test.ts`
Expected: FAIL — component does not exist.

- [ ] **Step 4: Implement the component**

Create `src/journals/notes/ui/ConnectNoteModal.vue`:

```vue
<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { CalendarDate } from "@/calendar";
import { useService } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { useModal } from "@/infrastructure/host/modals";
import { m } from "@/i18n";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { CycleService } from "../../cycle";
import { FrontmatterService } from "../../frontmatter";
import { JournalsIndex } from "../../journals-index";
import { JournalsRepository } from "../../repository";
import { NotePathService } from "../note-path";

import type { ConnectNoteResult } from "./modals";

const props = defineProps<{ path: VaultPath }>();
const api = useModal<ConnectNoteResult>();

const journals = useService(JournalsRepository);
const index = useService(JournalsIndex);
const cycle = useService(CycleService);
const frontmatter = useService(FrontmatterService);
const paths = useService(NotePathService);

const existing = index.entryByPath(props.path);
const journalNames = [...journals.find().ids()];

const selected = ref(journalNames[0] ?? "");
const dateStr = ref(CalendarDate.today().toAnchor());
const override = ref(false);
const rename = ref(false);
const move = ref(false);

watch(dateStr, () => {
  override.value = false;
  rename.value = false;
  move.value = false;
});

const anchor = computed(() => {
  if (!selected.value) return undefined;
  const parsed = CalendarDate.parse(dateStr.value);
  if (!parsed.isOk()) return undefined;
  return cycle.anchorOf(selected.value, parsed.value).getOr(undefined);
});

const occupant = computed(() => {
  const a = anchor.value;
  if (!a) return undefined;
  const found = index.entryByAnchor(selected.value, a);
  if (found.isNone() || found.value.path === props.path) return undefined;
  return found.value.path;
});

const configuredPath = computed(() => {
  const a = anchor.value;
  if (!a) return undefined;
  const meta = frontmatter.buildMetadata(selected.value, a);
  if (!meta.isOk()) return undefined;
  return paths.pathFor(selected.value, meta.value).getOr(undefined);
});

function split(p: string): [string, string] {
  const i = p.lastIndexOf("/");
  return i === -1 ? ["", p] : [p.slice(0, i), p.slice(i + 1)];
}

const needRename = computed(() => {
  if (!configuredPath.value) return false;
  return split(props.path)[1] !== split(configuredPath.value)[1];
});

const needMove = computed(() => {
  if (!configuredPath.value) return false;
  return split(props.path)[0] !== split(configuredPath.value)[0];
});

const canConnect = computed(() => Boolean(anchor.value) && (!occupant.value || override.value));

function disconnect(): void {
  api.submit({ action: "disconnect" });
}

function connect(): void {
  const a = anchor.value;
  if (!a) return;
  api.submit({
    action: "connect",
    journalName: selected.value,
    anchor: a,
    override: override.value,
    rename: rename.value,
    move: move.value,
  });
}
</script>

<template>
  <div v-if="existing.isSome()">
    <UiSettingRow>
      <template #description>
        {{ m.connect_note_modal_connected_to({ journalName: existing.getOr(undefined as never)?.journalName ?? "" }) }}
      </template>
    </UiSettingRow>
    <UiSettingRow>
      <UiButton cta @click="disconnect">{{ m.connect_note_modal_disconnect() }}</UiButton>
    </UiSettingRow>
  </div>
  <div v-else>
    <UiSettingRow>
      <template #name>{{ m.connect_note_modal_journal_label() }}</template>
      <select :aria-label="m.connect_note_modal_journal_label()" v-model="selected">
        <option v-for="name in journalNames" :key="name" :value="name">{{ name }}</option>
      </select>
    </UiSettingRow>
    <UiSettingRow>
      <template #name>{{ m.connect_note_modal_date_label() }}</template>
      <input type="date" :aria-label="m.connect_note_modal_date_label()" v-model="dateStr" />
    </UiSettingRow>
    <UiSettingRow v-if="occupant">
      <template #name>{{ m.connect_note_modal_override_label() }}</template>
      <input type="checkbox" :aria-label="m.connect_note_modal_override_label()" v-model="override" />
    </UiSettingRow>
    <UiSettingRow v-if="needRename">
      <template #name>{{ m.connect_note_modal_rename_label() }}</template>
      <input type="checkbox" :aria-label="m.connect_note_modal_rename_label()" v-model="rename" />
    </UiSettingRow>
    <UiSettingRow v-if="needMove">
      <template #name>{{ m.connect_note_modal_move_label() }}</template>
      <input type="checkbox" :aria-label="m.connect_note_modal_move_label()" v-model="move" />
    </UiSettingRow>
    <UiSettingRow>
      <UiButton cta :disabled="!canConnect" @click="connect">{{ m.connect_note_modal_connect() }}</UiButton>
    </UiSettingRow>
  </div>
</template>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- src/journals/notes/ui/ConnectNoteModal.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/journals/notes/ui/ConnectNoteModal.vue src/journals/notes/ui/ConnectNoteModal.test.ts src/journals/notes/ui/modals.ts
git commit -m "feat(journals): add ConnectNoteModal"
```

---

### Task 6: `ConnectNoteFlow`

**Files:**

- Create: `src/journals/notes/flows/connect-note.flow.ts`
- Test: `src/journals/notes/flows/connect-note.flow.test.ts`
- Create: `src/journals/notes/flows/module.ts`

- [ ] **Step 1: Write the failing flow tests**

Create `src/journals/notes/flows/connect-note.flow.test.ts`, following `src/shelves/flows/delete-shelf.flow.test.ts`: register `Flows`, a `FakeModalService` as `ModalService`, and a fake/spied `NoteConnectionService`.

```ts
import { describe, expect, it, vi } from "vitest";

import { Container } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { AsyncResult } from "@/infrastructure/result";
import type { VaultPath } from "@/infrastructure/host";

import { NoteConnectionService } from "../note-connection";

import { ConnectNoteFlow } from "./connect-note.flow";

function build() {
  const c = new Container();
  const connection = {
    connect: vi.fn(() => AsyncResult.ok({ path: "x.md" as VaultPath })),
    disconnect: vi.fn(() => AsyncResult.ok(undefined)),
  };
  const modals = new FakeModalService();
  c.register(ModalService).useValue(modals as unknown as ModalService);
  c.register(NoteConnectionService).useValue(connection as unknown as NoteConnectionService);
  c.register(Flows).useClass(Flows);
  c.register(ConnectNoteFlow).useClass(ConnectNoteFlow);
  return { flows: c.resolve(Flows), modals, connection };
}

describe("ConnectNoteFlow", () => {
  it("connects via the service when the modal returns a connect command", async () => {
    const { flows, modals, connection } = build();
    const promise = flows.invoke(ConnectNoteFlow, { path: "inbox/n.md" as VaultPath });
    modals
      .lastOpen()
      .submit({
        action: "connect",
        journalName: "daily",
        anchor: "2026-06-01",
        override: false,
        rename: false,
        move: false,
      });
    await promise;
    expect(connection.connect).toHaveBeenCalledWith("daily", "inbox/n.md", "2026-06-01", {
      override: false,
      rename: false,
      move: false,
    });
  });

  it("disconnects via the service when the modal returns a disconnect command", async () => {
    const { flows, modals, connection } = build();
    const promise = flows.invoke(ConnectNoteFlow, { path: "inbox/n.md" as VaultPath });
    modals.lastOpen().submit({ action: "disconnect" });
    await promise;
    expect(connection.disconnect).toHaveBeenCalledWith("inbox/n.md");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/journals/notes/flows/connect-note.flow.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the flow**

Create `src/journals/notes/flows/connect-note.flow.ts`:

```ts
import { match } from "ts-pattern";

import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import type { VaultPath } from "@/infrastructure/host";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import { NoteConnectionService, type ConnectError, type DisconnectError } from "../note-connection";
import { connectNoteModal } from "../ui/modals";

export class ConnectNoteFlow implements Flow<{ path: VaultPath }, void, ConnectError | DisconnectError | UserAborted> {
  readonly #modals = inject(ModalService);
  readonly #connection = inject(NoteConnectionService);

  execute(parameters: { path: VaultPath }): AsyncResult<void, ConnectError | DisconnectError | UserAborted> {
    return attempt.in(this, async function* (this: ConnectNoteFlow) {
      const command = yield* this.#modals
        .open(connectNoteModal, { path: parameters.path })
        .mapErr(() => new UserAborted("connect-note-modal"));

      yield* match(command)
        .with({ action: "connect" }, (c) =>
          this.#connection
            .connect(c.journalName, parameters.path, c.anchor, { override: c.override, rename: c.rename, move: c.move })
            .map(() => undefined),
        )
        .with({ action: "disconnect" }, () => this.#connection.disconnect(parameters.path))
        .exhaustive();
      return;
    });
  }
}
```

- [ ] **Step 4: Register the flow**

Create `src/journals/notes/flows/module.ts`:

```ts
import type { Module } from "@/infrastructure/di";

import { ConnectNoteFlow } from "./connect-note.flow";

export const journalNotesFlowsModule: Module = {
  register(c) {
    c.register(ConnectNoteFlow).useClass(ConnectNoteFlow);
  },
};
```

Wire it from `src/journals/notes/module.ts` by adding to `journalNotesModule.register`:

```ts
import { journalNotesFlowsModule } from "./flows/module";
```

```ts
journalNotesFlowsModule.register(c);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- src/journals/notes/flows/connect-note.flow.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/journals/notes/flows/ src/journals/notes/module.ts
git commit -m "feat(journals): add ConnectNoteFlow"
```

---

### Task 7: `connect-note` command registration

**Files:**

- Create: `src/journals/notes/note-connection-commands.ts`
- Test: `src/journals/notes/note-connection-commands.test.ts`
- Modify: `src/journals/notes/module.ts`

- [ ] **Step 1: Write the failing test**

Create `src/journals/notes/note-connection-commands.test.ts`, following the shape of `src/journals/navigation-commands.test.ts` (it uses a fake `CommandService` capturing registrations and a fake `WorkspaceService`).

```ts
import { describe, expect, it, vi } from "vitest";

import { Container } from "@/infrastructure/di";
import { CommandService, WorkspaceService } from "@/infrastructure/host";
import { Flows } from "@/infrastructure/flows";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { Option } from "@/infrastructure/result";
import type { VaultPath } from "@/infrastructure/host";

import { NoteConnectionCommands } from "./note-connection-commands";

import type { CommandRegistration } from "@/infrastructure/host";

const fakeLogger = { named: () => ({ error: () => {}, info: () => {}, debug: () => {}, warn: () => {} }) };

function build(active: VaultPath | undefined) {
  const c = new Container();
  const registered: CommandRegistration[] = [];
  c.register(CommandService).useValue({
    register: (r: CommandRegistration) => registered.push(r),
  } as unknown as CommandService);
  c.register(WorkspaceService).useValue({
    activeNote: () => Option.fromNullable(active),
  } as unknown as WorkspaceService);
  const invoke = vi.fn(() => Promise.resolve());
  c.register(Flows).useValue({ invoke } as unknown as Flows);
  c.register(LoggerFactoryToken).useValue(fakeLogger as never);
  c.register(NoteConnectionCommands).useClass(NoteConnectionCommands).eager();
  c.resolve(NoteConnectionCommands);
  return { registered, invoke };
}

describe("NoteConnectionCommands", () => {
  it("registers the connect-note command", () => {
    const { registered } = build("note.md" as VaultPath);
    expect(registered.map((r) => r.id)).toContain("connect-note");
  });

  it("is unavailable when there is no active note", () => {
    const { registered } = build(undefined);
    const command = registered.find((r) => r.id === "connect-note");
    expect(command?.check?.()).toBe(false);
  });

  it("invokes ConnectNoteFlow with the active note path", () => {
    const { registered, invoke } = build("note.md" as VaultPath);
    registered.find((r) => r.id === "connect-note")?.execute();
    expect(invoke).toHaveBeenCalledWith(expect.anything(), { path: "note.md" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/journals/notes/note-connection-commands.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the command class**

Create `src/journals/notes/note-connection-commands.ts`:

```ts
import { inject } from "@/infrastructure/di";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { CommandService, WorkspaceService } from "@/infrastructure/host";
import { m } from "@/i18n";
import { LoggerFactoryToken } from "@/infrastructure/logger";

import { AnchorOccupiedError } from "./errors";
import { ConnectNoteFlow } from "./flows/connect-note.flow";

export class NoteConnectionCommands {
  readonly #commands = inject(CommandService);
  readonly #workspace = inject(WorkspaceService);
  readonly #flows = inject(Flows);
  readonly #logger = inject(LoggerFactoryToken).named("note-connection");

  constructor() {
    this.#commands.register({
      id: "connect-note",
      name: m.command_connect_note(),
      check: () => this.#workspace.activeNote().isSome(),
      execute: () => this.#run(),
    });
  }

  #run(): void {
    const path = this.#workspace.activeNote();
    if (path.isNone()) return;
    void this.#flows.invoke(ConnectNoteFlow, { path: path.value }).then((result) => {
      if (
        result.kind === "err" &&
        !(result.error instanceof UserAborted) &&
        !(result.error instanceof AnchorOccupiedError)
      ) {
        this.#logger.error("connect-note failed", { error: result.error });
      }
    });
  }
}
```

- [ ] **Step 4: Register eagerly**

In `src/journals/notes/module.ts` add the import and an eager registration:

```ts
import { NoteConnectionCommands } from "./note-connection-commands";
```

```ts
c.register(NoteConnectionCommands).useClass(NoteConnectionCommands).eager();
```

(Eager classes resolve via `container.autoLoad()` in `main.ts`; no change to `main.ts` is needed because the journals module is already loaded there. Verify `JournalNavigationCommands` is registered `.eager()` the same way — match it.)

- [ ] **Step 5: Run the full gate**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/journals/notes/note-connection-commands.ts src/journals/notes/note-connection-commands.test.ts src/journals/notes/module.ts
git commit -m "feat(journals): register connect-note command"
```

---

### Checkpoint 2

```bash
npm run test && npm run check:types && npm run check:lint
```

Manually verify in Obsidian: open a note, run **Connect note to a journal**, pick a journal + date, confirm the toggles appear when appropriate, connect, then re-open the command on the now-connected note and confirm **Disconnect** strips the frontmatter. Connect (gap #2) and Disconnect (gap #3) are complete.

---

## Follow-up (separate plan)

Bulk-add notes (gap #1) is the larger, independent subsystem. After Checkpoint 2 lands, generate its own plan with the writing-plans skill. It will reuse `NoteConnectionService.connect`/`disconnect`, add a `bulk-add` config schema, a pure preprocess planner (folder scan, decoration-condition filters via `engine-checks.ts`, date extraction, `CycleService.anchorOf` snapping, `TimelineService.contains` bounds, operation-list building), a two-stage configure→process modal with dry-run, and a per-journal settings entry point. The design for it is in `docs/superpowers/specs/2026-06-01-connect-disconnect-bulk-add-design.md`.

```

```
