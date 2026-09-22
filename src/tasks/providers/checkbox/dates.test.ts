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
});
