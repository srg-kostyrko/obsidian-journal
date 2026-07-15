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

  it("rejects a non-numeric scale", () => {
    expect(v.safeParse(homeBlockSchema, { scale: "big" }).success).toBe(false);
  });
});
