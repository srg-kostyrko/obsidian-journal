# RegistrationBuilder Two-Stage Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `RegistrationBuilder<T>` into two classes so that `useClass`/`useFactory`/`useValue` and `lifetime`/`eager` cannot be mixed or chained out of order.

**Architecture:** Stage 1 (`RegistrationBuilder<T>`) exposes only the three `useX` binding methods, each returning a fresh stage-2 instance. Stage 2 (`RegistrationOptions<T>`) exposes only `lifetime()` and `eager()`. The two classes are independent (no inheritance). The `onChange` callback contract with `Container` is unchanged; what changes is that the first emit happens inside `RegistrationOptions`'s constructor, removing the "factory may not be set yet" guard.

**Tech Stack:** TypeScript, Vitest, project-internal DI primitives (`Lifetime`, `Class`, `RegistrationEntry`, `OnRegistrationChange`).

**Spec:** `docs/superpowers/specs/2026-05-13-registration-builder-split-design.md`

---

## File Structure

- **Rewrite** `src/infrastructure/di/registration.ts`
  - Two exported classes: `RegistrationBuilder<T>` (stage 1), `RegistrationOptions<T>` (stage 2).
  - `RegistrationEntry<T>` and `OnRegistrationChange<T>` exports unchanged.
- **Update** `src/infrastructure/di/registration.test.ts`
  - Drop two tests whose scenarios become type errors.
  - Adjust remaining tests to call `useX` first.
- **No change** to `src/infrastructure/di/container.ts`, `bindings.ts`, `scope.ts`, `module.ts`, or any caller of `.register()`.

---

## Task 1: Replace test file with the new behaviour set

We replace the tests first so the implementation is driven by them. After this task, the test suite will fail to type-check (because `useClass.useValue` is gone — but `RegistrationBuilder` still allows it). That's expected; Task 2 fixes it.

**Files:**

- Modify: `src/infrastructure/di/registration.test.ts` (full rewrite)

- [ ] **Step 1: Replace the test file with the new content**

```typescript
import { describe, expect, it } from "vitest";

import { Lifetime } from "./lifetime";
import { type RegistrationEntry, RegistrationBuilder } from "./registration";

function captureEntries<T>(): {
  entries: RegistrationEntry<T>[];
  onChange: (entry: RegistrationEntry<T>) => void;
} {
  const entries: RegistrationEntry<T>[] = [];
  return { entries, onChange: (entry) => entries.push(entry) };
}

describe("RegistrationBuilder", () => {
  describe("useClass", () => {
    it("emits an entry whose factory builds an instance of the given class", () => {
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
  });

  describe("useFactory", () => {
    it("emits an entry whose factory returns what useFactory provided", () => {
      const { entries, onChange } = captureEntries<number>();
      new RegistrationBuilder<number>(onChange).useFactory(() => 42);
      expect(entries[0].factory()).toBe(42);
    });
  });

  describe("useValue", () => {
    it("emits an entry whose factory returns the literal given to useValue", () => {
      const v = { id: 7 };
      const { entries, onChange } = captureEntries<typeof v>();
      new RegistrationBuilder<typeof v>(onChange).useValue(v);
      expect(entries[0].factory()).toBe(v);
    });
  });

  describe("defaults", () => {
    it("emits a Container-lifetime entry", () => {
      const { entries, onChange } = captureEntries<string>();
      new RegistrationBuilder<string>(onChange).useValue("x");
      expect(entries.at(-1)?.lifetime).toBe(Lifetime.Container);
    });

    it("emits with eager=false", () => {
      const { entries, onChange } = captureEntries<string>();
      new RegistrationBuilder<string>(onChange).useValue("x");
      expect(entries.at(-1)?.eager).toBe(false);
    });
  });
});

describe("RegistrationOptions", () => {
  describe("lifetime", () => {
    it("re-emits with the new lifetime", () => {
      const { entries, onChange } = captureEntries<string>();
      new RegistrationBuilder<string>(onChange).useValue("x").lifetime(Lifetime.Transient);
      expect(entries).toHaveLength(2);
      expect(entries.at(-1)?.lifetime).toBe(Lifetime.Transient);
    });
  });

  describe("eager", () => {
    it("re-emits with eager=true", () => {
      const { entries, onChange } = captureEntries<string>();
      new RegistrationBuilder<string>(onChange).useValue("x").eager();
      expect(entries.at(-1)?.eager).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Confirm the suite currently fails to type-check (or the new tests pass against the old implementation)**

Run: `npm test -- src/infrastructure/di/registration.test.ts`

Expected: tests pass (the new tests are a subset of what the old `RegistrationBuilder` already supported — call `useX` first, then optionally `.lifetime()` / `.eager()`). The file should compile against the current `registration.ts`. Do not be alarmed if all green here.

- [ ] **Step 3: Run typecheck / lint**

Run: `npm run check:types && npm run check:lint`

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/infrastructure/di/registration.test.ts
git commit -m "test(di): rewrite registration tests for two-stage builder split"
```

---

## Task 2: Split `RegistrationBuilder` into two classes

**Files:**

- Modify: `src/infrastructure/di/registration.ts` (full rewrite)

- [ ] **Step 1: Rewrite `registration.ts`**

```typescript
import { Lifetime } from "./lifetime";

import type { Class } from "./token";

export interface RegistrationEntry<T> {
  readonly factory: () => T;
  readonly lifetime: Lifetime;
  readonly eager: boolean;
}

export type OnRegistrationChange<T> = (entry: RegistrationEntry<T>) => void;

export class RegistrationBuilder<T> {
  readonly #onChange: OnRegistrationChange<T>;

  constructor(onChange: OnRegistrationChange<T>) {
    this.#onChange = onChange;
  }

  useClass(ctor: Class<T>): RegistrationOptions<T> {
    return new RegistrationOptions<T>(() => new ctor(), this.#onChange);
  }

  useFactory(factory: () => T): RegistrationOptions<T> {
    return new RegistrationOptions<T>(factory, this.#onChange);
  }

  useValue(value: T): RegistrationOptions<T> {
    return new RegistrationOptions<T>(() => value, this.#onChange);
  }
}

export class RegistrationOptions<T> {
  readonly #factory: () => T;
  readonly #onChange: OnRegistrationChange<T>;
  #lifetime: Lifetime = Lifetime.Container;
  #eager = false;

  constructor(factory: () => T, onChange: OnRegistrationChange<T>) {
    this.#factory = factory;
    this.#onChange = onChange;
    this.#notify();
  }

  lifetime(value: Lifetime): this {
    this.#lifetime = value;
    this.#notify();
    return this;
  }

  eager(): this {
    this.#eager = true;
    this.#notify();
    return this;
  }

  #notify(): void {
    this.#onChange({
      factory: this.#factory,
      lifetime: this.#lifetime,
      eager: this.#eager,
    });
  }
}
```

- [ ] **Step 2: Run the registration test file**

Run: `npm test -- src/infrastructure/di/registration.test.ts`

Expected: all tests pass.

- [ ] **Step 3: Run the full DI test suite**

Run: `npm test -- src/infrastructure/di`

Expected: all tests pass. `container.ts`'s callback closure (`if (stored) { stored.entry = entry; return; } stored = this.#bindings.commit(token, entry);`) still receives the same emit sequence — first emit on `useX`, subsequent emits on `lifetime`/`eager` — so no behaviour changes for any caller.

- [ ] **Step 4: Run typecheck / lint**

Run: `npm run check:types && npm run check:lint`

Expected: clean. No call sites need updating because every existing caller chains `useX` first (verified during design — checked `src/main.ts`, `src/infrastructure/di/container.ts:28-33`, and all `*.test.ts` files under `src/infrastructure/di/`).

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/di/registration.ts
git commit -m "refactor(di): split RegistrationBuilder into stage-1 builder and RegistrationOptions"
```

---

## Task 3: Final verification

- [ ] **Step 1: Run the full unit/integration test suite + types + lint**

Run: `npm test && npm run check:types && npm run check:lint`

Expected: all green.

- [ ] **Step 2: Run smoke E2E (per project quality gates for a per-spec change)**

Run: `npm run test:e2e:smoke`

Expected: green.

- [ ] **Step 3: Sanity-check call sites still type-check**

Run: `grep -rn "\\.useClass\\|\\.useFactory\\|\\.useValue" src --include="*.ts" | grep -v "registration\\(\\.test\\)\\?\\.ts"`

Expected: every match is followed by either end-of-chain, `.lifetime(...)`, or `.eager()` — no `useX.useY` and no `register(...).lifetime(...)` without an interleaving `useX`. (This is a manual eyeball pass over the grep output, not an automated assertion.)

---

## Self-Review Notes

**Spec coverage:** Every requirement in the spec maps to a task —

- Two-class shape with no inheritance → Task 2 Step 1.
- `Container.register()` callback closure unchanged → Task 2 Step 3 verifies (no change to `container.ts`).
- `#notify()` guard removed → Task 2 Step 1 (no guard in new `#notify`).
- Test list (drop two, keep adjusted six) → Task 1 Step 1.
- "Two classes enforced by types, no instanceof/type-shape tests" → Task 1 Step 1 omits both.

**Placeholder scan:** No TBD/TODO/"handle errors appropriately" patterns. All code blocks are complete.

**Type consistency:** `RegistrationBuilder<T>` constructor signature unchanged (`(onChange: OnRegistrationChange<T>)`), so `container.ts` keeps compiling. `RegistrationOptions<T>` is a new export; nothing else imports it (callers chain off the return value, they don't name the type).
