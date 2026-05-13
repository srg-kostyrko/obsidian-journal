import { describe, expect, it } from "vitest";

import { createMultiToken, createToken, isToken, tokenKind, tokenName } from "./token";

describe("createToken", () => {
  it("produces a single-binding token carrying its debug name", () => {
    const t = createToken<string>("Foo");
    expect(tokenName(t)).toBe("Foo");
    expect(tokenKind(t)).toBe("single");
  });

  it("produces distinct tokens for separate calls with the same name", () => {
    const a = createToken<string>("Same");
    const b = createToken<string>("Same");
    expect(a).not.toBe(b);
  });
});

describe("createMultiToken", () => {
  it("produces a multi-binding token carrying its debug name", () => {
    const t = createMultiToken<string>("Bar");
    expect(tokenName(t)).toBe("Bar");
    expect(tokenKind(t)).toBe("multi");
  });
});

describe("tokenKind", () => {
  it("classifies a class constructor as single", () => {
    class Foo {
      value = 1;
    }
    expect(tokenKind(Foo)).toBe("single");
  });
});

describe("tokenName", () => {
  it("uses the class constructor name for class tokens", () => {
    class Bar {
      value = 1;
    }
    expect(tokenName(Bar)).toBe("Bar");
  });
});

describe("isToken", () => {
  it("returns true for a created single token", () => {
    expect(isToken(createToken("X"))).toBe(true);
  });

  it("returns true for a created multi token", () => {
    expect(isToken(createMultiToken("Y"))).toBe(true);
  });

  it("returns true for a class constructor", () => {
    class Z {
      value = 1;
    }
    expect(isToken(Z)).toBe(true);
  });

  it("returns false for a plain object", () => {
    expect(isToken({ name: "X" })).toBe(false);
  });

  it("returns false for a non-class function", () => {
    expect(isToken(() => undefined)).toBe(false);
  });
});
