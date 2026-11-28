import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { repairValue, defaultsFrom } from "@/settings/repair/repair-value";

import {
  calendarConditionSchema,
  calendarDecorationSchema,
  decorationConditionSchema,
  decorationName,
  decorationSchema,
  filterConditionSchema,
} from "./config";

// Interval offsets are 1-based in both directions (1 = first day, -1 = last day), so a
// stored 0 could never match anything. It is coerced rather than rejected, since existing
// configs carry it.
describe("offset condition schema", () => {
  it("reads a stored zero offset as the interval's first day", () => {
    const parsed = v.parse(decorationConditionSchema, { type: "offset", offset: 0 });
    expect(parsed).toEqual({ type: "offset", offset: 1 });
  });

  it("leaves a non-zero offset untouched", () => {
    const parsed = v.parse(decorationConditionSchema, { type: "offset", offset: -3 });
    expect(parsed).toEqual({ type: "offset", offset: -3 });
  });
});

describe("note-size condition schema", () => {
  it("parses a note-size condition", () => {
    const result = v.safeParse(decorationConditionSchema, {
      type: "note-size",
      unit: "words",
      condition: "gt",
      value: 250,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a negative note-size threshold", () => {
    const result = v.safeParse(decorationConditionSchema, {
      type: "note-size",
      unit: "words",
      condition: "gt",
      value: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an eq operator on a note-size condition", () => {
    const result = v.safeParse(decorationConditionSchema, {
      type: "note-size",
      unit: "words",
      condition: "eq",
      value: 250,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a fractional note-size threshold", () => {
    const result = v.safeParse(decorationConditionSchema, {
      type: "note-size",
      unit: "words",
      condition: "gt",
      value: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

describe("has-notelet condition schema", () => {
  it("defaults typeIds to an empty list", () => {
    expect(v.parse(decorationConditionSchema, { type: "has-notelet" })).toEqual({
      type: "has-notelet",
      typeIds: [],
    });
  });

  it("keeps the stored type ids", () => {
    expect(v.parse(decorationConditionSchema, { type: "has-notelet", typeIds: ["nt_a", "nt_b"] })).toEqual({
      type: "has-notelet",
      typeIds: ["nt_a", "nt_b"],
    });
  });

  it("rejects a non-array typeIds", () => {
    expect(() => v.parse(decorationConditionSchema, { type: "has-notelet", typeIds: "nt_a" })).toThrow();
  });
});

describe("tasks condition schema", () => {
  const defaults = {
    type: "tasks",
    quantifier: "any",
    status: "listing",
    source: "both",
    date: "scheduled-or-due",
    filter: { mode: "and", conditions: [] },
  };

  it("reads a bare tasks condition as the default question", () => {
    expect(v.parse(decorationConditionSchema, { type: "tasks" })).toEqual(defaults);
  });

  it("rejects an unknown status rather than reading a different question", () => {
    expect(v.safeParse(decorationConditionSchema, { type: "tasks", status: "weird" }).success).toBe(false);
  });

  it("strips a status row from the stored filter", () => {
    const parsed = v.parse(decorationConditionSchema, {
      type: "tasks",
      filter: { mode: "and", conditions: [{ type: "status", condition: "is", statuses: ["open"] }] },
    });
    expect(parsed).toEqual(defaults);
  });

  it("no longer parses the retired task conditions", () => {
    expect(v.safeParse(decorationConditionSchema, { type: "has-open-task" }).success).toBe(false);
    expect(v.safeParse(decorationConditionSchema, { type: "all-tasks-completed" }).success).toBe(false);
  });
});

describe("notelet scope on tag and property conditions", () => {
  it("defaults a stored tag condition to the period note, any, any type", () => {
    const parsed = v.parse(decorationConditionSchema, { type: "tag", condition: "contains", value: "x" });
    expect(parsed).toMatchObject({ source: "note", quantifier: "any", typeIds: [] });
  });

  it("keeps notelet scope on a property condition", () => {
    const input = {
      type: "property",
      name: "status",
      valueType: "text",
      condition: "eq",
      value: "blocked",
      source: "notelets",
      quantifier: "all",
      typeIds: ["nt_a"],
    };
    expect(v.parse(decorationConditionSchema, input)).toMatchObject({
      source: "notelets",
      quantifier: "all",
      typeIds: ["nt_a"],
    });
  });

  it("does not carry notelet scope into a bulk-add filter", () => {
    const parsed = v.parse(filterConditionSchema, {
      type: "tag",
      condition: "contains",
      value: "x",
      source: "notelets",
    });
    expect(parsed).not.toHaveProperty("source");
  });

  it.each(["source", "quantifier"])("drops the condition holding an invalid %s instead of resetting it", (field) => {
    const bad = { type: "tag", condition: "contains", value: "x", [field]: "latest" };
    const keep = { type: "title", condition: "contains", value: "y" };

    const result = repairValue(v.array(decorationConditionSchema), [bad, keep], defaultsFrom({}));

    expect(result?.value).toEqual([keep]);
  });
});

describe("has-note condition schema", () => {
  it("has-note without presence reads as exists", () => {
    expect(v.parse(decorationConditionSchema, { type: "has-note" })).toEqual({ type: "has-note", presence: "exists" });
  });

  it('has-note presence "missing" survives a round trip', () => {
    const stored = { type: "has-note", presence: "missing" };
    expect(v.parse(decorationConditionSchema, v.parse(decorationConditionSchema, stored))).toEqual(stored);
  });

  // Through the whole union an invalid presence already fails at item depth, so only the arm on
  // its own can tell a climbing field from one reset to its default.
  it("an invalid presence climbs", () => {
    const arm = decorationConditionSchema.options.find(
      (option) => "entries" in option && option.entries.type.literal === "has-note",
    );
    if (arm === undefined) throw new Error("no has-note arm");
    const bad = { type: "has-note", presence: "sometimes" };
    const keep = { type: "has-note", presence: "missing" };

    const result = repairValue(v.array(arm), [bad, keep], defaultsFrom({}));

    expect(result?.value).toEqual([keep]);
  });
});

describe("linked condition schema", () => {
  it("parses a linked condition", () => {
    expect(v.parse(decorationConditionSchema, { type: "linked", atLeast: 2 })).toEqual({ type: "linked", atLeast: 2 });
  });

  it("linked rejects atLeast 0", () => {
    expect(v.safeParse(decorationConditionSchema, { type: "linked", atLeast: 0 }).success).toBe(false);
  });

  it("linked is not a calendar condition", () => {
    expect(v.safeParse(calendarConditionSchema, { type: "linked", atLeast: 1 }).success).toBe(false);
  });
});

describe("created condition schema", () => {
  it("parses a created condition", () => {
    expect(v.parse(decorationConditionSchema, { type: "created", atLeast: 2 })).toEqual({
      type: "created",
      atLeast: 2,
    });
  });

  it.each([0, 1.5])("created rejects atLeast %s", (atLeast) => {
    expect(v.safeParse(decorationConditionSchema, { type: "created", atLeast }).success).toBe(false);
  });

  it("created is not a calendar condition", () => {
    expect(v.safeParse(calendarConditionSchema, { type: "created", atLeast: 1 }).success).toBe(false);
  });
});

describe("decoration name", () => {
  const base = {
    mode: "and",
    conditions: [{ type: "date", day: 12, month: 4, year: null }],
    styles: [{ type: "background", color: { type: "theme", name: "interactive-accent" } }],
  };

  it.each([
    ["journal", decorationSchema],
    ["calendar", calendarDecorationSchema],
  ] as const)("a %s decoration without a name parses with no name key", (_, schema) => {
    const parsed = v.parse(schema, base);
    expect("name" in parsed).toBe(false);
  });

  it.each([
    ["journal", decorationSchema],
    ["calendar", calendarDecorationSchema],
  ] as const)("a %s decoration keeps its name", (_, schema) => {
    expect(v.parse(schema, { ...base, name: "Release 3.8" }).name).toBe("Release 3.8");
  });

  it("decorationName treats a blank name as unnamed and trims the rest", () => {
    expect(decorationName({ name: "  " })).toBeUndefined();
    expect(decorationName({ name: " Anna " })).toBe("Anna");
    expect(decorationName({})).toBeUndefined();
  });
});
