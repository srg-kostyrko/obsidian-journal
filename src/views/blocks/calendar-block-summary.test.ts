import { moment } from "obsidian";
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";

import { calendarBlockSummary } from "./calendar-block-summary";

describe("calendarBlockSummary", () => {
  it("reports before/after padding when non-zero", () => {
    const summary = calendarBlockSummary({ before: 1, after: 2, hiddenWeekdays: [] });
    expect(summary).toBe(m.view_block_summary_padding({ before: 1, after: 2 }));
  });

  it("names hidden weekdays from the locale", () => {
    const names = moment.localeData().weekdaysShort();
    const summary = calendarBlockSummary({ before: 0, after: 0, hiddenWeekdays: [0, 6] });
    expect(summary).toBe(m.view_block_summary_hidden_days({ days: `${names[0]}, ${names[6]}` }));
  });

  it("returns undefined when nothing notable is configured", () => {
    expect(calendarBlockSummary({ before: 0, after: 0, hiddenWeekdays: [] })).toBeUndefined();
  });
});
