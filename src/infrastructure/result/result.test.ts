import * as v from "valibot";
import { describe, expect, expectTypeOf, it } from "vitest";

import { InvariantError } from "./errors";
import { Option } from "./option";
import { type Err, type ErrYield, type Ok, Result } from "./result";
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
      const error = new TestError("boom");
      const r = Result.err(error);
      expect(r.kind).toBe("err");
      expectErr(r);
      expect(r.error).toBe(error);
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
          const raw: unknown = "string-literal";
          throw raw;
        },
        (u) => new TestError(String(u)),
      );
      expectErr(r);
      expect(r.error.message).toBe("string-literal");
    });
  });

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
      const out = r.mapErr((error) => new TestError(`wrapped: ${error.message}`));
      expectErr(out);
      expect(out.error.message).toBe("wrapped: x");
    });

    it("passes Ok through without invoking the function", () => {
      let called = false;
      const r = Result.ok(1).mapErr((error: never) => {
        called = true;
        return error;
      });
      expectOk(r);
      expect(called).toBe(false);
    });
  });

  describe("tap", () => {
    it("invokes the callback with the unwrapped ok value", () => {
      const seen: number[] = [];
      Result.ok(5).tap((value) => seen.push(value));
      expect(seen).toEqual([5]);
    });

    it("returns the same Ok unchanged", () => {
      const original = Result.ok(5);
      const out = original.tap(() => undefined);
      expect(out).toBe(original);
    });

    it("does not invoke the callback on Err", () => {
      let called = false;
      const r: Result<number, TestError> = Result.err(new TestError("boom"));
      r.tap(() => {
        called = true;
      });
      expect(called).toBe(false);
    });

    it("returns the same Err unchanged", () => {
      const original: Result<number, TestError> = Result.err(new TestError("boom"));
      const out = original.tap(() => undefined);
      expect(out).toBe(original);
    });
  });

  describe("tapErr", () => {
    it("invokes the callback with the unwrapped error", () => {
      const seen: TestError[] = [];
      const r: Result<number, TestError> = Result.err(new TestError("boom"));
      r.tapErr((error) => seen.push(error));
      expect(seen).toHaveLength(1);
      expect(seen[0]?.message).toBe("boom");
    });

    it("returns the same Err unchanged", () => {
      const original: Result<number, TestError> = Result.err(new TestError("boom"));
      const out = original.tapErr(() => undefined);
      expect(out).toBe(original);
    });

    it("does not invoke the callback on Ok", () => {
      let called = false;
      Result.ok(5).tapErr(() => {
        called = true;
      });
      expect(called).toBe(false);
    });

    it("returns the same Ok unchanged", () => {
      const original = Result.ok(5);
      const out = original.tapErr(() => undefined);
      expect(out).toBe(original);
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
      const chained = r.flatMap((_n): Result<number, OtherError> => Result.err(new OtherError("o")));
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
        err: (error) => `err ${error.message}`,
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
      const error = new TestError("x");
      const r: Result<number, TestError> = Result.err(error);
      const iter = r[Symbol.iterator]();
      const first = iter.next();
      expect(first.done).toBe(false);
      expect(first.value).toBe(r);
    });

    it("Err iterator yield type carries the error in a covariant slot", () => {
      const r: Result<number, TestError> = Result.err(new TestError("x"));
      const iter = r[Symbol.iterator]();
      const first = iter.next();
      if (!first.done) {
        expectTypeOf(first.value).toEqualTypeOf<ErrYield<TestError>>();
      }
    });

    it("Err iterator throws InvariantError if consumed past the yield", () => {
      const r: Result<number, TestError> = Result.err(new TestError("x"));
      const iter = r[Symbol.iterator]();
      iter.next();
      expect(() => iter.next()).toThrow(InvariantError);
    });
  });
});
