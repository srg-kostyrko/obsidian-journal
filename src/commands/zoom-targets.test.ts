import { describe, expect, it } from "vitest";

import type { JournalConfig } from "@/journals";
import { customJournal, fixedJournal } from "@/journals/testing";
import { buildShelf } from "@/shelves/testing";

import { zoomTargets } from "./zoom-targets";

const daily = fixedJournal("daily", { type: "day" });
const weekly = fixedJournal("weekly", { type: "week" });
const monthly = fixedJournal("monthly", { type: "month" });

function targets(
  direction: "longer" | "shorter",
  active: JournalConfig,
  journals: readonly JournalConfig[],
  shelves = [] as ReturnType<typeof buildShelf>[],
): readonly string[] {
  return zoomTargets(direction, active, journals, shelves);
}

describe("zoomTargets", () => {
  it("answers with the next longer journal", () => {
    expect(targets("longer", daily, [daily, weekly, monthly])).toStrictEqual(["weekly"]);
  });

  it("answers with the next shorter journal", () => {
    expect(targets("shorter", monthly, [daily, weekly, monthly])).toStrictEqual(["weekly"]);
  });

  it("passes over a granularity no journal writes at", () => {
    expect(targets("longer", daily, [daily, monthly])).toStrictEqual(["monthly"]);
  });

  it("answers with every journal sharing the target granularity", () => {
    const work = fixedJournal("work-monthly", { type: "month" });

    expect(targets("longer", weekly, [weekly, monthly, work])).toStrictEqual(["monthly", "work-monthly"]);
  });

  it("answers with nothing when no journal is longer", () => {
    expect(targets("longer", monthly, [daily, weekly, monthly])).toStrictEqual([]);
    expect(targets("shorter", monthly, [daily, weekly, monthly])).toStrictEqual(["weekly"]);
  });

  it("stays on the shelf the active journal belongs to", () => {
    const other = fixedJournal("private-monthly", { type: "month" });
    const shelf = buildShelf("work", { journals: ["daily", "monthly"] });

    expect(targets("longer", daily, [daily, monthly, other], [shelf])).toStrictEqual(["monthly"]);
  });

  it("reaches every journal when the active journal is on no shelf", () => {
    const shelf = buildShelf("work", { journals: ["monthly"] });

    expect(targets("longer", daily, [daily, monthly], [shelf])).toStrictEqual(["monthly"]);
  });

  it("places a custom journal by its interval rather than by its unit", () => {
    const sprint = customJournal("sprint", "day", 10, "2026-01-01");

    expect(targets("longer", weekly, [weekly, sprint, monthly])).toStrictEqual(["sprint"]);
    expect(targets("shorter", monthly, [weekly, sprint, monthly])).toStrictEqual(["sprint"]);
  });
});
