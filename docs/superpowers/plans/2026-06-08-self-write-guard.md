# Self-Write Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the auto-attach echo-suppression concern out of `NoteCreationService` into a named `SelfWriteGuard` module that both `NoteCreationService` and `AutoAttachService` inject — with the 5s suppression window preserved byte-for-byte.

**Architecture:** A tiny dependency-free DI service holding the `Map<VaultPath, timeout>` + the `5000ms` window lifted verbatim from `NoteCreationService`. Interface: `mark(path)` / `suppresses(path)` / `release(path)`. `NoteCreationService` sheds `#expected`/`#markExpected`/`#clearExpected`/`expects()`/the dead `clearExpected()`/`EXPECTS_TIMEOUT_MS` and calls the guard; `AutoAttachService` checks `suppresses` instead of `creation.expects`. Both resolve the same Container singleton, so coordination is unchanged. See `CONTEXT.md` → _SelfWriteGuard_.

**Why:** the temporal contract (suppress auto-attach for paths we're mid-creating, bridging Obsidian's async metadata-cache indexing lag) was a hidden `#markExpected` inside `ensureNote` plus public `expects`/`clearExpected` methods that only auto-attach used — note creation should not own auto-attach's suppression concern.

**Tech Stack:** TypeScript, Vitest (incl. fake timers), the in-house DI `Container`. Quality gate every task: `npm run test`, `npm run check:types`, `npm run check:lint`. No behavior change — the existing `auto-attach.test.ts` and `note-creation.test.ts` suites are the regression net.

---

## File structure

| File                                          | Responsibility          | Change                                                           |
| --------------------------------------------- | ----------------------- | ---------------------------------------------------------------- |
| `src/journals/notes/self-write-guard.ts`      | the suppression module  | **create**                                                       |
| `src/journals/notes/self-write-guard.test.ts` | its unit tests          | **create**                                                       |
| `src/journals/notes/module.ts`                | DI wiring               | register `SelfWriteGuard`                                        |
| `src/journals/notes/note-creation.ts`         | note creation           | inject guard; delete the in-house expected machinery             |
| `src/journals/notes/auto-attach.ts`           | auto-attach reaction    | check `guard.suppresses`                                         |
| `src/journals/notes/note-creation.test.ts`    | cleanup tests + harness | register guard in `build`; retarget the two `expects` assertions |
| `src/journals/notes/auto-attach.test.ts`      | harness                 | register guard in `build`                                        |

---

## Task 1: Create `SelfWriteGuard` (test-first) and register it

**Files:**

- Create: `src/journals/notes/self-write-guard.ts`
- Create: `src/journals/notes/self-write-guard.test.ts`
- Modify: `src/journals/notes/module.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/journals/notes/self-write-guard.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { SelfWriteGuard } from "./self-write-guard";

import type { VaultPath } from "@/infrastructure/host";

const p = (s: string): VaultPath => s as VaultPath;

describe("SelfWriteGuard", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("suppresses a marked path", () => {
    const guard = new SelfWriteGuard();
    guard.mark(p("a.md"));
    expect(guard.suppresses(p("a.md"))).toBe(true);
  });

  it("does not suppress an unmarked path", () => {
    expect(new SelfWriteGuard().suppresses(p("a.md"))).toBe(false);
  });

  it("stops suppressing after release", () => {
    const guard = new SelfWriteGuard();
    guard.mark(p("a.md"));
    guard.release(p("a.md"));
    expect(guard.suppresses(p("a.md"))).toBe(false);
  });

  it("stops suppressing once the window elapses", () => {
    vi.useFakeTimers();
    const guard = new SelfWriteGuard();
    guard.mark(p("a.md"));
    vi.advanceTimersByTime(5000);
    expect(guard.suppresses(p("a.md"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/journals/notes/self-write-guard.test.ts`
Expected: FAIL — `./self-write-guard` has no `SelfWriteGuard`.

- [ ] **Step 3: Write the implementation**

Create `src/journals/notes/self-write-guard.ts`:

```ts
import type { VaultPath } from "@/infrastructure/host";

const SELF_WRITE_TIMEOUT_MS = 5000;

export class SelfWriteGuard {
  readonly #pending = new Map<VaultPath, ReturnType<typeof window.setTimeout>>();

  mark(path: VaultPath): void {
    this.release(path);
    this.#pending.set(
      path,
      window.setTimeout(() => this.#pending.delete(path), SELF_WRITE_TIMEOUT_MS),
    );
  }

  suppresses(path: VaultPath): boolean {
    return this.#pending.has(path);
  }

  release(path: VaultPath): void {
    const handle = this.#pending.get(path);
    if (handle !== undefined) window.clearTimeout(handle);
    this.#pending.delete(path);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/journals/notes/self-write-guard.test.ts`
Expected: PASS (all four).

- [ ] **Step 5: Register the guard in the notes module**

In `src/journals/notes/module.ts`:

a) Add the import (with the other `./` service imports):

```ts
import { SelfWriteGuard } from "./self-write-guard";
```

b) Register it at the top of the `register(c)` body, before `NoteCreationService` (which injects it):

```ts
c.register(SelfWriteGuard).useClass(SelfWriteGuard);
```

- [ ] **Step 6: Quality gate**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/journals/notes/self-write-guard.ts src/journals/notes/self-write-guard.test.ts src/journals/notes/module.ts
git commit -m "feat(journals): add SelfWriteGuard for auto-attach echo suppression"
```

---

## Task 2: Move the suppression machinery into `NoteCreationService`'s use of the guard

The two `NoteCreationService.ensureNote — expected-set cleanup` tests are the regression net for the error-path release; they must keep asserting the same behavior, retargeted to the guard.

**Files:**

- Modify: `src/journals/notes/note-creation.ts`
- Modify: `src/journals/notes/note-creation.test.ts`

- [ ] **Step 1: Retarget the cleanup tests (test-first)**

In `src/journals/notes/note-creation.test.ts`:

a) Add imports (with the other `./` imports):

```ts
import { SelfWriteGuard } from "./self-write-guard";
```

b) In the `build(...)` helper, register the guard so `NoteCreationService` resolves (add next to the other `useClass` registrations, before `.resolve` is ever called):

```ts
c.register(SelfWriteGuard).useClass(SelfWriteGuard);
```

c) Rewrite the two tests in `describe("NoteCreationService.ensureNote — expected-set cleanup", …)` to resolve the guard from the same container and assert through it. Replace:

```ts
it("clears the expected path when the content write fails", async () => {
  const repo = fakeRepo({
    daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
  });
  const notes = new FakeNotesService();
  notes.seed("Templates/daily.md" as VaultPath, "body");
  const service = build(repo, notes, new FakeModalService()).resolve(NoteCreationService);
  vi.spyOn(notes, "write").mockReturnValue(
    AsyncResult.err(new NoteWriteError("2026-05-19.md" as VaultPath, new Error("write failed"))),
  );
  const result = await service.ensureNote("daily", meta);
  expect(result.isErr()).toBe(true);
  expect(service.expects("2026-05-19.md" as VaultPath)).toBe(false);
});

it("clears the expected path when content rendering fails", async () => {
  const repo = fakeRepo({
    daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
  });
  const notes = new FakeNotesService();
  notes.seed("Templates/daily.md" as VaultPath, "body");
  const service = build(repo, notes, new FakeModalService()).resolve(NoteCreationService);
  vi.spyOn(notes, "read").mockReturnValue(
    AsyncResult.err(new NoteReadError("Templates/daily.md" as VaultPath, new Error("read failed"))),
  );
  const result = await service.ensureNote("daily", meta);
  expect(result.isErr()).toBe(true);
  expect(service.expects("2026-05-19.md" as VaultPath)).toBe(false);
});
```

with:

```ts
it("releases the suppression guard when the content write fails", async () => {
  const repo = fakeRepo({
    daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
  });
  const notes = new FakeNotesService();
  notes.seed("Templates/daily.md" as VaultPath, "body");
  const container = build(repo, notes, new FakeModalService());
  const service = container.resolve(NoteCreationService);
  const guard = container.resolve(SelfWriteGuard);
  vi.spyOn(notes, "write").mockReturnValue(
    AsyncResult.err(new NoteWriteError("2026-05-19.md" as VaultPath, new Error("write failed"))),
  );
  const result = await service.ensureNote("daily", meta);
  expect(result.isErr()).toBe(true);
  expect(guard.suppresses("2026-05-19.md" as VaultPath)).toBe(false);
});

it("releases the suppression guard when content rendering fails", async () => {
  const repo = fakeRepo({
    daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
  });
  const notes = new FakeNotesService();
  notes.seed("Templates/daily.md" as VaultPath, "body");
  const container = build(repo, notes, new FakeModalService());
  const service = container.resolve(NoteCreationService);
  const guard = container.resolve(SelfWriteGuard);
  vi.spyOn(notes, "read").mockReturnValue(
    AsyncResult.err(new NoteReadError("Templates/daily.md" as VaultPath, new Error("read failed"))),
  );
  const result = await service.ensureNote("daily", meta);
  expect(result.isErr()).toBe(true);
  expect(guard.suppresses("2026-05-19.md" as VaultPath)).toBe(false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/journals/notes/note-creation.test.ts`
Expected: FAIL — `service.ensureNote` still references the soon-to-be-removed internal machinery, and (after Step 3) `expects` is gone; right now these tests fail to compile because `SelfWriteGuard` is imported but `NoteCreationService` does not yet use it / the guard is registered but unused. (If the file still compiles and passes here, that is fine — the meaningful check is Step 4 after the service is rewired.)

- [ ] **Step 3: Rewire `NoteCreationService` onto the guard**

In `src/journals/notes/note-creation.ts`:

a) Add the import (with the other `./` imports):

```ts
import { SelfWriteGuard } from "./self-write-guard";
```

b) Add the injected field (next to the other `inject(...)` fields) and delete the `#expected` field + the `EXPECTS_TIMEOUT_MS` constant. Replace:

```ts
const EXPECTS_TIMEOUT_MS = 5000;

export class NoteCreationService {
  readonly #notes = inject(NotesService);
  readonly #path = inject(NotePathService);
  readonly #content = inject(TemplateContentService);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #modals = inject(ModalService);

  readonly #expected = new Map<VaultPath, ReturnType<typeof window.setTimeout>>();

  expects(path: VaultPath): boolean {
    return this.#expected.has(path);
  }

  ensureNote(
```

with:

```ts
export class NoteCreationService {
  readonly #notes = inject(NotesService);
  readonly #path = inject(NotePathService);
  readonly #content = inject(TemplateContentService);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #modals = inject(ModalService);
  readonly #guard = inject(SelfWriteGuard);

  ensureNote(
```

c) Inside `ensureNote`, replace `this.#markExpected(path)` with `this.#guard.mark(path)`, and replace every `this.#clearExpected(path)` with `this.#guard.release(path)`. The creation block becomes:

```ts
this.#guard.mark(path);
const createResult = await this.#notes.create(path, "");
if (createResult.isErr()) {
  this.#guard.release(path);
  return yield * new Err(createResult.error as NoteCreationError);
}
const content =
  yield * this.#content.renderFor(name, metadata, this.#basename(path), path).tapErr(() => this.#guard.release(path));
if (content !== "") {
  yield * this.#notes.write(path, content).tapErr(() => this.#guard.release(path));
}
yield * this.#notes.updateFrontmatter(path, mutator).tapErr(() => this.#guard.release(path));
return { path, created: true as const };
```

d) Delete the now-unused methods `clearExpected`, `#markExpected`, and `#clearExpected` entirely.

> After this, `NoteCreationService` no longer references `window.setTimeout`. Keep the `VaultPath` import — it is still used in method signatures and `#basename`.

- [ ] **Step 4: Run the note-creation tests**

Run: `npm run test -- src/journals/notes/note-creation.test.ts`
Expected: PASS — including the two retargeted cleanup tests.

- [ ] **Step 5: Quality gate**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/journals/notes/note-creation.ts src/journals/notes/note-creation.test.ts
git commit -m "refactor(journals): move note-creation echo suppression into SelfWriteGuard"
```

---

## Task 3: Point `AutoAttachService` at the guard

**Files:**

- Modify: `src/journals/notes/auto-attach.ts`
- Modify: `src/journals/notes/auto-attach.test.ts`

- [ ] **Step 1: Register the guard in the auto-attach test harness**

In `src/journals/notes/auto-attach.test.ts`:

a) Add the import (with the other `./` imports):

```ts
import { SelfWriteGuard } from "./self-write-guard";
```

b) In `build(...)`, register it (next to the `NoteCreationService` registration):

```ts
c.register(SelfWriteGuard).useClass(SelfWriteGuard);
```

- [ ] **Step 2: Use `suppresses` in `AutoAttachService`**

In `src/journals/notes/auto-attach.ts`:

a) Add the injected field (with the other `inject(...)` fields):

```ts
  readonly #guard = inject(SelfWriteGuard);
```

b) Add the import (with the other `./` imports):

```ts
import { SelfWriteGuard } from "./self-write-guard";
```

c) In `#handle`, replace:

```ts
if (this.#creation.expects(path)) return;
```

with:

```ts
if (this.#guard.suppresses(path)) return;
```

> `#creation` is still injected and used for `attachNote` — leave it.

- [ ] **Step 3: Run the auto-attach tests**

Run: `npm run test -- src/journals/notes/auto-attach.test.ts`
Expected: PASS — behavior unchanged (same guard instance is resolved by both services in the container).

- [ ] **Step 4: Quality gate**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/journals/notes/auto-attach.ts src/journals/notes/auto-attach.test.ts
git commit -m "refactor(journals): auto-attach consults SelfWriteGuard.suppresses"
```

---

## Task 4: Final sweep

- [ ] **Step 1: Confirm the old surface is gone**

Run:

```bash
grep -rn "expects\|clearExpected\|markExpected\|EXPECTS_TIMEOUT" src/journals/notes
```

Expected: no matches outside `self-write-guard.ts` history — specifically none in `note-creation.ts` or `auto-attach.ts`. (`suppresses`/`mark`/`release` are the new surface.)

- [ ] **Step 2: Full quality gate**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass.

---

## Self-review notes

- **Behavior preservation:** the `Map` + `5000ms` window is lifted verbatim; the only semantic difference is the home. `mark` still resets an existing timer (was `#markExpected` → `#clearExpected` first; now `mark` → `release` first). Error-path release points are identical (create-error branch + the three `tapErr`s).
- **Dead code removed:** the public `clearExpected()` had zero callers — gone.
- **Type/name consistency:** guard surface is `mark` / `suppresses` / `release` across the module, tests, and `CONTEXT.md`. The constant `SELF_WRITE_TIMEOUT_MS` lives only in `self-write-guard.ts`.
- **Registration:** `SelfWriteGuard` is a Container singleton (default lifetime), so `NoteCreationService` and `AutoAttachService` share one instance in prod and in each test `build()`.
- **Deliberately deferred:** clear-on-`JournalsIndex.entryChanged "added"` (a deterministic alternative to the timer) is noted in `CONTEXT.md` but not implemented — this plan is a pure relocation.
