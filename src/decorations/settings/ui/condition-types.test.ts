import { describe, expect, it } from "vitest";

import { conditionTypeOptions, SINGLETON_CONDITION_TYPES } from "./condition-types";

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
