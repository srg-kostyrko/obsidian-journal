import { describe, expect, it } from "vitest";

import { CalendarDate } from "@/calendar";

import { fixedWindow, needsNotes, MATCH_HORIZON } from "./match-window";
import { buildCondition, buildDecoration } from "./testing";

function date(s: string): CalendarDate {
  const r = CalendarDate.parse(s);
  if (r.kind === "err") throw new Error(`bad date: ${s}`);
  return r.value;
}

describe("fixedWindow", () => {
  it("returns the horizon's worth of periods for its kind", () => {
    expect(fixedWindow("day", date("2026-05-25"), "past")).toHaveLength(MATCH_HORIZON.day);
  });

  it("ends a past window at today's period", () => {
    const window = fixedWindow("day", date("2026-05-25"), "past");
    expect(window.at(-1)?.anchor.toAnchor()).toBe("2026-05-25");
  });

  it("starts a past window a horizon back from today", () => {
    const window = fixedWindow("day", date("2026-05-25"), "past");
    expect(window.at(0)?.anchor.toAnchor()).toBe("2026-02-25");
  });

  it("starts a future window at today's period", () => {
    const window = fixedWindow("day", date("2026-05-25"), "future");
    expect(window.at(0)?.anchor.toAnchor()).toBe("2026-05-25");
  });

  it("returns periods in chronological order", () => {
    const window = fixedWindow("week", date("2026-05-25"), "past");
    const anchors = window.map((p) => p.anchor.toAnchor());
    expect([...anchors].toSorted()).toEqual(anchors);
  });

  it("uses the kind's own horizon rather than the day horizon", () => {
    expect(fixedWindow("month", date("2026-05-25"), "past")).toHaveLength(MATCH_HORIZON.month);
  });
});

describe("needsNotes", () => {
  it("treats an and-decoration with one note-based condition as needing notes", () => {
    const decoration = buildDecoration({
      mode: "and",
      conditions: [buildCondition("weekday", { weekdays: [1] }), buildCondition("has-note")],
    });
    expect(needsNotes(decoration)).toBe(true);
  });

  it("treats an and-decoration with no note-based condition as not needing notes", () => {
    const decoration = buildDecoration({
      mode: "and",
      conditions: [buildCondition("weekday", { weekdays: [1] }), buildCondition("date")],
    });
    expect(needsNotes(decoration)).toBe(false);
  });

  it("treats an or-decoration with one date condition as not needing notes", () => {
    const decoration = buildDecoration({
      mode: "or",
      conditions: [buildCondition("has-note"), buildCondition("date")],
    });
    expect(needsNotes(decoration)).toBe(false);
  });

  it("treats an or-decoration whose conditions are all note-based as needing notes", () => {
    const decoration = buildDecoration({
      mode: "or",
      conditions: [buildCondition("has-note"), buildCondition("tag")],
    });
    expect(needsNotes(decoration)).toBe(true);
  });

  it("treats a note-size condition as needing notes", () => {
    const decoration = buildDecoration({ mode: "and", conditions: [buildCondition("note-size")] });
    expect(needsNotes(decoration)).toBe(true);
  });

  it("treats an offset condition as not needing notes", () => {
    const decoration = buildDecoration({ mode: "and", conditions: [buildCondition("offset")] });
    expect(needsNotes(decoration)).toBe(false);
  });

  it("treats a decoration with no conditions as not needing notes", () => {
    expect(needsNotes(buildDecoration({ mode: "and", conditions: [] }))).toBe(false);
  });

  it("does not require period notes for a has-notelet decoration", () => {
    expect(needsNotes({ mode: "and", conditions: [{ type: "has-notelet", typeIds: [] }], styles: [] })).toBe(false);
  });

  it("does not require period notes when has-notelet is or-ed with a note-based condition", () => {
    expect(
      needsNotes({
        mode: "or",
        conditions: [{ type: "has-notelet", typeIds: [] }, { type: "has-note" }],
        styles: [],
      }),
    ).toBe(false);
  });
});
