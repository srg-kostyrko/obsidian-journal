import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installTestCalendar } from "@/calendar/testing";
import { customJournal, fixedJournal } from "@/journals/testing";

import { normalizeSelector, toCalendarDate, toJournalInfo } from "./convert";

function anchorOf(input: Parameters<typeof toCalendarDate>[0]): string | null {
  const parsed = toCalendarDate(input);
  return parsed.isSome() ? parsed.value.toAnchor() : null;
}

describe("toCalendarDate", () => {
  let teardown: () => void;

  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });

  afterEach(() => {
    teardown();
  });

  it("reads a JS Date in local time, ignoring its clock", () => {
    expect(anchorOf(new Date(2026, 7, 18, 23, 45))).toBe("2026-08-18");
  });

  it("accepts anything with toDate()", () => {
    expect(anchorOf({ toDate: () => new Date(2026, 0, 2) })).toBe("2026-01-02");
  });

  it("accepts a date expression string", () => {
    expect(anchorOf("2026-03-09")).toBe("2026-03-09");
  });

  it("accepts the relative grammar the URI handler uses", () => {
    expect(anchorOf("today")).not.toBeNull();
    expect(anchorOf("+1w")).not.toBe(anchorOf("today"));
  });

  it("returns none for a string it cannot read", () => {
    expect(anchorOf("whenever")).toBeNull();
  });

  it("returns none for an invalid Date", () => {
    expect(anchorOf(new Date(NaN))).toBeNull();
  });
});

describe("normalizeSelector", () => {
  it("treats a bare string as a journal name", () => {
    expect(normalizeSelector("Work Daily")).toEqual({ journal: "Work Daily" });
  });

  it("passes an object through, keeping an explicit null shelf", () => {
    expect(normalizeSelector({ writeType: "day", shelf: null })).toEqual({ writeType: "day", shelf: null });
  });

  it("treats undefined as matching everything", () => {
    expect(normalizeSelector(undefined)).toEqual({});
  });
});

describe("toJournalInfo", () => {
  it("flattens the empty-shelf sentinel to null", () => {
    expect(toJournalInfo("daily", fixedJournal("daily", { type: "day" }), "")).toEqual({
      name: "daily",
      shelf: null,
      write: { type: "day" },
    });
  });

  it("carries interval data for a custom journal", () => {
    expect(toJournalInfo("sprint", customJournal("sprint", "week", 3, "2026-01-05"), "Work")).toEqual({
      name: "sprint",
      shelf: "Work",
      write: { type: "custom", every: "week", duration: 3 },
    });
  });
});
