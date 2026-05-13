import { describe, expect, expectTypeOf, it } from "vitest";

import { AsyncResult } from "./async-result";
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
      yield* Result.err(new ErrA("nope"));
      return a;
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
          const v = yield* Result.ok(this.#value);
          return v;
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
      yield* AsyncResult.ok(2);
      yield* AsyncResult.err(new ErrA("nope"));
      return 0;
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
          const v = yield* AsyncResult.ok(this.#value);
          return v;
        });
      }
    }
    const r = await new Holder().run();
    expectOk(r);
    expect(r.value).toBe(11);
  });

  it("returns an AsyncResult (thenable) from the async overload", () => {
    const ar = attempt.in(null, async function* () {
      yield* AsyncResult.ok(undefined);
      return 0;
    });
    expectTypeOf(ar).toEqualTypeOf<AsyncResult<number, never>>();
  });
});

describe("attempt.in nested composition", () => {
  it("composes nested sync attempts via yield*", () => {
    const outer = attempt.in(null, function* () {
      const inner = attempt.in(null, function* () {
        const x = yield* Result.ok(3);
        const y = yield* Result.ok(4);
        return x + y;
      });
      const value = yield* inner;
      return value * 2;
    });
    expectOk(outer);
    expect(outer.value).toBe(14);
  });

  it("short-circuits a sync inner attempt's Err through the outer", () => {
    const outer = attempt.in(null, function* () {
      const inner = attempt.in(null, function* () {
        yield* Result.err(new ErrA("inner-fail"));
        return 0;
      });
      const value = yield* inner;
      return value * 2;
    });
    expectErr(outer);
    expect(outer.error.kind).toBe("err-a");
  });

  it("composes nested async attempts via yield*", async () => {
    const outer = attempt.in(null, async function* () {
      const inner = attempt.in(null, async function* () {
        const x = yield* AsyncResult.ok(5);
        return x;
      });
      const value = yield* inner;
      return value * 2;
    });
    const r = await outer;
    expectOk(r);
    expect(r.value).toBe(10);
  });
});

describe("attempt.in throw propagation", () => {
  it("lets a synchronous throw inside the sync generator propagate", () => {
    expect(() =>
      attempt.in(null, function* () {
        yield* Result.ok(0);
        throw new Error("sync-kaboom");
      }),
    ).toThrow("sync-kaboom");
  });

  it("lets a synchronous throw inside the async generator surface as a rejection", async () => {
    const ar = attempt.in(null, async function* () {
      yield* AsyncResult.ok(0);
      throw new Error("async-kaboom");
    });
    await expect(ar).rejects.toThrow("async-kaboom");
  });
});
