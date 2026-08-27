import { describe, expect, it } from "vitest";

import {
  allocateName,
  prepareCalendarJournalSettings,
  prepareIntervalJournalSettings,
  type ConfiguredNames,
} from "./journal-conversion";

import type { CalendarConfig, IntervalConfig } from "./old-shapes";

function calendarFixture(): CalendarConfig {
  const section = {
    enabled: true,
    openMode: "active" as const,
    nameTemplate: "",
    dateFormat: "",
    folder: "",
    template: "",
    ribbon: { show: false, icon: "", tooltip: "" },
    createOnStartup: false,
  };
  return {
    type: "calendar",
    id: "test-id",
    name: "Test name",
    rootFolder: "",
    openOnStartup: false,
    startupSection: "day",
    day: { ...section },
    week: { ...section },
    month: { ...section },
    quarter: { ...section },
    year: { ...section },
  };
}

function intervalFixture(): IntervalConfig {
  return {
    id: "test-id",
    type: "interval",
    name: "Test Interval",
    duration: 2,
    granularity: "week",
    start_date: "2022-02-01",
    start_index: 1,
    numeration_type: "increment",
    end_type: "never",
    end_date: "",
    repeats: 1,
    limitCreation: false,
    openOnStartup: false,
    openMode: "active",
    nameTemplate: "",
    navNameTemplate: "",
    navDatesTemplate: "",
    dateFormat: "",
    folder: "test-folder",
    template: "",
    ribbon: { show: false, icon: "", tooltip: "" },
    createOnStartup: true,
    calendar_view: { order: "chrono" },
  };
}

const names: ConfiguredNames = {
  shelf: "Test shelf",
  day: "Daily notes",
  week: "Weekly notes",
  month: "Monthly notes",
  quarter: "Quarterly notes",
  year: "Yearly notes",
};

describe("prepareCalendarJournalSettings", () => {
  it("converts a daily section to a day journal", () => {
    const s = prepareCalendarJournalSettings(calendarFixture(), "day", names, false, false);
    expect(s.write).toEqual({ type: "day" });
    expect(s.name).toBe(names.day);
    expect(s.dateFormat).toBe("YYYY-MM-DD");
  });

  it("adds to the shelf when requested", () => {
    const s = prepareCalendarJournalSettings(calendarFixture(), "day", names, true, false);
    expect(s.shelves).toEqual([names.shelf]);
  });

  it("prefixes the root folder when configured", () => {
    const old = calendarFixture();
    old.rootFolder = "root-folder";
    old.day.folder = "test-folder";
    const s = prepareCalendarJournalSettings(old, "day", names, false, false);
    expect(s.folder).toBe("root-folder/test-folder");
  });

  it("enables start/end date frontmatter only when requested", () => {
    const s = prepareCalendarJournalSettings(calendarFixture(), "day", names, false, true);
    expect(s.frontmatter.addStartDate).toBe(true);
    expect(s.frontmatter.addEndDate).toBe(true);
  });

  it("converts a v1 calendar section ribbon into a today command with the configured icon and tooltip", () => {
    const config = calendarFixture();
    config.month.ribbon = { show: true, icon: "rocket", tooltip: "Open the sprint" };

    const settings = prepareCalendarJournalSettings(config, "month", names, false, false);

    expect(settings.commands.at(0)).toMatchObject({ icon: "rocket", name: "Open the sprint", showInRibbon: true });
  });

  it("falls back to the calendar icon and default tooltip when the section ribbon has none configured", () => {
    const config = calendarFixture();
    config.month.ribbon = { show: true, icon: "", tooltip: "" };

    const settings = prepareCalendarJournalSettings(config, "month", names, false, false);

    expect(settings.commands.at(0)).toMatchObject({
      icon: "calendar-days",
      name: "Open this month's note",
      showInRibbon: true,
    });
  });
});

describe("prepareIntervalJournalSettings", () => {
  it("converts to a custom write interval", () => {
    const s = prepareIntervalJournalSettings(intervalFixture(), false);
    expect(s.write).toEqual({ type: "custom", anchorDate: "2022-02-01", every: "week", duration: 2 });
  });

  it("computes the year-reset divisor for weeks", () => {
    const old = intervalFixture();
    old.numeration_type = "year";
    old.granularity = "week";
    old.duration = 5;
    const s = prepareIntervalJournalSettings(old, false);
    expect(s.index).toMatchObject({ type: "reset_after", resetAfter: 10 });
  });

  it("computes the year-reset divisor for months", () => {
    const old = intervalFixture();
    old.numeration_type = "year";
    old.granularity = "month";
    old.duration = 5;
    const s = prepareIntervalJournalSettings(old, false);
    expect(s.index).toMatchObject({ type: "reset_after", resetAfter: 2 });
  });

  it("computes the year-reset divisor for days", () => {
    const old = intervalFixture();
    old.numeration_type = "year";
    old.granularity = "day";
    old.duration = 10;
    const s = prepareIntervalJournalSettings(old, false);
    expect(s.index).toMatchObject({ type: "reset_after", resetAfter: 36 });
  });

  it("converts a date timeline end", () => {
    const settings = prepareIntervalJournalSettings(
      { ...intervalFixture(), end_type: "date", end_date: "2023-06-30" },
      false,
    );

    expect(settings.end).toEqual({ type: "date", date: "2023-06-30" });
  });

  it("converts a repeat-count timeline end", () => {
    const settings = prepareIntervalJournalSettings({ ...intervalFixture(), end_type: "repeats", repeats: 12 }, false);

    expect(settings.end).toEqual({ type: "repeats", repeats: 12 });
  });

  it("carries the configured template across", () => {
    const settings = prepareIntervalJournalSettings(
      { ...intervalFixture(), template: "99 - Meta/Templates/Sprint.md" },
      false,
    );

    expect(settings.templates).toEqual(["99 - Meta/Templates/Sprint.md"]);
  });

  // The guard never runs for this input, and its own empty-input fallback was authored to
  // reproduce this default byte-for-byte, so forcing the guard to always execute leaves this
  // green. Only mutating defaultNavBlocks.custom reddens it: this pins that default, not the guard.
  it("keeps the custom journal's built-in nav-block default when neither nav template is set", () => {
    const settings = prepareIntervalJournalSettings(intervalFixture(), false);

    expect(settings.navBlock.rows.map((row) => row.template)).toEqual([
      "{{journal_name}} {{index}}",
      "{{start_date}}",
      "to",
      "{{end_date}}",
    ]);
  });

  it("splits the dates template into one row per segment", () => {
    const settings = prepareIntervalJournalSettings(
      { ...intervalFixture(), navNameTemplate: "Sprint {{index}}", navDatesTemplate: "{{start_date}}|–|{{end_date}}" },
      false,
    );

    expect(settings.navBlock.rows.map((row) => row.template)).toEqual([
      "Sprint {{index}}",
      "{{start_date}}",
      "–",
      "{{end_date}}",
    ]);
    expect(settings.navBlock.rows.at(0)).toMatchObject({ link: "self", fontSize: 3, bold: true, addDecorations: true });
  });

  it("falls back to a three-row date range when only the name template is set", () => {
    const settings = prepareIntervalJournalSettings(
      { ...intervalFixture(), navNameTemplate: "Sprint {{index}}" },
      false,
    );

    expect(settings.navBlock.rows.map((row) => row.template)).toEqual([
      "Sprint {{index}}",
      "{{start_date}}",
      "to",
      "{{end_date}}",
    ]);
  });

  it("titles the nav block from the journal name when only the dates template is set", () => {
    const settings = prepareIntervalJournalSettings(
      { ...intervalFixture(), navDatesTemplate: "{{start_date}}" },
      false,
    );

    expect(settings.navBlock.rows.at(0)?.template).toBe("{{journal_name}} {{index}}");
  });

  it("enables start and end date frontmatter on an interval when requested", () => {
    const settings = prepareIntervalJournalSettings(intervalFixture(), true);

    expect(settings.frontmatter).toMatchObject({ addStartDate: true, addEndDate: true });
  });

  it("converts a v1 interval ribbon into a today command with the configured icon and tooltip", () => {
    const settings = prepareIntervalJournalSettings(
      { ...intervalFixture(), ribbon: { show: true, icon: "rocket", tooltip: "Open the sprint" } },
      false,
    );

    expect(settings.commands).toEqual([
      {
        icon: "rocket",
        name: "Open the sprint",
        type: "same",
        context: "today",
        showInRibbon: true,
        openMode: "active",
      },
    ]);
  });

  it("names an interval ribbon command after the journal when no tooltip was set", () => {
    const settings = prepareIntervalJournalSettings(
      { ...intervalFixture(), ribbon: { show: true, icon: "", tooltip: "" } },
      false,
    );

    expect(settings.commands.at(0)).toMatchObject({
      icon: "calendar-range",
      name: "Open current Test Interval note",
    });
  });
});

describe("allocateName", () => {
  it("returns the proposed name when free", () => {
    const used = new Set<string>();
    expect(allocateName("My Journal Day", used)).toBe("My Journal Day");
  });

  it("suffixes a counter on collision and reserves it", () => {
    const used = new Set<string>(["Daily"]);
    expect(allocateName("Daily", used)).toBe("Daily 2");
    expect(allocateName("Daily", used)).toBe("Daily 3");
  });
});
