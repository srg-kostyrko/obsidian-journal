// src/infrastructure/di/errors.test.ts
import { describe, expect, it } from "vitest";

import {
  CircularDependencyError,
  ContainerDisposedError,
  DuplicateRegistrationError,
  InvalidTokenError,
  NoInjectionContextError,
  ScopedResolutionOutsideScopeError,
  TokenNotRegisteredError,
} from "./errors";
import { createToken } from "./token";

describe("TokenNotRegisteredError", () => {
  it("carries the token name and the resolution chain", () => {
    const t = createToken("Foo");
    const error = new TokenNotRegisteredError(t, ["A", "B"]);
    expect(error.tokenName).toBe("Foo");
    expect(error.chain).toEqual(["A", "B"]);
    expect(error.message).toContain("Foo");
  });
});

describe("DuplicateRegistrationError", () => {
  it("carries the duplicated token name", () => {
    const t = createToken("Bar");
    const error = new DuplicateRegistrationError(t);
    expect(error.tokenName).toBe("Bar");
  });
});

describe("CircularDependencyError", () => {
  it("carries the chain showing the cycle", () => {
    const error = new CircularDependencyError(["A", "B", "A"]);
    expect(error.chain).toEqual(["A", "B", "A"]);
    expect(error.message).toMatch(/A.*B.*A/);
  });
});

describe("NoInjectionContextError", () => {
  it("identifies the failing call", () => {
    const error = new NoInjectionContextError("inject(Foo)");
    expect(error.callsite).toBe("inject(Foo)");
  });
});

describe("ContainerDisposedError", () => {
  it("constructs without arguments", () => {
    const error = new ContainerDisposedError();
    expect(error.message).toContain("disposed");
  });
});

describe("ScopedResolutionOutsideScopeError", () => {
  it("carries the offending scoped token", () => {
    const t = createToken("Scoped");
    const error = new ScopedResolutionOutsideScopeError(t);
    expect(error.tokenName).toBe("Scoped");
  });
});

describe("InvalidTokenError", () => {
  it("records the offending value", () => {
    const error = new InvalidTokenError({ name: "fake" });
    expect(error.received).toEqual({ name: "fake" });
  });
});
