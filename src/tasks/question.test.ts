import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { taskQuestionSchema } from "./question";

describe("taskQuestionSchema", () => {
  it("fills every field of an empty question", () => {
    expect(v.parse(taskQuestionSchema, {})).toEqual({
      quantifier: "any",
      status: "listing",
      source: "both",
      filter: { mode: "and", conditions: [] },
    });
  });

  it("falls back to listing for an unknown status", () => {
    expect(v.parse(taskQuestionSchema, { status: "bogus" }).status).toBe("listing");
  });

  it("falls back to any for an unknown quantifier", () => {
    expect(v.parse(taskQuestionSchema, { quantifier: "most" }).quantifier).toBe("any");
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

  it("falls back to an empty filter when the filter is not a rule", () => {
    expect(v.parse(taskQuestionSchema, { filter: 7 }).filter).toEqual({ mode: "and", conditions: [] });
  });
});
