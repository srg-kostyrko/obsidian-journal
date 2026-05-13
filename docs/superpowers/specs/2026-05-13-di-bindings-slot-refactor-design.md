# DI Bindings + Slot Refactor — Design

**Date:** 2026-05-13
**Status:** Draft for review
**Scope:** Internal refactor of `src/infrastructure/di/`. Public API unchanged.

## Problem

The current `Container`/`Scope` split has two related smells:

1. **Type cycle.** `scope.ts` imports `Container` (and `ContainerInternal`,
   `StoredEntry`) from `container.ts`; `container.ts` imports `Scope` from
   `scope.ts` for `createScope()`. The runtime cycle is mild (Scope only needs
   the type), but the conceptual cycle — Scope reaches _back into_ Container at
   runtime — is real.
2. **Leaky internals.** `Container` exposes two underscore-prefixed methods to
   `Scope` via a `ContainerInternal` interface:
   - `__getStored(token)` — registry lookup
   - `__resolveContainerLifetime(resolver, token, stored)` — the
     cache-or-create algorithm for non-scoped entries
     The underscore prefix is the smell: these methods exist only because Scope
     needs them, not because they belong on Container.

The deeper issue is two distinct concerns tangled in one class:

- **the bindings table** — a `Map<Token, StoredEntry[]>` plus the rules for
  committing single-vs-multi registrations
- **instance caching** — the cells that hold container-lifetime singletons
  (currently fields on `StoredEntry`, with the cache-fill algorithm on
  `Container`)

Scope needs (a) read access to the table and (b) the same instance-caching
semantics for Container-lifetime entries that Container has — plus its own
caching for Scoped entries. Today Scope gets (a) and (b) by reaching back
into Container.

## Solution overview

Extract two named concepts and let the existing classes compose them:

- **`Bindings`** — owns the registry map. Knows single/multi commit rules.
  Both `Container` (writes via builder) and `Scope` (reads) hold a reference.
- **`Slot`** — a single cache cell with `getOrCreate(resolver, token, factory)`
  semantics. Used for both Container-lifetime caching (one slot per
  `StoredEntry`) and Scoped-lifetime caching (one slot per
  `(StoredEntry, Scope)` pair, held in a `Map<StoredEntry, Slot>` on the
  scope). Owns its disposal.

`StoredEntry` becomes a thin record carrying the registration entry, the
permanent Container-lifetime slot, and the registration index. Container and
Scope each perform an **explicit `ts-pattern` dispatch on `Lifetime`** — no
hidden branching inside the entry — and the diff between them is one match
arm (Scoped: error vs. cache).

## Architecture

### Files

```
src/infrastructure/di/
├── bindings.ts        # NEW: Bindings, StoredEntry, Slot, disposeInstance helper
├── container.ts       # uses Bindings; no Scope import; no __ methods
├── scope.ts           # uses Bindings + StoredEntry + Slot; no Container import
└── …unchanged: token.ts, inject.ts, injector.ts, lifetime.ts, registration.ts, errors.ts, module.ts, index.ts, vue.ts, testing.ts
```

`disposeInstance` (currently duplicated in `container.ts` and `scope.ts`)
moves into `bindings.ts` and becomes the implementation of `Slot.dispose()`.

### `bindings.ts`

```ts
export class Slot {
  #value: unknown;
  #has = false;
  get has(): boolean { return this.#has; }
  get value(): unknown { return this.#value; }

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
  entry: RegistrationEntry<unknown>;            // mutable; builder re-emits
  readonly slot = new Slot();                   // used iff lifetime === Container
  readonly registrationIndex: number;
  constructor(entry: RegistrationEntry<unknown>, registrationIndex: number) { … }
}

export class Bindings {
  readonly #map = new Map<AnyTokenLike, StoredEntry[]>();
  #counter = 0;

  commit(token: AnyTokenLike, entry: RegistrationEntry<unknown>): StoredEntry;
  // single: throws DuplicateRegistrationError if already present
  // multi:  appends

  lookup(token: AnyTokenLike): readonly StoredEntry[] | undefined;
  all(): readonly { readonly token: AnyTokenLike; readonly stored: StoredEntry }[];
  clear(): void;
}

async function disposeInstance(instance: unknown): Promise<void> { … }   // moved from container.ts/scope.ts
```

Notes:

- `StoredEntry.entry` stays mutable: the existing `RegistrationBuilder`
  onChange callback re-emits a new `RegistrationEntry` whenever the user
  chains `.lifetime(...)` etc. after the initial commit. Container threads
  this through `bindings.commit(...)` for the first emit and a direct
  `stored.entry = entry` for subsequent emits — same behavior as today, just
  with the registry now living in Bindings.
- `Slot.dispose` clears its own state before awaiting `disposeInstance` to
  keep the “after dispose, the slot is empty” invariant even if the user’s
  disposer throws.
- `Bindings.lookup` returns `readonly` to make the read-only contract for
  consumers (notably Scope) explicit.

### `container.ts`

```ts
export class Container implements Resolver {
  readonly #bindings = new Bindings();
  #disposed = false;

  // register / addModule / addModules: unchanged signatures.
  // The builder's onChange now does bindings.commit(token, entry) on first
  // emit, mutates stored.entry on re-emit.

  resolve(token: AnyTokenLike): unknown {
    this.#ensureNotDisposed();
    const entries = this.#bindings.lookup(token);
    if (!entries || entries.length === 0) {
      throw new TokenNotRegisteredError(token, currentChain());
    }
    return match(tokenKind(token))
      .with("single", () => this.#resolveSingle(token, entries[0]))
      .with("multi", () => entries.map((e) => this.#resolveSingle(token, e)))
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

  createScope(): Scope {
    this.#ensureNotDisposed();
    return new Scope(this.#bindings); // passes Bindings, not self
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
    if (errors.length > 0) throw new AggregateError(errors, "One or more disposers failed.");
  }
}
```

### `scope.ts`

```ts
export class Scope implements Resolver {
  readonly #bindings: Bindings;
  readonly #scopedSlots = new Map<StoredEntry, Slot>();
  readonly #scopedOrder: Slot[] = [];
  #disposed = false;

  constructor(bindings: Bindings) {
    this.#bindings = bindings;
  }

  resolve(token: AnyTokenLike): unknown {
    this.#ensureNotDisposed();
    const entries = this.#bindings.lookup(token);
    if (!entries || entries.length === 0) {
      throw new TokenNotRegisteredError(token, currentChain());
    }
    return match(tokenKind(token))
      .with("single", () => this.#resolveSingle(token, entries[0]))
      .with("multi", () => entries.map((e) => this.#resolveSingle(token, e)))
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
    if (errors.length > 0) throw new AggregateError(errors, "One or more scope disposers failed.");
  }
}
```

`disposeSlots(slots: Slot[]): Promise<unknown[]>` is a small helper colocated
with `Slot` in `bindings.ts`: awaits each `slot.dispose()` in order,
collecting thrown errors. It exists only to keep Container/Scope dispose
bodies short and identical in shape.

### `index.ts`

The public barrel continues to export only what consumers need.
`Container`, `Scope`, `Lifetime`, tokens, `Module`, error classes, `inject`,
`useService`, etc. **`Bindings`, `StoredEntry`, and `Slot` are not exported**
— they are infrastructure for the two public classes.

## Why this is the right abstraction

- The two underscore methods existed because `StoredEntry` held cache state
  but `Container` held cache logic. `Slot` reunifies state + behavior.
- `Slot` is _exactly_ what both lifetimes that cache (Container, Scoped) need.
  The difference between them is **where the slot lives**, not how it works.
  Container-lifetime slots live on the entry (shared by everyone). Scoped
  slots live in a per-scope map (private to one scope). Same primitive, two
  ownership stories.
- Each resolver now exhaustively matches on `Lifetime` in one place. Adding
  a fourth lifetime later is a localized change (two arms added) instead of
  hunting through `#resolveSingle` + `__resolveContainerLifetime` + the
  scoped branch.

## What does **not** change

- Public surface: `Container`, `Scope`, `register`, `resolve`, `createScope`,
  `addModule(s)`, `autoLoad`, `dispose`, all token/lifetime/module/error
  exports — identical.
- `inject.ts` (`Resolver` interface, `currentResolver`, `currentChain`,
  `withResolutionContext`) — untouched.
- `registration.ts` (`RegistrationEntry`, `RegistrationBuilder`) — untouched.
- `injector.ts`, `vue.ts`, `module.ts`, `testing.ts` — untouched.
- Builtin `InjectorToken` registration — untouched (it still uses
  `currentResolver() ?? this` to pick up the active scope).
- Resolution-context behavior (cycle detection, chain reporting) — untouched.

## Edge cases / decisions

### `Bindings.all()` shape

`autoLoad` needs the token alongside each stored entry (resolution is
per-token). `dispose` only needs the slot. Rather than splitting into two
methods, `Bindings.all()` returns `{ token, stored }` and dispose ignores
`.token`. `StoredEntry` stays minimal — no token field — because the
`{ token, stored }` shape is naturally produced by iterating the map and
the alternative (denormalizing the token onto every entry) buys nothing.

### Slot.dispose error semantics

`Slot.dispose()` resets `#has` and `#value` _before_ awaiting
`disposeInstance(value)`. If the user-supplied disposer throws, the error
propagates to the caller (`disposeSlots`), but the slot is already empty
— a subsequent `.has` read returns `false`, matching the “once disposed,
no longer cached” invariant. This matches the current behavior where
`#scopedInstances.clear()` runs _after_ the loop, but the difference is
invisible because both Container and Scope are themselves marked `#disposed`
in the same tick.

### Slot reuse for Container-lifetime entries across builder re-emits

If a user does `register(T).useClass(A).lifetime(Transient).useClass(B)` —
i.e. mutates the same registration multiple times before first resolution —
`stored.entry` is rewritten in place and `stored.slot` is still empty
(never used). After the first resolution, mutating `entry` further is
out-of-spec (no test covers it; we don't promise it). The slot is not
cleared on rebind. This matches current behavior (the existing `instance` /
`hasInstance` fields were never reset on rebind either).

## Testing

- **All existing tests stay green unchanged.** Public API is identical.
  `container.test.ts`, `scope.test.ts`, `integration.test.ts`, `inject.test.ts`,
  `injector.test.ts`, `registration.test.ts`, `errors.test.ts`,
  `token.test.ts`, `vue.test.ts` all exercise observable behavior, not
  internal shape.
- **Removed:** any test that asserted `ContainerInternal` shape, the
  presence of `__getStored` / `__resolveContainerLifetime`, or the
  `stored.instance` / `stored.hasInstance` field names. (Per the
  "don't test the wiring" memory; spot-check during implementation.)
- **No new tests for `Bindings` or `Slot` in isolation.** They are
  infrastructure for `Container`/`Scope`; their behavior is fully covered
  by the integration tests of those classes. (Per the "don't test the
  wiring" memory.)

## Out of scope

- No parent-scope / nested-scope support.
- No change to dispose-on-parent-dispose semantics (currently neither does
  it; scopes are disposed by their owner).
- No public surface changes; no new error types.
- No change to module-loading, injector composables, or Vue integration.

## Acceptance

- `scope.ts` has zero imports from `./container`.
- `container.ts` has zero `__`-prefixed methods and exports no
  `ContainerInternal` interface.
- `disposeInstance` exists in exactly one place (`bindings.ts`).
- All quality gates pass: `npm run test`, `npm run check:types`,
  `npm run check:lint`.
