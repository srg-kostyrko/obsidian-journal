# v3 Settings UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace v2's hard-coded settings UI with a pluggable shell — feature modules contribute dashboard blocks and routed subpages through DI multi-tokens; the shell renders the dashboard and routes the subpage stack.

**Architecture:** New code lives under `src/settings/ui/`. The settings module gains two new multi-tokens (`DashboardBlockToken`, `SubpageToken`) and three new error classes, plus a `SettingsUiService` (compose-time resolution + nav stack) and a `PluginSettingTabAdapter` that mounts `Shell.vue` into Obsidian's `PluginSettingTab`. A small infrastructure change makes empty multi-tokens resolve to `[]` instead of throwing, which lets us delete the sentinel slice/collection/migration bindings the settings module currently carries.

**Tech Stack:** TypeScript, Vue 3 + reactivity, valibot (already used in the data layer), vitest, `@testing-library/vue` + `@testing-library/user-event`, `ts-pattern`, the project's DI container (`@/infrastructure/di`).

---

## Spec

See [`docs/superpowers/specs/2026-05-14-v3-settings-ui-design.md`](../specs/2026-05-14-v3-settings-ui-design.md). Notable cross-references:

- Existing data-layer spec: [`2026-05-14-v3-settings-design.md`](../specs/2026-05-14-v3-settings-design.md)
- Modal define/use pattern (the template this plan mirrors): `src/infrastructure/host/modals/`
- DI container resolution: `src/infrastructure/di/container.ts`
- Vue/DI integration: `src/infrastructure/di/vue.ts`

## File Structure

```
src/infrastructure/di/
  container.ts                   MODIFIED — multi-token empty → []
  container.test.ts              MODIFIED — flip the empty-multi assertion

src/settings/
  module.ts                      MODIFIED — drop sentinels; register UI service + adapter
  testing.ts                     MODIFIED — drop sentinels; add createSettingsUiService(...)
  tokens.ts                      MODIFIED — add DashboardBlockToken, SubpageToken
  errors.ts                      MODIFIED — add Duplicate*KeyError, UnregisteredSubpageError
  index.ts                       MODIFIED — re-export the new public API
  ui/
    schema.ts                    CREATED — defineDashboardBlock, defineSubpage, SubpageNav
    settings-ui-service.ts       CREATED — SettingsUiService
    settings-ui-service.test.ts  CREATED — service behaviour
    plugin-setting-tab.ts        CREATED — PluginSettingTabAdapter
    DashboardBlock.vue           CREATED — wrapper around a contributed block component
    Shell.vue                    CREATED — dashboard scroller + active-subpage outlet
    Shell.test.ts                CREATED — testing-library/vue render tests
```

Tests live next to implementation; the public barrel is `src/settings/index.ts`.

---

## Per-task quality gates

After every task that touches code, run:

```bash
npm run test
npm run check:types
npm run check:lint
```

All three must pass before committing. If any one fails, fix the cause; do not skip or `eslint-disable` (per the `feedback_no_lint_silencing` memory).

---

## Task 1: Multi-token resolves empty to `[]` (TDD)

**Files:**

- Modify: `src/infrastructure/di/container.test.ts:129-134`
- Modify: `src/infrastructure/di/container.ts:55-57`

- [ ] **Step 1: Flip the failing test**

Open `src/infrastructure/di/container.test.ts`. Find the existing block (around line 129):

```ts
it("throws TokenNotRegisteredError when a multi-token has no bindings", () => {
  const c = new Container();
  const t = createMultiToken<string>("Plugins");
  expect(() => c.resolve(t)).toThrow(TokenNotRegisteredError);
});
```

Replace it with:

```ts
it("returns an empty array when a multi-token has no bindings", () => {
  const c = new Container();
  const t = createMultiToken<string>("Plugins");
  expect(c.resolve(t)).toEqual([]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/infrastructure/di/container.test.ts -t "returns an empty array when a multi-token has no bindings"
```

Expected: FAIL with `TokenNotRegisteredError` being thrown instead of returning `[]`.

- [ ] **Step 3: Change the container behaviour**

Open `src/infrastructure/di/container.ts`. Replace the block around lines 52-62:

```ts
  resolve(token: AnyTokenLike): unknown {
    this.#ensureNotDisposed();
    const entries = this.#bindings.lookup(token);
    if (!entries || entries.length === 0) {
      throw new TokenNotRegisteredError(token, currentChain());
    }
    return match(tokenKind(token))
      .with("single", () => this.#resolveSingle(token, entries[0]))
      .with("multi", () => entries.map((stored) => this.#resolveSingle(token, stored)))
      .exhaustive();
  }
```

With:

```ts
  resolve(token: AnyTokenLike): unknown {
    this.#ensureNotDisposed();
    const entries = this.#bindings.lookup(token);
    const kind = tokenKind(token);
    if (!entries || entries.length === 0) {
      if (kind === "multi") return [];
      throw new TokenNotRegisteredError(token, currentChain());
    }
    return match(kind)
      .with("single", () => this.#resolveSingle(token, entries[0]))
      .with("multi", () => entries.map((stored) => this.#resolveSingle(token, stored)))
      .exhaustive();
  }
```

- [ ] **Step 4: Run the focused test to verify it passes**

```bash
npx vitest run src/infrastructure/di/container.test.ts -t "returns an empty array when a multi-token has no bindings"
```

Expected: PASS.

- [ ] **Step 5: Run the full DI test file to confirm no regressions**

```bash
npx vitest run src/infrastructure/di
```

Expected: all DI tests pass.

- [ ] **Step 6: Run per-task quality gates and commit**

```bash
npm run test && npm run check:types && npm run check:lint
git add src/infrastructure/di/container.ts src/infrastructure/di/container.test.ts
git commit -m "feat(di): multi-tokens resolve to an empty array when unbound"
```

---

## Task 2: Drop sentinels from settings module + testing helper

**Why:** Now that multi-tokens accept zero bindings, the `coreSlice` / `coreCollection` / `identityMigration` sentinels in `src/settings/module.ts` and the matching scaffolding in `src/settings/testing.ts` are dead weight. Removing them is the cleanup half of Task 1.

**Files:**

- Modify: `src/settings/module.ts`
- Modify: `src/settings/testing.ts`

- [ ] **Step 1: Run the settings test suite to capture a green baseline**

```bash
npx vitest run src/settings
```

Expected: all settings tests pass.

- [ ] **Step 2: Trim `settings/module.ts` to just `SettingsService`**

Replace the entire contents of `src/settings/module.ts` with:

```ts
import type { Module } from "@/infrastructure/di";

import { SettingsService } from "./settings-service";

export const settingsModule: Module = {
  register(c) {
    c.register(SettingsService).useClass(SettingsService).eager();
  },
};
```

- [ ] **Step 3: Remove sentinel branches from `settings/testing.ts`**

Open `src/settings/testing.ts`. Replace the body (everything below the `export interface CreatedSettingsService { ... }` block down to the end of `createSettingsService`) so the helper no longer falls back to sentinel slices/collections/migration and no longer imports `defineSlice` / `defineCollection` / `valibot`. The full new file:

```ts
import { Container } from "@/infrastructure/di";
import { PluginData } from "@/infrastructure/host";
import { FakePluginData } from "@/infrastructure/host/testing";
import { LoggerFactory, LoggerFactoryToken, LogSinkMultiToken } from "@/infrastructure/logger";
import { MemorySink } from "@/infrastructure/logger/testing";

import { SettingsService } from "./settings-service";
import { CollectionDefinitionToken, MigrationToken, SliceDefinitionToken } from "./tokens";

import type { AnyCollectionDefinition, AnySliceDefinition, Migration } from "./schema";

export { FakePluginData } from "@/infrastructure/host/testing";

export interface CreateSettingsServiceOptions {
  raw?: unknown;
  slices?: readonly AnySliceDefinition[];
  collections?: readonly AnyCollectionDefinition[];
  migrations?: readonly Migration[];
}

export interface CreatedSettingsService {
  readonly service: SettingsService;
  readonly data: FakePluginData;
  readonly container: Container;
}

export function createSettingsService(options: CreateSettingsServiceOptions = {}): CreatedSettingsService {
  const data = new FakePluginData(options.raw);
  const c = new Container();
  c.register(PluginData).useValue(data as unknown as PluginData);
  c.register(LogSinkMultiToken).useValue(new MemorySink());
  c.register(LoggerFactoryToken).useClass(LoggerFactory);
  for (const s of options.slices ?? []) c.register(SliceDefinitionToken).useValue(s);
  for (const col of options.collections ?? []) c.register(CollectionDefinitionToken).useValue(col);
  for (const m of options.migrations ?? []) c.register(MigrationToken).useValue(m);
  c.register(SettingsService).useClass(SettingsService);
  return { service: c.resolve(SettingsService), data, container: c };
}
```

- [ ] **Step 4: Remove the in-test sentinel migration from `settings-service.test.ts`**

The existing `build(...)` helper in `src/settings/settings-service.test.ts` (lines 27-55) registers an identity migration sentinel that the original DI behaviour required. With the new resolution rules that sentinel is no longer needed and should be removed so the test exercises the real "no migrations bound" path. Replace the body:

```ts
for (const s of options.slices ?? [calendarSlice]) {
  c.register(SliceDefinitionToken).useValue(s as never);
}
for (const col of options.collections ?? [journalCollection]) {
  c.register(CollectionDefinitionToken).useValue(col as never);
}
// The migration multi-token must always have at least one binding to satisfy DI.
// The identity entry (from === to) is filtered out by runMigrations.
const identity: Migration = { fromVersion: -1, toVersion: -1, migrate: (r) => r };
c.register(MigrationToken).useValue(identity);
for (const m of options.migrations ?? []) {
  c.register(MigrationToken).useValue(m);
}
```

with:

```ts
for (const s of options.slices ?? [calendarSlice]) {
  c.register(SliceDefinitionToken).useValue(s as never);
}
for (const col of options.collections ?? [journalCollection]) {
  c.register(CollectionDefinitionToken).useValue(col as never);
}
for (const m of options.migrations ?? []) {
  c.register(MigrationToken).useValue(m);
}
```

The `Migration` import at the top of the file is still used by the `migrations?: readonly Migration[]` typing on the `options` parameter, so leave it alone.

- [ ] **Step 5: Run the settings test suite**

```bash
npx vitest run src/settings
```

Expected: all settings tests still pass (the sentinel was load-bearing for DI only; runtime behaviour is unchanged because `SettingsService` already iterates slice/collection/migration arrays).

- [ ] **Step 6: Run per-task quality gates and commit**

```bash
npm run test && npm run check:types && npm run check:lint
git add src/settings/module.ts src/settings/testing.ts src/settings/settings-service.test.ts
git commit -m "refactor(settings): drop multi-token sentinels now that empty resolves to []"
```

---

## Task 3: Add new error classes

**Files:**

- Modify: `src/settings/errors.ts`

- [ ] **Step 1: Append the three new errors**

Add the following classes to the end of `src/settings/errors.ts`:

```ts
export class DuplicateBlockKeyError extends SettingsError {
  readonly kind = "duplicate-block-key" as const;
  constructor(readonly key: string) {
    super(`Settings dashboard block key conflict: "${key}" is bound more than once`);
    this.name = "DuplicateBlockKeyError";
  }
}

export class DuplicateSubpageKeyError extends SettingsError {
  readonly kind = "duplicate-subpage-key" as const;
  constructor(readonly key: string) {
    super(`Settings subpage key conflict: "${key}" is bound more than once`);
    this.name = "DuplicateSubpageKeyError";
  }
}

export class UnregisteredSubpageError extends SettingsError {
  readonly kind = "unregistered-subpage" as const;
  constructor(readonly key: string) {
    super(`Settings subpage "${key}" was not registered`);
    this.name = "UnregisteredSubpageError";
  }
}
```

- [ ] **Step 2: Run per-task quality gates and commit**

```bash
npm run test && npm run check:types && npm run check:lint
git add src/settings/errors.ts
git commit -m "feat(settings): add duplicate-block / duplicate-subpage / unregistered-subpage errors"
```

(No tests on these classes — they are trivial subclasses per the `feedback_no_trivial_tests` memory; they will be exercised through `SettingsUiService` tests.)

---

## Task 4: `schema.ts` — value builders and types

**Files:**

- Create: `src/settings/ui/schema.ts`

- [ ] **Step 1: Create the new schema file**

Write `src/settings/ui/schema.ts` with the following contents:

```ts
import type { Component } from "vue";

export interface DashboardBlock {
  readonly key: string;
  readonly component: Component;
  readonly order: number;
}

export function defineDashboardBlock(block: DashboardBlock): DashboardBlock {
  return block;
}

export interface Subpage<TProps> {
  readonly key: string;
  readonly component: Component;
  readonly __props: (witness: never) => TProps;
}

export type AnySubpage = Subpage<unknown>;

export interface SubpageDefinitionInput {
  readonly key: string;
  readonly component: Component;
}

export function defineSubpage<TProps = void>(input: SubpageDefinitionInput): Subpage<TProps> {
  return {
    key: input.key,
    component: input.component,
    __props: (witness: never): TProps => witness,
  };
}

export interface SubpageNav {
  back(): void;
  push<TProps>(subpage: Subpage<TProps>, props: TProps): void;
}
```

The phantom `__props` witness mirrors `defineModal`'s `__result` (see `src/infrastructure/host/modals/define-modal.ts:31`) — it gives type-safe props without paying any runtime cost.

- [ ] **Step 2: Run per-task quality gates and commit**

```bash
npm run test && npm run check:types && npm run check:lint
git add src/settings/ui/schema.ts
git commit -m "feat(settings): add defineDashboardBlock / defineSubpage value builders"
```

(No tests on the value builders — trivial constructors per the `feedback_no_trivial_tests` memory.)

---

## Task 5: Token bindings

**Files:**

- Modify: `src/settings/tokens.ts`

- [ ] **Step 1: Add the two new multi-tokens**

Replace `src/settings/tokens.ts` with:

```ts
import { createMultiToken } from "@/infrastructure/di";

import type { DashboardBlock, AnySubpage } from "./ui/schema";

import type { AnyCollectionDefinition, AnySliceDefinition, Migration } from "./schema";

export const SliceDefinitionToken = createMultiToken<AnySliceDefinition>("settings.slice");
export const CollectionDefinitionToken = createMultiToken<AnyCollectionDefinition>("settings.collection");
export const MigrationToken = createMultiToken<Migration>("settings.migration");
export const DashboardBlockToken = createMultiToken<DashboardBlock>("settings.DashboardBlock");
export const SubpageToken = createMultiToken<AnySubpage>("settings.Subpage");
```

- [ ] **Step 2: Run per-task quality gates and commit**

```bash
npm run test && npm run check:types && npm run check:lint
git add src/settings/tokens.ts
git commit -m "feat(settings): add DashboardBlockToken and SubpageToken"
```

---

## Task 6: `SettingsUiService` — failing test for sorted blocks

**Files:**

- Create: `src/settings/ui/settings-ui-service.test.ts`

This task lays the test scaffold and asserts the first behaviour. The implementation file does not yet exist; subsequent tasks fill it in.

- [ ] **Step 1: Write the test file with a single failing case**

Create `src/settings/ui/settings-ui-service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";

import { Container } from "@/infrastructure/di";

import { DashboardBlockToken } from "../tokens";

import { defineDashboardBlock } from "./schema";
import { SettingsUiService } from "./settings-ui-service";

import type { DashboardBlock } from "./schema";

const Stub = defineComponent({ render: () => null });

function block(key: string, order: number): DashboardBlock {
  return defineDashboardBlock({ key, component: Stub, order });
}

function build(options: { blocks?: readonly DashboardBlock[] } = {}): SettingsUiService {
  const c = new Container();
  for (const b of options.blocks ?? []) c.register(DashboardBlockToken).useValue(b);
  // Subpages stay empty here; multi-tokens resolve to [] after Task 1.
  c.register(SettingsUiService).useClass(SettingsUiService);
  return c.resolve(SettingsUiService);
}

describe("SettingsUiService", () => {
  describe("construction", () => {
    it("exposes blocks sorted by order regardless of binding order", () => {
      const a = block("a", 30);
      const b = block("b", 10);
      const c = block("c", 20);

      const service = build({ blocks: [a, b, c] });

      expect(service.blocks.map((entry) => entry.key)).toEqual(["b", "c", "a"]);
    });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails for the right reason**

```bash
npx vitest run src/settings/ui/settings-ui-service.test.ts
```

Expected: FAIL — `Cannot find module './settings-ui-service'` (the implementation does not exist yet).

---

## Task 7: `SettingsUiService` — implement sorted blocks

**Files:**

- Create: `src/settings/ui/settings-ui-service.ts`

- [ ] **Step 1: Write the minimal implementation**

Create `src/settings/ui/settings-ui-service.ts`:

```ts
import { computed, ref, type ComputedRef } from "vue";

import { inject } from "@/infrastructure/di";

import { DashboardBlockToken, SubpageToken } from "../tokens";

import type { AnySubpage, DashboardBlock, Subpage } from "./schema";

export interface SubpageFrame {
  readonly subpage: AnySubpage;
  readonly props: unknown;
}

export class SettingsUiService {
  readonly #blocks: readonly DashboardBlock[];
  readonly #subpageKeys: ReadonlySet<string>;
  readonly #stack = ref<readonly SubpageFrame[]>([]);
  readonly #current: ComputedRef<SubpageFrame | null>;

  constructor() {
    const blocks = [...inject(DashboardBlockToken)];
    blocks.sort((a, b) => a.order - b.order);
    this.#blocks = blocks;

    const subpages = inject(SubpageToken);
    this.#subpageKeys = new Set(subpages.map((s) => s.key));

    this.#current = computed(() => {
      const stack = this.#stack.value;
      return stack.length > 0 ? stack[stack.length - 1] : null;
    });
  }

  get blocks(): readonly DashboardBlock[] {
    return this.#blocks;
  }

  get current(): ComputedRef<SubpageFrame | null> {
    return this.#current;
  }

  push<TProps>(_subpage: Subpage<TProps>, _props: TProps): void {
    throw new Error("not implemented");
  }

  pop(): void {
    throw new Error("not implemented");
  }

  reset(): void {
    throw new Error("not implemented");
  }
}
```

The unfinished `push` / `pop` / `reset` will be filled in by Tasks 9-11 (each starts with its own failing test).

- [ ] **Step 2: Run the test and confirm it passes**

```bash
npx vitest run src/settings/ui/settings-ui-service.test.ts -t "exposes blocks sorted by order"
```

Expected: PASS.

- [ ] **Step 3: Run per-task quality gates and commit**

```bash
npm run test && npm run check:types && npm run check:lint
git add src/settings/ui/settings-ui-service.ts src/settings/ui/settings-ui-service.test.ts
git commit -m "feat(settings): SettingsUiService resolves blocks sorted by order"
```

---

## Task 8: Duplicate-key detection at construction

**Files:**

- Modify: `src/settings/ui/settings-ui-service.test.ts`
- Modify: `src/settings/ui/settings-ui-service.ts`

- [ ] **Step 1: Add failing tests for duplicate keys**

In `src/settings/ui/settings-ui-service.test.ts`, extend the imports:

```ts
import { defineSubpage } from "./schema";
import { DuplicateBlockKeyError, DuplicateSubpageKeyError } from "../errors";
```

…and the helpers section (right under the existing `block` helper):

```ts
function subpage(key: string): Subpage<void> {
  return defineSubpage({ key, component: Stub });
}
```

Also extend the imports to bring in the `Subpage` type:

```ts
import type { DashboardBlock, Subpage } from "./schema";
```

Then add this to `build`'s options and registration loop:

```ts
function build(
  options: {
    blocks?: readonly DashboardBlock[];
    subpages?: readonly Subpage<unknown>[];
  } = {},
): SettingsUiService {
  const c = new Container();
  for (const b of options.blocks ?? []) c.register(DashboardBlockToken).useValue(b);
  for (const s of options.subpages ?? []) c.register(SubpageToken).useValue(s);
  c.register(SettingsUiService).useClass(SettingsUiService);
  return c.resolve(SettingsUiService);
}
```

Add two new test cases under the existing `describe("construction", ...)`:

```ts
it("throws DuplicateBlockKeyError when two blocks share a key", () => {
  const a = block("dup", 10);
  const b = block("dup", 20);
  expect(() => build({ blocks: [a, b] })).toThrow(DuplicateBlockKeyError);
});

it("throws DuplicateSubpageKeyError when two subpages share a key", () => {
  const a = subpage("dup");
  const b = subpage("dup");
  expect(() => build({ subpages: [a, b] as readonly Subpage<unknown>[] })).toThrow(DuplicateSubpageKeyError);
});
```

- [ ] **Step 2: Run the new tests and confirm they fail**

```bash
npx vitest run src/settings/ui/settings-ui-service.test.ts -t "DuplicateBlockKeyError"
npx vitest run src/settings/ui/settings-ui-service.test.ts -t "DuplicateSubpageKeyError"
```

Expected: both FAIL — no duplicate check exists yet.

- [ ] **Step 3: Implement duplicate-key detection**

In `src/settings/ui/settings-ui-service.ts`, replace the constructor with:

```ts
  constructor() {
    const blocks = [...inject(DashboardBlockToken)];
    const blockKeys = new Set<string>();
    for (const b of blocks) {
      if (blockKeys.has(b.key)) throw new DuplicateBlockKeyError(b.key);
      blockKeys.add(b.key);
    }
    blocks.sort((a, b) => a.order - b.order);
    this.#blocks = blocks;

    const subpages = inject(SubpageToken);
    const subpageKeys = new Set<string>();
    for (const s of subpages) {
      if (subpageKeys.has(s.key)) throw new DuplicateSubpageKeyError(s.key);
      subpageKeys.add(s.key);
    }
    this.#subpageKeys = subpageKeys;

    this.#current = computed(() => {
      const stack = this.#stack.value;
      return stack.length > 0 ? stack[stack.length - 1] : null;
    });
  }
```

Add the imports to the same file:

```ts
import { DuplicateBlockKeyError, DuplicateSubpageKeyError } from "../errors";
```

- [ ] **Step 4: Run the focused tests and confirm they pass**

```bash
npx vitest run src/settings/ui/settings-ui-service.test.ts
```

Expected: all three construction tests pass.

- [ ] **Step 5: Run per-task quality gates and commit**

```bash
npm run test && npm run check:types && npm run check:lint
git add src/settings/ui/settings-ui-service.ts src/settings/ui/settings-ui-service.test.ts
git commit -m "feat(settings): detect duplicate block / subpage keys at construction"
```

---

## Task 9: `push` — failing test and implementation

**Files:**

- Modify: `src/settings/ui/settings-ui-service.test.ts`
- Modify: `src/settings/ui/settings-ui-service.ts`

- [ ] **Step 1: Add failing tests for `push`**

In `src/settings/ui/settings-ui-service.test.ts`, add a new nested describe after `describe("construction", ...)`:

```ts
describe("push", () => {
  it("advances current to the new frame", () => {
    const edit = subpage("journal-edit");
    const service = build({ subpages: [edit] as readonly Subpage<unknown>[] });

    expect(service.current.value).toBeNull();
    service.push(edit, undefined);
    expect(service.current.value).toEqual({ subpage: edit, props: undefined });
  });

  it("throws UnregisteredSubpageError when the subpage was never bound", () => {
    const stray = subpage("stray");
    const service = build({ subpages: [] });

    expect(() => service.push(stray, undefined)).toThrow(UnregisteredSubpageError);
  });
});
```

Add to the existing imports:

```ts
import { UnregisteredSubpageError } from "../errors";
```

- [ ] **Step 2: Run the new tests and confirm they fail**

```bash
npx vitest run src/settings/ui/settings-ui-service.test.ts -t "push"
```

Expected: FAIL — `push` currently throws `"not implemented"`.

- [ ] **Step 3: Implement `push`**

In `src/settings/ui/settings-ui-service.ts`, replace the `push` method with:

```ts
  push<TProps>(subpage: Subpage<TProps>, props: TProps): void {
    if (!this.#subpageKeys.has(subpage.key)) throw new UnregisteredSubpageError(subpage.key);
    this.#stack.value = [...this.#stack.value, { subpage: subpage as AnySubpage, props }];
  }
```

…and add the import:

```ts
import { UnregisteredSubpageError } from "../errors";
```

- [ ] **Step 4: Run the focused tests and confirm they pass**

```bash
npx vitest run src/settings/ui/settings-ui-service.test.ts -t "push"
```

Expected: PASS.

- [ ] **Step 5: Run per-task quality gates and commit**

```bash
npm run test && npm run check:types && npm run check:lint
git add src/settings/ui/settings-ui-service.ts src/settings/ui/settings-ui-service.test.ts
git commit -m "feat(settings): SettingsUiService.push validates and advances the stack"
```

---

## Task 10: `pop` — failing tests and implementation

**Files:**

- Modify: `src/settings/ui/settings-ui-service.test.ts`
- Modify: `src/settings/ui/settings-ui-service.ts`

- [ ] **Step 1: Add failing tests**

Append a new describe block:

```ts
describe("pop", () => {
  it("removes the top frame", () => {
    const edit = subpage("journal-edit");
    const service = build({ subpages: [edit] as readonly Subpage<unknown>[] });
    service.push(edit, undefined);

    service.pop();

    expect(service.current.value).toBeNull();
  });

  it("returns to the prior frame when used on a nested stack", () => {
    const edit = subpage("edit");
    const shelf = subpage("shelf");
    const service = build({ subpages: [edit, shelf] as readonly Subpage<unknown>[] });
    service.push(edit, undefined);
    service.push(shelf, undefined);

    service.pop();

    expect(service.current.value).toEqual({ subpage: edit, props: undefined });
  });

  it("is a no-op when the stack is empty", () => {
    const service = build({});

    expect(() => service.pop()).not.toThrow();
    expect(service.current.value).toBeNull();
  });
});
```

- [ ] **Step 2: Run the new tests and confirm they fail**

```bash
npx vitest run src/settings/ui/settings-ui-service.test.ts -t "pop"
```

Expected: FAIL — `pop` currently throws `"not implemented"`.

- [ ] **Step 3: Implement `pop`**

Replace the `pop` method:

```ts
  pop(): void {
    const stack = this.#stack.value;
    if (stack.length === 0) return;
    this.#stack.value = stack.slice(0, -1);
  }
```

- [ ] **Step 4: Run the focused tests and confirm they pass**

```bash
npx vitest run src/settings/ui/settings-ui-service.test.ts -t "pop"
```

Expected: PASS.

- [ ] **Step 5: Run per-task quality gates and commit**

```bash
npm run test && npm run check:types && npm run check:lint
git add src/settings/ui/settings-ui-service.ts src/settings/ui/settings-ui-service.test.ts
git commit -m "feat(settings): SettingsUiService.pop drops the top frame (no-op when empty)"
```

---

## Task 11: `reset` — failing test and implementation

**Files:**

- Modify: `src/settings/ui/settings-ui-service.test.ts`
- Modify: `src/settings/ui/settings-ui-service.ts`

- [ ] **Step 1: Add a failing test**

```ts
describe("reset", () => {
  it("clears the stack to dashboard", () => {
    const edit = subpage("edit");
    const shelf = subpage("shelf");
    const service = build({ subpages: [edit, shelf] as readonly Subpage<unknown>[] });
    service.push(edit, undefined);
    service.push(shelf, undefined);

    service.reset();

    expect(service.current.value).toBeNull();
  });
});
```

- [ ] **Step 2: Run the new test and confirm it fails**

```bash
npx vitest run src/settings/ui/settings-ui-service.test.ts -t "reset"
```

Expected: FAIL.

- [ ] **Step 3: Implement `reset`**

Replace the `reset` method:

```ts
  reset(): void {
    this.#stack.value = [];
  }
```

- [ ] **Step 4: Run the focused test and confirm it passes**

```bash
npx vitest run src/settings/ui/settings-ui-service.test.ts -t "reset"
```

Expected: PASS.

- [ ] **Step 5: Run per-task quality gates and commit**

```bash
npm run test && npm run check:types && npm run check:lint
git add src/settings/ui/settings-ui-service.ts src/settings/ui/settings-ui-service.test.ts
git commit -m "feat(settings): SettingsUiService.reset clears the stack"
```

---

## Task 12: `DashboardBlock.vue` — block wrapper

**Files:**

- Create: `src/settings/ui/DashboardBlock.vue`

This is a thin container. No tests of its own — the visible behaviour is covered through `Shell.test.ts`.

- [ ] **Step 1: Create the file**

```vue
<script setup lang="ts">
import type { Component } from "vue";

defineProps<{ component: Component }>();
</script>

<template>
  <section class="journal-settings-block">
    <component :is="component" />
  </section>
</template>
```

- [ ] **Step 2: Run per-task quality gates and commit**

```bash
npm run test && npm run check:types && npm run check:lint
git add src/settings/ui/DashboardBlock.vue
git commit -m "feat(settings): add DashboardBlock wrapper component"
```

---

## Task 13: `Shell.vue` — failing test (dashboard rendering)

**Files:**

- Create: `src/settings/ui/Shell.test.ts`

- [ ] **Step 1: Write the test file**

Create `src/settings/ui/Shell.test.ts`:

```ts
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { Container, InjectorToken, provideInjector } from "@/infrastructure/di";

import { DashboardBlockToken, SubpageToken } from "../tokens";

import { defineDashboardBlock, defineSubpage } from "./schema";
import Shell from "./Shell.vue";
import { SettingsUiService } from "./settings-ui-service";

import type { DashboardBlock, Subpage } from "./schema";

afterEach(() => cleanup());

function blockComponent(label: string) {
  return defineComponent({ render: () => h("div", { "data-testid": `block-${label}` }, label) });
}

function block(key: string, order: number, label = key): DashboardBlock {
  return defineDashboardBlock({ key, component: blockComponent(label), order });
}

function buildHarness(
  options: {
    blocks?: readonly DashboardBlock[];
    subpages?: readonly Subpage<unknown>[];
  } = {},
) {
  const c = new Container();
  for (const b of options.blocks ?? []) c.register(DashboardBlockToken).useValue(b);
  for (const s of options.subpages ?? []) c.register(SubpageToken).useValue(s);
  c.register(SettingsUiService).useClass(SettingsUiService);
  const injector = c.resolve(InjectorToken);
  const service = c.resolve(SettingsUiService);
  const Harness = defineComponent({
    setup() {
      provideInjector(injector);
      return () => h(Shell);
    },
  });
  return { Harness, service };
}

describe("Shell", () => {
  describe("dashboard view", () => {
    it("renders blocks in order", () => {
      const { Harness } = buildHarness({
        blocks: [block("c", 30, "third"), block("a", 10, "first"), block("b", 20, "second")],
      });

      render(Harness);

      const labels = screen.getAllByTestId(/^block-/).map((node) => node.textContent);
      expect(labels).toEqual(["first", "second", "third"]);
    });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails for the right reason**

```bash
npx vitest run src/settings/ui/Shell.test.ts
```

Expected: FAIL — `Cannot find module './Shell.vue'`.

---

## Task 14: `Shell.vue` — implement dashboard + subpage outlet

**Files:**

- Create: `src/settings/ui/Shell.vue`

- [ ] **Step 1: Create the file**

```vue
<script setup lang="ts">
import { computed } from "vue";

import { useService } from "@/infrastructure/di";

import DashboardBlock from "./DashboardBlock.vue";
import { SettingsUiService } from "./settings-ui-service";

const ui = useService(SettingsUiService);
const current = computed(() => ui.current.value);
const nav = {
  back: () => ui.pop(),
  push: ui.push.bind(ui),
};
</script>

<template>
  <div v-if="current === null" class="journal-settings-dashboard">
    <DashboardBlock v-for="block in ui.blocks" :key="block.key" :component="block.component" />
  </div>
  <component v-else :is="current.subpage.component" v-bind="current.props as Record<string, unknown>" :nav="nav" />
</template>
```

When `current` is exposed as a top-level computed via `<script setup>`, Vue auto-unwraps it in the template — that's why the template can read `current === null` and `current.subpage.component` directly without `.value`. The `ui.current.value` indirection in setup is necessary because `ui.current` is a property on an object, which Vue does not auto-unwrap when accessed.

- [ ] **Step 2: Run the dashboard test and confirm it passes**

```bash
npx vitest run src/settings/ui/Shell.test.ts -t "renders blocks in order"
```

Expected: PASS.

- [ ] **Step 3: Run per-task quality gates and commit**

```bash
npm run test && npm run check:types && npm run check:lint
git add src/settings/ui/Shell.vue src/settings/ui/Shell.test.ts
git commit -m "feat(settings): Shell renders contributed blocks in order"
```

---

## Task 15: `Shell` subpage routing — failing test

**Files:**

- Modify: `src/settings/ui/Shell.test.ts`

- [ ] **Step 1: Add a failing test for active-subpage rendering**

Add this nested describe to `Shell.test.ts` (alongside the existing `dashboard view` describe):

```ts
describe("subpage routing", () => {
  it("mounts the active subpage with its props and hides the dashboard", async () => {
    const EditPage = defineComponent({
      props: { name: { type: String, required: true } },
      render() {
        return h("div", { "data-testid": "edit-page" }, `editing ${this.name}`);
      },
    });
    const editSubpage = defineSubpage<{ name: string }>({ key: "edit", component: EditPage });
    const dashboardBlock = block("only", 0, "dashboard-tile");

    const { Harness, service } = buildHarness({
      blocks: [dashboardBlock],
      subpages: [editSubpage] as readonly Subpage<unknown>[],
    });

    render(Harness);
    service.push(editSubpage, { name: "Daily" });
    await Promise.resolve(); // let Vue flush

    expect(screen.queryByTestId("block-dashboard-tile")).toBeNull();
    expect(screen.getByTestId("edit-page").textContent).toBe("editing Daily");
  });

  it("invoking nav.back returns to the previous frame", async () => {
    const back = { current: null as null | (() => void) };
    const First = defineComponent({
      props: { nav: { type: Object, required: true } },
      render() {
        back.current = (this.nav as { back: () => void }).back;
        return h("div", { "data-testid": "first" }, "first");
      },
    });
    const Second = defineComponent({
      props: { nav: { type: Object, required: true } },
      render() {
        back.current = (this.nav as { back: () => void }).back;
        return h("div", { "data-testid": "second" }, "second");
      },
    });
    const firstSub = defineSubpage({ key: "first", component: First });
    const secondSub = defineSubpage({ key: "second", component: Second });

    const { Harness, service } = buildHarness({
      subpages: [firstSub, secondSub] as readonly Subpage<unknown>[],
    });

    render(Harness);
    service.push(firstSub, undefined);
    await Promise.resolve();
    service.push(secondSub, undefined);
    await Promise.resolve();
    expect(screen.getByTestId("second")).toBeTruthy();

    back.current?.();
    await Promise.resolve();

    expect(screen.queryByTestId("second")).toBeNull();
    expect(screen.getByTestId("first")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the new tests and confirm they pass**

```bash
npx vitest run src/settings/ui/Shell.test.ts -t "subpage routing"
```

Expected: PASS — Task 14's implementation already covers subpage rendering and `nav.back`. The test additions here are coverage, written after the fact deliberately because the routing is a single Vue template branch; splitting Tasks 13/14 into more steps would not have been net-useful TDD. If either case fails, fix the Shell template (likely the `v-bind="props"` cast or the `nav` prop wiring) before continuing.

- [ ] **Step 3: Run per-task quality gates and commit**

```bash
npm run test && npm run check:types && npm run check:lint
git add src/settings/ui/Shell.test.ts
git commit -m "test(settings): cover Shell subpage routing and back navigation"
```

---

## Task 16: `PluginSettingTabAdapter`

**Files:**

- Modify: `src/infrastructure/host/index.ts`
- Create: `src/settings/ui/plugin-setting-tab.ts`

**Background:** the host barrel (`src/infrastructure/host/index.ts`) currently does not re-export `InternalObsidianAppToken` or `InternalPluginToken` — those tokens are defined in `src/infrastructure/host/internal/tokens.ts` and used internally by `NotesService` / `WorkspaceService`. The adapter needs both, so we add them to the public barrel first.

- [ ] **Step 1: Re-export the internal tokens from the host barrel**

Append to `src/infrastructure/host/index.ts`:

```ts
export { InternalObsidianAppToken, InternalPluginToken } from "./internal/tokens";
```

- [ ] **Step 2: Create the adapter**

Write `src/settings/ui/plugin-setting-tab.ts`:

```ts
import { PluginSettingTab } from "obsidian";
import { type App as VueApp, createApp } from "vue";

import { inject, InjectorToken, provideInjectorOnApp } from "@/infrastructure/di";
import { InternalObsidianAppToken, InternalPluginToken } from "@/infrastructure/host";

import Shell from "./Shell.vue";
import { SettingsUiService } from "./settings-ui-service";

export class PluginSettingTabAdapter extends PluginSettingTab {
  readonly #injector = inject(InjectorToken);
  readonly #ui = inject(SettingsUiService);
  #vueApp: VueApp | undefined;

  constructor() {
    const plugin = inject(InternalPluginToken);
    super(inject(InternalObsidianAppToken), plugin);
    plugin.addSettingTab(this);
  }

  display(): void {
    const app = createApp(Shell);
    provideInjectorOnApp(app, this.#injector);
    this.#vueApp = app;
    app.mount(this.containerEl);
  }

  hide(): void {
    this.#vueApp?.unmount();
    this.#vueApp = undefined;
    this.containerEl.empty();
    this.#ui.reset();
  }

  [Symbol.dispose](): void {
    this.#vueApp?.unmount();
    this.#vueApp = undefined;
  }
}
```

- [ ] **Step 3: Run per-task quality gates and commit**

```bash
npm run test && npm run check:types && npm run check:lint
git add src/infrastructure/host/index.ts src/settings/ui/plugin-setting-tab.ts
git commit -m "feat(settings): add PluginSettingTabAdapter that mounts the Vue shell"
```

(No test on the adapter — it is wiring per the `feedback_no_wiring_tests` memory; its behaviour is covered through `Shell.test.ts` and `SettingsUiService` tests.)

---

## Task 17: Wire UI shell into `settingsModule`

**Files:**

- Modify: `src/settings/module.ts`

- [ ] **Step 1: Register `SettingsUiService` and the adapter**

Replace `src/settings/module.ts` with:

```ts
import type { Module } from "@/infrastructure/di";

import { SettingsService } from "./settings-service";
import { PluginSettingTabAdapter } from "./ui/plugin-setting-tab";
import { SettingsUiService } from "./ui/settings-ui-service";

export const settingsModule: Module = {
  register(c) {
    c.register(SettingsService).useClass(SettingsService).eager();
    c.register(SettingsUiService).useClass(SettingsUiService);
    c.register(PluginSettingTabAdapter).useClass(PluginSettingTabAdapter).eager();
  },
};
```

`SettingsUiService` is Container-lifetime (default) so the adapter and Vue components share one instance. The adapter is eager so it self-registers with Obsidian during `autoLoad()`.

- [ ] **Step 2: Run per-task quality gates and commit**

```bash
npm run test && npm run check:types && npm run check:lint
git add src/settings/module.ts
git commit -m "feat(settings): register SettingsUiService and the plugin setting tab adapter"
```

---

## Task 18: Public barrel + test helper

**Files:**

- Modify: `src/settings/index.ts`
- Modify: `src/settings/testing.ts`

- [ ] **Step 1: Extend the public barrel**

Append to `src/settings/index.ts`:

```ts
export { defineDashboardBlock, defineSubpage, type DashboardBlock, type Subpage, type SubpageNav } from "./ui/schema";
export { SettingsUiService } from "./ui/settings-ui-service";
export { DashboardBlockToken, SubpageToken } from "./tokens";
export { DuplicateBlockKeyError, DuplicateSubpageKeyError, UnregisteredSubpageError } from "./errors";
```

(Existing exports stay as they are.)

Note: `PluginSettingTabAdapter` and `DashboardBlock.vue` are intentionally not re-exported (internal-only per the design spec).

- [ ] **Step 2: Add `createSettingsUiService` to `testing.ts`**

Edit `src/settings/testing.ts`. Add these imports to the existing import block (the `SubpageToken` import joins the existing `CollectionDefinitionToken, MigrationToken, SliceDefinitionToken` line):

```ts
import {
  CollectionDefinitionToken,
  DashboardBlockToken,
  MigrationToken,
  SliceDefinitionToken,
  SubpageToken,
} from "./tokens";
import { SettingsUiService } from "./ui/settings-ui-service";

import type { AnySubpage, DashboardBlock } from "./ui/schema";
```

(Adjust the `./tokens` import in place — the existing line already imports three names; add `DashboardBlockToken` and `SubpageToken` alongside them. Add the `SettingsUiService` and type-imports as new lines if they don't already exist.)

Then append at the bottom of the file:

```ts
export interface CreateSettingsUiServiceOptions {
  blocks?: readonly DashboardBlock[];
  subpages?: readonly AnySubpage[];
}

export interface CreatedSettingsUiService {
  readonly service: SettingsUiService;
  readonly container: Container;
}

export function createSettingsUiService(options: CreateSettingsUiServiceOptions = {}): CreatedSettingsUiService {
  const c = new Container();
  for (const b of options.blocks ?? []) c.register(DashboardBlockToken).useValue(b);
  for (const s of options.subpages ?? []) c.register(SubpageToken).useValue(s);
  c.register(SettingsUiService).useClass(SettingsUiService);
  return { service: c.resolve(SettingsUiService), container: c };
}
```

(No test on `createSettingsUiService` itself per the `feedback_no_mock_fake_tests` memory; it will be exercised through feature-module integration tests when those land.)

- [ ] **Step 3: Run the full suite to make sure nothing imports broke**

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Step 4: Run per-task quality gates and commit**

```bash
npm run test && npm run check:types && npm run check:lint
git add src/settings/index.ts src/settings/testing.ts
git commit -m "feat(settings): export pluggable UI surface from the public barrel"
```

---

## Task 19: End-to-end smoke — verify the plugin still boots

**Files:** none modified; this is a verification step.

- [ ] **Step 1: Run all gates**

```bash
npm run test
npm run check:types
npm run check:lint
```

Expected: all green.

- [ ] **Step 2: Build to verify Vite is happy with the .vue files**

```bash
npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Manual smoke (optional but recommended)**

Drop the built plugin into the `test-vault` and confirm:

- The plugin loads without a "failed to load settings" notice.
- Opening Settings → Journal renders the (empty) dashboard with no errors in the devtools console.

Once a feature module starts contributing blocks/subpages (in a follow-up plan for the journals/calendar/etc. modules), the dashboard fills out.

---

## Self-Review (run before handing off to executor)

**Spec coverage:**

- §_Module layout_ → Tasks 4, 6-15, 16, 17. ✓
- §_Responsibilities_ → Tasks 4 (`schema.ts`), 5 (`tokens.ts`), 6-11 (`settings-ui-service.ts`), 12 (`DashboardBlock.vue`), 13-15 (`Shell.vue`), 16 (`plugin-setting-tab.ts`). ✓
- §_How a feature module contributes_ → public API is in place via Tasks 4, 5, 18 (barrel). ✓
- §_Public API_ → Tasks 4, 7-11, 18. ✓
- §_Bootstrap lifecycle_ → Tasks 16 (adapter), 17 (module wiring). ✓
- §_Re-entry safety_ → Task 10 (pop on empty no-op), Task 14 (template handles reactive `current`). ✓
- §_Errors_ → Task 3. Behaviours covered by Tasks 8, 9. ✓
- §_Testing_ → Tasks 6-11 (service), 13-15 (shell). `createSettingsUiService` in Task 18. ✓
- §_Infrastructure delta_ → Tasks 1 (DI change), 2 (sentinel cleanup). ✓

**Placeholder scan:** No "TBD" / "implement later" / "add error handling" entries. All code blocks are complete and self-contained.

**Type consistency:** `DashboardBlock`, `Subpage<TProps>`, `AnySubpage`, `SubpageNav`, `SettingsUiService.blocks`, `.current`, `.push`, `.pop`, `.reset`, `SubpageFrame` are used consistently across Tasks 4-18. `PluginSettingTabAdapter` extends Obsidian's `PluginSettingTab` with `display()` / `hide()` overrides plus a `Symbol.dispose` for container teardown — names match the design spec.

**Note on ordering of Task 15:** Tests for subpage routing land _after_ the implementation that satisfies them, which deviates from pure TDD. Justified because Task 14's template change is a single conditional branch and Task 13's failing-test pattern already drove the file into existence; splitting routing into a third red→green cycle would be ceremony with no design impact. If the executor prefers, they can swap Task 15's order (write the failing tests first, then re-run Task 14) — the resulting code is identical.
