import { describe, expect, it } from "vitest";

import { defineOpenMode } from "./define-open-mode";

describe("defineOpenMode", () => {
  it("returns 'active' for a plain left-click", () => {
    const event = new MouseEvent("click", { button: 0, ctrlKey: false, metaKey: false });
    expect(defineOpenMode(event)).toBe("active");
  });

  it("returns 'tab' when the ctrl key is held", () => {
    const event = new MouseEvent("click", { button: 0, ctrlKey: true });
    expect(defineOpenMode(event)).toBe("tab");
  });

  it("returns 'tab' when the meta key is held", () => {
    const event = new MouseEvent("click", { button: 0, metaKey: true });
    expect(defineOpenMode(event)).toBe("tab");
  });

  it("returns 'tab' for a middle-click", () => {
    const event = new MouseEvent("click", { button: 1 });
    expect(defineOpenMode(event)).toBe("tab");
  });
});
