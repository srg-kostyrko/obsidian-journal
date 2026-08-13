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
    // An unrecognized entry filters out silently; a typo must not blank the block.
    const result = v.parse(homeBlockSchema, { show: ["day", "decade", "week"] });
    expect(result.show).toEqual(["day", "week"]);
  });

  it("parses to an empty show list when no entry is recognized", () => {
    const result = v.parse(homeBlockSchema, { show: ["decade"] });
    expect(result.show).toEqual([]);
  });

  it("falls back to the default scale for a non-numeric value", () => {
    // A non-numeric scale fails the `v.number` check, so a typo degrades to the default
    // rather than blanking the block.
    expect(v.parse(homeBlockSchema, { scale: "big" }).scale).toBe(1);
  });

  it("coerces a zero scale to the default so the block stays visible", () => {
    expect(v.parse(homeBlockSchema, { scale: 0 }).scale).toBe(1);
  });

  it("falls back to the default separator for a null value", () => {
    expect(v.parse(homeBlockSchema, { separator: null }).separator).toBe(" • ");
  });

  it("coerces an empty separator to the default bullet", () => {
    // An empty string is falsy, so it coerces to the bullet the same as an unset separator.
    expect(v.parse(homeBlockSchema, { separator: "" }).separator).toBe(" • ");
  });

  it("applies defaults when the source is a non-object scalar", () => {
    // `show:day` with no space parses to the bare string "show:day", not a mapping — the
    // scalar-body case `asRecord` degrades to {}.
    const result = v.parse(homeBlockSchema, "show:day");
    expect(result.show).toEqual(["day"]);
    expect(result.separator).toBe(" • ");
    expect(result.scale).toBe(1);
  });

  it("degrades a scalar show to the default list", () => {
    // `show: month` (no list) parses to the bare string "month", which fails the `v.array`
    // check and falls back to the default via `v.fallback` rather than blanking the block.
    expect(v.parse(homeBlockSchema, { show: "month" }).show).toEqual(["day"]);
  });

  it("coerces a non-string shelf to its string form", () => {
    // An unquoted `shelf: 2024` parses to the number 2024; coercing it to a string form keeps
    // it usable as a shelf-name filter instead of erroring, harmless even if it never matches.
    expect(v.parse(homeBlockSchema, { shelf: 2024 }).shelf).toBe("2024");
  });
});
