# RegistrationBuilder Two-Stage Split — Design

**Date:** 2026-05-13
**Status:** Draft for review
**Scope:** `src/infrastructure/di/registration.ts` + colocated tests; one type
update in `src/infrastructure/di/container.ts`.

## Problem

`RegistrationBuilder<T>` currently exposes `useClass`, `useFactory`, `useValue`,
`lifetime`, and `eager` on a single class that returns `this` from every
method. That permits chains the public API was never meant to support:

```ts
container.register(Token).useClass(Foo).useValue(otherFoo);
container.register(Token).lifetime(Lifetime.Transient).eager(); // never emits an entry
```

The first looks like reconfiguration but silently overrides the binding. The
second looks like a complete registration but never reaches `commit()` because
no factory was set. Both are caught (if at all) only by behaviour: an existing
test pins the "last `useX` wins" behaviour, and `#notify()` has a `if
(!this.#factory) return` guard that exists solely to forgive the
configure-before-bind path.

The shape of the API does not match the intended call grammar
("bind, then configure"). Two-stage typing makes the grammar the API.

## Solution

Split into two classes:

```ts
class RegistrationBuilder<T> {
  useClass(ctor: Class<T>): RegistrationOptions<T>;
  useFactory(factory: () => T): RegistrationOptions<T>;
  useValue(value: T): RegistrationOptions<T>;
}

class RegistrationOptions<T> {
  lifetime(value: Lifetime): this;
  eager(): this;
}
```

`Container.register()` returns `RegistrationBuilder<T>`. Each `useX` returns a
fresh `RegistrationOptions<T>`. The result is:

- `useX.useY` does not type-check.
- `register(t).lifetime(...)` does not type-check.
- The "factory may not be set yet" guard inside `#notify()` is removed —
  by construction, `RegistrationOptions` is only constructed after a binding
  is chosen.

The two classes are independent (no inheritance). `RegistrationOptions` does
not expose `useX`; `RegistrationBuilder` does not expose configuration.

## Mechanics

The `onChange`-callback contract with `Container` is unchanged. Both classes
share the same callback:

- `RegistrationBuilder` holds the callback, defaults (`Lifetime.Container`,
  `eager = false`), and the three `useX` methods. Each `useX` constructs a
  `RegistrationOptions<T>` with `{ factory, lifetime: Container, eager: false,
onChange }` and returns it. Construction is the first emit.
- `RegistrationOptions` owns `#factory`, `#lifetime`, `#eager`, `#onChange`.
  Its constructor calls `#onChange` once with the initial entry (preserving
  today's "binding visible immediately after `useX`" behaviour).
  `.lifetime()` and `.eager()` update state and re-emit, returning `this`.

`Container.register()` no longer needs the `stored` sentinel + first-vs-rest
branch in its callback — the first call now happens in `RegistrationOptions`'s
constructor and subsequent calls happen for the same registration. The
"commit on first emit, mutate on later emits" logic stays in `Container`'s
callback closure exactly as today:

```ts
let stored: StoredEntry | undefined;
return new RegistrationBuilder<T>((entry) => {
  if (stored) {
    stored.entry = entry;
    return;
  }
  stored = this.#bindings.commit(token, entry);
});
```

That code does not change. What changes is _when_ the first emit happens
(now inside `RegistrationOptions`'s constructor, after `useX`, not after the
first of `useX` / `lifetime` / `eager`).

## Tests

Colocated `registration.test.ts` updates:

- **Drop** `"emits no entry until a terminal method is called"` — the
  scenario no longer type-checks (`register(t).lifetime(...)` is a type
  error).
- **Drop** `"uses the latest terminal-method factory when more than one is
called"` — `useX.useY` is a type error.
- **Keep, adjusted to call `useX` first:**
  - `useClass` emits an entry whose factory builds an instance.
  - `useFactory` emits an entry whose factory returns the provided value.
  - `useValue` emits an entry whose factory returns the literal.
  - Default lifetime is `Lifetime.Container`. (Drop this if the
    "no default lifetime" memory feedback applies — but the _default_ is
    what's being tested, not a caller writing it.)
  - `.lifetime(Transient)` after `useValue` re-emits with the new lifetime.
  - `.eager()` after `useValue` re-emits with `eager: true`.
  - Default `eager` is `false`.
    The "two separate classes" rule is enforced by TypeScript; no runtime check
    is added, no test asserts the return _type_ (that would be testing TS
    itself, per `feedback_no_wiring_tests`), and no test asserts the class
    identity via `instanceof` — the split's purpose is to make misuse not
    compile, which a runtime test cannot exercise.

## Files touched

- `src/infrastructure/di/registration.ts` — rewrite.
- `src/infrastructure/di/registration.test.ts` — adjust per above.
- `src/infrastructure/di/container.ts` — no logic change; the `register()`
  return type stays `RegistrationBuilder<T>` (now the stage-1 type).

No changes to `Container`, `Scope`, `Bindings`, `Module`, or any caller of
`.register()`. All current callers already chain `.useX().lifetime()` or
just `.useX()` — both forms remain valid.

## Out of scope

- Renaming `RegistrationBuilder` (kept — still the entry point).
- Adding `RegistrationAlreadyBoundError` or any runtime guard.
- Touching `Container.register()`'s overload signatures.
