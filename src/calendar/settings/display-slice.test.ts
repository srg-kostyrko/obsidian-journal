import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { calendarDisplaySlice, calendarDisplaySliceSchema } from "./display-slice";

describe("calendarDisplaySlice", () => {
  it("defaults weekPlacement to left", () => {
    expect(calendarDisplaySlice.defaults.weekPlacement).toBe("left");
  });

  it("fills weekPlacement from the default when the field is absent", () => {
    const parsed = v.parse(calendarDisplaySliceSchema, {});
    expect(parsed.weekPlacement).toBe("left");
  });

  it("defaults timelineNavigation to off, so no existing block gains a row on upgrade", () => {
    expect(calendarDisplaySlice.defaults.timelineNavigation).toBe(false);
  });

  it("fills timelineNavigation from the default when the field is absent", () => {
    const parsed = v.parse(calendarDisplaySliceSchema, {});
    expect(parsed.timelineNavigation).toBe(false);
  });

  it("keeps vault day notes off on upgrade and defaults to newest modified first", () => {
    const parsed = v.parse(calendarDisplaySliceSchema, {});
    expect(parsed.vaultDayNotes).toBe(false);
    expect(parsed.vaultDayNotesSort).toBe("modified-desc");
    expect(parsed.vaultDayNotesIncludeJournals).toBe(true);
    expect(calendarDisplaySlice.defaults).toMatchObject({
      vaultDayNotes: false,
      vaultDayNotesSort: "modified-desc",
      vaultDayNotesIncludeJournals: true,
    });
  });

  it("accepts every supported vault-note sort and rejects unknown values", () => {
    for (const value of ["modified-desc", "modified-asc", "name-asc", "name-desc"]) {
      expect(v.safeParse(calendarDisplaySliceSchema, { vaultDayNotesSort: value }).success).toBe(true);
    }
    expect(v.safeParse(calendarDisplaySliceSchema, { vaultDayNotesSort: "created-desc" }).success).toBe(false);
  });

  it("rejects an unknown placement value", () => {
    const parsed = v.safeParse(calendarDisplaySliceSchema, { weekPlacement: "middle" });
    expect(parsed.success).toBe(false);
  });
});
