import { describe, expect, it } from "vitest";

import { inheritedProperty, resolveStock, stockOption } from "./stock-value";

const themeVariables: Record<string, string> = {
  "--font-normal": " 400",
  "--font-semibold": "600",
  "--font-bold": "700",
  "--text-muted": " #999999",
};
const read = (name: string): string => themeVariables[name] ?? "";
const nothing = (): string => "";

describe("resolveStock", () => {
  it("reads a theme variable off the body", () => {
    expect(resolveStock("var(--font-bold)", read, undefined)).toBe("700");
    expect(resolveStock("var(--text-muted)", read, undefined)).toBe("#999999");
  });

  it("reads inherit as what the preview inherits", () => {
    expect(resolveStock("inherit", read, " rgb(1, 2, 3)")).toBe("rgb(1, 2, 3)");
  });

  it("passes a plain value through", () => {
    expect(resolveStock("#123456", read, undefined)).toBe("#123456");
  });

  it("answers undefined for what it cannot read", () => {
    expect(resolveStock("var(--missing)", read, undefined)).toBeUndefined();
    expect(resolveStock("inherit", read, undefined)).toBeUndefined();
    expect(resolveStock("inherit", read, "")).toBeUndefined();
    expect(resolveStock("", read, "700")).toBeUndefined();
  });
});

describe("inheritedProperty", () => {
  it("names the computed property each leaf inherits", () => {
    expect(inheritedProperty("weight")).toBe("font-weight");
    expect(inheritedProperty("italic")).toBe("font-style");
    expect(inheritedProperty("case")).toBe("text-transform");
    expect(inheritedProperty("color")).toBe("color");
    expect(inheritedProperty("size")).toBeUndefined();
  });
});

describe("stockOption", () => {
  it("places a weight at the nearest theme weight", () => {
    expect(stockOption("weight", "700", read)).toBe("bold");
    expect(stockOption("weight", "600", read)).toBe("semibold");
    expect(stockOption("weight", "400", read)).toBe("normal");
    expect(stockOption("weight", "300", read)).toBe("normal");
    expect(stockOption("weight", "560", read)).toBe("semibold");
    expect(stockOption("weight", "900", read)).toBe("bold");
  });

  it("reads the weight keywords as their numbers", () => {
    expect(stockOption("weight", "bold", read)).toBe("bold");
    expect(stockOption("weight", "normal", read)).toBe("normal");
  });

  it("places no weight when the theme defines none", () => {
    expect(stockOption("weight", "700", nothing)).toBeUndefined();
    expect(stockOption("weight", "bolder", read)).toBeUndefined();
  });

  it("reads italic as on or off", () => {
    expect(stockOption("italic", "italic", read)).toBe("on");
    expect(stockOption("italic", "oblique 10deg", read)).toBe("on");
    expect(stockOption("italic", "normal", read)).toBe("off");
    expect(stockOption("italic", "inherit", read)).toBeUndefined();
  });

  it("reads a text-transform as its case", () => {
    expect(stockOption("case", "none", read)).toBe("none");
    expect(stockOption("case", "uppercase", read)).toBe("upper");
    expect(stockOption("case", "lowercase", read)).toBe("lower");
    expect(stockOption("case", "capitalize", read)).toBe("title");
    expect(stockOption("case", "full-width", read)).toBeUndefined();
  });

  it("places nothing for a leaf with no options", () => {
    expect(stockOption("over", "1", read)).toBeUndefined();
  });
});
