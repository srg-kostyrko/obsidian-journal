import { describe, expect, it } from "vitest";

import { CalendarDate } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import type { VaultPath } from "@/infrastructure/host";
import { testContainer } from "@/testing";

import { JournalsIndex } from "../journals-index";
import { journalsCoreModule } from "../module";
import { fixedJournal } from "../testing";

import { JournalDateResolver } from "./journal-date-resolver";

const WEDNESDAY = "2026-08-19" as AnchorString;

describe("JournalDateResolver.applicable", () => {
  it("resolves each journal to the anchor of its own period", async () => {
    installTestCalendar({ dow: 0, doy: 6 });
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal("daily", { type: "day" }),
          weekly: fixedJournal("weekly", { type: "week" }),
        },
      },
    });

    const applicable = harness
      .resolve(JournalDateResolver)
      .applicable(CalendarDate.fromAnchor(WEDNESDAY), undefined, false);

    expect(applicable).toHaveLength(2);
    expect(applicable.find((entry) => entry.name === "daily")?.anchor).toBe("2026-08-19");
    expect(applicable.find((entry) => entry.name === "weekly")?.anchor).toBe("2026-08-16");
  });

  it("omits journals whose timeline does not contain the anchor", async () => {
    installTestCalendar({ dow: 0, doy: 6 });
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          past: fixedJournal(
            "past",
            { type: "day" },
            {
              timeline: {
                start: "2020-01-01" as AnchorString,
                end: { kind: "date", date: "2020-12-31" as AnchorString },
              },
            },
          ),
          current: fixedJournal("current", { type: "day" }),
        },
      },
    });

    const applicable = harness
      .resolve(JournalDateResolver)
      .applicable(CalendarDate.fromAnchor(WEDNESDAY), undefined, false);

    expect(applicable.map((entry) => entry.name)).toEqual(["current"]);
  });

  it("restricts to the named journals when given a list", async () => {
    installTestCalendar({ dow: 0, doy: 6 });
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          a: fixedJournal("a", { type: "day" }),
          b: fixedJournal("b", { type: "day" }),
        },
      },
    });

    const applicable = harness
      .resolve(JournalDateResolver)
      .applicable(CalendarDate.fromAnchor(WEDNESDAY), ["b"], false);

    expect(applicable.map((entry) => entry.name)).toEqual(["b"]);
  });

  it("keeps only journals with an existing entry when existingOnly is set", async () => {
    installTestCalendar({ dow: 0, doy: 6 });
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
    harness.resolve(JournalsIndex).register({
      journalName: "daily",
      anchor: WEDNESDAY,
      path: "Journal/2026-08-19.md" as VaultPath,
    });
    const resolver = harness.resolve(JournalDateResolver);

    expect(resolver.applicable(CalendarDate.fromAnchor(WEDNESDAY), undefined, true).map((entry) => entry.name)).toEqual(
      ["daily"],
    );
    expect(resolver.applicable(CalendarDate.fromAnchor("2026-08-20" as AnchorString), undefined, true)).toHaveLength(0);
  });
});
