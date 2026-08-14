import { describe, expect, it } from "vitest";

import { matchLocale } from "./init-locale";

describe("matchLocale", () => {
  it("returns the input when it matches an available locale", () => {
    expect(matchLocale("en", ["en", "de"], "en")).toBe("en");
  });

  it("normalizes case before matching", () => {
    expect(matchLocale("DE", ["en", "de"], "en")).toBe("de");
  });

  it("strips the region suffix when the full tag is not available", () => {
    expect(matchLocale("en-US", ["en", "de"], "en")).toBe("en");
  });

  it("returns the fallback when no match exists", () => {
    expect(matchLocale("xx", ["en", "de"], "en")).toBe("en");
  });
});
