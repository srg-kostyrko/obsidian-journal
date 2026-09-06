import { describe, expect, it } from "vitest";

import { CalendarDate, type AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";
import { Option } from "@/infrastructure/result";

import { customJournal, fixedJournal } from "../testing";

import { anchorsInWindow, buildNoteletListing, periodBoundsOf, type NoteletListingDependencies } from "./listing";

import type { JournalConfig } from "../config";
import type { TypeId } from "./config";
import type { NoteletEntry } from "../types";

const daily = fixedJournal("Daily", { type: "day" });
const weekly = fixedJournal("Weekly", { type: "week" });
const errands = fixedJournal("Errands", { type: "day" });
const sprints = customJournal("Sprints", "week", 2, "2026-08-10");

const DAY_ANCHORS = Array.from(
  { length: 31 },
  (_, index) => `2026-08-${String(index + 1).padStart(2, "0")}` as AnchorString,
);
const WEEK_ANCHORS = [
  "2026-07-27",
  "2026-08-03",
  "2026-08-10",
  "2026-08-17",
  "2026-08-24",
  "2026-08-31",
] as AnchorString[];

// Stands in for CycleService.intervalsInRange, whose contract is to start from the period
// containing the window start and then walk while the anchor stays inside the window.
function stubIntervalsInRange(
  anchors: readonly AnchorString[],
  start: AnchorString,
  end: AnchorString,
): readonly AnchorString[] {
  const containing = anchors.findLast((anchor) => anchor <= start);
  return anchors.filter((anchor) => anchor === containing || (anchor >= start && anchor <= end));
}

function notelet(
  overrides: Partial<NoteletEntry> & Pick<NoteletEntry, "journalName" | "anchor" | "path">,
): NoteletEntry {
  return { kind: "notelet", typeName: "Meeting", typeId: "nt_meeting" as TypeId, ...overrides };
}

function buildDependencies(
  options: {
    journals?: readonly JournalConfig[];
    notelets?: readonly NoteletEntry[];
  } = {},
): NoteletListingDependencies {
  const configs = new Map((options.journals ?? [daily, weekly]).map((c) => [c.name, c]));
  const entries = options.notelets ?? [];
  return {
    journals: { get: (name: string) => Option.fromNullable(configs.get(name)) },
    index: {
      noteletsAt: (journalName: string, anchor: AnchorString) =>
        entries.filter((entry) => entry.journalName === journalName && entry.anchor === anchor),
    },
    cycle: {
      intervalsInRange: (name, start, end) => {
        const config = configs.get(name);
        if (config === undefined) return [];
        return stubIntervalsInRange(config.write.type === "week" ? WEEK_ANCHORS : DAY_ANCHORS, start, end);
      },
      startOf: (_name, anchor) => Option.some(CalendarDate.fromAnchor(anchor)),
      endOf: (name, anchor) => {
        const config = configs.get(name);
        if (config === undefined) return Option.none();
        const span = config.write.type === "week" ? 6 : 0;
        return Option.some(CalendarDate.fromAnchor(anchor).shift(span, "d"));
      },
    },
  };
}

describe("periodBoundsOf", () => {
  it("reports a fixed journal's period kind", () => {
    expect(periodBoundsOf(buildDependencies(), "Weekly", "2026-08-10" as AnchorString)).toEqual({
      start: "2026-08-10",
      end: "2026-08-16",
      kind: "week",
    });
  });

  it("reports no kind for a custom journal", () => {
    const custom = customJournal("Sprints", "week", 2, "2026-08-10");
    expect(
      periodBoundsOf(buildDependencies({ journals: [custom] }), "Sprints", "2026-08-10" as AnchorString)?.kind,
    ).toBeNull();
  });

  it("reports nothing for an unknown journal", () => {
    expect(periodBoundsOf(buildDependencies(), "Gone", "2026-08-10" as AnchorString)).toBeUndefined();
  });
});

describe("anchorsInWindow", () => {
  it("includes the period that contains the window start", () => {
    expect(
      anchorsInWindow(buildDependencies(), "Weekly", "2026-08-12" as AnchorString, "2026-08-12" as AnchorString),
    ).toEqual(["2026-08-10"]);
  });

  it("drops a leading period that ended before the window opened", () => {
    const dependencies = buildDependencies();
    const shrunk: NoteletListingDependencies = {
      ...dependencies,
      cycle: {
        ...dependencies.cycle,
        endOf: (name, anchor) =>
          anchor === "2026-08-10"
            ? Option.some(CalendarDate.fromAnchor("2026-08-11" as AnchorString))
            : dependencies.cycle.endOf(name, anchor),
      },
    };
    expect(anchorsInWindow(shrunk, "Weekly", "2026-08-12" as AnchorString, "2026-08-12" as AnchorString)).toEqual([]);
  });
});

describe("buildNoteletListing", () => {
  it("returns an empty listing when nothing matches", () => {
    expect(
      buildNoteletListing(buildDependencies(), {
        kind: "period",
        journalName: "Daily",
        anchor: "2026-08-12" as AnchorString,
      }),
    ).toEqual({ periods: [], total: 0, qualifyByJournal: false });
  });

  it("groups one journal's notelets under one period and one type", () => {
    const dependencies = buildDependencies({
      notelets: [
        notelet({
          journalName: "Daily",
          anchor: "2026-08-12" as AnchorString,
          path: "Daily/a.md" as VaultPath,
          counter: 2,
        }),
        notelet({
          journalName: "Daily",
          anchor: "2026-08-12" as AnchorString,
          path: "Daily/b.md" as VaultPath,
          counter: 1,
        }),
      ],
    });
    const listing = buildNoteletListing(dependencies, {
      kind: "period",
      journalName: "Daily",
      anchor: "2026-08-12" as AnchorString,
    });
    expect(listing.total).toBe(2);
    expect(listing.qualifyByJournal).toBe(false);
    expect(listing.periods).toHaveLength(1);
    expect(
      listing.periods
        .at(0)
        ?.types.at(0)
        ?.notelets.map((n) => n.path),
    ).toEqual(["Daily/b.md", "Daily/a.md"]);
  });

  it("orders notelets without a counter after numbered ones, by file name", () => {
    const dependencies = buildDependencies({
      notelets: [
        notelet({ journalName: "Daily", anchor: "2026-08-12" as AnchorString, path: "Daily/zulu.md" as VaultPath }),
        notelet({ journalName: "Daily", anchor: "2026-08-12" as AnchorString, path: "Daily/alpha.md" as VaultPath }),
        notelet({
          journalName: "Daily",
          anchor: "2026-08-12" as AnchorString,
          path: "Daily/n.md" as VaultPath,
          counter: 9,
        }),
      ],
    });
    const listing = buildNoteletListing(dependencies, {
      kind: "period",
      journalName: "Daily",
      anchor: "2026-08-12" as AnchorString,
    });
    expect(
      listing.periods
        .at(0)
        ?.types.at(0)
        ?.notelets.map((n) => n.path),
    ).toEqual(["Daily/n.md", "Daily/alpha.md", "Daily/zulu.md"]);
  });

  it("shows a coarse journal's notelet in a window its anchor falls outside", () => {
    const dependencies = buildDependencies({
      notelets: [notelet({ journalName: "Weekly", anchor: "2026-08-10" as AnchorString, path: "W/x.md" as VaultPath })],
    });
    const listing = buildNoteletListing(dependencies, {
      kind: "window",
      journalNames: ["Weekly"],
      start: "2026-08-12" as AnchorString,
      end: "2026-08-12" as AnchorString,
    });
    expect(listing.total).toBe(1);
  });

  it("qualifies by journal only when the visible set spans more than one", () => {
    const dependencies = buildDependencies({
      notelets: [
        notelet({ journalName: "Daily", anchor: "2026-08-12" as AnchorString, path: "D/x.md" as VaultPath }),
        notelet({ journalName: "Weekly", anchor: "2026-08-10" as AnchorString, path: "W/y.md" as VaultPath }),
      ],
    });
    const both = buildNoteletListing(dependencies, {
      kind: "window",
      journalNames: ["Daily", "Weekly"],
      start: "2026-08-12" as AnchorString,
      end: "2026-08-12" as AnchorString,
    });
    expect(both.qualifyByJournal).toBe(true);
    const one = buildNoteletListing(dependencies, {
      kind: "window",
      journalNames: ["Daily"],
      start: "2026-08-12" as AnchorString,
      end: "2026-08-12" as AnchorString,
    });
    expect(one.qualifyByJournal).toBe(false);
  });

  it("orders period groups by start then end, finest first", () => {
    const dependencies = buildDependencies({
      notelets: [
        notelet({ journalName: "Weekly", anchor: "2026-08-10" as AnchorString, path: "W/y.md" as VaultPath }),
        notelet({ journalName: "Daily", anchor: "2026-08-10" as AnchorString, path: "D/x.md" as VaultPath }),
      ],
    });
    const listing = buildNoteletListing(dependencies, {
      kind: "window",
      journalNames: ["Daily", "Weekly"],
      start: "2026-08-10" as AnchorString,
      end: "2026-08-10" as AnchorString,
    });
    expect(listing.periods.map((p) => p.kind)).toEqual(["day", "week"]);
  });

  it("keeps only the filtered types, and treats an empty filter as no filter", () => {
    const dependencies = buildDependencies({
      notelets: [
        notelet({
          journalName: "Daily",
          anchor: "2026-08-12" as AnchorString,
          path: "D/m.md" as VaultPath,
          typeId: "nt_meeting" as TypeId,
          typeName: "Meeting",
        }),
        notelet({
          journalName: "Daily",
          anchor: "2026-08-12" as AnchorString,
          path: "D/g.md" as VaultPath,
          typeId: "nt_gym" as TypeId,
          typeName: "Gym",
        }),
      ],
    });
    const request = { kind: "period", journalName: "Daily", anchor: "2026-08-12" as AnchorString } as const;
    expect(buildNoteletListing(dependencies, { ...request, typeIds: ["nt_gym"] }).total).toBe(1);
    expect(buildNoteletListing(dependencies, { ...request, typeIds: [] }).total).toBe(2);
    expect(buildNoteletListing(dependencies, request).total).toBe(2);
  });

  it("keeps an orphaned notelet unfiltered but excludes it under a type filter", () => {
    const dependencies = buildDependencies({
      notelets: [
        notelet({
          journalName: "Daily",
          anchor: "2026-08-12" as AnchorString,
          path: "D/o.md" as VaultPath,
          typeId: null,
          typeName: "Gone",
        }),
      ],
    });
    const request = { kind: "period", journalName: "Daily", anchor: "2026-08-12" as AnchorString } as const;
    expect(buildNoteletListing(dependencies, request).periods.at(0)?.types.at(0)?.typeId).toBeNull();
    expect(buildNoteletListing(dependencies, { ...request, typeIds: ["nt_meeting"] }).total).toBe(0);
  });

  it("sorts orphaned types after resolved ones", () => {
    const dependencies = buildDependencies({
      notelets: [
        notelet({
          journalName: "Daily",
          anchor: "2026-08-12" as AnchorString,
          path: "D/o.md" as VaultPath,
          typeId: null,
          typeName: "Aardvark",
        }),
        notelet({
          journalName: "Daily",
          anchor: "2026-08-12" as AnchorString,
          path: "D/m.md" as VaultPath,
          typeName: "Zebra",
        }),
      ],
    });
    const listing = buildNoteletListing(dependencies, {
      kind: "period",
      journalName: "Daily",
      anchor: "2026-08-12" as AnchorString,
    });
    expect(listing.periods.at(0)?.types.map((t) => t.typeName)).toEqual(["Zebra", "Aardvark"]);
  });

  it("merges two same-kind fixed journals sharing a period into one group with two type entries", () => {
    const dependencies = buildDependencies({
      journals: [daily, weekly, errands],
      notelets: [
        notelet({ journalName: "Daily", anchor: "2026-08-12" as AnchorString, path: "D/x.md" as VaultPath }),
        notelet({ journalName: "Errands", anchor: "2026-08-12" as AnchorString, path: "E/y.md" as VaultPath }),
      ],
    });
    const listing = buildNoteletListing(dependencies, {
      kind: "window",
      journalNames: ["Daily", "Errands"],
      start: "2026-08-12" as AnchorString,
      end: "2026-08-12" as AnchorString,
    });
    expect(listing.periods).toHaveLength(1);
    expect(listing.periods.at(0)?.kind).toBe("day");
    expect(listing.periods.at(0)?.types).toHaveLength(2);
    expect(new Set(listing.periods.at(0)?.types.map((t) => t.journalName))).toEqual(new Set(["Daily", "Errands"]));
  });

  it("keeps kind null for a period built only from custom journals", () => {
    const dependencies = buildDependencies({
      journals: [daily, weekly, sprints],
      notelets: [
        notelet({ journalName: "Sprints", anchor: "2026-08-12" as AnchorString, path: "S/z.md" as VaultPath }),
      ],
    });
    const listing = buildNoteletListing(dependencies, {
      kind: "period",
      journalName: "Sprints",
      anchor: "2026-08-12" as AnchorString,
    });
    expect(listing.periods).toHaveLength(1);
    expect(listing.periods.at(0)?.kind).toBeNull();
  });

  it("takes a merged period's kind from its fixed contributor, not its custom one", () => {
    const dependencies = buildDependencies({
      journals: [daily, weekly, sprints],
      notelets: [
        notelet({ journalName: "Sprints", anchor: "2026-08-12" as AnchorString, path: "S/a.md" as VaultPath }),
        notelet({ journalName: "Daily", anchor: "2026-08-12" as AnchorString, path: "D/b.md" as VaultPath }),
      ],
    });
    const listing = buildNoteletListing(dependencies, {
      kind: "window",
      journalNames: ["Sprints", "Daily"],
      start: "2026-08-12" as AnchorString,
      end: "2026-08-12" as AnchorString,
    });
    expect(listing.periods).toHaveLength(1);
    expect(listing.periods.at(0)?.kind).toBe("day");
    expect(listing.periods.at(0)?.types).toHaveLength(2);
  });
});
