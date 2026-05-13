# v3 Monadic Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `Option<T>`, `Result<T, E>`, `AsyncResult<T, E>`, and the `attempt.in` do-notation runner under `src/infrastructure/result/`, plus `InvariantError` and test-narrowing helpers.

**Architecture:** Discriminated unions implemented as twin classes (`Some`/`None`, `Ok`/`Err`) each carrying a `readonly kind` literal. `AsyncResult` is a thenable wrapper around `Promise<Result>` exposing both `then` and `[Symbol.asyncIterator]`. `attempt.in(self, gen)` runs a generator with `this` rebound to `self`, short-circuits on the first `Err` yielded via `yield*`, and returns a `Result` (sync) or `AsyncResult` (async). All code lives in-tree with zero new dependencies.

**Tech Stack:** TypeScript 5+, vitest, valibot 1.x (already a dep), no runtime additions.

**Reference:** `docs/superpowers/specs/2026-05-13-v3-monadic-foundation-design.md`

---

## File Structure

All new code under `src/infrastructure/result/`:

| Path                   | Responsibility                                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `option.ts`            | `Option<T>`, `Some<T>`, `None`, static constructors, methods including `okOr`/`okOrElse`                                                        |
| `option.test.ts`       | Behavior tests for Option (no okOr/okOrElse split — covered in Task 3)                                                                          |
| `result.ts`            | `Result<T,E>`, `Ok<T,E>`, `Err<T,E>`, static constructors including `fromThrowing` / `fromOption` / `fromValibot`, methods, `[Symbol.iterator]` |
| `result.test.ts`       | Behavior tests for Result                                                                                                                       |
| `async-result.ts`      | `AsyncResult<T,E>` thenable class + statics                                                                                                     |
| `async-result.test.ts` | Behavior tests for AsyncResult                                                                                                                  |
| `attempt.ts`           | `attempt.in(self, fn)` — sync + async overloads, runtime dispatch                                                                               |
| `attempt.test.ts`      | Behavior tests for attempt                                                                                                                      |
| `errors.ts`            | `InvariantError`                                                                                                                                |
| `testing.ts`           | `expectOk` / `expectErr` assertion-narrowing helpers                                                                                            |
| `index.ts`             | Public barrel — exports everything except `testing.ts`                                                                                          |

No tests for `errors.ts` (trivial error subclass; project memory: no instanceof-parent for trivial error subclasses), `testing.ts` (test infrastructure exercised through other tests), or `index.ts` (project memory: no barrel-shape tests).

---

## Pre-flight

- [ ] **Confirm clean working tree on branch `v3-ai`**

Run: `git status`
Expected: working tree clean, branch `v3-ai`.

- [ ] **Create the result directory**

Run: `mkdir -p src/infrastructure/result`
Expected: no output.

---

## Task 1: Option core

**Files:**

- Create: `src/infrastructure/result/option.ts`
- Create: `src/infrastructure/result/option.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/infrastructure/result/option.test.ts`:

```ts
import { describe, expect, expectTypeOf, it } from "vitest";

import { Option, type Some, type None } from "./option";

describe("Option", () => {
  describe("constructors", () => {
    it("Option.some wraps a value as Some", () => {
      const opt = Option.some(5);
      expect(opt.kind).toBe("some");
      expect(opt.isSome() && opt.value).toBe(5);
    });

    it("Option.none produces a None", () => {
      const opt = Option.none<number>();
      expect(opt.kind).toBe("none");
      expect(opt.isNone()).toBe(true);
    });

    it("Option.fromNullable on a non-null value produces Some", () => {
      const opt = Option.fromNullable("hi");
      expect(opt.isSome() && opt.value).toBe("hi");
    });

    it("Option.fromNullable on null produces None", () => {
      const opt = Option.fromNullable<number>(null);
      expect(opt.isNone()).toBe(true);
    });

    it("Option.fromNullable on undefined produces None", () => {
      const opt = Option.fromNullable<number>(undefined);
      expect(opt.isNone()).toBe(true);
    });

    it("Option.fromNullable preserves 0 as Some(0)", () => {
      const opt = Option.fromNullable(0);
      expect(opt.isSome() && opt.value).toBe(0);
    });

    it("Option.fromNullable preserves empty string as Some('')", () => {
      const opt = Option.fromNullable("");
      expect(opt.isSome() && opt.value).toBe("");
    });
  });

  describe("type narrowing", () => {
    it("isSome narrows to Some<T>", () => {
      const opt: Option<number> = Option.some(1);
      if (opt.isSome()) {
        expectTypeOf(opt).toEqualTypeOf<Some<number>>();
      }
    });

    it("isNone narrows to None<T>", () => {
      const opt: Option<number> = Option.none();
      if (opt.isNone()) {
        expectTypeOf(opt).toEqualTypeOf<None<number>>();
      }
    });
  });

  describe("map", () => {
    it("transforms the inner value of Some", () => {
      const opt = Option.some(2).map((n) => n * 3);
      expect(opt.isSome() && opt.value).toBe(6);
    });

    it("passes None through unchanged", () => {
      const opt = Option.none<number>().map((n) => n * 3);
      expect(opt.isNone()).toBe(true);
    });
  });

  describe("flatMap", () => {
    it("chains Some -> Some", () => {
      const opt = Option.some(2).flatMap((n) => Option.some(n + 1));
      expect(opt.isSome() && opt.value).toBe(3);
    });

    it("chains Some -> None", () => {
      const opt = Option.some(2).flatMap(() => Option.none<number>());
      expect(opt.isNone()).toBe(true);
    });

    it("passes None through without invoking the function", () => {
      let called = false;
      const opt = Option.none<number>().flatMap((n) => {
        called = true;
        return Option.some(n);
      });
      expect(opt.isNone()).toBe(true);
      expect(called).toBe(false);
    });
  });

  describe("filter", () => {
    it("keeps Some when the predicate holds", () => {
      const opt = Option.some(4).filter((n) => n > 2);
      expect(opt.isSome() && opt.value).toBe(4);
    });

    it("drops Some to None when the predicate fails", () => {
      const opt = Option.some(1).filter((n) => n > 2);
      expect(opt.isNone()).toBe(true);
    });

    it("passes None through without invoking the predicate", () => {
      let called = false;
      Option.none<number>().filter(() => {
        called = true;
        return true;
      });
      expect(called).toBe(false);
    });
  });

  describe("match", () => {
    it("calls the some handler with the inner value", () => {
      const result = Option.some(5).match({
        some: (n) => `got ${n}`,
        none: () => "nothing",
      });
      expect(result).toBe("got 5");
    });

    it("calls the none handler when empty", () => {
      const result = Option.none<number>().match({
        some: (n) => `got ${n}`,
        none: () => "nothing",
      });
      expect(result).toBe("nothing");
    });
  });

  describe("getOr", () => {
    it("returns the inner value when Some", () => {
      expect(Option.some(7).getOr(0)).toBe(7);
    });

    it("returns the fallback when None", () => {
      expect(Option.none<number>().getOr(99)).toBe(99);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/infrastructure/result/option.test.ts`
Expected: FAIL — module `./option` cannot be resolved.

- [ ] **Step 3: Implement `option.ts`**

Create `src/infrastructure/result/option.ts`:

```ts
export class Some<T> {
  readonly kind = "some" as const;
  constructor(readonly value: T) {}

  map<U>(fn: (value: T) => U): Option<U> {
    return new Some<U>(fn(this.value));
  }

  flatMap<U>(fn: (value: T) => Option<U>): Option<U> {
    return fn(this.value);
  }

  filter(predicate: (value: T) => boolean): Option<T> {
    return predicate(this.value) ? this : new None<T>();
  }

  match<U>(handlers: { some: (value: T) => U; none: () => U }): U {
    return handlers.some(this.value);
  }

  getOr(_fallback: T): T {
    return this.value;
  }

  isSome(): this is Some<T> {
    return true;
  }

  isNone(): this is None<T> {
    return false;
  }
}

export class None<T = unknown> {
  readonly kind = "none" as const;
  declare readonly _phantomT: T;

  map<U>(_fn: (value: T) => U): Option<U> {
    return new None<U>();
  }

  flatMap<U>(_fn: (value: T) => Option<U>): Option<U> {
    return new None<U>();
  }

  filter(_predicate: (value: T) => boolean): Option<T> {
    return this;
  }

  match<U>(handlers: { some: (value: T) => U; none: () => U }): U {
    return handlers.none();
  }

  getOr(fallback: T): T {
    return fallback;
  }

  isSome(): this is Some<T> {
    return false;
  }

  isNone(): this is None<T> {
    return true;
  }
}

export type Option<T> = Some<T> | None<T>;

export const Option = {
  some<T>(value: T): Option<T> {
    return new Some<T>(value);
  },
  none<T = never>(): Option<T> {
    return new None<T>();
  },
  fromNullable<T>(value: T | null | undefined): Option<T> {
    return value === null || value === undefined ? new None<T>() : new Some<T>(value);
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/infrastructure/result/option.test.ts`
Expected: PASS — all option tests green.

- [ ] **Step 5: Run type-check and lint**

Run: `npm run check:types`
Expected: no errors.

Run: `npm run check:lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/result/option.ts src/infrastructure/result/option.test.ts
git commit -m "feat(result): add Option type with map/flatMap/filter/match"
```

---

## Task 2: Result core, InvariantError, and testing helpers

**Files:**

- Create: `src/infrastructure/result/errors.ts`
- Create: `src/infrastructure/result/result.ts`
- Create: `src/infrastructure/result/result.test.ts`
- Create: `src/infrastructure/result/testing.ts`

- [ ] **Step 1: Implement `errors.ts`**

Create `src/infrastructure/result/errors.ts`:

```ts
export class InvariantError extends Error {
  readonly kind = "invariant" as const;

  constructor(message: string) {
    super(message);
    this.name = "InvariantError";
  }
}
```

- [ ] **Step 2: Write the failing test file**

Create `src/infrastructure/result/result.test.ts`:

```ts
import { describe, expect, expectTypeOf, it } from "vitest";

import { InvariantError } from "./errors";
import { type Err, type Ok, Result } from "./result";
import { expectErr, expectOk } from "./testing";

class TestError extends Error {
  readonly kind = "test-error" as const;
}

describe("Result", () => {
  describe("constructors", () => {
    it("Result.ok wraps a value as Ok", () => {
      const r = Result.ok(5);
      expect(r.kind).toBe("ok");
      expectOk(r);
      expect(r.value).toBe(5);
    });

    it("Result.err wraps an error as Err", () => {
      const e = new TestError("boom");
      const r = Result.err(e);
      expect(r.kind).toBe("err");
      expectErr(r);
      expect(r.error).toBe(e);
    });

    it("Result.ok is typed Result<T, never>", () => {
      expectTypeOf(Result.ok(5)).toEqualTypeOf<Result<number, never>>();
    });

    it("Result.err is typed Result<never, E>", () => {
      expectTypeOf(Result.err(new TestError("x"))).toEqualTypeOf<Result<never, TestError>>();
    });
  });

  describe("fromThrowing", () => {
    it("captures a returned value as Ok", () => {
      const r = Result.fromThrowing(
        () => 42,
        (u) => new TestError(String(u)),
      );
      expectOk(r);
      expect(r.value).toBe(42);
    });

    it("captures a thrown error and runs mapErr", () => {
      const r = Result.fromThrowing(
        () => {
          throw new Error("boom");
        },
        (u) => new TestError(u instanceof Error ? u.message : String(u)),
      );
      expectErr(r);
      expect(r.error.kind).toBe("test-error");
      expect(r.error.message).toBe("boom");
    });

    it("captures a thrown non-Error value", () => {
      const r = Result.fromThrowing(
        () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw "string-literal";
        },
        (u) => new TestError(String(u)),
      );
      expectErr(r);
      expect(r.error.message).toBe("string-literal");
    });
  });

  describe("type narrowing", () => {
    it("isOk narrows to Ok<T, E>", () => {
      const r: Result<number, TestError> = Result.ok(1);
      if (r.isOk()) {
        expectTypeOf(r).toEqualTypeOf<Ok<number, TestError>>();
      }
    });

    it("isErr narrows to Err<T, E>", () => {
      const r: Result<number, TestError> = Result.err(new TestError("x"));
      if (r.isErr()) {
        expectTypeOf(r).toEqualTypeOf<Err<number, TestError>>();
      }
    });
  });

  describe("map", () => {
    it("transforms the inner value of Ok", () => {
      const r = Result.ok(2).map((n) => n * 3);
      expectOk(r);
      expect(r.value).toBe(6);
    });

    it("passes Err through without invoking the function", () => {
      let called = false;
      const r: Result<number, TestError> = Result.err(new TestError("x"));
      const out = r.map((n) => {
        called = true;
        return n * 3;
      });
      expectErr(out);
      expect(called).toBe(false);
    });
  });

  describe("mapErr", () => {
    it("transforms the error of Err", () => {
      const r: Result<number, TestError> = Result.err(new TestError("x"));
      const out = r.mapErr((e) => new TestError(`wrapped: ${e.message}`));
      expectErr(out);
      expect(out.error.message).toBe("wrapped: x");
    });

    it("passes Ok through without invoking the function", () => {
      let called = false;
      const r = Result.ok(1).mapErr((e: never) => {
        called = true;
        return e;
      });
      expectOk(r);
      expect(called).toBe(false);
    });
  });

  describe("flatMap", () => {
    it("chains Ok -> Ok", () => {
      const r = Result.ok(2).flatMap((n) => Result.ok(n + 1));
      expectOk(r);
      expect(r.value).toBe(3);
    });

    it("chains Ok -> Err", () => {
      const r = Result.ok<number>(2).flatMap(() => Result.err(new TestError("nope")));
      expectErr(r);
      expect(r.error.kind).toBe("test-error");
    });

    it("passes Err through without invoking the function", () => {
      let called = false;
      const r: Result<number, TestError> = Result.err(new TestError("x"));
      const out = r.flatMap((n) => {
        called = true;
        return Result.ok(n);
      });
      expectErr(out);
      expect(called).toBe(false);
    });

    it("widens the error union on chain", () => {
      class OtherError extends Error {
        readonly kind = "other" as const;
      }
      const r: Result<number, TestError> = Result.ok(1);
      const chained = r.flatMap((n): Result<number, OtherError> => Result.err(new OtherError("o")));
      expectTypeOf(chained).toEqualTypeOf<Result<number, TestError | OtherError>>();
    });
  });

  describe("match", () => {
    it("calls the ok handler with the inner value", () => {
      const out = Result.ok(5).match({
        ok: (n) => `got ${n}`,
        err: () => "no",
      });
      expect(out).toBe("got 5");
    });

    it("calls the err handler with the error", () => {
      const out = Result.err(new TestError("x")).match({
        ok: () => "no",
        err: (e) => `err ${e.message}`,
      });
      expect(out).toBe("err x");
    });
  });

  describe("[Symbol.iterator]", () => {
    it("Ok iterator returns the inner value without yielding", () => {
      const r = Result.ok(7);
      const iter = r[Symbol.iterator]();
      const next = iter.next();
      expect(next.done).toBe(true);
      expect(next.value).toBe(7);
    });

    it("Err iterator yields itself once", () => {
      const e = new TestError("x");
      const r: Result<number, TestError> = Result.err(e);
      const iter = r[Symbol.iterator]();
      const first = iter.next();
      expect(first.done).toBe(false);
      expect(first.value).toBe(r);
    });

    it("Err iterator throws InvariantError if consumed past the yield", () => {
      const r: Result<number, TestError> = Result.err(new TestError("x"));
      const iter = r[Symbol.iterator]();
      iter.next();
      expect(() => iter.next()).toThrow(InvariantError);
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/infrastructure/result/result.test.ts`
Expected: FAIL — modules `./result` and `./testing` cannot be resolved.

- [ ] **Step 4: Implement `result.ts`**

Create `src/infrastructure/result/result.ts`:

```ts
import { InvariantError } from "./errors";

export class Ok<T, E> {
  readonly kind = "ok" as const;
  declare readonly _phantomE: E;

  constructor(readonly value: T) {}

  map<U>(fn: (value: T) => U): Result<U, E> {
    return new Ok<U, E>(fn(this.value));
  }

  mapErr<F>(_fn: (error: E) => F): Result<T, F> {
    return new Ok<T, F>(this.value);
  }

  flatMap<U, F>(fn: (value: T) => Result<U, F>): Result<U, E | F> {
    return fn(this.value);
  }

  match<U>(handlers: { ok: (value: T) => U; err: (error: E) => U }): U {
    return handlers.ok(this.value);
  }

  isOk(): this is Ok<T, E> {
    return true;
  }

  isErr(): this is Err<T, E> {
    return false;
  }

  *[Symbol.iterator](): Generator<never, T, unknown> {
    return this.value;
  }
}

export class Err<T, E> {
  readonly kind = "err" as const;
  declare readonly _phantomT: T;

  constructor(readonly error: E) {}

  map<U>(_fn: (value: T) => U): Result<U, E> {
    return new Err<U, E>(this.error);
  }

  mapErr<F>(fn: (error: E) => F): Result<T, F> {
    return new Err<T, F>(fn(this.error));
  }

  flatMap<U, F>(_fn: (value: T) => Result<U, F>): Result<U, E | F> {
    return new Err<U, E | F>(this.error);
  }

  match<U>(handlers: { ok: (value: T) => U; err: (error: E) => U }): U {
    return handlers.err(this.error);
  }

  isOk(): this is Ok<T, E> {
    return false;
  }

  isErr(): this is Err<T, E> {
    return true;
  }

  *[Symbol.iterator](): Generator<Err<T, E>, never, unknown> {
    yield this;
    throw new InvariantError("Err iterator consumed past the short-circuit yield");
  }
}

export type Result<T, E> = Ok<T, E> | Err<T, E>;

export const Result = {
  ok<T>(value: T): Result<T, never> {
    return new Ok<T, never>(value);
  },
  err<E>(error: E): Result<never, E> {
    return new Err<never, E>(error);
  },
  fromThrowing<T, E>(fn: () => T, mapErr: (raw: unknown) => E): Result<T, E> {
    try {
      return new Ok<T, E>(fn());
    } catch (raw) {
      return new Err<T, E>(mapErr(raw));
    }
  },
};
```

- [ ] **Step 5: Implement `testing.ts`**

Create `src/infrastructure/result/testing.ts`:

```ts
import { type Err, type Ok, type Result } from "./result";

export function expectOk<T, E>(result: Result<T, E>): asserts result is Ok<T, E> {
  if (result.kind !== "ok") {
    throw new Error(`Expected Ok, got Err: ${String(result.error)}`);
  }
}

export function expectErr<T, E>(result: Result<T, E>): asserts result is Err<T, E> {
  if (result.kind !== "err") {
    throw new Error(`Expected Err, got Ok: ${String(result.value)}`);
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/infrastructure/result/result.test.ts`
Expected: PASS — all result tests green.

- [ ] **Step 7: Run type-check and lint**

Run: `npm run check:types`
Expected: no errors.

Run: `npm run check:lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/infrastructure/result/errors.ts \
        src/infrastructure/result/result.ts \
        src/infrastructure/result/result.test.ts \
        src/infrastructure/result/testing.ts
git commit -m "feat(result): add Result, Ok, Err, InvariantError, test helpers"
```

---

## Task 3: Option ↔ Result interop

**Files:**

- Modify: `src/infrastructure/result/option.ts` (add `okOr`, `okOrElse` to `Some` and `None`)
- Modify: `src/infrastructure/result/option.test.ts` (add tests)
- Modify: `src/infrastructure/result/result.ts` (add `Result.fromOption`)
- Modify: `src/infrastructure/result/result.test.ts` (add tests)

- [ ] **Step 1: Add failing tests to `option.test.ts`**

Append to `src/infrastructure/result/option.test.ts` (inside the outer `describe("Option", ...)` block):

```ts
describe("okOr / okOrElse", () => {
  it("okOr on Some returns Ok with the inner value", () => {
    const opt = Option.some(5);
    const r = opt.okOr(new Error("nope"));
    expect(r.kind).toBe("ok");
    if (r.isOk()) expect(r.value).toBe(5);
  });

  it("okOr on None returns Err with the provided error", () => {
    const err = new Error("missing");
    const r = Option.none<number>().okOr(err);
    expect(r.kind).toBe("err");
    if (r.isErr()) expect(r.error).toBe(err);
  });

  it("okOrElse on Some returns Ok without invoking the factory", () => {
    let called = false;
    const r = Option.some(5).okOrElse(() => {
      called = true;
      return new Error("never");
    });
    expect(r.kind).toBe("ok");
    expect(called).toBe(false);
  });

  it("okOrElse on None invokes the factory and returns Err", () => {
    const r = Option.none<number>().okOrElse(() => new Error("computed"));
    expect(r.kind).toBe("err");
    if (r.isErr()) expect(r.error.message).toBe("computed");
  });
});
```

Also add the `Result` import at the top of `option.test.ts`. The existing imports become:

```ts
import { describe, expect, expectTypeOf, it } from "vitest";

import { Option, type Some, type None } from "./option";
```

Then add a separate line:

```ts
import { Result } from "./result";
```

Then add this expectTypeOf-only check inside the new `describe`:

```ts
it("okOr is typed Result<T, E>", () => {
  const r = Option.some(5).okOr(new Error("x"));
  expectTypeOf(r).toEqualTypeOf<Result<number, Error>>();
});
```

- [ ] **Step 2: Add failing tests to `result.test.ts`**

Append to `src/infrastructure/result/result.test.ts` (inside the outer `describe("Result", ...)` block):

```ts
describe("fromOption", () => {
  it("converts Some to Ok", () => {
    const r = Result.fromOption(Option.some(5), () => new TestError("missing"));
    expectOk(r);
    expect(r.value).toBe(5);
  });

  it("converts None to Err via the factory", () => {
    const r = Result.fromOption(Option.none<number>(), () => new TestError("missing"));
    expectErr(r);
    expect(r.error.kind).toBe("test-error");
  });

  it("does not invoke the factory for Some", () => {
    let called = false;
    Result.fromOption(Option.some(5), () => {
      called = true;
      return new TestError("never");
    });
    expect(called).toBe(false);
  });
});
```

Add the `Option` import at the top of `result.test.ts`:

```ts
import { Option } from "./option";
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/infrastructure/result/option.test.ts src/infrastructure/result/result.test.ts`
Expected: FAIL — `okOr`, `okOrElse`, and `Result.fromOption` are not defined.

- [ ] **Step 4: Add `okOr`/`okOrElse` to `option.ts`**

In `src/infrastructure/result/option.ts`, add an import at the top:

```ts
import { type Result, Ok, Err } from "./result";
```

Add these methods to the `Some<T>` class:

```ts
  okOr<E>(_error: E): Result<T, E> {
    return new Ok<T, E>(this.value);
  }

  okOrElse<E>(_mkErr: () => E): Result<T, E> {
    return new Ok<T, E>(this.value);
  }
```

Add these methods to the `None` class:

```ts
  okOr<E>(error: E): Result<never, E> {
    return new Err<never, E>(error);
  }

  okOrElse<E>(mkErr: () => E): Result<never, E> {
    return new Err<never, E>(mkErr());
  }
```

- [ ] **Step 5: Add `Result.fromOption` to `result.ts`**

In `src/infrastructure/result/result.ts`, add an import at the top:

```ts
import { type Option } from "./option";
```

Add this method to the `Result` object literal:

```ts
  fromOption<T, E>(option: Option<T>, mkErr: () => E): Result<T, E> {
    return option.isSome() ? new Ok<T, E>(option.value) : new Err<T, E>(mkErr());
  },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/infrastructure/result/option.test.ts src/infrastructure/result/result.test.ts`
Expected: PASS.

- [ ] **Step 7: Run type-check and lint**

Run: `npm run check:types`
Expected: no errors.

Run: `npm run check:lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/infrastructure/result/option.ts \
        src/infrastructure/result/option.test.ts \
        src/infrastructure/result/result.ts \
        src/infrastructure/result/result.test.ts
git commit -m "feat(result): add Option<->Result bridges (okOr, okOrElse, fromOption)"
```

---

## Task 4: `Result.fromValibot`

**Files:**

- Modify: `src/infrastructure/result/result.ts`
- Modify: `src/infrastructure/result/result.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/infrastructure/result/result.test.ts` (inside `describe("Result", ...)`):

```ts
describe("fromValibot", () => {
  it("converts a successful parse to Ok with the typed output", () => {
    const Schema = v.object({ id: v.string() });
    const parsed = v.safeParse(Schema, { id: "x" });
    const r = Result.fromValibot(parsed, (issues) => new TestError(issues[0].message));
    expectOk(r);
    expect(r.value).toEqual({ id: "x" });
  });

  it("converts a failed parse to Err via the mkErr factory", () => {
    const Schema = v.object({ id: v.string() });
    const parsed = v.safeParse(Schema, { id: 5 });
    const r = Result.fromValibot(parsed, (issues) => new TestError(`${issues.length} issues`));
    expectErr(r);
    expect(r.error.message).toBe("1 issues");
  });

  it("does not invoke mkErr on success", () => {
    const Schema = v.object({ id: v.string() });
    const parsed = v.safeParse(Schema, { id: "x" });
    let called = false;
    Result.fromValibot(parsed, () => {
      called = true;
      return new TestError("never");
    });
    expect(called).toBe(false);
  });
});
```

Add the valibot import at the top of `result.test.ts`:

```ts
import * as v from "valibot";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/infrastructure/result/result.test.ts`
Expected: FAIL — `Result.fromValibot` is not defined.

- [ ] **Step 3: Implement `fromValibot`**

In `src/infrastructure/result/result.ts`, add a valibot import at the top:

```ts
import type { BaseIssue, BaseSchema, SafeParseResult } from "valibot";
```

Add this method to the `Result` object literal:

```ts
  fromValibot<T, E>(
    parsed: SafeParseResult<BaseSchema<unknown, T, BaseIssue<unknown>>>,
    mkErr: (issues: readonly BaseIssue<unknown>[]) => E,
  ): Result<T, E> {
    return parsed.success
      ? new Ok<T, E>(parsed.output)
      : new Err<T, E>(mkErr(parsed.issues));
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/infrastructure/result/result.test.ts`
Expected: PASS.

- [ ] **Step 5: Run type-check and lint**

Run: `npm run check:types`
Expected: no errors.

Run: `npm run check:lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/result/result.ts src/infrastructure/result/result.test.ts
git commit -m "feat(result): add Result.fromValibot bridge"
```

---

## Task 5: AsyncResult

**Files:**

- Create: `src/infrastructure/result/async-result.ts`
- Create: `src/infrastructure/result/async-result.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/infrastructure/result/async-result.test.ts`:

```ts
import { describe, expect, expectTypeOf, it } from "vitest";

import { AsyncResult } from "./async-result";
import { InvariantError } from "./errors";
import { type Err, type Ok, Result } from "./result";
import { expectErr, expectOk } from "./testing";

class TestError extends Error {
  readonly kind = "test-error" as const;
}

describe("AsyncResult", () => {
  describe("constructors", () => {
    it("AsyncResult.ok resolves to Ok", async () => {
      const ar = AsyncResult.ok(5);
      const r = await ar;
      expectOk(r);
      expect(r.value).toBe(5);
    });

    it("AsyncResult.err resolves to Err", async () => {
      const ar = AsyncResult.err(new TestError("x"));
      const r = await ar;
      expectErr(r);
      expect(r.error.kind).toBe("test-error");
    });

    it("AsyncResult.fromResult lifts a sync Result", async () => {
      const ar = AsyncResult.fromResult(Result.ok(5));
      const r = await ar;
      expectOk(r);
      expect(r.value).toBe(5);
    });
  });

  describe("fromPromise", () => {
    it("captures a resolved promise as Ok", async () => {
      const ar = AsyncResult.fromPromise(Promise.resolve(42), (u) => new TestError(String(u)));
      const r = await ar;
      expectOk(r);
      expect(r.value).toBe(42);
    });

    it("captures a rejected promise via mapErr", async () => {
      const ar = AsyncResult.fromPromise(
        Promise.reject(new Error("boom")),
        (u) => new TestError(u instanceof Error ? u.message : String(u)),
      );
      const r = await ar;
      expectErr(r);
      expect(r.error.message).toBe("boom");
    });
  });

  describe("thenable contract", () => {
    it("is awaitable and yields the inner Result", async () => {
      const r = await AsyncResult.ok(1);
      expectTypeOf(r).toEqualTypeOf<Ok<number, never> | Err<number, never>>();
    });
  });

  describe("map", () => {
    it("transforms the inner value when Ok", async () => {
      const r = await AsyncResult.ok(2).map((n) => n * 3);
      expectOk(r);
      expect(r.value).toBe(6);
    });

    it("passes Err through", async () => {
      const r = await AsyncResult.err(new TestError("x")).map((n: number) => n * 3);
      expectErr(r);
    });
  });

  describe("mapErr", () => {
    it("transforms the error when Err", async () => {
      const r = await AsyncResult.err(new TestError("x")).mapErr((e) => new TestError(`wrap: ${e.message}`));
      expectErr(r);
      expect(r.error.message).toBe("wrap: x");
    });

    it("passes Ok through", async () => {
      const r = await AsyncResult.ok(1).mapErr((e: never) => e);
      expectOk(r);
      expect(r.value).toBe(1);
    });
  });

  describe("flatMap", () => {
    it("chains Ok -> AsyncResult Ok", async () => {
      const r = await AsyncResult.ok(2).flatMap((n) => AsyncResult.ok(n + 1));
      expectOk(r);
      expect(r.value).toBe(3);
    });

    it("chains Ok -> sync Result Ok", async () => {
      const r = await AsyncResult.ok(2).flatMap((n) => Result.ok(n + 1));
      expectOk(r);
      expect(r.value).toBe(3);
    });

    it("chains Ok -> AsyncResult Err", async () => {
      const r = await AsyncResult.ok<number>(2).flatMap(() => AsyncResult.err(new TestError("nope")));
      expectErr(r);
    });

    it("passes Err through without invoking the function", async () => {
      let called = false;
      const r = await AsyncResult.err(new TestError("x")).flatMap((n: number) => {
        called = true;
        return AsyncResult.ok(n);
      });
      expectErr(r);
      expect(called).toBe(false);
    });
  });

  describe("match", () => {
    it("calls ok handler when resolved to Ok", async () => {
      const out = await AsyncResult.ok(5).match({
        ok: (n) => `got ${n}`,
        err: () => "no",
      });
      expect(out).toBe("got 5");
    });

    it("calls err handler when resolved to Err", async () => {
      const out = await AsyncResult.err(new TestError("x")).match({
        ok: () => "no",
        err: (e) => `err ${e.message}`,
      });
      expect(out).toBe("err x");
    });
  });

  describe("[Symbol.asyncIterator]", () => {
    it("Ok async iterator returns the value", async () => {
      const ar = AsyncResult.ok(7);
      const iter = ar[Symbol.asyncIterator]();
      const next = await iter.next();
      expect(next.done).toBe(true);
      expect(next.value).toBe(7);
    });

    it("Err async iterator yields once", async () => {
      const ar = AsyncResult.err(new TestError("x"));
      const iter = ar[Symbol.asyncIterator]();
      const first = await iter.next();
      expect(first.done).toBe(false);
      expectErr(first.value as Result<unknown, TestError>);
    });

    it("Err async iterator throws InvariantError if consumed past the yield", async () => {
      const ar = AsyncResult.err(new TestError("x"));
      const iter = ar[Symbol.asyncIterator]();
      await iter.next();
      await expect(iter.next()).rejects.toThrow(InvariantError);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/infrastructure/result/async-result.test.ts`
Expected: FAIL — module `./async-result` cannot be resolved.

- [ ] **Step 3: Implement `async-result.ts`**

Create `src/infrastructure/result/async-result.ts`:

```ts
import { InvariantError } from "./errors";
import { Err, Ok, type Result } from "./result";

export class AsyncResult<T, E> implements PromiseLike<Result<T, E>> {
  readonly #promise: Promise<Result<T, E>>;

  private constructor(promise: Promise<Result<T, E>>) {
    this.#promise = promise;
  }

  static ok<T>(value: T): AsyncResult<T, never> {
    return new AsyncResult<T, never>(Promise.resolve(new Ok<T, never>(value)));
  }

  static err<E>(error: E): AsyncResult<never, E> {
    return new AsyncResult<never, E>(Promise.resolve(new Err<never, E>(error)));
  }

  static fromResult<T, E>(result: Result<T, E>): AsyncResult<T, E> {
    return new AsyncResult<T, E>(Promise.resolve(result));
  }

  static fromPromise<T, E>(promise: Promise<T>, mapErr: (raw: unknown) => E): AsyncResult<T, E> {
    return new AsyncResult<T, E>(
      promise.then(
        (value): Result<T, E> => new Ok<T, E>(value),
        (raw: unknown): Result<T, E> => new Err<T, E>(mapErr(raw)),
      ),
    );
  }

  then<U1 = Result<T, E>, U2 = never>(
    onFulfilled?: ((value: Result<T, E>) => U1 | PromiseLike<U1>) | null,
    onRejected?: ((reason: unknown) => U2 | PromiseLike<U2>) | null,
  ): PromiseLike<U1 | U2> {
    return this.#promise.then(onFulfilled, onRejected);
  }

  map<U>(fn: (value: T) => U): AsyncResult<U, E> {
    return new AsyncResult<U, E>(this.#promise.then((r) => r.map(fn)));
  }

  mapErr<F>(fn: (error: E) => F): AsyncResult<T, F> {
    return new AsyncResult<T, F>(this.#promise.then((r) => r.mapErr(fn)));
  }

  flatMap<U, F>(fn: (value: T) => AsyncResult<U, F> | Result<U, F>): AsyncResult<U, E | F> {
    return new AsyncResult<U, E | F>(
      this.#promise.then(async (r): Promise<Result<U, E | F>> => {
        if (r.kind === "err") return new Err<U, E | F>(r.error);
        const next = fn(r.value);
        return next instanceof AsyncResult ? await next : next;
      }),
    );
  }

  match<U>(handlers: { ok: (value: T) => U; err: (error: E) => U }): Promise<U> {
    return this.#promise.then((r) => r.match(handlers));
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<Err<T, E>, T, unknown> {
    const r = await this.#promise;
    if (r.kind === "err") {
      yield r;
      throw new InvariantError("Err async iterator consumed past the short-circuit yield");
    }
    return r.value;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/infrastructure/result/async-result.test.ts`
Expected: PASS.

- [ ] **Step 5: Run type-check and lint**

Run: `npm run check:types`
Expected: no errors.

Run: `npm run check:lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/result/async-result.ts \
        src/infrastructure/result/async-result.test.ts
git commit -m "feat(result): add AsyncResult thenable with map/flatMap/match"
```

---

## Task 6: `attempt.in` — sync runner

**Files:**

- Create: `src/infrastructure/result/attempt.ts`
- Create: `src/infrastructure/result/attempt.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/infrastructure/result/attempt.test.ts`:

```ts
import { describe, expect, expectTypeOf, it } from "vitest";

import { attempt } from "./attempt";
import { Option } from "./option";
import { Result } from "./result";
import { expectErr, expectOk } from "./testing";

class ErrA extends Error {
  readonly kind = "err-a" as const;
}
class ErrB extends Error {
  readonly kind = "err-b" as const;
}

describe("attempt.in (sync)", () => {
  it("returns Ok with the generator's return value when no Err is yielded", () => {
    const r = attempt.in(null, function* () {
      const a = yield* Result.ok(2);
      const b = yield* Result.ok(3);
      return a + b;
    });
    expectOk(r);
    expect(r.value).toBe(5);
  });

  it("short-circuits to the first yielded Err", () => {
    const r = attempt.in(null, function* () {
      const a = yield* Result.ok(2);
      const b = yield* Result.err(new ErrA("nope"));
      return a + b;
    });
    expectErr(r);
    expect(r.error.kind).toBe("err-a");
  });

  it("does not execute code after the first yielded Err", () => {
    let reached = false;
    attempt.in(null, function* () {
      yield* Result.err(new ErrA("x"));
      reached = true;
      return 0;
    });
    expect(reached).toBe(false);
  });

  it("widens the error channel as multiple error types are yielded", () => {
    const r = attempt.in(null, function* () {
      const a = yield* Result.ok(2) as Result<number, ErrA>;
      const b = yield* Result.ok(3) as Result<number, ErrB>;
      return a + b;
    });
    expectTypeOf(r).toEqualTypeOf<Result<number, ErrA | ErrB>>();
  });

  it("rebinds `this` to the provided self argument", () => {
    class Holder {
      readonly #value = 7;
      run(): Result<number, ErrA> {
        return attempt.in(this, function* (this: Holder) {
          // accessing the private field through `this` proves rebinding
          return this.#value;
        });
      }
    }
    const r = new Holder().run();
    expectOk(r);
    expect(r.value).toBe(7);
  });

  it("interoperates with Option via okOrElse", () => {
    const r = attempt.in(null, function* () {
      const lookup: number | undefined = undefined;
      const value = yield* Option.fromNullable(lookup).okOrElse(() => new ErrA("missing"));
      return value;
    });
    expectErr(r);
    expect(r.error.kind).toBe("err-a");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/infrastructure/result/attempt.test.ts`
Expected: FAIL — module `./attempt` cannot be resolved.

- [ ] **Step 3: Implement sync `attempt.in`**

Create `src/infrastructure/result/attempt.ts`:

```ts
import { Err, Ok, type Result } from "./result";

type SyncGen<T, E> = Generator<Err<unknown, E>, T, unknown>;

function runSync<T, E>(iter: SyncGen<T, E>): Result<T, E> {
  const next = iter.next();
  if (next.done) {
    return new Ok<T, E>(next.value);
  }
  // next.value is the yielded Err<unknown, E> — re-wrap as Err<T, E>.
  return new Err<T, E>(next.value.error);
}

export const attempt = {
  in<This, T, E>(self: This, fn: (this: This) => SyncGen<T, E>): Result<T, E> {
    return runSync(fn.call(self));
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/infrastructure/result/attempt.test.ts`
Expected: PASS.

- [ ] **Step 5: Run type-check and lint**

Run: `npm run check:types`
Expected: no errors.

Run: `npm run check:lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/result/attempt.ts src/infrastructure/result/attempt.test.ts
git commit -m "feat(result): add attempt.in sync runner with this rebinding"
```

---

## Task 7: `attempt.in` — async runner & dispatch

**Files:**

- Modify: `src/infrastructure/result/attempt.ts`
- Modify: `src/infrastructure/result/attempt.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/infrastructure/result/attempt.test.ts`:

```ts
describe("attempt.in (async)", () => {
  it("returns AsyncResult Ok with the generator's return value", async () => {
    const ar = attempt.in(null, async function* () {
      const a = yield* AsyncResult.ok(2);
      const b = yield* AsyncResult.ok(3);
      return a + b;
    });
    const r = await ar;
    expectOk(r);
    expect(r.value).toBe(5);
  });

  it("short-circuits on the first yielded AsyncResult Err", async () => {
    const ar = attempt.in(null, async function* () {
      const a = yield* AsyncResult.ok(2);
      const b = yield* AsyncResult.err(new ErrA("nope"));
      return a + b;
    });
    const r = await ar;
    expectErr(r);
    expect(r.error.kind).toBe("err-a");
  });

  it("short-circuits on a sync Result Err yielded inside an async generator", async () => {
    const ar = attempt.in(null, async function* () {
      yield* Result.err(new ErrA("sync-err"));
      return 0;
    });
    const r = await ar;
    expectErr(r);
    expect(r.error.kind).toBe("err-a");
  });

  it("does not execute code after the first yielded Err", async () => {
    let reached = false;
    await attempt.in(null, async function* () {
      yield* AsyncResult.err(new ErrA("x"));
      reached = true;
      return 0;
    });
    expect(reached).toBe(false);
  });

  it("rebinds `this` in async generators", async () => {
    class Holder {
      readonly #value = 11;
      run() {
        return attempt.in(this, async function* (this: Holder) {
          return this.#value;
        });
      }
    }
    const r = await new Holder().run();
    expectOk(r);
    expect(r.value).toBe(11);
  });

  it("returns an AsyncResult (thenable) from the async overload", () => {
    const ar = attempt.in(null, async function* () {
      return 0;
    });
    expectTypeOf(ar).toEqualTypeOf<AsyncResult<number, never>>();
  });
});
```

Update the imports at the top of `attempt.test.ts` to add `AsyncResult`:

```ts
import { AsyncResult } from "./async-result";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/infrastructure/result/attempt.test.ts`
Expected: FAIL — async overload of `attempt.in` is not implemented; `AsyncResult` import in source missing.

- [ ] **Step 3: Add `AsyncResult.fromPromiseOfResult` factory**

`attempt.in`'s async branch needs to hand a pre-built `Promise<Result<T, E>>` to `AsyncResult` without going through the rejection-mapping path of `fromPromise`. Add a dedicated factory.

In `src/infrastructure/result/async-result.ts`, add this static method to `AsyncResult`:

```ts
  static fromPromiseOfResult<T, E>(
    promise: Promise<Result<T, E>>,
  ): AsyncResult<T, E> {
    return new AsyncResult<T, E>(promise);
  }
```

This is the supported entry point for adapters that already have a `Promise<Result>` in hand (here: `attempt.in`'s async runner). It is intentionally narrow and exists only for that purpose.

Add a quick test for it in `src/infrastructure/result/async-result.test.ts`, inside the `describe("constructors", ...)` block:

```ts
it("AsyncResult.fromPromiseOfResult wraps a pre-built Promise<Result>", async () => {
  const ar = AsyncResult.fromPromiseOfResult(Promise.resolve(Result.ok(9)));
  const r = await ar;
  expectOk(r);
  expect(r.value).toBe(9);
});
```

- [ ] **Step 4: Implement async runner and dispatch in `attempt.ts`**

Replace the contents of `src/infrastructure/result/attempt.ts` with:

```ts
import { AsyncResult } from "./async-result";
import { Err, Ok, type Result } from "./result";

type SyncGen<T, E> = Generator<Err<unknown, E>, T, unknown>;
type AsyncGen<T, E> = AsyncGenerator<Err<unknown, E>, T, unknown>;

function runSync<T, E>(iter: SyncGen<T, E>): Result<T, E> {
  const next = iter.next();
  if (next.done) {
    return new Ok<T, E>(next.value);
  }
  return new Err<T, E>(next.value.error);
}

async function runAsync<T, E>(iter: AsyncGen<T, E>): Promise<Result<T, E>> {
  const next = await iter.next();
  if (next.done) {
    return new Ok<T, E>(next.value);
  }
  return new Err<T, E>(next.value.error);
}

function isAsyncIterator(value: object): value is AsyncGen<unknown, unknown> {
  return Symbol.asyncIterator in value;
}

interface AttemptApi {
  in<This, T, E>(self: This, fn: (this: This) => SyncGen<T, E>): Result<T, E>;
  in<This, T, E>(self: This, fn: (this: This) => AsyncGen<T, E>): AsyncResult<T, E>;
}

export const attempt: AttemptApi = {
  in<This, T, E>(self: This, fn: (this: This) => SyncGen<T, E> | AsyncGen<T, E>): Result<T, E> | AsyncResult<T, E> {
    const iter = fn.call(self);
    if (isAsyncIterator(iter)) {
      return AsyncResult.fromPromiseOfResult(runAsync(iter));
    }
    return runSync(iter);
  },
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/infrastructure/result/attempt.test.ts src/infrastructure/result/async-result.test.ts`
Expected: PASS.

- [ ] **Step 6: Run type-check and lint**

Run: `npm run check:types`
Expected: no errors.

Run: `npm run check:lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/infrastructure/result/attempt.ts \
        src/infrastructure/result/attempt.test.ts \
        src/infrastructure/result/async-result.ts \
        src/infrastructure/result/async-result.test.ts
git commit -m "feat(result): add attempt.in async overload and dispatch"
```

---

## Task 8: Public barrel

**Files:**

- Create: `src/infrastructure/result/index.ts`

No tests for this file (project memory: no barrel-shape tests, no wiring tests).

- [ ] **Step 1: Create `index.ts`**

Create `src/infrastructure/result/index.ts`:

```ts
export { Option, Some, None } from "./option";
export { Result, Ok, Err } from "./result";
export { AsyncResult } from "./async-result";
export { attempt } from "./attempt";
export { InvariantError } from "./errors";
```

`testing.ts` is intentionally **not** re-exported — test helpers are imported directly from `./testing` by test files only.

- [ ] **Step 2: Verify the full test suite is green**

Run: `npm test`
Expected: PASS — all suites green.

- [ ] **Step 3: Run type-check and lint**

Run: `npm run check:types`
Expected: no errors.

Run: `npm run check:lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/infrastructure/result/index.ts
git commit -m "feat(result): add public barrel for src/infrastructure/result"
```

---

## Post-flight

- [ ] **Confirm the foundation is complete**

Run: `ls src/infrastructure/result/`
Expected: contains `async-result.ts`, `async-result.test.ts`, `attempt.ts`, `attempt.test.ts`, `errors.ts`, `index.ts`, `option.ts`, `option.test.ts`, `result.ts`, `result.test.ts`, `testing.ts`.

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all green.

- [ ] **Confirm commit history**

Run: `git log --oneline -10`
Expected: most recent commits are the eight task commits, in order.

The foundation is ready. Future v3 feature work consumes it via `import { Option, Result, AsyncResult, attempt, InvariantError } from "@/infrastructure/result"`.
