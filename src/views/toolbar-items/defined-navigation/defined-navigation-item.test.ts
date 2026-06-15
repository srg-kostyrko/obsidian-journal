import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { definedNavigationItem } from "./defined-navigation-item";

describe("definedNavigationItem", () => {
  it("defaults to walking daily notes with both buttons shown", () => {
    expect(definedNavigationItem.defaultConfig).toEqual({ target: "day", previous: true, next: true });
  });

  it("parses a valid config", () => {
    const result = v.safeParse(definedNavigationItem.schema, { target: "week", previous: false, next: true });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown target", () => {
    const result = v.safeParse(definedNavigationItem.schema, { target: "decade", previous: true, next: true });
    expect(result.success).toBe(false);
  });
});
