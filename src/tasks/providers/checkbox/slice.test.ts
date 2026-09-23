import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { checkboxSliceSchema } from "./slice";

describe("checkboxSliceSchema", () => {
  it("keeps the other fields when one value is unusable", () => {
    const parsed = v.parse(checkboxSliceSchema, {
      enabled: true,
      rule: { mode: "nonsense", conditions: [] },
      statusMap: { " ": "todo" },
      canonical: { done: "x" },
    });
    expect(parsed.rule.mode).toBe("and");
    expect(parsed.statusMap).toEqual({ " ": "todo" });
  });
  it("accepts any string in the status map so a bad entry cannot reset the slice", () => {
    const parsed = v.parse(checkboxSliceSchema, { statusMap: { "?": "whatever" } });
    expect(parsed.statusMap["?"]).toBe("whatever");
  });
  it("resets only statusMap when it is not an object", () => {
    const parsed = v.parse(checkboxSliceSchema, {
      enabled: false,
      rule: { mode: "and", conditions: [] },
      statusMap: "not-an-object",
      canonical: { done: "x" },
    });
    expect(parsed.enabled).toBe(false);
    expect(parsed.rule).toEqual({ mode: "and", conditions: [] });
    expect(parsed.statusMap).toEqual({ " ": "todo", x: "done", X: "done", "/": "in-progress", "-": "cancelled" });
  });
  it("resets only canonical when it has non-string values", () => {
    const parsed = v.parse(checkboxSliceSchema, {
      enabled: false,
      rule: { mode: "and", conditions: [] },
      statusMap: { " ": "todo" },
      canonical: { done: 5 },
    });
    expect(parsed.enabled).toBe(false);
    expect(parsed.rule).toEqual({ mode: "and", conditions: [] });
    expect(parsed.canonical).toEqual({ todo: " ", done: "x", "in-progress": "/", cancelled: "-" });
  });
});
