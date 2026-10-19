import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { notePropertySliceSchema } from "./slice";

describe("notePropertySliceSchema", () => {
  it("defaults to disabled with the TaskNotes-shaped property names", () => {
    expect(v.parse(notePropertySliceSchema, {})).toEqual({
      enabled: false,
      setUp: false,
      identify: { by: "tag", tag: "#task" },
      excludedFolders: [],
      archiveTag: "#archived",
      dates: { due: "due", scheduled: "scheduled", done: "completedDate", created: "dateCreated" },
      statusProperty: "status",
      statusMap: { none: "todo", open: "todo", "in-progress": "in-progress", done: "done" },
      canonical: { todo: "open", done: "done", "in-progress": "in-progress" },
      titleProperty: "title",
      modifiedProperty: "dateModified",
      recurrenceProperties: ["recurrence", "recurrence_parent"],
    });
  });
  it("resets only setUp when it is malformed", () => {
    const parsed = v.parse(notePropertySliceSchema, { enabled: true, setUp: "yes" });
    expect(parsed.enabled).toBe(true);
    expect(parsed.setUp).toBe(false);
  });
  it("resets only dates when it is malformed", () => {
    const parsed = v.parse(notePropertySliceSchema, { enabled: true, dates: 7, statusProperty: "state" });
    expect(parsed.enabled).toBe(true);
    expect(parsed.statusProperty).toBe("state");
    expect(parsed.dates.due).toBe("due");
  });
  it("resets only identify when the rule is unusable", () => {
    const parsed = v.parse(notePropertySliceSchema, { enabled: true, identify: { by: "nonsense" } });
    expect(parsed.enabled).toBe(true);
    expect(parsed.identify).toEqual({ by: "tag", tag: "#task" });
  });
});
