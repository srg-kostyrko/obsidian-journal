import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { Option } from "./option";
import { AsyncResult, Result } from "./result";
import { NonExhaustiveError, RedundantElseClauseError } from "./result-matcher";

class CustomError extends Error {}
class ErrorA extends Error {
  readonly type = "a";
}

class ErrorB extends Error {
  readonly type = "b";
}

Result.flowBinding({}, function* () {
  yield this;
});

describe("Result", () => {
  describe("isOkAnd", () => {
    it("should return true when result is ok and value matches predicate", () => {
      const result = Result.ok(1);
      expect(Result.isOkAnd(result, (value) => value === 1)).toBe(true);
    });

    it("should return false when result is ok and value does not match predicate", () => {
      const result = Result.ok(1);
      expect(Result.isOkAnd(result, (value) => value === 2)).toBe(false);
    });

    it("should return false when result is err", () => {
      const result = Result.err(1);
      expect(Result.isOkAnd(result, () => true)).toBe(false);
    });
  });

  describe("isErrOr", () => {
    it("should return true when result is err", () => {
      const result = Result.err(1);
      expect(Result.isErrAnd(result, (value) => value === 1)).toBe(true);
    });

    it("should return true when result is ok and value matches predicate", () => {
      const result = Result.ok(1);
      expect(Result.isErrAnd(result, () => true)).toBe(false);
    });

    it("should return false when result is ok and value does not match predicate", () => {
      const result = Result.ok(1);
      expect(Result.isErrAnd(result, () => false)).toBe(false);
    });
  });

  describe("try", () => {
    it('should infer correct types when calling "try"', () => {
      const syncResult = Result.try(() => "some value");
      expectTypeOf(syncResult).toEqualTypeOf<Result<string, Error>>();

      // eslint-disable-next-line @typescript-eslint/require-await
      const asyncResult = Result.try(async () => "some value");
      expectTypeOf(asyncResult).toEqualTypeOf<AsyncResult<string, Error>>();

      const syncResultFlattened = Result.try(() => Result.ok("some value") as Result<string, CustomError>);
      expectTypeOf(syncResultFlattened).toEqualTypeOf<Result<string, Error | CustomError>>();

      // eslint-disable-next-line @typescript-eslint/require-await
      const asyncResultFlattened = Result.try(async () => Result.ok("some value") as Result<string, CustomError>);
      expectTypeOf(asyncResultFlattened).toEqualTypeOf<AsyncResult<string, Error | CustomError>>();
    });

    it("should execute a provided callback and wrap an successful outcome in a result", () => {
      const result = Result.try(() => "some value");

      expect(Result.isOk(result)).toBe(true);
      expect(result.getOrNull()).toBe("some value");
    });

    it("should execute a provided async-callback and wraps an successful outcome in a async-result", async () => {
      // eslint-disable-next-line @typescript-eslint/require-await
      const asyncResult = Result.try(async () => "some value");

      expect(asyncResult).toBeInstanceOf(AsyncResult);

      const result = await asyncResult;

      expect(Result.isOk(result)).toBe(true);
      const value = result.getOrNull();
      expect(value).toBe("some value");
    });

    it("executes a provided callback and wraps a failed outcome in a result", () => {
      const result = Result.try((): string => {
        throw new CustomError();
      });

      expect(Result.isErr(result)).toBe(true);
      expect(result.err().getOrNull()).toBeInstanceOf(CustomError);
    });

    it("lets you transform the error before it is returned as a result", () => {
      const result = Result.try(
        (): number => {
          throw new Error("my message");
        },
        (error) => new CustomError("my message", { cause: error }),
      );

      expectTypeOf(result).toEqualTypeOf<Result<number, CustomError>>();
      expect(result.err().getOrNull()).toBeInstanceOf(CustomError);
    });

    it("lets you transform the error before it is returned as a result given an async function", async () => {
      const result = Result.try(
        // eslint-disable-next-line @typescript-eslint/require-await
        async (): Promise<number> => {
          throw new Error("my message");
        },
        (error) => new CustomError("my message", { cause: error }),
      );

      expectTypeOf(result).toEqualTypeOf<AsyncResult<number, CustomError>>();
      // eslint-disable-next-line unicorn/no-await-expression-member
      expect((await result).err().getOrNull()).toBeInstanceOf(CustomError);
    });

    it("executes a provided async-callback and wraps a failed outcome in a async-result", async () => {
      // eslint-disable-next-line @typescript-eslint/require-await
      const asyncResult = Result.try(async (): Promise<string> => {
        throw new CustomError();
      });

      expect(asyncResult).toBeInstanceOf(AsyncResult);

      const result = await asyncResult;
      expect(Result.isErr(result)).toBe(true);
      expect(result.err().getOrNull()).toBeInstanceOf(CustomError);
    });

    it("flattens another result-type when returned by the provided callback", () => {
      const resultA = Result.try(() => Result.ok("some value"));
      const resultB = Result.try(() => Result.err(new CustomError()));

      expect(Result.isOk(resultA)).toBe(true);
      expect(resultA.getOrNull()).toBe("some value");

      expect(Result.isErr(resultB)).toBe(true);
      expect(resultB.err().getOrNull()).toBeInstanceOf(CustomError);
    });

    it("flattens another result-type when returned by the provided async-callback", async () => {
      // eslint-disable-next-line @typescript-eslint/require-await
      const asyncResultA = Result.try(async () => Result.ok("some value"));
      // eslint-disable-next-line @typescript-eslint/require-await
      const asyncResultB = Result.try(async () => Result.err(new CustomError()));

      expect(asyncResultA).toBeInstanceOf(AsyncResult);
      expect(asyncResultB).toBeInstanceOf(AsyncResult);

      const resultA = await asyncResultA;
      expect(Result.isOk(resultA)).toBe(true);
      expect(resultA.getOrNull()).toBe("some value");

      const resultB = await asyncResultB;
      expect(Result.isErr(resultB)).toBe(true);
      expect(resultB.err().getOrNull()).toBeInstanceOf(CustomError);
    });
  });

  describe("fromPromise", () => {
    it("transforms a promise holding a regular value into an async result", async () => {
      const asyncResult = Result.fromPromise(Promise.resolve(12));

      expectTypeOf(asyncResult).toEqualTypeOf<AsyncResult<number, never>>();
      expect(asyncResult).toBeInstanceOf(AsyncResult);
      const resolvedAsyncResult = await asyncResult;
      expect(Result.isOk(resolvedAsyncResult)).toBe(true);
      expect(resolvedAsyncResult.getOrNull()).toBe(12);
    });

    it("transforms a promise holding a Result into an async result", async () => {
      const asyncResult = Result.fromPromise(Promise.resolve(Result.ok(12)));

      expectTypeOf(asyncResult).toEqualTypeOf<AsyncResult<number, never>>();
      expect(asyncResult).toBeInstanceOf(AsyncResult);
      const resolvedAsyncResult = await asyncResult;
      expect(Result.isOk(resolvedAsyncResult)).toBe(true);
      expect(resolvedAsyncResult.getOrNull()).toBe(12);
    });

    it("transforms a promise holding a AsyncResult into an async result", async () => {
      const asyncResult = Result.fromPromise(Promise.resolve(AsyncResult.ok(12)));

      expectTypeOf(asyncResult).toEqualTypeOf<AsyncResult<number, never>>();
      expect(asyncResult).toBeInstanceOf(AsyncResult);
      const resolvedAsyncResult = await asyncResult;
      expect(Result.isOk(resolvedAsyncResult)).toBe(true);
      expect(resolvedAsyncResult.getOrNull()).toBe(12);
    });

    it("does not track async exceptions but throws them instead", async () => {
      await expect(() =>
        Result.fromPromise(
          Promise.resolve().then(() => {
            throw new CustomError();
          }),
        ),
      ).rejects.toBeInstanceOf(CustomError);
    });

    it("throws when exceptions are encountered in the async function returning the promise", async () => {
      // eslint-disable-next-line @typescript-eslint/require-await
      async function myFunction(): Promise<Result<number, Error>> {
        throw new CustomError("Boom!");
      }

      await expect(() => Result.fromPromise(myFunction()).map(() => 12)).rejects.toThrow(CustomError);
    });
  });

  describe("Result.flow", () => {
    it("returns a successful result from a generator function", () => {
      const result = Result.flow(
        function* () {
          const a = yield* Result.ok(1) as Result<number, ErrorA>;
          const b = yield* Result.ok(2) as Result<number, ErrorB>;

          return a + b;
        },
        () => new CustomError("Custom error"),
      );

      expectTypeOf(result).toEqualTypeOf<Result<number, CustomError | ErrorA | ErrorB>>();

      expect(Result.isOk(result)).toBe(true);
      expect(result.getOrNull()).toBe(3);
    });

    it("tracks thrown exceptions in a generator function and transforms them using the provided callback function", () => {
      const result = Result.flow(
        function* () {
          const a = yield* Result.ok(1) as Result<number, ErrorA>;
          const b = yield* Result.ok(2) as Result<number, ErrorB>;

          throw new Error("Boom!");

          return a + b;
        },
        () => new CustomError("Custom error"),
      );

      expectTypeOf(result).toEqualTypeOf<Result<number, ErrorA | ErrorB | Error>>();

      expect(Result.isErr(result)).toBe(true);
      expect(result.err().getOrNull()).toEqual(new CustomError("Custom error"));
    });

    it("tracks thrown exceptions in a generator function and encapsulates them in a failed result", () => {
      const result = Result.flow(function* () {
        const a = yield* Result.ok(1) as Result<number, ErrorA>;
        const b = yield* Result.ok(2) as Result<number, ErrorB>;

        throw new Error("Boom!");

        return a + b;
      });

      expectTypeOf(result).toEqualTypeOf<Result<number, ErrorA | ErrorB | Error>>();
      expect(Result.isErr(result)).toBe(true);
      expect(result.err().getOrNull()).toEqual(new Error("Boom!"));
    });

    it("tracks thrown exceptions in a generator function (with async-result) and returns them as an error", async () => {
      const asyncResult = Result.flow(
        function* () {
          const a = yield* Result.ok(1) as Result<number, ErrorA>;
          const b = yield* AsyncResult.ok(2) as AsyncResult<number, ErrorB>;

          throw new Error("Boom!");

          return a + b;
        },
        () => new CustomError("Custom error"),
      );

      expectTypeOf(asyncResult).toEqualTypeOf<AsyncResult<number, ErrorA | ErrorB | Error>>();
      const result = await asyncResult;
      expect(Result.isErr(result)).toBe(true);
      expect(result.err().getOrNull()).toEqual(new CustomError("Custom error"));
    });

    it("tracks thrown exceptions in an async generator function and transforms them using the provided callback fn", async () => {
      const asyncResult = Result.flow(
        async function* () {
          await Promise.resolve();

          const a = yield* Result.ok(1) as Result<number, ErrorA>;
          const b = yield* Result.ok(2) as Result<number, ErrorB>;

          throw new Error("Boom!");

          return a + b;
        },
        () => new CustomError("Custom error"),
      );

      expectTypeOf(asyncResult).toEqualTypeOf<AsyncResult<number, ErrorA | ErrorB | Error>>();
      const result = await asyncResult;
      expect(Result.isErr(result)).toBe(true);
      expect(result.err().getOrNull()).toEqual(new CustomError("Custom error"));
    });

    it("tracks thrown exceptions in an async generator function and encapsulates them in a failed result", async () => {
      const asyncResult = Result.flow(async function* () {
        await Promise.resolve();

        const a = yield* Result.ok(1) as Result<number, ErrorA>;
        const b = yield* Result.ok(2) as Result<number, ErrorB>;

        throw new Error("Boom!");

        return a + b;
      });

      expectTypeOf(asyncResult).toEqualTypeOf<AsyncResult<number, ErrorA | ErrorB | Error>>();
      const result = await asyncResult;
      expect(Result.isErr(result)).toBe(true);
      expect(result.err().getOrNull()).toEqual(new Error("Boom!"));
    });

    it("allows to to pass the 'this' context", () => {
      class MyClass {
        constructor(public someValue: number) {}

        methodA() {
          // eslint-disable-next-line require-yield
          return Result.flowBinding(this, function* () {
            return this.someValue;
          });
        }
      }

      const result = new MyClass(42).methodA();
      expectTypeOf(result).toEqualTypeOf<Result<number, Error>>();
      expect(Result.isOk(result)).toBe(true);
      expect(result.getOrNull()).toBe(42);
    });

    it("allows you to pass a generator directly", () => {
      function* generatorFunction(value: number) {
        const a = yield* Result.ok(1) as Result<number, ErrorA>;

        return a + value;
      }

      const result = Result.flow(generatorFunction(2));

      expectTypeOf(result).toEqualTypeOf<Result<number, ErrorA | Error>>();
      expect(Result.isOk(result)).toBe(true);
      expect(result.getOrNull()).toBe(3);
    });

    it("allows you to pass a generator directly that throws", () => {
      function* generatorFunction(value: number) {
        const a = yield* Result.ok(1) as Result<number, ErrorA>;

        throw new Error("boom");

        return a + value;
      }

      const result = Result.flow(generatorFunction(2));
      expect(Result.isErr(result)).toBe(true);
      expect(result.err().getOrNull()).toEqual(new Error("boom"));
    });

    it("allows you to pass a generator directly that throws and transform the error using a callback", () => {
      function* generatorFunction(value: number) {
        const a = yield* Result.ok(1) as Result<number, ErrorA>;

        throw new Error("boom");

        return a + value;
      }

      const result = Result.flow(generatorFunction(2), (error) => new ErrorB("Transformed error", { cause: error }));
      expect(Result.isErr(result)).toBe(true);

      expect(result.err().getOrNull()).toEqual(new ErrorB("Transformed error", { cause: new Error("boom") }));
    });
  });

  describe("Ok", () => {
    it("should construct ok result", () => {
      const result = Result.ok(1);
      expect(Result.isOk(result)).toBe(true);
    });

    it("should return value when unwrapping", () => {
      const result = Result.ok(1);
      expect(result.getOrNull()).toBe(1);
    });

    it("should return value when calling unwrapOr", () => {
      const result = Result.ok(1);
      expect(result.getOrDefault(2)).toBe(1);
    });

    it("should return value when calling unwrapOrElse and do not call provided function", () => {
      const result = Result.ok(1);
      const fn = vi.fn(() => 2);
      expect(result.getOrElse(fn)).toBe(1);
      expect(fn).not.toHaveBeenCalled();
    });

    it('should return some with value when calling "ok"', () => {
      const result = Result.ok(1);

      const option = result.ok();
      expect(Option.isSome(option)).toBe(true);
      expect(option.getOrNull()).toBe(1);
    });

    it('should return none when calling "err"', () => {
      const result = Result.ok(1);
      const option = result.err();
      expect(Option.isNone(option)).toBe(true);
    });

    it('should transform value when calling "map"', () => {
      const result = Result.ok(1);
      const transformed = result.map((value) => value + 1);

      expect(Result.isOk(transformed)).toBe(true);
      expect(transformed.getOrNull()).toBe(2);
    });

    it('should map to async result when calling "map" with async function', async () => {
      const result = Result.ok(1);
      const transformed = result.map((value) => Promise.resolve(value + 1));

      expect(transformed).toBeInstanceOf(AsyncResult);
      expect(Result.isOk(await transformed)).toBe(true);
      expect(await transformed.getOrNull()).toBe(2);
    });

    it("should return self when calling mapErr without calling provided function", () => {
      const result = Result.ok(1);
      const transformer = vi.fn(() => 2);
      const transformed = result.mapErr(transformer);
      expect(transformed).toBe(result);
      expect(transformer).not.toHaveBeenCalled();
    });

    it('should transform value when calling "mapOr"', () => {
      const result = Result.ok(1);
      const transformed = result.mapOr((value) => value + 1, 3);
      expect(transformed).toBe(2);
    });

    it('should transform value when calling "mapOrElse" without calling fallback function', () => {
      const result = Result.ok(1);
      const fallback = vi.fn(() => 3);
      const transformed = result.mapOrElse((value) => value + 1, fallback);
      expect(transformed).toBe(2);
      expect(fallback).not.toHaveBeenCalled();
    });

    it('should call transformation function when calling "andThen"', () => {
      const result = Result.ok(1);
      const transformer = vi.fn(() => Result.ok(2));
      const transformed = result.andThen(transformer);
      expect(transformed.getOrNull()).toBe(2);
      expect(transformer).toHaveBeenCalled();
    });

    it('should make async result when calling "andThen" with async function', async () => {
      const result = Result.ok(1);
      const transformer = () => Promise.resolve(Result.ok(2));
      const transformed = result.andThen(transformer);
      expect(transformed).toBeInstanceOf(AsyncResult);
      expect(await transformed.getOrNull()).toBe(2);
    });

    it('should return self when calling "orElse" without calling provided function', () => {
      const result = Result.ok(1);
      const transformer = vi.fn(() => Result.ok(2));
      const transformed = result.orElse(transformer);
      expect(transformed).toBe(result);
      expect(transformer).not.toHaveBeenCalled();
    });

    it("should change to async result when calling orElse with async function", async () => {
      const result = Result.ok(1);
      // eslint-disable-next-line @typescript-eslint/require-await
      const transformer = async () => Result.ok(2);
      const transformed = result.orElse(transformer);
      expect(transformed).toBeInstanceOf(AsyncResult);
      expect(await transformed.getOrNull()).toBe(1);
    });

    it("should call provided function when calling inspect", () => {
      const result = Result.ok(1);
      const fn = vi.fn();
      result.tap(fn);
      expect(fn).toHaveBeenCalledWith(1);
    });

    it('should not call provided function when calling "inspectErr"', () => {
      const result = Result.ok(1);
      const fn = vi.fn();
      result.tapErr(fn);
      expect(fn).not.toHaveBeenCalled();
    });

    it("should use onOk function in fold", () => {
      const result = Result.ok(1);
      const fn = vi.fn(() => 2);
      const transformed = result.fold(fn, () => 3);
      expect(transformed).toBe(2);
    });
  });

  describe("Err", () => {
    it("should construct ok result", () => {
      const result = Result.err(1);
      expect(Result.isErr(result)).toBe(true);
    });

    it("should return null when unwrapping", () => {
      const result = Result.err("not found");
      expect(result.getOrNull()).toBe(null);
    });

    it("should return provided value when calling unwrapOr", () => {
      const result = Result.err("not found");
      expect(result.getOrDefault(2)).toBe(2);
    });

    it("should return value provided by function when calling unwrapOrElse", () => {
      const result = Result.err("not found");
      const fn = vi.fn(() => 2);
      expect(result.getOrElse(fn)).toBe(2);
    });

    it('should return none when calling "ok"', () => {
      const result = Result.err("not found");
      const option = result.ok();
      expect(Option.isNone(option)).toBe(true);
    });

    it('should return some with value when calling "err"', () => {
      const result = Result.err("not found");
      const option = result.err();
      expect(Option.isSome(option)).toBe(true);
      expect(option.getOrNull()).toBe("not found");
    });

    it('should return self when calling "map"', () => {
      const result = Result.err("not found");
      const transformed = result.map(() => 1);
      expect(transformed).toBe(result);
    });

    it("should change to async result when calling map with async function", async () => {
      const result = Result.err("not found");
      // eslint-disable-next-line @typescript-eslint/require-await
      const transformed = result.map(async () => 1);
      expect(transformed).toBeInstanceOf(AsyncResult);
      expect(await transformed.getOrNull()).toBe(null);
    });

    it('should return provided value when calling "mapOr"', () => {
      const result = Result.err("not found");
      const transformed = result.mapOr(() => 1, 2);
      expect(transformed).toBe(2);
    });

    it('should return value provided by fallback function when calling "mapOrElse"', () => {
      const result = Result.err("not found");
      const fallback = vi.fn(() => 2);
      const transformed = result.mapOrElse(() => 1, fallback);
      expect(transformed).toBe(2);
    });

    it('should return self when calling "andThen"', () => {
      const result = Result.err("not found");
      const transformer = vi.fn((_) => Result.ok(2) as Result<number, string>);
      const transformed = result.andThen((value) => transformer(value));
      expect(transformed).toBe(result);
      expect(transformer).not.toHaveBeenCalled();
    });

    it("should change to async result when calling andThen with async function", async () => {
      const result = Result.err("not found");
      // eslint-disable-next-line @typescript-eslint/require-await
      const transformed = result.andThen(async () => Result.ok(2));
      expect(transformed).toBeInstanceOf(AsyncResult);
      expect(await transformed.getOrNull()).toBe(null);
    });

    it('should return provided value when calling "orElse"', () => {
      const result = Result.err("not found");
      const transformer = vi.fn((_) => Result.ok(2) as Result<number, string>);
      const transformed = result.orElse((value) => transformer(value));
      expect(Result.isOk(transformed)).toBe(true);
      expect(transformed.getOrNull()).toBe(2);
      expect(transformer).toHaveBeenCalledWith("not found");
    });

    it("should change to async result when calling orElse with async function", async () => {
      const result = Result.err("not found");
      // eslint-disable-next-line @typescript-eslint/require-await
      const transformed = result.orElse(async () => Result.ok(2));
      expect(transformed).toBeInstanceOf(AsyncResult);
      expect(await transformed.getOrNull()).toBe(2);
    });

    it("should call provided function when calling inspectErr", () => {
      const result = Result.err("not found");
      const fn = vi.fn();
      result.tapErr(fn);
      expect(fn).toHaveBeenCalledWith("not found");
    });

    it('should not call provided function when calling "inspect"', () => {
      const result = Result.err("not found");
      const fn = vi.fn();
      result.tap(fn);
      expect(fn).not.toHaveBeenCalled();
    });

    it("should use onErr function in fold", () => {
      const result = Result.err("not found");
      const fn = vi.fn(() => 2);
      const transformed = result.fold(() => 1, fn);
      expect(transformed).toBe(2);
    });

    describe("match", () => {
      it("allows you to define handlers for specific error cases when the result is a failure", () => {
        const result = Result.err(new ErrorA()) as Result<"some value", ErrorA | ErrorB>;

        const outcome = result
          .match()
          .when(ErrorA, (error) => {
            expectTypeOf(error).toEqualTypeOf<ErrorA>();
            return "a" as const;
          })
          .when(ErrorB, (error) => {
            expectTypeOf(error).toEqualTypeOf<ErrorB>();
            return "b" as const;
          })
          .run();

        expectTypeOf(outcome).toEqualTypeOf<"a" | "b">();
        expect(outcome).toEqual("a");
      });

      it("throws when trying to match on a successful result", () => {
        const result = Result.ok(1);

        expect(() =>
          result
            .match()
            // @ts-expect-error should error on successful result
            .when(ErrorA, () => 12),
        ).toThrow("'match()' can only be called on a failed result.");
      });

      it("returns a promise when one of the handlers is async", async () => {
        const resultA = Result.err(new ErrorA()) as Result<"some value", ErrorA | ErrorB>;
        const resultB = Result.err(new ErrorB()) as Result<"some value", ErrorA | ErrorB>;

        const outcomeA = resultA
          .match()
          .when(ErrorA, () => "a" as const)
          .when(ErrorB, async () => await Promise.resolve("b" as const))
          .run();

        expectTypeOf(outcomeA).toEqualTypeOf<Promise<"a" | "b">>();
        expect(outcomeA).toBeInstanceOf(Promise);
        const resolvedA = await outcomeA;
        expect(resolvedA).toBe("a");

        const outcomeB = resultB
          .match()
          .when(ErrorA, () => "a" as const)
          .when(ErrorB, async () => await Promise.resolve("b" as const))
          .run();

        expectTypeOf(outcomeB).toEqualTypeOf<Promise<"a" | "b">>();
        expect(outcomeB).toBeInstanceOf(Promise);
        const resolvedB = await outcomeB;
        expect(resolvedB).toBe("b");
      });

      it("allows you to combine multiple cases in one when-statement", () => {
        const result = Result.err(new ErrorA()) as Result<string, ErrorA | ErrorB>;

        const outcome = result
          .match()
          .when(ErrorA, ErrorB, (error) => {
            expectTypeOf(error).toEqualTypeOf<ErrorA | ErrorB>();
            return error.type;
          })
          .run();

        expectTypeOf(outcome).toBeString();
        expect(outcome).toBe("a");
      });

      it("throws when an unexpected case was reached", () => {
        const err = new ErrorA();
        const result = Result.err(err) as Result<string, ErrorA | ErrorB>;

        expectTypeOf(result.match().when(ErrorB, () => "b").run).toEqualTypeOf<NonExhaustiveError<ErrorA>>();

        expect(() =>
          result
            .match()
            .when(ErrorB, () => "b")
            // @ts-expect-error should error on non exhaustive case
            .run(),
        ).to.toThrowError(new NonExhaustiveError(err));
      });

      it("accepts literal values as well", () => {
        const result = Result.err("error-c") as Result<string, "error-a" | "error-b" | "error-c">;

        const outcome = result
          .match()
          .when("error-a", () => "a")
          .when("error-b", "error-c", () => "b-or-c")
          .run();

        expect(outcome).toBe("b-or-c");
      });

      it("accepts an 'else' case", () => {
        const resultA = Result.err(new ErrorA()) as Result<string, ErrorA | ErrorB>;
        const resultB = Result.err(new ErrorB()) as Result<string, ErrorA | ErrorB>;

        const outcomeA = resultA
          .match()
          .when(ErrorA, () => "a" as const)
          .else((error) => {
            expectTypeOf(error).toEqualTypeOf<ErrorB>();
            return "else" as const;
          })
          .run();

        expectTypeOf(outcomeA).toEqualTypeOf<"a" | "else">();
        expect(outcomeA).toBe("a");

        const outcomeB = resultB
          .match()
          .when(ErrorA, () => "a" as const)
          .else(() => "else" as const)
          .run();

        expect(outcomeB).toBe("else");
      });

      it("does not allow you to call 'else' when all cases are already handled", () => {
        const result = Result.err(new ErrorA()) as Result<string, ErrorA | ErrorB>;

        expectTypeOf(result.match().when(ErrorA, ErrorB, () => "foo").else).toEqualTypeOf<
          RedundantElseClauseError<"All error cases are already handled">
        >();
      });

      it("does not allow you to use 'else' more than once", () => {
        const result = Result.err(new ErrorA()) as Result<string, ErrorA | ErrorB>;

        expect(() =>
          result
            .match()
            .else(() => "else")
            // @ts-expect-error should error on second else
            .else(() => "else2"),
        ).toThrow(/already registered/);
      });
    });
  });

  describe("async result", () => {
    it("should construct ok result", async () => {
      const result = Result.fromPromise(Promise.resolve(Result.ok(1)));
      expectTypeOf(result).toEqualTypeOf<AsyncResult<number, never>>();
      expect(Result.isOk(await result)).toBe(true);
    });

    it("should construct err result", async () => {
      const result = Result.fromPromise(Promise.resolve(Result.err("not found")));
      expectTypeOf(result).toEqualTypeOf<AsyncResult<unknown, string>>();
      expect(Result.isErr(await result)).toBe(true);
    });

    describe("#getOrNull", () => {
      it("should return value for ok result", async () => {
        const result = Result.fromPromise(Promise.resolve(Result.ok(1)));
        expect(await result.getOrNull()).toBe(1);
      });

      it("should return null for err result", async () => {
        const result = Result.fromPromise(Promise.resolve(Result.err("not found")));
        expect(await result.getOrNull()).toBe(null);
      });
    });

    describe("#getOrDefault", () => {
      it("should return value for ok result", async () => {
        const result = Result.fromPromise(Promise.resolve(Result.ok(1)));
        expect(await result.getOrDefault(2)).toBe(1);
      });

      it("should return provided value for err result", async () => {
        const result = Result.fromPromise(Promise.resolve(Result.err("not found")));
        expect(await result.getOrDefault(2)).toBe(2);
      });
    });

    describe("#getOrElse", () => {
      it("should return value for ok result", async () => {
        const result = Result.fromPromise(Promise.resolve(Result.ok(1)));
        expect(await result.getOrElse(() => 2)).toBe(1);
      });

      it("should return provided value for err result", async () => {
        const result = Result.fromPromise(Promise.resolve(Result.err("not found")));
        expect(await result.getOrElse(() => 2)).toBe(2);
      });
    });

    describe("#ok", () => {
      it('should return some with value for ok result when calling "ok"', async () => {
        const result = Result.fromPromise(Promise.resolve(Result.ok(1)));
        const option = await result.ok();
        expect(Option.isSome(option)).toBe(true);
        expect(option.getOrNull()).toBe(1);
      });

      it('should return none for err result when calling "ok"', async () => {
        const result = Result.fromPromise(Promise.resolve(Result.err("not found")));
        const option = await result.ok();
        expect(Option.isNone(option)).toBe(true);
      });
    });

    describe("#err", () => {
      it('should return none for ok result when calling "err"', async () => {
        const result = Result.fromPromise(Promise.resolve(Result.ok(1)));
        const option = await result.err();
        expect(Option.isNone(option)).toBe(true);
      });

      it('should return some with value for err result when calling "err"', async () => {
        const result = Result.fromPromise(Promise.resolve(Result.err("not found")));
        const option = await result.err();
        expect(Option.isSome(option)).toBe(true);
        expect(option.getOrNull()).toBe("not found");
      });
    });

    describe("#map", () => {
      it("should map ok result", async () => {
        const result = Result.fromPromise(Promise.resolve(Result.ok(1)));
        const transformed = await result.map((value) => value + 1);
        expect(transformed.getOrNull()).toBe(2);
      });

      it("should keep err result without calling provided function", async () => {
        const result = Result.fromPromise(Promise.resolve(Result.err("not found")));
        const transformer = vi.fn();
        const transformed = await result.map(() => transformer());
        expect(Result.isErr(transformed)).toBe(true);
        expect(transformer).not.toHaveBeenCalled();
      });
    });

    describe("#mapErr", () => {
      it("should keep ok result without calling provided function", async () => {
        const result = Result.fromPromise(Promise.resolve(Result.ok(1)));
        const transformer = vi.fn();
        const transformed = await result.mapErr(() => transformer());
        expect(Result.isOk(transformed)).toBe(true);
        expect(transformer).not.toHaveBeenCalled();
      });

      it("should map err result", async () => {
        const result = Result.fromPromise(Promise.resolve(Result.err("not found")));
        const transformed = await result.mapErr(() => "not found");
        expect(transformed.getOrNull()).toBe("not found");
      });
    });

    describe("#mapOr", () => {
      it("should map ok result", async () => {
        const result = Result.fromPromise(Promise.resolve(Result.ok(1)));
        const transformed = await result.mapOr((value) => value + 1, 2);
        expect(transformed).toBe(2);
      });

      it("should keep err result without calling provided function", async () => {
        const result = Result.fromPromise(Promise.resolve(Result.err("not found")));
        const transformer = vi.fn();
        const transformed = await result.mapOr(() => transformer(), 2);
        expect(transformed).toBe(2);
        expect(transformer).not.toHaveBeenCalled();
      });
    });

    describe("#mapOrElse", () => {
      it("should map ok result", async () => {
        const result = Result.fromPromise(Promise.resolve(Result.ok(1)));
        const transformed = await result.mapOrElse(
          (value: number) => value + 1,
          () => 3,
        );
        expect(transformed).toBe(2);
      });

      it("should map err result", async () => {
        const result = Result.fromPromise(Promise.resolve(Result.err("not found")));
        const transformed = await result.mapOrElse(
          () => "not found",
          (value) => value + 1,
        );
        expect(transformed).toBe("not found1");
      });
    });

    describe("#andThen", () => {
      it("should map ok result", async () => {
        const result = Result.fromPromise(Promise.resolve(Result.ok(1)));
        const transformed = await result.andThen((value) => Result.ok(value + 1));
        expect(transformed.getOrNull()).toBe(2);
      });

      it("should keep err result without calling provided function", async () => {
        const result = Result.fromPromise(Promise.resolve(Result.err("not found")));
        const transformer = vi.fn();
        const transformed = await result.andThen(() => transformer());
        expect(Result.isErr(transformed)).toBe(true);
        expect(transformer).not.toHaveBeenCalled();
      });
    });

    describe("#fold", () => {
      it("should map ok result", async () => {
        const result = Result.fromPromise(Promise.resolve(Result.ok(1)));
        const transformed = await result.fold(
          (value) => value + 1,
          () => 2,
        );
        expect(transformed).toBe(2);
      });

      it("should map err result", async () => {
        const result = Result.fromPromise(Promise.resolve(Result.err("not found")));
        const transformed = await result.fold(
          () => "not found",
          (value) => value + 1,
        );
        expect(transformed).toBe("not found1");
      });
    });

    describe("#inspect", () => {
      it("should call provided function for ok result", async () => {
        const result = Result.fromPromise(Promise.resolve(Result.ok(1)));
        const fn = vi.fn();
        await result.tap(fn);
        expect(fn).toHaveBeenCalledWith(1);
      });

      it("should not call provided function for err result", async () => {
        const result = Result.fromPromise(Promise.resolve(Result.err("not found")));
        const fn = vi.fn();
        await result.tap(fn);
        expect(fn).not.toHaveBeenCalled();
      });
    });

    describe("#inspectErr", () => {
      it("should call provided function for err result", async () => {
        const result = Result.fromPromise(Promise.resolve(Result.err("not found")));
        const fn = vi.fn();
        await result.tapErr(fn);
        expect(fn).toHaveBeenCalledWith("not found");
      });

      it("should not call provided function for ok result", async () => {
        const result = Result.fromPromise(Promise.resolve(Result.ok(1)));
        const fn = vi.fn();
        await result.tapErr(fn);
        expect(fn).not.toHaveBeenCalled();
      });
    });
  });
});
