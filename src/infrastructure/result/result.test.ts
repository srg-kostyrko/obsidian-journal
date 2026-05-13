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

    it("Err iterator throws InvariantError if consumed past the yield", () => {
      const r: Result<number, TestError> = Result.err(new TestError("x"));
      const iter = r[Symbol.iterator]();
      iter.next();
      expect(() => iter.next()).toThrow(InvariantError);
    });
  });
});
