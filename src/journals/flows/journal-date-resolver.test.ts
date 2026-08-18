import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CalendarDate } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { SuggestService, WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";

import { CycleService } from "../cycle";
import { JournalsIndex } from "../journals-index";
import { JournalsRepository } from "../repository";
import { fakeRepo, fixedJournal } from "../testing";
import { TimelineService } from "../timeline";

import { JournalDateResolver } from "./journal-date-resolver";

function buildContainer(journals: Parameters<typeof fakeRepo>[0]): Container {
  const c = new Container();
  c.register(JournalsRepository).useValue(fakeRepo(journals));
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(TimelineService).useClass(TimelineService);
  c.register(SuggestService).useValue({} as never);
  c.register(WorkspaceService).useValue({} as never);
  c.register(JournalDateResolver).useClass(JournalDateResolver);
  return c;
}

const WEDNESDAY = "2026-08-19" as AnchorString;

describe("JournalDateResolver.applicable", () => {
  let teardown: () => void;

  beforeEach(() => {
    ({ teardown } = installTestCalendar({ dow: 0, doy: 6 }));
  });

  afterEach(() => {
    teardown();
  });

  it("resolves each journal to the anchor of its own period", () => {
    const c = buildContainer({
      daily: fixedJournal("daily", { type: "day" }),
      weekly: fixedJournal("weekly", { type: "week" }),
    });

    const applicable = c.resolve(JournalDateResolver).applicable(CalendarDate.fromAnchor(WEDNESDAY), undefined, false);

    expect(applicable).toHaveLength(2);
    expect(applicable.find((entry) => entry.name === "daily")?.anchor).toBe("2026-08-19");
    expect(applicable.find((entry) => entry.name === "weekly")?.anchor).toBe("2026-08-16");
  });

  it("omits journals whose timeline does not contain the anchor", () => {
    const c = buildContainer({
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
    });

    const applicable = c.resolve(JournalDateResolver).applicable(CalendarDate.fromAnchor(WEDNESDAY), undefined, false);

    expect(applicable.map((entry) => entry.name)).toEqual(["current"]);
  });

  it("restricts to the named journals when given a list", () => {
    const c = buildContainer({
      a: fixedJournal("a", { type: "day" }),
      b: fixedJournal("b", { type: "day" }),
    });

    const applicable = c.resolve(JournalDateResolver).applicable(CalendarDate.fromAnchor(WEDNESDAY), ["b"], false);

    expect(applicable.map((entry) => entry.name)).toEqual(["b"]);
  });

  it("keeps only journals with an existing entry when existingOnly is set", () => {
    const c = buildContainer({ daily: fixedJournal("daily", { type: "day" }) });
    c.resolve(JournalsIndex).register({
      journalName: "daily",
      anchor: WEDNESDAY,
      path: "Journal/2026-08-19.md" as VaultPath,
    });
    const resolver = c.resolve(JournalDateResolver);

    expect(resolver.applicable(CalendarDate.fromAnchor(WEDNESDAY), undefined, true).map((entry) => entry.name)).toEqual(
      ["daily"],
    );
    expect(resolver.applicable(CalendarDate.fromAnchor("2026-08-20" as AnchorString), undefined, true)).toHaveLength(0);
  });
});
