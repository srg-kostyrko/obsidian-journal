import { describe, expect, it } from "vitest";

import { CalendarDate } from "@/calendar";

import { parseJournalUriRequest } from "./parse-request";

function ok(parameters: Record<string, string | undefined>) {
  const result = parseJournalUriRequest(parameters);
  if (result.isErr()) throw new Error(`expected ok, got ${result.error.kind}`);
  return result.value;
}

function errKind(parameters: Record<string, string | undefined>): string {
  const result = parseJournalUriRequest(parameters);
  if (result.isOk()) throw new Error("expected err");
  return result.error.kind;
}

describe("parseJournalUriRequest target", () => {
  it("reads a journal name target", () => {
    expect(ok({ journal: "Daily" }).target).toEqual({ kind: "journal", name: "Daily" });
  });

  it("reads a write-type target", () => {
    expect(ok({ type: "week" }).target).toEqual({ kind: "type", writeType: "week" });
  });

  it("prefers the journal name when both journal and type are present", () => {
    expect(ok({ journal: "Daily", type: "week" }).target).toEqual({ kind: "journal", name: "Daily" });
  });

  it("rejects parameters with neither journal nor type", () => {
    expect(errKind({})).toBe("missing-target");
  });

  it("rejects an unknown write type", () => {
    expect(errKind({ type: "fortnight" })).toBe("unknown-write-type");
  });
});

describe("parseJournalUriRequest date", () => {
  it("defaults to today when date is absent", () => {
    expect(ok({ journal: "Daily" }).date.toAnchor()).toBe(CalendarDate.today().toAnchor());
  });

  it("defaults to today for the today keyword", () => {
    expect(ok({ journal: "Daily", date: "today" }).date.toAnchor()).toBe(CalendarDate.today().toAnchor());
  });

  it("reads an ISO date", () => {
    expect(ok({ journal: "Daily", date: "2026-06-04" }).date.toAnchor()).toBe("2026-06-04");
  });

  it("reads a positive relative day offset", () => {
    expect(ok({ journal: "Daily", date: "+1d" }).date.toAnchor()).toBe(CalendarDate.today().shift(1, "d").toAnchor());
  });

  it("reads a negative relative week offset", () => {
    expect(ok({ journal: "Daily", date: "-2w" }).date.toAnchor()).toBe(CalendarDate.today().shift(-2, "w").toAnchor());
  });

  it("rejects a date that cannot be parsed", () => {
    expect(errKind({ journal: "Daily", date: "not-a-date" })).toBe("invalid-date");
  });

  it("rejects a relative offset with an unknown unit", () => {
    expect(errKind({ journal: "Daily", date: "+1x" })).toBe("invalid-date");
  });
});

describe("parseJournalUriRequest open mode", () => {
  it("defaults to active when mode is absent", () => {
    expect(ok({ journal: "Daily" }).openMode).toBe("active");
  });

  it("reads a tab mode", () => {
    expect(ok({ journal: "Daily", mode: "tab" }).openMode).toBe("tab");
  });

  it("rejects an unknown mode", () => {
    expect(errKind({ journal: "Daily", mode: "popup" })).toBe("invalid-mode");
  });
});

describe("parseJournalUriRequest notelet", () => {
  it("carries the notelet type name alongside a journal target", () => {
    expect(ok({ journal: "Work", notelet: "Meeting" })).toMatchObject({
      target: { kind: "journal", name: "Work" },
      notelet: "Meeting",
    });
  });

  it("is absent when not supplied", () => {
    expect(ok({ journal: "Work" }).notelet).toBeUndefined();
  });

  it("trims the type name", () => {
    expect(ok({ journal: "Work", notelet: "  Meeting  " }).notelet).toBe("Meeting");
  });

  it("treats a blank notelet as absent", () => {
    expect(ok({ journal: "Work", notelet: " ".repeat(3) }).notelet).toBeUndefined();
  });

  it("refuses a notelet without a journal", () => {
    expect(errKind({ notelet: "Meeting" })).toBe("notelet-requires-journal");
  });

  it("refuses a notelet beside a write-type target", () => {
    expect(errKind({ type: "day", notelet: "Meeting" })).toBe("notelet-requires-journal");
  });
});
