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
  journalDefaultsFor,
  type JournalConfig,
  type JournalEntry,
} from "@/journals";
import { fakeRepo } from "@/journals/testing";

import { buildNavRowContext } from "./nav-row-context";

installTestCalendar();

function makeCycle(journals: Record<string, JournalConfig>): CycleService {
  const c = new Container();
  c.register(LoggerFactoryToken).useClass(LoggerFactory);
  c.register(JournalsRepository).useValue(fakeRepo(journals));
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  return c.resolve(CycleService);
}

const today = "2026-05-27" as AnchorString;
const refDate = "2026-05-26" as AnchorString;

describe("buildNavRowContext", () => {
  beforeAll(() => initLocale("en"));

  const dailyConfig = journalDefaultsFor({ type: "day" }, "daily");
  const cycle = makeCycle({ daily: dailyConfig });

  it("exposes refDate as the `date` variable using the journal's dateFormat", () => {
    const context = buildNavRowContext({ journal: dailyConfig, refDate, entry: Option.none(), cycle, today });
    const spec = context.get("date");
    assert(spec?.kind === "date");
    expect(spec.value.toAnchor()).toBe("2026-05-26");
    expect(spec.defaultFormat).toBe(dailyConfig.dateFormat);
  });

  it("renders journal_name as the journal's name", () => {
    const context = buildNavRowContext({ journal: dailyConfig, refDate, entry: Option.none(), cycle, today });
    expect(context.get("journal_name")).toEqual({ kind: "string", value: "daily" });
  });

  it("renders relative_date for a fixed journal", () => {
    const context = buildNavRowContext({ journal: dailyConfig, refDate, entry: Option.none(), cycle, today });
    expect(context.get("relative_date")).toEqual({ kind: "string", value: "Yesterday" });
  });

  it("renders relative_date as an empty string for a custom journal", () => {
    const customConfig = journalDefaultsFor(
      { type: "custom", every: "week", duration: 2, anchorDate: "2024-01-01" as AnchorString },
      "biweekly",
    );
    const cycleCustom = makeCycle({ biweekly: customConfig });
    const context = buildNavRowContext({
      journal: customConfig,
      refDate,
      entry: Option.none(),
      cycle: cycleCustom,
      today,
    });
    expect(context.get("relative_date")).toEqual({ kind: "string", value: "" });
  });

  it("populates index from the entry numbers when present", () => {
    const entry: JournalEntry = {
      journalName: "daily",
      anchor: refDate,
      path: "Daily/2026-05-26.md" as VaultPath,
      numbers: { index: 42 },
    };
    const context = buildNavRowContext({ journal: dailyConfig, refDate, entry: Option.some(entry), cycle, today });
    expect(context.get("index")).toEqual({ kind: "number", value: 42 });
  });

  it("omits index when entry has no numbers", () => {
    const context = buildNavRowContext({ journal: dailyConfig, refDate, entry: Option.none(), cycle, today });
    expect(context.get("index")).toBeUndefined();
  });
});
