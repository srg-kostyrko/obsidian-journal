import { describe, expect, expectTypeOf, it } from "vitest";

import { Option, type Some, type None } from "./option";

import type { Result } from "./result";

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

  describe("getOrUndefined", () => {
    it("returns the inner value when Some", () => {
      expect(Option.some(7).getOrUndefined()).toBe(7);
    });

    it("returns undefined when None", () => {
      expect(Option.none<number>().getOrUndefined()).toBeUndefined();
    });
  });

  describe("okOr / okOrElse", () => {
    it("okOr on Some returns Ok with the inner value", () => {
      const opt = Option.some(5);
      const r = opt.okOr(new Error("nope"));
      expect(r.kind).toBe("ok");
      expect(r.isOk() && r.value).toBe(5);
    });

    it("okOr on None returns Err with the provided error", () => {
      const error = new Error("missing");
      const r = Option.none<number>().okOr(error);
      expect(r.kind).toBe("err");
      expect(r.isErr() && r.error).toBe(error);
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
      expect(r.isErr() && r.error.message).toBe("computed");
    });

    it("okOr is typed Result<T, E>", () => {
      const r = Option.some(5).okOr(new Error("x"));
      expectTypeOf(r).toEqualTypeOf<Result<number, Error>>();
    });
  });
});
