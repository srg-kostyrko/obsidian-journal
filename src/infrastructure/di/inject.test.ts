// src/infrastructure/di/inject.test.ts
import { describe, expect, it, vi } from "vitest";

import { CircularDependencyError, NoInjectionContextError } from "./errors";
import { inject, withResolutionContext, type Resolver } from "./inject";
import { createMultiToken, createToken } from "./token";

function fakeResolver(overrides: Partial<Resolver> = {}): Resolver {
  return {
    resolve: vi.fn(),
    ...overrides,
  };
}

describe("inject", () => {
  it("throws NoInjectionContextError when called outside any active context", () => {
    expect(() => inject(createToken("X"))).toThrow(NoInjectionContextError);
  });

  it("delegates to the current resolver inside a context", () => {
    const resolveSpy = vi.fn().mockReturnValue("value");
    const resolver = fakeResolver({ resolve: resolveSpy });
    const token = createToken<string>("X");
    const result = withResolutionContext(resolver, token, () => inject(token));
    expect(result).toBe("value");
    expect(resolveSpy).toHaveBeenCalledWith(token);
  });

  it("returns an array when given a multi-token", () => {
    const resolveSpy = vi.fn().mockReturnValue(["a", "b"]);
    const resolver = fakeResolver({ resolve: resolveSpy });
    const token = createMultiToken<string>("Many");
    const result = withResolutionContext(resolver, token, () => inject(token));
    expect(result).toEqual(["a", "b"]);
  });
});

describe("withResolutionContext", () => {
  it("uses the innermost resolver when contexts nest", () => {
    const outerSpy = vi.fn();
    const innerSpy = vi.fn().mockReturnValue("inner");
    const outer = fakeResolver({ resolve: outerSpy });
    const inner = fakeResolver({ resolve: innerSpy });
    const outerToken = createToken<string>("Outer");
    const innerToken = createToken<string>("Inner");
    const result = withResolutionContext(outer, outerToken, () =>
      withResolutionContext(inner, innerToken, () => inject(innerToken)),
    );
    expect(result).toBe("inner");
    expect(outerSpy).not.toHaveBeenCalled();
  });

  it("pops the context after the callback returns", () => {
    const t = createToken("X");
    withResolutionContext(fakeResolver(), t, () => undefined);
    expect(() => inject(createToken("Y"))).toThrow(NoInjectionContextError);
  });

  it("pops the context after the callback throws", () => {
    const t = createToken("X");
    expect(() =>
      withResolutionContext(fakeResolver(), t, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(() => inject(createToken("Y"))).toThrow(NoInjectionContextError);
  });

  it("throws CircularDependencyError when the same token re-enters the stack", () => {
    const t = createToken("A");
    expect(() =>
      withResolutionContext(fakeResolver(), t, () => withResolutionContext(fakeResolver(), t, () => undefined)),
    ).toThrow(CircularDependencyError);
  });

  it("preserves the chain in the CircularDependencyError", () => {
    const a = createToken("A");
    const b = createToken("B");
    let captured: CircularDependencyError | undefined;
    try {
      withResolutionContext(fakeResolver(), a, () =>
        withResolutionContext(fakeResolver(), b, () => withResolutionContext(fakeResolver(), a, () => undefined)),
      );
    } catch (error) {
      captured = error as CircularDependencyError;
    }
    expect(captured).toBeInstanceOf(CircularDependencyError);
    expect(captured?.chain).toEqual(["A", "B", "A"]);
  });
});
