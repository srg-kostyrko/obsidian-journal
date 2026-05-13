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
