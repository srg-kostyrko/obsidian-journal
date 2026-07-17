import { describe, expect, it } from "vitest";

import { m } from "@/i18n";

import { calendarEmptyMessage } from "./calendar-empty-message";

describe("calendarEmptyMessage", () => {
  it("reports that no journals exist when the calendar is not scoped to a shelf", () => {
    expect(calendarEmptyMessage(null)).toBe(m.common_no_journals_yet());
  });

  it("reports an empty shelf when the calendar is scoped to one", () => {
    expect(calendarEmptyMessage("my-shelf")).toBe(m.view_block_calendar_no_journals());
  });
});
