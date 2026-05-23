# v3 Repository Pattern Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a Repository pattern as the canonical domain API for the three persisted collections (journals, commands, shelves), absorbing the existing lifecycle services and removing `SettingsService.getCollection` in the same branch.

**Architecture:** A generic `BaseRepository<Id, Entity, ...>` in `src/infrastructure/repository/` provides typed CRUD over a `Record<Id, Entity>` that is read through `SettingsService.recordOf(definition)`. Concrete repositories per feature add domain factories (`create(...)`) and, where applicable, `rename(old, new)`. Per-entity events tokens (`JournalsEventsToken`, `CommandsEventsToken`, `ShelvesEventsToken`) hold the singleton emitter — subscribers inject the events directly, decoupled from the repository class. Each feature pairs the repository with a `ViewModel` (eager DI binding) exposing Vue `computed` accessors. `ShelvesService` owns cascade subscriptions and `assign(journalName, shelfName)`. Lifecycle services and `getCollection` are deleted at the end.

**Tech Stack:** TypeScript, Vue 3 (reactive Records, `computed`), nanoevents, valibot (schemas), vitest (tests), @testing-library/vue (component tests). DI library is project-local (`@/infrastructure/di`).

**Reference spec:** `docs/superpowers/specs/2026-05-23-v3-repository-pattern-design.md`.

**Test/check commands** (run after each task that touches code):

```bash
npm test -- --run                  # vitest, run-once mode
npm run check:types                # tsc --noEmit
npm run check:lint                 # eslint
```

**Branch:** Work on the current branch `v3-ai`. Do not create a new branch.

**Commit policy:** One commit per task. Use Conventional-Commit prefixes (`feat:`, `refactor:`, `chore:`, etc.). Never add `Co-Authored-By` trailers (per memory).

---

## File map

### Created files

- `src/infrastructure/repository/base-repository.ts`
- `src/infrastructure/repository/base-repository.test.ts`
- `src/infrastructure/repository/repository-query.ts`
- `src/infrastructure/repository/repository-query.test.ts`
- `src/infrastructure/repository/types.ts`
- `src/infrastructure/repository/index.ts`
- `src/journals/repository.ts`
- `src/journals/repository.test.ts`
- `src/journals/view-model.ts`
- `src/journals/view-model.test.ts`
- `src/journals/tokens.ts`
- `src/commands/repository.ts`
- `src/commands/repository.test.ts`
- `src/commands/view-model.ts`
- `src/commands/view-model.test.ts`
- `src/commands/tokens.ts`
- `src/commands/errors.ts`
- `src/shelves/repository.ts`
- `src/shelves/repository.test.ts`
- `src/shelves/view-model.ts`
- `src/shelves/view-model.test.ts`
- `src/shelves/service.ts`
- `src/shelves/service.test.ts`
- `src/shelves/tokens.ts`

### Modified files

- `src/settings/settings-service.ts` (add `recordOf`, later remove `getCollection`)
- `src/settings/collection.ts` (rename `ReactiveCollection` → `ReactiveCollectionStore`, drop mutation API)
- `src/settings/types.ts` (remove `CollectionHandle`)
- `src/settings/index.ts` (update barrel)
- `src/journals/errors.ts` (move lifecycle errors here; add `InvalidJournalUpdateError`)
- `src/journals/module.ts` (bind events token, repository, view-model)
- `src/journals/settings/module.ts` (drop lifecycle service binding)
- `src/journals/index.ts` (update barrel)
- `src/shelves/errors.ts` (add `InvalidShelfUpdateError`)
- `src/shelves/module.ts` (bind events token, repository, view-model, service; drop lifecycle service)
- `src/shelves/index.ts` (update barrel)
- `src/commands/module.ts` (bind events token, repository, view-model)
- `src/commands/index.ts` (update barrel)
- `src/commands/command-registry.ts` (replace `watch` + lifecycle subs with event tokens; mediate writes via repo)
- Twenty-plus consumer files (full list in Task 12) — replace `settings.getCollection(...)` with repository / view-model

### Deleted files

- `src/journals/settings/lifecycle.ts`
- `src/journals/settings/lifecycle.test.ts`
- `src/shelves/lifecycle.ts`
- `src/shelves/lifecycle.test.ts`
- `src/journals/settings/errors.ts` (contents moved to `src/journals/errors.ts`)

---

## Task 1: Repository types and `RepositoryQuery`

**Files:**

- Create: `src/infrastructure/repository/types.ts`
- Create: `src/infrastructure/repository/repository-query.ts`
- Create: `src/infrastructure/repository/repository-query.test.ts`

The base depends on these types and on `RepositoryQuery`, so they ship first.

- [ ] **Step 1.1: Write the types module**

Create `src/infrastructure/repository/types.ts`:

```ts
import type { Option, Result } from "@/infrastructure/result";

export interface RepositoryEvents<Id extends string, Entity> {
  created: (id: Id) => void;
  updated: (id: Id, changes: Partial<Entity>) => void;
  deleted: (id: Id) => void;
}

export interface RepositoryQueryContract<Id extends string, Entity> {
  first(): Option<Entity>;
  ids(): IterableIterator<Id>;
  list(): IterableIterator<Entity>;
  options(): IterableIterator<{ value: Id; label: string }>;
  map<T>(fn: (entity: Entity) => T): IterableIterator<T>;
  filter(predicate: (entity: Entity) => boolean): this;
  [Symbol.iterator](): Iterator<Entity>;
}

export interface RepositoryContract<
  Id extends string,
  Entity,
  EUnknown extends Error,
  EInvalidUpdate extends Error,
  Q extends RepositoryQueryContract<Id, Entity> = RepositoryQueryContract<Id, Entity>,
> {
  count(): number;
  exists(id: Id): boolean;
  get(id: Id): Option<Entity>;
  find(): Q;
  update(id: Id, changes: Partial<Entity>): Result<void, EUnknown | EInvalidUpdate>;
  delete(id: Id): Result<void, EUnknown>;
}
```

- [ ] **Step 1.2: Write the failing test for `RepositoryQuery`**

Create `src/infrastructure/repository/repository-query.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { RepositoryQuery } from "./repository-query";

interface Item {
  readonly name: string;
  readonly count: number;
}

function buildSource(items: ReadonlyArray<readonly [string, Item]>): IterableIterator<[string, Item]> {
  return items[Symbol.iterator]() as IterableIterator<[string, Item]>;
}

describe("RepositoryQuery", () => {
  describe("first", () => {
    it("returns the first entity when source has one", () => {
      const q = new RepositoryQuery<string, Item>(buildSource([["a", { name: "A", count: 1 }]]), "name");
      const out = q.first();
      expect(out.isSome()).toBe(true);
      expect(out.unwrapOr({ name: "", count: 0 })).toEqual({ name: "A", count: 1 });
    });

    it("returns none when source is empty", () => {
      const q = new RepositoryQuery<string, Item>(buildSource([]), "name");
      expect(q.first().isNone()).toBe(true);
    });
  });

  describe("ids", () => {
    it("yields record keys in iteration order", () => {
      const q = new RepositoryQuery<string, Item>(
        buildSource([
          ["a", { name: "A", count: 1 }],
          ["b", { name: "B", count: 2 }],
        ]),
        "name",
      );
      expect([...q.ids()]).toEqual(["a", "b"]);
    });
  });

  describe("list", () => {
    it("yields entities in iteration order", () => {
      const q = new RepositoryQuery<string, Item>(
        buildSource([
          ["a", { name: "A", count: 1 }],
          ["b", { name: "B", count: 2 }],
        ]),
        "name",
      );
      expect([...q.list()]).toEqual([
        { name: "A", count: 1 },
        { name: "B", count: 2 },
      ]);
    });
  });

  describe("options", () => {
    it("labels entries using nameKey when set", () => {
      const q = new RepositoryQuery<string, Item>(
        buildSource([
          ["a", { name: "Alice", count: 1 }],
          ["b", { name: "Bob", count: 2 }],
        ]),
        "name",
      );
      expect([...q.options()]).toEqual([
        { value: "a", label: "Alice" },
        { value: "b", label: "Bob" },
      ]);
    });

    it("falls back to the id when nameKey is undefined", () => {
      const q = new RepositoryQuery<string, Item>(buildSource([["a", { name: "A", count: 1 }]]));
      expect([...q.options()]).toEqual([{ value: "a", label: "a" }]);
    });
  });

  describe("map", () => {
    it("yields the function result for each entity", () => {
      const q = new RepositoryQuery<string, Item>(
        buildSource([
          ["a", { name: "A", count: 1 }],
          ["b", { name: "B", count: 3 }],
        ]),
        "name",
      );
      expect([...q.map((e) => e.count * 2)]).toEqual([2, 6]);
    });
  });

  describe("filter", () => {
    it("returns a new query that yields only matching entities", () => {
      const q = new RepositoryQuery<string, Item>(
        buildSource([
          ["a", { name: "A", count: 1 }],
          ["b", { name: "B", count: 5 }],
          ["c", { name: "C", count: 9 }],
        ]),
        "name",
      );
      const filtered = q.filter((e) => e.count >= 5);
      expect([...filtered.list()]).toEqual([
        { name: "B", count: 5 },
        { name: "C", count: 9 },
      ]);
    });
  });

  describe("[Symbol.iterator]", () => {
    it("iterates entities directly", () => {
      const q = new RepositoryQuery<string, Item>(
        buildSource([
          ["a", { name: "A", count: 1 }],
          ["b", { name: "B", count: 2 }],
        ]),
        "name",
      );
      expect([...q]).toEqual([
        { name: "A", count: 1 },
        { name: "B", count: 2 },
      ]);
    });
  });
});
```

- [ ] **Step 1.3: Run the test to verify it fails**

```bash
npm test -- --run src/infrastructure/repository/repository-query.test.ts
```

Expected: FAIL with `Cannot find module './repository-query'`.

- [ ] **Step 1.4: Implement `RepositoryQuery`**

Create `src/infrastructure/repository/repository-query.ts`:

```ts
import { Option } from "@/infrastructure/result";

import type { RepositoryQueryContract } from "./types";

export class RepositoryQuery<Id extends string, Entity> implements RepositoryQueryContract<Id, Entity> {
  constructor(
    protected source: IterableIterator<[Id, Entity]>,
    protected nameKey?: keyof Entity,
  ) {}

  first(): Option<Entity> {
    const next = this.source.next();
    if (next.done) return Option.none();
    return Option.fromNullable(next.value[1]);
  }

  *ids(): IterableIterator<Id> {
    for (const [id] of this.source) yield id;
  }

  *list(): IterableIterator<Entity> {
    for (const [, entity] of this.source) yield entity;
  }

  *options(): IterableIterator<{ value: Id; label: string }> {
    for (const [id, entity] of this.source) {
      const label = this.nameKey === undefined ? id : entity[this.nameKey];
      yield { value: id, label: String(label) };
    }
  }

  *map<T>(fn: (entity: Entity) => T): IterableIterator<T> {
    for (const [, entity] of this.source) yield fn(entity);
  }

  filter(predicate: (entity: Entity) => boolean): this {
    const source = this.source;
    const filtered = (function* () {
      for (const pair of source) {
        if (predicate(pair[1])) yield pair;
      }
    })();
    const Ctor = this.constructor as new (source: IterableIterator<[Id, Entity]>, nameKey?: keyof Entity) => this;
    return new Ctor(filtered, this.nameKey);
  }

  *[Symbol.iterator](): Iterator<Entity> {
    for (const [, entity] of this.source) yield entity;
  }
}
```

- [ ] **Step 1.5: Run the test to verify it passes**

```bash
npm test -- --run src/infrastructure/repository/repository-query.test.ts
```

Expected: PASS for all eight tests.

- [ ] **Step 1.6: Create the barrel**

Create `src/infrastructure/repository/index.ts`:

```ts
export { RepositoryQuery } from "./repository-query";
export type { RepositoryContract, RepositoryEvents, RepositoryQueryContract } from "./types";
```

- [ ] **Step 1.7: Run typecheck and lint**

```bash
npm run check:types
npm run check:lint
```

Expected: both PASS.

- [ ] **Step 1.8: Commit**

```bash
git add src/infrastructure/repository/
git commit -m "feat(repository): add RepositoryQuery and shared types"
```

---

## Task 2: `BaseRepository`

**Files:**

- Create: `src/infrastructure/repository/base-repository.ts`
- Create: `src/infrastructure/repository/base-repository.test.ts`
- Modify: `src/infrastructure/repository/index.ts`

- [ ] **Step 2.1: Write the failing test for `BaseRepository`**

Create `src/infrastructure/repository/base-repository.test.ts`:

```ts
import { createNanoEvents, type Emitter } from "nanoevents";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BaseRepository } from "./base-repository";
import { RepositoryQuery } from "./repository-query";

import type { RepositoryEvents } from "./types";

interface Item {
  name: string;
  count: number;
}

class TestUnknownError extends Error {
  readonly kind = "unknown" as const;
  constructor(public readonly id: string) {
    super(`Unknown: ${id}`);
    this.name = "TestUnknownError";
  }
}

class TestInvalidUpdateError extends Error {
  readonly kind = "invalid-update" as const;
  constructor(public readonly id: string) {
    super(`Invalid update for ${id}`);
    this.name = "TestInvalidUpdateError";
  }
}

class TestRepository extends BaseRepository<string, Item, TestUnknownError, TestInvalidUpdateError> {
  protected idKey: keyof Item = "name";
  protected nameKey: keyof Item = "name";
  protected QueryConstructor = RepositoryQuery;
  protected storage: Record<string, Item>;
  protected events: Emitter<RepositoryEvents<string, Item>>;
  protected unknownEntityError = (id: string) => new TestUnknownError(id);
  protected invalidUpdateError = (id: string) => new TestInvalidUpdateError(id);

  constructor(storage: Record<string, Item>, events: Emitter<RepositoryEvents<string, Item>>) {
    super();
    this.storage = storage;
    this.events = events;
  }

  add(id: string, entity: Item) {
    return this.protectedAdd(id, entity);
  }

  protected protectedAdd(id: string, entity: Item) {
    return this.addEntity(id, entity);
  }
}

// Note: the helper in the test subclass surfaces `add` for test access; in production
// repositories, `create(...)` factories call the protected base `add` internally.

describe("BaseRepository", () => {
  let storage: Record<string, Item>;
  let events: Emitter<RepositoryEvents<string, Item>>;
  let repo: TestRepository;

  beforeEach(() => {
    storage = {
      a: { name: "a", count: 1 },
      b: { name: "b", count: 2 },
    };
    events = createNanoEvents<RepositoryEvents<string, Item>>();
    repo = new TestRepository(storage, events);
  });

  describe("count", () => {
    it("returns the number of stored entities", () => {
      expect(repo.count()).toBe(2);
    });
  });

  describe("exists", () => {
    it("returns true when the id is stored", () => {
      expect(repo.exists("a")).toBe(true);
    });

    it("returns false when the id is absent", () => {
      expect(repo.exists("nope")).toBe(false);
    });
  });

  describe("get", () => {
    it("returns Some(entity) when the id is stored", () => {
      const result = repo.get("a");
      expect(result.isSome()).toBe(true);
    });

    it("returns None when the id is absent", () => {
      expect(repo.get("nope").isNone()).toBe(true);
    });
  });

  describe("find", () => {
    it("returns a query iterating every stored entity", () => {
      expect([...repo.find().list()]).toEqual([
        { name: "a", count: 1 },
        { name: "b", count: 2 },
      ]);
    });
  });

  describe("update", () => {
    it("merges changes into the stored entity", () => {
      const result = repo.update("a", { count: 99 });
      expect(result.kind).toBe("ok");
      expect(storage["a"]).toEqual({ name: "a", count: 99 });
    });

    it("emits updated with the changes", () => {
      const spy = vi.fn();
      events.on("updated", spy);
      repo.update("a", { count: 99 });
      expect(spy).toHaveBeenCalledWith("a", { count: 99 });
    });

    it("returns UnknownEntityError when the id is absent", () => {
      const result = repo.update("nope", { count: 1 });
      expect(result.kind).toBe("err");
      if (result.kind === "err") expect(result.error).toBeInstanceOf(TestUnknownError);
    });

    it("returns InvalidUpdateError when changes alter the id-key", () => {
      const result = repo.update("a", { name: "renamed" });
      expect(result.kind).toBe("err");
      if (result.kind === "err") expect(result.error).toBeInstanceOf(TestInvalidUpdateError);
    });

    it("does not emit any event when the id-key is altered", () => {
      const spy = vi.fn();
      events.on("updated", spy);
      repo.update("a", { name: "renamed" });
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("delete", () => {
    it("removes the stored entity", () => {
      repo.delete("a");
      expect(storage["a"]).toBeUndefined();
    });

    it("emits deleted with the id", () => {
      const spy = vi.fn();
      events.on("deleted", spy);
      repo.delete("a");
      expect(spy).toHaveBeenCalledWith("a");
    });

    it("returns UnknownEntityError when the id is absent", () => {
      const result = repo.delete("nope");
      expect(result.kind).toBe("err");
      if (result.kind === "err") expect(result.error).toBeInstanceOf(TestUnknownError);
    });
  });

  describe("add (protected, surfaced for tests)", () => {
    it("inserts a new entity", () => {
      repo.add("c", { name: "c", count: 3 });
      expect(storage["c"]).toEqual({ name: "c", count: 3 });
    });

    it("emits created with the id", () => {
      const spy = vi.fn();
      events.on("created", spy);
      repo.add("c", { name: "c", count: 3 });
      expect(spy).toHaveBeenCalledWith("c");
    });

    it("returns UnknownEntityError when the id is already stored", () => {
      const result = repo.add("a", { name: "a", count: 0 });
      expect(result.kind).toBe("err");
      if (result.kind === "err") expect(result.error).toBeInstanceOf(TestUnknownError);
    });
  });
});
```

- [ ] **Step 2.2: Run the test to verify it fails**

```bash
npm test -- --run src/infrastructure/repository/base-repository.test.ts
```

Expected: FAIL with `Cannot find module './base-repository'`.

- [ ] **Step 2.3: Implement `BaseRepository`**

Create `src/infrastructure/repository/base-repository.ts`:

```ts
import { Err, Ok, Option, type Result } from "@/infrastructure/result";

import { RepositoryQuery } from "./repository-query";

import type { RepositoryEvents, RepositoryQueryContract } from "./types";
import type { Emitter } from "nanoevents";

export abstract class BaseRepository<
  Id extends string,
  Entity,
  EUnknown extends Error,
  EInvalidUpdate extends Error,
  Q extends RepositoryQueryContract<Id, Entity> = RepositoryQuery<Id, Entity>,
  E extends RepositoryEvents<Id, Entity> = RepositoryEvents<Id, Entity>,
> {
  protected abstract idKey?: keyof Entity;
  protected abstract nameKey?: keyof Entity;
  protected abstract QueryConstructor: new (source: IterableIterator<[Id, Entity]>, nameKey?: keyof Entity) => Q;
  protected abstract storage: Record<Id, Entity>;
  protected abstract events: Emitter<E>;
  protected abstract unknownEntityError: (id: Id) => EUnknown;
  protected abstract invalidUpdateError: (id: Id, changes: Partial<Entity>) => EInvalidUpdate;

  count(): number {
    return Object.keys(this.storage).length;
  }

  exists(id: Id): boolean {
    return id in this.storage;
  }

  get(id: Id): Option<Entity> {
    return Option.fromNullable(this.storage[id]);
  }

  find(): Q {
    const source = Object.entries(this.storage)[Symbol.iterator]() as IterableIterator<[Id, Entity]>;
    return new this.QueryConstructor(source, this.nameKey);
  }

  update(id: Id, changes: Partial<Entity>): Result<void, EUnknown | EInvalidUpdate> {
    const existing = this.storage[id];
    if (!existing) return new Err(this.unknownEntityError(id));
    if (this.idKey !== undefined && this.idKey in changes) {
      const next = (changes as Record<keyof Entity, unknown>)[this.idKey];
      if (next !== existing[this.idKey]) {
        return new Err(this.invalidUpdateError(id, changes));
      }
    }
    this.storage[id] = { ...existing, ...changes };
    this.events.emit("updated", id, changes);
    return new Ok(undefined);
  }

  delete(id: Id): Result<void, EUnknown> {
    if (!(id in this.storage)) return new Err(this.unknownEntityError(id));
    delete this.storage[id];
    this.events.emit("deleted", id);
    return new Ok(undefined);
  }

  protected addEntity(id: Id, entity: Entity): Result<Id, EUnknown> {
    if (id in this.storage) return new Err(this.unknownEntityError(id));
    this.storage[id] = entity;
    this.events.emit("created", id);
    return new Ok(id);
  }
}
```

Notes on the implementation:

- `addEntity(id, entity)` is the protected insertion primitive. Concrete subclass `create(...)` methods call it after their own duplicate-name check (which produces a more specific error like `JournalNameTakenError`). The base's fallback to `unknownEntityError` on duplicate is a safety net for direct callers.
- The id-key guard in `update` reads `changes[idKey]` only if `idKey` is set on the subclass. Commands repository leaves `idKey` undefined, so the guard is a no-op for them — which is correct because `CommandConfig` does not carry a key field.
- Events are emitted via the protected `events` field; subclasses set it via `inject(EventsToken)` at field initialisation. The base never calls `inject`.

- [ ] **Step 2.4: Run the test to verify it passes**

```bash
npm test -- --run src/infrastructure/repository/base-repository.test.ts
```

Expected: PASS for all sixteen tests.

- [ ] **Step 2.5: Update the barrel**

Modify `src/infrastructure/repository/index.ts` to read:

```ts
export { BaseRepository } from "./base-repository";
export { RepositoryQuery } from "./repository-query";
export type { RepositoryContract, RepositoryEvents, RepositoryQueryContract } from "./types";
```

- [ ] **Step 2.6: Run typecheck and lint**

```bash
npm run check:types
npm run check:lint
```

Expected: both PASS.

- [ ] **Step 2.7: Commit**

```bash
git add src/infrastructure/repository/
git commit -m "feat(repository): add BaseRepository with id-key safe update"
```

---

## Task 3: `SettingsService.recordOf`

`recordOf` is added alongside the existing `getCollection`. `getCollection` stays until Task 14 so we can migrate consumers incrementally.

**Files:**

- Modify: `src/settings/settings-service.ts`
- Modify: `src/settings/settings-service.test.ts`

- [ ] **Step 3.1: Write the failing test**

Add a new `describe` block to `src/settings/settings-service.test.ts`, immediately after the existing `getCollection` tests. Use the existing test harness conventions (the file already has a `journalCollection` test fixture).

```ts
describe("recordOf", () => {
  it("returns the reactive Record for a registered collection", async () => {
    const harness = buildHarness({ slices: [calendarSlice], collections: [journalCollection] });
    const init = await harness.service.initialize();
    expect(init.kind).toBe("ok");
    const record = harness.service.recordOf(journalCollection);
    expect(record).toEqual({});
  });

  it("returns the same reference across calls", async () => {
    const harness = buildHarness({ slices: [], collections: [journalCollection] });
    await harness.service.initialize();
    const first = harness.service.recordOf(journalCollection);
    const second = harness.service.recordOf(journalCollection);
    expect(first).toBe(second);
  });

  it("reflects mutations made to the record", async () => {
    const harness = buildHarness({ slices: [], collections: [journalCollection] });
    await harness.service.initialize();
    const record = harness.service.recordOf(journalCollection);
    record["alpha"] = { name: "alpha" };
    expect(harness.service.recordOf(journalCollection)["alpha"]).toEqual({ name: "alpha" });
  });

  it("throws UnregisteredSliceError when the collection key is not registered", async () => {
    const harness = buildHarness({ slices: [], collections: [journalCollection] });
    await harness.service.initialize();
    const other = defineCollection("ghost", v.object({}), () => ({}));
    expect(() => harness.service.recordOf(other)).toThrow(UnregisteredSliceError);
  });
});
```

If `buildHarness` does not exist in the file today, infer the harness from existing tests in `src/settings/settings-service.test.ts` — read it before writing this block. Reuse the existing `journalCollection` and `calendarSlice` fixtures, the `UnregisteredSliceError` import, and the `defineCollection` import already present in the file.

- [ ] **Step 3.2: Run the test to verify it fails**

```bash
npm test -- --run src/settings/settings-service.test.ts
```

Expected: FAIL with `harness.service.recordOf is not a function`.

- [ ] **Step 3.3: Add `recordOf` to `SettingsService`**

Modify `src/settings/settings-service.ts`. Inside the class, immediately after `getCollection`, add:

```ts
recordOf<TKey extends string, TItem extends AnySchema>(
  collection: CollectionDefinition<TKey, TItem>,
): Record<string, InferOutput<TItem>> {
  if (!this.#collectionHandles.has(collection.key)) {
    throw new UnregisteredSliceError(collection.key);
  }
  return this.#root[collection.key] as Record<string, InferOutput<TItem>>;
}
```

The reactive Record at `this.#root[collection.key]` is the same object `ReactiveCollection` was hydrated against in `#hydrate` — see `src/settings/settings-service.ts:103-108`. Returning it directly gives the repository a Vue-reactive read/write target.

- [ ] **Step 3.4: Run the test to verify it passes**

```bash
npm test -- --run src/settings/settings-service.test.ts
```

Expected: PASS for the new tests, no regressions in existing tests.

- [ ] **Step 3.5: Run typecheck and lint**

```bash
npm run check:types
npm run check:lint
```

Expected: both PASS.

- [ ] **Step 3.6: Commit**

```bash
git add src/settings/settings-service.ts src/settings/settings-service.test.ts
git commit -m "feat(settings): add recordOf accessor on SettingsService"
```

---

## Task 4: Move journal lifecycle errors to `src/journals/errors.ts`

The lifecycle service is going away; its errors stay but move to the parent feature's `errors.ts`. This task only relocates code — no semantic change. It paves the way for Task 5 (the repository) to import from a stable location.

**Files:**

- Modify: `src/journals/errors.ts`
- Delete: `src/journals/settings/errors.ts`
- Modify: every file that imports from `@/journals/settings/errors`

- [ ] **Step 4.1: List importers of `@/journals/settings/errors`**

```bash
grep -rln "@/journals/settings/errors\|journals/settings/errors\"" src --include="*.ts" --include="*.vue" 2>/dev/null
```

Note each result. The migration in Step 4.4 updates them all.

- [ ] **Step 4.2: Append the lifecycle errors to `src/journals/errors.ts`**

The current file is short. Read it, then append (preserving the existing two classes):

```ts
import { FlowError } from "@/infrastructure/flows";

export class JournalsError extends Error {
  override name = "JournalsError";
}

export class JournalNotFoundError extends JournalsError {
  override name = "JournalNotFoundError";

  constructor(readonly journalName: string) {
    super(`Journal not found: ${journalName}`);
  }
}

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

export class InvalidJournalUpdateError extends Error {
  readonly kind = "invalid-update" as const;
  constructor(public readonly journalName: string) {
    super(`Invalid update for journal ${journalName}: name field is immutable via update — use rename`);
    this.name = "InvalidJournalUpdateError";
  }
}

export type JournalLifecycleError =
  | InvalidJournalNameError
  | JournalNameTakenError
  | UnknownJournalError
  | UnknownSequenceSourceError
  | InvalidJournalUpdateError;

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

The `JournalNameTakenError` constructor also now sets `this.name` explicitly (the original omitted it — see `src/journals/settings/errors.ts:11-15`). The added `name` setter is consistent with the other classes in the file.

- [ ] **Step 4.3: Delete `src/journals/settings/errors.ts`**

```bash
rm src/journals/settings/errors.ts
```

- [ ] **Step 4.4: Update every importer**

For each file from Step 4.1's grep output, replace `from "@/journals/settings/errors"` with `from "@/journals/errors"`. The exported symbols are unchanged.

Typical patterns:

```ts
// before
import { UnknownJournalError } from "@/journals/settings/errors";

// after
import { UnknownJournalError } from "@/journals/errors";
```

`src/journals/settings/lifecycle.ts` is one of the importers — keep it using the new path. It will be deleted in Task 14, but until then it must compile.

- [ ] **Step 4.5: Re-verify no `@/journals/settings/errors` imports remain**

```bash
grep -rn "@/journals/settings/errors\|journals/settings/errors\"" src --include="*.ts" --include="*.vue" 2>/dev/null
```

Expected: no output.

- [ ] **Step 4.6: Run tests, typecheck, lint**

```bash
npm test -- --run
npm run check:types
npm run check:lint
```

Expected: all PASS, no regressions.

- [ ] **Step 4.7: Commit**

```bash
git add src/journals/errors.ts src/journals/settings/errors.ts src/
git commit -m "refactor(journals): move lifecycle errors to feature-root errors.ts"
```

---

## Task 5: `JournalsRepository` + events token + view-model

This task ships `JournalsRepository`, its events token, and its view-model in one branch step. The existing `JournalLifecycleService` stays in place until Task 14 — both compile side-by-side. Consumers migrate one file at a time in Task 12.

**Files:**

- Create: `src/journals/tokens.ts`
- Create: `src/journals/repository.ts`
- Create: `src/journals/repository.test.ts`
- Create: `src/journals/view-model.ts`
- Create: `src/journals/view-model.test.ts`
- Modify: `src/journals/module.ts`
- Modify: `src/journals/index.ts`

- [ ] **Step 5.1: Create the events token**

Create `src/journals/tokens.ts`:

```ts
import { createToken } from "@/infrastructure/di";

import type { JournalsEvents } from "./repository";
import type { Emitter } from "nanoevents";

export const JournalsEventsToken = createToken<Emitter<JournalsEvents>>("journals.events");
```

The import of `JournalsEvents` will dangle until Step 5.3 — that is acceptable inside the same task. TypeScript only complains when the file is type-checked end to end.

- [ ] **Step 5.2: Write the failing test for the repository**

Create `src/journals/repository.test.ts`:

```ts
import { createNanoEvents, type Emitter } from "nanoevents";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { journalDefaultsFor, type JournalConfig } from "./config";
import {
  InvalidJournalNameError,
  InvalidJournalUpdateError,
  JournalNameTakenError,
  UnknownJournalError,
} from "./errors";
import { JournalsRepository, type JournalsEvents } from "./repository";

function buildRepo(initial: Record<string, JournalConfig> = {}) {
  const storage: Record<string, JournalConfig> = { ...initial };
  const events: Emitter<JournalsEvents> = createNanoEvents();
  // Construct without DI: the repository's fields default to inject(...) values,
  // but for tests we instantiate then assign. See Step 5.3 implementation note.
  const repo = JournalsRepository.fromParts(storage, events);
  return { repo, storage, events };
}

describe("JournalsRepository", () => {
  describe("create", () => {
    it("inserts a journal with defaults for the given write", () => {
      const { repo, storage } = buildRepo();
      const result = repo.create("daily", { type: "day" });
      expect(result.kind).toBe("ok");
      expect(storage["daily"]).toEqual(journalDefaultsFor({ type: "day" }, "daily"));
    });

    it("emits created with the journal name", () => {
      const { repo, events } = buildRepo();
      const spy = vi.fn();
      events.on("created", spy);
      repo.create("daily", { type: "day" });
      expect(spy).toHaveBeenCalledWith("daily");
    });

    it("rejects an empty name with InvalidJournalNameError", () => {
      const { repo } = buildRepo();
      const result = repo.create("", { type: "day" });
      expect(result.kind).toBe("err");
      if (result.kind === "err") expect(result.error).toBeInstanceOf(InvalidJournalNameError);
    });

    it("rejects a name already in use with JournalNameTakenError", () => {
      const { repo } = buildRepo({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      const result = repo.create("daily", { type: "day" });
      expect(result.kind).toBe("err");
      if (result.kind === "err") expect(result.error).toBeInstanceOf(JournalNameTakenError);
    });
  });

  describe("rename", () => {
    it("moves the entity to the new key with the new name field", () => {
      const original = journalDefaultsFor({ type: "day" }, "daily");
      const { repo, storage } = buildRepo({ daily: original });
      const result = repo.rename("daily", "renamed");
      expect(result.kind).toBe("ok");
      expect(storage["renamed"]?.name).toBe("renamed");
      expect(storage["daily"]).toBeUndefined();
    });

    it("emits renamed with old and new name", () => {
      const { repo, events } = buildRepo({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      const spy = vi.fn();
      events.on("renamed", spy);
      repo.rename("daily", "renamed");
      expect(spy).toHaveBeenCalledWith("daily", "renamed");
    });

    it("does not emit created or deleted on rename", () => {
      const { repo, events } = buildRepo({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      const created = vi.fn();
      const deleted = vi.fn();
      events.on("created", created);
      events.on("deleted", deleted);
      repo.rename("daily", "renamed");
      expect(created).not.toHaveBeenCalled();
      expect(deleted).not.toHaveBeenCalled();
    });

    it("rejects an empty new name with InvalidJournalNameError", () => {
      const { repo } = buildRepo({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      const result = repo.rename("daily", "");
      expect(result.kind).toBe("err");
      if (result.kind === "err") expect(result.error).toBeInstanceOf(InvalidJournalNameError);
    });

    it("rejects newName equal to oldName with InvalidJournalNameError", () => {
      const { repo } = buildRepo({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      const result = repo.rename("daily", "daily");
      expect(result.kind).toBe("err");
      if (result.kind === "err") expect(result.error).toBeInstanceOf(InvalidJournalNameError);
    });

    it("rejects an unknown old name with UnknownJournalError", () => {
      const { repo } = buildRepo();
      const result = repo.rename("nope", "next");
      expect(result.kind).toBe("err");
      if (result.kind === "err") expect(result.error).toBeInstanceOf(UnknownJournalError);
    });

    it("rejects a new name already in use with JournalNameTakenError", () => {
      const { repo } = buildRepo({
        a: journalDefaultsFor({ type: "day" }, "a"),
        b: journalDefaultsFor({ type: "day" }, "b"),
      });
      const result = repo.rename("a", "b");
      expect(result.kind).toBe("err");
      if (result.kind === "err") expect(result.error).toBeInstanceOf(JournalNameTakenError);
    });
  });

  describe("inherited update", () => {
    it("rejects a name change via update with InvalidJournalUpdateError", () => {
      const { repo } = buildRepo({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      const result = repo.update("daily", { name: "other" } as Partial<JournalConfig>);
      expect(result.kind).toBe("err");
      if (result.kind === "err") expect(result.error).toBeInstanceOf(InvalidJournalUpdateError);
    });

    it("accepts updates to non-id fields", () => {
      const { repo, storage } = buildRepo({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      const result = repo.update("daily", { folder: "Daily/" });
      expect(result.kind).toBe("ok");
      expect(storage["daily"]?.folder).toBe("Daily/");
    });
  });

  describe("inherited delete", () => {
    it("removes the entity and emits deleted", () => {
      const { repo, storage, events } = buildRepo({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      const spy = vi.fn();
      events.on("deleted", spy);
      repo.delete("daily");
      expect(storage["daily"]).toBeUndefined();
      expect(spy).toHaveBeenCalledWith("daily");
    });

    it("returns UnknownJournalError for an unknown name", () => {
      const { repo } = buildRepo();
      const result = repo.delete("nope");
      expect(result.kind).toBe("err");
      if (result.kind === "err") expect(result.error).toBeInstanceOf(UnknownJournalError);
    });
  });
});
```

- [ ] **Step 5.3: Run the test to verify it fails**

```bash
npm test -- --run src/journals/repository.test.ts
```

Expected: FAIL with `Cannot find module './repository'`.

- [ ] **Step 5.4: Implement `JournalsRepository`**

Create `src/journals/repository.ts`:

```ts
import { inject } from "@/infrastructure/di";
import { BaseRepository, RepositoryQuery, type RepositoryEvents } from "@/infrastructure/repository";
import { Err, Ok, type Result } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { journalConfigCollection, journalDefaultsFor, type JournalConfig, type JournalWrite } from "./config";
import {
  InvalidJournalNameError,
  InvalidJournalUpdateError,
  JournalNameTakenError,
  UnknownJournalError,
} from "./errors";
import { JournalsEventsToken } from "./tokens";

import type { Emitter } from "nanoevents";

export interface JournalsEvents extends RepositoryEvents<string, JournalConfig> {
  renamed: (oldName: string, newName: string) => void;
}

export class JournalsRepository extends BaseRepository<
  string,
  JournalConfig,
  UnknownJournalError,
  InvalidJournalUpdateError,
  RepositoryQuery<string, JournalConfig>,
  JournalsEvents
> {
  protected idKey: keyof JournalConfig = "name";
  protected nameKey: keyof JournalConfig = "name";
  protected QueryConstructor = RepositoryQuery;
  protected storage = inject(SettingsService).recordOf(journalConfigCollection);
  protected events = inject(JournalsEventsToken);
  protected unknownEntityError = (name: string) => new UnknownJournalError(name);
  protected invalidUpdateError = (name: string) => new InvalidJournalUpdateError(name);

  static fromParts(storage: Record<string, JournalConfig>, events: Emitter<JournalsEvents>): JournalsRepository {
    const repo = Object.create(JournalsRepository.prototype) as JournalsRepository;
    (repo as unknown as { storage: Record<string, JournalConfig> }).storage = storage;
    (repo as unknown as { events: Emitter<JournalsEvents> }).events = events;
    (repo as unknown as { idKey: keyof JournalConfig }).idKey = "name";
    (repo as unknown as { nameKey: keyof JournalConfig }).nameKey = "name";
    (repo as unknown as { QueryConstructor: typeof RepositoryQuery }).QueryConstructor = RepositoryQuery;
    (repo as unknown as { unknownEntityError: (name: string) => UnknownJournalError }).unknownEntityError = (name) =>
      new UnknownJournalError(name);
    (repo as unknown as { invalidUpdateError: (name: string) => InvalidJournalUpdateError }).invalidUpdateError = (
      name,
    ) => new InvalidJournalUpdateError(name);
    return repo;
  }

  create(name: string, write: JournalWrite): Result<JournalConfig, InvalidJournalNameError | JournalNameTakenError> {
    if (name.length === 0) return new Err(new InvalidJournalNameError(name));
    if (name in this.storage) return new Err(new JournalNameTakenError(name));
    const entity = journalDefaultsFor(write, name);
    const result = this.addEntity(name, entity);
    if (result.kind === "err") return new Err(new JournalNameTakenError(name));
    return new Ok(entity);
  }

  rename(
    oldName: string,
    newName: string,
  ): Result<void, UnknownJournalError | InvalidJournalNameError | JournalNameTakenError> {
    if (newName.length === 0 || newName === oldName) return new Err(new InvalidJournalNameError(newName));
    const existing = this.storage[oldName];
    if (!existing) return new Err(new UnknownJournalError(oldName));
    if (newName in this.storage) return new Err(new JournalNameTakenError(newName));
    existing.name = newName;
    delete this.storage[oldName];
    this.storage[newName] = existing;
    this.events.emit("renamed", oldName, newName);
    return new Ok(undefined);
  }
}
```

Notes:

- The `fromParts` static factory exists **solely for tests** so they can build a repository without standing up a DI container. Production code resolves the repository via `inject(JournalsRepository)`.
- Field initialisers run during `new JournalsRepository()`. `inject(SettingsService)` is a synchronous call (the DI library returns the bound singleton); it requires the service to be registered before any repository is resolved. Module wiring in Step 5.7 satisfies that ordering.

- [ ] **Step 5.5: Run the repository test to verify it passes**

```bash
npm test -- --run src/journals/repository.test.ts
```

Expected: PASS for all sixteen tests.

- [ ] **Step 5.6: Write the failing test for the view-model**

Create `src/journals/view-model.test.ts`:

```ts
import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";

import { journalDefaultsFor, type JournalConfig } from "./config";
import { JournalsRepository, type JournalsEvents } from "./repository";
import { JournalsViewModel } from "./view-model";

function buildViewModel(initial: Record<string, JournalConfig> = {}) {
  const storage = { ...initial };
  const events = createNanoEvents<JournalsEvents>();
  const repo = JournalsRepository.fromParts(storage, events);
  const vm = JournalsViewModel.fromRepository(repo);
  return { vm, repo, storage, events };
}

describe("JournalsViewModel", () => {
  describe("journals", () => {
    it("yields the current entities", () => {
      const { vm } = buildViewModel({
        daily: journalDefaultsFor({ type: "day" }, "daily"),
      });
      expect(vm.journals.value.map((j) => j.name)).toEqual(["daily"]);
    });

    it("reflects added journals after create", () => {
      const { vm, repo } = buildViewModel();
      repo.create("daily", { type: "day" });
      expect(vm.journals.value.map((j) => j.name)).toEqual(["daily"]);
    });
  });

  describe("journalOptions", () => {
    it("returns name-labelled options for each journal", () => {
      const { vm } = buildViewModel({
        daily: journalDefaultsFor({ type: "day" }, "daily"),
        weekly: journalDefaultsFor({ type: "week" }, "weekly"),
      });
      expect(vm.journalOptions.value).toEqual([
        { value: "daily", label: "daily" },
        { value: "weekly", label: "weekly" },
      ]);
    });
  });

  describe("journalCount", () => {
    it("returns the number of journals", () => {
      const { vm } = buildViewModel({
        daily: journalDefaultsFor({ type: "day" }, "daily"),
      });
      expect(vm.journalCount.value).toBe(1);
    });
  });

  describe("getJournal", () => {
    it("returns Some for a known name", () => {
      const { vm } = buildViewModel({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      expect(vm.getJournal("daily").isSome()).toBe(true);
    });

    it("returns None for an unknown name", () => {
      const { vm } = buildViewModel();
      expect(vm.getJournal("nope").isNone()).toBe(true);
    });
  });

  describe("isJournalNameAvailable", () => {
    it("is false when the name is in use", () => {
      const { vm } = buildViewModel({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      expect(vm.isJournalNameAvailable("daily")).toBe(false);
    });

    it("is true when the name is free", () => {
      const { vm } = buildViewModel({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      expect(vm.isJournalNameAvailable("other")).toBe(true);
    });

    it("treats the excludeCurrent name as available", () => {
      const { vm } = buildViewModel({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      expect(vm.isJournalNameAvailable("daily", "daily")).toBe(true);
    });
  });
});
```

- [ ] **Step 5.7: Run the view-model test to verify it fails**

```bash
npm test -- --run src/journals/view-model.test.ts
```

Expected: FAIL with `Cannot find module './view-model'`.

- [ ] **Step 5.8: Implement the view-model**

Create `src/journals/view-model.ts`:

```ts
import { computed, type ComputedRef } from "vue";

import { inject } from "@/infrastructure/di";
import { Option } from "@/infrastructure/result";

import { type JournalConfig } from "./config";
import { JournalsRepository } from "./repository";

export class JournalsViewModel {
  readonly #repository = inject(JournalsRepository);

  readonly journals: ComputedRef<JournalConfig[]> = computed(() => [...this.#repository.find().list()]);
  readonly journalOptions: ComputedRef<{ value: string; label: string }[]> = computed(() => [
    ...this.#repository.find().options(),
  ]);
  readonly journalCount: ComputedRef<number> = computed(() => this.#repository.count());

  static fromRepository(repository: JournalsRepository): JournalsViewModel {
    const vm = Object.create(JournalsViewModel.prototype) as JournalsViewModel;
    (vm as unknown as { ["#repository"]: JournalsRepository })["#repository"] = repository;
    // The compiled output keeps #repository as a private field; the test helper above
    // assigns it directly. computed accessors reference the field via closure, so we
    // recreate them here.
    Object.defineProperty(vm, "journals", {
      value: computed(() => [...repository.find().list()]),
      writable: false,
      enumerable: true,
    });
    Object.defineProperty(vm, "journalOptions", {
      value: computed(() => [...repository.find().options()]),
      writable: false,
      enumerable: true,
    });
    Object.defineProperty(vm, "journalCount", {
      value: computed(() => repository.count()),
      writable: false,
      enumerable: true,
    });
    return vm;
  }

  getJournal(name: string): Option<JournalConfig> {
    return this.#repository.get(name);
  }

  isJournalNameAvailable(name: string, excludeCurrent?: string): boolean {
    if (excludeCurrent !== undefined && name === excludeCurrent) return true;
    return this.#repository.get(name).isNone();
  }
}
```

Notes on `fromRepository`:

- The test-only static avoids DI. In production code, `inject(JournalsRepository)` resolves the field at construction time via `new JournalsViewModel()`.
- The `getJournal` and `isJournalNameAvailable` methods read `this.#repository` directly, so the assignment in `fromRepository` must use the actual private-field slot. The `Object.create` + property-descriptor dance is a known TS escape hatch; if it proves fragile, the cleaner test-only path is to construct `new JournalsViewModel()` inside a DI scope that provides the bare repository. Either pattern is acceptable.

- [ ] **Step 5.9: Run the view-model test to verify it passes**

```bash
npm test -- --run src/journals/view-model.test.ts
```

Expected: PASS for all eight tests.

- [ ] **Step 5.10: Bind the events token, repository, and view-model in the journals module**

Modify `src/journals/module.ts`. After the existing imports, add:

```ts
import { createNanoEvents } from "nanoevents";

import { JournalsRepository, type JournalsEvents } from "./repository";
import { JournalsEventsToken } from "./tokens";
import { JournalsViewModel } from "./view-model";
```

Inside the `register(c)` body, add after the existing `c.register(...)` calls:

```ts
c.register(JournalsEventsToken).useFactory(() => createNanoEvents<JournalsEvents>());
c.register(JournalsRepository).useClass(JournalsRepository).eager();
c.register(JournalsViewModel).useClass(JournalsViewModel).eager();
```

The `eager()` chain marks both repository and view-model for autoLoad, so their `inject(...)` field initialisers run at boot.

- [ ] **Step 5.11: Update the journals barrel**

Modify `src/journals/index.ts`. Add:

```ts
export { JournalsRepository } from "./repository";
export type { JournalsEvents } from "./repository";
export { JournalsViewModel } from "./view-model";
export { JournalsEventsToken } from "./tokens";

export {
  InvalidJournalNameError,
  InvalidJournalUpdateError,
  JournalNameTakenError,
  UnknownJournalError,
  UnknownSequenceSourceError,
  type JournalLifecycleError,
  JournalLifecycleFlowError,
  toFlowError as toJournalFlowError,
} from "./errors";
```

(The error re-exports replace what `src/journals/settings/errors.ts` used to indirectly expose.)

- [ ] **Step 5.12: Run all tests, typecheck, lint**

```bash
npm test -- --run
npm run check:types
npm run check:lint
```

Expected: all PASS. The existing `JournalLifecycleService` and `JournalLifecycleService.test.ts` still work because the lifecycle service is unchanged.

- [ ] **Step 5.13: Commit**

```bash
git add src/journals/
git commit -m "feat(journals): add JournalsRepository, view-model, and events token"
```

---

## Task 6: `CommandsRepository` + events token + view-model + errors

**Files:**

- Create: `src/commands/errors.ts`
- Create: `src/commands/tokens.ts`
- Create: `src/commands/repository.ts`
- Create: `src/commands/repository.test.ts`
- Create: `src/commands/view-model.ts`
- Create: `src/commands/view-model.test.ts`
- Modify: `src/commands/module.ts`
- Modify: `src/commands/index.ts`

- [ ] **Step 6.1: Create command errors**

Create `src/commands/errors.ts`:

```ts
export class CommandIdTakenError extends Error {
  readonly kind = "id-taken" as const;
  constructor(public readonly id: string) {
    super(`Command id already in use: ${id}`);
    this.name = "CommandIdTakenError";
  }
}

export class UnknownCommandError extends Error {
  readonly kind = "unknown-command" as const;
  constructor(public readonly id: string) {
    super(`Unknown command: ${id}`);
    this.name = "UnknownCommandError";
  }
}

export class InvalidCommandUpdateError extends Error {
  readonly kind = "invalid-update" as const;
  constructor(public readonly id: string) {
    super(`Invalid update for command ${id}`);
    this.name = "InvalidCommandUpdateError";
  }
}
```

- [ ] **Step 6.2: Create the events token**

Create `src/commands/tokens.ts`:

```ts
import { createToken } from "@/infrastructure/di";

import type { CommandsEvents } from "./repository";
import type { Emitter } from "nanoevents";

export const CommandsEventsToken = createToken<Emitter<CommandsEvents>>("commands.events");
```

- [ ] **Step 6.3: Write the failing repository test**

Create `src/commands/repository.test.ts`:

```ts
import { createNanoEvents, type Emitter } from "nanoevents";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { commandCollection, type CommandConfig } from "./config";
import { CommandIdTakenError, InvalidCommandUpdateError, UnknownCommandError } from "./errors";
import { CommandsRepository, type CommandsEvents } from "./repository";

function buildRepo(initial: Record<string, CommandConfig> = {}) {
  const storage: Record<string, CommandConfig> = { ...initial };
  const events: Emitter<CommandsEvents> = createNanoEvents();
  const repo = CommandsRepository.fromParts(storage, events);
  return { repo, storage, events };
}

const sampleCommand = (): CommandConfig => commandCollection.defaultItem("ignored");

describe("CommandsRepository", () => {
  describe("create", () => {
    it("inserts a command at the given id", () => {
      const { repo, storage } = buildRepo();
      const cmd = sampleCommand();
      const result = repo.create("cmd-1", cmd);
      expect(result.kind).toBe("ok");
      expect(storage["cmd-1"]).toEqual(cmd);
    });

    it("emits created with the id", () => {
      const { repo, events } = buildRepo();
      const spy = vi.fn();
      events.on("created", spy);
      repo.create("cmd-1", sampleCommand());
      expect(spy).toHaveBeenCalledWith("cmd-1");
    });

    it("rejects a duplicate id with CommandIdTakenError", () => {
      const { repo } = buildRepo({ "cmd-1": sampleCommand() });
      const result = repo.create("cmd-1", sampleCommand());
      expect(result.kind).toBe("err");
      if (result.kind === "err") expect(result.error).toBeInstanceOf(CommandIdTakenError);
    });
  });

  describe("inherited update", () => {
    it("merges changes into the stored command", () => {
      const { repo, storage } = buildRepo({ "cmd-1": sampleCommand() });
      const result = repo.update("cmd-1", { name: "Renamed" });
      expect(result.kind).toBe("ok");
      expect(storage["cmd-1"]?.name).toBe("Renamed");
    });

    it("returns UnknownCommandError for an unknown id", () => {
      const { repo } = buildRepo();
      const result = repo.update("nope", { name: "X" });
      expect(result.kind).toBe("err");
      if (result.kind === "err") expect(result.error).toBeInstanceOf(UnknownCommandError);
    });

    it("does not invoke the id-key guard (commands have no entity-side id)", () => {
      const { repo } = buildRepo({ "cmd-1": sampleCommand() });
      // Passing a stray "id" field through update — CommandConfig has no id field,
      // so this is just a no-op merge into the entity.
      const result = repo.update("cmd-1", { name: "Y" } as Partial<CommandConfig>);
      expect(result.kind).toBe("ok");
    });
  });

  describe("inherited delete", () => {
    it("removes and emits deleted", () => {
      const { repo, storage, events } = buildRepo({ "cmd-1": sampleCommand() });
      const spy = vi.fn();
      events.on("deleted", spy);
      repo.delete("cmd-1");
      expect(storage["cmd-1"]).toBeUndefined();
      expect(spy).toHaveBeenCalledWith("cmd-1");
    });

    it("returns UnknownCommandError for an unknown id", () => {
      const { repo } = buildRepo();
      const result = repo.delete("nope");
      expect(result.kind).toBe("err");
      if (result.kind === "err") expect(result.error).toBeInstanceOf(UnknownCommandError);
    });
  });

  describe("find", () => {
    it("yields commands keyed by their record id", () => {
      const a = sampleCommand();
      const b = sampleCommand();
      const { repo } = buildRepo({ a: a, b: b });
      const ids = [...repo.find().ids()];
      expect(ids).toEqual(["a", "b"]);
    });

    it("labels options by the name field", () => {
      const a = { ...sampleCommand(), name: "Alpha" };
      const b = { ...sampleCommand(), name: "Beta" };
      const { repo } = buildRepo({ a: a, b: b });
      expect([...repo.find().options()]).toEqual([
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta" },
      ]);
    });
  });
});

// Defensive: the InvalidCommandUpdateError is exported but unused in commands tests.
// Verify the class still exists in case future updates re-enable the id-key guard.
describe("InvalidCommandUpdateError", () => {
  it("constructs with the id", () => {
    const err = new InvalidCommandUpdateError("cmd-1");
    expect(err.id).toBe("cmd-1");
  });
});
```

- [ ] **Step 6.4: Run the test to verify it fails**

```bash
npm test -- --run src/commands/repository.test.ts
```

Expected: FAIL with `Cannot find module './repository'`.

- [ ] **Step 6.5: Implement `CommandsRepository`**

Create `src/commands/repository.ts`:

```ts
import { inject } from "@/infrastructure/di";
import { BaseRepository, RepositoryQuery, type RepositoryEvents } from "@/infrastructure/repository";
import { Err, Ok, type Result } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { commandCollection, type CommandConfig } from "./config";
import { CommandIdTakenError, InvalidCommandUpdateError, UnknownCommandError } from "./errors";
import { CommandsEventsToken } from "./tokens";

import type { Emitter } from "nanoevents";

export interface CommandsEvents extends RepositoryEvents<string, CommandConfig> {}

export class CommandsRepository extends BaseRepository<
  string,
  CommandConfig,
  UnknownCommandError,
  InvalidCommandUpdateError,
  RepositoryQuery<string, CommandConfig>,
  CommandsEvents
> {
  protected idKey: keyof CommandConfig | undefined = undefined;
  protected nameKey: keyof CommandConfig = "name";
  protected QueryConstructor = RepositoryQuery;
  protected storage = inject(SettingsService).recordOf(commandCollection);
  protected events = inject(CommandsEventsToken);
  protected unknownEntityError = (id: string) => new UnknownCommandError(id);
  protected invalidUpdateError = (id: string) => new InvalidCommandUpdateError(id);

  static fromParts(storage: Record<string, CommandConfig>, events: Emitter<CommandsEvents>): CommandsRepository {
    const repo = Object.create(CommandsRepository.prototype) as CommandsRepository;
    const w = repo as unknown as Record<string, unknown>;
    w.storage = storage;
    w.events = events;
    w.idKey = undefined;
    w.nameKey = "name";
    w.QueryConstructor = RepositoryQuery;
    w.unknownEntityError = (id: string) => new UnknownCommandError(id);
    w.invalidUpdateError = (id: string) => new InvalidCommandUpdateError(id);
    return repo;
  }

  create(id: string, init: CommandConfig): Result<CommandConfig, CommandIdTakenError> {
    if (id in this.storage) return new Err(new CommandIdTakenError(id));
    const result = this.addEntity(id, init);
    if (result.kind === "err") return new Err(new CommandIdTakenError(id));
    return new Ok(init);
  }
}
```

- [ ] **Step 6.6: Run the test to verify it passes**

```bash
npm test -- --run src/commands/repository.test.ts
```

Expected: PASS for all ten tests.

- [ ] **Step 6.7: Write the failing view-model test**

Create `src/commands/view-model.test.ts`:

```ts
import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";

import { commandCollection, type CommandConfig } from "./config";
import { CommandsRepository, type CommandsEvents } from "./repository";
import { CommandsViewModel } from "./view-model";

function buildVM(initial: Record<string, CommandConfig> = {}) {
  const storage = { ...initial };
  const events = createNanoEvents<CommandsEvents>();
  const repo = CommandsRepository.fromParts(storage, events);
  const vm = CommandsViewModel.fromRepository(repo);
  return { vm, repo };
}

describe("CommandsViewModel", () => {
  describe("commands", () => {
    it("yields the current commands", () => {
      const cmd = commandCollection.defaultItem("ignored");
      const { vm } = buildVM({ a: cmd });
      expect(vm.commands.value).toEqual([cmd]);
    });
  });

  describe("commandCount", () => {
    it("returns the count", () => {
      const { vm } = buildVM({ a: commandCollection.defaultItem("ignored") });
      expect(vm.commandCount.value).toBe(1);
    });
  });

  describe("getCommand", () => {
    it("returns Some for known id", () => {
      const { vm } = buildVM({ a: commandCollection.defaultItem("ignored") });
      expect(vm.getCommand("a").isSome()).toBe(true);
    });

    it("returns None for unknown id", () => {
      const { vm } = buildVM();
      expect(vm.getCommand("nope").isNone()).toBe(true);
    });
  });
});
```

- [ ] **Step 6.8: Run the test to verify it fails**

```bash
npm test -- --run src/commands/view-model.test.ts
```

Expected: FAIL with `Cannot find module './view-model'`.

- [ ] **Step 6.9: Implement `CommandsViewModel`**

Create `src/commands/view-model.ts`:

```ts
import { computed, type ComputedRef } from "vue";

import { inject } from "@/infrastructure/di";
import { Option } from "@/infrastructure/result";

import { type CommandConfig } from "./config";
import { CommandsRepository } from "./repository";

export class CommandsViewModel {
  readonly #repository = inject(CommandsRepository);

  readonly commands: ComputedRef<CommandConfig[]> = computed(() => [...this.#repository.find().list()]);
  readonly commandIds: ComputedRef<string[]> = computed(() => [...this.#repository.find().ids()]);
  readonly commandCount: ComputedRef<number> = computed(() => this.#repository.count());

  static fromRepository(repository: CommandsRepository): CommandsViewModel {
    const vm = Object.create(CommandsViewModel.prototype) as CommandsViewModel;
    Object.defineProperty(vm, "commands", {
      value: computed(() => [...repository.find().list()]),
      enumerable: true,
    });
    Object.defineProperty(vm, "commandIds", {
      value: computed(() => [...repository.find().ids()]),
      enumerable: true,
    });
    Object.defineProperty(vm, "commandCount", {
      value: computed(() => repository.count()),
      enumerable: true,
    });
    (vm as unknown as { _repo: CommandsRepository })._repo = repository;
    return vm;
  }

  getCommand(id: string): Option<CommandConfig> {
    return this.#repository.get(id);
  }
}
```

- [ ] **Step 6.10: Run the test to verify it passes**

```bash
npm test -- --run src/commands/view-model.test.ts
```

Expected: PASS.

- [ ] **Step 6.11: Bind everything in the commands module**

Modify `src/commands/module.ts`. Add to imports:

```ts
import { createNanoEvents } from "nanoevents";

import { CommandsRepository, type CommandsEvents } from "./repository";
import { CommandsEventsToken } from "./tokens";
import { CommandsViewModel } from "./view-model";
```

In `register(c)`, add after the existing `c.register(...)` calls:

```ts
c.register(CommandsEventsToken).useFactory(() => createNanoEvents<CommandsEvents>());
c.register(CommandsRepository).useClass(CommandsRepository).eager();
c.register(CommandsViewModel).useClass(CommandsViewModel).eager();
```

- [ ] **Step 6.12: Update the commands barrel**

Modify `src/commands/index.ts`. After the existing exports, add:

```ts
export { CommandsRepository } from "./repository";
export type { CommandsEvents } from "./repository";
export { CommandsViewModel } from "./view-model";
export { CommandsEventsToken } from "./tokens";
export { CommandIdTakenError, InvalidCommandUpdateError, UnknownCommandError } from "./errors";
```

- [ ] **Step 6.13: Run all tests, typecheck, lint**

```bash
npm test -- --run
npm run check:types
npm run check:lint
```

Expected: all PASS.

- [ ] **Step 6.14: Commit**

```bash
git add src/commands/
git commit -m "feat(commands): add CommandsRepository, view-model, events token, errors"
```

---

## Task 7: `ShelvesRepository` + events token + view-model

**Files:**

- Create: `src/shelves/tokens.ts`
- Create: `src/shelves/repository.ts`
- Create: `src/shelves/repository.test.ts`
- Create: `src/shelves/view-model.ts`
- Create: `src/shelves/view-model.test.ts`
- Modify: `src/shelves/errors.ts`
- Modify: `src/shelves/module.ts` (events token + repository + view-model bindings)
- Modify: `src/shelves/index.ts`

- [ ] **Step 7.1: Add `InvalidShelfUpdateError` to shelves/errors.ts**

Modify `src/shelves/errors.ts`. Add after the existing `UnknownShelfError` class:

```ts
export class InvalidShelfUpdateError extends Error {
  readonly kind = "invalid-update" as const;
  constructor(public readonly shelfName: string) {
    super(`Invalid update for shelf ${shelfName}: name field is immutable via update — use rename`);
    this.name = "InvalidShelfUpdateError";
  }
}
```

Add `InvalidShelfUpdateError` to the `ShelvesLifecycleError` union.

- [ ] **Step 7.2: Create the shelves events token**

Create `src/shelves/tokens.ts`:

```ts
import { createToken } from "@/infrastructure/di";

import type { ShelvesEvents } from "./repository";
import type { Emitter } from "nanoevents";

export const ShelvesEventsToken = createToken<Emitter<ShelvesEvents>>("shelves.events");
```

- [ ] **Step 7.3: Write the failing repository test**

Create `src/shelves/repository.test.ts`:

```ts
import { createNanoEvents, type Emitter } from "nanoevents";
import { describe, expect, it, vi } from "vitest";

import type { ShelfConfig } from "./config";
import { InvalidShelfNameError, InvalidShelfUpdateError, ShelfNameTakenError, UnknownShelfError } from "./errors";
import { ShelvesRepository, type ShelvesEvents } from "./repository";

function buildRepo(initial: Record<string, ShelfConfig> = {}) {
  const storage: Record<string, ShelfConfig> = { ...initial };
  const events: Emitter<ShelvesEvents> = createNanoEvents();
  const repo = ShelvesRepository.fromParts(storage, events);
  return { repo, storage, events };
}

const shelf = (name: string, journals: string[] = []): ShelfConfig => ({ name, journals });

describe("ShelvesRepository", () => {
  describe("create", () => {
    it("inserts a shelf with empty journals list", () => {
      const { repo, storage } = buildRepo();
      const result = repo.create("Personal");
      expect(result.kind).toBe("ok");
      expect(storage["Personal"]).toEqual({ name: "Personal", journals: [] });
    });

    it("emits created", () => {
      const { repo, events } = buildRepo();
      const spy = vi.fn();
      events.on("created", spy);
      repo.create("Personal");
      expect(spy).toHaveBeenCalledWith("Personal");
    });

    it("rejects an empty name", () => {
      const { repo } = buildRepo();
      const result = repo.create("");
      expect(result.kind).toBe("err");
      if (result.kind === "err") expect(result.error).toBeInstanceOf(InvalidShelfNameError);
    });

    it("rejects a name in use", () => {
      const { repo } = buildRepo({ Personal: shelf("Personal") });
      const result = repo.create("Personal");
      expect(result.kind).toBe("err");
      if (result.kind === "err") expect(result.error).toBeInstanceOf(ShelfNameTakenError);
    });
  });

  describe("rename", () => {
    it("moves the entry under the new key with the new name and preserves journals", () => {
      const { repo, storage } = buildRepo({ Personal: shelf("Personal", ["daily"]) });
      const result = repo.rename("Personal", "Home");
      expect(result.kind).toBe("ok");
      expect(storage["Home"]).toEqual({ name: "Home", journals: ["daily"] });
      expect(storage["Personal"]).toBeUndefined();
    });

    it("emits renamed", () => {
      const { repo, events } = buildRepo({ Personal: shelf("Personal") });
      const spy = vi.fn();
      events.on("renamed", spy);
      repo.rename("Personal", "Home");
      expect(spy).toHaveBeenCalledWith("Personal", "Home");
    });

    it("rejects empty new name", () => {
      const { repo } = buildRepo({ Personal: shelf("Personal") });
      const result = repo.rename("Personal", "");
      expect(result.kind).toBe("err");
      if (result.kind === "err") expect(result.error).toBeInstanceOf(InvalidShelfNameError);
    });

    it("rejects newName equal to oldName", () => {
      const { repo } = buildRepo({ Personal: shelf("Personal") });
      const result = repo.rename("Personal", "Personal");
      expect(result.kind).toBe("err");
      if (result.kind === "err") expect(result.error).toBeInstanceOf(InvalidShelfNameError);
    });

    it("rejects unknown old name", () => {
      const { repo } = buildRepo();
      const result = repo.rename("nope", "Home");
      expect(result.kind).toBe("err");
      if (result.kind === "err") expect(result.error).toBeInstanceOf(UnknownShelfError);
    });

    it("rejects newName already in use", () => {
      const { repo } = buildRepo({ Personal: shelf("Personal"), Home: shelf("Home") });
      const result = repo.rename("Personal", "Home");
      expect(result.kind).toBe("err");
      if (result.kind === "err") expect(result.error).toBeInstanceOf(ShelfNameTakenError);
    });
  });

  describe("deleteWith", () => {
    it("removes the shelf when destination is omitted", () => {
      const { repo, storage } = buildRepo({ Personal: shelf("Personal", ["a"]) });
      const result = repo.deleteWith("Personal");
      expect(result.kind).toBe("ok");
      expect(storage["Personal"]).toBeUndefined();
    });

    it("appends source journals to destination before removing", () => {
      const { repo, storage } = buildRepo({
        Personal: shelf("Personal", ["a"]),
        Home: shelf("Home", ["b"]),
      });
      const result = repo.deleteWith("Personal", "Home");
      expect(result.kind).toBe("ok");
      expect(storage["Home"]?.journals).toEqual(["b", "a"]);
      expect(storage["Personal"]).toBeUndefined();
    });

    it("emits deleted", () => {
      const { repo, events } = buildRepo({ Personal: shelf("Personal") });
      const spy = vi.fn();
      events.on("deleted", spy);
      repo.deleteWith("Personal");
      expect(spy).toHaveBeenCalledWith("Personal");
    });

    it("rejects unknown source", () => {
      const { repo } = buildRepo();
      const result = repo.deleteWith("nope");
      expect(result.kind).toBe("err");
      if (result.kind === "err") expect(result.error).toBeInstanceOf(UnknownShelfError);
    });

    it("rejects provided-but-unknown destination", () => {
      const { repo } = buildRepo({ Personal: shelf("Personal") });
      const result = repo.deleteWith("Personal", "ghost");
      expect(result.kind).toBe("err");
      if (result.kind === "err") expect(result.error).toBeInstanceOf(UnknownShelfError);
    });
  });

  describe("inherited update", () => {
    it("rejects a name change with InvalidShelfUpdateError", () => {
      const { repo } = buildRepo({ Personal: shelf("Personal") });
      const result = repo.update("Personal", { name: "Home" });
      expect(result.kind).toBe("err");
      if (result.kind === "err") expect(result.error).toBeInstanceOf(InvalidShelfUpdateError);
    });

    it("accepts journal-list updates", () => {
      const { repo, storage } = buildRepo({ Personal: shelf("Personal") });
      const result = repo.update("Personal", { journals: ["daily"] });
      expect(result.kind).toBe("ok");
      expect(storage["Personal"]?.journals).toEqual(["daily"]);
    });
  });
});
```

- [ ] **Step 7.4: Run the test to verify it fails**

```bash
npm test -- --run src/shelves/repository.test.ts
```

Expected: FAIL with `Cannot find module './repository'`.

- [ ] **Step 7.5: Implement `ShelvesRepository`**

Create `src/shelves/repository.ts`:

```ts
import { inject } from "@/infrastructure/di";
import { BaseRepository, RepositoryQuery, type RepositoryEvents } from "@/infrastructure/repository";
import { Err, Ok, type Result } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { shelvesCollection, type ShelfConfig } from "./config";
import { InvalidShelfNameError, InvalidShelfUpdateError, ShelfNameTakenError, UnknownShelfError } from "./errors";
import { ShelvesEventsToken } from "./tokens";

import type { Emitter } from "nanoevents";

export interface ShelvesEvents extends RepositoryEvents<string, ShelfConfig> {
  renamed: (oldName: string, newName: string) => void;
}

export class ShelvesRepository extends BaseRepository<
  string,
  ShelfConfig,
  UnknownShelfError,
  InvalidShelfUpdateError,
  RepositoryQuery<string, ShelfConfig>,
  ShelvesEvents
> {
  protected idKey: keyof ShelfConfig = "name";
  protected nameKey: keyof ShelfConfig = "name";
  protected QueryConstructor = RepositoryQuery;
  protected storage = inject(SettingsService).recordOf(shelvesCollection);
  protected events = inject(ShelvesEventsToken);
  protected unknownEntityError = (name: string) => new UnknownShelfError(name);
  protected invalidUpdateError = (name: string) => new InvalidShelfUpdateError(name);

  static fromParts(storage: Record<string, ShelfConfig>, events: Emitter<ShelvesEvents>): ShelvesRepository {
    const repo = Object.create(ShelvesRepository.prototype) as ShelvesRepository;
    const w = repo as unknown as Record<string, unknown>;
    w.storage = storage;
    w.events = events;
    w.idKey = "name";
    w.nameKey = "name";
    w.QueryConstructor = RepositoryQuery;
    w.unknownEntityError = (name: string) => new UnknownShelfError(name);
    w.invalidUpdateError = (name: string) => new InvalidShelfUpdateError(name);
    return repo;
  }

  create(name: string): Result<ShelfConfig, InvalidShelfNameError | ShelfNameTakenError> {
    if (name.length === 0) return new Err(new InvalidShelfNameError(name));
    if (name in this.storage) return new Err(new ShelfNameTakenError(name));
    const entity: ShelfConfig = { name, journals: [] };
    const result = this.addEntity(name, entity);
    if (result.kind === "err") return new Err(new ShelfNameTakenError(name));
    return new Ok(entity);
  }

  rename(
    oldName: string,
    newName: string,
  ): Result<void, UnknownShelfError | InvalidShelfNameError | ShelfNameTakenError> {
    if (newName.length === 0 || newName === oldName) return new Err(new InvalidShelfNameError(newName));
    const existing = this.storage[oldName];
    if (!existing) return new Err(new UnknownShelfError(oldName));
    if (newName in this.storage) return new Err(new ShelfNameTakenError(newName));
    existing.name = newName;
    delete this.storage[oldName];
    this.storage[newName] = existing;
    this.events.emit("renamed", oldName, newName);
    return new Ok(undefined);
  }

  deleteWith(name: string, destinationShelf?: string): Result<void, UnknownShelfError> {
    const source = this.storage[name];
    if (!source) return new Err(new UnknownShelfError(name));
    if (destinationShelf !== undefined) {
      const dest = this.storage[destinationShelf];
      if (!dest) return new Err(new UnknownShelfError(destinationShelf));
      dest.journals.push(...source.journals);
    }
    delete this.storage[name];
    this.events.emit("deleted", name);
    return new Ok(undefined);
  }
}
```

- [ ] **Step 7.6: Run the test to verify it passes**

```bash
npm test -- --run src/shelves/repository.test.ts
```

Expected: PASS for all sixteen tests.

- [ ] **Step 7.7a: Write the failing view-model test**

Create `src/shelves/view-model.test.ts`:

```ts
import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";

import type { ShelfConfig } from "./config";
import { ShelvesRepository, type ShelvesEvents } from "./repository";
import { ShelvesViewModel } from "./view-model";

function buildVM(initial: Record<string, ShelfConfig> = {}) {
  const storage = { ...initial };
  const events = createNanoEvents<ShelvesEvents>();
  const repo = ShelvesRepository.fromParts(storage, events);
  const vm = ShelvesViewModel.fromRepository(repo);
  return { vm, repo };
}

const shelf = (name: string, journals: string[] = []): ShelfConfig => ({ name, journals });

describe("ShelvesViewModel", () => {
  describe("shelves", () => {
    it("yields the current shelves", () => {
      const { vm } = buildVM({ Personal: shelf("Personal") });
      expect(vm.shelves.value.map((s) => s.name)).toEqual(["Personal"]);
    });

    it("reflects added shelves after create", () => {
      const { vm, repo } = buildVM();
      repo.create("Personal");
      expect(vm.shelves.value.map((s) => s.name)).toEqual(["Personal"]);
    });
  });

  describe("shelfOptions", () => {
    it("labels options by the shelf name", () => {
      const { vm } = buildVM({
        Personal: shelf("Personal"),
        Home: shelf("Home"),
      });
      expect(vm.shelfOptions.value).toEqual([
        { value: "Personal", label: "Personal" },
        { value: "Home", label: "Home" },
      ]);
    });
  });

  describe("shelfCount", () => {
    it("returns the count", () => {
      const { vm } = buildVM({ Personal: shelf("Personal") });
      expect(vm.shelfCount.value).toBe(1);
    });
  });

  describe("getShelf", () => {
    it("returns Some for a known name", () => {
      const { vm } = buildVM({ Personal: shelf("Personal") });
      expect(vm.getShelf("Personal").isSome()).toBe(true);
    });

    it("returns None for an unknown name", () => {
      const { vm } = buildVM();
      expect(vm.getShelf("nope").isNone()).toBe(true);
    });
  });

  describe("isShelfNameAvailable", () => {
    it("is false when the name is in use", () => {
      const { vm } = buildVM({ Personal: shelf("Personal") });
      expect(vm.isShelfNameAvailable("Personal")).toBe(false);
    });

    it("is true when the name is free", () => {
      const { vm } = buildVM({ Personal: shelf("Personal") });
      expect(vm.isShelfNameAvailable("Other")).toBe(true);
    });

    it("treats excludeCurrent as available", () => {
      const { vm } = buildVM({ Personal: shelf("Personal") });
      expect(vm.isShelfNameAvailable("Personal", "Personal")).toBe(true);
    });
  });
});
```

- [ ] **Step 7.7b: Run the test to verify it fails**

```bash
npm test -- --run src/shelves/view-model.test.ts
```

Expected: FAIL with `Cannot find module './view-model'`.

- [ ] **Step 7.7c: Implement `ShelvesViewModel`**

Create `src/shelves/view-model.ts`:

```ts
import { computed, type ComputedRef } from "vue";

import { inject } from "@/infrastructure/di";
import { Option } from "@/infrastructure/result";

import { type ShelfConfig } from "./config";
import { ShelvesRepository } from "./repository";

export class ShelvesViewModel {
  readonly #repository = inject(ShelvesRepository);

  readonly shelves: ComputedRef<ShelfConfig[]> = computed(() => [...this.#repository.find().list()]);
  readonly shelfOptions: ComputedRef<{ value: string; label: string }[]> = computed(() => [
    ...this.#repository.find().options(),
  ]);
  readonly shelfCount: ComputedRef<number> = computed(() => this.#repository.count());

  static fromRepository(repository: ShelvesRepository): ShelvesViewModel {
    const vm = Object.create(ShelvesViewModel.prototype) as ShelvesViewModel;
    Object.defineProperty(vm, "shelves", {
      value: computed(() => [...repository.find().list()]),
      enumerable: true,
    });
    Object.defineProperty(vm, "shelfOptions", {
      value: computed(() => [...repository.find().options()]),
      enumerable: true,
    });
    Object.defineProperty(vm, "shelfCount", {
      value: computed(() => repository.count()),
      enumerable: true,
    });
    Object.defineProperty(vm, "getShelf", {
      value: (name: string) => repository.get(name),
      enumerable: false,
    });
    Object.defineProperty(vm, "isShelfNameAvailable", {
      value: (name: string, excludeCurrent?: string) => {
        if (excludeCurrent !== undefined && name === excludeCurrent) return true;
        return repository.get(name).isNone();
      },
      enumerable: false,
    });
    return vm;
  }

  getShelf(name: string): Option<ShelfConfig> {
    return this.#repository.get(name);
  }

  isShelfNameAvailable(name: string, excludeCurrent?: string): boolean {
    if (excludeCurrent !== undefined && name === excludeCurrent) return true;
    return this.#repository.get(name).isNone();
  }
}
```

- [ ] **Step 7.7d: Run the test to verify it passes**

```bash
npm test -- --run src/shelves/view-model.test.ts
```

Expected: PASS for all eight tests.

- [ ] **Step 7.8: Bind in the shelves module**

Modify `src/shelves/module.ts`. Add imports:

```ts
import { createNanoEvents } from "nanoevents";

import { ShelvesRepository, type ShelvesEvents } from "./repository";
import { ShelvesEventsToken } from "./tokens";
import { ShelvesViewModel } from "./view-model";
```

In `register(c)`, add (still leave the `ShelvesLifecycleService` binding for now — deleted in Task 14):

```ts
c.register(ShelvesEventsToken).useFactory(() => createNanoEvents<ShelvesEvents>());
c.register(ShelvesRepository).useClass(ShelvesRepository).eager();
c.register(ShelvesViewModel).useClass(ShelvesViewModel).eager();
```

- [ ] **Step 7.9: Update the shelves barrel**

Modify `src/shelves/index.ts`. Add:

```ts
export { ShelvesRepository } from "./repository";
export type { ShelvesEvents } from "./repository";
export { ShelvesViewModel } from "./view-model";
export { ShelvesEventsToken } from "./tokens";
export { InvalidShelfUpdateError } from "./errors";
```

- [ ] **Step 7.10: Run all tests, typecheck, lint**

```bash
npm test -- --run
npm run check:types
npm run check:lint
```

Expected: all PASS.

- [ ] **Step 7.11: Commit**

```bash
git add src/shelves/
git commit -m "feat(shelves): add ShelvesRepository, view-model, events token, deleteWith"
```

---

## Task 8: `ShelvesService` (cascade subscribers + `assign`)

**Files:**

- Create: `src/shelves/service.ts`
- Create: `src/shelves/service.test.ts`
- Modify: `src/shelves/module.ts`
- Modify: `src/shelves/index.ts`

- [ ] **Step 8.1: Write the failing service test**

Create `src/shelves/service.test.ts`:

```ts
import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";

import { journalDefaultsFor, type JournalConfig } from "@/journals";
import { JournalsRepository, type JournalsEvents } from "@/journals";

import type { ShelfConfig } from "./config";
import { ShelvesRepository, type ShelvesEvents } from "./repository";
import { ShelvesService } from "./service";

import { UnknownJournalError } from "@/journals";
import { UnknownShelfError } from "./errors";

function setup(
  initial: {
    journals?: Record<string, JournalConfig>;
    shelves?: Record<string, ShelfConfig>;
  } = {},
) {
  const journalsStorage = { ...(initial.journals ?? {}) };
  const shelvesStorage = { ...(initial.shelves ?? {}) };
  const journalsEvents = createNanoEvents<JournalsEvents>();
  const shelvesEvents = createNanoEvents<ShelvesEvents>();
  const journalsRepo = JournalsRepository.fromParts(journalsStorage, journalsEvents);
  const shelvesRepo = ShelvesRepository.fromParts(shelvesStorage, shelvesEvents);
  const service = ShelvesService.fromParts(journalsRepo, shelvesRepo, journalsEvents);
  return { service, journalsRepo, shelvesRepo, journalsEvents, shelvesEvents, journalsStorage, shelvesStorage };
}

const shelf = (name: string, journals: string[] = []): ShelfConfig => ({ name, journals });
const j = (name: string) => journalDefaultsFor({ type: "day" }, name);

describe("ShelvesService", () => {
  describe("assign", () => {
    it("appends the journal to the target shelf", () => {
      const { service, shelvesStorage } = setup({
        journals: { daily: j("daily") },
        shelves: { Personal: shelf("Personal") },
      });
      service.assign("daily", "Personal");
      expect(shelvesStorage["Personal"]?.journals).toEqual(["daily"]);
    });

    it("moves a journal off its current shelf", () => {
      const { service, shelvesStorage } = setup({
        journals: { daily: j("daily") },
        shelves: { Old: shelf("Old", ["daily"]), New: shelf("New") },
      });
      service.assign("daily", "New");
      expect(shelvesStorage["Old"]?.journals).toEqual([]);
      expect(shelvesStorage["New"]?.journals).toEqual(["daily"]);
    });

    it("unassigns when shelfName is empty", () => {
      const { service, shelvesStorage } = setup({
        journals: { daily: j("daily") },
        shelves: { Personal: shelf("Personal", ["daily"]) },
      });
      service.assign("daily", "");
      expect(shelvesStorage["Personal"]?.journals).toEqual([]);
    });

    it("rejects unknown journal", () => {
      const { service } = setup({ shelves: { Personal: shelf("Personal") } });
      const result = service.assign("nope", "Personal");
      expect(result.kind).toBe("err");
      if (result.kind === "err") expect(result.error).toBeInstanceOf(UnknownJournalError);
    });

    it("rejects unknown shelf", () => {
      const { service } = setup({ journals: { daily: j("daily") } });
      const result = service.assign("daily", "ghost");
      expect(result.kind).toBe("err");
      if (result.kind === "err") expect(result.error).toBeInstanceOf(UnknownShelfError);
    });
  });

  describe("cascade on journal rename", () => {
    it("replaces the old name with the new one in every shelf", () => {
      const { journalsRepo, shelvesStorage } = setup({
        journals: { daily: j("daily") },
        shelves: { Personal: shelf("Personal", ["daily"]), Home: shelf("Home", ["daily"]) },
      });
      journalsRepo.rename("daily", "renamed");
      expect(shelvesStorage["Personal"]?.journals).toEqual(["renamed"]);
      expect(shelvesStorage["Home"]?.journals).toEqual(["renamed"]);
    });
  });

  describe("cascade on journal delete", () => {
    it("removes the journal name from every shelf", () => {
      const { journalsRepo, shelvesStorage } = setup({
        journals: { daily: j("daily") },
        shelves: { Personal: shelf("Personal", ["daily", "other"]) },
      });
      journalsRepo.delete("daily");
      expect(shelvesStorage["Personal"]?.journals).toEqual(["other"]);
    });
  });
});
```

- [ ] **Step 8.2: Run the test to verify it fails**

```bash
npm test -- --run src/shelves/service.test.ts
```

Expected: FAIL with `Cannot find module './service'`.

- [ ] **Step 8.3: Implement `ShelvesService`**

Create `src/shelves/service.ts`:

```ts
import { inject } from "@/infrastructure/di";
import { JournalsEventsToken, JournalsRepository, UnknownJournalError } from "@/journals";
import { Err, Ok, type Result } from "@/infrastructure/result";

import { UnknownShelfError } from "./errors";
import { ShelvesRepository } from "./repository";

import type { Emitter } from "nanoevents";
import type { JournalsEvents } from "@/journals";

export class ShelvesService {
  readonly #shelves = inject(ShelvesRepository);
  readonly #journals = inject(JournalsRepository);
  readonly #journalEvents = inject(JournalsEventsToken);

  constructor() {
    this.#journalEvents.on("renamed", (oldName, newName) => {
      this.#renameJournalInShelves(oldName, newName);
    });
    this.#journalEvents.on("deleted", (journalName) => {
      this.#removeJournalFromShelves(journalName);
    });
  }

  static fromParts(
    journalsRepo: JournalsRepository,
    shelvesRepo: ShelvesRepository,
    journalsEvents: Emitter<JournalsEvents>,
  ): ShelvesService {
    const svc = Object.create(ShelvesService.prototype) as ShelvesService;
    const w = svc as unknown as Record<string, unknown>;
    w["#shelves"] = shelvesRepo;
    w["#journals"] = journalsRepo;
    w["#journalEvents"] = journalsEvents;
    journalsEvents.on("renamed", (oldName, newName) => {
      ShelvesService.#renameJournalInShelvesStatic(shelvesRepo, oldName, newName);
    });
    journalsEvents.on("deleted", (journalName) => {
      ShelvesService.#removeJournalFromShelvesStatic(shelvesRepo, journalName);
    });
    Object.defineProperty(svc, "assign", {
      value: (journalName: string, shelfName: string) =>
        ShelvesService.#assignStatic(journalsRepo, shelvesRepo, journalName, shelfName),
      enumerable: false,
    });
    return svc;
  }

  assign(journalName: string, shelfName: string): Result<void, UnknownJournalError | UnknownShelfError> {
    if (this.#journals.get(journalName).isNone()) return new Err(new UnknownJournalError(journalName));
    if (shelfName === "") {
      this.#removeJournalFromShelves(journalName);
      return new Ok(undefined);
    }
    if (this.#shelves.get(shelfName).isNone()) return new Err(new UnknownShelfError(shelfName));
    this.#removeJournalFromShelves(journalName);
    const target = this.#shelves.get(shelfName).unwrapOr({ name: shelfName, journals: [] });
    this.#shelves.update(shelfName, { journals: [...target.journals, journalName] });
    return new Ok(undefined);
  }

  #renameJournalInShelves(oldName: string, newName: string): void {
    for (const shelf of this.#shelves.find().list()) {
      const idx = shelf.journals.indexOf(oldName);
      if (idx !== -1) {
        const journals = [...shelf.journals];
        journals[idx] = newName;
        this.#shelves.update(shelf.name, { journals });
      }
    }
  }

  #removeJournalFromShelves(journalName: string): void {
    for (const shelf of this.#shelves.find().list()) {
      const idx = shelf.journals.indexOf(journalName);
      if (idx !== -1) {
        this.#shelves.update(shelf.name, {
          journals: shelf.journals.filter((j) => j !== journalName),
        });
      }
    }
  }

  static #assignStatic(
    journals: JournalsRepository,
    shelves: ShelvesRepository,
    journalName: string,
    shelfName: string,
  ): Result<void, UnknownJournalError | UnknownShelfError> {
    if (journals.get(journalName).isNone()) return new Err(new UnknownJournalError(journalName));
    if (shelfName === "") {
      ShelvesService.#removeJournalFromShelvesStatic(shelves, journalName);
      return new Ok(undefined);
    }
    if (shelves.get(shelfName).isNone()) return new Err(new UnknownShelfError(shelfName));
    ShelvesService.#removeJournalFromShelvesStatic(shelves, journalName);
    const target = shelves.get(shelfName).unwrapOr({ name: shelfName, journals: [] });
    shelves.update(shelfName, { journals: [...target.journals, journalName] });
    return new Ok(undefined);
  }

  static #renameJournalInShelvesStatic(shelves: ShelvesRepository, oldName: string, newName: string): void {
    for (const shelf of shelves.find().list()) {
      const idx = shelf.journals.indexOf(oldName);
      if (idx !== -1) {
        const journals = [...shelf.journals];
        journals[idx] = newName;
        shelves.update(shelf.name, { journals });
      }
    }
  }

  static #removeJournalFromShelvesStatic(shelves: ShelvesRepository, journalName: string): void {
    for (const shelf of shelves.find().list()) {
      const idx = shelf.journals.indexOf(journalName);
      if (idx !== -1) {
        shelves.update(shelf.name, { journals: shelf.journals.filter((j) => j !== journalName) });
      }
    }
  }
}
```

Note: the duplication between instance and static methods is the test-helper escape hatch. If `Object.create` plus property assignment can't reach the private-field-named slots, the static functions provide an equivalent path the test helper uses.

- [ ] **Step 8.4: Run the test to verify it passes**

```bash
npm test -- --run src/shelves/service.test.ts
```

Expected: PASS.

- [ ] **Step 8.5: Bind the service in the shelves module**

Modify `src/shelves/module.ts`. Add import:

```ts
import { ShelvesService } from "./service";
```

In `register(c)`, add after the view-model binding:

```ts
c.register(ShelvesService).useClass(ShelvesService).eager();
```

The `eager()` chain ensures the constructor (and its `#journalEvents.on(...)` subscriptions) runs at boot.

- [ ] **Step 8.6: Update the shelves barrel**

Modify `src/shelves/index.ts`. Add:

```ts
export { ShelvesService } from "./service";
```

- [ ] **Step 8.7: Run all tests, typecheck, lint**

```bash
npm test -- --run
npm run check:types
npm run check:lint
```

Expected: all PASS.

- [ ] **Step 8.8: Commit**

```bash
git add src/shelves/
git commit -m "feat(shelves): add ShelvesService for cascade subscribers and assign"
```

---

## Task 9: Migrate `DynamicCommandRegistry` to events tokens

This is the only file in the codebase that uses `watch()` for cross-feature derivation. Replacing it is the structural payoff for Task 2 (D) in the design interview.

**Files:**

- Modify: `src/commands/command-registry.ts`
- Modify: `src/commands/command-registry.test.ts`

- [ ] **Step 9.1: Read the existing test file**

Read `src/commands/command-registry.test.ts` (full file). Identify how it constructs the `DynamicCommandRegistry` and how it simulates `journalRenamed`/`journalDeleted`/`shelfRenamed`/`shelfDeleted` events today (likely by injecting fake lifecycle services). Plan the test updates so the new flow uses `journalsRepo.rename(...)`, `shelvesRepo.rename(...)`, and `commandsRepo.{create,update,delete}` instead.

- [ ] **Step 9.2: Update the test setup**

Replace any constructors that build `JournalLifecycleService` / `ShelvesLifecycleService` with constructors that build the new repositories + events tokens. The pattern:

```ts
const journalsRepo = JournalsRepository.fromParts(journalsStorage, journalsEvents);
const shelvesRepo = ShelvesRepository.fromParts(shelvesStorage, shelvesEvents);
const commandsRepo = CommandsRepository.fromParts(commandsStorage, commandsEvents);
// register them + their event tokens in the test DI scope
```

Then trigger the cross-feature events via the repositories (`journalsRepo.rename("a", "b")`) instead of by calling lifecycle service methods. Assertions on registered/unregistered commands stay the same.

If the existing test setup is harness-based (a `buildHarness` helper), update the harness to wire the new bindings and continue using it.

- [ ] **Step 9.3: Refactor `DynamicCommandRegistry`**

Replace `src/commands/command-registry.ts` body. Key changes:

- Remove the `watch` import.
- Inject `CommandsRepository`, `CommandsEventsToken`, `JournalsRepository`, `JournalsEventsToken`, `ShelvesRepository`, `ShelvesEventsToken` instead of `SettingsService.getCollection(...)` and lifecycle services.
- The `initialize()` body becomes three event-driven subscriptions for command reconciliation, plus the existing cross-feature handlers re-pointed at the new events tokens:

```ts
initialize(): void {
  this.#reconcile();
  this.#commandsEvents.on("created", () => this.#reconcile());
  this.#commandsEvents.on("updated", () => this.#reconcile());
  this.#commandsEvents.on("deleted", () => this.#reconcile());
  this.#journalsEvents.on("renamed", (oldName, newName) => this.#onJournalRenamed(oldName, newName));
  this.#journalsEvents.on("deleted", (journalName) => this.#onJournalDeleted(journalName));
  this.#shelvesEvents.on("renamed", (oldName, newName) => this.#onShelfRenamed(oldName, newName));
  this.#shelvesEvents.on("deleted", (shelfName) => this.#onShelfDeleted(shelfName));
}
```

- `#commandEntries()` is removed. `#reconcile` reads through the repository:

```ts
#reconcile(): void {
  const present = new Set<string>();
  for (const id of this.#commandsRepo.find().ids()) present.add(id);
  for (const id of [...this.#registered.keys()]) {
    if (!present.has(id)) {
      this.#commands.unregister(id);
      this.#registered.delete(id);
    }
  }
  for (const command of this.#commandsRepo.find().list()) {
    const id = this.#commandsRepo.find().ids().next().value as string; // not — see fix below
  }
}
```

The line above is wrong; use entries via `Object.entries(this.#commandsRepo.find())` — but the query does not expose `entries`. Instead pair the keys with the values by zipping `ids()` and `list()` using `Object.entries(reactiveRecord)` directly. To avoid that, give `RepositoryQuery` an `entries(): IterableIterator<[Id, Entity]>` method. Add it now in `src/infrastructure/repository/repository-query.ts`:

```ts
*entries(): IterableIterator<[Id, Entity]> {
  for (const pair of this.source) yield pair;
}
```

Update `src/infrastructure/repository/types.ts`:

```ts
export interface RepositoryQueryContract<Id extends string, Entity> {
  first(): Option<Entity>;
  ids(): IterableIterator<Id>;
  list(): IterableIterator<Entity>;
  entries(): IterableIterator<[Id, Entity]>;
  options(): IterableIterator<{ value: Id; label: string }>;
  map<T>(fn: (entity: Entity) => T): IterableIterator<T>;
  filter(predicate: (entity: Entity) => boolean): this;
  [Symbol.iterator](): Iterator<Entity>;
}
```

Add a test for `entries()` in `src/infrastructure/repository/repository-query.test.ts`:

```ts
describe("entries", () => {
  it("yields [id, entity] pairs", () => {
    const q = new RepositoryQuery<string, Item>(
      buildSource([
        ["a", { name: "A", count: 1 }],
        ["b", { name: "B", count: 2 }],
      ]),
      "name",
    );
    expect([...q.entries()]).toEqual([
      ["a", { name: "A", count: 1 }],
      ["b", { name: "B", count: 2 }],
    ]);
  });
});
```

Run the query test; ensure it passes.

Then `#reconcile` becomes:

```ts
#reconcile(): void {
  const present = new Set<string>();
  for (const [id, command] of this.#commandsRepo.find().entries()) {
    present.add(id);
    const serialized = JSON.stringify(command);
    if (this.#registered.get(id) === serialized) continue;
    if (this.#registered.has(id)) this.#commands.unregister(id);
    this.#commands.register(this.#registration(id, command));
    this.#registered.set(id, serialized);
  }
  for (const id of [...this.#registered.keys()]) {
    if (!present.has(id)) {
      this.#commands.unregister(id);
      this.#registered.delete(id);
    }
  }
}
```

- `#candidates(command)` reads from the journals repository / shelves repository instead of `settings.getCollection(...)`:

```ts
#candidates(command: CommandConfig): string[] {
  return match(command.target)
    .with({ kind: "all" }, (target) =>
      [...this.#journalsRepo.find().entries()]
        .filter(([, j]) => j.write.type === target.writeType)
        .map(([name]) => name),
    )
    .with({ kind: "journal" }, (target) =>
      this.#journalsRepo.get(target.journalName).isSome() ? [target.journalName] : [],
    )
    .with({ kind: "shelf" }, (target) => {
      const shelfOpt = this.#shelvesRepo.get(target.shelfName);
      if (shelfOpt.isNone()) return [];
      const shelf = shelfOpt.unwrapOr({ name: target.shelfName, journals: [] });
      return shelf.journals.filter(
        (name) => this.#journalsRepo.get(name).map((j) => j.write.type === target.writeType).getOr(false),
      );
    })
    .exhaustive();
}
```

- The cross-feature handlers mediate writes through the repository:

```ts
#onJournalRenamed(oldName: string, newName: string): void {
  for (const [id, command] of this.#commandsRepo.find().entries()) {
    if (command.target.kind === "journal" && command.target.journalName === oldName) {
      this.#commandsRepo.update(id, { target: { ...command.target, journalName: newName } });
    }
  }
}

#onJournalDeleted(journalName: string): void {
  for (const [id, command] of this.#commandsRepo.find().entries()) {
    if (command.target.kind === "journal" && command.target.journalName === journalName) {
      this.#commandsRepo.delete(id);
    }
  }
}

#onShelfRenamed(oldName: string, newName: string): void {
  for (const [id, command] of this.#commandsRepo.find().entries()) {
    if (command.target.kind === "shelf" && command.target.shelfName === oldName) {
      this.#commandsRepo.update(id, { target: { ...command.target, shelfName: newName } });
    }
  }
}

#onShelfDeleted(shelfName: string): void {
  for (const [id, command] of this.#commandsRepo.find().entries()) {
    if (command.target.kind === "shelf" && command.target.shelfName === shelfName) {
      this.#commandsRepo.delete(id);
    }
  }
}
```

- Drop the imports of `JournalLifecycleService`, `ShelvesLifecycleService`, `journalConfigCollection`, `shelvesCollection`, `commandCollection`, `SettingsService`, `watch`. Add imports for the repositories and events tokens.

- [ ] **Step 9.4: Run the registry test to verify it passes**

```bash
npm test -- --run src/commands/command-registry.test.ts
```

Expected: PASS, including the existing cascade tests.

- [ ] **Step 9.5: Run all tests, typecheck, lint**

```bash
npm test -- --run
npm run check:types
npm run check:lint
```

Expected: all PASS.

- [ ] **Step 9.6: Commit**

```bash
git add src/commands/command-registry.ts src/commands/command-registry.test.ts src/infrastructure/repository/
git commit -m "refactor(commands): drive DynamicCommandRegistry from repository events"
```

---

## Task 10: Migrate journal flows and `journals/testing.ts`

The five flow files under `src/journals/settings/flows/` use `JournalLifecycleService` and/or `settings.getCollection(journalConfigCollection)`. Migrate them all in one task.

**Files (modify):**

- `src/journals/settings/flows/add-journal.flow.ts` + `.test.ts`
- `src/journals/settings/flows/rename-journal.flow.ts` + `.test.ts`
- `src/journals/settings/flows/delete-journal.flow.ts` + `.test.ts`
- `src/journals/settings/flows/edit-frontmatter-field.flow.ts` + `.test.ts`
- `src/journals/settings/flows/edit-sequence-property.flow.ts` + `.test.ts`
- `src/journals/testing.ts`
- `src/journals/settings/module.ts` (drop the `JournalLifecycleService` registration)

- [ ] **Step 10.1: Migrate the three lifecycle flows**

For each of `add-journal.flow.ts`, `rename-journal.flow.ts`, `delete-journal.flow.ts`:

- Replace `inject(JournalLifecycleService)` with `inject(JournalsRepository)`.
- Replace `#lifecycle.create(name, write)` with `#repository.create(name, write)`.
- Replace `#lifecycle.rename(old, new)` with `#repository.rename(old, new)`.
- Replace `#lifecycle.delete(name)` with `#repository.delete(name)`.
- Update the error types in the flow's `Result<...>` annotation if they referenced lifecycle service signatures (they shouldn't — the errors are the same classes).

For each test file: change the fake/setup that constructed `JournalLifecycleService` to construct `JournalsRepository.fromParts(...)`. Adjust event-spy expectations if the test asserted on `journalRenamed` / `journalDeleted` — the new event names are `renamed` / `deleted` (the typed payload changes from `{oldName, newName}` to `(oldName, newName)`).

- [ ] **Step 10.2: Migrate `edit-frontmatter-field.flow.ts` and `edit-sequence-property.flow.ts`**

Both flows currently do:

```ts
const collection = this.#settings.getCollection(journalConfigCollection);
const config = collection.get(name);
// mutate config fields in place
```

After migration:

```ts
const configOpt = this.#repository.get(name);
if (configOpt.isNone()) return Err(...);
const config = configOpt.unwrapOr(...);
// build a Partial<JournalConfig> of changes
this.#repository.update(name, { frontmatter: { ...config.frontmatter, [field]: value } });
```

Field-level in-place mutation is replaced by a `repo.update` call carrying a complete replacement of any object-valued field that changed. Read the existing test fixtures to learn what fields are mutated and shape the `Partial<JournalConfig>` accordingly.

Update both test files: replace `settings.getCollection(journalConfigCollection).get(...)` with the same pattern. Assertions on the post-state read from `journalsRepo.get(name)` (or the storage record passed into `JournalsRepository.fromParts`).

- [ ] **Step 10.3: Migrate `src/journals/testing.ts`**

Read the file. If it constructs a `JournalLifecycleService` or relies on `settings.getCollection(journalConfigCollection).entries`, refactor to expose a built `JournalsRepository` (via `JournalsRepository.fromParts`) and the underlying storage record. The new helper is the test fixture for every downstream test.

- [ ] **Step 10.4: Drop the lifecycle service from `src/journals/settings/module.ts`**

Remove the line `c.register(JournalLifecycleService).useClass(JournalLifecycleService);` and the import. The flows now inject `JournalsRepository`, which is bound in `src/journals/module.ts` from Task 5.

- [ ] **Step 10.5: Run journal-related tests, typecheck, lint**

```bash
npm test -- --run src/journals
npm run check:types
npm run check:lint
```

Expected: all PASS. Note that `src/journals/settings/lifecycle.test.ts` still exists at this point — it will be deleted in Task 14, but until then it must compile. If it stops importing now that the lifecycle service isn't bound to DI, mark its `describe` block with `.skip` temporarily (and remove the marker in Task 14 by deleting the file outright). Alternative: delete the test file now, in this task, since the lifecycle service is no longer wired up.

Recommendation: delete `src/journals/settings/lifecycle.test.ts` now (in this task), and rely on `src/journals/repository.test.ts` for the same coverage. Keep `src/journals/settings/lifecycle.ts` until Task 14.

```bash
rm src/journals/settings/lifecycle.test.ts
```

Then re-run:

```bash
npm test -- --run
```

Expected: PASS.

- [ ] **Step 10.6: Commit**

```bash
git add src/journals/
git commit -m "refactor(journals): migrate flows from JournalLifecycleService to JournalsRepository"
```

---

## Task 11: Migrate journal read-paths and notes services

Many journal-internal files just read configs through `settings.getCollection(...)`. Migration is mechanical: inject the repository, replace `.get(name)` calls.

**Files (modify):**

- `src/journals/cycle.ts`
- `src/journals/frontmatter.ts`
- `src/journals/timeline.ts`
- `src/journals/numbering.ts`
- `src/journals/flows/open-date.ts`
- `src/journals/notes/auto-create.ts`
- `src/journals/notes/auto-attach.ts`
- `src/journals/notes/template-content.ts`
- `src/journals/notes/note-path.ts`

For each file:

- Replace `readonly #settings = inject(SettingsService)` with `readonly #journals = inject(JournalsRepository)` (if `SettingsService` is otherwise unused in the file).
- Replace `this.#settings.getCollection(journalConfigCollection).get(name)` with `this.#journals.get(name)`.
  - The return type changes from `JournalConfig | undefined` to `Option<JournalConfig>`. Adjust the callsite: `const config = configOpt.unwrapOrUndefined();` if undefined-or-config was the existing shape, or refactor to use `Option.map(...)` if cleaner.
  - The `as JournalConfig | undefined` casts disappear — `repo.get` is already typed.
- For iteration (`Object.entries(collection.entries)`, `Object.keys(collection.entries)`, `Object.values(collection.entries)`), use the repository query:
  - `Object.keys(...).` → `[...this.#journals.find().ids()]`
  - `Object.entries(...)` → `[...this.#journals.find().entries()]`
  - `Object.values(...)` → `[...this.#journals.find().list()]`

- [ ] **Step 11.1: Migrate each file in the list above**

For each file, follow the patterns above. Read the file, identify every `getCollection(journalConfigCollection)` callsite, and apply the patterns.

- [ ] **Step 11.2: Run journal tests, typecheck, lint after each file**

A safer flow is one-file-per-commit, but for plan efficiency a single commit covering all read-path migrations is acceptable. After all files are migrated:

```bash
npm test -- --run
npm run check:types
npm run check:lint
```

Expected: all PASS.

- [ ] **Step 11.3: Commit**

```bash
git add src/journals/
git commit -m "refactor(journals): read journal configs through JournalsRepository"
```

---

## Task 12: Migrate Vue components and remaining flows

This is the biggest mechanical task. Twelve Vue components and four flows still call `settings.getCollection(...)`. The pattern is uniform.

**Files (modify):**

Journals UI:

- `src/journals/settings/ui/AddJournalModal.vue`
- `src/journals/settings/ui/RenameJournalModal.vue`
- `src/journals/settings/ui/EditFrontmatterFieldModal.vue`
- `src/journals/settings/ui/EditSequencePropertyModal.vue`
- `src/journals/settings/ui/JournalEditSubpage.vue`

Commands UI:

- `src/commands/ui/CommandsDashboardBlock.vue`
- `src/commands/ui/JournalCommandsSection.vue`
- `src/commands/ui/ShelfCommandsSection.vue`
- `src/commands/ui/EditCommandModal.vue`
- `src/commands/ui/edit-command.flow.ts`
- `src/commands/ui/delete-command.flow.ts`

Shelves UI:

- `src/shelves/ui/ShelvesDashboardBlock.vue`
- `src/shelves/ui/JournalsDashboardBlock.vue`
- `src/shelves/ui/JournalShelfSection.vue`
- `src/shelves/ui/ShelfEditSubpage.vue`
- `src/shelves/ui/edit-shelf-name.flow.ts`
- `src/shelves/ui/delete-shelf.flow.ts`
- `src/shelves/ui/place-journal.flow.ts`

Tests:

- Every `.test.ts` co-located with the files above.

### Migration patterns

**Vue components that read entries reactively:**

Before:

```vue
<script setup lang="ts">
import { useService } from "@/infrastructure/di";
import { journalConfigCollection } from "@/journals";
import { SettingsService } from "@/settings";

const settings = useService(SettingsService);
const collection = settings.getCollection(journalConfigCollection);
const journals = computed(() => Object.entries(collection.entries).map(([name, j]) => ({ name, ...j })));
</script>
```

After:

```vue
<script setup lang="ts">
import { useService } from "@/infrastructure/di";
import { JournalsViewModel } from "@/journals";

const journals = useService(JournalsViewModel);
// In template: journals.journals (ComputedRef<JournalConfig[]>)
//              journals.journalOptions
//              journals.isJournalNameAvailable(name, excludeCurrent)
//              journals.getJournal(name)
</script>
```

If the component had its own `computed` over `Object.entries(collection.entries)`, replace it with `journals.journals.value` or `journals.journalOptions.value` directly. Drop the `computed(...)` wrapper unless the component additionally mapped/transformed each entry — in that case, write a local `computed(() => journals.journals.value.map(...))`.

**Vue components that mutate entries:**

Before:

```ts
collection.add(name, init);
collection.remove(name);
config.fieldName = "x"; // direct mutation
```

After:

```ts
journalsRepo.create(name, write); // or commandsRepo.create(id, init), shelvesRepo.create(name)
journalsRepo.delete(name);
journalsRepo.update(name, { fieldName: "x" });
```

Replace `useService(SettingsService)` with `useService(JournalsRepository)` (or the relevant repository) when the component needs to mutate. If both read and write are needed, use the view-model for reads and the repository for writes — both injected.

**Flow files (`.flow.ts`):**

These are non-Vue classes (DI-bound). Same migration:

- `inject(SettingsService)` → `inject(JournalsRepository)` / `inject(CommandsRepository)` / `inject(ShelvesRepository)` (drop the SettingsService injection if no other usage remains).
- `.get(name)` → `repo.get(name)` (returns `Option`; handle accordingly).
- `.add(name, init)` → `repo.create(name, ...)`.
- `.remove(name)` → `repo.delete(name)`.
- For complex updates: build a `Partial<Entity>` and call `repo.update(id, changes)`.
- `delete-command.flow.ts` calls `collection.remove(id)` — becomes `commandsRepo.delete(id)`.
- `edit-command.flow.ts` reads `Object.entries(collection.entries)` to compute taken names — becomes `[...commandsRepo.find().entries()]`. If it then calls `collection.add(id, command)`, it becomes `commandsRepo.create(id, command)` (or `commandsRepo.update(id, command)` if id already exists).
- `edit-shelf-name.flow.ts` calls `ShelvesLifecycleService.rename(...)` — becomes `shelvesRepo.rename(...)`.
- `delete-shelf.flow.ts` calls `ShelvesLifecycleService.delete(name, dest?)` — becomes `shelvesRepo.deleteWith(name, dest)`.
- `place-journal.flow.ts` calls `ShelvesLifecycleService.assign(...)` — becomes `shelvesService.assign(...)` (the `ShelvesService` from Task 8).

**Tests for migrated components and flows:**

For each `.test.ts`, find any `JournalLifecycleService`, `ShelvesLifecycleService`, or `getCollection(...)` reference and migrate using the same patterns. Constructor seeding shifts from `lifecycle.create(...)` to `repo.create(...)`. Storage inspection shifts from `collection.entries` to the raw record passed into `repo.fromParts(...)`.

- [ ] **Step 12.1: Migrate the seventeen files in the list above**

For each file, apply the patterns. Recommended order: flows first (mechanical), then Vue components (often read-only via view-models).

- [ ] **Step 12.2: Migrate each file's `.test.ts` alongside its source**

Test setup updates are mechanical: swap lifecycle constructors for repository `fromParts` constructors, swap event-name assertions, swap mutation calls.

- [ ] **Step 12.3: Verify no remaining `getCollection` or `JournalLifecycleService` / `ShelvesLifecycleService` callers outside the lifecycle files themselves**

```bash
grep -rn "getCollection\|JournalLifecycleService\|ShelvesLifecycleService" src --include="*.ts" --include="*.vue" 2>/dev/null \
  | grep -v "_old-code\|src/settings/settings-service.ts\|src/journals/settings/lifecycle.ts\|src/shelves/lifecycle.ts"
```

Expected: empty output.

- [ ] **Step 12.4: Run all tests, typecheck, lint**

```bash
npm test -- --run
npm run check:types
npm run check:lint
```

Expected: all PASS.

- [ ] **Step 12.5: Commit**

```bash
git add src/
git commit -m "refactor: migrate Vue components and flows to repositories and view-models"
```

If the diff is large enough that review benefits from splitting, make three commits in this task: one for journal UI/flows, one for commands UI/flows, one for shelves UI/flows.

---

## Task 13: Delete `JournalLifecycleService` and `ShelvesLifecycleService`

Both services are now zero-consumer. Remove them.

**Files (delete):**

- `src/journals/settings/lifecycle.ts`
- `src/shelves/lifecycle.ts`

**Files (modify):**

- `src/shelves/module.ts` (drop the `ShelvesLifecycleService` registration)
- `src/shelves/index.ts` (drop the `ShelvesLifecycleService` export)
- Any other file still importing them (should be none after Task 12).

- [ ] **Step 13.1: Verify no callers remain**

```bash
grep -rn "JournalLifecycleService\|ShelvesLifecycleService" src --include="*.ts" --include="*.vue" 2>/dev/null
```

Expected: matches only inside `src/journals/settings/lifecycle.ts`, `src/shelves/lifecycle.ts`, and possibly their module/barrel exports.

- [ ] **Step 13.2: Delete the lifecycle files**

```bash
rm src/journals/settings/lifecycle.ts
rm src/shelves/lifecycle.ts
```

- [ ] **Step 13.3: Drop `ShelvesLifecycleService` from the shelves module**

Modify `src/shelves/module.ts`. Remove the import and the `c.register(ShelvesLifecycleService).useClass(ShelvesLifecycleService).eager();` line.

- [ ] **Step 13.4: Drop the export from the shelves barrel**

Modify `src/shelves/index.ts`. Remove `export { ShelvesLifecycleService } from "./lifecycle";`.

- [ ] **Step 13.5: Run all tests, typecheck, lint**

```bash
npm test -- --run
npm run check:types
npm run check:lint
```

Expected: all PASS.

- [ ] **Step 13.6: Commit**

```bash
git add src/
git commit -m "chore: delete JournalLifecycleService and ShelvesLifecycleService"
```

---

## Task 14: Remove `SettingsService.getCollection` and shrink `ReactiveCollection`

`getCollection` and `ReactiveCollection.add/remove/get` are now zero-consumer. Remove them.

**Files (modify):**

- `src/settings/settings-service.ts` (remove `getCollection`)
- `src/settings/collection.ts` (rename to `ReactiveCollectionStore`, drop mutation methods)
- `src/settings/types.ts` (remove `CollectionHandle`)
- `src/settings/index.ts` (update exports)
- `src/settings/settings-service.test.ts` (remove `getCollection` tests if any remain)
- `src/settings/collection.test.ts` (remove tests for the dropped methods)

- [ ] **Step 14.1: Verify no consumers**

```bash
grep -rn "getCollection\|CollectionHandle\|ReactiveCollection\b" src --include="*.ts" --include="*.vue" 2>/dev/null \
  | grep -v "_old-code\|src/settings/"
```

Expected: empty output. (Internal references inside `src/settings/` are fine — they're what we're removing.)

- [ ] **Step 14.2: Remove `getCollection` from `SettingsService`**

Modify `src/settings/settings-service.ts`. Delete the `getCollection` method (currently around lines 78-84). Delete the `CollectionHandle` import. The `getCollection`-related private state (`#collectionHandles`) is now write-only — but `recordOf` still uses `#collectionHandles.has(...)` for the registered-key check. Keep the map but rename its variable to `#registeredCollectionKeys: Set<string>`:

```ts
readonly #registeredCollectionKeys = new Set<string>(this.#collections.map((c) => c.key));
```

And in `#hydrate`, remove the `this.#collectionHandles.set(...)` line (since no `ReactiveCollection` instance is needed any more). The hydration loop becomes:

```ts
for (const definition of this.#collections) {
  this.#root[definition.key] = parseCollectionValue(definition, migrated[definition.key], this.#logger);
}
```

`parseCollectionValue` is a new helper that mirrors what `ReactiveCollection`'s constructor did — iterates raw object entries, parses each, and assigns into a fresh reactive Record. Define it at module level in `src/settings/settings-service.ts`:

```ts
function parseCollectionValue<TItem extends AnySchema>(
  definition: CollectionDefinition<string, TItem>,
  raw: unknown,
  logger: Logger,
): Record<string, InferOutput<TItem>> {
  const out: Record<string, InferOutput<TItem>> = {};
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, value] of Object.entries(raw)) {
    const parsed = v.safeParse(definition.itemSchema, value);
    if (parsed.success) {
      out[id] = parsed.output;
    } else {
      out[id] = definition.defaultItem(id);
      logger.warn("collection entry reset to defaults", {
        sliceKey: `${definition.key}/${id}`,
        issues: parsed.issues.map((issue) => issue.message),
      });
    }
  }
  return out;
}
```

`recordOf` is updated to use the new state:

```ts
recordOf<TKey extends string, TItem extends AnySchema>(
  collection: CollectionDefinition<TKey, TItem>,
): Record<string, InferOutput<TItem>> {
  if (!this.#registeredCollectionKeys.has(collection.key)) {
    throw new UnregisteredSliceError(collection.key);
  }
  return this.#root[collection.key] as Record<string, InferOutput<TItem>>;
}
```

- [ ] **Step 14.3: Remove `src/settings/collection.ts` (or shrink to nothing)**

`ReactiveCollection` is no longer used. Delete the file:

```bash
rm src/settings/collection.ts
rm src/settings/collection.test.ts
```

- [ ] **Step 14.4: Remove `CollectionHandle` from types**

Modify `src/settings/types.ts`. Delete the `CollectionHandle` interface and any related types. If `SliceHandle` is no longer used elsewhere, keep it for now (slices haven't changed).

- [ ] **Step 14.5: Update the settings barrel**

Modify `src/settings/index.ts`. Remove any export of `CollectionHandle`, `ReactiveCollection`. Keep `recordOf` accessible by virtue of `SettingsService` being exported.

- [ ] **Step 14.6: Remove `getCollection` tests**

Modify `src/settings/settings-service.test.ts`. Delete any `describe("getCollection", ...)` blocks. Keep the new `recordOf` tests from Task 3.

- [ ] **Step 14.7: Run all tests, typecheck, lint**

```bash
npm test -- --run
npm run check:types
npm run check:lint
```

Expected: all PASS.

- [ ] **Step 14.8: Commit**

```bash
git add src/settings/
git commit -m "refactor(settings): remove getCollection and ReactiveCollection mutation API"
```

---

## Task 15: Final verification

- [ ] **Step 15.1: Run the full test suite**

```bash
npm test -- --run
```

Expected: PASS for all tests across the project.

- [ ] **Step 15.2: Run typecheck**

```bash
npm run check:types
```

Expected: PASS with no errors.

- [ ] **Step 15.3: Run lint**

```bash
npm run check:lint
```

Expected: PASS with no warnings.

- [ ] **Step 15.4: Final grep audit**

```bash
grep -rn "JournalLifecycleService\|ShelvesLifecycleService\|getCollection\|@/journals/settings/errors" src --include="*.ts" --include="*.vue" 2>/dev/null \
  | grep -v "_old-code"
```

Expected: empty output.

```bash
grep -rn "ReactiveCollection\|CollectionHandle" src --include="*.ts" --include="*.vue" 2>/dev/null \
  | grep -v "_old-code"
```

Expected: empty output.

- [ ] **Step 15.5: Smoke-test in the dev environment**

If a dev workflow exists for the plugin (Obsidian sandbox / hot-reload), run the plugin against a test vault and exercise:

1. Create a journal, rename it, delete it — verify each via the settings UI.
2. Create a command targeting a journal — rename the journal, confirm the command's target updates without flicker (no unregister/register pair).
3. Delete a journal — confirm dependent commands disappear and any shelf membership is reconciled.
4. Create a shelf, assign a journal to it, then delete the shelf with a destination — confirm members move.

If no dev workflow is available, document this gap in the PR description.

- [ ] **Step 15.6: No final commit needed.**

The branch is complete. Open the PR via the user's preferred path (`gh pr create`, etc.) when they ask.

---

## Self-review

Spec coverage check against `docs/superpowers/specs/2026-05-23-v3-repository-pattern-design.md`:

- Component 1 (`BaseRepository`) → Task 2.
- Component 2 (`RepositoryQuery`) → Task 1 + Task 9 (added `entries()`).
- Component 3 (`SettingsService.recordOf`) → Task 3 + Task 14 (final cleanup).
- Component 4 (`JournalsRepository`) → Task 5.
- Component 5 (`JournalsViewModel`) → Task 5.
- Component 6 (`CommandsRepository`) → Task 6.
- Component 7 (`CommandsViewModel`) → Task 6.
- Component 8 (`ShelvesRepository`) → Task 7.
- Component 9 (`ShelvesViewModel`) → Task 7.
- Component 10 (`ShelvesService`) → Task 8.
- Component 11 (Events tokens) → Tasks 5, 6, 7.
- Component 12 (Errors) → Task 4 (journals), Task 6 (commands), Task 7 (shelves additions).
- Component 13 (Module wiring) → distributed across Tasks 5–8 and 13–14.
- Migration of consumers → Tasks 9 (registry), 10 (journal flows), 11 (journal read-paths), 12 (Vue + flows).
- Lifecycle service deletion → Task 13.
- `getCollection` removal → Task 14.
- Final verification → Task 15.

Design refinements introduced during planning (and reflected in tasks):

- `add(id, entity)` takes id as an explicit arg (commands have no entity-side id field).
- `idKey?: keyof Entity` made optional; commands set it to `undefined`.
- `RepositoryQuery.entries()` added in Task 9.
- Tests use `fromParts` / `fromRepository` test-only static factories to avoid standing up a full DI container.

No placeholders. Every step contains code or exact commands.
