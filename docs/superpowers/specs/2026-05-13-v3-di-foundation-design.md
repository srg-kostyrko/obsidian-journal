# v3 DI Foundation — Design

**Stage:** 1 (DI foundation) of the v3 plugin rewrite
**Date:** 2026-05-13
**Status:** Draft for review

## Purpose

Lay the dependency-injection foundation for the v3 plugin rewrite. v2 used the
plugin instance as a global service locator; every component reached into the
plugin at runtime to fetch dependencies, which made components impossible to
test in isolation. v3 establishes a small, deliberately-scoped DI container as
the wiring layer for all future feature modules.

Stage 1's deliverable is the DI core plus a thin vertical-slice `main.ts` that
proves the container constructs, registers, eager-loads, resolves, and disposes
correctly. No feature modules yet — each will be justified and added in later
stages.

## Non-goals

- No feature modules (settings, calendar, journals, …) in Stage 1.
- No `.kiro/steering/` setup; decisions live in this doc until steering is
  introduced in a later stage.
- No decorators, no `reflect-metadata`, no auto-registration of classes.
- No nested scopes (single-level only; can be added later if a use case lands).
- No service-locator API on Plugin/App; long-lived components do not hold a
  Container reference.

## Architecture

### Layout

```
src/infrastructure/di/
├── index.ts          # Public barrel
├── token.ts          # Token<T>, MultiToken<T>, createToken, createMultiToken, isToken
├── lifetime.ts       # Lifetime enum
├── errors.ts         # All DI error subclasses
├── inject.ts         # inject() helper + resolution-context stack
├── registration.ts   # RegistrationBuilder (chained API)
├── scope.ts          # Scope (child resolver)
├── container.ts      # Container (root resolver, createScope, autoLoad, dispose, addModule(s))
├── module.ts         # Module interface
├── injector.ts       # InjectorToken + typed proxy escape hatch
├── vue.ts            # provideInjector, useInjector, useService
└── testing.ts        # createTestContainer() — separate barrel for test code
```

Each file gets a colocated `*.test.ts`. Tests for the index barrel, `Module`
shape, and framework behavior (`Symbol.dispose` itself) are intentionally
omitted.

### Module shape

```ts
export interface Module {
  register(c: Container): void;
}
```

Feature modules will be declared as `export const FooModule: Module = { register(c) { ... } }`.

## Public API

### Tokens

```ts
type Token<T>      = { readonly __brand: 'Token';      readonly name: string; readonly __type?: T };
type MultiToken<T> = { readonly __brand: 'MultiToken'; readonly name: string; readonly __type?: T };
type Class<T>      = new (...args: never[]) => T;
type TokenLike<T>  = Token<T> | Class<T>;

createToken<T>(name: string): Token<T>;
createMultiToken<T>(name: string): MultiToken<T>;
isToken(x: unknown): x is Token<unknown> | MultiToken<unknown>;
```

Class constructors self-identify as single-binding tokens via reference
identity. There is no auto-registration: every class must be explicitly bound
via `register(Class).useClass(Class)` (or another builder) before it can be
resolved.

The token registry is keyed by the token reference itself (the `Token` /
`MultiToken` object, or the class constructor function). Two distinct
`createToken("Foo")` calls produce two distinct tokens, even with the same
name. Names are debug labels only — not identity.

Multiplicity is encoded in the token kind. `Token<T>` is single-bind;
`MultiToken<T>` is multi-bind. The same `register` / `resolve` methods adapt
their behavior based on the brand — no separate `registerMulti` / `resolveAll`.

### Lifetimes

```ts
enum Lifetime {
  Container,
  Scoped,
  Transient,
}
```

- **`Container`** — one instance per root container. Default; not spelled out
  on registrations.
- **`Scoped`** — one instance per scope created via `container.createScope()`.
  Resolving a Scoped binding from the root container throws
  `ScopedResolutionOutsideScopeError`.
- **`Transient`** — new instance for every resolve.

### Registration builder

```ts
c.register(Token)
  .useClass(Impl) // | .useFactory(() => …) | .useValue(literal)
  .lifetime(Lifetime.Transient) // optional; default Container is never spelled out
  .eager(); // optional; resolved during autoLoad()
```

The builder has exactly three terminal forms (`useClass` / `useFactory` /
`useValue`) and two modifiers (`lifetime` / `eager`). There is no
`.onDispose()` method — disposal is via the `Symbol.dispose` convention
(below).

Calling `register(singleToken)` twice throws `DuplicateRegistrationError`.
Calling `register(multiToken)` accumulates bindings.

### Resolution

```ts
c.resolve(Token); // returns T
c.resolve(MultiToken); // returns T[]
```

A single overloaded method whose return type is driven by the token kind. No
`resolveAll`.

### `inject()` during construction

```ts
class JournalsService {
  readonly #plugin = inject(PluginToken);
  readonly #handlers = inject(HandlerMultiToken); // T[]
}
c.register(JournalsService).useClass(JournalsService);
```

`inject()` reads the top of a module-level resolution-context stack. `resolve`
pushes the current resolver (container or scope), runs the factory or
`new Impl()`, then pops. Calling `inject()` outside any resolve call throws
`NoInjectionContextError`.

`inject()` works synchronously inside class field initializers and factory
function bodies. It does not support `await` — construction is synchronous.

Two valid patterns, both supported:

1. **Field initializers** (Angular-style): `readonly #x = inject(XToken);` —
   class is testable by registering stubs in a test container/scope.
2. **Explicit constructor args**: `c.register(T).useFactory(() => new T(inject(A), inject(B)))`
   — class is testable by direct construction.

Long-lived components must not hold a Container reference. If late binding is
genuinely needed, depend on `InjectorToken` (below).

### Scopes

```ts
const scope = container.createScope();
scope.resolve(RequestHandlerToken); // Lifetime.Scoped instances live in this scope
await scope.dispose(); // disposes scope-bound instances
```

A scope is a child resolver. Resolving a `Container`-lifetime binding from a
scope delegates to the parent. Scopes do not nest in Stage 1 — `Scope` has no
`createScope()` method.

### Eager bindings and `autoLoad`

```ts
c.register(MomentLocaleToken).useClass(MomentLocaleInstaller).eager();
await c.autoLoad(); // resolves all .eager() bindings in registration order
```

`autoLoad` is a separate step (not run by the container constructor) so the
composition root can sequence eager resolution after async prerequisites
(e.g., `await settingsStore.load()`). Returns `Promise<void>` for symmetry
with `dispose`.

Eager bindings without dependencies resolve immediately. Bindings that
`inject()` an already-resolved eager sibling get its instance.

### Disposal

```ts
await container.dispose();
await scope.dispose();
```

On dispose, the container/scope walks the resolved instances in **reverse
registration order** and calls `[Symbol.asyncDispose]()` (preferred) or
`[Symbol.dispose]()` (fallback) on each instance that has either symbol. Both
container and scope dispose return `Promise<void>`.

After dispose, `register` and `resolve` throw `ContainerDisposedError`.

There is no `.onDispose()` builder method. Plain `useValue`-registered values
or `useFactory`-returned objects that need teardown should wrap themselves in a
class implementing `Symbol.dispose` / `Symbol.asyncDispose`.

### Injector escape hatch

```ts
export const InjectorToken = createToken<Injector>("Injector");

export interface Injector {
  resolve<T>(token: Token<T>): T;
  resolve<T>(token: MultiToken<T>): T[];
}
```

Registered as a built-in by the container. Resolving `InjectorToken` returns
a typed proxy bound to the **current resolver** (the container for root
resolves; the scope for scope resolves). The existence of this token is the
only sanctioned way for a long-lived component to perform late resolution
without exposing the Container itself.

### Vue integration

```ts
// At every Vue mount root (vue-host helper, modal opener, code-block mounter):
provideInjector(injector);

// Inside <script setup>:
const settings = useService(SettingsToken); // T
const handlers = useService(CommandMultiToken); // T[]
const injector = useInjector(); // for advanced cases
```

- `provideInjector` accepts an `Injector` so callers can choose between the
  root container's injector and a per-mount scope's injector.
- `useService` throws if no provider exists up-tree.
- No `useApp` / `usePlugin` composables. App and Plugin are reached via
  `ObsidianAppToken` / `PluginToken` like every other dependency.

### Errors

All in `errors.ts`:

- `TokenNotRegisteredError(token, chain)`
- `DuplicateRegistrationError(token)`
- `CircularDependencyError(chain)`
- `NoInjectionContextError(callsite?)`
- `ContainerDisposedError`
- `ScopedResolutionOutsideScopeError(token)`
- `InvalidTokenError(received)`

Each carries the resolution chain when relevant for debugging.

## Vertical-slice `main.ts` (Stage 1 deliverable)

```ts
// src/infrastructure/obsidian-tokens.ts
import type { App } from "obsidian";
import type JournalPlugin from "@/main";
import { createToken } from "@/infrastructure/di";

export const PluginToken = createToken<JournalPlugin>("Plugin");
export const ObsidianAppToken = createToken<App>("ObsidianApp");
```

```ts
// src/main.ts
import { Plugin } from "obsidian";
import { Container } from "@/infrastructure/di";
import { PluginToken, ObsidianAppToken } from "@/infrastructure/obsidian-tokens";

export default class JournalPlugin extends Plugin {
  #container?: Container;

  async onload(): Promise<void> {
    const c = new Container();
    c.register(PluginToken).useValue(this);
    c.register(ObsidianAppToken).useValue(this.app);
    await c.autoLoad();
    this.#container = c;
  }

  async onunload(): Promise<void> {
    await this.#container?.dispose();
    this.#container = undefined;
  }
}
```

No feature modules. Adding `SettingsModule`, `WorkspaceModule`, etc. is the
job of later stages, each justified by an actual feature need.

## Data flow

```
new Container()
   └─ registers built-in InjectorToken
container.register(Token).use…(…)
   └─ stores RegistrationEntry under token in TokenRegistry
container.addModule(M)         => M.register(container)
await container.autoLoad()     => resolves every .eager() entry in registration order
container.resolve(Token)
   ├─ pushes resolver onto context stack
   ├─ runs factory / new Impl()
   │     └─ field initializers / factory body may call inject(otherToken)
   │           └─ inject reads stack top, delegates to its resolve()
   └─ pops stack, returns instance
container.createScope() => new Scope(parent: container)
   └─ scope.resolve() pushes scope as resolver; Container-lifetime delegates to parent
await scope.dispose()
   └─ calls Symbol.asyncDispose / Symbol.dispose on scope-resolved instances, reverse order
await container.dispose()
   └─ same, on container-resolved instances
```

## Error handling

| Situation                                                     | Error                               |
| ------------------------------------------------------------- | ----------------------------------- |
| `resolve(token)` when token has no binding                    | `TokenNotRegisteredError`           |
| Second `register(t)` on a single-binding token                | `DuplicateRegistrationError`        |
| Cycle in dependency graph                                     | `CircularDependencyError`           |
| `inject(t)` outside any active `resolve()`                    | `NoInjectionContextError`           |
| Any API call on a disposed container/scope                    | `ContainerDisposedError`            |
| Resolving a `Lifetime.Scoped` binding from the root container | `ScopedResolutionOutsideScopeError` |
| `register` / `resolve` called with non-token, non-class arg   | `InvalidTokenError`                 |

`Symbol.dispose` / `Symbol.asyncDispose` callbacks that throw are caught and
collected. After every callback has run, `dispose()` rejects with an
`AggregateError` carrying all collected errors if any callback threw; it
resolves otherwise. This guarantees later teardown still runs even if an
earlier one threw.

Cycle detection: `resolve` maintains a per-resolution chain of in-flight
tokens. Re-entering a token already on the chain throws
`CircularDependencyError` with the offending chain attached.

## Testing approach

- **Colocated `*.test.ts`** per implementation file: `container.test.ts`,
  `registration.test.ts`, `scope.test.ts`, `inject.test.ts`, `vue.test.ts`,
  `token.test.ts`, `injector.test.ts`.
- **One `integration.test.ts`** covering the full lifecycle: build container,
  add modules, autoLoad, resolve, createScope, dispose chain firing in
  reverse order.
- **`testing.ts`** (separate barrel) exports `createTestContainer()` for use
  by downstream feature tests in Stage 2+.
- **Vue tests** use `@testing-library/vue` + `user-event` (per project
  convention).
- **Not tested**: the index barrel re-exports, `Module` interface shape,
  framework behavior (`Symbol.dispose` itself, Vue's `provide`/`inject`),
  trivial error subclasses (parent-class `instanceof` only).
- **Behavior names**: subject+verb (e.g., "throws when resolving an unbound
  token", not "TokenNotRegisteredError handling"). One behavior per test.

## Prerequisite check

Before implementation, verify `@/` path alias resolves to `src/` in
`tsconfig.app.json` and `vite.config.mts`. Add if missing — Stage 1 imports
use the alias throughout.

## Out of scope (later stages)

- Feature modules (settings, calendar, journals, decorations, code-blocks, …)
- `.kiro/steering/` introduction
- Nested scopes
- Module load-order / dependency declaration between modules
- Hot-replacement / re-registration semantics
- Async factories (`useFactory` returning a Promise)
