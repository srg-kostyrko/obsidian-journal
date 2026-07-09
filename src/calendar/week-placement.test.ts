import { describe, expect, it } from "vitest";

import { resolveWeekPlacement } from "./week-placement";

describe("resolveWeekPlacement", () => {
  it("returns the global default when the config is 'default'", () => {
    expect(resolveWeekPlacement("default", "right")).toBe("right");
  });

  it("returns the global default when the config is undefined", () => {
    expect(resolveWeekPlacement(undefined, "right")).toBe("right");
  });

  it("returns an explicit placement unchanged", () => {
    expect(resolveWeekPlacement("left", "right")).toBe("left");
  });
});
