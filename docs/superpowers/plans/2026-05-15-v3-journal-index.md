# v3 Journal Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port v2's `JournalIndex` (per-journal anchor → note-path data structure with ordered queries) and the passive half of `JournalsIndex` (registry over per-journal indices + path reverse lookup + typed events with microtask-coalesced dirty channel) to a new `src/journals/` feature module. Vault-event wiring, frontmatter parsing, the Vue bridge, and the journal entity itself are out of scope for this plan and land in later specs.

**Architecture:** Two plain classes, no Vue. `JournalIndex` is internal — instances live inside `JournalsIndex`, never DI-registered. `JournalsIndex` is a Container-lifetime DI binding. Events use `nanoevents` (already in use by host services); the `TypedEmitter` type and the `Subscribable` read-only view are lifted out of `host/internal/` into a shared `@/infrastructure/events` module since journals are not host code. The registry's `#byPath: Map<VaultPath, JournalEntry>` consolidates v2's two split reverse maps into one. A microtask-coalesced `journalDirty` channel sits alongside per-mutation `entryChanged` events so future UI bridges can subscribe at the right granularity without thrashing.

**Tech Stack:** TypeScript, `nanoevents` for the emitter runtime, Vitest for unit tests + benches. No Vue, no Obsidian, no valibot in this module — the registry is pure.

**Spec:** `docs/superpowers/specs/2026-05-15-v3-journal-index-design.md`

---

## File map

**Create:**

- `src/infrastructure/events/typed-emitter.ts` — relocated `TypedEmitter` and `Subscribable` interfaces
- `src/infrastructure/events/index.ts` — re-exports
- `src/journals/types.ts` — `JournalEntry`, `JournalsIndexEvents`
- `src/journals/journal-index.ts` — `JournalIndex` class
- `src/journals/journal-index.test.ts`
- `src/journals/journal-index.bench.ts`
- `src/journals/journals-index.ts` — `JournalsIndex` class
- `src/journals/journals-index.test.ts`
- `src/journals/module.ts` — `journalsIndexModule`

**Modify:**

- `src/infrastructure/host/types.ts` — remove `Subscribable` interface (moved to events module)
- `src/infrastructure/host/index.ts` — remove `Subscribable` from re-exports
- `src/infrastructure/host/internal/notes-service.ts` — update `Subscribable` + `TypedEmitter` import paths
- `src/infrastructure/host/internal/workspace-service.ts` — update `Subscribable` + `TypedEmitter` import paths
- `src/infrastructure/host/testing.ts` — update `Subscribable` + `TypedEmitter` import paths
- `src/main.ts` — add `journalsIndexModule` to the container

**Delete:**

- `src/infrastructure/host/internal/typed-emitter.ts` — replaced by the events module

No barrel (`src/journals/index.ts`) for now — there's only one public export (`journalsIndexModule`) plus its class; adding a barrel for a single export is wiring overhead per [[feedback_barrel_files]]. Imports use the per-file path.

No `errors.ts` — every operation in this module is total.

No `tokens.ts` — `JournalsIndex` is a single-binding service, so the class itself is the DI token (the repo's established pattern; `SettingsService`, `NotesService`, `Calendar` all follow this).

No `testing.ts` — no consumer needs a fake of `JournalsIndex` in this port. Will be added when one does.

---

## Task 1: Lift `TypedEmitter` and `Subscribable` to `@/infrastructure/events`

**Background.** `TypedEmitter` (full read+emit interface) currently lives at `src/infrastructure/host/internal/typed-emitter.ts`; `Subscribable` (read-only `.on` view) lives in `src/infrastructure/host/types.ts`. Both are generic eventing primitives — nothing about them is host-specific. The registry in this plan needs both; rather than reach across `host/internal/` from a peer feature module, lift them to their own infrastructure module. Host's existing consumers update to the new import path.

**Files:**

- Create: `src/infrastructure/events/typed-emitter.ts`
- Create: `src/infrastructure/events/index.ts`
- Delete: `src/infrastructure/host/internal/typed-emitter.ts`
- Modify: `src/infrastructure/host/types.ts`
- Modify: `src/infrastructure/host/index.ts`
- Modify: `src/infrastructure/host/internal/notes-service.ts`
- Modify: `src/infrastructure/host/internal/workspace-service.ts`
- Modify: `src/infrastructure/host/testing.ts`

- [ ] **Step 1: Create the events module**

```ts
// src/infrastructure/events/typed-emitter.ts
export interface TypedEmitter<E extends object> {
  on<K extends keyof E & string>(
    event: K,
    callback: E[K] extends (...arguments_: infer A) => void ? (...arguments_: A) => void : never,
  ): () => void;
  emit<K extends keyof E & string>(
    event: K,
    ...arguments_: E[K] extends (...arguments_: infer A) => void ? A : never
  ): void;
}

export interface Subscribable<E extends object> {
  on<K extends keyof E & string>(
    event: K,
    callback: E[K] extends (...arguments_: infer A) => void ? (...arguments_: A) => void : never,
  ): () => void;
}
```

```ts
// src/infrastructure/events/index.ts
export type { Subscribable, TypedEmitter } from "./typed-emitter";
```

- [ ] **Step 2: Update host imports**

In `src/infrastructure/host/internal/notes-service.ts`, replace:

```ts
import type { Note, NotesEvents, Subscribable, VaultPath } from "../types";
import type { TypedEmitter } from "./typed-emitter";
```

with:

```ts
import type { Subscribable, TypedEmitter } from "@/infrastructure/events";

import type { Note, NotesEvents, VaultPath } from "../types";
```

In `src/infrastructure/host/internal/workspace-service.ts`, replace:

```ts
import type { OpenMode, Subscribable, VaultPath, WorkspaceEvents } from "../types";
import type { TypedEmitter } from "./typed-emitter";
```

with:

```ts
import type { Subscribable, TypedEmitter } from "@/infrastructure/events";

import type { OpenMode, VaultPath, WorkspaceEvents } from "../types";
```

In `src/infrastructure/host/testing.ts`, replace:

```ts
import type { Note, NotesEvents, OpenMode, Subscribable, VaultPath, WorkspaceEvents } from "./types";
```

with:

```ts
import type { Subscribable, TypedEmitter } from "@/infrastructure/events";

import type { Note, NotesEvents, OpenMode, VaultPath, WorkspaceEvents } from "./types";
```

(The existing `testing.ts` imports `TypedEmitter` from `./internal/typed-emitter` — that import line is removed; the new shared import covers both types.)

- [ ] **Step 3: Remove `Subscribable` from host types**

In `src/infrastructure/host/types.ts`, delete this interface block:

```ts
export interface Subscribable<E extends object> {
  on<K extends keyof E & string>(
    event: K,
    callback: E[K] extends (...arguments_: infer A) => void ? (...arguments_: A) => void : never,
  ): () => void;
}
```

In `src/infrastructure/host/index.ts`, remove `Subscribable` from the type re-export:

```ts
// Before:
export type { Note, NotesEvents, OpenMode, Subscribable, VaultPath, WorkspaceEvents } from "./types";

// After:
export type { Note, NotesEvents, OpenMode, VaultPath, WorkspaceEvents } from "./types";
```

- [ ] **Step 4: Delete the old typed-emitter file**

```bash
rm src/infrastructure/host/internal/typed-emitter.ts
```

- [ ] **Step 5: Verify the move compiles and existing tests still pass**

```bash
npm run check:types
npm run test
npm run check:lint
```

Expected: all pass. The functional behavior is unchanged — only import paths moved.

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/events/ src/infrastructure/host/
git commit -m "refactor(infrastructure): lift TypedEmitter and Subscribable to events module"
```

---

## Task 2: `src/journals/types.ts`

**Background.** Three things land here: the `JournalEntry` value type (used as `#byPath` value, event payload, and `register` argument — one type, three uses), the `JournalsIndexEvents` callback-map (matching the existing `NotesEvents`/`WorkspaceEvents` shape so it composes with `nanoevents`/`TypedEmitter`), and nothing else. Per the spec this port does not introduce a `JournalName` brand.

**Files:**

- Create: `src/journals/types.ts`

- [ ] **Step 1: Create the types file**

```ts
// src/journals/types.ts
import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";

export interface JournalEntry {
  readonly journalName: string;
  readonly anchor: AnchorString;
  readonly path: VaultPath;
}

export interface JournalsIndexEvents {
  entryChanged: (event: { entry: JournalEntry; kind: "added" | "removed" }) => void;
  journalDirty: (event: { journalName: string }) => void;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npm run check:types
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/journals/types.ts
git commit -m "feat(journals): add JournalEntry and JournalsIndexEvents types"
```

---

## Task 3: `JournalIndex` — `has`, `get`, `set`, `delete`, `clear`

**Background.** This task creates the class file with the base CRUD over `#byAnchor: Map<AnchorString, VaultPath>` AND introduces the `#sortedAnchors: AnchorString[]` private array along with its binary-search and insert/remove helpers. `set`/`delete` keep both structures in sync from the start — even though no method _queries_ `#sortedAnchors` until Task 5. Doing it this way means later tasks (Tasks 5–7) only add new methods; they never rewrite `set` or `delete`.

**Files:**

- Create: `src/journals/journal-index.ts`
- Create: `src/journals/journal-index.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/journals/journal-index.test.ts
import { describe, expect, it } from "vitest";

import { JournalIndex } from "./journal-index";

import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";

const a = (s: string) => s as AnchorString;
const p = (s: string) => s as VaultPath;

describe("JournalIndex", () => {
  describe("get", () => {
    it("returns the path when anchor exists", () => {
      const index = new JournalIndex();
      index.set(a("2022-01-01"), p("notes/2022-01-01.md"));
      const result = index.get(a("2022-01-01"));
      expect(result.isSome()).toBe(true);
      if (result.isSome()) expect(result.value).toBe(p("notes/2022-01-01.md"));
    });

    it("returns None when anchor is absent", () => {
      const index = new JournalIndex();
      index.set(a("2022-01-01"), p("notes/2022-01-01.md"));
      expect(index.get(a("2022-01-02")).isNone()).toBe(true);
    });
  });

  describe("has", () => {
    it("returns true for a known anchor", () => {
      const index = new JournalIndex();
      index.set(a("2022-01-01"), p("notes/a.md"));
      expect(index.has(a("2022-01-01"))).toBe(true);
    });

    it("returns false for an unknown anchor", () => {
      const index = new JournalIndex();
      expect(index.has(a("2022-01-01"))).toBe(false);
    });
  });

  describe("set", () => {
    it("overwrites the path when anchor already exists", () => {
      const index = new JournalIndex();
      index.set(a("2022-01-01"), p("notes/a.md"));
      index.set(a("2022-01-01"), p("notes/b.md"));
      const result = index.get(a("2022-01-01"));
      if (result.isSome()) expect(result.value).toBe(p("notes/b.md"));
      else throw new Error("expected Some");
    });
  });

  describe("delete", () => {
    it("removes the entry", () => {
      const index = new JournalIndex();
      index.set(a("2022-01-01"), p("notes/a.md"));
      index.delete(a("2022-01-01"));
      expect(index.has(a("2022-01-01"))).toBe(false);
    });

    it("is a no-op when anchor is absent", () => {
      const index = new JournalIndex();
      index.set(a("2022-01-01"), p("notes/a.md"));
      index.delete(a("2099-12-31"));
      expect(index.has(a("2022-01-01"))).toBe(true);
    });
  });

  describe("clear", () => {
    it("empties the index", () => {
      const index = new JournalIndex();
      index.set(a("2022-01-01"), p("notes/a.md"));
      index.set(a("2022-01-02"), p("notes/b.md"));
      index.clear();
      expect(index.has(a("2022-01-01"))).toBe(false);
      expect(index.has(a("2022-01-02"))).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

```bash
npm test -- src/journals/journal-index.test.ts
```

Expected: FAIL (module not found / `JournalIndex` is not a constructor).

- [ ] **Step 3: Implement `JournalIndex` with CRUD and the sorted invariant**

```ts
// src/journals/journal-index.ts
import { Option } from "@/infrastructure/result";

import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";

export class JournalIndex {
  readonly #byAnchor = new Map<AnchorString, VaultPath>();
  readonly #sortedAnchors: AnchorString[] = [];

  has(anchor: AnchorString): boolean {
    return this.#byAnchor.has(anchor);
  }

  get(anchor: AnchorString): Option<VaultPath> {
    return Option.fromNullable(this.#byAnchor.get(anchor));
  }

  set(anchor: AnchorString, path: VaultPath): void {
    if (!this.#byAnchor.has(anchor)) this.#insertSorted(anchor);
    this.#byAnchor.set(anchor, path);
  }

  delete(anchor: AnchorString): void {
    if (!this.#byAnchor.has(anchor)) return;
    this.#removeSorted(anchor);
    this.#byAnchor.delete(anchor);
  }

  clear(): void {
    this.#byAnchor.clear();
    this.#sortedAnchors.length = 0;
  }

  #insertSorted(anchor: AnchorString): void {
    const result = this.#bsearch(anchor);
    const insertAt = result.found ? result.index : result.insertionPoint;
    this.#sortedAnchors.splice(insertAt, 0, anchor);
  }

  #removeSorted(anchor: AnchorString): void {
    const result = this.#bsearch(anchor);
    if (!result.found) return;
    this.#sortedAnchors.splice(result.index, 1);
  }

  #bsearch(target: AnchorString): { found: true; index: number } | { found: false; insertionPoint: number } {
    let lo = 0;
    let hi = this.#sortedAnchors.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const cur = this.#sortedAnchors[mid]!;
      if (cur === target) return { found: true, index: mid };
      if (cur < target) lo = mid + 1;
      else hi = mid;
    }
    return { found: false, insertionPoint: lo };
  }
}
```

`#sortedAnchors` is not observable yet — Tasks 5, 6, 7 add the methods that consult it. But maintaining it from day one means later tasks add new methods without rewriting existing ones.

- [ ] **Step 4: Run the tests, verify they pass**

```bash
npm test -- src/journals/journal-index.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 5: Check types and lint**

```bash
npm run check:types
npm run check:lint
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/journals/journal-index.ts src/journals/journal-index.test.ts
git commit -m "feat(journals): add JournalIndex with anchor-keyed CRUD"
```

---

## Task 4: `JournalIndex` — iterator and `size`

**Background.** Both observable through the existing `#byAnchor`. Iterator yields in sorted anchor order (consumers shouldn't rely on hash-map insertion order — sorted is a sharper, more predictable contract and we already maintain `#sortedAnchors`).

**Files:**

- Modify: `src/journals/journal-index.ts`
- Modify: `src/journals/journal-index.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `src/journals/journal-index.test.ts`, inside the outer `describe("JournalIndex", ...)`:

```ts
describe("size", () => {
  it("reports the number of entries", () => {
    const index = new JournalIndex();
    expect(index.size).toBe(0);
    index.set(a("2022-01-01"), p("notes/a.md"));
    index.set(a("2022-01-02"), p("notes/b.md"));
    expect(index.size).toBe(2);
    index.delete(a("2022-01-01"));
    expect(index.size).toBe(1);
  });
});

describe("iteration", () => {
  it("yields all entries in anchor order", () => {
    const index = new JournalIndex();
    index.set(a("2022-02-01"), p("notes/b.md"));
    index.set(a("2022-01-01"), p("notes/a.md"));
    index.set(a("2022-03-01"), p("notes/c.md"));
    const seen = [...index];
    expect(seen).toEqual([
      [a("2022-01-01"), p("notes/a.md")],
      [a("2022-02-01"), p("notes/b.md")],
      [a("2022-03-01"), p("notes/c.md")],
    ]);
  });
});
```

- [ ] **Step 2: Run tests, verify the new ones fail**

```bash
npm test -- src/journals/journal-index.test.ts
```

Expected: FAIL on `size` (undefined) and iteration (not iterable).

- [ ] **Step 3: Add the implementations**

In `src/journals/journal-index.ts`, add inside the class after `clear`:

```ts
  get size(): number {
    return this.#byAnchor.size;
  }

  *[Symbol.iterator](): IterableIterator<readonly [AnchorString, VaultPath]> {
    for (const anchor of this.#sortedAnchors) {
      yield [anchor, this.#byAnchor.get(anchor)!] as const;
    }
  }
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- src/journals/journal-index.test.ts
```

Expected: all 10 tests pass.

- [ ] **Step 5: Check types and lint**

```bash
npm run check:types
npm run check:lint
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/journals/journal-index.ts src/journals/journal-index.test.ts
git commit -m "feat(journals): JournalIndex exposes size and iterator in anchor order"
```

---

## Task 5: `JournalIndex` — `getRange`

**Background.** Inclusive range walk over `#sortedAnchors`. Returns a fresh `ReadonlyMap` snapshot — the reactive primitive for the future calendar bridge per the spec. Empty range (start > end after lexicographic compare, or start beyond all anchors, or end before all anchors) → empty map.

**Files:**

- Modify: `src/journals/journal-index.ts`
- Modify: `src/journals/journal-index.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `src/journals/journal-index.test.ts`, inside the outer describe:

```ts
describe("getRange", () => {
  function buildIndex(): JournalIndex {
    const index = new JournalIndex();
    index.set(a("2022-01-01"), p("notes/a.md"));
    index.set(a("2022-01-05"), p("notes/b.md"));
    index.set(a("2022-01-10"), p("notes/c.md"));
    index.set(a("2022-02-01"), p("notes/d.md"));
    return index;
  }

  it("returns entries within an inclusive range", () => {
    const result = buildIndex().getRange(a("2022-01-05"), a("2022-01-10"));
    expect([...result.entries()]).toEqual([
      [a("2022-01-05"), p("notes/b.md")],
      [a("2022-01-10"), p("notes/c.md")],
    ]);
  });

  it("includes the start anchor when present", () => {
    const result = buildIndex().getRange(a("2022-01-01"), a("2022-01-05"));
    expect(result.has(a("2022-01-01"))).toBe(true);
  });

  it("includes the end anchor when present", () => {
    const result = buildIndex().getRange(a("2022-01-05"), a("2022-01-10"));
    expect(result.has(a("2022-01-10"))).toBe(true);
  });

  it("returns empty map when range starts after all entries", () => {
    const result = buildIndex().getRange(a("2023-01-01"), a("2023-12-31"));
    expect(result.size).toBe(0);
  });

  it("returns empty map when range ends before all entries", () => {
    const result = buildIndex().getRange(a("2021-01-01"), a("2021-12-31"));
    expect(result.size).toBe(0);
  });

  it("returns empty map when start is after end", () => {
    const result = buildIndex().getRange(a("2022-02-01"), a("2022-01-01"));
    expect(result.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- src/journals/journal-index.test.ts
```

Expected: FAIL — `getRange` is not a function.

- [ ] **Step 3: Add the implementation**

In `src/journals/journal-index.ts`, add inside the class after the iterator:

```ts
  getRange(start: AnchorString, end: AnchorString): ReadonlyMap<AnchorString, VaultPath> {
    const out = new Map<AnchorString, VaultPath>();
    if (start > end) return out;
    const startResult = this.#bsearch(start);
    const startIndex = startResult.found ? startResult.index : startResult.insertionPoint;
    for (let i = startIndex; i < this.#sortedAnchors.length; i++) {
      const anchor = this.#sortedAnchors[i]!;
      if (anchor > end) break;
      out.set(anchor, this.#byAnchor.get(anchor)!);
    }
    return out;
  }
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- src/journals/journal-index.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Check types and lint**

```bash
npm run check:types
npm run check:lint
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/journals/journal-index.ts src/journals/journal-index.test.ts
git commit -m "feat(journals): JournalIndex supports inclusive range queries"
```

---

## Task 6: `JournalIndex` — `findNext` and `findPrevious`

**Background.** Both take any `AnchorString`, not just existing entries (fixes v2's signature-vs-algorithm mismatch). Semantics: "strictly after / strictly before this anchor in sorted order, regardless of whether the input itself is in the index." The bsearch result already gives us the right starting point — for `findNext`, the predecessor index +1 if found exact (skip the exact match) or the `insertionPoint` if not found (which IS the first strictly-greater).

**Files:**

- Modify: `src/journals/journal-index.ts`
- Modify: `src/journals/journal-index.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `src/journals/journal-index.test.ts`:

```ts
describe("findNext", () => {
  function buildIndex(): JournalIndex {
    const index = new JournalIndex();
    index.set(a("2022-01-01"), p("notes/a.md"));
    index.set(a("2022-01-05"), p("notes/b.md"));
    index.set(a("2022-01-10"), p("notes/c.md"));
    return index;
  }

  it("returns the next path when from is an existing anchor", () => {
    const result = buildIndex().findNext(a("2022-01-01"));
    if (result.isSome()) expect(result.value).toBe(p("notes/b.md"));
    else throw new Error("expected Some");
  });

  it("returns the next path when from is between entries", () => {
    const result = buildIndex().findNext(a("2022-01-03"));
    if (result.isSome()) expect(result.value).toBe(p("notes/b.md"));
    else throw new Error("expected Some");
  });

  it("returns the first path when from is before any anchor", () => {
    const result = buildIndex().findNext(a("2021-12-31"));
    if (result.isSome()) expect(result.value).toBe(p("notes/a.md"));
    else throw new Error("expected Some");
  });

  it("returns None when from is at or past the last anchor", () => {
    const last = buildIndex().findNext(a("2022-01-10"));
    const past = buildIndex().findNext(a("2099-12-31"));
    expect(last.isNone()).toBe(true);
    expect(past.isNone()).toBe(true);
  });

  it("returns None when the index is empty", () => {
    expect(new JournalIndex().findNext(a("2022-01-01")).isNone()).toBe(true);
  });
});

describe("findPrevious", () => {
  function buildIndex(): JournalIndex {
    const index = new JournalIndex();
    index.set(a("2022-01-01"), p("notes/a.md"));
    index.set(a("2022-01-05"), p("notes/b.md"));
    index.set(a("2022-01-10"), p("notes/c.md"));
    return index;
  }

  it("returns the previous path when from is an existing anchor", () => {
    const result = buildIndex().findPrevious(a("2022-01-10"));
    if (result.isSome()) expect(result.value).toBe(p("notes/b.md"));
    else throw new Error("expected Some");
  });

  it("returns the previous path when from is between entries", () => {
    const result = buildIndex().findPrevious(a("2022-01-07"));
    if (result.isSome()) expect(result.value).toBe(p("notes/b.md"));
    else throw new Error("expected Some");
  });

  it("returns the last path when from is after any anchor", () => {
    const result = buildIndex().findPrevious(a("2099-12-31"));
    if (result.isSome()) expect(result.value).toBe(p("notes/c.md"));
    else throw new Error("expected Some");
  });

  it("returns None when from is at or before the first anchor", () => {
    const first = buildIndex().findPrevious(a("2022-01-01"));
    const before = buildIndex().findPrevious(a("2021-01-01"));
    expect(first.isNone()).toBe(true);
    expect(before.isNone()).toBe(true);
  });

  it("returns None when the index is empty", () => {
    expect(new JournalIndex().findPrevious(a("2022-01-01")).isNone()).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- src/journals/journal-index.test.ts
```

Expected: FAIL on `findNext` / `findPrevious`.

- [ ] **Step 3: Add the implementations**

In `src/journals/journal-index.ts`, add inside the class after `getRange`:

```ts
  findNext(from: AnchorString): Option<VaultPath> {
    const result = this.#bsearch(from);
    const nextIndex = result.found ? result.index + 1 : result.insertionPoint;
    return Option.fromNullable(this.#sortedAnchors[nextIndex]).flatMap((anchor) => this.get(anchor));
  }

  findPrevious(from: AnchorString): Option<VaultPath> {
    const result = this.#bsearch(from);
    const previousIndex = (result.found ? result.index : result.insertionPoint) - 1;
    if (previousIndex < 0) return Option.none();
    return Option.fromNullable(this.#sortedAnchors[previousIndex]).flatMap((anchor) => this.get(anchor));
  }
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- src/journals/journal-index.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Check types and lint**

```bash
npm run check:types
npm run check:lint
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/journals/journal-index.ts src/journals/journal-index.test.ts
git commit -m "feat(journals): JournalIndex supports next/previous anchor navigation"
```

---

## Task 7: `JournalIndex` — `findClosestAnchor`

**Background.** Returns the _anchor_, not the path. Callers compose `findClosestAnchor(...).flatMap(get)` for the path. Semantics per v2's `findClosestDate`:

- empty index → None
- exact match → Some(target)
- target before first anchor → Some(first)
- target after last anchor → Some(last)
- otherwise → predecessor (matches v2 test: `2022-01-05` with entries at `..., 2022-01-04, ...` → `2022-01-04`)

**Files:**

- Modify: `src/journals/journal-index.ts`
- Modify: `src/journals/journal-index.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `src/journals/journal-index.test.ts`:

```ts
describe("findClosestAnchor", () => {
  function buildIndex(): JournalIndex {
    const index = new JournalIndex();
    index.set(a("2022-01-01"), p("notes/a.md"));
    index.set(a("2022-01-02"), p("notes/b.md"));
    index.set(a("2022-01-04"), p("notes/c.md"));
    index.set(a("2022-11-10"), p("notes/d.md"));
    return index;
  }

  it("returns the exact anchor when present", () => {
    const result = buildIndex().findClosestAnchor(a("2022-01-02"));
    if (result.isSome()) expect(result.value).toBe(a("2022-01-02"));
    else throw new Error("expected Some");
  });

  it("returns the first anchor when target is before the range", () => {
    const result = buildIndex().findClosestAnchor(a("2021-12-31"));
    if (result.isSome()) expect(result.value).toBe(a("2022-01-01"));
    else throw new Error("expected Some");
  });

  it("returns the last anchor when target is after the range", () => {
    const result = buildIndex().findClosestAnchor(a("2023-01-01"));
    if (result.isSome()) expect(result.value).toBe(a("2022-11-10"));
    else throw new Error("expected Some");
  });

  it("returns the previous anchor when target is between entries", () => {
    const result = buildIndex().findClosestAnchor(a("2022-01-05"));
    if (result.isSome()) expect(result.value).toBe(a("2022-01-04"));
    else throw new Error("expected Some");
  });

  it("returns None when the index is empty", () => {
    expect(new JournalIndex().findClosestAnchor(a("2022-01-01")).isNone()).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- src/journals/journal-index.test.ts
```

Expected: FAIL on `findClosestAnchor`.

- [ ] **Step 3: Add the implementation**

In `src/journals/journal-index.ts`, add inside the class after `findPrevious`:

```ts
  findClosestAnchor(to: AnchorString): Option<AnchorString> {
    if (this.#sortedAnchors.length === 0) return Option.none();
    const result = this.#bsearch(to);
    if (result.found) return Option.some(to);
    const first = this.#sortedAnchors[0]!;
    if (to < first) return Option.some(first);
    const last = this.#sortedAnchors[this.#sortedAnchors.length - 1]!;
    if (to > last) return Option.some(last);
    return Option.fromNullable(this.#sortedAnchors[result.insertionPoint - 1]);
  }
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- src/journals/journal-index.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Check types and lint**

```bash
npm run check:types
npm run check:lint
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/journals/journal-index.ts src/journals/journal-index.test.ts
git commit -m "feat(journals): JournalIndex supports closest-anchor lookup"
```

---

## Task 8: `JournalIndex` bench

**Background.** Direct port of v2's `journal-index.bench.ts` at 1y and 10y data scales, adapted to v3 types. The bench is informational — it doesn't run under `npm test`, only `npm run bench`. We still verify it loads cleanly with `vitest bench --run` so type or import errors aren't silently hidden.

**Files:**

- Create: `src/journals/journal-index.bench.ts`

- [ ] **Step 1: Create the bench file**

```ts
// src/journals/journal-index.bench.ts
import moment from "moment";
import { bench, describe } from "vitest";

import { JournalIndex } from "./journal-index";

import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";

const a = (s: string) => s as AnchorString;
const p = (s: string) => s as VaultPath;

function prepareTenYearsOfAnchors(): string[] {
  const dates: string[] = [];
  const cursor = moment("2022-01-01");
  const end = cursor.clone().add(10, "years");
  while (cursor.isSameOrBefore(end)) {
    dates.push(cursor.format("YYYY-MM-DD"));
    cursor.add(1, "day");
  }
  return dates;
}

describe.skip("JournalIndex - filling in", () => {
  const dates = prepareTenYearsOfAnchors();

  bench("fill in journal - 1 year", () => {
    const index = new JournalIndex();
    for (const date of dates.slice(0, 365)) {
      index.set(a(date), p("path/" + date));
    }
  });

  bench("fill in journal - 10 years", () => {
    const index = new JournalIndex();
    for (const date of dates) {
      index.set(a(date), p("path/" + date));
    }
  });
});

describe("JournalIndex - find next", () => {
  const index = new JournalIndex();
  for (const date of prepareTenYearsOfAnchors()) {
    index.set(a(date), p("path/" + date));
  }

  bench("find beginning", () => {
    index.findNext(a("2022-02-01"));
  });

  bench("find middle", () => {
    index.findNext(a("2027-05-01"));
  });

  bench("find end", () => {
    index.findNext(a("2030-12-01"));
  });

  bench("find missing", () => {
    index.findNext(a("2031-01-01"));
  });
});

describe("JournalIndex - find previous", () => {
  const index = new JournalIndex();
  for (const date of prepareTenYearsOfAnchors()) {
    index.set(a(date), p("path/" + date));
  }

  bench("find beginning", () => {
    index.findPrevious(a("2022-02-01"));
  });

  bench("find middle", () => {
    index.findPrevious(a("2027-05-01"));
  });

  bench("find end", () => {
    index.findPrevious(a("2030-12-01"));
  });

  bench("find missing", () => {
    index.findPrevious(a("2031-01-01"));
  });
});

describe("JournalIndex - find closest anchor", () => {
  const index = new JournalIndex();
  for (const date of prepareTenYearsOfAnchors()) {
    index.set(a(date), p("path/" + date));
  }
  index.delete(a("2022-03-01"));
  index.delete(a("2027-06-01"));
  index.delete(a("2030-11-01"));

  bench("find closest beginning known", () => {
    index.findClosestAnchor(a("2022-01-10"));
  });

  bench("find closest middle known", () => {
    index.findClosestAnchor(a("2027-05-10"));
  });

  bench("find closest end known", () => {
    index.findClosestAnchor(a("2030-12-10"));
  });

  bench("find closest beginning gap", () => {
    index.findClosestAnchor(a("2022-03-01"));
  });

  bench("find closest middle gap", () => {
    index.findClosestAnchor(a("2027-06-01"));
  });

  bench("find closest end gap", () => {
    index.findClosestAnchor(a("2030-11-01"));
  });

  bench("find closest before known", () => {
    index.findClosestAnchor(a("2021-12-01"));
  });

  bench("find closest after known", () => {
    index.findClosestAnchor(a("2033-01-01"));
  });
});
```

The `describe.skip` on the filling-in block matches v2 — those benches run setup-heavy code per iteration and v2 keeps them gated.

- [ ] **Step 2: Verify the bench file type-checks and loads**

```bash
npm run check:types
npm run check:lint
```

Expected: pass. (Type-only check; we don't actually time the benches in CI.)

- [ ] **Step 3: Smoke-run one bench**

```bash
npm run bench -- src/journals/journal-index.bench.ts --run
```

Expected: vitest emits a benchmark report (numbers will vary; we only care that it doesn't error).

- [ ] **Step 4: Commit**

```bash
git add src/journals/journal-index.bench.ts
git commit -m "test(journals): port JournalIndex perf benches at 1y/10y scales"
```

---

## Task 9: `JournalsIndex` scaffolding + `register`

**Background.** Three things land in this task: the class skeleton (`#journals`, `#byPath`, `#emitter`, `events`, `#dirty`, `#flushScheduled`), the `register` method covering all four sub-cases (new, identical no-op, same-journal reuse, cross-journal reuse), and `entryByPath` (we need it to _observe_ `register`'s effect on the reverse map). `unregister`, `transferPath`, queries, and coalescing land in later tasks.

For tests that observe events, we capture into a local array via `idx.events.on("entryChanged", (e) => seen.push(e))`. `journalDirty` coalescing is _not_ exercised here — those tests live in Task 12. Tests that incidentally trigger `journalDirty` ignore it.

For the coalescing helper `#markDirty`, we still need to introduce it now so `register` can call it (we'd otherwise have to rewrite `register` later). The microtask flush is what Task 12 will test. Here we only assert that `register` calls `#markDirty` (transitively — by checking that `journalDirty` _eventually_ fires after an `await Promise.resolve()`). Actually, simpler: scope this task to _not_ test `journalDirty` at all. Task 12 covers it. Asserting it isn't called would be over-specification.

**Files:**

- Create: `src/journals/journals-index.ts`
- Create: `src/journals/journals-index.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/journals/journals-index.test.ts
import { describe, expect, it } from "vitest";

import { JournalsIndex } from "./journals-index";

import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";
import type { JournalEntry, JournalsIndexEvents } from "./types";

const a = (s: string) => s as AnchorString;
const p = (s: string) => s as VaultPath;
const entry = (journalName: string, anchor: string, path: string): JournalEntry => ({
  journalName,
  anchor: a(anchor),
  path: p(path),
});

interface CapturedEvents {
  entryChanged: Parameters<JournalsIndexEvents["entryChanged"]>[0][];
  journalDirty: Parameters<JournalsIndexEvents["journalDirty"]>[0][];
}

function capture(idx: JournalsIndex): CapturedEvents {
  const events: CapturedEvents = { entryChanged: [], journalDirty: [] };
  idx.events.on("entryChanged", (e) => events.entryChanged.push(e));
  idx.events.on("journalDirty", (e) => events.journalDirty.push(e));
  return events;
}

describe("JournalsIndex", () => {
  describe("register", () => {
    it("indexes the entry under its journal", () => {
      const idx = new JournalsIndex();
      idx.register(entry("daily", "2022-01-01", "Daily/2022-01-01.md"));
      const result = idx.entryByPath(p("Daily/2022-01-01.md"));
      if (result.isSome()) {
        expect(result.value.journalName).toBe("daily");
        expect(result.value.anchor).toBe(a("2022-01-01"));
      } else {
        throw new Error("expected Some");
      }
    });

    it("emits entryChanged with kind: added for a new path", () => {
      const idx = new JournalsIndex();
      const events = capture(idx);
      const e = entry("daily", "2022-01-01", "Daily/2022-01-01.md");
      idx.register(e);
      expect(events.entryChanged).toEqual([{ entry: e, kind: "added" }]);
    });

    it("identical re-registration emits nothing", () => {
      const idx = new JournalsIndex();
      const e = entry("daily", "2022-01-01", "Daily/2022-01-01.md");
      idx.register(e);
      const events = capture(idx);
      idx.register(e);
      expect(events.entryChanged).toEqual([]);
    });

    it("re-registering a path with a new anchor emits removed for the old entry and added for the new", () => {
      const idx = new JournalsIndex();
      const oldEntry = entry("daily", "2022-01-01", "Daily/2022-01-01.md");
      const newEntry = entry("daily", "2022-01-02", "Daily/2022-01-01.md");
      idx.register(oldEntry);
      const events = capture(idx);
      idx.register(newEntry);
      expect(events.entryChanged).toEqual([
        { entry: oldEntry, kind: "removed" },
        { entry: newEntry, kind: "added" },
      ]);
    });

    it("re-registering a path under a different journal removes it from the old journal", () => {
      const idx = new JournalsIndex();
      idx.register(entry("daily", "2022-01-01", "shared.md"));
      idx.register(entry("weekly", "2022-W01", "shared.md"));
      const result = idx.entryByPath(p("shared.md"));
      if (result.isSome()) expect(result.value.journalName).toBe("weekly");
      else throw new Error("expected Some");
    });

    it("re-registering across journals emits removed for the old and added for the new", () => {
      const idx = new JournalsIndex();
      const oldEntry = entry("daily", "2022-01-01", "shared.md");
      const newEntry = entry("weekly", "2022-W01", "shared.md");
      idx.register(oldEntry);
      const events = capture(idx);
      idx.register(newEntry);
      expect(events.entryChanged).toEqual([
        { entry: oldEntry, kind: "removed" },
        { entry: newEntry, kind: "added" },
      ]);
    });
  });

  describe("entryByPath", () => {
    it("returns None for an unknown path", () => {
      const idx = new JournalsIndex();
      expect(idx.entryByPath(p("missing.md")).isNone()).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- src/journals/journals-index.test.ts
```

Expected: FAIL — `JournalsIndex` undefined.

- [ ] **Step 3: Implement the scaffolding + `register` + `entryByPath`**

```ts
// src/journals/journals-index.ts
import { createNanoEvents } from "nanoevents";

import { Option } from "@/infrastructure/result";

import { JournalIndex } from "./journal-index";

import type { AnchorString } from "@/calendar";
import type { Subscribable, TypedEmitter } from "@/infrastructure/events";
import type { VaultPath } from "@/infrastructure/host";
import type { JournalEntry, JournalsIndexEvents } from "./types";

export class JournalsIndex {
  readonly #journals = new Map<string, JournalIndex>();
  readonly #byPath = new Map<VaultPath, JournalEntry>();
  readonly #emitter: TypedEmitter<JournalsIndexEvents> = createNanoEvents();
  readonly events: Subscribable<JournalsIndexEvents> = this.#emitter;

  readonly #dirty = new Set<string>();
  #flushScheduled = false;

  entryByPath(path: VaultPath): Option<JournalEntry> {
    return Option.fromNullable(this.#byPath.get(path));
  }

  register(entry: JournalEntry): void {
    const existing = this.#byPath.get(entry.path);
    if (existing) {
      if (
        existing.journalName === entry.journalName &&
        existing.anchor === entry.anchor &&
        existing.path === entry.path
      ) {
        return;
      }
      this.#journals.get(existing.journalName)?.delete(existing.anchor);
      this.#emitter.emit("entryChanged", { entry: existing, kind: "removed" });
      this.#markDirty(existing.journalName);
    }
    let journalIndex = this.#journals.get(entry.journalName);
    if (!journalIndex) {
      journalIndex = new JournalIndex();
      this.#journals.set(entry.journalName, journalIndex);
    }
    journalIndex.set(entry.anchor, entry.path);
    this.#byPath.set(entry.path, entry);
    this.#emitter.emit("entryChanged", { entry, kind: "added" });
    this.#markDirty(entry.journalName);
  }

  #markDirty(journalName: string): void {
    this.#dirty.add(journalName);
    if (this.#flushScheduled) return;
    this.#flushScheduled = true;
    queueMicrotask(() => {
      this.#flushScheduled = false;
      const names = [...this.#dirty];
      this.#dirty.clear();
      for (const name of names) {
        this.#emitter.emit("journalDirty", { journalName: name });
      }
    });
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- src/journals/journals-index.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 5: Check types and lint**

```bash
npm run check:types
npm run check:lint
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/journals/journals-index.ts src/journals/journals-index.test.ts
git commit -m "feat(journals): add JournalsIndex with register and entryByPath"
```

---

## Task 10: `JournalsIndex` — `unregister`

**Files:**

- Modify: `src/journals/journals-index.ts`
- Modify: `src/journals/journals-index.test.ts`

- [ ] **Step 1: Add the failing tests**

Append inside the outer `describe("JournalsIndex", ...)`:

```ts
describe("unregister", () => {
  it("removes the entry from path lookup", () => {
    const idx = new JournalsIndex();
    idx.register(entry("daily", "2022-01-01", "Daily/2022-01-01.md"));
    idx.unregister(p("Daily/2022-01-01.md"));
    expect(idx.entryByPath(p("Daily/2022-01-01.md")).isNone()).toBe(true);
  });

  it("emits entryChanged with kind: removed", () => {
    const idx = new JournalsIndex();
    const e = entry("daily", "2022-01-01", "Daily/2022-01-01.md");
    idx.register(e);
    const events = capture(idx);
    idx.unregister(p("Daily/2022-01-01.md"));
    expect(events.entryChanged).toEqual([{ entry: e, kind: "removed" }]);
  });

  it("is a no-op when path is unknown", () => {
    const idx = new JournalsIndex();
    const events = capture(idx);
    idx.unregister(p("missing.md"));
    expect(events.entryChanged).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- src/journals/journals-index.test.ts
```

Expected: FAIL — `unregister` is not a function.

- [ ] **Step 3: Add the implementation**

In `src/journals/journals-index.ts`, add inside the class after `register`:

```ts
  unregister(path: VaultPath): void {
    const existing = this.#byPath.get(path);
    if (!existing) return;
    this.#journals.get(existing.journalName)?.delete(existing.anchor);
    this.#byPath.delete(path);
    this.#emitter.emit("entryChanged", { entry: existing, kind: "removed" });
    this.#markDirty(existing.journalName);
  }
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- src/journals/journals-index.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Check types and lint**

```bash
npm run check:types
npm run check:lint
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/journals/journals-index.ts src/journals/journals-index.test.ts
git commit -m "feat(journals): JournalsIndex supports unregister by path"
```

---

## Task 11: `JournalsIndex` — `transferPath`

**Background.** Rename-only: `journalName` and `anchor` are preserved; only the path key changes. The per-journal `JournalIndex` keeps the same anchor key but its stored value (the path) updates. The reverse map removes `from` and sets `to`. Emits `removed` (old entry) + `added` (new entry); marks the journal dirty once via the coalescing helper.

**Files:**

- Modify: `src/journals/journals-index.ts`
- Modify: `src/journals/journals-index.test.ts`

- [ ] **Step 1: Add the failing tests**

Append inside the outer describe:

```ts
describe("transferPath", () => {
  it("updates the path while keeping journal and anchor", () => {
    const idx = new JournalsIndex();
    idx.register(entry("daily", "2022-01-01", "old.md"));
    idx.transferPath(p("old.md"), p("new.md"));
    const result = idx.entryByPath(p("new.md"));
    if (result.isSome()) {
      expect(result.value.journalName).toBe("daily");
      expect(result.value.anchor).toBe(a("2022-01-01"));
      expect(result.value.path).toBe(p("new.md"));
    } else {
      throw new Error("expected Some");
    }
  });

  it("removes the entry from the old path lookup", () => {
    const idx = new JournalsIndex();
    idx.register(entry("daily", "2022-01-01", "old.md"));
    idx.transferPath(p("old.md"), p("new.md"));
    expect(idx.entryByPath(p("old.md")).isNone()).toBe(true);
  });

  it("emits removed for the old path and added for the new path", () => {
    const idx = new JournalsIndex();
    const oldEntry = entry("daily", "2022-01-01", "old.md");
    idx.register(oldEntry);
    const events = capture(idx);
    idx.transferPath(p("old.md"), p("new.md"));
    const newEntry = entry("daily", "2022-01-01", "new.md");
    expect(events.entryChanged).toEqual([
      { entry: oldEntry, kind: "removed" },
      { entry: newEntry, kind: "added" },
    ]);
  });

  it("is a no-op when from path is unknown", () => {
    const idx = new JournalsIndex();
    const events = capture(idx);
    idx.transferPath(p("missing.md"), p("new.md"));
    expect(events.entryChanged).toEqual([]);
  });

  it("is a no-op when from equals to", () => {
    const idx = new JournalsIndex();
    idx.register(entry("daily", "2022-01-01", "same.md"));
    const events = capture(idx);
    idx.transferPath(p("same.md"), p("same.md"));
    expect(events.entryChanged).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- src/journals/journals-index.test.ts
```

Expected: FAIL — `transferPath` is not a function.

- [ ] **Step 3: Add the implementation**

In `src/journals/journals-index.ts`, add inside the class after `unregister`:

```ts
  transferPath(from: VaultPath, to: VaultPath): void {
    if (from === to) return;
    const existing = this.#byPath.get(from);
    if (!existing) return;
    const next: JournalEntry = { ...existing, path: to };
    const journalIndex = this.#journals.get(existing.journalName);
    journalIndex?.set(existing.anchor, to);
    this.#byPath.delete(from);
    this.#byPath.set(to, next);
    this.#emitter.emit("entryChanged", { entry: existing, kind: "removed" });
    this.#emitter.emit("entryChanged", { entry: next, kind: "added" });
    this.#markDirty(existing.journalName);
  }
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- src/journals/journals-index.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Check types and lint**

```bash
npm run check:types
npm run check:lint
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/journals/journals-index.ts src/journals/journals-index.test.ts
git commit -m "feat(journals): JournalsIndex supports path transfer (rename)"
```

---

## Task 12: `JournalsIndex` — `clearJournal` and `clear`

**Background.** `clearJournal(name)` drops every entry for one journal from both `#byPath` and the per-journal index, then removes the per-journal index entry from `#journals`. Emits only `journalDirty` (no per-entry `entryChanged`, per the spec — bulk removal shouldn't flood granular listeners). `clear()` does the same for every journal in one pass; emits `journalDirty` once per previously-known journal (coalesced into one microtask flush).

**Files:**

- Modify: `src/journals/journals-index.ts`
- Modify: `src/journals/journals-index.test.ts`

- [ ] **Step 1: Add the failing tests**

Append inside the outer describe:

```ts
describe("clearJournal", () => {
  it("removes all entries for the journal", () => {
    const idx = new JournalsIndex();
    idx.register(entry("daily", "2022-01-01", "a.md"));
    idx.register(entry("daily", "2022-01-02", "b.md"));
    idx.clearJournal("daily");
    expect(idx.entryByPath(p("a.md")).isNone()).toBe(true);
    expect(idx.entryByPath(p("b.md")).isNone()).toBe(true);
  });

  it("does not affect other journals", () => {
    const idx = new JournalsIndex();
    idx.register(entry("daily", "2022-01-01", "a.md"));
    idx.register(entry("weekly", "2022-W01", "w.md"));
    idx.clearJournal("daily");
    expect(idx.entryByPath(p("w.md")).isSome()).toBe(true);
  });

  it("does not emit per-entry entryChanged", () => {
    const idx = new JournalsIndex();
    idx.register(entry("daily", "2022-01-01", "a.md"));
    idx.register(entry("daily", "2022-01-02", "b.md"));
    const events = capture(idx);
    idx.clearJournal("daily");
    expect(events.entryChanged).toEqual([]);
  });

  it("is a no-op when journal is unknown", () => {
    const idx = new JournalsIndex();
    const events = capture(idx);
    idx.clearJournal("ghost");
    expect(events.entryChanged).toEqual([]);
  });
});

describe("clear", () => {
  it("empties every journal", () => {
    const idx = new JournalsIndex();
    idx.register(entry("daily", "2022-01-01", "a.md"));
    idx.register(entry("weekly", "2022-W01", "w.md"));
    idx.clear();
    expect(idx.entryByPath(p("a.md")).isNone()).toBe(true);
    expect(idx.entryByPath(p("w.md")).isNone()).toBe(true);
  });

  it("does not emit per-entry entryChanged", () => {
    const idx = new JournalsIndex();
    idx.register(entry("daily", "2022-01-01", "a.md"));
    idx.register(entry("weekly", "2022-W01", "w.md"));
    const events = capture(idx);
    idx.clear();
    expect(events.entryChanged).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- src/journals/journals-index.test.ts
```

Expected: FAIL — `clearJournal` / `clear` are not functions.

- [ ] **Step 3: Add the implementations**

In `src/journals/journals-index.ts`, add inside the class after `transferPath`:

```ts
  clearJournal(journalName: string): void {
    const journalIndex = this.#journals.get(journalName);
    if (!journalIndex) return;
    for (const [, path] of journalIndex) {
      this.#byPath.delete(path);
    }
    journalIndex.clear();
    this.#journals.delete(journalName);
    this.#markDirty(journalName);
  }

  clear(): void {
    const names = [...this.#journals.keys()];
    this.#byPath.clear();
    for (const idx of this.#journals.values()) idx.clear();
    this.#journals.clear();
    for (const name of names) this.#markDirty(name);
  }
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- src/journals/journals-index.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Check types and lint**

```bash
npm run check:types
npm run check:lint
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/journals/journals-index.ts src/journals/journals-index.test.ts
git commit -m "feat(journals): JournalsIndex supports clearJournal and clear"
```

---

## Task 13: `JournalsIndex` — `journalDirty` coalescing

**Background.** The microtask flush is already implemented in `#markDirty` (added in Task 9). This task only adds tests that lock in the behavior — multiple sync mutations against the same journal collapse to one `journalDirty`; mutations across journals each get one; `entryChanged` still fires synchronously per mutation even while coalescing.

**Files:**

- Modify: `src/journals/journals-index.test.ts`

- [ ] **Step 1: Add the tests**

Append inside the outer describe:

```ts
describe("journalDirty coalescing", () => {
  it("multiple register calls within one microtask emit one journalDirty per journal", async () => {
    const idx = new JournalsIndex();
    const events = capture(idx);
    idx.register(entry("daily", "2022-01-01", "a.md"));
    idx.register(entry("daily", "2022-01-02", "b.md"));
    idx.register(entry("daily", "2022-01-03", "c.md"));
    await Promise.resolve();
    expect(events.journalDirty).toEqual([{ journalName: "daily" }]);
  });

  it("changes across different journals emit one journalDirty each", async () => {
    const idx = new JournalsIndex();
    const events = capture(idx);
    idx.register(entry("daily", "2022-01-01", "a.md"));
    idx.register(entry("weekly", "2022-W01", "w.md"));
    await Promise.resolve();
    expect(new Set(events.journalDirty.map((e) => e.journalName))).toEqual(new Set(["daily", "weekly"]));
    expect(events.journalDirty).toHaveLength(2);
  });

  it("entryChanged still fires synchronously per mutation during coalescing", () => {
    const idx = new JournalsIndex();
    const events = capture(idx);
    idx.register(entry("daily", "2022-01-01", "a.md"));
    idx.register(entry("daily", "2022-01-02", "b.md"));
    expect(events.entryChanged).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests, verify they pass**

```bash
npm test -- src/journals/journals-index.test.ts
```

Expected: all tests pass (the coalescing logic already exists).

- [ ] **Step 3: Check types and lint**

```bash
npm run check:types
npm run check:lint
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/journals/journals-index.test.ts
git commit -m "test(journals): cover journalDirty microtask coalescing"
```

---

## Task 14: `JournalsIndex` — query passthroughs

**Background.** Thin scoped wrappers around per-journal `JournalIndex` methods: `has`, `get`, `getRange`, `findNext`, `findPrevious`, `findClosestAnchor`, `entriesFor`. Unknown journals must not error — they return `None` / empty.

**Files:**

- Modify: `src/journals/journals-index.ts`
- Modify: `src/journals/journals-index.test.ts`

- [ ] **Step 1: Add the failing tests**

Append inside the outer describe:

```ts
describe("query passthroughs", () => {
  it("has returns true for an indexed (journal, anchor) pair", () => {
    const idx = new JournalsIndex();
    idx.register(entry("daily", "2022-01-01", "a.md"));
    expect(idx.has("daily", a("2022-01-01"))).toBe(true);
  });

  it("has returns false for an unknown journal", () => {
    const idx = new JournalsIndex();
    expect(idx.has("ghost", a("2022-01-01"))).toBe(false);
  });

  it("get returns the path for an indexed (journal, anchor) pair", () => {
    const idx = new JournalsIndex();
    idx.register(entry("daily", "2022-01-01", "a.md"));
    const result = idx.get("daily", a("2022-01-01"));
    if (result.isSome()) expect(result.value).toBe(p("a.md"));
    else throw new Error("expected Some");
  });

  it("get on an unknown journal returns None", () => {
    const idx = new JournalsIndex();
    expect(idx.get("ghost", a("2022-01-01")).isNone()).toBe(true);
  });

  it("getRange returns inclusive entries for the journal", () => {
    const idx = new JournalsIndex();
    idx.register(entry("daily", "2022-01-01", "a.md"));
    idx.register(entry("daily", "2022-01-05", "b.md"));
    idx.register(entry("daily", "2022-01-10", "c.md"));
    idx.register(entry("weekly", "2022-W01", "w.md"));
    const result = idx.getRange("daily", a("2022-01-01"), a("2022-01-05"));
    expect([...result.entries()]).toEqual([
      [a("2022-01-01"), p("a.md")],
      [a("2022-01-05"), p("b.md")],
    ]);
  });

  it("getRange on an unknown journal returns an empty map", () => {
    const idx = new JournalsIndex();
    expect(idx.getRange("ghost", a("2022-01-01"), a("2022-12-31")).size).toBe(0);
  });

  it("findNext returns the next path in the named journal", () => {
    const idx = new JournalsIndex();
    idx.register(entry("daily", "2022-01-01", "a.md"));
    idx.register(entry("daily", "2022-01-05", "b.md"));
    const result = idx.findNext("daily", a("2022-01-01"));
    if (result.isSome()) expect(result.value).toBe(p("b.md"));
    else throw new Error("expected Some");
  });

  it("findNext on an unknown journal returns None", () => {
    const idx = new JournalsIndex();
    expect(idx.findNext("ghost", a("2022-01-01")).isNone()).toBe(true);
  });

  it("findPrevious returns the previous path in the named journal", () => {
    const idx = new JournalsIndex();
    idx.register(entry("daily", "2022-01-01", "a.md"));
    idx.register(entry("daily", "2022-01-05", "b.md"));
    const result = idx.findPrevious("daily", a("2022-01-05"));
    if (result.isSome()) expect(result.value).toBe(p("a.md"));
    else throw new Error("expected Some");
  });

  it("findPrevious on an unknown journal returns None", () => {
    const idx = new JournalsIndex();
    expect(idx.findPrevious("ghost", a("2022-01-05")).isNone()).toBe(true);
  });

  it("findClosestAnchor returns the closest indexed anchor in the named journal", () => {
    const idx = new JournalsIndex();
    idx.register(entry("daily", "2022-01-01", "a.md"));
    idx.register(entry("daily", "2022-01-05", "b.md"));
    const result = idx.findClosestAnchor("daily", a("2022-01-03"));
    if (result.isSome()) expect(result.value).toBe(a("2022-01-01"));
    else throw new Error("expected Some");
  });

  it("findClosestAnchor on an unknown journal returns None", () => {
    const idx = new JournalsIndex();
    expect(idx.findClosestAnchor("ghost", a("2022-01-01")).isNone()).toBe(true);
  });

  it("entriesFor yields every entry of the named journal in anchor order", () => {
    const idx = new JournalsIndex();
    idx.register(entry("daily", "2022-01-05", "b.md"));
    idx.register(entry("daily", "2022-01-01", "a.md"));
    idx.register(entry("weekly", "2022-W01", "w.md"));
    expect([...idx.entriesFor("daily")]).toEqual([
      [a("2022-01-01"), p("a.md")],
      [a("2022-01-05"), p("b.md")],
    ]);
  });

  it("entriesFor on an unknown journal yields nothing", () => {
    const idx = new JournalsIndex();
    expect([...idx.entriesFor("ghost")]).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- src/journals/journals-index.test.ts
```

Expected: FAIL — the query methods are not yet on the class.

- [ ] **Step 3: Add the implementations**

In `src/journals/journals-index.ts`, add inside the class after `clear`:

```ts
  has(journalName: string, anchor: AnchorString): boolean {
    return this.#journals.get(journalName)?.has(anchor) ?? false;
  }

  get(journalName: string, anchor: AnchorString): Option<VaultPath> {
    const journalIndex = this.#journals.get(journalName);
    return journalIndex ? journalIndex.get(anchor) : Option.none();
  }

  getRange(journalName: string, start: AnchorString, end: AnchorString): ReadonlyMap<AnchorString, VaultPath> {
    const journalIndex = this.#journals.get(journalName);
    return journalIndex ? journalIndex.getRange(start, end) : new Map();
  }

  findNext(journalName: string, from: AnchorString): Option<VaultPath> {
    const journalIndex = this.#journals.get(journalName);
    return journalIndex ? journalIndex.findNext(from) : Option.none();
  }

  findPrevious(journalName: string, from: AnchorString): Option<VaultPath> {
    const journalIndex = this.#journals.get(journalName);
    return journalIndex ? journalIndex.findPrevious(from) : Option.none();
  }

  findClosestAnchor(journalName: string, to: AnchorString): Option<AnchorString> {
    const journalIndex = this.#journals.get(journalName);
    return journalIndex ? journalIndex.findClosestAnchor(to) : Option.none();
  }

  *entriesFor(journalName: string): Iterable<readonly [AnchorString, VaultPath]> {
    const journalIndex = this.#journals.get(journalName);
    if (!journalIndex) return;
    yield* journalIndex;
  }
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- src/journals/journals-index.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Check types and lint**

```bash
npm run check:types
npm run check:lint
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/journals/journals-index.ts src/journals/journals-index.test.ts
git commit -m "feat(journals): JournalsIndex exposes scoped query passthroughs"
```

---

## Task 15: DI module + wiring in `main.ts`

**Background.** Single-binding service, no token (the class is the token, matching `SettingsService`, `NotesService`, `Calendar`). Default Container lifetime — no `.lifetime(...)` call needed per [[feedback_di_omit_default_lifetime]]. Module exported as a plain const value since it takes no args per [[feedback_di_module_factories]]. No tests for the module — wiring tests are explicitly forbidden by [[feedback_no_wiring_tests]]; the integration is exercised when a consumer lands.

**Files:**

- Create: `src/journals/module.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Create the module**

```ts
// src/journals/module.ts
import type { Module } from "@/infrastructure/di";

import { JournalsIndex } from "./journals-index";

export const journalsIndexModule: Module = {
  register(c) {
    c.register(JournalsIndex).useClass(JournalsIndex);
  },
};
```

- [ ] **Step 2: Wire into `main.ts`**

Replace this block at the top of `src/main.ts`:

```ts
import { CalendarModule, calendarSettingsModule } from "@/calendar";
import { initLocale } from "@/i18n";
import { Container } from "@/infrastructure/di";
import { FlowsModule } from "@/infrastructure/flows";
import { createHostModule } from "@/infrastructure/host";
import { LoggerModule } from "@/infrastructure/logger";
import { settingsModule, SettingsService } from "@/settings";
```

with:

```ts
import { CalendarModule, calendarSettingsModule } from "@/calendar";
import { initLocale } from "@/i18n";
import { Container } from "@/infrastructure/di";
import { FlowsModule } from "@/infrastructure/flows";
import { createHostModule } from "@/infrastructure/host";
import { LoggerModule } from "@/infrastructure/logger";
import { journalsIndexModule } from "@/journals/module";
import { settingsModule, SettingsService } from "@/settings";
```

And inside `onload`, add `journalsIndexModule` to the container after `calendarSettingsModule`:

```ts
container.addModule(LoggerModule);
container.addModule(FlowsModule);
container.addModule(createHostModule(this));
container.addModule(settingsModule);
container.addModule(CalendarModule);
container.addModule(calendarSettingsModule);
container.addModule(journalsIndexModule);
await container.autoLoad();
```

- [ ] **Step 3: Verify everything still compiles and tests pass**

```bash
npm run check:types
npm run test
npm run check:lint
```

Expected: all pass. (No new test files — this task is wiring only.)

- [ ] **Step 4: Commit**

```bash
git add src/journals/module.ts src/main.ts
git commit -m "feat(journals): register JournalsIndex DI module in plugin bootstrap"
```

---

## Done

After Task 15, the v3 `journals` feature module exposes a passive `JournalsIndex` DI service backed by per-journal `JournalIndex` data structures. No consumer drives it yet — that arrives with the journal entity port. The infrastructure for the future Vue bridge (events, range queries, coalesced dirty channel) is in place per the spec's deferral notes.
