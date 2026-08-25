import { assert, beforeEach, describe, expect, it } from "vitest";

import { CalendarDate } from "@/calendar";
import { anchor } from "@/calendar/testing";
import type { VaultPath } from "@/infrastructure/host";
import {
  FunctionHandlerToken,
  TemplateContext,
  TemplateEngine,
  type FunctionHandler,
  type FunctionInput,
  type Modifier,
} from "@/templates";
import { testContainer, type TestHarness } from "@/testing";

import { JournalsIndex } from "../journals-index";
import { journalsCoreModule } from "../module";
import { customJournal, fixedJournal } from "../testing";

import type { JournalConfig } from "../config";

type ShiftUnit = Extract<Modifier, { kind: "shift" }>["unit"];

function shift(amount: number, unit: ShiftUnit): Modifier {
  return { kind: "shift", sign: amount < 0 ? -1 : 1, amount: Math.abs(amount), unit };
}

const ALL_JOURNALS: Record<string, JournalConfig> = {
  weekly: fixedJournal("weekly", { type: "week" }),
  yearly: fixedJournal("yearly", { type: "year" }),
  monthly: fixedJournal("monthly", { type: "month" }),
  daily: fixedJournal("daily", { type: "day" }),
  custom_daily: customJournal("custom_daily", "day", 1, "2020-01-01", { nameTemplate: "{{date}}" }),
};

// Mirrors notes/module.ts: the engine resolves handlers from FunctionHandlerToken, so reaching the
// handler through that token is also what proves a {{journal_link}} token can dispatch at all.
function journalLinkHandler(harness: TestHarness): FunctionHandler {
  const handler = harness.resolve(FunctionHandlerToken).find((candidate) => candidate.name === "journal_link");
  assert(handler, "journal_link is not registered under FunctionHandlerToken");
  return handler;
}

function hostContext(name: string, renderDate: string, startDate: string): TemplateContext {
  return TemplateContext.empty()
    .date("date", CalendarDate.fromAnchor(anchor(renderDate)), "YYYY-MM-DD")
    .date("start_date", CalendarDate.fromAnchor(anchor(startDate)), "YYYY-MM-DD")
    .string("journal_name", name);
}

function dateOf(context: TemplateContext): CalendarDate {
  const spec = context.get("date");
  if (spec?.kind !== "date") throw new Error("context has no date");
  return spec.value;
}

// The week of 2026-01-01 (Thursday) is ISO week 1 of 2026: start = Mon 2025-12-29,
// end = Sun 2026-01-04. This is a rendered context, so its `date` is the week's
// representative day (Thu 2026-01-01), not the stored anchor.
const crossYearWeek = (): TemplateContext => hostContext("weekly", "2026-01-01", "2025-12-29");

describe("JournalLinkHandler", () => {
  let harness: TestHarness;
  let handler: FunctionHandler;
  let engine: TemplateEngine;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: ALL_JOURNALS },
    });
    handler = journalLinkHandler(harness);
    engine = harness.resolve(TemplateEngine);
  });

  function render(argument: string, context: TemplateContext, modifiers: Modifier[] = [], format?: string): string {
    const input: FunctionInput = {
      arg: argument,
      sourceDate: dateOf(context),
      modifiers,
      context,
      engine,
      ...(format !== undefined && { format }),
    };
    const result = handler.render(input);
    if (result.isErr()) throw new Error(`expected ok, got ${result.error.message}`);
    return result.value;
  }

  it("resolves a coarser target from the host anchor so the owning year wins", () => {
    expect(render("yearly", crossYearWeek())).toBe("2026");
  });

  it("resolves a coarser target from the host anchor so the owning month wins", () => {
    expect(render("monthly", crossYearWeek())).toBe("2026-01");
  });

  it("bases a finer target off the host period start", () => {
    expect(render("daily", crossYearWeek())).toBe("2025-12-29");
  });

  it("shifts a finer target by day modifiers from the period start", () => {
    expect(render("daily", crossYearWeek(), [shift(6, "d")])).toBe("2026-01-04");
  });

  it("applies week modifiers to the anchor before resolving a coarser target", () => {
    expect(render("monthly", hostContext("daily", "2026-01-15", "2026-01-15"), [shift(1, "m")])).toBe("2026-02");
  });

  it("falls back to the anchor for a custom target it cannot rank", () => {
    expect(render("custom_daily", crossYearWeek())).toBe("2026-01-01");
  });

  it("returns the full vault path without the .md extension", async () => {
    const diaryHarness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          ...ALL_JOURNALS,
          diary: fixedJournal("diary", { type: "day" }, { folder: "Diary/{{date:YYYY}}" }),
        },
      },
    });

    const result = journalLinkHandler(diaryHarness).render({
      arg: "diary",
      sourceDate: CalendarDate.fromAnchor(anchor("2026-05-19")),
      modifiers: [],
      context: hostContext("daily", "2026-05-19", "2026-05-19"),
      engine,
    });

    expect(result.isOk() && result.value).toBe("Diary/2026/2026-05-19");
  });

  it("ignores a :format suffix", () => {
    expect(render("daily", hostContext("daily", "2026-05-19", "2026-05-19"), [], "YYYY")).toBe("2026-05-19");
  });

  it("uses the source date when the host journal is unknown", () => {
    const context = TemplateContext.empty().date("date", CalendarDate.fromAnchor(anchor("2026-05-19")), "YYYY-MM-DD");
    expect(render("daily", context)).toBe("2026-05-19");
  });

  it("returns an error for an unknown target journal", () => {
    const result = handler.render({
      arg: "ghost",
      sourceDate: CalendarDate.fromAnchor(anchor("2026-05-19")),
      modifiers: [],
      context: hostContext("daily", "2026-05-19", "2026-05-19"),
      engine,
    });
    expect(result.isErr()).toBe(true);
  });

  describe("a connected note living away from its configured path", () => {
    let connectedHarness: TestHarness;

    beforeEach(async () => {
      connectedHarness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: ALL_JOURNALS },
      });
      connectedHarness.resolve(JournalsIndex).register({
        journalName: "weekly",
        anchor: anchor("2026-08-17"),
        path: "Week 34 review.md" as VaultPath,
      });
    });

    function renderWeekly(harness: TestHarness, renderDate: string): string {
      const result = journalLinkHandler(harness).render({
        arg: "weekly",
        sourceDate: CalendarDate.fromAnchor(anchor(renderDate)),
        modifiers: [],
        context: hostContext("daily", renderDate, renderDate),
        engine: harness.resolve(TemplateEngine),
      });
      if (result.isErr()) throw new Error(`expected ok, got ${result.error.message}`);
      return result.value;
    }

    it("links to the note the index holds, not the path the template would render", () => {
      expect(renderWeekly(connectedHarness, "2026-08-20")).toBe("Week 34 review");
    });

    it("still renders the configured path for a period with no note yet, which is what linking ahead needs", async () => {
      const emptyHarness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: ALL_JOURNALS },
      });

      expect(renderWeekly(emptyHarness, "2026-08-20")).toBe("2026-W34");
    });
  });

  describe("timeline bounds", () => {
    let boundedHarness: TestHarness;

    beforeEach(async () => {
      boundedHarness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            ...ALL_JOURNALS,
            bounded: fixedJournal(
              "bounded",
              { type: "day" },
              { timeline: { start: anchor("2030-06-01"), end: { kind: "date", date: anchor("2030-06-30") } } },
            ),
          },
        },
      });
    });

    function renderResult(anchorDate: string) {
      return journalLinkHandler(boundedHarness).render({
        arg: "bounded",
        sourceDate: CalendarDate.fromAnchor(anchor(anchorDate)),
        modifiers: [],
        context: hostContext("daily", anchorDate, anchorDate),
        engine: boundedHarness.resolve(TemplateEngine),
      });
    }

    it("errors when the target date is after the target timeline end", () => {
      expect(renderResult("2030-07-10").isErr()).toBe(true);
    });

    it("errors when the target date is before the target timeline start", () => {
      expect(renderResult("2030-05-20").isErr()).toBe(true);
    });

    it("resolves the path when the target date is within the timeline", () => {
      const result = renderResult("2030-06-15");
      expect(result.isOk() && result.value).toBe("2030-06-15");
    });

    it("links to a note that exists past the timeline end, which the journal still has", () => {
      // Eligibility is "a note exists OR the date is in timeline": the timeline bounds where a
      // journal writes, not what it has already written, so a note that outlived a narrowed
      // timeline is still a real note to link to.
      boundedHarness.resolve(JournalsIndex).register({
        journalName: "bounded",
        anchor: anchor("2030-07-10"),
        path: "Archive/Old log.md" as VaultPath,
      });

      const result = renderResult("2030-07-10");

      expect(result.isOk() && result.value).toBe("Archive/Old log");
    });

    it("leaves a {{journal_link}} token unresolved when the target is out of bounds", () => {
      const rendered = boundedHarness
        .resolve(TemplateEngine)
        .renderString("See [[{{journal_link(bounded)}}]]", hostContext("daily", "2030-07-10", "2030-07-10"));

      expect(rendered).toBe("See [[{{journal_link(bounded)}}]]");
    });
  });

  // The prod wiring registers the handler under FunctionHandlerToken (notes/module.ts), and
  // the engine resolves handlers from that token. These render through engine.renderString
  // so a {{journal_link(...)}} token in a note body actually dispatches to the handler.
  describe("through the template engine (FunctionHandlerToken wiring)", () => {
    it("resolves a {{journal_link}} token to the target note path", () => {
      expect(engine.renderString("{{journal_link(yearly)}}", crossYearWeek())).toBe("2026");
    });

    it("resolves a {{journal_link}} token embedded in note body text", () => {
      expect(engine.renderString("See [[{{journal_link(daily)}}]]", crossYearWeek())).toBe("See [[2025-12-29]]");
    });

    it("leaves the token unresolved when no handler is registered under the token", async () => {
      // Guards the assertions above: without the FunctionHandlerToken binding the engine
      // cannot dispatch, so a passing render proves the wiring, not the grammar alone.
      // No modules, and so no `journals` seed either: journalsCoreModule registers the
      // collection and the handler together, so "collection without handler" is not a
      // reachable wiring and a seed here would only have been ignored.
      const bare = await testContainer();

      const rendered = bare.resolve(TemplateEngine).renderString("{{journal_link(yearly)}}", crossYearWeek());

      expect(rendered).toBe("{{journal_link(yearly)}}");
    });
  });
});
