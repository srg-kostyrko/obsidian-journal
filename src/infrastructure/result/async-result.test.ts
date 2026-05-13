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

    it("AsyncResult._fromPromiseOfResult (internal) wraps a pre-built Promise<Result>", async () => {
      const ar = AsyncResult._fromPromiseOfResult(Promise.resolve(Result.ok(9)));
      const r = await ar;
      expectOk(r);
      expect(r.value).toBe(9);
    });
  });

  describe("fromPromise", () => {
    it("captures a resolved promise as Ok", async () => {
      const ar = AsyncResult.fromPromise(Promise.resolve(42), (cause) => new TestError(String(cause)));
      const r = await ar;
      expectOk(r);
      expect(r.value).toBe(42);
    });

    it("captures a rejected promise via mapErr", async () => {
      const ar = AsyncResult.fromPromise(
        Promise.reject(new Error("boom")),
        (cause) => new TestError(cause instanceof Error ? cause.message : String(cause)),
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
      const r = await AsyncResult.err(new TestError("x")).mapErr((error) => new TestError(`wrap: ${error.message}`));
      expectErr(r);
      expect(r.error.message).toBe("wrap: x");
    });

    it("passes Ok through", async () => {
      const r = await AsyncResult.ok(1).mapErr((error: never) => error);
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

    it("chains Ok -> sync Result Err", async () => {
      const r = await AsyncResult.ok<number>(2).flatMap(() => Result.err(new TestError("sync-nope")));
      expectErr(r);
      expect(r.error.kind).toBe("test-error");
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
        err: (error) => `err ${error.message}`,
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
