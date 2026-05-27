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

function customJournal(name: string): JournalConfig {
  return journalDefaultsFor({ type: "custom", every: "day", duration: 1, anchorDate: today }, name);
}

const contextFor = (labels: Record<string, string | null>): HomeItemContext => ({
  pathForCustom: (journal) => labels[journal.name] ?? null,
});

const context: HomeItemContext = {
  pathForCustom: () => null,
};

describe("buildHomeItems", () => {
  beforeAll(() => initLocale("en"));

  it("returns one item per fixed-period entry that has matching journals", () => {
    const items = buildHomeItems(
      { show: ["day", "week"] },
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
      { show: ["day"] },
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
      { show: ["day", "month"] },
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
      { show: ["day"] },
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
    const items = buildHomeItems({ show: [] }, [journal("Daily", "day")], today, null, new Map(), context);
    expect(items).toEqual([]);
  });

  describe("custom", () => {
    it("returns one item per custom journal, labeled by pathForCustom", () => {
      const items = buildHomeItems(
        { show: ["custom"] },
        [customJournal("Trips"), customJournal("Reviews")],
        today,
        null,
        new Map(),
        contextFor({ Trips: "Trip 12", Reviews: "Review 2026-05-27" }),
      );
      expect(items).toHaveLength(2);
      expect(items[0]).toEqual({ entry: "custom", label: "Trip 12", journalNames: ["Trips"] });
      expect(items[1]).toEqual({ entry: "custom", label: "Review 2026-05-27", journalNames: ["Reviews"] });
    });

    it("omits a custom journal when pathForCustom returns null", () => {
      const items = buildHomeItems(
        { show: ["custom"] },
        [customJournal("Bad"), customJournal("Good")],
        today,
        null,
        new Map(),
        contextFor({ Bad: null, Good: "label" }),
      );
      expect(items.map((i) => i.journalNames[0])).toEqual(["Good"]);
    });

    it("filters custom journals by shelf", () => {
      const items = buildHomeItems(
        { show: ["custom"] },
        [customJournal("Work-Custom"), customJournal("Home-Custom")],
        today,
        "Work",
        new Map([
          ["Work-Custom", "Work"],
          ["Home-Custom", "Personal"],
        ]),
        contextFor({ "Work-Custom": "label-w", "Home-Custom": "label-h" }),
      );
      expect(items.map((i) => i.journalNames[0])).toEqual(["Work-Custom"]);
    });
  });
});
