import { beforeAll, describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import { initLocale } from "@/i18n";
import { journalDefaultsFor, type JournalConfig } from "@/journals";

import { buildHomeItems, type HomeItemContext } from "./home-items";

const anchor = (s: string): AnchorString => s as AnchorString;
const today = anchor("2026-05-27");

function journal(name: string, type: "day" | "week" | "month" | "quarter" | "year"): JournalConfig {
  return journalDefaultsFor({ type }, name);
}

const context: HomeItemContext = {
  pathForCustom: () => null,
};

describe("buildHomeItems", () => {
  beforeAll(() => initLocale("en"));

  it("returns one item per fixed-period entry that has matching journals", () => {
    const items = buildHomeItems(
      { show: ["day", "week"], separator: " • ", scale: 1 },
      [journal("Daily", "day"), journal("Weekly", "week")],
      today,
      null,
      new Map(),
      context,
    );
    expect(items).toHaveLength(2);
    expect(items[0]?.entry).toBe("day");
    expect(items[0]?.label).toBe("Today");
    expect(items[0]?.journalNames).toEqual(["Daily"]);
    expect(items[1]?.entry).toBe("week");
    expect(items[1]?.label).toBe("This week");
    expect(items[1]?.journalNames).toEqual(["Weekly"]);
  });

  it("collects multiple journals of the same type into one item", () => {
    const items = buildHomeItems(
      { show: ["day"], separator: " • ", scale: 1 },
      [journal("Daily-A", "day"), journal("Daily-B", "day")],
      today,
      null,
      new Map(),
      context,
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.journalNames).toEqual(["Daily-A", "Daily-B"]);
  });

  it("omits entries that have no matching journals", () => {
    const items = buildHomeItems(
      { show: ["day", "month"], separator: " • ", scale: 1 },
      [journal("Daily", "day")],
      today,
      null,
      new Map(),
      context,
    );
    expect(items.map((i) => i.entry)).toEqual(["day"]);
  });

  it("filters by shelf when one is selected", () => {
    const items = buildHomeItems(
      { show: ["day"], separator: " • ", scale: 1 },
      [journal("Daily-A", "day"), journal("Daily-B", "day")],
      today,
      "Work",
      new Map([
        ["Daily-A", "Work"],
        ["Daily-B", "Personal"],
      ]),
      context,
    );
    expect(items[0]?.journalNames).toEqual(["Daily-A"]);
  });

  it("returns an empty list when show is empty", () => {
    const items = buildHomeItems(
      { show: [], separator: " • ", scale: 1 },
      [journal("Daily", "day")],
      today,
      null,
      new Map(),
      context,
    );
    expect(items).toEqual([]);
  });
});
