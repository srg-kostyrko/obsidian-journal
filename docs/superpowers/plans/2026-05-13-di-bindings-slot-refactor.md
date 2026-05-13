# DI Bindings + Slot Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `Container`/`Scope`'s leaky `ContainerInternal` (`__getStored`, `__resolveContainerLifetime`) and the `Scope → Container` type cycle with two explicit concepts — `Bindings` (registry) and `Slot` (cache cell) — without changing public API.

**Architecture:** Extract `Bindings` (owns `Map<Token, StoredEntry[]>`) and `Slot` (cache cell with `getOrCreate`/`dispose`) into a new `bindings.ts`. `StoredEntry` becomes a class holding `entry`, a permanent `slot` (used iff `lifetime === Container`), and `registrationIndex`. `Container` and `Scope` both depend on `Bindings`; `Scope` no longer imports `Container`. Each does an explicit `ts-pattern` dispatch on `Lifetime`.

**Tech Stack:** TypeScript, vitest, ts-pattern. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-13-di-bindings-slot-refactor-design.md`

---

## Pre-flight

- [ ] **Step 0.1: Confirm starting test status**

Run: `npm run test -- src/infrastructure/di`
Expected: All DI tests pass.

- [ ] **Step 0.2: Confirm starting type/lint status**

Run: `npm run check:types && npm run check:lint`
Expected: Both pass clean.

---

## Task 1: Add `bindings.ts` with `Slot`, `StoredEntry`, `Bindings`, dispose helpers

**Why now:** Introduce the new abstractions in isolation. Nothing imports them yet, so existing tests are unaffected. We deliberately do not add unit tests for `Bindings` or `Slot`: per the project's "don't test the wiring" and "no tests for mocks/fakes" memories, they are infrastructure for `Container`/`Scope`, whose existing integration tests cover their behavior.

**Files:**

- Create: `src/infrastructure/di/bindings.ts`

- [ ] **Step 1.1: Create `src/infrastructure/di/bindings.ts`**

Write the file exactly as below:

```ts
import { match } from "ts-pattern";

import { DuplicateRegistrationError } from "./errors";
import { type Resolver, withResolutionContext } from "./inject";
import { Lifetime } from "./lifetime";
import { type AnyTokenLike, tokenKind } from "./token";

import type { RegistrationEntry } from "./registration";

export class Slot {
  #value: unknown;
  #has = false;

  get has(): boolean {
    return this.#has;
  }

  get value(): unknown {
    return this.#value;
  }

  getOrCreate(resolver: Resolver, token: AnyTokenLike, factory: () => unknown): unknown {
    if (this.#has) return this.#value;
    this.#value = withResolutionContext(resolver, token, factory);
    this.#has = true;
    return this.#value;
  }

  async dispose(): Promise<void> {
    if (!this.#has) return;
    const value = this.#value;
    this.#value = undefined;
    this.#has = false;
    await disposeInstance(value);
  }
}

export class StoredEntry {
  entry: RegistrationEntry<unknown>;
  readonly slot = new Slot();
  readonly registrationIndex: number;

  constructor(entry: RegistrationEntry<unknown>, registrationIndex: number) {
    this.entry = entry;
    this.registrationIndex = registrationIndex;
  }
}

export interface BindingsRow {
  readonly token: AnyTokenLike;
  readonly stored: StoredEntry;
}

export class Bindings {
  readonly #map = new Map<AnyTokenLike, StoredEntry[]>();
  #counter = 0;

  commit(token: AnyTokenLike, entry: RegistrationEntry<unknown>): StoredEntry {
    const stored = new StoredEntry(entry, this.#counter++);
    const list = this.#map.get(token) ?? [];
    match(tokenKind(token))
      .with("single", () => {
        if (list.length > 0) throw new DuplicateRegistrationError(token);
        this.#map.set(token, [stored]);
      })
      .with("multi", () => {
        list.push(stored);
        this.#map.set(token, list);
      })
      .exhaustive();
    return stored;
  }

  lookup(token: AnyTokenLike): readonly StoredEntry[] | undefined {
    return this.#map.get(token);
  }

  all(): readonly BindingsRow[] {
    const rows: BindingsRow[] = [];
    for (const [token, list] of this.#map) {
      for (const stored of list) rows.push({ token, stored });
    }
    return rows;
  }

  clear(): void {
    this.#map.clear();
  }
}

export async function disposeSlots(slots: readonly Slot[]): Promise<unknown[]> {
  const errors: unknown[] = [];
  for (const slot of slots) {
    try {
      await slot.dispose();
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

async function disposeInstance(instance: unknown): Promise<void> {
  if (instance == null || (typeof instance !== "object" && typeof instance !== "function")) return;
  const asyncDispose = (instance as { [Symbol.asyncDispose]?: () => Promise<void> })[Symbol.asyncDispose];
  if (typeof asyncDispose === "function") {
    await asyncDispose.call(instance);
    return;
  }
  const syncDispose = (instance as { [Symbol.dispose]?: () => void })[Symbol.dispose];
  if (typeof syncDispose === "function") {
    syncDispose.call(instance);
  }
}
```

- [ ] **Step 1.2: Verify type/lint pass**

Run: `npm run check:types && npm run check:lint`
Expected: Both pass. The new file is unused; tsc/eslint should not flag it.

- [ ] **Step 1.3: Verify tests still pass**

Run: `npm run test -- src/infrastructure/di`
Expected: All DI tests still pass (nothing imports `bindings.ts` yet).

- [ ] **Step 1.4: Commit**

```bash
git add src/infrastructure/di/bindings.ts
git commit -m "feat(di): add Bindings, StoredEntry, Slot building blocks"
```

---

## Task 2: Migrate `container.ts` to back its registry with `Bindings`

**Why now:** Move Container's storage from the inline `Map` to the new `Bindings` while preserving the public-but-internal `ContainerInternal` shape so `Scope` keeps working. After this step, Container internally uses `Slot` for caching; the `__` methods are still present as thin adapters and are removed in Task 4.

**Files:**

- Modify: `src/infrastructure/di/container.ts`

- [ ] **Step 2.1: Audit external `StoredEntry` imports**

Run: `grep -rn "StoredEntry" src/ 2>/dev/null`
Expected: Only `src/infrastructure/di/container.ts` (declaration + uses) and `src/infrastructure/di/scope.ts` (type import). If any other file imports `StoredEntry`, stop and investigate — the spec assumes only `Scope` reads it.

- [ ] **Step 2.2: Replace `container.ts` contents**

Replace the entire file with:

```ts
import { match } from "ts-pattern";

import { Bindings, type StoredEntry, disposeSlots } from "./bindings";
import {
  ContainerDisposedError,
  InvalidTokenError,
  ScopedResolutionOutsideScopeError,
  TokenNotRegisteredError,
} from "./errors";
import { currentChain, currentResolver, type Resolver, withResolutionContext } from "./inject";
import { createInjector, InjectorToken } from "./injector";
import { Lifetime } from "./lifetime";
import { RegistrationBuilder } from "./registration";
import { Scope } from "./scope";
import { type AnyTokenLike, isToken, type MultiToken, type TokenLike, tokenKind } from "./token";

import type { Module } from "./module";

export interface ContainerInternal {
  __getStored(token: AnyTokenLike): readonly StoredEntry[] | undefined;
  __resolveContainerLifetime(resolver: Resolver, token: AnyTokenLike, stored: StoredEntry): unknown;
}

export class Container implements Resolver, ContainerInternal {
  readonly #bindings = new Bindings();
  #disposed = false;

  constructor() {
    this.#registerBuiltins();
  }

  #registerBuiltins(): void {
    this.register(InjectorToken)
      .useFactory(() => {
        const resolver = currentResolver() ?? this;
        return createInjector(resolver);
      })
      .lifetime(Lifetime.Transient);
  }

  register<T>(token: TokenLike<T> | MultiToken<T>): RegistrationBuilder<T>;
  register<T>(token: AnyTokenLike): RegistrationBuilder<T> {
    this.#ensureNotDisposed();
    if (!isToken(token)) throw new InvalidTokenError(token);
    let stored: StoredEntry | undefined;
    return new RegistrationBuilder<T>((entry) => {
      if (stored) {
        stored.entry = entry;
        return;
      }
      stored = this.#bindings.commit(token, entry);
    });
  }

  resolve<T>(token: TokenLike<T>): T;
  resolve<T>(token: MultiToken<T>): T[];
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

  #resolveSingle(token: AnyTokenLike, stored: StoredEntry): unknown {
    return match(stored.entry.lifetime)
      .with(Lifetime.Container, () => stored.slot.getOrCreate(this, token, stored.entry.factory))
      .with(Lifetime.Transient, () => withResolutionContext(this, token, stored.entry.factory))
      .with(Lifetime.Scoped, () => {
        throw new ScopedResolutionOutsideScopeError(token);
      })
      .exhaustive();
  }

  __getStored(token: AnyTokenLike): readonly StoredEntry[] | undefined {
    return this.#bindings.lookup(token);
  }

  __resolveContainerLifetime(resolver: Resolver, token: AnyTokenLike, stored: StoredEntry): unknown {
    return match(stored.entry.lifetime)
      .with(Lifetime.Container, () => stored.slot.getOrCreate(resolver, token, stored.entry.factory))
      .with(Lifetime.Transient, () => withResolutionContext(resolver, token, stored.entry.factory))
      .with(Lifetime.Scoped, () => {
        throw new ScopedResolutionOutsideScopeError(token);
      })
      .exhaustive();
  }

  createScope(): Scope {
    this.#ensureNotDisposed();
    return new Scope(this);
  }

  async autoLoad(): Promise<void> {
    this.#ensureNotDisposed();
    const ordered = this.#bindings
      .all()
      .filter(({ stored }) => stored.entry.eager && !stored.slot.has)
      .toSorted((a, b) => a.stored.registrationIndex - b.stored.registrationIndex);
    for (const { token, stored } of ordered) {
      this.#resolveSingle(token, stored);
    }
  }

  addModule(module: Module): this {
    this.#ensureNotDisposed();
    module.register(this);
    return this;
  }

  addModules(modules: readonly Module[]): this {
    for (const moduleEntry of modules) this.addModule(moduleEntry);
    return this;
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    const slots = this.#bindings
      .all()
      .filter(({ stored }) => stored.slot.has)
      .toSorted((a, b) => b.stored.registrationIndex - a.stored.registrationIndex)
      .map(({ stored }) => stored.slot);
    const errors = await disposeSlots(slots);
    this.#bindings.clear();
    if (errors.length > 0) {
      throw new AggregateError(errors, "One or more disposers failed.");
    }
  }

  #ensureNotDisposed(): void {
    if (this.#disposed) throw new ContainerDisposedError();
  }
}
```

Things to notice while writing:

- `StoredEntry` is imported from `./bindings`, not declared in this file. The original `interface StoredEntry { … }` and its export are gone.
- The previous in-file `disposeInstance` helper is gone — it now lives in `bindings.ts` and is reached via `Slot.dispose` through `disposeSlots`.
- `__getStored` and `__resolveContainerLifetime` remain as thin adapters so `scope.ts` keeps working until Task 3 migrates it. They are deleted in Task 4.

- [ ] **Step 2.3: Update `scope.ts` to import `StoredEntry` from `./bindings`**

`scope.ts` currently imports `StoredEntry` from `./container`. Update only that one import:

```ts
// scope.ts top — change
import type { Container, ContainerInternal, StoredEntry } from "./container";
// to
import type { Container, ContainerInternal } from "./container";
import type { StoredEntry } from "./bindings";
```

Leave the rest of `scope.ts` alone — it's rewritten wholesale in Task 3.

- [ ] **Step 2.4: Verify types**

Run: `npm run check:types`
Expected: Pass.

- [ ] **Step 2.5: Verify lint**

Run: `npm run check:lint`
Expected: Pass.

- [ ] **Step 2.6: Verify all DI tests pass**

Run: `npm run test -- src/infrastructure/di`
Expected: All pass. Behavior is unchanged: `__getStored` delegates to `bindings.lookup`, `__resolveContainerLifetime` uses `slot.getOrCreate` with the same caching semantics. `disposeInstance` is no longer in `container.ts` — it's reached via `Slot.dispose` through `disposeSlots`.

- [ ] **Step 2.7: Commit**

```bash
git add src/infrastructure/di/container.ts src/infrastructure/di/scope.ts
git commit -m "refactor(di): back Container with Bindings + Slot"
```

---

## Task 3: Migrate `scope.ts` to consume `Bindings` directly

**Why now:** Cut the `Scope → Container` dependency. Scope receives a `Bindings` reference from `Container.createScope()`, looks up entries through it, and keeps its own per-scope slot map for `Lifetime.Scoped`.

**Files:**

- Modify: `src/infrastructure/di/scope.ts`
- Modify: `src/infrastructure/di/container.ts` (one line — `createScope` passes bindings)

- [ ] **Step 3.1: Replace `scope.ts` contents**

Replace the entire file with:

```ts
import { match } from "ts-pattern";

import { type Bindings, Slot, type StoredEntry, disposeSlots } from "./bindings";
import { ContainerDisposedError, TokenNotRegisteredError } from "./errors";
import { currentChain, type Resolver, withResolutionContext } from "./inject";
import { Lifetime } from "./lifetime";
import { type AnyTokenLike, type MultiToken, type TokenLike, tokenKind } from "./token";

export class Scope implements Resolver {
  readonly #bindings: Bindings;
  readonly #scopedSlots = new Map<StoredEntry, Slot>();
  readonly #scopedOrder: Slot[] = [];
  #disposed = false;

  constructor(bindings: Bindings) {
    this.#bindings = bindings;
  }

  resolve<T>(token: TokenLike<T>): T;
  resolve<T>(token: MultiToken<T>): T[];
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

  #resolveSingle(token: AnyTokenLike, stored: StoredEntry): unknown {
    return match(stored.entry.lifetime)
      .with(Lifetime.Container, () => stored.slot.getOrCreate(this, token, stored.entry.factory))
      .with(Lifetime.Transient, () => withResolutionContext(this, token, stored.entry.factory))
      .with(Lifetime.Scoped, () => this.#scopedSlotFor(stored).getOrCreate(this, token, stored.entry.factory))
      .exhaustive();
  }

  #scopedSlotFor(stored: StoredEntry): Slot {
    let slot = this.#scopedSlots.get(stored);
    if (!slot) {
      slot = new Slot();
      this.#scopedSlots.set(stored, slot);
      this.#scopedOrder.push(slot);
    }
    return slot;
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    const slots = this.#scopedOrder.slice().reverse();
    this.#scopedSlots.clear();
    this.#scopedOrder.length = 0;
    const errors = await disposeSlots(slots);
    if (errors.length > 0) {
      throw new AggregateError(errors, "One or more scope disposers failed.");
    }
  }

  #ensureNotDisposed(): void {
    if (this.#disposed) throw new ContainerDisposedError();
  }
}
```

- [ ] **Step 3.2: Update `Container.createScope` to pass `Bindings`**

In `src/infrastructure/di/container.ts`, change:

```ts
createScope(): Scope {
  this.#ensureNotDisposed();
  return new Scope(this);
}
```

to:

```ts
createScope(): Scope {
  this.#ensureNotDisposed();
  return new Scope(this.#bindings);
}
```

- [ ] **Step 3.3: Verify types**

Run: `npm run check:types`
Expected: Pass. `scope.ts` no longer imports anything from `./container`.

- [ ] **Step 3.4: Verify lint**

Run: `npm run check:lint`
Expected: Pass.

- [ ] **Step 3.5: Verify all DI tests pass**

Run: `npm run test -- src/infrastructure/di`
Expected: All pass. Scoped-lifetime resolution now uses a per-scope `Slot` instead of the previous `Map<StoredEntry, unknown>`; first-resolve / cache-hit / dispose semantics are identical.

- [ ] **Step 3.6: Commit**

```bash
git add src/infrastructure/di/scope.ts src/infrastructure/di/container.ts
git commit -m "refactor(di): pass Bindings to Scope; drop Container coupling"
```

---

## Task 4: Remove `ContainerInternal` and the `__` adapter methods

**Why now:** With Scope migrated, nothing reads the `__` methods anymore. Delete them and the `ContainerInternal` interface.

**Files:**

- Modify: `src/infrastructure/di/container.ts`

- [ ] **Step 4.1: Confirm no callers of `__getStored` / `__resolveContainerLifetime`**

Run: `grep -rn "__getStored\|__resolveContainerLifetime\|ContainerInternal" src/ 2>/dev/null`
Expected: Output limited to declarations inside `src/infrastructure/di/container.ts`. If anything in `src/` references them outside that file, stop and investigate before deleting.

- [ ] **Step 4.2: Delete `ContainerInternal` interface and the two `__` methods**

In `src/infrastructure/di/container.ts`:

1. Remove the `ContainerInternal` interface block:

```ts
export interface ContainerInternal {
  __getStored(token: AnyTokenLike): readonly StoredEntry[] | undefined;
  __resolveContainerLifetime(resolver: Resolver, token: AnyTokenLike, stored: StoredEntry): unknown;
}
```

2. Change `export class Container implements Resolver, ContainerInternal {` to `export class Container implements Resolver {`.

3. Remove the two method bodies:

```ts
__getStored(token: AnyTokenLike): readonly StoredEntry[] | undefined { … }
__resolveContainerLifetime(resolver: Resolver, token: AnyTokenLike, stored: StoredEntry): unknown { … }
```

4. The import `import { Bindings, type StoredEntry, disposeSlots } from "./bindings";` may now flag `StoredEntry` as unused (it's still used in `#resolveSingle`'s parameter type — keep it). Check the actual import list against what the remaining code references; remove any genuinely unused names.

- [ ] **Step 4.3: Verify types**

Run: `npm run check:types`
Expected: Pass.

- [ ] **Step 4.4: Verify lint**

Run: `npm run check:lint`
Expected: Pass.

- [ ] **Step 4.5: Verify all DI tests pass**

Run: `npm run test -- src/infrastructure/di`
Expected: All pass.

- [ ] **Step 4.6: Commit**

```bash
git add src/infrastructure/di/container.ts
git commit -m "refactor(di): drop ContainerInternal and __ adapter methods"
```

---

## Task 5: Final verification

- [ ] **Step 5.1: Acceptance grep — no Scope → Container coupling**

Run: `grep -n "from \"./container\"\|from './container'" src/infrastructure/di/scope.ts`
Expected: No output. `scope.ts` has zero imports from `./container`.

- [ ] **Step 5.2: Acceptance grep — no underscore-prefixed methods**

Run: `grep -n "__\(getStored\|resolveContainerLifetime\)\|ContainerInternal" src/infrastructure/di/`
Expected: No output anywhere in the DI directory.

- [ ] **Step 5.3: Acceptance grep — `disposeInstance` lives in one place**

Run: `grep -rn "function disposeInstance\|async function disposeInstance" src/infrastructure/di/`
Expected: Exactly one match, in `src/infrastructure/di/bindings.ts`.

- [ ] **Step 5.4: Full quality gates**

Run in order:

```bash
npm run test
npm run check:types
npm run check:lint
```

Expected: All pass.

- [ ] **Step 5.5: Smoke e2e**

Run: `npm run test:e2e:smoke`
Expected: Pass.

- [ ] **Step 5.6: Final commit (only if any cleanup landed in this task)**

If steps 5.1–5.3 produced no changes (the typical case), skip this step.
Otherwise:

```bash
git add -A src/infrastructure/di/
git commit -m "refactor(di): post-refactor cleanup"
```

---

## Done

The DI core now decomposes into:

- `bindings.ts` — `Bindings` (registry), `StoredEntry` (record + permanent container-lifetime slot), `Slot` (cache cell), `disposeSlots`, `disposeInstance`.
- `container.ts` — owns a `Bindings`, performs explicit lifetime dispatch, orchestrates `autoLoad` / `dispose` / `createScope`. No `__` methods, no `ContainerInternal`.
- `scope.ts` — holds a `Bindings` ref and a per-scope `Map<StoredEntry, Slot>`. Zero imports from `./container`.

Public API: unchanged.
