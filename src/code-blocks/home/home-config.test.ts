import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { homeBlockSchema } from "./home-config";

describe("homeBlockSchema", () => {
  it("applies all defaults when given an empty object", () => {
    const result = v.parse(homeBlockSchema, {});
    expect(result.show).toEqual(["day"]);
    expect(result.separator).toBe(" • ");
    expect(result.scale).toBe(1);
    expect(result.shelf).toBeUndefined();
  });

  it("keeps the provided values when fields are explicit", () => {
    const result = v.parse(homeBlockSchema, {
      show: ["week", "custom"],
      separator: " | ",
      scale: 1.5,
      shelf: "Work",
    });
    expect(result.show).toEqual(["week", "custom"]);
    expect(result.separator).toBe(" | ");
    expect(result.scale).toBe(1.5);
    expect(result.shelf).toBe("Work");
  });

  it("drops unknown entries from show and keeps the valid ones", () => {
    // v2 filtered invalid entries and rendered the rest; a typo must not blank the block.
    const result = v.parse(homeBlockSchema, { show: ["day", "decade", "week"] });
    expect(result.show).toEqual(["day", "week"]);
  });

  it("parses to an empty show list when no entry is recognized", () => {
    const result = v.parse(homeBlockSchema, { show: ["decade"] });
    expect(result.show).toEqual([]);
  });

  it("falls back to the default scale for a non-numeric value", () => {
    // v2 coerced with `scale || 1`; a typo must degrade to the default, not blank the block.
    expect(v.parse(homeBlockSchema, { scale: "big" }).scale).toBe(1);
  });

  it("coerces a zero scale to the default so the block stays visible", () => {
    expect(v.parse(homeBlockSchema, { scale: 0 }).scale).toBe(1);
  });

  it("falls back to the default separator for a null value", () => {
    expect(v.parse(homeBlockSchema, { separator: null }).separator).toBe(" • ");
  });

  it("applies defaults when the source is a non-object scalar", () => {
    // `show:day` with no space parses to the bare string "show:day"; v2 still rendered.
    const result = v.parse(homeBlockSchema, "show:day");
    expect(result.show).toEqual(["day"]);
    expect(result.separator).toBe(" • ");
    expect(result.scale).toBe(1);
  });

  it("degrades a scalar show to the default list", () => {
    // `show: month` (no list) parses to the bare string "month"; v2 caught the resulting
    // `.filter` throw and fell back to the default rather than blanking the block.
    expect(v.parse(homeBlockSchema, { show: "month" }).show).toEqual(["day"]);
  });

  it("coerces a non-string shelf to its string form", () => {
    // An unquoted `shelf: 2024` parses to the number 2024; v2 passed it through untouched
    // (matching no shelf) instead of erroring. Coercing keeps that graceful outcome.
    expect(v.parse(homeBlockSchema, { shelf: 2024 }).shelf).toBe("2024");
  });
});
