import { assert, beforeAll, describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import { initLocale } from "@/i18n";
import { Container } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { LoggerFactory, LoggerFactoryToken } from "@/infrastructure/logger";
import { Option } from "@/infrastructure/result";
import {
  CycleService,
  JournalsIndex,
  JournalsRepository,
  NumberingService,
  journalDefaultsFor,
  type JournalConfig,
  type JournalEntry,
} from "@/journals";
import { fakeRepo } from "@/journals/testing";

import { buildNavRowContext } from "./nav-row-context";

installTestCalendar();

function makeServices(journals: Record<string, JournalConfig>): { cycle: CycleService; numbering: NumberingService } {
  const c = new Container();
  c.register(LoggerFactoryToken).useClass(LoggerFactory);
  c.register(JournalsRepository).useValue(fakeRepo(journals));
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  return { cycle: c.resolve(CycleService), numbering: c.resolve(NumberingService) };
}

const today = "2026-05-27" as AnchorString;
const refDate = "2026-05-26" as AnchorString;

describe("buildNavRowContext", () => {
  beforeAll(() => initLocale("en"));

  const dailyConfig = journalDefaultsFor({ type: "day" }, "daily");
  const { cycle, numbering } = makeServices({ daily: dailyConfig });

  it("exposes refDate as the `date` variable using the journal's dateFormat", () => {
    const context = buildNavRowContext({
      journal: dailyConfig,
      refDate,
      entry: Option.none(),
      cycle,
      numbering,
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
      cycle,
      numbering,
      today,
    });
    expect(context.get("journal_name")).toEqual({ kind: "string", value: "daily" });
  });

  it("renders relative_date for a fixed journal", () => {
    const context = buildNavRowContext({
      journal: dailyConfig,
      refDate,
      entry: Option.none(),
      cycle,
      numbering,
      today,
    });
    expect(context.get("relative_date")).toEqual({ kind: "string", value: "Yesterday" });
  });

  describe("relative_date for a custom journal", () => {
    const customConfig = journalDefaultsFor(
      { type: "custom", every: "week", duration: 2, anchorDate: "2024-01-01" as AnchorString },
      "sprint",
    );
    const custom = makeServices({ sprint: customConfig });
    // today lands in the interval anchored at 2024-01-15; adjacent interval anchors are
    // 2024-01-01 / 2024-01-29 (±1) and 2023-12-18 / 2024-02-12 (±2).
    const customToday = "2024-01-20" as AnchorString;

    function relativeFor(customRefDate: AnchorString): unknown {
      return buildNavRowContext({
        journal: customConfig,
        refDate: customRefDate,
        entry: Option.none(),
        cycle: custom.cycle,
        numbering: custom.numbering,
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

  it("populates index from the entry numbers when present", () => {
    const entry: JournalEntry = {
      journalName: "daily",
      anchor: refDate,
      path: "Daily/2026-05-26.md" as VaultPath,
      numbers: { index: 42 },
    };
    const context = buildNavRowContext({
      journal: dailyConfig,
      refDate,
      entry: Option.some(entry),
      cycle,
      numbering,
      today,
    });
    expect(context.get("index")).toEqual({ kind: "number", value: 42 });
  });

  it("omits index when entry has no numbers for a fixed journal", () => {
    const context = buildNavRowContext({
      journal: dailyConfig,
      refDate,
      entry: Option.none(),
      cycle,
      numbering,
      today,
    });
    expect(context.get("index")).toBeUndefined();
  });

  it("computes index for a custom journal even when no note entry exists", () => {
    const customConfig = journalDefaultsFor(
      { type: "custom", every: "week", duration: 2, anchorDate: "2024-01-01" as AnchorString },
      "biweekly",
    );
    const custom = makeServices({ biweekly: customConfig });
    const context = buildNavRowContext({
      journal: customConfig,
      refDate: "2024-01-15" as AnchorString,
      entry: Option.none(),
      cycle: custom.cycle,
      numbering: custom.numbering,
      today,
    });
    expect(context.get("index")).toEqual({ kind: "number", value: 2 });
  });
});
