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

  it("rejects an unknown entry in show", () => {
    expect(v.safeParse(homeBlockSchema, { show: ["decade"] }).success).toBe(false);
    expect(v.safeParse(homeBlockSchema, { show: ["foo"] }).success).toBe(false);
  });

  it("rejects a non-numeric scale", () => {
    expect(v.safeParse(homeBlockSchema, { scale: "big" }).success).toBe(false);
  });
});
