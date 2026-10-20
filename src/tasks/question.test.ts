import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { taskQuestionSchema } from "./question";

describe("taskQuestionSchema", () => {
  it("fills every field of an empty question", () => {
    expect(v.parse(taskQuestionSchema, {})).toEqual({
      quantifier: "any",
      status: "listing",
      source: "both",
      date: "scheduled-or-due",
      filter: { mode: "and", conditions: [] },
    });
  });

  // A decoration with an unreadable condition is dropped whole by the load repair, so nothing here
  // may quietly substitute a different question.
  it.each([
    ["date", "whenever"],
    ["status", "bogus"],
    ["quantifier", "most"],
    ["source", "elsewhere"],
    ["filter", 7],
  ])("rejects an unreadable %s", (field, bad) => {
    expect(v.safeParse(taskQuestionSchema, { [field]: bad }).success).toBe(false);
  });

  it("keeps a stored date choice", () => {
    expect(v.parse(taskQuestionSchema, { date: "due" }).date).toBe("due");
  });

  it("keeps a known quantifier, status and source", () => {
    expect(v.parse(taskQuestionSchema, { quantifier: "none", status: "done", source: "notelets" })).toMatchObject({
      quantifier: "none",
      status: "done",
      source: "notelets",
    });
  });

  it("strips a status row from the filter and keeps the rest", () => {
    const parsed = v.parse(taskQuestionSchema, {
      filter: {
        mode: "or",
        conditions: [
          { type: "status", statuses: ["done"] },
          { type: "heading", headings: ["## Tasks"] },
        ],
      },
    });
    expect(parsed.filter).toEqual({
      mode: "or",
      conditions: [{ type: "heading", condition: "under", headings: ["## Tasks"] }],
    });
  });
});
