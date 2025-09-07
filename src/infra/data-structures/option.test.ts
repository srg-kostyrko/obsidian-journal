import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { AsyncOption, Option } from "./option";
import { Result } from "./result";

class CustomError extends Error {}

describe("Option", () => {
  describe("isSome", () => {
    it("should return true if option is Some", () => {
      const option = Option.some(1);
      expect(Option.isSome(option)).toBe(true);
    });

    it("should return false if option is None", () => {
      const option = Option.none();
      expect(Option.isSome(option)).toBe(false);
    });
  });

  describe("isSomeAnd", () => {
    it("should return true if option is Some and value matches predicate", () => {
      const option = Option.some(1);
      expect(Option.isSomeAnd(option, (value) => value === 1)).toBe(true);
    });

    it("should return false if option is Some and value does not match predicate", () => {
      const option = Option.some(1);
      expect(Option.isSomeAnd(option, (value) => value === 2)).toBe(false);
    });

    it("should return false if option is None", () => {
      const option = Option.none();
      expect(Option.isSomeAnd(option, (value) => value === 1)).toBe(false);
    });
  });

  describe("isNone", () => {
    it("should return true if option is None", () => {
      const option = Option.none();
      expect(Option.isNone(option)).toBe(true);
    });

    it("should return false if option is Some", () => {
      const option = Option.some(1);
      expect(Option.isNone(option)).toBe(false);
    });
  });

  describe("isNoneOr", () => {
    it("should return true if option is None", () => {
      const option = Option.none();
      expect(Option.isNoneOr(option, (value) => value === 1)).toBe(true);
    });

    it("should return true if option is Some and value matches predicate", () => {
      const option = Option.some(1);
      expect(Option.isNoneOr(option, (value) => value === 1)).toBe(true);
    });

    it("should return false if option is Some and value does not match predicate", () => {
      const option = Option.some(1);
      expect(Option.isNoneOr(option, (value) => value === 2)).toBe(false);
    });
  });

  describe("fromNullable", () => {
    it("should create a Some for not nullable value", () => {
      const option = Option.fromNullable(1);
      expect(Option.isSome(option)).toBe(true);
    });

    it("should create a None from null", () => {
      const option = Option.fromNullable(null);
      expect(Option.isNone(option)).toBe(true);
    });

    it("should create a None from undefined", () => {
      let value;
      const option = Option.fromNullable(value);
      expect(Option.isNone(option)).toBe(true);
    });
  });

  describe("try", () => {
    it('should infer correct types when calling "try"', () => {
      const syncOption = Option.try(() => "some value");
      expectTypeOf(syncOption).toEqualTypeOf<Option<string>>();

      // eslint-disable-next-line @typescript-eslint/require-await
      const asyncOption = Option.try(async () => "some value");
      expectTypeOf(asyncOption).toEqualTypeOf<AsyncOption<string>>();

      const syncOptionFlattened = Option.try(() => Option.some("some value"));
      expectTypeOf(syncOptionFlattened).toEqualTypeOf<Option<string>>();

      // eslint-disable-next-line @typescript-eslint/require-await
      const asyncOptionFlattened = Option.try(async () => Option.some("some value"));
      expectTypeOf(asyncOptionFlattened).toEqualTypeOf<AsyncOption<string>>();
    });

    it("should execute a provided callback and wrap an successful outcome in a option", () => {
      const result = Option.try(() => "some value");

      expect(Option.isSome(result)).toBe(true);
      expect(result.getOrNull()).toBe("some value");
    });

    it("should execute a provided async-callback and wraps an successful outcome in a async-option", async () => {
      // eslint-disable-next-line @typescript-eslint/require-await
      const asyncOption = Option.try(async () => "some value");

      expect(asyncOption).toBeInstanceOf(AsyncOption);

      const result = await asyncOption;

      expect(Option.isSome(result)).toBe(true);
      const value = result.getOrNull();
      expect(value).toBe("some value");
    });

    it("executes a provided callback and wraps a failed outcome in a option", () => {
      const result = Option.try((): string => {
        throw new Error("test");
      });

      expect(Option.isNone(result)).toBe(true);
    });

    it("executes a provided async-callback and wraps a failed outcome in a async-option", async () => {
      // eslint-disable-next-line @typescript-eslint/require-await
      const asyncOption = Option.try(async (): Promise<string> => {
        throw new Error("test");
      });

      expect(asyncOption).toBeInstanceOf(AsyncOption);

      const result = await asyncOption;

      expect(Option.isNone(result)).toBe(true);
    });

    it("flattens another option-type when returned by the provided callback", () => {
      const optionA = Option.try(() => Option.some("some value"));
      const OptionB = Option.try(() => Option.none());

      expect(Option.isSome(optionA)).toBe(true);
      expect(optionA.getOrNull()).toBe("some value");

      expect(Option.isNone(OptionB)).toBe(true);
    });

    it("flattens another option-type when returned by the provided async-callback", async () => {
      // eslint-disable-next-line @typescript-eslint/require-await
      const asyncOptionA = Option.try(async () => Option.some("some value"));
      // eslint-disable-next-line @typescript-eslint/require-await
      const asyncOptionB = Option.try(async () => Option.none());

      expect(asyncOptionA).toBeInstanceOf(AsyncOption);
      expect(asyncOptionB).toBeInstanceOf(AsyncOption);

      const resultA = await asyncOptionA;
      expect(Option.isSome(resultA)).toBe(true);
      expect(resultA.getOrNull()).toBe("some value");

      const resultB = await asyncOptionB;
      expect(Option.isNone(resultB)).toBe(true);
    });
  });

  describe("fromPromise", () => {
    it("transforms a promise holding a regular value into an async option", async () => {
      const asyncOption = Option.fromPromise(Promise.resolve(12));

      expectTypeOf(asyncOption).toEqualTypeOf<AsyncOption<number>>();
      expect(asyncOption).toBeInstanceOf(AsyncOption);
      const resolvedAsyncOption = await asyncOption;
      expect(Option.isSome(resolvedAsyncOption)).toBe(true);
      expect(resolvedAsyncOption.getOrNull()).toBe(12);
    });

    it("transforms a promise holding an Option into an async option", async () => {
      const asyncOption = Option.fromPromise(Promise.resolve(Option.some(12)));

      expectTypeOf(asyncOption).toEqualTypeOf<AsyncOption<number>>();
      expect(asyncOption).toBeInstanceOf(AsyncOption);
      const resolvedAsyncOption = await asyncOption;
      expect(Option.isSome(resolvedAsyncOption)).toBe(true);
      expect(resolvedAsyncOption.getOrNull()).toBe(12);
    });

    it("transforms a promise holding a AsyncOption into an async option", async () => {
      const asyncOption = Option.fromPromise(Promise.resolve(AsyncOption.some(12)));

      expectTypeOf(asyncOption).toEqualTypeOf<AsyncOption<number>>();
      expect(asyncOption).toBeInstanceOf(AsyncOption);
      const resolvedAsyncOption = await asyncOption;
      expect(Option.isSome(resolvedAsyncOption)).toBe(true);
      expect(resolvedAsyncOption.getOrNull()).toBe(12);
    });

    it("does not track async exceptions but throws them instead", async () => {
      await expect(() =>
        Option.fromPromise(
          Promise.resolve().then(() => {
            throw new CustomError();
          }),
        ),
      ).rejects.toBeInstanceOf(CustomError);
    });

    it("throws when exceptions are encountered in the async function returning the promise", async () => {
      // eslint-disable-next-line @typescript-eslint/require-await
      async function myFunction(): Promise<Option<number>> {
        throw new CustomError("Boom!");
      }

      await expect(() => Option.fromPromise(myFunction()).map(() => 12)).rejects.toThrow(CustomError);
    });
  });

  describe("Some", () => {
    it("should create a Some", () => {
      const option = Option.some(1);
      expect(Option.isSome(option)).toBe(true);
    });

    it("should return some value when unwrapping", () => {
      const option = Option.some(1);
      expect(option.getOrNull()).toBe(1);
    });

    it("should return some value for unwrapOr ignoring default value", () => {
      const option = Option.some(1);
      expect(option.getOrDefault(2)).toBe(1);
    });

    it("should return some value for unwrapOrElse without calling provided function", () => {
      const option = Option.some(1);
      const defaultValue = vi.fn(() => 2);
      expect(option.getOrElse(defaultValue)).toBe(1);
      expect(defaultValue).not.toHaveBeenCalled();
    });

    it('should transform some value with "map"', () => {
      const option = Option.some(1);
      expect(option.map((value) => value + 1).getOrNull()).toBe(2);
    });

    it("should convert to AsyncOption when mapping with async function", async () => {
      const option = Option.some(1);
      // eslint-disable-next-line @typescript-eslint/require-await
      const mapped = option.map(async (value) => value + 1);
      expect(mapped).toBeInstanceOf(AsyncOption);
      expect(await mapped.getOrNull()).toBe(2);
    });

    it('should transform some value with "mapOr"', () => {
      const option = Option.some(1);
      expect(option.mapOr((value) => value + 1, 3)).toBe(2);
    });

    it('should transform some value with "mapOrElse" without calling provided function', () => {
      const option = Option.some(1);
      const defaultValue = vi.fn(() => 3);
      expect(option.mapOrElse((value) => value + 1, defaultValue)).toBe(2);
      expect(defaultValue).not.toHaveBeenCalled();
    });

    it("should call function provided in tap with some value", () => {
      const option = Option.some(1);
      const fn = vi.fn();
      option.tap(fn);
      expect(fn).toHaveBeenCalledWith(1);
    });

    it("should return same Some instance if value matches filter predicate", () => {
      const option = Option.some(1);
      expect(option.filter((value) => value === 1)).toBe(option);
    });

    it("should return None if value does not match filter predicate", () => {
      const option = Option.some(1);
      const result = option.filter((value) => value === 2);
      expect(Option.isNone(result)).toBe(true);
    });

    it("should return self when or is called", () => {
      const option = Option.some(1);
      expect(option.or(Option.some(2))).toBe(option);
    });

    it("should return self and not call provided function when orElse is called", () => {
      const option = Option.some(1);
      const fn = vi.fn(() => Option.some(2));
      expect(option.orElse(fn)).toBe(option);
      expect(fn).not.toHaveBeenCalled();
    });

    it("should map to async option when orElse is called with async function", async () => {
      const option = Option.none();
      // eslint-disable-next-line @typescript-eslint/require-await
      const fn = async () => Option.some(2);
      const asyncOption = option.orElse(fn);
      expect(asyncOption).toBeInstanceOf(AsyncOption);
      expect(await asyncOption.getOrNull()).toBe(2);
    });

    it("should call onSome function in fold", () => {
      const option = Option.some(1);
      const onSome = vi.fn((value) => value + 1);
      const onNone = vi.fn(() => 3);
      const result = option.fold(onSome, onNone);
      expect(result).toBe(2);
    });

    it("should transform option with andThen", () => {
      const option = Option.some(1);
      expect(option.andThen((value) => Option.some(value + 1)).getOrNull()).toBe(2);
    });

    describe("#zip", () => {
      it("should zip two options", () => {
        const option1 = Option.some(1);
        const option2 = Option.some(2);
        const result = option1.zip(option2);
        expect(result).toBeInstanceOf(Option);
        expect(result.getOrNull()).toEqual([1, 2]);
      });

      it("should return other option if is is none", () => {
        const option1 = Option.some(1);
        const option2 = Option.none();
        const result = option1.zip(option2);
        expect(result).toBe(option2);
      });
    });

    describe("#zipWith", () => {
      it("should zip two options with function", () => {
        const option1 = Option.some(1);
        const option2 = Option.some(2);
        const result = option1.zipWith(option2, (a, b) => a + b);
        expect(result).toBeInstanceOf(Option);
        expect(result.getOrNull()).toBe(3);
      });

      it("should return other option if is is none", () => {
        const option1 = Option.some(1);
        const option2 = Option.none<number>();
        const result = option1.zipWith(option2, (a, b) => a + b);
        expect(result).toBe(option2);
      });

      it("should not call callback if other option is none", () => {
        const option1 = Option.some(1);
        const option2 = Option.none<number>();
        const callback = vi.fn();
        option1.zipWith(option2, callback);
        expect(callback).not.toHaveBeenCalled();
      });
    });
  });

  describe("None", () => {
    it("should create a None", () => {
      const option = Option.none();
      expect(Option.isNone(option)).toBe(true);
    });

    it("should return null when unwrapping", () => {
      const option = Option.none();
      expect(option.getOrNull()).toBe(null);
    });

    it("should return default value when unwrapping with unwrapOr", () => {
      const option = Option.none();
      expect(option.getOrDefault(1)).toBe(1);
    });

    it("should return default value when unwrapping with unwrapOrElse", () => {
      const option = Option.none();
      const defaultValue = vi.fn(() => 1);
      expect(option.getOrElse(defaultValue)).toBe(1);
      expect(defaultValue).toHaveBeenCalled();
    });

    it("should not call function provided in tap", () => {
      const option = Option.none();
      const fn = vi.fn();
      option.tap(fn);
      expect(fn).not.toHaveBeenCalled();
    });

    it("should return None for filter and not call provided function", () => {
      const option = Option.none();
      const predicate = vi.fn((_) => true);
      const result = option.filter((element) => predicate(element));
      expect(Option.isNone(result)).toBe(true);
      expect(result).toBe(option);
      expect(predicate).not.toHaveBeenCalled();
    });

    it("should return provided option when or is called", () => {
      const option = Option.none();
      const other = Option.some(1);
      expect(option.or(other)).toBe(other);
    });

    it("should call provided function when orElse is called", () => {
      const option = Option.none();
      const other = Option.some(1);
      const fn = vi.fn(() => other);
      expect(option.orElse(fn)).toBe(other);
      expect(fn).toHaveBeenCalled();
    });

    it("should call onNone function in fold", () => {
      const option = Option.none();
      const onSome = vi.fn((value) => value + 1);
      const onNone = vi.fn(() => 3);
      const result = option.fold(onSome, onNone);
      expect(result).toBe(3);
    });

    describe("#andThen", () => {
      it("should return self when called", () => {
        const option = Option.none();
        const callback = vi.fn();
        expect(option.andThen(callback)).toBe(option);
      });

      it("should not call callback when called", () => {
        const option = Option.none();
        const callback = vi.fn();
        option.andThen(callback as () => Option<number>);
        expect(callback).not.toHaveBeenCalled();
      });
    });

    describe("#zip", () => {
      it("should return self when called", () => {
        const option = Option.none();
        const other = Option.some(1);
        expect(option.zip(other)).toBe(option);
      });
    });

    describe("#zipWith", () => {
      it("should return self when called", () => {
        const option = Option.none();
        const other = Option.some(1);
        const callback = vi.fn();
        const result = option.zipWith(other, callback);
        expect(result).toBe(option);
      });

      it("should not call callback when called", () => {
        const option = Option.none();
        const other = Option.some(1);
        const callback = vi.fn();
        option.zipWith(other, callback);
        expect(callback).not.toHaveBeenCalled();
      });
    });
  });

  describe("AsyncOption", () => {
    describe("#getOrNull", () => {
      it("should return null when unwrapping none", async () => {
        const option = AsyncOption.none();
        expect(await option.getOrNull()).toBe(null);
      });

      it("should return value when unwrapping some", async () => {
        const option = AsyncOption.some(1);
        expect(await option.getOrNull()).toBe(1);
      });
    });

    describe("#getOrDefault", () => {
      it("should return default value when unwrapping none", async () => {
        const option = AsyncOption.none();
        expect(await option.getOrDefault(1)).toBe(1);
      });

      it("should return value when unwrapping some", async () => {
        const option = AsyncOption.some(1);
        expect(await option.getOrDefault(2)).toBe(1);
      });
    });

    describe("#getOrElse", () => {
      it("should return value when unwrapping some", async () => {
        const option = AsyncOption.some(1);
        const defaultValue = vi.fn(() => 2);
        expect(await option.getOrElse(defaultValue)).toBe(1);
        expect(defaultValue).not.toHaveBeenCalled();
      });

      it("should return provided value when unwrapping none", async () => {
        const option = AsyncOption.none();
        const defaultValue = vi.fn(() => 2);
        expect(await option.getOrElse(defaultValue)).toBe(2);
        expect(defaultValue).toHaveBeenCalled();
      });
    });

    describe("#map", () => {
      it('should transform some value with "map"', async () => {
        const option = AsyncOption.some(1);
        expect(await option.map((value) => value + 1).getOrNull()).toBe(2);
      });

      it('should not transform none with "map"', async () => {
        const option = AsyncOption.none();
        const transform = vi.fn();
        expect(await option.map(() => transform()).getOrNull()).toBe(null);
        expect(transform).not.toHaveBeenCalled();
      });
    });

    describe("#mapOr", () => {
      it('should transform some value with "mapOr"', async () => {
        const option = AsyncOption.some(1);
        expect(await option.mapOr((value) => value + 1, 3)).toBe(2);
      });

      it('should return default value when unwrapping none with "mapOr"', async () => {
        const option = AsyncOption.none();
        const transform = vi.fn(() => 2);
        expect(await option.mapOr(() => transform(), 3)).toBe(3);
        expect(transform).not.toHaveBeenCalled();
      });
    });

    describe("#mapOrElse", () => {
      it('should transform some value with "mapOrElse"', async () => {
        const option = AsyncOption.some(1);
        expect(
          await option.mapOrElse(
            (value) => value + 1,
            () => 3,
          ),
        ).toBe(2);
      });

      it('should return default value when unwrapping none with "mapOrElse"', async () => {
        const option = AsyncOption.none();
        const transform = vi.fn(() => 2);
        expect(
          await option.mapOrElse(
            () => transform(),
            () => 3,
          ),
        ).toBe(3);
        expect(transform).not.toHaveBeenCalled();
      });
    });

    describe("#fold", () => {
      it("should call provided onSome function", async () => {
        const option = AsyncOption.some(1);
        const onSome = vi.fn((value) => value + 1);
        const onNone = vi.fn(() => 3);
        expect(await option.fold(onSome, onNone)).toBe(2);
        expect(onSome).toHaveBeenCalled();
        expect(onNone).not.toHaveBeenCalled();
      });

      it("should call provided onNone function", async () => {
        const option = AsyncOption.none();
        const onSome = vi.fn((value) => value + 1);
        const onNone = vi.fn(() => 3);
        expect(await option.fold(onSome, onNone)).toBe(3);
        expect(onSome).not.toHaveBeenCalled();
        expect(onNone).toHaveBeenCalled();
      });
    });

    describe("#or", () => {
      it("should return some when unwrapping some", async () => {
        const option = AsyncOption.some(1);
        const other = Option.some(2);
        expect(await option.or(other).getOrNull()).toBe(1);
      });

      it("should return provided option when unwrapping none", async () => {
        const option = AsyncOption.none();
        const other = Option.some(2);
        expect(await option.or(other)).toBe(other);
      });
    });

    describe("#orElse", () => {
      it("should return some when unwrapping some", async () => {
        const option = AsyncOption.some(1);
        const other = Option.some(2);
        expect(await option.orElse(() => other).getOrNull()).toBe(1);
      });
      it("should call provided function when unwrapping none", async () => {
        const option = AsyncOption.none();
        const other = Option.some(1);
        const fn = vi.fn(() => other);
        expect(await option.orElse(fn)).toBe(other);
        expect(fn).toHaveBeenCalled();
      });
    });

    describe("#okOr", () => {
      it("should return ok when unwrapping some", async () => {
        const option = AsyncOption.some(1);

        const result = await option.okOr(() => new CustomError());
        expect(Result.isOk(result)).toBe(true);
        expect(result.getOrNull()).toBe(1);
      });
      it("should return err with provided error when unwrapping none", async () => {
        const option = AsyncOption.none();

        const result = await option.okOr(new CustomError());
        expect(Result.isErr(result)).toBe(true);
        expect(result.err().getOrNull()).toBeInstanceOf(CustomError);
      });
    });

    describe("#okOrElse", () => {
      it("should return ok when unwrapping some", async () => {
        const option = AsyncOption.some(1);
        const fn = vi.fn(() => new CustomError());
        const result = await option.okOrElse(fn);
        expect(Result.isOk(result)).toBe(true);
        expect(result.getOrNull()).toBe(1);
      });
      it("should return err with provided error when unwrapping none", async () => {
        const option = AsyncOption.none();
        const fn = vi.fn(() => new CustomError());
        const result = await option.okOrElse(fn);
        expect(Result.isErr(result)).toBe(true);
        expect(result.err().getOrNull()).toBeInstanceOf(CustomError);
      });
    });

    describe("#tap", () => {
      it("should call provided function when unwrapping some", async () => {
        const option = AsyncOption.some(1);
        const fn = vi.fn();
        await option.tap(fn);
        expect(fn).toHaveBeenCalledWith(1);
      });
      it("should not call provided function when unwrapping none", async () => {
        const option = AsyncOption.none();
        const fn = vi.fn();
        await option.tap(fn);
        expect(fn).not.toHaveBeenCalled();
      });
    });

    describe("#filter", () => {
      it("should return some when unwrapping some", async () => {
        const option = AsyncOption.some(1);
        const fn = vi.fn(() => true);
        expect(await option.filter(() => fn()).getOrNull()).toBe(1);
      });
      it("should return none when unwrapping some", async () => {
        const option = AsyncOption.some(1);
        const fn = vi.fn(() => false);
        expect(Option.isNone(await option.filter(fn))).toBe(true);
      });
    });

    describe("#andThen", () => {
      it("should return some when unwrapping some", async () => {
        const option = AsyncOption.some(1);
        const fn = vi.fn(() => Option.some(2));
        expect(await option.andThen(fn).getOrNull()).toBe(2);
        expect(fn).toHaveBeenCalledWith(1);
      });
      it("should return none when unwrapping none", async () => {
        const option = AsyncOption.none();
        const fn = vi.fn(() => Option.some(2));
        expect(Option.isNone(await option.andThen(fn))).toBe(true);
        expect(fn).not.toHaveBeenCalled();
      });
    });

    describe("#zip", () => {
      it("should return none when unwrapping none", async () => {
        const option = AsyncOption.none();
        const other = Option.some(2);
        expect(Option.isNone(await option.zip(other))).toBe(true);
      });

      it("should return some when unwrapping some", async () => {
        const option = AsyncOption.some(1);
        const other = Option.some(2);
        expect(await option.zip(other).getOrNull()).toEqual([1, 2]);
      });
    });

    describe("#zipWith", () => {
      it("should return none when unwrapping none", async () => {
        const option = AsyncOption.none();
        const other = Option.some(2);
        const fn = vi.fn(() => 3);
        expect(Option.isNone(await option.zipWith(other, fn))).toBe(true);
        expect(fn).not.toHaveBeenCalled();
      });

      it("should return some when unwrapping some", async () => {
        const option = AsyncOption.some(1);
        const other = Option.some(2);
        const fn = vi.fn(() => 3);
        expect(await option.zipWith(other, fn).getOrNull()).toBe(3);
        expect(fn).toHaveBeenCalledWith(1, 2);
      });
    });
  });
});
