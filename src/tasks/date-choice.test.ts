import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { rolesOf, taskDateChoiceSchema, taskDateChoices } from "./date-choice";

describe("rolesOf", () => {
  it("expands scheduled-or-due to both roles", () => {
    expect(rolesOf("scheduled-or-due")).toEqual(["scheduled", "due"]);
  });

  it("maps every other choice to its own role", () => {
    const single = taskDateChoices.filter((c) => c !== "scheduled-or-due");
    for (const choice of single) {
      expect(rolesOf(choice)).toEqual([choice]);
    }
  });
});

describe("taskDateChoiceSchema", () => {
  it("accepts each choice and rejects others", () => {
    for (const choice of taskDateChoices) expect(v.safeParse(taskDateChoiceSchema, choice).success).toBe(true);
    expect(v.safeParse(taskDateChoiceSchema, "overdue").success).toBe(false);
  });
});
