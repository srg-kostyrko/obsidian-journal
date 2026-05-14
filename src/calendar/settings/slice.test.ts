import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { calendarSlice, calendarSliceSchema } from "./slice";

describe("calendarSliceSchema", () => {
  it("accepts the locale mode", () => {
    const parsed = v.safeParse(calendarSliceSchema, { mode: "locale" });
    expect(parsed.success).toBe(true);
  });

  it("accepts a valid custom mode", () => {
    const parsed = v.safeParse(calendarSliceSchema, {
      mode: "custom",
      dow: 1,
      doy: 4,
      global: false,
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts the Middle Eastern preset's doy=12 with dow=6", () => {
    const parsed = v.safeParse(calendarSliceSchema, {
      mode: "custom",
      dow: 6,
      doy: 12,
      global: false,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a custom mode where 7 + dow - doy is out of 1..7", () => {
    const parsed = v.safeParse(calendarSliceSchema, {
      mode: "custom",
      dow: 0,
      doy: 99,
      global: false,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects dow outside 0..6", () => {
    const parsed = v.safeParse(calendarSliceSchema, {
      mode: "custom",
      dow: 7,
      doy: 4,
      global: false,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("calendarSlice", () => {
  it("defaults to locale mode", () => {
    expect(calendarSlice.defaults).toEqual({ mode: "locale" });
  });

  it('registers under the "calendar" key', () => {
    expect(calendarSlice.key).toBe("calendar");
  });
});
