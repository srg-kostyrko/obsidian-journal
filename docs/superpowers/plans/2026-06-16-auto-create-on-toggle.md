# Create today's note when auto-create is switched on — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switching a journal's "Auto-create today's note" toggle from off to on creates today's note immediately (silently, idempotently), and the existing auto-create passes stop showing the confirm dialog.

**Architecture:** Add an opt-in `skipConfirmation` to `NoteCreationService.ensureNote`. Extract the per-journal body of `AutoCreateService`'s midnight tick into a public `createCurrent(name)` that always skips confirmation; the tick reuses it. A new UI composable `useAutoCreateOnEnable` watches the toggle's off→on transition and calls `createCurrent`. Vue reactivity stays in the UI layer; `AutoCreateService` never imports Vue.

**Tech Stack:** TypeScript, Vue 3 (composables, `watch`), custom DI container (`useService`/`provideInjectorOnApp`), Vitest, @testing-library/vue, Result/AsyncResult.

**Branch:** Commit directly to the current branch (`v3-ai`). Do not create a new branch. No `Co-Authored-By` trailer.

**Quality gates (run before the final commit):** `npm test`, `npm run check:types`, `npm run check:lint` must all pass. No e2e is added — the behavior is fully observable at the unit layer and the toggle path adds no new runtime wiring beyond a composable calling an already-booted service.

---

## File structure

- `src/journals/notes/note-creation.ts` — modify: `ensureNote` gains `options?: { skipConfirmation?: boolean }`.
- `src/journals/notes/note-creation.test.ts` — modify: add a skip-confirmation test.
- `src/journals/notes/auto-create.ts` — modify: extract `createCurrent(name)`, route `#tick()` through it, pass `skipConfirmation: true`.
- `src/journals/notes/auto-create.test.ts` — modify: add a test that auto-create never opens the confirm modal.
- `src/journals/settings/ui/use-auto-create-on-enable.ts` — create: the composable.
- `src/journals/settings/ui/use-auto-create-on-enable.test.ts` — create: composable tests.
- `src/journals/settings/ui/JournalEditSubpage.vue` — modify: wire in the composable.

---

## Task 1: `ensureNote` skip-confirmation option

**Files:**

- Modify: `src/journals/notes/note-creation.ts:44-66`
- Test: `src/journals/notes/note-creation.test.ts`

- [ ] **Step 1: Write the failing test**

Add this `it` block inside the existing `describe("NoteCreationService.ensureNote", ...)` in `src/journals/notes/note-creation.test.ts` (after the test at line 110, before the closing `});` at line 111):

```ts
it("skips the confirm modal when skipConfirmation is set even if confirmCreation is true", async () => {
  const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }, { confirmCreation: true }) });
  const notes = new FakeNotesService();
  const modals = new FakeModalService();
  const result = await build(repo, notes, modals)
    .resolve(NoteCreationService)
    .ensureNote("daily", meta, { skipConfirmation: true });
  expect(result.isOk() && result.value.created).toBe(true);
  expect(modals.opens).toHaveLength(0);
  expect(notes.find("2026-05-19.md" as VaultPath).isSome()).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/journals/notes/note-creation.test.ts`
Expected: FAIL — `ensureNote` does not accept a third argument / the modal still opens (the call hangs on the unsubmitted modal or the type errors).

- [ ] **Step 3: Implement the option**

In `src/journals/notes/note-creation.ts`, change the `ensureNote` signature (lines 44-47) to add the options parameter:

```ts
  ensureNote(
    name: string,
    metadata: JournalMetadata,
    options?: { skipConfirmation?: boolean },
  ): AsyncResult<{ path: VaultPath; created: boolean }, NoteCreationError> {
```

Then change the confirmation guard (line 61) from:

```ts
      if (config?.confirmCreation) {
```

to:

```ts
      if (!options?.skipConfirmation && config?.confirmCreation) {
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/journals/notes/note-creation.test.ts`
Expected: PASS — all `NoteCreationService` tests pass, including the new one. (The existing confirm-modal tests still pass because they don't pass `options`.)

- [ ] **Step 5: Commit**

```bash
git add src/journals/notes/note-creation.ts src/journals/notes/note-creation.test.ts
git commit -m "feat(notes): add skipConfirmation option to ensureNote"
```

---

## Task 2: `AutoCreateService.createCurrent` and silent tick

**Files:**

- Modify: `src/journals/notes/auto-create.ts:33-51`
- Test: `src/journals/notes/auto-create.test.ts`

- [ ] **Step 1: Write the failing test**

Add this `it` block inside the existing `describe("AutoCreateService", ...)` in `src/journals/notes/auto-create.test.ts` (after the test ending at line 112, before the closing `});` at line 113). It needs the `FakeModalService` import that's already present in the file (line 8) and the `JournalMetadata` flow through `ensureNote`. The test asserts that even a journal with `confirmCreation: true` is created without opening a modal:

```ts
it("creates the note without opening the confirm modal even when confirmCreation is true", async () => {
  const repo = fakeRepo({
    daily: fixedJournal("daily", { type: "day" }, { autoCreate: true, confirmCreation: true }),
  });
  const notes = new FakeNotesService();
  const container = build(repo, notes);
  const modals = container.resolve(ModalService) as unknown as FakeModalService;
  await container.resolve(AutoCreateService).initialize();
  await vi.advanceTimersByTimeAsync(0);
  expect(notes.find("2026-05-19.md" as VaultPath).isSome()).toBe(true);
  expect(modals.opens).toHaveLength(0);
});
```

Note: the existing `build` helper at line 32 registers `new FakeModalService()` directly into the container, so resolving `ModalService` returns that fake. `ModalService` is already imported at line 7.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/journals/notes/auto-create.test.ts`
Expected: FAIL — the tick currently calls `ensureNote` without `skipConfirmation`, so with `confirmCreation: true` the modal opens (and the note is not created because the modal is never submitted): `modals.opens` has length 1 and the note is absent.

- [ ] **Step 3: Implement `createCurrent` and route the tick through it**

In `src/journals/notes/auto-create.ts`, replace the `#tick()` method (lines 33-51) with a public `createCurrent` plus a slimmed `#tick`:

```ts
  async createCurrent(name: string): Promise<void> {
    const anchor = CalendarDate.today().toAnchor();
    const metadata = this.#frontmatter.buildMetadata(name, anchor);
    if (metadata.kind === "err") {
      this.#logger.debug("auto-create: build metadata failed", { name, error: metadata.error });
      return;
    }
    const result = await this.#creation.ensureNote(name, metadata.value, { skipConfirmation: true });
    if (result.isErr()) {
      this.#logger.error("auto-create: ensureNote failed", { name, error: result.error });
    }
  }

  async #tick(): Promise<void> {
    for (const [name, config] of this.#journals.find().entries()) {
      if (!config.autoCreate) continue;
      await this.createCurrent(name);
    }
    if (this.#disposed) return;
    this.#timer = window.setTimeout(() => {
      void this.#tick();
    }, Clock.msUntilNextLocalMidnight());
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/journals/notes/auto-create.test.ts`
Expected: PASS — the new test passes and all four existing tests (create today's note, re-tick at midnight, stop after dispose, isolate per-journal errors) still pass.

- [ ] **Step 5: Commit**

```bash
git add src/journals/notes/auto-create.ts src/journals/notes/auto-create.test.ts
git commit -m "feat(notes): extract AutoCreateService.createCurrent, skip confirm on auto-create"
```

---

## Task 3: `useAutoCreateOnEnable` composable and wiring

**Files:**

- Create: `src/journals/settings/ui/use-auto-create-on-enable.ts`
- Create: `src/journals/settings/ui/use-auto-create-on-enable.test.ts`
- Modify: `src/journals/settings/ui/JournalEditSubpage.vue:37-44` (imports) and around `:251` (call site)

- [ ] **Step 1: Write the failing test**

Create `src/journals/settings/ui/use-auto-create-on-enable.test.ts`:

```ts
import { cleanup, render } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";

import { AutoCreateService } from "../../notes/auto-create";
import { fixedJournal } from "../../testing";

import { useAutoCreateOnEnable } from "./use-auto-create-on-enable";

import type { JournalConfig } from "../../config";

class RecordingAutoCreate {
  readonly created: string[] = [];
  async createCurrent(name: string): Promise<void> {
    this.created.push(name);
  }
}

function setup(autoCreate: boolean) {
  const config = ref<JournalConfig>(fixedJournal("Daily", { type: "day" }, { autoCreate }));
  const recorder = new RecordingAutoCreate();
  const container = new Container();
  container.register(AutoCreateService).useValue(recorder as unknown as AutoCreateService);

  const Host = defineComponent({
    setup() {
      useAutoCreateOnEnable(config);
      return () => h("div");
    },
  });
  render(Host, {
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
  return { config, recorder };
}

afterEach(() => cleanup());

describe("useAutoCreateOnEnable", () => {
  it("creates the current note when the toggle switches on", async () => {
    const { config, recorder } = setup(false);
    config.value.autoCreate = true;
    await nextTick();
    expect(recorder.created).toEqual(["Daily"]);
  });

  it("does nothing when the toggle switches off", async () => {
    const { config, recorder } = setup(true);
    config.value.autoCreate = false;
    await nextTick();
    expect(recorder.created).toEqual([]);
  });

  it("does nothing when an unrelated field changes", async () => {
    const { config, recorder } = setup(false);
    config.value.confirmCreation = true;
    await nextTick();
    expect(recorder.created).toEqual([]);
  });

  it("does nothing on mount when the toggle is already on", async () => {
    const { recorder } = setup(true);
    await nextTick();
    expect(recorder.created).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/journals/settings/ui/use-auto-create-on-enable.test.ts`
Expected: FAIL — `./use-auto-create-on-enable` does not exist (module not found).

- [ ] **Step 3: Implement the composable**

Create `src/journals/settings/ui/use-auto-create-on-enable.ts`:

```ts
import { watch, type Ref } from "vue";

import { useService } from "@/infrastructure/di";

import { AutoCreateService } from "../../notes/auto-create";

import type { JournalConfig } from "../../config";

export function useAutoCreateOnEnable(config: Ref<JournalConfig | undefined>): void {
  const autoCreate = useService(AutoCreateService);
  watch(
    () => config.value?.autoCreate ?? false,
    (now, was) => {
      const current = config.value;
      if (current && now && !was) void autoCreate.createCurrent(current.name);
    },
  );
}
```

Notes:

- Import `AutoCreateService` via the direct submodule path (`../../notes/auto-create`), never via the `@/journals` barrel — settings/ui modules pulling journal services through the barrel cause an import cycle.
- `config` is typed `Ref<JournalConfig | undefined>` to accept the `computed<JournalConfig | undefined>` that `JournalEditSubpage.vue` already holds, mirroring how `useInvertibilityCheck(template: Ref<string>)` is called with a `computed`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/journals/settings/ui/use-auto-create-on-enable.test.ts`
Expected: PASS — all four tests pass.

- [ ] **Step 5: Wire the composable into the settings subpage**

In `src/journals/settings/ui/JournalEditSubpage.vue`, add the import alongside the other `use-*` composable imports (next to line 37-39, e.g. after the `useAnchorField` import):

```ts
import { useAutoCreateOnEnable } from "./use-auto-create-on-enable";
```

Then, in the `<script setup>` body after `config` is defined (it is declared at line 49: `const config = computed<JournalConfig | undefined>(...)`), add the call below that line:

```ts
useAutoCreateOnEnable(config);
```

- [ ] **Step 6: Verify the full suite and gates pass**

Run: `npm test`
Expected: PASS — whole unit suite green.

Run: `npm run check:types`
Expected: PASS — no type errors (the `computed<JournalConfig | undefined>` passes to the `Ref<JournalConfig | undefined>` parameter).

Run: `npm run check:lint`
Expected: PASS — no lint errors.

- [ ] **Step 7: Commit**

```bash
git add src/journals/settings/ui/use-auto-create-on-enable.ts src/journals/settings/ui/use-auto-create-on-enable.test.ts src/journals/settings/ui/JournalEditSubpage.vue
git commit -m "feat(settings): create today's note when auto-create is switched on"
```

---

## Self-review notes

- **Spec coverage:** "create immediately on off→on" → Task 3 composable. "silent / no confirm dialog" → Task 1 option + Task 2 passing `skipConfirmation: true`. "idempotent" → existing `ensureNote` no-op-on-exists path (unchanged), covered by the existing "skips create but still writes frontmatter when the file already exists" test. "auto-create uniformly silent (load/midnight too)" → Task 2 routes the tick through `createCurrent`. "errors logged and swallowed" → `createCurrent` keeps the existing debug/error logging and returns `Promise<void>`. "repository `updated` event not used" → composable watches reactive `config` directly; no repository change.
- **Type consistency:** `createCurrent(name: string): Promise<void>` is defined in Task 2 and called (fire-and-forget via `void`) in Task 3's composable and test recorder. `ensureNote(name, metadata, options?)` defined in Task 1, called with `{ skipConfirmation: true }` in Task 2.
- **No placeholders:** every code step shows full code; every run step shows the command and expected result.
