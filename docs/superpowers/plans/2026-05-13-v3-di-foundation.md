# v3 DI Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v3 DI core (Container, Scope, tokens, lifetimes, `inject()` context, `Symbol.dispose` teardown, Vue integration) and a vertical-slice `main.ts` that proves it.

**Architecture:** Hand-rolled DI in `src/infrastructure/di/`. Multiplicity is encoded in the token kind (`Token<T>` vs `MultiToken<T>`). Class constructors self-identify as single-binding tokens via reference identity (no auto-registration). `inject()` reads a module-level resolution-context stack. Lifetimes: Container (default), Transient, Scoped. Disposal via `Symbol.dispose` / `Symbol.asyncDispose`. Eager bindings resolve in a separate `autoLoad()` step so `main.ts` can sequence them after async prerequisites.

**Tech Stack:** TypeScript 6, Vue 3, Vitest 4, `@testing-library/vue`, `ts-pattern` (for token-kind dispatch).

**Spec:** `docs/superpowers/specs/2026-05-13-v3-di-foundation-design.md`

---

## File Map

**Create:**

- `src/infrastructure/di/lifetime.ts` — `Lifetime` enum
- `src/infrastructure/di/module.ts` — `Module` interface
- `src/infrastructure/di/token.ts` — `Token`, `MultiToken`, `createToken`, `createMultiToken`, `isToken`, `tokenName`, `tokenKind`
- `src/infrastructure/di/token.test.ts`
- `src/infrastructure/di/errors.ts` — error subclasses
- `src/infrastructure/di/errors.test.ts`
- `src/infrastructure/di/inject.ts` — `inject()`, `withResolutionContext`, resolution-context stack
- `src/infrastructure/di/inject.test.ts`
- `src/infrastructure/di/registration.ts` — `RegistrationBuilder`, `RegistrationEntry`
- `src/infrastructure/di/registration.test.ts`
- `src/infrastructure/di/container.ts` — `Container` class
- `src/infrastructure/di/container.test.ts`
- `src/infrastructure/di/scope.ts` — `Scope` class
- `src/infrastructure/di/scope.test.ts`
- `src/infrastructure/di/injector.ts` — `InjectorToken`, `Injector` interface
- `src/infrastructure/di/injector.test.ts`
- `src/infrastructure/di/vue.ts` — `provideInjector`, `useInjector`, `useService`
- `src/infrastructure/di/vue.test.ts`
- `src/infrastructure/di/testing.ts` — `createTestContainer()`
- `src/infrastructure/di/index.ts` — public barrel
- `src/infrastructure/di/integration.test.ts` — full-lifecycle smoke test
- `src/infrastructure/obsidian-tokens.ts` — `PluginToken`, `ObsidianAppToken`

**Modify:**

- `package.json` — add `ts-pattern` dep
- `src/main.ts` — replace stub with DI wiring

**Already verified (no changes):**

- `tsconfig.app.json` — has `"@/*": ["./src/*"]`
- `vite.config.mts` — has `resolve.alias['@']`
- `vitest.config.mts` — has `alias['@']`

---

## Task 1: Add ts-pattern dependency

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Install ts-pattern**

```bash
npm install ts-pattern@^5.9.0
```

- [ ] **Step 2: Verify install**

```bash
node -e "require('ts-pattern')" && echo OK
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add ts-pattern for discriminated-union dispatch"
```

---

## Task 2: Lifetime enum + Module interface

**Files:**

- Create: `src/infrastructure/di/lifetime.ts`
- Create: `src/infrastructure/di/module.ts`

Trivial value/interface files. Per memory ("don't test wiring"), no test file.

- [ ] **Step 1: Create lifetime.ts**

```ts
// src/infrastructure/di/lifetime.ts
export enum Lifetime {
  Container = "container",
  Scoped = "scoped",
  Transient = "transient",
}
```

- [ ] **Step 2: Create module.ts**

```ts
// src/infrastructure/di/module.ts
import type { Container } from "@/infrastructure/di/container";

export interface Module {
  register(c: Container): void;
}
```

- [ ] **Step 3: Commit**

`module.ts` imports `Container` (forward reference); type-check will fail until Task 7 lands. That's expected — defer the type-check gate to Task 7. Lint passes on its own:

```bash
npm run check:lint -- src/infrastructure/di/lifetime.ts src/infrastructure/di/module.ts
```

```bash
git add src/infrastructure/di/lifetime.ts src/infrastructure/di/module.ts
git commit -m "feat(di): add Lifetime enum and Module interface"
```

---

## Task 3: Tokens

**Files:**

- Create: `src/infrastructure/di/token.ts`
- Create: `src/infrastructure/di/token.test.ts`

Token reference identity is the registry key; names are debug labels only. `Token<T>` is single-bind, `MultiToken<T>` is multi-bind.

- [ ] **Step 1: Write failing tests**

```ts
// src/infrastructure/di/token.test.ts
import { describe, expect, it } from "vitest";

import { createMultiToken, createToken, isToken, tokenKind, tokenName } from "./token";

describe("createToken", () => {
  it("produces a single-binding token carrying its debug name", () => {
    const t = createToken<string>("Foo");
    expect(tokenName(t)).toBe("Foo");
    expect(tokenKind(t)).toBe("single");
  });

  it("produces distinct tokens for separate calls with the same name", () => {
    const a = createToken<string>("Same");
    const b = createToken<string>("Same");
    expect(a).not.toBe(b);
  });
});

describe("createMultiToken", () => {
  it("produces a multi-binding token carrying its debug name", () => {
    const t = createMultiToken<string>("Bar");
    expect(tokenName(t)).toBe("Bar");
    expect(tokenKind(t)).toBe("multi");
  });
});

describe("tokenKind", () => {
  it("classifies a class constructor as single", () => {
    class Foo {}
    expect(tokenKind(Foo)).toBe("single");
  });
});

describe("tokenName", () => {
  it("uses the class constructor name for class tokens", () => {
    class Bar {}
    expect(tokenName(Bar)).toBe("Bar");
  });
});

describe("isToken", () => {
  it("returns true for a created single token", () => {
    expect(isToken(createToken("X"))).toBe(true);
  });

  it("returns true for a created multi token", () => {
    expect(isToken(createMultiToken("Y"))).toBe(true);
  });

  it("returns true for a class constructor", () => {
    class Z {}
    expect(isToken(Z)).toBe(true);
  });

  it("returns false for a plain object", () => {
    expect(isToken({ name: "X" })).toBe(false);
  });

  it("returns false for a non-class function", () => {
    expect(isToken(() => undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests, expect fail**

```bash
npm test -- src/infrastructure/di/token.test.ts
```

Expected: tests fail (no `token.ts`).

- [ ] **Step 3: Implement token.ts**

```ts
// src/infrastructure/di/token.ts
const TOKEN_BRAND = Symbol("di.token");
const MULTI_TOKEN_BRAND = Symbol("di.multiToken");

export interface Token<T> {
  readonly [TOKEN_BRAND]: true;
  readonly name: string;
  readonly __type?: T;
}

export interface MultiToken<T> {
  readonly [MULTI_TOKEN_BRAND]: true;
  readonly name: string;
  readonly __type?: T;
}

export type Class<T> = new (...args: never[]) => T;

export type TokenLike<T> = Token<T> | Class<T>;

export type AnyTokenLike = Token<unknown> | MultiToken<unknown> | Class<unknown>;

export function createToken<T>(name: string): Token<T> {
  return { [TOKEN_BRAND]: true, name };
}

export function createMultiToken<T>(name: string): MultiToken<T> {
  return { [MULTI_TOKEN_BRAND]: true, name };
}

export function isToken(value: unknown): value is AnyTokenLike {
  if (typeof value === "function") {
    return isClassConstructor(value);
  }
  if (typeof value !== "object" || value === null) return false;
  return TOKEN_BRAND in value || MULTI_TOKEN_BRAND in value;
}

export type TokenKind = "single" | "multi";

export function tokenKind(token: AnyTokenLike): TokenKind {
  if (typeof token === "function") return "single";
  if (MULTI_TOKEN_BRAND in token) return "multi";
  return "single";
}

export function tokenName(token: AnyTokenLike): string {
  if (typeof token === "function") return token.name || "anonymous-class";
  return token.name;
}

function isClassConstructor(fn: Function): boolean {
  const source = Function.prototype.toString.call(fn);
  return source.startsWith("class");
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npm test -- src/infrastructure/di/token.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Lint + types**

```bash
npm run check:types && npm run check:lint -- src/infrastructure/di/token.ts src/infrastructure/di/token.test.ts
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/di/token.ts src/infrastructure/di/token.test.ts
git commit -m "feat(di): add Token, MultiToken, and identity helpers"
```

---

## Task 4: Errors

**Files:**

- Create: `src/infrastructure/di/errors.ts`
- Create: `src/infrastructure/di/errors.test.ts`

Per memory, errors live in `errors.ts`. We test the carried data (chain, token name, received value) — not bare `instanceof Error` (trivial, banned by memory).

- [ ] **Step 1: Write failing tests**

```ts
// src/infrastructure/di/errors.test.ts
import { describe, expect, it } from "vitest";

import {
  CircularDependencyError,
  ContainerDisposedError,
  DuplicateRegistrationError,
  InvalidTokenError,
  NoInjectionContextError,
  ScopedResolutionOutsideScopeError,
  TokenNotRegisteredError,
} from "./errors";
import { createToken } from "./token";

describe("TokenNotRegisteredError", () => {
  it("carries the token name and the resolution chain", () => {
    const t = createToken("Foo");
    const err = new TokenNotRegisteredError(t, ["A", "B"]);
    expect(err.tokenName).toBe("Foo");
    expect(err.chain).toEqual(["A", "B"]);
    expect(err.message).toContain("Foo");
  });
});

describe("DuplicateRegistrationError", () => {
  it("carries the duplicated token name", () => {
    const t = createToken("Bar");
    const err = new DuplicateRegistrationError(t);
    expect(err.tokenName).toBe("Bar");
  });
});

describe("CircularDependencyError", () => {
  it("carries the chain showing the cycle", () => {
    const err = new CircularDependencyError(["A", "B", "A"]);
    expect(err.chain).toEqual(["A", "B", "A"]);
    expect(err.message).toMatch(/A.*B.*A/);
  });
});

describe("NoInjectionContextError", () => {
  it("identifies the failing call", () => {
    const err = new NoInjectionContextError("inject(Foo)");
    expect(err.callsite).toBe("inject(Foo)");
  });
});

describe("ContainerDisposedError", () => {
  it("constructs without arguments", () => {
    const err = new ContainerDisposedError();
    expect(err.message).toContain("disposed");
  });
});

describe("ScopedResolutionOutsideScopeError", () => {
  it("carries the offending scoped token", () => {
    const t = createToken("Scoped");
    const err = new ScopedResolutionOutsideScopeError(t);
    expect(err.tokenName).toBe("Scoped");
  });
});

describe("InvalidTokenError", () => {
  it("records the offending value", () => {
    const err = new InvalidTokenError({ name: "fake" });
    expect(err.received).toEqual({ name: "fake" });
  });
});
```

- [ ] **Step 2: Run tests, expect fail**

```bash
npm test -- src/infrastructure/di/errors.test.ts
```

- [ ] **Step 3: Implement errors.ts**

```ts
// src/infrastructure/di/errors.ts
import { type AnyTokenLike, tokenName } from "./token";

export class TokenNotRegisteredError extends Error {
  readonly tokenName: string;
  readonly chain: readonly string[];

  constructor(token: AnyTokenLike, chain: readonly string[]) {
    const name = tokenName(token);
    super(`Token "${name}" is not registered. Resolution chain: [${chain.join(" -> ") || "(empty)"}]`);
    this.name = "TokenNotRegisteredError";
    this.tokenName = name;
    this.chain = chain;
  }
}

export class DuplicateRegistrationError extends Error {
  readonly tokenName: string;

  constructor(token: AnyTokenLike) {
    const name = tokenName(token);
    super(
      `Token "${name}" already has a single-binding registration. Use createMultiToken for multi-binding semantics.`,
    );
    this.name = "DuplicateRegistrationError";
    this.tokenName = name;
  }
}

export class CircularDependencyError extends Error {
  readonly chain: readonly string[];

  constructor(chain: readonly string[]) {
    super(`Circular dependency detected: ${chain.join(" -> ")}`);
    this.name = "CircularDependencyError";
    this.chain = chain;
  }
}

export class NoInjectionContextError extends Error {
  readonly callsite: string | undefined;

  constructor(callsite?: string) {
    super(
      callsite
        ? `${callsite} called outside any active resolution context.`
        : "inject() called outside any active resolution context.",
    );
    this.name = "NoInjectionContextError";
    this.callsite = callsite;
  }
}

export class ContainerDisposedError extends Error {
  constructor() {
    super("Operation attempted on a disposed container or scope.");
    this.name = "ContainerDisposedError";
  }
}

export class ScopedResolutionOutsideScopeError extends Error {
  readonly tokenName: string;

  constructor(token: AnyTokenLike) {
    const name = tokenName(token);
    super(`Scoped token "${name}" cannot be resolved from the root container. Create a scope first.`);
    this.name = "ScopedResolutionOutsideScopeError";
    this.tokenName = name;
  }
}

export class InvalidTokenError extends Error {
  readonly received: unknown;

  constructor(received: unknown) {
    super(`Expected a Token, MultiToken, or class constructor; received ${describe(received)}.`);
    this.name = "InvalidTokenError";
    this.received = received;
  }
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "object") return "object";
  return typeof value;
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npm test -- src/infrastructure/di/errors.test.ts
```

- [ ] **Step 5: Lint + types**

```bash
npm run check:types && npm run check:lint -- src/infrastructure/di/errors.ts src/infrastructure/di/errors.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/di/errors.ts src/infrastructure/di/errors.test.ts
git commit -m "feat(di): add DI error subclasses"
```

---

## Task 5: inject() + resolution-context stack

**Files:**

- Create: `src/infrastructure/di/inject.ts`
- Create: `src/infrastructure/di/inject.test.ts`

A module-level stack tracks the current resolver. `inject()` reads the top. `withResolutionContext` pushes/pops around factory calls. Cycle detection lives here so it works across container/scope boundaries.

- [ ] **Step 1: Write failing tests**

```ts
// src/infrastructure/di/inject.test.ts
import { describe, expect, it, vi } from "vitest";

import { CircularDependencyError, NoInjectionContextError } from "./errors";
import { inject, withResolutionContext, type Resolver } from "./inject";
import { createMultiToken, createToken } from "./token";

function fakeResolver(overrides: Partial<Resolver> = {}): Resolver {
  return {
    resolve: vi.fn(),
    ...overrides,
  } as Resolver;
}

describe("inject", () => {
  it("throws NoInjectionContextError when called outside any active context", () => {
    expect(() => inject(createToken("X"))).toThrow(NoInjectionContextError);
  });

  it("delegates to the current resolver inside a context", () => {
    const resolveSpy = vi.fn().mockReturnValue("value");
    const resolver = fakeResolver({ resolve: resolveSpy });
    const token = createToken<string>("X");
    const result = withResolutionContext(resolver, token, () => inject(token));
    expect(result).toBe("value");
    expect(resolveSpy).toHaveBeenCalledWith(token);
  });

  it("returns an array when given a multi-token", () => {
    const resolveSpy = vi.fn().mockReturnValue(["a", "b"]);
    const resolver = fakeResolver({ resolve: resolveSpy });
    const token = createMultiToken<string>("Many");
    const result = withResolutionContext(resolver, token, () => inject(token));
    expect(result).toEqual(["a", "b"]);
  });
});

describe("withResolutionContext", () => {
  it("uses the innermost resolver when contexts nest", () => {
    const outerSpy = vi.fn();
    const innerSpy = vi.fn().mockReturnValue("inner");
    const outer = fakeResolver({ resolve: outerSpy });
    const inner = fakeResolver({ resolve: innerSpy });
    const t = createToken<string>("X");
    const result = withResolutionContext(outer, t, () => withResolutionContext(inner, t, () => inject(t)));
    expect(result).toBe("inner");
    expect(outerSpy).not.toHaveBeenCalled();
  });

  it("pops the context after the callback returns", () => {
    const t = createToken("X");
    withResolutionContext(fakeResolver(), t, () => undefined);
    expect(() => inject(createToken("Y"))).toThrow(NoInjectionContextError);
  });

  it("pops the context after the callback throws", () => {
    const t = createToken("X");
    expect(() =>
      withResolutionContext(fakeResolver(), t, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(() => inject(createToken("Y"))).toThrow(NoInjectionContextError);
  });

  it("throws CircularDependencyError when the same token re-enters the stack", () => {
    const t = createToken("A");
    expect(() =>
      withResolutionContext(fakeResolver(), t, () => withResolutionContext(fakeResolver(), t, () => undefined)),
    ).toThrow(CircularDependencyError);
  });

  it("preserves the chain in the CircularDependencyError", () => {
    const a = createToken("A");
    const b = createToken("B");
    let captured: CircularDependencyError | undefined;
    try {
      withResolutionContext(fakeResolver(), a, () =>
        withResolutionContext(fakeResolver(), b, () => withResolutionContext(fakeResolver(), a, () => undefined)),
      );
    } catch (err) {
      captured = err as CircularDependencyError;
    }
    expect(captured).toBeInstanceOf(CircularDependencyError);
    expect(captured?.chain).toEqual(["A", "B", "A"]);
  });
});
```

- [ ] **Step 2: Run tests, expect fail**

```bash
npm test -- src/infrastructure/di/inject.test.ts
```

- [ ] **Step 3: Implement inject.ts**

```ts
// src/infrastructure/di/inject.ts
import { CircularDependencyError, NoInjectionContextError } from "./errors";
import { type AnyTokenLike, type MultiToken, type Token, type TokenLike, tokenName } from "./token";

export interface Resolver {
  resolve<T>(token: TokenLike<T>): T;
  resolve<T>(token: MultiToken<T>): T[];
}

const resolverStack: Resolver[] = [];
const chain: string[] = [];

export function inject<T>(token: TokenLike<T>): T;
export function inject<T>(token: MultiToken<T>): T[];
export function inject(token: AnyTokenLike): unknown {
  const resolver = resolverStack.at(-1);
  if (!resolver) {
    throw new NoInjectionContextError(`inject(${tokenName(token)})`);
  }
  return resolver.resolve(token as Token<unknown>);
}

export function withResolutionContext<T>(resolver: Resolver, token: AnyTokenLike, callback: () => T): T {
  const name = tokenName(token);
  if (chain.includes(name)) {
    throw new CircularDependencyError([...chain, name]);
  }
  resolverStack.push(resolver);
  chain.push(name);
  try {
    return callback();
  } finally {
    chain.pop();
    resolverStack.pop();
  }
}

export function currentResolver(): Resolver | undefined {
  return resolverStack.at(-1);
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npm test -- src/infrastructure/di/inject.test.ts
```

- [ ] **Step 5: Lint + types**

```bash
npm run check:types && npm run check:lint -- src/infrastructure/di/inject.ts src/infrastructure/di/inject.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/di/inject.ts src/infrastructure/di/inject.test.ts
git commit -m "feat(di): add inject() and resolution-context stack"
```

---

## Task 6: RegistrationBuilder

**Files:**

- Create: `src/infrastructure/di/registration.ts`
- Create: `src/infrastructure/di/registration.test.ts`

The builder collects: factory function (from useClass/useFactory/useValue), lifetime (default Container), eager flag. Every state change notifies an `onChange` callback once a terminal method has been called. The Container uses this to commit on first notification (with duplicate-detection) and update in place on subsequent notifications (so `.lifetime()`/`.eager()` after a terminal don't re-trigger duplicate-detection).

- [ ] **Step 1: Write failing tests**

```ts
// src/infrastructure/di/registration.test.ts
import { describe, expect, it, vi } from "vitest";

import { Lifetime } from "./lifetime";
import { type RegistrationEntry, RegistrationBuilder } from "./registration";

function captureEntries<T>(): { entries: RegistrationEntry<T>[]; onChange: (e: RegistrationEntry<T>) => void } {
  const entries: RegistrationEntry<T>[] = [];
  return { entries, onChange: (e) => entries.push(e) };
}

describe("RegistrationBuilder", () => {
  it("emits no entry until a terminal method is called", () => {
    const { entries, onChange } = captureEntries<string>();
    const b = new RegistrationBuilder<string>(onChange);
    b.lifetime(Lifetime.Transient).eager();
    expect(entries).toEqual([]);
  });

  it("emits an entry whose factory builds an instance of the class given to useClass", () => {
    class Foo {
      hello = "hi";
    }
    const { entries, onChange } = captureEntries<Foo>();
    new RegistrationBuilder<Foo>(onChange).useClass(Foo);
    expect(entries).toHaveLength(1);
    const instance = entries[0].factory();
    expect(instance).toBeInstanceOf(Foo);
    expect(instance.hello).toBe("hi");
  });

  it("emits an entry whose factory returns what useFactory provided", () => {
    const { entries, onChange } = captureEntries<number>();
    new RegistrationBuilder<number>(onChange).useFactory(() => 42);
    expect(entries[0].factory()).toBe(42);
  });

  it("emits an entry whose factory returns the literal given to useValue", () => {
    const v = { id: 7 };
    const { entries, onChange } = captureEntries<typeof v>();
    new RegistrationBuilder<typeof v>(onChange).useValue(v);
    expect(entries[0].factory()).toBe(v);
  });

  it("defaults the emitted lifetime to Container", () => {
    const { entries, onChange } = captureEntries<string>();
    new RegistrationBuilder<string>(onChange).useValue("x");
    expect(entries.at(-1)?.lifetime).toBe(Lifetime.Container);
  });

  it("re-emits with the new lifetime when .lifetime() is called after a terminal", () => {
    const { entries, onChange } = captureEntries<string>();
    new RegistrationBuilder<string>(onChange).useValue("x").lifetime(Lifetime.Transient);
    expect(entries).toHaveLength(2);
    expect(entries.at(-1)?.lifetime).toBe(Lifetime.Transient);
  });

  it("re-emits with eager=true when .eager() is called after a terminal", () => {
    const { entries, onChange } = captureEntries<string>();
    new RegistrationBuilder<string>(onChange).useValue("x").eager();
    expect(entries.at(-1)?.eager).toBe(true);
  });

  it("defaults eager to false", () => {
    const { entries, onChange } = captureEntries<string>();
    new RegistrationBuilder<string>(onChange).useValue("x");
    expect(entries.at(-1)?.eager).toBe(false);
  });

  it("uses the latest terminal-method factory when more than one is called", () => {
    const { entries, onChange } = captureEntries<string>();
    new RegistrationBuilder<string>(onChange).useValue("first").useFactory(() => "second");
    expect(entries.at(-1)?.factory()).toBe("second");
  });
});
```

- [ ] **Step 2: Run tests, expect fail**

```bash
npm test -- src/infrastructure/di/registration.test.ts
```

- [ ] **Step 3: Implement registration.ts**

```ts
// src/infrastructure/di/registration.ts
import { Lifetime } from "./lifetime";
import { type Class } from "./token";

export interface RegistrationEntry<T> {
  readonly factory: () => T;
  readonly lifetime: Lifetime;
  readonly eager: boolean;
}

export type OnRegistrationChange<T> = (entry: RegistrationEntry<T>) => void;

export class RegistrationBuilder<T> {
  #factory: (() => T) | undefined;
  #lifetime: Lifetime = Lifetime.Container;
  #eager = false;
  readonly #onChange: OnRegistrationChange<T>;

  constructor(onChange: OnRegistrationChange<T>) {
    this.#onChange = onChange;
  }

  useClass(ctor: Class<T>): this {
    this.#factory = () => new ctor();
    this.#notify();
    return this;
  }

  useFactory(factory: () => T): this {
    this.#factory = factory;
    this.#notify();
    return this;
  }

  useValue(value: T): this {
    this.#factory = () => value;
    this.#notify();
    return this;
  }

  lifetime(lifetime: Lifetime): this {
    this.#lifetime = lifetime;
    this.#notify();
    return this;
  }

  eager(): this {
    this.#eager = true;
    this.#notify();
    return this;
  }

  #notify(): void {
    if (!this.#factory) return;
    this.#onChange({
      factory: this.#factory,
      lifetime: this.#lifetime,
      eager: this.#eager,
    });
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npm test -- src/infrastructure/di/registration.test.ts
```

- [ ] **Step 5: Lint + types**

```bash
npm run check:types && npm run check:lint -- src/infrastructure/di/registration.ts src/infrastructure/di/registration.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/di/registration.ts src/infrastructure/di/registration.test.ts
git commit -m "feat(di): add RegistrationBuilder with onChange notification"
```

---

## Task 7: Container core (register + resolve, Container lifetime, single tokens)

**Files:**

- Create: `src/infrastructure/di/container.ts`
- Create: `src/infrastructure/di/container.test.ts`

Container holds a `Map<token-ref, RegistrationEntry[]>`. For single tokens, the array length is 1. `resolve` runs the factory inside `withResolutionContext`, caches per Lifetime.Container.

- [ ] **Step 1: Write failing tests (subset for this task)**

```ts
// src/infrastructure/di/container.test.ts
import { describe, expect, it } from "vitest";

import { Container } from "./container";
import {
  ContainerDisposedError,
  DuplicateRegistrationError,
  InvalidTokenError,
  TokenNotRegisteredError,
} from "./errors";
import { inject } from "./inject";
import { createToken } from "./token";

describe("Container.register + resolve (Container lifetime, single)", () => {
  it("resolves a useValue binding back to the literal", () => {
    const c = new Container();
    const t = createToken<string>("Greeting");
    c.register(t).useValue("hi");
    expect(c.resolve(t)).toBe("hi");
  });

  it("resolves a useClass binding to an instance of the class", () => {
    class Service {
      readonly id = 1;
    }
    const c = new Container();
    const t = createToken<Service>("Service");
    c.register(t).useClass(Service);
    expect(c.resolve(t)).toBeInstanceOf(Service);
  });

  it("resolves a useFactory binding by calling the factory", () => {
    const c = new Container();
    const t = createToken<number>("N");
    c.register(t).useFactory(() => 7);
    expect(c.resolve(t)).toBe(7);
  });

  it("returns the same instance for a Container-lifetime binding on every resolve", () => {
    class Service {}
    const c = new Container();
    const t = createToken<Service>("S");
    c.register(t).useClass(Service);
    expect(c.resolve(t)).toBe(c.resolve(t));
  });

  it("wires dependencies via inject() inside a factory", () => {
    const c = new Container();
    const dep = createToken<string>("Dep");
    const top = createToken<string>("Top");
    c.register(dep).useValue("d-value");
    c.register(top).useFactory(() => inject(dep) + "-wrapped");
    expect(c.resolve(top)).toBe("d-value-wrapped");
  });

  it("supports a class as its own token", () => {
    class Service {
      readonly id = 9;
    }
    const c = new Container();
    c.register(Service).useClass(Service);
    expect(c.resolve(Service)).toBeInstanceOf(Service);
  });

  it("throws TokenNotRegisteredError when resolving an unbound token", () => {
    const c = new Container();
    expect(() => c.resolve(createToken("Missing"))).toThrow(TokenNotRegisteredError);
  });

  it("throws DuplicateRegistrationError on a second register for a single-binding token", () => {
    const c = new Container();
    const t = createToken<string>("X");
    c.register(t).useValue("a");
    expect(() => c.register(t).useValue("b")).toThrow(DuplicateRegistrationError);
  });

  it("throws InvalidTokenError when register is given a non-token", () => {
    const c = new Container();
    expect(() => c.register({ name: "fake" } as never)).toThrow(InvalidTokenError);
  });

  it("throws ContainerDisposedError after dispose()", async () => {
    const c = new Container();
    await c.dispose();
    expect(() => c.resolve(createToken("X"))).toThrow(ContainerDisposedError);
    expect(() => c.register(createToken("Y"))).toThrow(ContainerDisposedError);
  });
});
```

- [ ] **Step 2: Run tests, expect fail**

```bash
npm test -- src/infrastructure/di/container.test.ts
```

- [ ] **Step 3: Implement container.ts**

```ts
// src/infrastructure/di/container.ts
import { match } from "ts-pattern";

import {
  ContainerDisposedError,
  DuplicateRegistrationError,
  InvalidTokenError,
  TokenNotRegisteredError,
} from "./errors";
import { type Resolver, withResolutionContext } from "./inject";
import { Lifetime } from "./lifetime";
import { type RegistrationEntry, RegistrationBuilder } from "./registration";
import { type AnyTokenLike, isToken, type MultiToken, type TokenLike, tokenKind } from "./token";

export interface StoredEntry {
  entry: RegistrationEntry<unknown>;
  instance: unknown;
  hasInstance: boolean;
  readonly registrationIndex: number;
}

export class Container implements Resolver {
  readonly #registry = new Map<AnyTokenLike, StoredEntry[]>();
  #disposed = false;
  #registrationCounter = 0;

  register<T>(token: TokenLike<T>): RegistrationBuilder<T>;
  register<T>(token: MultiToken<T>): RegistrationBuilder<T>;
  register<T>(token: AnyTokenLike): RegistrationBuilder<T> {
    this.#ensureNotDisposed();
    if (!isToken(token)) throw new InvalidTokenError(token);
    let stored: StoredEntry | undefined;
    return new RegistrationBuilder<T>((entry) => {
      if (stored) {
        stored.entry = entry as RegistrationEntry<unknown>;
        return;
      }
      stored = this.#commitNew(token, entry as RegistrationEntry<unknown>);
    });
  }

  #commitNew(token: AnyTokenLike, entry: RegistrationEntry<unknown>): StoredEntry {
    const stored: StoredEntry = {
      entry,
      instance: undefined,
      hasInstance: false,
      registrationIndex: this.#registrationCounter++,
    };
    const list = this.#registry.get(token) ?? [];
    match(tokenKind(token))
      .with("single", () => {
        if (list.length > 0) throw new DuplicateRegistrationError(token);
        this.#registry.set(token, [stored]);
      })
      .with("multi", () => {
        list.push(stored);
        this.#registry.set(token, list);
      })
      .exhaustive();
    return stored;
  }

  resolve<T>(token: TokenLike<T>): T;
  resolve<T>(token: MultiToken<T>): T[];
  resolve<T>(token: AnyTokenLike): unknown {
    this.#ensureNotDisposed();
    const stored = this.#registry.get(token);
    if (!stored || stored.length === 0) {
      throw new TokenNotRegisteredError(token, []);
    }
    return match(tokenKind(token))
      .with("single", () => this.#resolveSingle(token, stored[0]))
      .with("multi", () => stored.map((s) => this.#resolveSingle(token, s)))
      .exhaustive();
  }

  #resolveSingle(token: AnyTokenLike, stored: StoredEntry): unknown {
    if (stored.entry.lifetime === Lifetime.Container && stored.hasInstance) {
      return stored.instance;
    }
    const instance = withResolutionContext(this, token, () => stored.entry.factory());
    if (stored.entry.lifetime === Lifetime.Container) {
      stored.instance = instance;
      stored.hasInstance = true;
    }
    return instance;
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#registry.clear();
  }

  #ensureNotDisposed(): void {
    if (this.#disposed) throw new ContainerDisposedError();
  }
}
```

> **Why the onChange callback:** the builder is fluent (`.useValue(x).lifetime(...).eager()`), and each modifier call after the terminal must update the stored entry. We commit on the _first_ notification (which fires the duplicate-detection for single tokens) and then update in place on every subsequent notification. The `stored` closure variable carries that "have I committed yet?" state.

- [ ] **Step 4: Run tests, expect pass**

```bash
npm test -- src/infrastructure/di/container.test.ts
```

- [ ] **Step 5: Lint + types**

```bash
npm run check:types && npm run check:lint -- src/infrastructure/di/container.ts src/infrastructure/di/container.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/di/container.ts src/infrastructure/di/container.test.ts
git commit -m "feat(di): add Container with register and resolve for single-bindings"
```

---

## Task 8: Transient lifetime

**Files:**

- Modify: `src/infrastructure/di/container.test.ts`

The Container already honors `Lifetime.Container`. Transient just bypasses the cache. Tests confirm.

- [ ] **Step 1: Add failing tests to container.test.ts**

Append to `container.test.ts`:

```ts
import { Lifetime } from "./lifetime";

describe("Container.resolve (Transient lifetime)", () => {
  it("returns a fresh instance on every resolve when lifetime is Transient", () => {
    class Service {
      readonly id = Math.random();
    }
    const c = new Container();
    const t = createToken<Service>("S");
    c.register(t).useClass(Service).lifetime(Lifetime.Transient);
    expect(c.resolve(t)).not.toBe(c.resolve(t));
  });

  it("still injects deps for Transient bindings", () => {
    const c = new Container();
    const dep = createToken<number>("Dep");
    const top = createToken<number>("Top");
    c.register(dep).useValue(3);
    c.register(top)
      .useFactory(() => inject(dep) * 2)
      .lifetime(Lifetime.Transient);
    expect(c.resolve(top)).toBe(6);
    expect(c.resolve(top)).toBe(6);
  });
});
```

- [ ] **Step 2: Run tests, expect pass**

The existing container logic already handles Transient correctly (cache-skip when `lifetime !== Container`). Verify:

```bash
npm test -- src/infrastructure/di/container.test.ts
```

Expected: all tests pass with no implementation change.

If the new tests fail, the implementation logic in `#resolveSingle` is wrong — re-check the cache condition.

- [ ] **Step 3: Lint + types**

```bash
npm run check:types && npm run check:lint -- src/infrastructure/di/container.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/infrastructure/di/container.test.ts
git commit -m "test(di): cover Transient lifetime in Container"
```

---

## Task 9: Multi-token bindings

**Files:**

- Modify: `src/infrastructure/di/container.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `container.test.ts`:

```ts
import { createMultiToken } from "./token";

describe("Container.resolve (multi tokens)", () => {
  it("collects multiple registrations into an array in registration order", () => {
    const c = new Container();
    const t = createMultiToken<string>("Plugins");
    c.register(t).useValue("a");
    c.register(t).useValue("b");
    c.register(t).useValue("c");
    expect(c.resolve(t)).toEqual(["a", "b", "c"]);
  });

  it("throws TokenNotRegisteredError when a multi-token has no bindings", () => {
    const c = new Container();
    const t = createMultiToken<string>("Plugins");
    expect(() => c.resolve(t)).toThrow(TokenNotRegisteredError);
  });

  it("resolves a multi-token to an array via inject() inside a factory", () => {
    const c = new Container();
    const items = createMultiToken<string>("Items");
    const list = createToken<string[]>("List");
    c.register(items).useValue("x");
    c.register(items).useValue("y");
    c.register(list).useFactory(() => inject(items));
    expect(c.resolve(list)).toEqual(["x", "y"]);
  });

  it("does not throw DuplicateRegistrationError when registering the same multi-token twice", () => {
    const c = new Container();
    const t = createMultiToken<string>("Plugins");
    c.register(t).useValue("a");
    expect(() => c.register(t).useValue("b")).not.toThrow();
  });
});
```

> **Decision:** an empty multi-token resolves to `TokenNotRegisteredError` rather than `[]`. Zero bindings typically signals a wiring mistake — a loud error surfaces it.

- [ ] **Step 2: Run tests**

```bash
npm test -- src/infrastructure/di/container.test.ts
```

Existing implementation should pass; if not, verify the `#commitNew` multi branch appends rather than replaces.

- [ ] **Step 3: Lint + types**

```bash
npm run check:types && npm run check:lint -- src/infrastructure/di/container.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/infrastructure/di/container.test.ts
git commit -m "test(di): cover multi-token bindings"
```

---

## Task 10: Cycle detection

**Files:**

- Modify: `src/infrastructure/di/container.test.ts`

Cycle detection is implemented in `inject.ts` (Task 5). This task verifies it surfaces correctly through Container resolves.

- [ ] **Step 1: Add failing tests**

Append to `container.test.ts`:

```ts
import { CircularDependencyError } from "./errors";

describe("Container.resolve (cycle detection)", () => {
  it("throws CircularDependencyError when A depends on B and B depends on A", () => {
    const c = new Container();
    const a = createToken<unknown>("A");
    const b = createToken<unknown>("B");
    c.register(a).useFactory(() => ({ b: inject(b) }));
    c.register(b).useFactory(() => ({ a: inject(a) }));
    expect(() => c.resolve(a)).toThrow(CircularDependencyError);
  });

  it("reports the offending chain in the CircularDependencyError", () => {
    const c = new Container();
    const a = createToken<unknown>("A");
    const b = createToken<unknown>("B");
    c.register(a).useFactory(() => ({ b: inject(b) }));
    c.register(b).useFactory(() => ({ a: inject(a) }));
    try {
      c.resolve(a);
      throw new Error("expected to throw");
    } catch (err) {
      expect((err as CircularDependencyError).chain).toEqual(["A", "B", "A"]);
    }
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npm test -- src/infrastructure/di/container.test.ts
```

Expected: passes (cycle detection is already in `withResolutionContext`).

- [ ] **Step 3: Commit**

```bash
git add src/infrastructure/di/container.test.ts
git commit -m "test(di): cover circular-dependency detection in Container"
```

---

## Task 11: Eager bindings + autoLoad

**Files:**

- Modify: `src/infrastructure/di/container.ts`
- Modify: `src/infrastructure/di/container.test.ts`

`autoLoad()` walks all stored entries in registration order; resolves each that is `eager` and not yet instantiated.

- [ ] **Step 1: Add failing tests**

Append to `container.test.ts`:

```ts
describe("Container.autoLoad", () => {
  it("resolves eager bindings without an explicit resolve()", async () => {
    const c = new Container();
    const events: string[] = [];
    class Eager {
      constructor() {
        events.push("constructed");
      }
    }
    c.register(Eager).useClass(Eager).eager();
    expect(events).toEqual([]);
    await c.autoLoad();
    expect(events).toEqual(["constructed"]);
  });

  it("does not resolve non-eager bindings", async () => {
    const c = new Container();
    let constructed = false;
    class Lazy {
      constructor() {
        constructed = true;
      }
    }
    c.register(Lazy).useClass(Lazy);
    await c.autoLoad();
    expect(constructed).toBe(false);
  });

  it("resolves eager bindings in registration order", async () => {
    const c = new Container();
    const order: string[] = [];
    const A = createToken<unknown>("A");
    const B = createToken<unknown>("B");
    c.register(A)
      .useFactory(() => {
        order.push("A");
        return {};
      })
      .eager();
    c.register(B)
      .useFactory(() => {
        order.push("B");
        return {};
      })
      .eager();
    await c.autoLoad();
    expect(order).toEqual(["A", "B"]);
  });

  it("shares Container-lifetime instances between eager autoLoad and later resolve", async () => {
    const c = new Container();
    class Service {}
    c.register(Service).useClass(Service).eager();
    await c.autoLoad();
    const first = c.resolve(Service);
    expect(c.resolve(Service)).toBe(first);
  });

  it("lets a later eager binding inject() an earlier eager sibling", async () => {
    const c = new Container();
    const counter = createToken<{ n: number }>("Counter");
    const incrementer = createToken<{ go: () => void }>("Incrementer");
    c.register(counter)
      .useFactory(() => ({ n: 0 }))
      .eager();
    c.register(incrementer)
      .useFactory(() => {
        const ctr = inject(counter);
        ctr.n += 1;
        return {
          go: () => {
            ctr.n += 1;
          },
        };
      })
      .eager();
    await c.autoLoad();
    expect(c.resolve(counter).n).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests, expect fail**

```bash
npm test -- src/infrastructure/di/container.test.ts
```

- [ ] **Step 3: Add autoLoad to Container**

Add to the `Container` class body in `container.ts` (after `resolve`):

```ts
  async autoLoad(): Promise<void> {
    this.#ensureNotDisposed();
    const ordered = [...this.#registry.entries()]
      .flatMap(([token, list]) => list.map((stored) => ({ token, stored })))
      .filter(({ stored }) => stored.entry.eager && !stored.hasInstance)
      .sort((a, b) => a.stored.registrationIndex - b.stored.registrationIndex);
    for (const { token, stored } of ordered) {
      this.#resolveSingle(token, stored as StoredEntry<unknown>);
    }
  }
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npm test -- src/infrastructure/di/container.test.ts
```

- [ ] **Step 5: Lint + types**

```bash
npm run check:types && npm run check:lint -- src/infrastructure/di/container.ts src/infrastructure/di/container.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/di/container.ts src/infrastructure/di/container.test.ts
git commit -m "feat(di): add eager bindings and autoLoad()"
```

---

## Task 12: dispose() and Symbol.dispose teardown

**Files:**

- Modify: `src/infrastructure/di/container.ts`
- Modify: `src/infrastructure/di/container.test.ts`

`dispose()` walks resolved instances in reverse registration order, calls `[Symbol.asyncDispose]()` (preferred) or `[Symbol.dispose]()`, collects errors, rejects with `AggregateError` if any threw.

- [ ] **Step 1: Add failing tests**

Append to `container.test.ts`:

```ts
describe("Container.dispose", () => {
  it("calls Symbol.dispose on resolved instances that implement it", async () => {
    const calls: string[] = [];
    class Service {
      [Symbol.dispose]() {
        calls.push("disposed");
      }
    }
    const c = new Container();
    c.register(Service).useClass(Service);
    c.resolve(Service);
    await c.dispose();
    expect(calls).toEqual(["disposed"]);
  });

  it("awaits Symbol.asyncDispose when present", async () => {
    const calls: string[] = [];
    class Service {
      async [Symbol.asyncDispose]() {
        await Promise.resolve();
        calls.push("async-disposed");
      }
    }
    const c = new Container();
    c.register(Service).useClass(Service);
    c.resolve(Service);
    await c.dispose();
    expect(calls).toEqual(["async-disposed"]);
  });

  it("prefers Symbol.asyncDispose over Symbol.dispose when both are defined", async () => {
    const calls: string[] = [];
    class Service {
      [Symbol.dispose]() {
        calls.push("sync");
      }
      async [Symbol.asyncDispose]() {
        calls.push("async");
      }
    }
    const c = new Container();
    c.register(Service).useClass(Service);
    c.resolve(Service);
    await c.dispose();
    expect(calls).toEqual(["async"]);
  });

  it("disposes in reverse registration order", async () => {
    const order: string[] = [];
    class A {
      [Symbol.dispose]() {
        order.push("A");
      }
    }
    class B {
      [Symbol.dispose]() {
        order.push("B");
      }
    }
    class C {
      [Symbol.dispose]() {
        order.push("C");
      }
    }
    const c = new Container();
    c.register(A).useClass(A);
    c.resolve(A);
    c.register(B).useClass(B);
    c.resolve(B);
    c.register(C).useClass(C);
    c.resolve(C);
    await c.dispose();
    expect(order).toEqual(["C", "B", "A"]);
  });

  it("skips instances that have neither Symbol.dispose nor Symbol.asyncDispose", async () => {
    class Plain {}
    const c = new Container();
    c.register(Plain).useClass(Plain);
    c.resolve(Plain);
    await expect(c.dispose()).resolves.toBeUndefined();
  });

  it("skips bindings that were registered but never resolved", async () => {
    const calls: string[] = [];
    class Service {
      [Symbol.dispose]() {
        calls.push("disposed");
      }
    }
    const c = new Container();
    c.register(Service).useClass(Service);
    await c.dispose();
    expect(calls).toEqual([]);
  });

  it("runs every dispose even when an earlier one throws, then rejects with AggregateError", async () => {
    const order: string[] = [];
    class A {
      [Symbol.dispose]() {
        order.push("A");
        throw new Error("A-boom");
      }
    }
    class B {
      [Symbol.dispose]() {
        order.push("B");
      }
    }
    const c = new Container();
    c.register(A).useClass(A);
    c.resolve(A);
    c.register(B).useClass(B);
    c.resolve(B);
    await expect(c.dispose()).rejects.toBeInstanceOf(AggregateError);
    expect(order).toEqual(["B", "A"]);
  });

  it("is idempotent — second dispose() resolves without re-running cleanup", async () => {
    const calls: string[] = [];
    class Service {
      [Symbol.dispose]() {
        calls.push("disposed");
      }
    }
    const c = new Container();
    c.register(Service).useClass(Service);
    c.resolve(Service);
    await c.dispose();
    await c.dispose();
    expect(calls).toEqual(["disposed"]);
  });
});
```

- [ ] **Step 2: Run tests, expect fail**

```bash
npm test -- src/infrastructure/di/container.test.ts
```

- [ ] **Step 3: Replace dispose() with the full implementation**

In `container.ts`, replace the existing `dispose()` method body with:

```ts
  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    const stored = [...this.#registry.values()].flat();
    const resolved = stored
      .filter((s) => s.hasInstance && s.instance != null)
      .sort((a, b) => b.registrationIndex - a.registrationIndex);
    const errors: unknown[] = [];
    for (const s of resolved) {
      try {
        await disposeInstance(s.instance);
      } catch (err) {
        errors.push(err);
      }
    }
    this.#registry.clear();
    if (errors.length > 0) {
      throw new AggregateError(errors, "One or more disposers failed.");
    }
  }
```

Add a free function at the bottom of `container.ts` (outside the class):

```ts
async function disposeInstance(instance: unknown): Promise<void> {
  if (instance == null || (typeof instance !== "object" && typeof instance !== "function")) return;
  const asAny = instance as { [Symbol.asyncDispose]?: () => Promise<void>; [Symbol.dispose]?: () => void };
  if (typeof asAny[Symbol.asyncDispose] === "function") {
    await asAny[Symbol.asyncDispose]!();
    return;
  }
  if (typeof asAny[Symbol.dispose] === "function") {
    asAny[Symbol.dispose]!();
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npm test -- src/infrastructure/di/container.test.ts
```

- [ ] **Step 5: Lint + types**

```bash
npm run check:types && npm run check:lint -- src/infrastructure/di/container.ts src/infrastructure/di/container.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/di/container.ts src/infrastructure/di/container.test.ts
git commit -m "feat(di): dispose() walks Symbol.(async)Dispose in reverse order"
```

---

## Task 13: Scope + Lifetime.Scoped

**Files:**

- Create: `src/infrastructure/di/scope.ts`
- Create: `src/infrastructure/di/scope.test.ts`
- Modify: `src/infrastructure/di/container.ts` (add `createScope()`)

Scope is a child resolver. For Container-lifetime bindings, it delegates to the parent. For Transient, it creates anew. For Scoped, it holds its own instance.

- [ ] **Step 1: Write failing tests**

```ts
// src/infrastructure/di/scope.test.ts
import { describe, expect, it } from "vitest";

import { Container } from "./container";
import { ContainerDisposedError, ScopedResolutionOutsideScopeError } from "./errors";
import { inject } from "./inject";
import { Lifetime } from "./lifetime";
import { createToken } from "./token";

describe("Container.createScope + Scope.resolve", () => {
  it("returns the same Container-lifetime instance as the parent container", () => {
    class Shared {}
    const c = new Container();
    c.register(Shared).useClass(Shared);
    const scope = c.createScope();
    expect(scope.resolve(Shared)).toBe(c.resolve(Shared));
  });

  it("returns a fresh Transient instance on every scope.resolve", () => {
    class Trans {}
    const c = new Container();
    c.register(Trans).useClass(Trans).lifetime(Lifetime.Transient);
    const scope = c.createScope();
    expect(scope.resolve(Trans)).not.toBe(scope.resolve(Trans));
  });

  it("returns one instance per scope for Scoped-lifetime bindings", () => {
    class Scoped {}
    const c = new Container();
    c.register(Scoped).useClass(Scoped).lifetime(Lifetime.Scoped);
    const s1 = c.createScope();
    const s2 = c.createScope();
    expect(s1.resolve(Scoped)).toBe(s1.resolve(Scoped));
    expect(s1.resolve(Scoped)).not.toBe(s2.resolve(Scoped));
  });

  it("throws ScopedResolutionOutsideScopeError when resolving a Scoped binding from the container", () => {
    class Scoped {}
    const c = new Container();
    c.register(Scoped).useClass(Scoped).lifetime(Lifetime.Scoped);
    expect(() => c.resolve(Scoped)).toThrow(ScopedResolutionOutsideScopeError);
  });

  it("lets Scoped factories inject Container-lifetime deps", () => {
    const dep = createToken<string>("Dep");
    class Scoped {
      readonly value = inject(dep);
    }
    const c = new Container();
    c.register(dep).useValue("v");
    c.register(Scoped).useClass(Scoped).lifetime(Lifetime.Scoped);
    const scope = c.createScope();
    expect(scope.resolve(Scoped).value).toBe("v");
  });
});

describe("Scope.dispose", () => {
  it("calls Symbol.dispose only on scope-resolved instances, not container-lifetime ones", async () => {
    const calls: string[] = [];
    class CScope {
      [Symbol.dispose]() {
        calls.push("c-scope");
      }
    }
    class Shared {
      [Symbol.dispose]() {
        calls.push("shared");
      }
    }
    const c = new Container();
    c.register(Shared).useClass(Shared);
    c.register(CScope).useClass(CScope).lifetime(Lifetime.Scoped);
    c.resolve(Shared);
    const scope = c.createScope();
    scope.resolve(CScope);
    scope.resolve(Shared);
    await scope.dispose();
    expect(calls).toEqual(["c-scope"]);
  });

  it("throws ContainerDisposedError after dispose", async () => {
    const c = new Container();
    const scope = c.createScope();
    await scope.dispose();
    expect(() => scope.resolve(createToken("X"))).toThrow(ContainerDisposedError);
  });
});
```

- [ ] **Step 2: Run tests, expect fail**

```bash
npm test -- src/infrastructure/di/scope.test.ts
```

- [ ] **Step 3: Update container.ts to expose a hook for Scope and throw on root-resolved Scoped bindings**

In `container.ts`:

Add the import:

```ts
import { ScopedResolutionOutsideScopeError } from "./errors";
import { Scope } from "./scope";
```

Add an internal interface (exported but `__`-prefixed so consumers know not to use it directly):

```ts
export interface ContainerInternal {
  __getStored(token: AnyTokenLike): StoredEntry[] | undefined;
  __resolveContainerLifetime(resolver: Resolver, token: AnyTokenLike, stored: StoredEntry): unknown;
}
```

Replace `#resolveSingle` with a version that rejects Scoped bindings from the root:

```ts
  #resolveSingle(token: AnyTokenLike, stored: StoredEntry): unknown {
    if (stored.entry.lifetime === Lifetime.Scoped) {
      throw new ScopedResolutionOutsideScopeError(token);
    }
    return this.__resolveContainerLifetime(this, token, stored);
  }
```

Add the helper used by both Container and Scope, plus `createScope` and the `__getStored` hook:

```ts
  __getStored(token: AnyTokenLike): StoredEntry[] | undefined {
    return this.#registry.get(token);
  }

  __resolveContainerLifetime(resolver: Resolver, token: AnyTokenLike, stored: StoredEntry): unknown {
    if (stored.entry.lifetime === Lifetime.Container && stored.hasInstance) {
      return stored.instance;
    }
    const instance = withResolutionContext(resolver, token, () => stored.entry.factory());
    if (stored.entry.lifetime === Lifetime.Container) {
      stored.instance = instance;
      stored.hasInstance = true;
    }
    return instance;
  }

  createScope(): Scope {
    this.#ensureNotDisposed();
    return new Scope(this);
  }
```

- [ ] **Step 4: Implement Scope**

```ts
// src/infrastructure/di/scope.ts
import { type Container, type ContainerInternal, type StoredEntry } from "./container";
import { ContainerDisposedError, TokenNotRegisteredError } from "./errors";
import { type Resolver, withResolutionContext } from "./inject";
import { Lifetime } from "./lifetime";
import { type AnyTokenLike, type MultiToken, type TokenLike, tokenKind } from "./token";

export class Scope implements Resolver {
  readonly #parent: ContainerInternal;
  readonly #scopedInstances = new Map<StoredEntry, unknown>();
  readonly #scopedOrder: StoredEntry[] = [];
  #disposed = false;

  constructor(parent: Container) {
    this.#parent = parent as unknown as ContainerInternal;
  }

  resolve<T>(token: TokenLike<T>): T;
  resolve<T>(token: MultiToken<T>): T[];
  resolve<T>(token: AnyTokenLike): unknown {
    this.#ensureNotDisposed();
    const stored = this.#parent.__getStored(token);
    if (!stored || stored.length === 0) {
      throw new TokenNotRegisteredError(token, []);
    }
    if (tokenKind(token) === "multi") {
      return stored.map((s) => this.#resolveSingle(token, s));
    }
    return this.#resolveSingle(token, stored[0]);
  }

  #resolveSingle(token: AnyTokenLike, stored: StoredEntry): unknown {
    if (stored.entry.lifetime === Lifetime.Scoped) {
      if (this.#scopedInstances.has(stored)) {
        return this.#scopedInstances.get(stored);
      }
      const instance = withResolutionContext(this, token, () => stored.entry.factory());
      this.#scopedInstances.set(stored, instance);
      this.#scopedOrder.push(stored);
      return instance;
    }
    return this.#parent.__resolveContainerLifetime(this, token, stored);
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    const errors: unknown[] = [];
    for (const stored of [...this.#scopedOrder].reverse()) {
      const instance = this.#scopedInstances.get(stored);
      try {
        await disposeInstance(instance);
      } catch (err) {
        errors.push(err);
      }
    }
    this.#scopedInstances.clear();
    this.#scopedOrder.length = 0;
    if (errors.length > 0) {
      throw new AggregateError(errors, "One or more scope disposers failed.");
    }
  }

  #ensureNotDisposed(): void {
    if (this.#disposed) throw new ContainerDisposedError();
  }
}

async function disposeInstance(instance: unknown): Promise<void> {
  if (instance == null || (typeof instance !== "object" && typeof instance !== "function")) return;
  const asAny = instance as { [Symbol.asyncDispose]?: () => Promise<void>; [Symbol.dispose]?: () => void };
  if (typeof asAny[Symbol.asyncDispose] === "function") {
    await asAny[Symbol.asyncDispose]!();
    return;
  }
  if (typeof asAny[Symbol.dispose] === "function") {
    asAny[Symbol.dispose]!();
  }
}
```

> **Note:** `disposeInstance` is duplicated here and in container.ts. Stage 2 can refactor to a shared module if more disposers appear. Per "no premature abstraction", leave the duplication for now.

- [ ] **Step 5: Run tests, expect pass**

```bash
npm test -- src/infrastructure/di/scope.test.ts src/infrastructure/di/container.test.ts
```

- [ ] **Step 6: Lint + types**

```bash
npm run check:types && npm run check:lint -- src/infrastructure/di/scope.ts src/infrastructure/di/scope.test.ts src/infrastructure/di/container.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/infrastructure/di/scope.ts src/infrastructure/di/scope.test.ts src/infrastructure/di/container.ts
git commit -m "feat(di): add Scope and Lifetime.Scoped"
```

---

## Task 14: InjectorToken escape hatch

**Files:**

- Create: `src/infrastructure/di/injector.ts`
- Create: `src/infrastructure/di/injector.test.ts`
- Modify: `src/infrastructure/di/container.ts` (register InjectorToken as built-in)
- Modify: `src/infrastructure/di/scope.ts` (register Injector for scope)

The `Injector` resolved by a container returns an injector that uses the container; the one resolved by a scope returns an injector that uses the scope. We implement this by making `InjectorToken` Transient with a factory that captures the current resolver from the context stack.

- [ ] **Step 1: Write failing tests**

```ts
// src/infrastructure/di/injector.test.ts
import { describe, expect, it } from "vitest";

import { Container } from "./container";
import { inject } from "./inject";
import { type Injector, InjectorToken } from "./injector";
import { Lifetime } from "./lifetime";
import { createMultiToken, createToken } from "./token";

describe("InjectorToken", () => {
  it("resolves to an Injector that can resolve other tokens", () => {
    const c = new Container();
    const t = createToken<string>("X");
    c.register(t).useValue("v");
    const inj = c.resolve(InjectorToken);
    expect(inj.resolve(t)).toBe("v");
  });

  it("resolves multi-tokens through the Injector", () => {
    const c = new Container();
    const t = createMultiToken<string>("M");
    c.register(t).useValue("a");
    c.register(t).useValue("b");
    const inj = c.resolve(InjectorToken);
    expect(inj.resolve(t)).toEqual(["a", "b"]);
  });

  it("from a scope resolves Scoped bindings", () => {
    class Scoped {}
    const c = new Container();
    c.register(Scoped).useClass(Scoped).lifetime(Lifetime.Scoped);
    const scope = c.createScope();
    const inj = scope.resolve(InjectorToken);
    const first = inj.resolve(Scoped);
    expect(inj.resolve(Scoped)).toBe(first);
  });

  it("from the root container throws when asked to resolve a Scoped binding", () => {
    class Scoped {}
    const c = new Container();
    c.register(Scoped).useClass(Scoped).lifetime(Lifetime.Scoped);
    const inj = c.resolve(InjectorToken);
    expect(() => inj.resolve(Scoped)).toThrow();
  });

  it("is injectable into other factories", () => {
    class Owner {
      readonly inj: Injector = inject(InjectorToken);
    }
    const c = new Container();
    c.register(Owner).useClass(Owner);
    const o = c.resolve(Owner);
    expect(typeof o.inj.resolve).toBe("function");
  });
});
```

- [ ] **Step 2: Run tests, expect fail**

```bash
npm test -- src/infrastructure/di/injector.test.ts
```

- [ ] **Step 3: Implement injector.ts**

```ts
// src/infrastructure/di/injector.ts
import { type MultiToken, type TokenLike, createToken } from "./token";

import { type Resolver } from "./inject";

export interface Injector {
  resolve<T>(token: TokenLike<T>): T;
  resolve<T>(token: MultiToken<T>): T[];
}

export const InjectorToken = createToken<Injector>("Injector");

export function createInjector(resolver: Resolver): Injector {
  return {
    resolve<T>(token: TokenLike<T> | MultiToken<T>): T | T[] {
      return resolver.resolve(token as TokenLike<T>);
    },
  };
}
```

- [ ] **Step 4: Register InjectorToken as a built-in inside Container**

In `container.ts`, modify the Container constructor:

```ts
  constructor() {
    this.#registerBuiltins();
  }

  #registerBuiltins(): void {
    this.register(InjectorToken)
      .useFactory(() => {
        const r = currentResolver() ?? this;
        return createInjector(r);
      })
      .lifetime(Lifetime.Transient);
  }
```

Add the imports at the top of `container.ts`:

```ts
import { createInjector, InjectorToken } from "./injector";
import { currentResolver } from "./inject";
```

- [ ] **Step 5: Run tests, expect pass**

```bash
npm test -- src/infrastructure/di/injector.test.ts src/infrastructure/di/container.test.ts src/infrastructure/di/scope.test.ts
```

- [ ] **Step 6: Lint + types**

```bash
npm run check:types && npm run check:lint -- src/infrastructure/di/injector.ts src/infrastructure/di/injector.test.ts src/infrastructure/di/container.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/infrastructure/di/injector.ts src/infrastructure/di/injector.test.ts src/infrastructure/di/container.ts
git commit -m "feat(di): add InjectorToken escape hatch"
```

---

## Task 15: addModule / addModules

**Files:**

- Modify: `src/infrastructure/di/container.ts`
- Modify: `src/infrastructure/di/container.test.ts`

Thin pass-through so feature modules can declare themselves as `Module` and register through one entry point.

- [ ] **Step 1: Add failing tests**

Append to `container.test.ts`:

```ts
import type { Module } from "./module";

describe("Container.addModule", () => {
  it("invokes the module's register hook with the container", () => {
    const c = new Container();
    const t = createToken<string>("X");
    const M: Module = {
      register(container) {
        container.register(t).useValue("from-module");
      },
    };
    c.addModule(M);
    expect(c.resolve(t)).toBe("from-module");
  });

  it("invokes each module in order via addModules", () => {
    const c = new Container();
    const order: string[] = [];
    const A: Module = { register: () => order.push("A") };
    const B: Module = { register: () => order.push("B") };
    c.addModules([A, B]);
    expect(order).toEqual(["A", "B"]);
  });

  it("returns the container for chaining", () => {
    const c = new Container();
    const M: Module = { register: () => undefined };
    expect(c.addModule(M)).toBe(c);
  });
});
```

- [ ] **Step 2: Add addModule / addModules to Container**

In `container.ts`, add to the class body:

```ts
  addModule(module: Module): this {
    this.#ensureNotDisposed();
    module.register(this);
    return this;
  }

  addModules(modules: readonly Module[]): this {
    for (const m of modules) this.addModule(m);
    return this;
  }
```

And add the import:

```ts
import type { Module } from "./module";
```

- [ ] **Step 3: Run tests, expect pass**

```bash
npm test -- src/infrastructure/di/container.test.ts
```

- [ ] **Step 4: Lint + types**

```bash
npm run check:types && npm run check:lint -- src/infrastructure/di/container.ts src/infrastructure/di/container.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/di/container.ts src/infrastructure/di/container.test.ts
git commit -m "feat(di): add addModule and addModules"
```

---

## Task 16: Vue integration

**Files:**

- Create: `src/infrastructure/di/vue.ts`
- Create: `src/infrastructure/di/vue.test.ts`

Use Vue's `provide`/`inject` with a typed symbol. Tests use `@testing-library/vue`.

- [ ] **Step 1: Install testing-library and a DOM environment**

```bash
npm install --save-dev @testing-library/vue @testing-library/user-event happy-dom
```

Set the Vitest environment to `happy-dom` so component rendering works. Update `vitest.config.mts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    alias: {
      obsidian: new URL("./__mocks__/obsidian.ts", import.meta.url).pathname,
      "@": new URL("./src", import.meta.url).pathname,
    },
    exclude: ["**/node_modules/**", "**/dist/**", "src/_old-code/**"],
  },
});
```

Run the existing DI test suite to confirm no regressions from the environment change:

```bash
npm test -- src/infrastructure/di
```

- [ ] **Step 2: Write failing tests**

```ts
// src/infrastructure/di/vue.test.ts
import { render, screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { Container } from "./container";
import { InjectorToken } from "./injector";
import { createMultiToken, createToken } from "./token";
import { provideInjector, useInjector, useService } from "./vue";

function makeContainer() {
  const c = new Container();
  return { c, injector: c.resolve(InjectorToken) };
}

describe("provideInjector + useService", () => {
  it("resolves a single-binding service inside a child component", () => {
    const { c, injector } = makeContainer();
    const t = createToken<string>("Greeting");
    c.register(t).useValue("hello");

    const Child = defineComponent({
      setup() {
        const greet = useService(t);
        return () => h("p", null, greet);
      },
    });

    const Root = defineComponent({
      setup() {
        provideInjector(injector);
        return () => h(Child);
      },
    });

    render(Root);
    expect(screen.getByText("hello")).toBeTruthy();
  });

  it("resolves a multi-binding service to an array", () => {
    const { c, injector } = makeContainer();
    const t = createMultiToken<string>("Items");
    c.register(t).useValue("a");
    c.register(t).useValue("b");

    const Child = defineComponent({
      setup() {
        const items = useService(t);
        return () => h("p", null, items.join(","));
      },
    });

    const Root = defineComponent({
      setup() {
        provideInjector(injector);
        return () => h(Child);
      },
    });

    render(Root);
    expect(screen.getByText("a,b")).toBeTruthy();
  });

  it("throws when useService runs without a provided injector", () => {
    const t = createToken<string>("X");
    const Bad = defineComponent({
      setup() {
        useService(t);
        return () => h("div");
      },
    });
    expect(() => render(Bad)).toThrow();
  });
});

describe("useInjector", () => {
  it("returns the provided injector", () => {
    const { injector } = makeContainer();
    let captured: unknown;
    const Child = defineComponent({
      setup() {
        captured = useInjector();
        return () => h("div");
      },
    });
    const Root = defineComponent({
      setup() {
        provideInjector(injector);
        return () => h(Child);
      },
    });
    render(Root);
    expect(captured).toBe(injector);
  });
});
```

- [ ] **Step 3: Run tests, expect fail**

```bash
npm test -- src/infrastructure/di/vue.test.ts
```

- [ ] **Step 4: Implement vue.ts**

```ts
// src/infrastructure/di/vue.ts
import { inject as vueInject, provide } from "vue";

import { type Injector } from "./injector";
import { type MultiToken, type TokenLike } from "./token";

const InjectorKey = Symbol("di.vue.injector");

export function provideInjector(injector: Injector): void {
  provide(InjectorKey, injector);
}

export function useInjector(): Injector {
  const inj = vueInject<Injector | undefined>(InjectorKey, undefined);
  if (!inj) throw new MissingInjectorProviderError();
  return inj;
}

export function useService<T>(token: TokenLike<T>): T;
export function useService<T>(token: MultiToken<T>): T[];
export function useService<T>(token: TokenLike<T> | MultiToken<T>): T | T[] {
  return useInjector().resolve(token as TokenLike<T>);
}
```

Add to `errors.ts`:

```ts
export class MissingInjectorProviderError extends Error {
  constructor() {
    super("useService / useInjector requires a provideInjector ancestor in the Vue tree.");
    this.name = "MissingInjectorProviderError";
  }
}
```

Add the import in `vue.ts`:

```ts
import { MissingInjectorProviderError } from "./errors";
```

- [ ] **Step 5: Run tests, expect pass**

```bash
npm test -- src/infrastructure/di/vue.test.ts
```

- [ ] **Step 6: Lint + types**

```bash
npm run check:types && npm run check:lint -- src/infrastructure/di/vue.ts src/infrastructure/di/vue.test.ts src/infrastructure/di/errors.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/infrastructure/di/vue.ts src/infrastructure/di/vue.test.ts src/infrastructure/di/errors.ts package.json package-lock.json vitest.config.mts
git commit -m "feat(di): add provideInjector, useInjector, useService for Vue"
```

---

## Task 17: Testing barrel + public index barrel

**Files:**

- Create: `src/infrastructure/di/testing.ts`
- Create: `src/infrastructure/di/index.ts`

Per memory: barrels are not tested.

- [ ] **Step 1: Create testing.ts**

```ts
// src/infrastructure/di/testing.ts
import { Container } from "./container";

export function createTestContainer(): Container {
  return new Container();
}

export { Container };
```

- [ ] **Step 2: Create index.ts**

```ts
// src/infrastructure/di/index.ts
export { Container } from "./container";
export { Scope } from "./scope";

export { type Module } from "./module";

export {
  createToken,
  createMultiToken,
  isToken,
  tokenKind,
  tokenName,
  type AnyTokenLike,
  type Class,
  type MultiToken,
  type Token,
  type TokenKind,
  type TokenLike,
} from "./token";

export { inject, type Resolver } from "./inject";

export { Lifetime } from "./lifetime";

export { type Injector, InjectorToken } from "./injector";

export { provideInjector, useInjector, useService } from "./vue";

export {
  CircularDependencyError,
  ContainerDisposedError,
  DuplicateRegistrationError,
  InvalidTokenError,
  MissingInjectorProviderError,
  NoInjectionContextError,
  ScopedResolutionOutsideScopeError,
  TokenNotRegisteredError,
} from "./errors";
```

- [ ] **Step 3: Verify types + lint**

```bash
npm run check:types && npm run check:lint -- src/infrastructure/di/index.ts src/infrastructure/di/testing.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/infrastructure/di/index.ts src/infrastructure/di/testing.ts
git commit -m "feat(di): export public barrel and testing helper"
```

---

## Task 18: Integration test

**Files:**

- Create: `src/infrastructure/di/integration.test.ts`

End-to-end exercise of the lifecycle.

- [ ] **Step 1: Write the test**

```ts
// src/infrastructure/di/integration.test.ts
import { describe, expect, it } from "vitest";

import { Container, createToken, inject, Lifetime, type Module } from "./index";

describe("DI integration", () => {
  it("runs through register, addModule, autoLoad, resolve, scope, and dispose", async () => {
    const events: string[] = [];

    class Persistence {
      readonly data = new Map<string, string>();
      [Symbol.dispose]() {
        events.push("persistence-disposed");
      }
    }
    class Settings {
      readonly persistence = inject(PersistenceToken);
      load() {
        events.push("settings-loaded");
      }
      [Symbol.dispose]() {
        events.push("settings-disposed");
      }
    }
    class RequestHandler {
      readonly settings = inject(SettingsToken);
      handle() {
        return this.settings.persistence.data.size;
      }
      [Symbol.dispose]() {
        events.push("request-handler-disposed");
      }
    }

    const PersistenceToken = createToken<Persistence>("Persistence");
    const SettingsToken = createToken<Settings>("Settings");
    const RequestHandlerToken = createToken<RequestHandler>("RequestHandler");

    const InfraModule: Module = {
      register(c) {
        c.register(PersistenceToken).useClass(Persistence).eager();
        c.register(SettingsToken)
          .useFactory(() => {
            const s = new Settings();
            s.load();
            return s;
          })
          .eager();
      },
    };
    const RequestModule: Module = {
      register(c) {
        c.register(RequestHandlerToken).useClass(RequestHandler).lifetime(Lifetime.Scoped);
      },
    };

    const c = new Container();
    c.addModules([InfraModule, RequestModule]);
    await c.autoLoad();
    expect(events).toEqual(["settings-loaded"]);

    const scope = c.createScope();
    const handler = scope.resolve(RequestHandlerToken);
    expect(handler.handle()).toBe(0);

    await scope.dispose();
    expect(events).toEqual(["settings-loaded", "request-handler-disposed"]);

    await c.dispose();
    expect(events).toEqual([
      "settings-loaded",
      "request-handler-disposed",
      "settings-disposed",
      "persistence-disposed",
    ]);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
npm test -- src/infrastructure/di/integration.test.ts
```

Expected: passes. If not, identify whether the bug is in eager ordering, scope-resolve, or container dispose order.

- [ ] **Step 3: Run the full DI test suite + types + lint**

```bash
npm test -- src/infrastructure/di && npm run check:types && npm run check:lint
```

- [ ] **Step 4: Commit**

```bash
git add src/infrastructure/di/integration.test.ts
git commit -m "test(di): integration test for full container lifecycle"
```

---

## Task 19: obsidian-tokens.ts + main.ts vertical slice

**Files:**

- Create: `src/infrastructure/obsidian-tokens.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Create obsidian-tokens.ts**

```ts
// src/infrastructure/obsidian-tokens.ts
import { type App } from "obsidian";

import { createToken } from "@/infrastructure/di";

import type JournalPlugin from "@/main";

export const PluginToken = createToken<JournalPlugin>("Plugin");
export const ObsidianAppToken = createToken<App>("ObsidianApp");
```

- [ ] **Step 2: Replace main.ts**

```ts
// src/main.ts
import { Plugin } from "obsidian";

import { Container } from "@/infrastructure/di";
import { ObsidianAppToken, PluginToken } from "@/infrastructure/obsidian-tokens";

export default class JournalPlugin extends Plugin {
  #container?: Container;

  async onload(): Promise<void> {
    const container = new Container();
    container.register(PluginToken).useValue(this);
    container.register(ObsidianAppToken).useValue(this.app);
    await container.autoLoad();
    this.#container = container;
  }

  async onunload(): Promise<void> {
    await this.#container?.dispose();
    this.#container = undefined;
  }
}
```

- [ ] **Step 3: Type-check and lint**

```bash
npm run check:types && npm run check:lint
```

- [ ] **Step 4: Run the full test suite**

```bash
npm test
```

Expected: all DI tests pass; no new failures elsewhere.

- [ ] **Step 5: Build verification**

```bash
npm run build
```

Expected: produces `build/main.js` without errors.

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/obsidian-tokens.ts src/main.ts
git commit -m "feat(v3): wire DI container into plugin entry point"
```

---

## Final verification

- [ ] **All-suites check**

```bash
npm test && npm run check:types && npm run check:lint && npm run build
```

Expected: every gate passes.

- [ ] **Review the public API surface**

```bash
cat src/infrastructure/di/index.ts
```

Confirm only the documented surface is exported:

- Classes/values: `Container`, `Scope`, `Lifetime`, `InjectorToken`, `provideInjector`, `useInjector`, `useService`, `createToken`, `createMultiToken`, `inject`, `isToken`, `tokenKind`, `tokenName`
- Types: `Module`, `Token`, `MultiToken`, `TokenLike`, `TokenKind`, `AnyTokenLike`, `Class`, `Resolver`, `Injector`
- Errors: all the documented subclasses

No leakage of `RegistrationBuilder`, `RegistrationEntry`, `currentResolver`, `withResolutionContext`, `StoredEntryRef`, `ContainerInternal`, `createInjector`, or any internal `__` helpers.

- [ ] **Push the branch (optional, do not push to main)**

```bash
git push -u origin v3-ai
```

---

## Notes

- The plan introduces **one runtime dependency** (`ts-pattern`) and a **dev dependency** (`@testing-library/vue` + transitive). No other runtime additions.
- `disposeInstance` is duplicated between `container.ts` and `scope.ts`. Stage 2 may extract it. Per "no premature abstraction", do not extract in Stage 1.
- The Container ↔ Scope coupling uses `ContainerInternal` (intent-named `__`-prefixed methods). This is the seam between the two halves of one logical resolver; do not expose it via `index.ts`.
- Tests intentionally avoid spies for things that aren't part of the contract. Watch for the rule when adding tests for future stages.
- The plan does NOT create `.kiro/steering/` — explicitly out of scope (per the spec's non-goals).
