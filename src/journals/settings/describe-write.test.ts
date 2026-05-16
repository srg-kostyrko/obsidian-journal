import { describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";

import { describeWrite } from "./describe-write";

describe("describeWrite", () => {
  it("returns just the type for daily writes", () => {
    expect(describeWrite({ type: "day" })).toEqual({ type: "day" });
  });

  it("returns just the type for weekly writes", () => {
    expect(describeWrite({ type: "week" })).toEqual({ type: "week" });
  });

  it("returns just the type for monthly writes", () => {
    expect(describeWrite({ type: "month" })).toEqual({ type: "month" });
  });

  it("returns just the type for quarterly writes", () => {
    expect(describeWrite({ type: "quarter" })).toEqual({ type: "quarter" });
  });

  it("returns just the type for yearly writes", () => {
    expect(describeWrite({ type: "year" })).toEqual({ type: "year" });
  });

  it("includes every and duration for custom writes", () => {
    expect(
      describeWrite({
        type: "custom",
        every: "week",
        duration: 3,
        anchorDate: "2024-01-01" as AnchorString,
      }),
    ).toEqual({ type: "custom", every: "week", duration: 3 });
  });

  it("drops anchorDate from custom writes", () => {
    const result = describeWrite({
      type: "custom",
      every: "day",
      duration: 5,
      anchorDate: "2024-06-01" as AnchorString,
    });
    expect(result).not.toHaveProperty("anchorDate");
  });
});
