import { describe, expect, it } from "vitest";

import { stockNumber } from "./stock-number";

const themeVariables: Record<string, string> = { "--radius-s": " 4px", "--size-2-1": "2px", "--rem-radius": "0.25rem" };
const read = (name: string): string => themeVariables[name] ?? "";

describe("stockNumber", () => {
  it("reads a plain value in the slider's unit", () => {
    expect(stockNumber("0.6em", "em", read)).toBe(0.6);
    expect(stockNumber("0px", "px", read)).toBe(0);
  });

  it("reads inherit as one em", () => {
    expect(stockNumber("inherit", "em", read)).toBe(1);
  });

  it("resolves a theme variable to the value it renders as", () => {
    expect(stockNumber("var(--radius-s)", "px", read)).toBe(4);
    expect(stockNumber("var(--size-2-1)", "px", read)).toBe(2);
  });

  it("converts a theme's rem value to pixels", () => {
    expect(stockNumber("var(--rem-radius)", "px", read, 16)).toBe(4);
  });

  it("answers undefined for what it cannot place", () => {
    expect(stockNumber("var(--missing)", "px", read)).toBeUndefined();
    expect(stockNumber("inherit", "px", read)).toBeUndefined();
    expect(stockNumber("calc(1px + 2px)", "px", read)).toBeUndefined();
  });
});
