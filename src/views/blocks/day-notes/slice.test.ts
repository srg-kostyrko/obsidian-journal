import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { dayNotesSlice, dayNotesSliceSchema } from "./slice";

describe("dayNotesSlice", () => {
  it("defaults to the conventional created property and ISO date format", () => {
    expect(dayNotesSlice.defaults).toEqual({ property: "created", format: "YYYY-MM-DD" });
  });

  it("fills both defaults when older settings omit the slice fields", () => {
    expect(v.parse(dayNotesSliceSchema, {})).toEqual({ property: "created", format: "YYYY-MM-DD" });
  });

  it("accepts empty strings so a vault can deliberately fall back to ctime", () => {
    expect(v.parse(dayNotesSliceSchema, { property: "", format: "" })).toEqual({ property: "", format: "" });
  });
});
