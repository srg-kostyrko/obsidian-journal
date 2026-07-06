import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { definedNavigationItem } from "./defined-navigation-item";

describe("definedNavigationItem", () => {
  it("defaults to walking daily notes in the next direction", () => {
    expect(definedNavigationItem.defaultConfig).toEqual({ target: "day", direction: "next" });
  });

  it("parses a valid config", () => {
    const result = v.safeParse(definedNavigationItem.schema, { target: "week", direction: "previous" });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown target", () => {
    const result = v.safeParse(definedNavigationItem.schema, { target: "decade", direction: "next" });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown direction", () => {
    const result = v.safeParse(definedNavigationItem.schema, { target: "day", direction: "sideways" });
    expect(result.success).toBe(false);
  });
});
