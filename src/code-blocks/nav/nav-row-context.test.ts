import { assert, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import { initLocale } from "@/i18n";
import type { VaultPath } from "@/infrastructure/host";
import { Option } from "@/infrastructure/result";
import { CycleService, NotePathService, NumberingService, type JournalConfig, type JournalEntry } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { customJournal, fixedJournal } from "@/journals/testing";
import { testContainer } from "@/testing";

import { buildNavRowContext } from "./nav-row-context";

installTestCalendar();

interface NavServices {
  cycle: CycleService;
  numbering: NumberingService;
  notePath: NotePathService;
}

async function makeServices(journals: Record<string, JournalConfig>): Promise<NavServices> {
  const harness = await testContainer({ modules: [journalsCoreModule], data: { journals } });
  return {
    cycle: harness.resolve(CycleService),
    numbering: harness.resolve(NumberingService),
    notePath: harness.resolve(NotePathService),
  };
}

const today = "2026-05-27" as AnchorString;
const refDate = "2026-05-26" as AnchorString;

describe("buildNavRowContext", () => {
  beforeAll(() => initLocale("en"));

  const dailyConfig = fixedJournal("daily", { type: "day" });
  let daily: NavServices;

  beforeEach(async () => {
    daily = await makeServices({ daily: dailyConfig });
  });

  it("exposes refDate as the `date` variable using the journal's dateFormat", () => {
    const context = buildNavRowContext({
      journal: dailyConfig,
      refDate,
      entry: Option.none(),
      cycle: daily.cycle,
      numbering: daily.numbering,
      notePath: daily.notePath,
      today,
    });
    const spec = context.get("date");
    assert(spec?.kind === "date");
    expect(spec.value.toAnchor()).toBe("2026-05-26");
    expect(spec.defaultFormat).toBe(dailyConfig.dateFormat);
  });

  it("renders journal_name as the journal's name", () => {
    const context = buildNavRowContext({
      journal: dailyConfig,
      refDate,
      entry: Option.none(),
      cycle: daily.cycle,
      numbering: daily.numbering,
      notePath: daily.notePath,
      today,
    });
    expect(context.get("journal_name")).toEqual({ kind: "string", value: "daily" });
  });

  it("renders relative_date for a fixed journal", () => {
    const context = buildNavRowContext({
      journal: dailyConfig,
      refDate,
      entry: Option.none(),
      cycle: daily.cycle,
      numbering: daily.numbering,
      notePath: daily.notePath,
      today,
    });
    expect(context.get("relative_date")).toEqual({ kind: "string", value: "Yesterday" });
  });

  describe("relative_date for a custom journal", () => {
    const customConfig = customJournal("sprint", "week", 2, "2024-01-01");
    // today lands in the interval anchored at 2024-01-15; adjacent interval anchors are
    // 2024-01-01 / 2024-01-29 (±1) and 2023-12-18 / 2024-02-12 (±2).
    const customToday = "2024-01-20" as AnchorString;
    let custom: NavServices;

    beforeEach(async () => {
      custom = await makeServices({ sprint: customConfig });
    });

    function relativeFor(customRefDate: AnchorString): unknown {
      return buildNavRowContext({
        journal: customConfig,
        refDate: customRefDate,
        entry: Option.none(),
        cycle: custom.cycle,
        numbering: custom.numbering,
        notePath: custom.notePath,
        today: customToday,
      }).get("relative_date");
    }

    it("names the current interval with the journal name", () => {
      expect(relativeFor("2024-01-15" as AnchorString)).toEqual({ kind: "string", value: "This sprint" });
    });

    it("names the immediately previous interval", () => {
      expect(relativeFor("2024-01-01" as AnchorString)).toEqual({ kind: "string", value: "Last sprint" });
    });

    it("names the immediately next interval", () => {
      expect(relativeFor("2024-01-29" as AnchorString)).toEqual({ kind: "string", value: "Next sprint" });
    });

    it("counts intervals in the past", () => {
      expect(relativeFor("2023-12-18" as AnchorString)).toEqual({ kind: "string", value: "2 sprint ago" });
    });

    it("counts intervals in the future", () => {
      expect(relativeFor("2024-02-12" as AnchorString)).toEqual({ kind: "string", value: "2 sprint from now" });
    });
  });

  describe("weekly journal", () => {
    const weeklyConfig = fixedJournal("weekly", { type: "week" });
    // ISO test calendar: the week anchored Mon 2025-12-29 is week 1 of 2026, running to
    // Sun 2026-01-04; its representative day is Thu 2026-01-01, the day whose calendar
    // year equals the week-year.
    const weekAnchor = "2025-12-29" as AnchorString;
    let weekly: NavServices;

    beforeEach(async () => {
      weekly = await makeServices({ weekly: weeklyConfig });
    });

    function weeklyContext(): ReturnType<typeof buildNavRowContext> {
      return buildNavRowContext({
        journal: weeklyConfig,
        refDate: weekAnchor,
        entry: Option.none(),
        cycle: weekly.cycle,
        numbering: weekly.numbering,
        notePath: weekly.notePath,
        today,
      });
    }

    function dateValueOf(variable: string): string {
      const spec = weeklyContext().get(variable);
      assert(spec?.kind === "date");
      return spec.value.toAnchor();
    }

    it("renders the `date` variable as the week's representative day", () => {
      expect(dateValueOf("date")).toBe("2026-01-01");
    });

    it("renders the `start_date` variable as the week's first day", () => {
      expect(dateValueOf("start_date")).toBe("2025-12-29");
    });

    it("renders the `end_date` variable as the week's last day", () => {
      expect(dateValueOf("end_date")).toBe("2026-01-04");
    });
  });

  describe("note_name and title", () => {
    const sprintConfig = customJournal("sprint", "week", 2, "2024-01-01", {
      nameTemplate: "Sprint {{index}} ({{date:YYYY-MM-DD}})",
    });
    const sprintAnchor = "2024-01-15" as AnchorString;
    let sprintServices: NavServices;

    beforeEach(async () => {
      sprintServices = await makeServices({ sprint: sprintConfig });
    });

    function sprintContext(entry: Option<JournalEntry>): ReturnType<typeof buildNavRowContext> {
      return buildNavRowContext({
        journal: sprintConfig,
        refDate: sprintAnchor,
        entry,
        cycle: sprintServices.cycle,
        numbering: sprintServices.numbering,
        notePath: sprintServices.notePath,
        today,
      });
    }

    it("renders the journal's note name when the note does not exist yet", () => {
      const expected = { kind: "string", value: "Sprint 2 (2024-01-15)" };
      const context = sprintContext(Option.none());
      expect(context.get("note_name")).toEqual(expected);
      expect(context.get("title")).toEqual(expected);
    });

    it("reads the existing note's own name so a renamed note is named as it is", () => {
      const entry: JournalEntry = {
        journalName: "sprint",
        anchor: sprintAnchor,
        path: "Sprints/Redesign kickoff.md" as VaultPath,
      };
      const expected = { kind: "string", value: "Redesign kickoff" };
      const context = sprintContext(Option.some(entry));
      expect(context.get("note_name")).toEqual(expected);
      expect(context.get("title")).toEqual(expected);
    });
  });

  it("exposes the render-time date and clock variables the variable reference lists", () => {
    const context = buildNavRowContext({
      journal: dailyConfig,
      refDate,
      entry: Option.none(),
      cycle: daily.cycle,
      numbering: daily.numbering,
      notePath: daily.notePath,
      today,
    });
    expect(context.get("current_date")?.kind).toBe("date");
    expect(context.get("time")?.kind).toBe("clock");
    expect(context.get("current_time")?.kind).toBe("clock");
  });

  it("prefers the entry's stored numbers over the computed ones", async () => {
    const customConfig = customJournal("biweekly", "week", 2, "2024-01-01");
    const custom = await makeServices({ biweekly: customConfig });
    const anchor = "2024-01-15" as AnchorString;
    const entry: JournalEntry = {
      journalName: "biweekly",
      anchor,
      path: "Biweekly/2024-01-15.md" as VaultPath,
      numbers: { index: 42 },
    };
    const context = buildNavRowContext({
      journal: customConfig,
      refDate: anchor,
      entry: Option.some(entry),
      cycle: custom.cycle,
      numbering: custom.numbering,
      notePath: custom.notePath,
      today,
    });
    expect(context.get("index")).toEqual({ kind: "number", value: 42 });
  });

  it("omits index when entry has no numbers for a fixed journal", () => {
    const context = buildNavRowContext({
      journal: dailyConfig,
      refDate,
      entry: Option.none(),
      cycle: daily.cycle,
      numbering: daily.numbering,
      notePath: daily.notePath,
      today,
    });
    expect(context.get("index")).toBeUndefined();
  });

  it("computes index for a custom journal even when no note entry exists", async () => {
    const customConfig = customJournal("biweekly", "week", 2, "2024-01-01");
    const custom = await makeServices({ biweekly: customConfig });
    const context = buildNavRowContext({
      journal: customConfig,
      refDate: "2024-01-15" as AnchorString,
      entry: Option.none(),
      cycle: custom.cycle,
      numbering: custom.numbering,
      notePath: custom.notePath,
      today,
    });
    expect(context.get("index")).toEqual({ kind: "number", value: 2 });
  });
});
