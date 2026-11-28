import { describe, expect, it } from "vitest";

import { CALENDAR_CONDITION_TYPES, conditionTypeOptions, SINGLETON_CONDITION_TYPES } from "./condition-types";

describe("conditionTypeOptions", () => {
  it.each(Object.entries(conditionTypeOptions))("offers has-notelet for the %s write type", (_writeType, types) => {
    expect(types).toContain("has-notelet");
  });

  it.each(Object.entries(conditionTypeOptions))(
    "offers tasks and neither retired type for the %s write type",
    (_w, types) => {
      expect(types).toContain("tasks");
      expect(types).not.toContain("has-open-task");
      expect(types).not.toContain("all-tasks-completed");
    },
  );

  it("lets a second tasks condition be added", () => {
    expect(SINGLETON_CONDITION_TYPES.has("tasks")).toBe(false);
  });
});

describe("linked condition type", () => {
  it("linked is offered for every write type and not in calendar scope", () => {
    for (const types of Object.values(conditionTypeOptions)) {
      expect(types.indexOf("linked")).toBe(types.indexOf("has-note") + 1);
    }
    expect(CALENDAR_CONDITION_TYPES).not.toContain("linked");
    expect(SINGLETON_CONDITION_TYPES.has("linked")).toBe(false);
  });
});

describe("created condition type", () => {
  it("created is offered right after linked for every write type and not in calendar scope", () => {
    for (const types of Object.values(conditionTypeOptions)) {
      expect(types.indexOf("created")).toBe(types.indexOf("linked") + 1);
    }
    expect(CALENDAR_CONDITION_TYPES).not.toContain("created");
    expect(SINGLETON_CONDITION_TYPES.has("created")).toBe(false);
  });
});
