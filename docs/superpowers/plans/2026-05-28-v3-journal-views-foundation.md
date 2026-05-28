# v3 Journal Views Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the infrastructure for v3 journal views in `src/views/` — schemas, repository, service, view-host, view-leaf, view-context, and the `defineViewBlock` registration API. No blocks, no UI, no migration, no default view.

**Architecture:** New feature folder `src/views/` mirroring `src/shelves/` shape: `defineCollection` schemas, `BaseRepository` subclass, `attempt.in`-based service, an Obsidian `ItemView` subclass, and an eager host service that wires Obsidian-side view registration through `CommandService` (single primitive for command + ribbon). View-block definitions register through a multi-binding token; `ViewsService` collects them on construction. No new infrastructure under `src/infrastructure/`.

**Tech Stack:** TypeScript, Vue 3 (Composition API), Obsidian plugin API, valibot, nanoevents, vitest + `@testing-library/vue`, internal DI (`createToken`, `createMultiToken`, `inject`).

**Spec:** `docs/superpowers/specs/2026-05-28-v3-journal-views-foundation-design.md`

**Reference files to skim before starting:**

- `src/shelves/` — full feature folder; this plan mirrors its shape.
- `src/infrastructure/host/commands/internal/command-service.ts` — single primitive for command + ribbon registration.
- `src/infrastructure/host/internal/testing.ts` — `createFakeHost()`, the shared fake-Obsidian fixture (will be extended in Task 8).
- `src/infrastructure/repository/base-repository.ts` — base class the repository extends.
- `src/settings/schema.ts` — `defineCollection` signature.
- `src/infrastructure/di/vue.ts` — `useService`, `provideInjectorOnApp`, `useInjector`.
- `src/_old-code/calendar-view/calendar-view.ts` — v2's `ItemView` pattern; our `JournalViewLeaf` mirrors its mount/unmount shape but reads view config via DI.

**Coding-standard memories that apply throughout** (do not violate without explicit instruction):

- `[[feedback_quality_gates]]` — every task runs `npm run test`, `npm run check:types`, `npm run check:lint` locally.
- `[[feedback_test_hygiene]]` — colocate `*.test.ts` with implementation; `expectTypeOf` for type assertions.
- `[[feedback_no_lint_silence]]` — never `eslint-disable`; fix the code.
- `[[feedback_no_separate_branches]]` — commit to the current branch (`v3-ai`).
- `[[feedback_no_coauthored_by]]` — never add `Co-Authored-By` trailer to commits.
- `[[feedback_attempt_in_over_this_shadow]]` — service mutations compose with `attempt.in(this, function* () { ... })`.
- `[[feedback_field_initializer_preference]]` — `readonly #x = inject(...)` at declaration, not in constructor body.
- `[[feedback_one_behavior_per_test]]` — one assertion target per `it(...)`; split multi-axis tests.
- `[[feedback_test_descriptions]]` — subject + verb behavior names (`"emits created on create"`, not `"create"`).
- `[[feedback_no_what_comments]]` — no narrative docstrings; only WHY-comments for non-obvious code.
- `[[feedback_no_spec_refs_in_source]]` — never write "Satisfies Requirement X" or similar.
- `[[feedback_errors_in_errors_ts]]` — every error subclass goes in `errors.ts`.

---

## File Structure

Files this plan creates:

```
src/views/
  config.ts                  schemas + types + viewsCollection
  config.test.ts
  errors.ts                  five error classes + ViewsLifecycleError union
  tokens.ts                  ViewBlockDefinitionToken, ViewsEventsToken, ViewsEvents
  define-view-block.ts       defineViewBlock factory + ViewBlockProps + ViewBlockDefinition
  repository.ts              ViewsRepository extends BaseRepository
  repository.test.ts
  service.ts                 ViewsService — CRUD + block ops + getBlockDefinition
  service.test.ts
  view-context.ts            ViewContextKey, provideViewContext, useViewContext, ViewContext
  view-context.test.ts
  view-leaf.ts               JournalViewLeaf extends ItemView
  view-leaf.test.ts
  view-host.ts               ViewHostService — register / registerAll / dispose
  view-host.test.ts
  module.ts                  viewsModule
  testing.ts                 fakeViewsRepo, provideViewContextStub, mountViewBlock
  index.ts                   public barrel (no test helpers)
```

Files this plan modifies:

- `src/main.ts` — add `container.addModule(viewsModule);` after `shelvesModule`, before `codeBlocksModule`.
- `src/infrastructure/host/internal/testing.ts` — extend `createFakeHost()` with view-registration tracking (Task 8 only).

---

## Task 1: Config, schemas, branded types

**Files:**

- Create: `src/views/config.ts`
- Create: `src/views/config.test.ts`

The branded types use unique-key brands (`__viewId: true`, not `__brand: "view-id"`) to match the convention used by `AnchorString` in `src/calendar/types.ts`. Per `[[feedback_no_unique_symbol_brands]]`, brands are structural, not unique symbols.

- [ ] **Step 1: Write the failing test**

```typescript
// src/views/config.test.ts
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { viewSchema, viewsCollection } from "./config";

describe("viewsCollection", () => {
  describe("default", () => {
    it("uses the supplied id as the view id", () => {
      const seed = viewsCollection.defaultItem("abc");
      expect(seed.id).toBe("abc");
    });

    it("uses the supplied id as the initial name", () => {
      const seed = viewsCollection.defaultItem("abc");
      expect(seed.name).toBe("abc");
    });

    it("seeds an empty blocks list", () => {
      const seed = viewsCollection.defaultItem("abc");
      expect(seed.blocks).toEqual([]);
    });

    it("seeds defaultShelf as null", () => {
      const seed = viewsCollection.defaultItem("abc");
      expect(seed.defaultShelf).toBeNull();
    });

    it("seeds showInRibbon as false", () => {
      const seed = viewsCollection.defaultItem("abc");
      expect(seed.showInRibbon).toBe(false);
    });

    it("seeds icon as calendar-days", () => {
      const seed = viewsCollection.defaultItem("abc");
      expect(seed.icon).toBe("calendar-days");
    });
  });

  describe("viewSchema validation", () => {
    it("rejects a view with an empty name", () => {
      const result = v.safeParse(viewSchema, {
        ...viewsCollection.defaultItem("3f8c8b7e-1c1a-4d5e-9b9b-1c1a4d5e9b9b"),
        name: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a view with an empty icon", () => {
      const result = v.safeParse(viewSchema, {
        ...viewsCollection.defaultItem("3f8c8b7e-1c1a-4d5e-9b9b-1c1a4d5e9b9b"),
        icon: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a block instance with an empty key", () => {
      const result = v.safeParse(viewSchema, {
        ...viewsCollection.defaultItem("3f8c8b7e-1c1a-4d5e-9b9b-1c1a4d5e9b9b"),
        blocks: [{ id: "5f8c8b7e-1c1a-4d5e-9b9b-1c1a4d5e9b9b", key: "", config: {} }],
      });
      expect(result.success).toBe(false);
    });

    it("accepts a default-seeded view", () => {
      const result = v.safeParse(viewSchema, viewsCollection.defaultItem("3f8c8b7e-1c1a-4d5e-9b9b-1c1a4d5e9b9b"));
      expect(result.success).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/views/config.test.ts`
Expected: FAIL — module `./config` not found.

- [ ] **Step 3: Implement `config.ts`**

```typescript
// src/views/config.ts
import * as v from "valibot";

import { defineCollection } from "@/settings/schema";

export type ViewId = string & { readonly __viewId: true };
export type BlockInstanceId = string & { readonly __blockInstanceId: true };

const viewIdSchema = v.pipe(
  v.string(),
  v.uuid(),
  v.transform((s) => s as ViewId),
);

const blockInstanceIdSchema = v.pipe(
  v.string(),
  v.uuid(),
  v.transform((s) => s as BlockInstanceId),
);

const viewBlockInstanceSchema = v.object({
  id: blockInstanceIdSchema,
  key: v.pipe(v.string(), v.minLength(1)),
  config: v.record(v.string(), v.unknown()),
});

export const viewSchema = v.object({
  id: viewIdSchema,
  name: v.pipe(v.string(), v.minLength(1)),
  icon: v.pipe(v.string(), v.minLength(1)),
  defaultShelf: v.nullable(v.string()),
  showInRibbon: v.boolean(),
  blocks: v.array(viewBlockInstanceSchema),
});

export type View = v.InferOutput<typeof viewSchema>;
export type ViewBlockInstance = v.InferOutput<typeof viewBlockInstanceSchema>;

export const viewsCollection = defineCollection("views", viewSchema, (id) => ({
  id: id as ViewId,
  name: id,
  icon: "calendar-days",
  defaultShelf: null,
  showInRibbon: false,
  blocks: [],
}));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/views/config.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Run type check + lint**

Run: `npm run check:types && npm run check:lint`
Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add src/views/config.ts src/views/config.test.ts
git commit -m "feat(views): schemas + viewsCollection"
```

---

## Task 2: Errors

**Files:**

- Create: `src/views/errors.ts`

Tests for individual error subclasses are forbidden by `[[feedback_no_trivial_tests]]`. No test file for this task. Subclass behavior is exercised through the service tests later.

- [ ] **Step 1: Implement `errors.ts`**

```typescript
// src/views/errors.ts
import type { BaseIssue } from "valibot";

import type { BlockInstanceId, ViewId } from "./config";

export class UnknownViewError extends Error {
  readonly kind = "unknown-view" as const;
  constructor(public readonly viewId: ViewId) {
    super(`Unknown view: ${viewId}`);
  }
}

export class DuplicateBlockInstanceIdError extends Error {
  readonly kind = "duplicate-block-instance-id" as const;
  constructor(
    public readonly viewId: ViewId,
    public readonly blockId: BlockInstanceId,
  ) {
    super(`Duplicate block instance id in view ${viewId}: ${blockId}`);
  }
}

export class UnknownViewBlockKeyError extends Error {
  readonly kind = "unknown-view-block-key" as const;
  constructor(public readonly key: string) {
    super(`Unknown view-block key: ${key}`);
  }
}

export class InvalidViewBlockConfigError extends Error {
  readonly kind = "invalid-view-block-config" as const;
  constructor(
    public readonly viewId: ViewId,
    public readonly blockId: BlockInstanceId,
    public readonly key: string,
    public readonly issues: readonly BaseIssue<unknown>[],
  ) {
    super(`Invalid config for view-block ${key} in view ${viewId} (instance ${blockId})`);
  }
}

export class InvalidViewNameError extends Error {
  readonly kind = "invalid-view-name" as const;
  constructor(public readonly attemptedName: string) {
    super(`Invalid view name: ${attemptedName}`);
  }
}

export type ViewsLifecycleError = InvalidViewNameError;
```

- [ ] **Step 2: Run type check + lint**

Run: `npm run check:types && npm run check:lint`
Expected: both succeed.

- [ ] **Step 3: Commit**

```bash
git add src/views/errors.ts
git commit -m "feat(views): errors module"
```

---

## Task 3: Tokens + events shape

**Files:**

- Create: `src/views/tokens.ts`

No test — multi-binding registration plumbing is exempt per `[[feedback_no_wiring_tests]]`.

- [ ] **Step 1: Implement `tokens.ts`**

```typescript
// src/views/tokens.ts
import type { Emitter } from "nanoevents";

import { createMultiToken, createToken } from "@/infrastructure/di";
import type { RepositoryEvents } from "@/infrastructure/repository";

import type { View, ViewId } from "./config";
import type { ViewBlockDefinition } from "./define-view-block";

// BaseRepository emits `created(id)`, `updated(id, changes)`, `deleted(id)` for us;
// we do not add custom events at foundation-time.
export type ViewsEvents = RepositoryEvents<ViewId, View>;

export const ViewBlockDefinitionToken = createMultiToken<ViewBlockDefinition>("views.block");
export const ViewsEventsToken = createToken<Emitter<ViewsEvents>>("views.events");
```

**Critical:** Per `src/infrastructure/repository/base-repository.ts` (lines 41-67), `BaseRepository.update` / `delete` / `addEntity` automatically emit `updated` / `deleted` / `created` through the events emitter. The service does **not** emit these events itself — that would double-fire.

- [ ] **Step 2: Confirm import path for `@/infrastructure/di` exposes both factories**

Read: `src/infrastructure/di/index.ts` — confirm `createToken`, `createMultiToken` are exported. If not, import from the deeper path used by `src/shelves/tokens.ts`.

- [ ] **Step 3: Type check (will fail until Task 4 lands `define-view-block`)**

Skip lint+typecheck until Task 4 — `ViewBlockDefinition` import resolves there.

- [ ] **Step 4: Commit**

```bash
git add src/views/tokens.ts
git commit -m "feat(views): tokens + events shape"
```

---

## Task 4: `defineViewBlock` factory

**Files:**

- Create: `src/views/define-view-block.ts`

Per `[[feedback_no_trivial_tests]]`, no test for a factory whose body is `return { ...input, __brand: "view-block" }`. The factory's type contract is exercised indirectly via service tests (Task 6) where mock definitions get passed through.

- [ ] **Step 1: Implement `define-view-block.ts`**

```typescript
// src/views/define-view-block.ts
import type { BaseIssue, BaseSchema } from "valibot";
import type { Component } from "vue";

import type { BlockInstanceId } from "./config";

export interface ViewBlockProps<TConfig> {
  readonly instanceId: BlockInstanceId;
  readonly config: TConfig;
}

export interface ViewBlockDefinitionInput<TConfig> {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly icon?: string;
  readonly schema: BaseSchema<unknown, TConfig, BaseIssue<unknown>>;
  readonly defaultConfig: TConfig;
  readonly component: Component<ViewBlockProps<TConfig>>;
  readonly configComponent?: Component<{ config: TConfig; onChange: (next: TConfig) => void }>;
  readonly cssClass?: string | readonly string[];
}

export interface ViewBlockDefinition<TConfig = unknown> extends ViewBlockDefinitionInput<TConfig> {
  readonly __brand: "view-block";
}

export function defineViewBlock<TConfig>(input: ViewBlockDefinitionInput<TConfig>): ViewBlockDefinition<TConfig> {
  return { ...input, __brand: "view-block" };
}
```

- [ ] **Step 2: Run type check + lint**

Run: `npm run check:types && npm run check:lint`
Expected: both succeed (now that tokens.ts's `ViewBlockDefinition` import resolves).

- [ ] **Step 3: Commit**

```bash
git add src/views/define-view-block.ts
git commit -m "feat(views): defineViewBlock factory"
```

---

## Task 5: Repository

**Files:**

- Create: `src/views/repository.ts`
- Create: `src/views/repository.test.ts`

`fromParts` exists per-subclass (see `ShelvesRepository.fromParts` in `src/shelves/repository.ts`). It uses an `Object.create(Prototype)` + writable cast to inject `storage` and `events` without going through DI. Mirror it.

- [ ] **Step 1: Write the failing test**

```typescript
// src/views/repository.test.ts
import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";

import { isNone, isSome } from "@/infrastructure/result/option";

import type { View, ViewId } from "./config";
import { ViewsRepository } from "./repository";
import type { ViewsEvents } from "./tokens";

function view(id: string, overrides: Partial<View> = {}): View {
  return {
    id: id as ViewId,
    name: "View " + id,
    icon: "calendar-days",
    defaultShelf: null,
    showInRibbon: false,
    blocks: [],
    ...overrides,
  };
}

function buildRepo(views: Record<string, View> = {}): ViewsRepository {
  return ViewsRepository.fromParts(views, createNanoEvents<ViewsEvents>());
}

describe("ViewsRepository", () => {
  describe("get", () => {
    it("returns None for an unknown view id", () => {
      const repo = buildRepo();
      expect(isNone(repo.get("missing" as ViewId))).toBe(true);
    });

    it("returns Some with the stored view when found", () => {
      const stored = view("abc");
      const repo = buildRepo({ abc: stored });
      const result = repo.get("abc" as ViewId);
      expect(isSome(result)).toBe(true);
      if (isSome(result)) expect(result.value).toEqual(stored);
    });
  });

  describe("find", () => {
    it("iterates all stored views", () => {
      const repo = buildRepo({ a: view("a"), b: view("b") });
      const ids = [...repo.find().entries()].map(([id]) => id);
      expect(ids).toEqual(["a", "b"]);
    });
  });
});
```

Read `src/infrastructure/result/option.ts` for the exact names of `isNone` / `isSome` / `Some.value` — adapt the import / accessor if they differ.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/views/repository.test.ts`
Expected: FAIL — module `./repository` not found.

- [ ] **Step 3: Implement `repository.ts`**

Model after `src/shelves/repository.ts`. The base repository expects `storage`, `events`, `unknownEntityError`, `invalidUpdateError`, `QueryConstructor`, `idKey`, `nameKey`. Per the shelves pattern, the repository owns single-entity write methods (`create`, `replace`) — the service is a thin orchestration layer above it.

```typescript
// src/views/repository.ts
import type { Emitter } from "nanoevents";

import { inject } from "@/infrastructure/di";
import { BaseRepository, RepositoryQuery } from "@/infrastructure/repository";
import { Err, Ok, type Result } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import type { View, ViewId } from "./config";
import { viewsCollection } from "./config";
import { InvalidViewNameError, UnknownViewError, type ViewsLifecycleError } from "./errors";
import type { ViewsEvents } from "./tokens";
import { ViewsEventsToken } from "./tokens";

class InvalidViewUpdateError extends Error {
  readonly kind = "invalid-view-update" as const;
  constructor(public readonly viewId: ViewId) {
    super(`Invalid update for view: ${viewId}`);
  }
}

export class ViewsRepository extends BaseRepository<
  ViewId,
  View,
  UnknownViewError,
  InvalidViewUpdateError,
  RepositoryQuery<ViewId, View>,
  ViewsEvents
> {
  protected idKey: keyof View = "id";
  protected nameKey: keyof View = "name";
  protected QueryConstructor = RepositoryQuery;
  protected storage = inject(SettingsService).recordOf(viewsCollection) as Record<ViewId, View>;
  protected events = inject(ViewsEventsToken);
  protected unknownEntityError = (id: ViewId) => new UnknownViewError(id);
  protected invalidUpdateError = (id: ViewId) => new InvalidViewUpdateError(id);

  static fromParts(storage: Record<string, View>, events: Emitter<ViewsEvents>): ViewsRepository {
    const repo = Object.create(ViewsRepository.prototype) as ViewsRepository;
    interface Mutable {
      idKey: keyof View;
      nameKey: keyof View;
      QueryConstructor: typeof RepositoryQuery;
      storage: Record<ViewId, View>;
      events: Emitter<ViewsEvents>;
      unknownEntityError: (id: ViewId) => UnknownViewError;
      invalidUpdateError: (id: ViewId) => InvalidViewUpdateError;
    }
    const w = repo as unknown as Mutable;
    w.idKey = "id";
    w.nameKey = "name";
    w.QueryConstructor = RepositoryQuery;
    w.storage = storage as Record<ViewId, View>;
    w.events = events;
    w.unknownEntityError = (id) => new UnknownViewError(id);
    w.invalidUpdateError = (id) => new InvalidViewUpdateError(id);
    return repo;
  }

  create(view: View): Result<ViewId, ViewsLifecycleError> {
    if (view.name.trim().length === 0) return new Err(new InvalidViewNameError(view.name));
    const result = this.addEntity(view.id, view);
    if (result.kind === "err") return new Err(new InvalidViewNameError(view.name));
    return new Ok(view.id);
  }
}
```

Imports match `src/shelves/repository.ts` verbatim (`@/infrastructure/repository`, `@/infrastructure/result`, `@/settings`). If any resolve differently in your environment, follow the shelves file's exact import lines.

The public `create(view)` validates the name and delegates to `BaseRepository.addEntity` (which emits `created` automatically). Updates / deletes / reads use the inherited `update(id, partial)`, `delete(id)`, `get(id)`, `find()`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/views/repository.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Run type check + lint**

Run: `npm run check:types && npm run check:lint`
Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add src/views/repository.ts src/views/repository.test.ts
git commit -m "feat(views): repository"
```

---

## Task 6: Service — CRUD + getBlockDefinition

**Files:**

- Create: `src/views/service.ts`
- Create: `src/views/service.test.ts`

This task lands `create`, `clone`, `update`, `delete`, `getBlockDefinition`. Block-mutation methods (`addBlock`, `removeBlock`, `moveBlockUp/Down`, `updateBlockConfig`) land in Task 7.

- [ ] **Step 1: Write the failing test**

```typescript
// src/views/service.test.ts
import { createNanoEvents } from "nanoevents";
import * as v from "valibot";
import { describe, expect, it, vi } from "vitest";

import { Container } from "@/infrastructure/di";
import { expectErr, expectOk } from "@/infrastructure/result/testing";

import type { View, ViewId } from "./config";
import { defineViewBlock, type ViewBlockDefinition } from "./define-view-block";
import { UnknownViewError } from "./errors";
import { ViewsRepository } from "./repository";
import { ViewsService } from "./service";
import { ViewBlockDefinitionToken, ViewsEventsToken, type ViewsEvents } from "./tokens";

const trivialBlock = defineViewBlock<{ x: number }>({
  key: "test-block",
  label: "Test Block",
  schema: v.object({ x: v.number() }),
  defaultConfig: { x: 0 },
  component: { setup: () => () => null },
});

function build(
  options: {
    seeds?: Record<string, View>;
    blocks?: readonly ViewBlockDefinition[];
  } = {},
): { service: ViewsService; events: ReturnType<typeof createNanoEvents<ViewsEvents>>; repo: ViewsRepository } {
  const events = createNanoEvents<ViewsEvents>();
  const repo = ViewsRepository.fromParts(options.seeds ?? {}, events);
  const c = new Container();
  c.register(ViewsRepository).useValue(repo);
  c.register(ViewsEventsToken).useValue(events);
  for (const block of options.blocks ?? []) {
    c.register(ViewBlockDefinitionToken).useValue(block);
  }
  c.register(ViewsService).useClass(ViewsService);
  return { service: c.resolve(ViewsService), events, repo };
}

describe("ViewsService", () => {
  describe("create", () => {
    it("returns Ok with the new view id", async () => {
      const { service } = build();
      const result = await service.create({ name: "Calendar" });
      expectOk(result);
      expect(typeof result.value).toBe("string");
    });

    it("persists the new view through the repository", async () => {
      const { service, repo } = build();
      const result = await service.create({ name: "Calendar" });
      expectOk(result);
      expect(repo.get(result.value).getOr(null)).not.toBeNull();
    });

    it("emits created with the new view id (via BaseRepository.addEntity)", async () => {
      const { service, events } = build();
      const listener = vi.fn();
      events.on("created", listener);
      const result = await service.create({ name: "Calendar" });
      expectOk(result);
      expect(listener).toHaveBeenCalledWith(result.value);
    });

    it("rejects an empty name", async () => {
      const { service } = build();
      const result = await service.create({ name: "" });
      expectErr(result);
      expect(result.error.kind).toBe("invalid-view-name");
    });
  });

  describe("clone", () => {
    it("returns UnknownViewError when source view does not exist", async () => {
      const { service } = build();
      const result = await service.clone("missing" as ViewId);
      expectErr(result);
      expect(result.error.kind).toBe("unknown-view");
    });

    it("returns Ok with a fresh view id", async () => {
      const { service, repo } = build();
      const created = await service.create({ name: "Source" });
      expectOk(created);
      const result = await service.clone(created.value);
      expectOk(result);
      expect(result.value).not.toBe(created.value);
      expect(repo.get(result.value).getOr(null)).not.toBeNull();
    });

    it("emits created on successful clone", async () => {
      const { service, events } = build();
      const created = await service.create({ name: "Source" });
      expectOk(created);
      const listener = vi.fn();
      events.on("created", listener);
      const result = await service.clone(created.value);
      expectOk(result);
      expect(listener).toHaveBeenCalledWith(result.value);
    });
  });

  describe("update", () => {
    it("returns UnknownViewError for missing view", async () => {
      const { service } = build();
      const result = await service.update("missing" as ViewId, { name: "X" });
      expectErr(result);
      expect(result.error.kind).toBe("unknown-view");
    });

    it("applies a partial patch", async () => {
      const { service, repo } = build();
      const created = await service.create({ name: "Old" });
      expectOk(created);
      const result = await service.update(created.value, { name: "New" });
      expectOk(result);
      expect(repo.get(created.value).getOr(null)?.name).toBe("New");
    });

    it("emits updated with the view id and the patch", async () => {
      const { service, events } = build();
      const created = await service.create({ name: "Old" });
      expectOk(created);
      const listener = vi.fn();
      events.on("updated", listener);
      const result = await service.update(created.value, { name: "New" });
      expectOk(result);
      expect(listener).toHaveBeenCalledWith(created.value, expect.objectContaining({ name: "New" }));
    });

    it("rejects an empty name in the patch", async () => {
      const { service } = build();
      const created = await service.create({ name: "Old" });
      expectOk(created);
      const result = await service.update(created.value, { name: "" });
      expectErr(result);
      expect(result.error.kind).toBe("invalid-view-name");
    });
  });

  describe("delete", () => {
    it("returns UnknownViewError when called twice", async () => {
      const { service } = build();
      const created = await service.create({ name: "X" });
      expectOk(created);
      const first = await service.delete(created.value);
      expectOk(first);
      const second = await service.delete(created.value);
      expectErr(second);
      expect(second.error.kind).toBe("unknown-view");
    });

    it("emits deleted with the view id", async () => {
      const { service, events } = build();
      const created = await service.create({ name: "X" });
      expectOk(created);
      const listener = vi.fn();
      events.on("deleted", listener);
      const result = await service.delete(created.value);
      expectOk(result);
      expect(listener).toHaveBeenCalledWith(created.value);
    });
  });

  describe("getBlockDefinition", () => {
    it("returns None for an unknown key", () => {
      const { service } = build();
      const result = service.getBlockDefinition("nope");
      expect(result.isNone()).toBe(true);
    });

    it("returns Some for a registered block", () => {
      const { service } = build({ blocks: [trivialBlock] });
      const result = service.getBlockDefinition("test-block");
      expect(result.isNone()).toBe(false);
    });
  });
});
```

Adapt `expectOk` / `expectErr` import path if `src/infrastructure/result/testing.ts` exports them differently — read that file first. Adapt `isNone()` / `.getOr()` / `.value` to the actual Option/Result API (`src/infrastructure/result/option.ts`, `src/infrastructure/result/result.ts`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/views/service.test.ts`
Expected: FAIL — module `./service` not found.

- [ ] **Step 3: Implement `service.ts`**

```typescript
// src/views/service.ts
import { inject } from "@/infrastructure/di";
import { attempt } from "@/infrastructure/result";
import { AsyncResult, Err, Option } from "@/infrastructure/result";

import type { BlockInstanceId, View, ViewId } from "./config";
import type { ViewBlockDefinition } from "./define-view-block";
import { InvalidViewNameError, UnknownViewError, type ViewsLifecycleError } from "./errors";
import { ViewsRepository } from "./repository";
import { ViewBlockDefinitionToken } from "./tokens";

export class ViewsService {
  readonly #repo = inject(ViewsRepository);
  readonly #blocks: ReadonlyMap<string, ViewBlockDefinition>;

  constructor() {
    const definitions = inject(ViewBlockDefinitionToken);
    const map = new Map<string, ViewBlockDefinition>();
    for (const def of definitions) map.set(def.key, def);
    this.#blocks = map;
  }

  create(input: {
    name: string;
    icon?: string;
    defaultShelf?: string | null;
    showInRibbon?: boolean;
  }): AsyncResult<ViewId, ViewsLifecycleError> {
    return attempt.in(this, async function* () {
      const id = crypto.randomUUID() as ViewId;
      const view: View = {
        id,
        name: input.name,
        icon: input.icon ?? "calendar-days",
        defaultShelf: input.defaultShelf ?? null,
        showInRibbon: input.showInRibbon ?? false,
        blocks: [],
      };
      return yield* this.#repo.create(view);
    });
  }

  clone(id: ViewId): AsyncResult<ViewId, UnknownViewError | ViewsLifecycleError> {
    return attempt.in(this, async function* () {
      const source = yield* Option.fromNullable(this.#repo.get(id).getOr(null)).okOrElse(
        () => new UnknownViewError(id),
      );
      const newId = crypto.randomUUID() as ViewId;
      const clone: View = {
        ...source,
        id: newId,
        name: `${source.name} (copy)`,
        blocks: source.blocks.map((b) => ({
          ...b,
          id: crypto.randomUUID() as BlockInstanceId,
          config: structuredClone(b.config),
        })),
      };
      return yield* this.#repo.create(clone);
    });
  }

  update(
    id: ViewId,
    patch: Partial<Pick<View, "name" | "icon" | "defaultShelf" | "showInRibbon">>,
  ): AsyncResult<void, UnknownViewError | ViewsLifecycleError> {
    return attempt.in(this, async function* () {
      if (patch.name !== undefined && patch.name.trim().length === 0) {
        yield* new Err<never, ViewsLifecycleError>(new InvalidViewNameError(patch.name));
      }
      yield* this.#repo
        .update(id, patch)
        .mapErr((cause) =>
          cause.kind === "unknown-view" ? cause : (new InvalidViewNameError(patch.name ?? "") as ViewsLifecycleError),
        );
    });
  }

  delete(id: ViewId): AsyncResult<void, UnknownViewError> {
    return attempt.in(this, async function* () {
      yield* this.#repo.delete(id);
    });
  }

  getBlockDefinition(key: string): Option<ViewBlockDefinition> {
    return Option.fromNullable(this.#blocks.get(key) ?? null);
  }
}
```

**No `inject(ViewsEventsToken)` in the service.** `BaseRepository.create` / `update` / `delete` (and the public `ViewsRepository.create`) emit `created` / `updated` / `deleted` through the shared events Emitter. The service never emits these itself; duplicating would double-fire listeners.

**Read `src/shelves/service.ts` for the exact `attempt.in` + `Option.fromNullable(...).okOrElse(...)` idiom and copy it verbatim.** If the project's Option API differs (e.g. `.getOr` vs `.unwrapOr`, or import path), correct the calls to match what `shelves/service.ts` actually does.

**Test signature note:** `RepositoryEvents.updated` is `(id, changes: Partial<View>) => void`. In the test, use `expect(listener).toHaveBeenCalledWith(viewId, expect.anything())` (or `expect(listener).toHaveBeenCalled()`) when asserting `updated`. The `created` and `deleted` signatures are still single-arg `(id) => void`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/views/service.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Run type check + lint**

Run: `npm run check:types && npm run check:lint`
Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add src/views/service.ts src/views/service.test.ts
git commit -m "feat(views): service CRUD + getBlockDefinition"
```

---

## Task 7: Service — block operations

**Files:**

- Modify: `src/views/service.ts` — add five methods
- Modify: `src/views/service.test.ts` — add nested describes for each new method

- [ ] **Step 1: Write the failing tests (append to `service.test.ts`)**

Add inside the top-level `describe("ViewsService", ...)`:

```typescript
describe("addBlock", () => {
  it("returns UnknownViewError for missing view", async () => {
    const { service } = build({ blocks: [trivialBlock] });
    const result = await service.addBlock("missing" as ViewId, "test-block");
    expectErr(result);
    expect(result.error.kind).toBe("unknown-view");
  });

  it("returns UnknownViewBlockKeyError for an unknown block key", async () => {
    const { service } = build();
    const created = await service.create({ name: "X" });
    expectOk(created);
    const result = await service.addBlock(created.value, "nope");
    expectErr(result);
    expect(result.error.kind).toBe("unknown-view-block-key");
  });

  it("returns Ok with a fresh BlockInstanceId on success", async () => {
    const { service } = build({ blocks: [trivialBlock] });
    const created = await service.create({ name: "X" });
    expectOk(created);
    const result = await service.addBlock(created.value, "test-block");
    expectOk(result);
    expect(typeof result.value).toBe("string");
  });

  it("appends to the view's blocks list with the block's defaultConfig", async () => {
    const { service, repo } = build({ blocks: [trivialBlock] });
    const created = await service.create({ name: "X" });
    expectOk(created);
    const added = await service.addBlock(created.value, "test-block");
    expectOk(added);
    const view = repo.get(created.value).getOr(null);
    expect(view?.blocks).toHaveLength(1);
    expect(view?.blocks[0]?.config).toEqual({ x: 0 });
  });

  it("emits updated with the view id and the new blocks list", async () => {
    const { service, events } = build({ blocks: [trivialBlock] });
    const created = await service.create({ name: "X" });
    expectOk(created);
    const listener = vi.fn();
    events.on("updated", listener);
    const added = await service.addBlock(created.value, "test-block");
    expectOk(added);
    expect(listener).toHaveBeenCalledWith(created.value, expect.objectContaining({ blocks: expect.any(Array) }));
  });
});

describe("removeBlock", () => {
  it("removes the matching instance", async () => {
    const { service, repo } = build({ blocks: [trivialBlock] });
    const created = await service.create({ name: "X" });
    expectOk(created);
    const added = await service.addBlock(created.value, "test-block");
    expectOk(added);
    await service.removeBlock(created.value, added.value);
    expect(repo.get(created.value).getOr(null)?.blocks).toEqual([]);
  });

  it("is a no-op when block id is not present", async () => {
    const { service, repo } = build({ blocks: [trivialBlock] });
    const created = await service.create({ name: "X" });
    expectOk(created);
    await service.removeBlock(created.value, "missing-id" as BlockInstanceId);
    expect(repo.get(created.value).getOr(null)?.blocks).toEqual([]);
  });
});

describe("moveBlockUp", () => {
  it("swaps with the previous block", async () => {
    const { service, repo } = build({ blocks: [trivialBlock] });
    const created = await service.create({ name: "X" });
    expectOk(created);
    const a = await service.addBlock(created.value, "test-block");
    const b = await service.addBlock(created.value, "test-block");
    expectOk(a);
    expectOk(b);
    await service.moveBlockUp(created.value, b.value);
    const ids =
      repo
        .get(created.value)
        .getOr(null)
        ?.blocks.map((x) => x.id) ?? [];
    expect(ids).toEqual([b.value, a.value]);
  });

  it("is an Ok no-op at index 0", async () => {
    const { service, repo } = build({ blocks: [trivialBlock] });
    const created = await service.create({ name: "X" });
    expectOk(created);
    const a = await service.addBlock(created.value, "test-block");
    expectOk(a);
    const result = await service.moveBlockUp(created.value, a.value);
    expectOk(result);
    expect(repo.get(created.value).getOr(null)?.blocks[0]?.id).toBe(a.value);
  });
});

describe("moveBlockDown", () => {
  it("swaps with the next block", async () => {
    const { service, repo } = build({ blocks: [trivialBlock] });
    const created = await service.create({ name: "X" });
    expectOk(created);
    const a = await service.addBlock(created.value, "test-block");
    const b = await service.addBlock(created.value, "test-block");
    expectOk(a);
    expectOk(b);
    await service.moveBlockDown(created.value, a.value);
    const ids =
      repo
        .get(created.value)
        .getOr(null)
        ?.blocks.map((x) => x.id) ?? [];
    expect(ids).toEqual([b.value, a.value]);
  });

  it("is an Ok no-op at the last index", async () => {
    const { service, repo } = build({ blocks: [trivialBlock] });
    const created = await service.create({ name: "X" });
    expectOk(created);
    const a = await service.addBlock(created.value, "test-block");
    expectOk(a);
    const result = await service.moveBlockDown(created.value, a.value);
    expectOk(result);
    expect(repo.get(created.value).getOr(null)?.blocks[0]?.id).toBe(a.value);
  });
});

describe("updateBlockConfig", () => {
  it("returns InvalidViewBlockConfigError when config fails block schema", async () => {
    const { service } = build({ blocks: [trivialBlock] });
    const created = await service.create({ name: "X" });
    expectOk(created);
    const added = await service.addBlock(created.value, "test-block");
    expectOk(added);
    const result = await service.updateBlockConfig(created.value, added.value, { x: "not a number" });
    expectErr(result);
    expect(result.error.kind).toBe("invalid-view-block-config");
  });

  it("persists the new config on success", async () => {
    const { service, repo } = build({ blocks: [trivialBlock] });
    const created = await service.create({ name: "X" });
    expectOk(created);
    const added = await service.addBlock(created.value, "test-block");
    expectOk(added);
    await service.updateBlockConfig(created.value, added.value, { x: 42 });
    expect(repo.get(created.value).getOr(null)?.blocks[0]?.config).toEqual({ x: 42 });
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npm run test -- src/views/service.test.ts`
Expected: existing tests pass; new ones FAIL (methods don't exist yet).

- [ ] **Step 3: Add the five methods to `service.ts`**

All block mutations go through `this.#repo.update(id, { blocks: nextBlocks })`. `BaseRepository.update` emits `updated` automatically.

Inside the `ViewsService` class:

```typescript
  addBlock(
    id: ViewId,
    key: string,
  ): AsyncResult<BlockInstanceId, UnknownViewError | UnknownViewBlockKeyError> {
    return attempt.in(this, async function* () {
      const current = yield* Option.fromNullable(this.#repo.get(id).getOr(null)).okOrElse(
        () => new UnknownViewError(id),
      );
      const definition = yield* Option.fromNullable(this.#blocks.get(key) ?? null).okOrElse(
        () => new UnknownViewBlockKeyError(key),
      );
      const blockId = crypto.randomUUID() as BlockInstanceId;
      const blocks = [
        ...current.blocks,
        { id: blockId, key, config: definition.defaultConfig as Record<string, unknown> },
      ];
      yield* this.#repo.update(id, { blocks });
      return blockId;
    });
  }

  removeBlock(id: ViewId, blockId: BlockInstanceId): AsyncResult<void, UnknownViewError> {
    return attempt.in(this, async function* () {
      const current = yield* Option.fromNullable(this.#repo.get(id).getOr(null)).okOrElse(
        () => new UnknownViewError(id),
      );
      const blocks = current.blocks.filter((b) => b.id !== blockId);
      if (blocks.length === current.blocks.length) return;
      yield* this.#repo.update(id, { blocks });
    });
  }

  moveBlockUp(id: ViewId, blockId: BlockInstanceId): AsyncResult<void, UnknownViewError> {
    return this.#move(id, blockId, -1);
  }

  moveBlockDown(id: ViewId, blockId: BlockInstanceId): AsyncResult<void, UnknownViewError> {
    return this.#move(id, blockId, +1);
  }

  updateBlockConfig(
    id: ViewId,
    blockId: BlockInstanceId,
    config: unknown,
  ): AsyncResult<void, UnknownViewError | InvalidViewBlockConfigError> {
    return attempt.in(this, async function* () {
      const current = yield* Option.fromNullable(this.#repo.get(id).getOr(null)).okOrElse(
        () => new UnknownViewError(id),
      );
      const target = current.blocks.find((b) => b.id === blockId);
      if (!target) return;
      const definition = this.#blocks.get(target.key);
      if (definition) {
        const parsed = v.safeParse(definition.schema, config);
        if (!parsed.success) {
          yield* new Err<never, InvalidViewBlockConfigError>(
            new InvalidViewBlockConfigError(id, blockId, target.key, parsed.issues),
          );
        }
      }
      const blocks = current.blocks.map((b) =>
        b.id === blockId ? { ...b, config: config as Record<string, unknown> } : b,
      );
      yield* this.#repo.update(id, { blocks });
    });
  }

  #move(id: ViewId, blockId: BlockInstanceId, delta: -1 | 1): AsyncResult<void, UnknownViewError> {
    return attempt.in(this, async function* () {
      const current = yield* Option.fromNullable(this.#repo.get(id).getOr(null)).okOrElse(
        () => new UnknownViewError(id),
      );
      const index = current.blocks.findIndex((b) => b.id === blockId);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= current.blocks.length) return;
      const blocks = [...current.blocks];
      const tmp = blocks[index]!;
      blocks[index] = blocks[target]!;
      blocks[target] = tmp;
      yield* this.#repo.update(id, { blocks });
    });
  }
```

Add the new imports at the top of `service.ts`: `import * as v from "valibot";` plus `InvalidViewBlockConfigError`, `UnknownViewBlockKeyError` from `./errors`.

**Test signature note (applies to all five new methods):** every successful block mutation goes through `BaseRepository.update`, which emits `("updated", viewId, changes: Partial<View>)`. Assertions on the `updated` listener must accommodate the second arg — use `expect(listener).toHaveBeenCalledWith(viewId, expect.objectContaining({ blocks: expect.any(Array) }))` or just `expect(listener).toHaveBeenCalled()`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/views/service.test.ts`
Expected: PASS, all tests (14 from Task 6 + 11 new).

- [ ] **Step 5: Run type check + lint**

Run: `npm run check:types && npm run check:lint`
Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add src/views/service.ts src/views/service.test.ts
git commit -m "feat(views): block operations on service"
```

---

## Task 8: View context

**Files:**

- Create: `src/views/view-context.ts`
- Create: `src/views/view-context.test.ts`

No DI-based context exists in the codebase yet. Use Vue's native `InjectionKey<T>` + `provide`/`inject` from `vue`. The composables call `provide`/`inject` directly — they must run inside Vue's `setup`/`onMounted` scope.

- [ ] **Step 1: Write the failing test**

```typescript
// src/views/view-context.test.ts
import { render } from "@testing-library/vue";
import { defineComponent, h, ref } from "vue";
import { describe, expect, it, vi } from "vitest";

import type { AnchorString } from "@/calendar/types";

import type { ViewId } from "./config";
import { provideViewContext, useViewContext, type ViewContext } from "./view-context";

function buildContext(overrides: Partial<ViewContext> = {}): ViewContext {
  return {
    viewId: "abc" as ViewId,
    viewName: ref("Calendar"),
    refDate: ref("2026-05-28" as AnchorString),
    shelf: ref(null),
    setRefDate: vi.fn(),
    setShelf: vi.fn(),
    ...overrides,
  };
}

describe("useViewContext", () => {
  it("throws when called outside a provider", () => {
    const Bare = defineComponent({
      setup() {
        useViewContext();
        return () => null;
      },
    });
    expect(() => render(Bare)).toThrow();
  });

  it("returns the provided context", () => {
    const ctx = buildContext();
    let received: ViewContext | null = null;
    const Child = defineComponent({
      setup() {
        received = useViewContext();
        return () => null;
      },
    });
    const Parent = defineComponent({
      setup() {
        provideViewContext(ctx);
        return () => h(Child);
      },
    });
    render(Parent);
    expect(received).toBe(ctx);
  });

  it("setRefDate forwards through the provided context", () => {
    const setRefDate = vi.fn();
    const ctx = buildContext({ setRefDate });
    const Child = defineComponent({
      setup() {
        useViewContext().setRefDate("2026-06-01" as AnchorString);
        return () => null;
      },
    });
    const Parent = defineComponent({
      setup() {
        provideViewContext(ctx);
        return () => h(Child);
      },
    });
    render(Parent);
    expect(setRefDate).toHaveBeenCalledWith("2026-06-01");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/views/view-context.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `view-context.ts`**

```typescript
// src/views/view-context.ts
import { inject as vueInject, provide as vueProvide, type InjectionKey, type Ref } from "vue";

import type { AnchorString } from "@/calendar/types";

import type { ViewId } from "./config";

export interface ViewContext {
  readonly viewId: ViewId;
  readonly viewName: Readonly<Ref<string>>;
  readonly refDate: Readonly<Ref<AnchorString>>;
  readonly shelf: Readonly<Ref<string | null>>;
  setRefDate(date: AnchorString): void;
  setShelf(shelf: string | null): void;
}

export const ViewContextKey: InjectionKey<ViewContext> = Symbol("views.ViewContext");

export function provideViewContext(ctx: ViewContext): void {
  vueProvide(ViewContextKey, ctx);
}

export function useViewContext(): ViewContext {
  const ctx = vueInject(ViewContextKey);
  if (!ctx) throw new Error("useViewContext called outside a provideViewContext scope");
  return ctx;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/views/view-context.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Run type check + lint**

Run: `npm run check:types && npm run check:lint`
Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add src/views/view-context.ts src/views/view-context.test.ts
git commit -m "feat(views): view-context composable"
```

---

## Task 9: Extend fake host with view registration tracking

**Files:**

- Modify: `src/infrastructure/host/internal/testing.ts`

ViewHostService tests need a fake `plugin.registerView`, `app.workspace.detachLeavesOfType`, and `app.workspace.requestSaveLayout`. Add tracking to `createFakeHost()`. Mirror the existing `commands` / `ribbonIcons` shape.

- [ ] **Step 1: Read existing structure**

Read `src/infrastructure/host/internal/testing.ts` end-to-end. Identify where `commands` and `ribbonIcons` are tracked; the view-registration tracking pattern mirrors that.

- [ ] **Step 2: Add view tracking to `FakeHost` and `createFakeHost`**

Extend the `FakeHost` interface:

```typescript
export interface FakeRegisteredView {
  readonly type: string;
  readonly factory: (leaf: WorkspaceLeaf) => ItemView;
}

export interface FakeWorkspaceState {
  // ... existing fields ...
  detachedTypes: string[];
  saveLayoutCalls: number;
}

export interface FakeHost {
  // ... existing fields ...
  readonly registeredViews: Map<string, FakeRegisteredView>;
}
```

Wire the plugin's `registerView` to populate `host.registeredViews` (and the plugin's `register` cleanup hook to remove it on unload). Wire `app.workspace.detachLeavesOfType(type)` to push `type` onto `workspace.detachedTypes`. Wire `app.workspace.requestSaveLayout()` to increment `workspace.saveLayoutCalls`.

The exact surface to mirror is in the existing `commands` / `ribbonIcons` setup higher in the file. Match its style.

- [ ] **Step 3: Run existing tests to confirm no regression**

Run: `npm run test`
Expected: PASS, all tests including existing host tests.

- [ ] **Step 4: Run type check + lint**

Run: `npm run check:types && npm run check:lint`
Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/host/internal/testing.ts
git commit -m "test(host): track registered views in createFakeHost"
```

---

## Task 10: View leaf

**Files:**

- Create: `src/views/view-leaf.ts`
- Create: `src/views/view-leaf.test.ts`

The leaf extends Obsidian's `ItemView`. It mounts one Vue app on `this.contentEl`, provides the DI injector and the `ViewContext`, and renders a root component that reads the view reactively from the repository.

- [ ] **Step 1: Sketch the root component inline**

The root component is small enough to live inline inside `view-leaf.ts` (not a separate `.vue` file). It:

- reads `useService(ViewsRepository).get(viewId)` reactively (use `computed` over the proxy result)
- renders a placeholder if the view is None
- otherwise `v-for`s blocks keyed by `block.id`, resolves each block via `useService(ViewsService).getBlockDefinition(block.key)`, validates `block.config` against the definition's schema, and renders the component on success (or nothing on miss / failure, with a `logger.warn`).

- [ ] **Step 2: Write the failing test**

```typescript
// src/views/view-leaf.test.ts
import { describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";
import { createFakeHost } from "@/infrastructure/host/internal/testing";
import { InternalObsidianAppToken, InternalPluginToken } from "@/infrastructure/host/internal/tokens";

import type { View, ViewId } from "./config";
import type { AnchorString } from "@/calendar/types";

import { JournalViewLeaf } from "./view-leaf";
import { ViewsRepository } from "./repository";
import { ViewsService } from "./service";
import { ViewBlockDefinitionToken, ViewsEventsToken } from "./tokens";
import { createNanoEvents } from "nanoevents";

function seedView(overrides: Partial<View> = {}): View {
  return {
    id: "abc" as ViewId,
    name: "Calendar",
    icon: "calendar-days",
    defaultShelf: null,
    showInRibbon: false,
    blocks: [],
    ...overrides,
  };
}

function build(view: View = seedView()) {
  const host = createFakeHost();
  const events = createNanoEvents();
  const repo = ViewsRepository.fromParts({ [view.id]: view }, events);
  const c = new Container();
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(InternalObsidianAppToken).useValue(host.app);
  c.register(ViewsEventsToken).useValue(events);
  c.register(ViewsRepository).useValue(repo);
  c.register(ViewsService).useClass(ViewsService);
  // The leaf is constructed manually in tests; pass leaf as the fake leaf,
  // viewId, and the container.
  const leaf = { containerEl: document.createElement("div") } as any;
  return { leaf: new JournalViewLeaf(leaf, view.id, c), host };
}

describe("JournalViewLeaf", () => {
  describe("getState", () => {
    it("returns the initial state object (refDate omitted -> today)", () => {
      const { leaf } = build();
      const state = leaf.getState() as { refDate?: AnchorString; shelf?: string | null };
      // refDate omitted means "today on next open"; assert it round-trips through setState
      expect(state.refDate).toBeUndefined();
    });
  });

  describe("setState", () => {
    it("stores refDate", async () => {
      const { leaf } = build();
      await leaf.setState({ refDate: "2026-06-01" }, {} as any);
      expect((leaf.getState() as any).refDate).toBe("2026-06-01");
    });

    it("calls workspace.requestSaveLayout when state changes", async () => {
      const { leaf, host } = build();
      const before = host.workspace.saveLayoutCalls;
      await leaf.setState({ refDate: "2026-06-01" }, {} as any);
      expect(host.workspace.saveLayoutCalls).toBe(before + 1);
    });
  });
});
```

Rendering tests for the root component (placeholder when view is None, silent skip of unknown block keys, etc.) require `await leaf.onOpen()` and inspecting `leaf.contentEl`. Add these as `describe("rendering", ...)` blocks following the same `build()` pattern.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test -- src/views/view-leaf.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `view-leaf.ts`**

```typescript
// src/views/view-leaf.ts
import { ItemView, type WorkspaceLeaf } from "obsidian";
import * as v from "valibot";
import { computed, createApp, defineComponent, h, type App as VueApp } from "vue";

import type { Container } from "@/infrastructure/di";
import { provideInjectorOnApp } from "@/infrastructure/di/vue";
import { LoggerFactoryToken } from "@/infrastructure/logger";

import type { AnchorString } from "@/calendar/types";

import type { ViewId } from "./config";
import { ViewsRepository } from "./repository";
import { ViewsService } from "./service";
import { provideViewContext, type ViewContext } from "./view-context";
import { InternalObsidianAppToken } from "@/infrastructure/host/internal/tokens";

interface JournalViewLeafState {
  refDate?: AnchorString;
  shelf?: string | null;
}

export class JournalViewLeaf extends ItemView {
  #state: JournalViewLeafState = {};
  #vueApp: VueApp | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly viewId: ViewId,
    private readonly container: Container,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return `journal-view:${this.viewId}`;
  }

  getDisplayText(): string {
    return this.container.resolve(ViewsRepository).get(this.viewId).getOr(null)?.name ?? "Journal view";
  }

  getIcon(): string {
    return this.container.resolve(ViewsRepository).get(this.viewId).getOr(null)?.icon ?? "calendar-days";
  }

  getState(): Record<string, unknown> {
    return { ...this.#state };
  }

  async setState(state: unknown, _result: unknown): Promise<void> {
    if (state && typeof state === "object") {
      this.#state = { ...(state as JournalViewLeafState) };
      this.container.resolve(InternalObsidianAppToken).workspace.requestSaveLayout();
    }
  }

  protected onOpen(): Promise<void> {
    const app = createApp(buildRootComponent(this.viewId, this.#state, this.container));
    provideInjectorOnApp(app, this.container);
    app.mount(this.contentEl);
    this.#vueApp = app;
    return Promise.resolve();
  }

  protected onClose(): Promise<void> {
    this.#vueApp?.unmount();
    this.#vueApp = null;
    this.contentEl.empty();
    return Promise.resolve();
  }
}

function buildRootComponent(viewId: ViewId, leafState: JournalViewLeafState, container: Container) {
  return defineComponent({
    setup() {
      const repo = container.resolve(ViewsRepository);
      const service = container.resolve(ViewsService);
      const logger = container.resolve(LoggerFactoryToken).named("view-leaf");

      const view = computed(() => repo.get(viewId).getOr(null));

      const ctx: ViewContext = {
        viewId,
        viewName: computed(() => view.value?.name ?? ""),
        refDate: computed(() => leafState.refDate ?? (todayAnchor() as AnchorString)),
        shelf: computed(() => leafState.shelf ?? view.value?.defaultShelf ?? null),
        setRefDate: (date) => {
          leafState.refDate = date;
        },
        setShelf: (shelf) => {
          leafState.shelf = shelf;
        },
      };
      provideViewContext(ctx);

      return () => {
        const current = view.value;
        if (!current) return h("div", { class: "journal-view-deleted" }, "View was deleted");
        return h(
          "div",
          { class: "journal-view-root" },
          current.blocks.map((block) => {
            const definition = service.getBlockDefinition(block.key).getOr(null);
            if (!definition) {
              logger.warn("unknown view-block key", { key: block.key, viewId });
              return null;
            }
            const parsed = v.safeParse(definition.schema, block.config);
            if (!parsed.success) {
              logger.warn("invalid view-block config", {
                key: block.key,
                viewId,
                blockId: block.id,
              });
              return null;
            }
            return h(definition.component, {
              key: block.id,
              instanceId: block.id,
              config: parsed.output,
            });
          }),
        );
      };
    },
  });
}

function todayAnchor(): string {
  // Read moment / dayjs / Date convention from src/calendar — for plain-string anchors use ISO date
  return new Date().toISOString().slice(0, 10);
}
```

If `todayAnchor` is wrong for the codebase (e.g. the project uses moment via `window.moment` or a calendar service for anchor strings), grep `src/calendar/` for the canonical "today as AnchorString" call and substitute it. **Do not invent.**

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- src/views/view-leaf.test.ts`
Expected: PASS.

- [ ] **Step 6: Run type check + lint**

Run: `npm run check:types && npm run check:lint`
Expected: both succeed.

- [ ] **Step 7: Commit**

```bash
git add src/views/view-leaf.ts src/views/view-leaf.test.ts
git commit -m "feat(views): JournalViewLeaf ItemView"
```

---

## Task 11: View host service

**Files:**

- Create: `src/views/view-host.ts`
- Create: `src/views/view-host.test.ts`

The host service wires Obsidian-side registration: `plugin.registerView`, `commandService.register({ ribbon: view.showInRibbon, ... })`, and the per-view `Disposer` that closes leaves + unregisters command/ribbon. It listens to `created` / `deleted` / `updated` events to keep registration in sync at runtime.

The original `plugin.registerView` cannot be revoked — Obsidian exposes no API. The disposer marks the viewType "stale" in an internal `Set<string>`; the `JournalViewLeaf` factory checks the stale set on construction and renders an empty leaf if hit. **Implementation note:** for foundation, the stale check happens in the factory closure passed to `registerView`, not on the `JournalViewLeaf` itself. Pattern:

```typescript
this.#plugin.registerView(viewType, (leaf) => {
  if (this.#stale.has(viewType)) return new EmptyStaleLeaf(leaf, viewType);
  return new JournalViewLeaf(leaf, viewId, this.#container);
});
```

where `EmptyStaleLeaf` is a 10-line `ItemView` subclass inside `view-host.ts` (no separate file) that logs and renders nothing.

- [ ] **Step 1: Write the failing test**

```typescript
// src/views/view-host.test.ts
import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";
import { CommandService } from "@/infrastructure/host/commands";
import { createFakeHost } from "@/infrastructure/host/internal/testing";
import { InternalObsidianAppToken, InternalPluginToken } from "@/infrastructure/host/internal/tokens";

import type { View, ViewId } from "./config";
import { ViewsRepository } from "./repository";
import { ViewHostService } from "./view-host";
import { ViewsEventsToken, type ViewsEvents } from "./tokens";

function seedView(id: string, overrides: Partial<View> = {}): View {
  return {
    id: id as ViewId,
    name: "View " + id,
    icon: "calendar-days",
    defaultShelf: null,
    showInRibbon: false,
    blocks: [],
    ...overrides,
  };
}

function build(seeds: Record<string, View> = {}) {
  const host = createFakeHost();
  const events = createNanoEvents<ViewsEvents>();
  const repo = ViewsRepository.fromParts(seeds, events);
  const c = new Container();
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(InternalObsidianAppToken).useValue(host.app);
  c.register(CommandService).useClass(CommandService);
  c.register(ViewsRepository).useValue(repo);
  c.register(ViewsEventsToken).useValue(events);
  c.register(ViewHostService).useClass(ViewHostService);
  return { service: c.resolve(ViewHostService), host, events };
}

describe("ViewHostService", () => {
  describe("registerAll", () => {
    it("registers an Obsidian view type per seeded view", () => {
      const { service, host } = build({ a: seedView("a"), b: seedView("b") });
      service.registerAll();
      expect([...host.registeredViews.keys()]).toEqual(["journal-view:a", "journal-view:b"]);
    });

    it("registers a command per seeded view", () => {
      const { service, host } = build({ a: seedView("a") });
      service.registerAll();
      expect(host.commands.has("journal:open-view:a")).toBe(true);
    });

    it("adds a ribbon icon only when showInRibbon is true", () => {
      const { service, host } = build({ a: seedView("a", { showInRibbon: true }), b: seedView("b") });
      service.registerAll();
      const ribbonIds = host.ribbonIcons.map((r) => r.id);
      expect(ribbonIds).toContain("journal-command:journal:open-view:a");
      expect(ribbonIds).not.toContain("journal-command:journal:open-view:b");
    });
  });

  describe("created event", () => {
    it("registers the new view type", () => {
      const { service, host, events } = build();
      service.registerAll();
      // Simulate the service inserting a new view directly into storage,
      // then emitting created — mirrors what ViewsService.create does.
      const repo = service as unknown as { ["#repo"]?: ViewsRepository };
      // The simpler path: use the events directly with a pre-seeded repo.
      // For this test, rebuild with the new view present then re-register.
      // Replace this scaffolding with the project's preferred pattern.
      // ...
    });
  });

  describe("updated event", () => {
    it("re-registers the command (label refresh) without registering the view type twice", () => {
      const { service, host, events } = build({ a: seedView("a", { name: "Old" }) });
      service.registerAll();
      const before = host.registeredViews.size;
      events.emit("updated", "a" as ViewId);
      expect(host.registeredViews.size).toBe(before);
      expect(host.commands.get("journal:open-view:a")?.name).toBe("Open Old");
    });
  });

  describe("deleted event", () => {
    it("detaches leaves of that view type", () => {
      const { service, host, events } = build({ a: seedView("a") });
      service.registerAll();
      events.emit("deleted", "a" as ViewId);
      expect(host.workspace.detachedTypes).toContain("journal-view:a");
    });

    it("removes the command", () => {
      const { service, host, events } = build({ a: seedView("a") });
      service.registerAll();
      events.emit("deleted", "a" as ViewId);
      expect(host.commands.has("journal:open-view:a")).toBe(false);
    });
  });

  describe("dispose", () => {
    it("detaches every registered view type", () => {
      const { service, host } = build({ a: seedView("a"), b: seedView("b") });
      service.registerAll();
      service.dispose();
      expect(host.workspace.detachedTypes).toContain("journal-view:a");
      expect(host.workspace.detachedTypes).toContain("journal-view:b");
    });
  });
});
```

The `created event` test as drafted has scaffolding gaps because the test fixture doesn't connect to `ViewsService`. In implementation, either: (a) connect a real `ViewsService` in the build helper and call `service.create` to drive the event, or (b) mutate `repo`'s storage directly and emit `created`. Pick whichever is cleaner once implementation exists; the principle being tested is "service registers a view when `created` fires."

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/views/view-host.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `view-host.ts`**

```typescript
// src/views/view-host.ts
import { ItemView, type Plugin, type WorkspaceLeaf } from "obsidian";

import { inject, type Container } from "@/infrastructure/di";
import { ContainerToken } from "@/infrastructure/di";
import { CommandService } from "@/infrastructure/host/commands";
import { InternalObsidianAppToken, InternalPluginToken } from "@/infrastructure/host/internal/tokens";
import { LoggerFactoryToken } from "@/infrastructure/logger";

import type { View, ViewId } from "./config";
import { ViewsRepository } from "./repository";
import { ViewsEventsToken } from "./tokens";
import { JournalViewLeaf } from "./view-leaf";

type Disposer = () => void;

export class ViewHostService {
  readonly #plugin = inject(InternalPluginToken);
  readonly #app = inject(InternalObsidianAppToken);
  readonly #commands = inject(CommandService);
  readonly #repo = inject(ViewsRepository);
  readonly #events = inject(ViewsEventsToken);
  readonly #container = inject(ContainerToken);
  readonly #logger = inject(LoggerFactoryToken).named("view-host");
  readonly #disposers = new Map<ViewId, Disposer>();
  readonly #stale = new Set<string>();

  constructor() {
    this.#events.on("created", (id) => this.register(id));
    this.#events.on("deleted", (id) => this.#disposeOne(id));
    this.#events.on("updated", (id) => this.#resync(id));
    this.#plugin.register(() => this.dispose());
    this.registerAll();
  }

  registerAll(): void {
    for (const [id] of this.#repo.find().entries()) this.register(id);
  }

  register(id: ViewId): void {
    if (this.#disposers.has(id)) return;
    const view = this.#repo.get(id).getOr(null);
    if (!view) {
      this.#logger.warn("register called for unknown view", { id });
      return;
    }
    const viewType = `journal-view:${id}`;
    this.#plugin.registerView(viewType, (leaf) => this.#buildLeaf(leaf, id, viewType));
    this.#commands.register({
      id: `journal:open-view:${id}`,
      name: `Open ${view.name}`,
      icon: view.icon,
      ribbon: view.showInRibbon,
      execute: () => void this.#open(id),
    });
    this.#disposers.set(id, () => this.#tearDown(id, viewType));
  }

  dispose(): void {
    for (const [, dispose] of this.#disposers) dispose();
    this.#disposers.clear();
  }

  #disposeOne(id: ViewId): void {
    const dispose = this.#disposers.get(id);
    if (!dispose) return;
    dispose();
    this.#disposers.delete(id);
  }

  #resync(id: ViewId): void {
    if (!this.#disposers.has(id)) return;
    const view = this.#repo.get(id).getOr(null);
    if (!view) return;
    this.#commands.unregister(`journal:open-view:${id}`);
    this.#commands.register({
      id: `journal:open-view:${id}`,
      name: `Open ${view.name}`,
      icon: view.icon,
      ribbon: view.showInRibbon,
      execute: () => void this.#open(id),
    });
  }

  #tearDown(id: ViewId, viewType: string): void {
    this.#app.workspace.detachLeavesOfType(viewType);
    this.#commands.unregister(`journal:open-view:${id}`);
    this.#stale.add(viewType);
  }

  #buildLeaf(leaf: WorkspaceLeaf, id: ViewId, viewType: string): ItemView {
    if (this.#stale.has(viewType)) return new StaleLeaf(leaf, viewType, this.#logger);
    return new JournalViewLeaf(leaf, id, this.#container);
  }

  async #open(id: ViewId): Promise<void> {
    const leaf = this.#app.workspace.getLeaf(true);
    await leaf.setViewState({ type: `journal-view:${id}`, active: true });
  }
}

class StaleLeaf extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private readonly viewType: string,
    private readonly logger: ReturnType<ReturnType<typeof inject<typeof LoggerFactoryToken>>["named"]>,
  ) {
    super(leaf);
  }
  getViewType(): string {
    return this.viewType;
  }
  getDisplayText(): string {
    return "Stale view";
  }
  protected onOpen(): Promise<void> {
    this.logger.warn("opened stale view", { viewType: this.viewType });
    return Promise.resolve();
  }
}
```

**Confirm `ContainerToken` exists** — read `src/infrastructure/di/` for whether the container exposes a self-binding token (so services can resolve children via DI). If it does not, change `inject(ContainerToken)` to a constructor parameter that the module wiring passes in explicitly, or read how `VueCodeBlockHost`'s constructor receives an injector (see `src/infrastructure/host/code-blocks/internal/code-block-service.ts`) and mirror that.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/views/view-host.test.ts`
Expected: PASS.

- [ ] **Step 5: Run type check + lint**

Run: `npm run check:types && npm run check:lint`
Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add src/views/view-host.ts src/views/view-host.test.ts
git commit -m "feat(views): ViewHostService"
```

---

## Task 12: Module, testing helpers, barrel, main.ts wiring

**Files:**

- Create: `src/views/module.ts`
- Create: `src/views/testing.ts`
- Create: `src/views/index.ts`
- Modify: `src/main.ts`

No tests for module shape (`[[feedback_no_wiring_tests]]`) or barrel exports.

- [ ] **Step 1: Implement `module.ts`**

```typescript
// src/views/module.ts
import { createNanoEvents } from "nanoevents";

import type { Module } from "@/infrastructure/di";

import { CollectionDefinitionToken } from "@/settings/schema";

import { viewsCollection } from "./config";
import { ViewsRepository } from "./repository";
import { ViewsService } from "./service";
import { ViewsEventsToken, type ViewsEvents } from "./tokens";
import { ViewHostService } from "./view-host";

export const viewsModule: Module = {
  register(c) {
    c.register(CollectionDefinitionToken).useValue(viewsCollection);
    c.register(ViewsEventsToken).useFactory(() => createNanoEvents<ViewsEvents>());
    c.register(ViewsRepository).useClass(ViewsRepository).eager();
    c.register(ViewsService).useClass(ViewsService).eager();
    c.register(ViewHostService).useClass(ViewHostService).eager();
  },
};
```

Confirm `Module` import path and `CollectionDefinitionToken` import path against `src/shelves/module.ts`.

- [ ] **Step 2: Implement `testing.ts`**

```typescript
// src/views/testing.ts
import { createNanoEvents, type Emitter } from "nanoevents";
import { render, type RenderResult } from "@testing-library/vue";
import { defineComponent, h, ref } from "vue";

import type { AnchorString } from "@/calendar/types";

import type { BlockInstanceId, View, ViewId } from "./config";
import type { ViewBlockDefinition } from "./define-view-block";
import { ViewsRepository } from "./repository";
import { provideViewContext, type ViewContext } from "./view-context";
import type { ViewsEvents } from "./tokens";

export function fakeViewsRepo(views: Record<string, View> = {}): ViewsRepository {
  return ViewsRepository.fromParts(views, createNanoEvents<ViewsEvents>());
}

export function provideViewContextStub(partial: Partial<ViewContext> = {}): ViewContext {
  return {
    viewId: "stub-view" as ViewId,
    viewName: ref("Stub"),
    refDate: ref("2026-01-01" as AnchorString),
    shelf: ref(null),
    setRefDate: () => undefined,
    setShelf: () => undefined,
    ...partial,
  };
}

export function mountViewBlock<TConfig>(
  definition: ViewBlockDefinition<TConfig>,
  props: { instanceId?: BlockInstanceId; config?: TConfig },
  ctx: Partial<ViewContext> = {},
): RenderResult {
  const Wrapper = defineComponent({
    setup() {
      provideViewContext(provideViewContextStub(ctx));
      return () =>
        h(definition.component, {
          instanceId: (props.instanceId ?? "stub-block") as BlockInstanceId,
          config: props.config ?? definition.defaultConfig,
        });
    },
  });
  return render(Wrapper);
}
```

- [ ] **Step 3: Implement `index.ts` (public barrel — no test helpers)**

```typescript
// src/views/index.ts
export type { BlockInstanceId, View, ViewBlockInstance, ViewId } from "./config";
export { viewSchema, viewsCollection } from "./config";
export { defineViewBlock } from "./define-view-block";
export type { ViewBlockDefinition, ViewBlockDefinitionInput, ViewBlockProps } from "./define-view-block";
export {
  DuplicateBlockInstanceIdError,
  InvalidViewBlockConfigError,
  InvalidViewNameError,
  UnknownViewBlockKeyError,
  UnknownViewError,
} from "./errors";
export type { ViewsLifecycleError } from "./errors";
export { ViewBlockDefinitionToken, ViewsEventsToken } from "./tokens";
export type { ViewsEvents } from "./tokens";
export { ViewsRepository } from "./repository";
export { ViewsService } from "./service";
export { ViewHostService } from "./view-host";
export { provideViewContext, useViewContext, ViewContextKey } from "./view-context";
export type { ViewContext } from "./view-context";
export { viewsModule } from "./module";
```

- [ ] **Step 4: Wire `viewsModule` in `src/main.ts`**

Read `src/main.ts` to find the `addModule(shelvesModule)` line. Add immediately after it:

```typescript
container.addModule(viewsModule);
```

with the corresponding `import { viewsModule } from "@/views";` near the other module imports.

- [ ] **Step 5: Full test + type + lint sweep**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: ALL pass.

- [ ] **Step 6: Smoke-test in Obsidian (manual)**

Build the plugin, load in a development vault, and verify:

- Plugin loads without console errors.
- No new commands appear in the command palette (views collection is empty — expected).
- No new ribbon icons.
- v2's existing calendar view is unaffected (legacy adapter has not landed yet — opening that view via the existing v2 ribbon should still work).

If smoke test fails, debug before committing.

- [ ] **Step 7: Commit**

```bash
git add src/views/module.ts src/views/testing.ts src/views/index.ts src/main.ts
git commit -m "feat(views): module wiring + testing helpers + barrel"
```

---

## Verification before declaring done

Run all three quality gates from a clean state:

```bash
npm run test && npm run check:types && npm run check:lint
```

Confirm all three pass. Per `[[feedback_quality_gates]]`, these are non-negotiable before the foundation is considered complete.

Confirm git log shows 11 atomic commits matching the task structure (Tasks 1–11 produce one commit each; Task 12 is one commit).

```bash
git log --oneline v3-ai ^v3-ai~12
```

Expected: 12 commits, all touching only `src/views/*`, `src/infrastructure/host/internal/testing.ts`, and `src/main.ts`.

---

## What this foundation does NOT do (deferred)

These are explicitly out of scope and land in subsequent PRs. Do not add them under the umbrella of this foundation:

- `defineToolbarItem` + `ToolbarItemDefinitionToken` (with the `toolbar` block).
- Any block implementation (`toolbar`, `month-calendar`, `custom-intervals`, `divider`).
- Settings UI: `ViewsDashboardBlock`, `ViewEditSubpage`, `BlocksList`, modals, `defineSubpage` definition.
- v2 → v3 migration (`uiSettings.calendarShelf`, `calendarViewSettings.*`, per-journal `calendarViewBlock`).
- `intervalBlock` field on `JournalConfig` (with the `custom-intervals` block).
- Default seeded Calendar view + `defaultCalendarViewId` slice key.
- Legacy `CALENDAR_VIEW_TYPE` adapter.
- Deletion of `src/_old-code/calendar-view/`.
- Per-block per-leaf state (`perBlock` field).
- `ViewsLifecycleFlowError` / `toFlowError` wrapper.
- Internationalised error messages (errors carry English strings — `[[feedback_date_strings_from_moment]]` does not apply; user-facing i18n lands with the UI).
