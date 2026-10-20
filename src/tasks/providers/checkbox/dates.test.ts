import { describe, expect, it } from "vitest";

import { datesIn } from "./dates";

describe("datesIn", () => {
  it("reads every Tasks-format role from one line", () => {
    const line = "- [ ] Ship ➕ 2026-09-01 🛫 2026-09-18 ⏳ 2026-09-20 📅 2026-09-25 ✅ 2026-09-24";
    expect(datesIn(line)).toEqual({
      created: "2026-09-01",
      start: "2026-09-18",
      scheduled: "2026-09-20",
      due: "2026-09-25",
      done: "2026-09-24",
    });
  });
  it("accepts the alternative due signifiers", () => {
    expect(datesIn("- [ ] A 📆 2026-09-25").due).toBe("2026-09-25");
    expect(datesIn("- [ ] A 🗓 2026-09-25").due).toBe("2026-09-25");
  });
  it("returns nothing for a line carrying no signifier", () => {
    expect(datesIn("- [ ] Plain task #work")).toEqual({});
  });
  it("rejects a malformed token with trailing digits rather than truncating it to a valid date", () => {
    expect(datesIn("- [ ] A 📅 2026-09-251").due).toBeUndefined();
  });
  it("reads Dataview inline fields in brackets and parentheses", () => {
    expect(datesIn("- [ ] a [due:: 2026-10-24] (scheduled:: 2026-10-22)")).toEqual({
      due: "2026-10-24",
      scheduled: "2026-10-22",
    });
  });
  it("maps completion to done and reads start and created", () => {
    expect(datesIn("[completion:: 2026-10-01] [start:: 2026-09-30] [created:: 2026-09-29]")).toEqual({
      done: "2026-10-01",
      start: "2026-09-30",
      created: "2026-09-29",
    });
  });
  it("an emoji signifier wins over an inline field for the same role", () => {
    expect(datesIn("📅 2026-10-24 [due:: 2026-11-01]")).toEqual({ due: "2026-10-24" });
  });
  it("rejects a malformed inline date", () => {
    expect(datesIn("[due:: 2026-10-241]")).toEqual({});
  });
  it("ignores an unknown inline key", () => {
    expect(datesIn("[deadline:: 2026-10-24]")).toEqual({});
  });
});
