import { afterEach, describe, expect, it } from "vitest";

import { formatConjunction } from "./format-list";
import { baseLocale, setLocale } from "./paraglide/runtime.js";

afterEach(() => {
  void setLocale(baseLocale, { reload: false });
});

describe("formatConjunction", () => {
  it("returns the single item unchanged", () => {
    expect(formatConjunction(["Daily"])).toBe("Daily");
  });

  it("joins two items without a serial separator comma", () => {
    expect(formatConjunction(["Daily", "Weekly"])).toBe("Daily and Weekly");
  });

  it("joins three items with a serial separator", () => {
    expect(formatConjunction(["Daily", "Weekly", "Monthly"])).toBe("Daily, Weekly, and Monthly");
  });

  it("returns an empty string for an empty list", () => {
    expect(formatConjunction([])).toBe("");
  });

  it("changes the separator when the active locale changes", () => {
    void setLocale("de", { reload: false });

    expect(formatConjunction(["Daily", "Weekly"])).toBe("Daily und Weekly");
  });
});
