import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CalendarDate } from "@/calendar";
import { anchor, installTestCalendar } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { LoggerModule } from "@/infrastructure/logger";
import { TemplateContext, TemplateEngine, type FunctionInput, type Modifier } from "@/templates";

import { CycleService } from "../cycle";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { NumberingService } from "../numbering";
import { JournalsRepository } from "../repository";
import { customJournal, fakeRepo, fixedJournal } from "../testing";

import { JournalLinkHandler } from "./journal-link-handler";
import { NotePathService } from "./note-path";

import type { JournalConfig } from "../config";

function buildContainer(journals: Record<string, JournalConfig>): Container {
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(JournalsRepository).useValue(fakeRepo(journals));
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  c.register(NotePathService).useClass(NotePathService);
  c.register(TemplateEngine).useClass(TemplateEngine);
  c.register(JournalLinkHandler).useClass(JournalLinkHandler);
  return c;
}

type ShiftUnit = Extract<Modifier, { kind: "shift" }>["unit"];

function shift(amount: number, unit: ShiftUnit): Modifier {
  return { kind: "shift", sign: amount < 0 ? -1 : 1, amount: Math.abs(amount), unit };
}

const ALL_JOURNALS = {
  weekly: fixedJournal("weekly", { type: "week" }),
  yearly: fixedJournal("yearly", { type: "year" }),
  monthly: fixedJournal("monthly", { type: "month" }),
  daily: fixedJournal("daily", { type: "day" }),
  custom_daily: customJournal("custom_daily", "day", 1, "2020-01-01"),
};

function hostContext(name: string, anchorDate: string, startDate: string): TemplateContext {
  return TemplateContext.empty()
    .date("date", CalendarDate.fromAnchor(anchor(anchorDate)), "YYYY-MM-DD")
    .date("start_date", CalendarDate.fromAnchor(anchor(startDate)), "YYYY-MM-DD")
    .string("journal_name", name);
}

function dateOf(context: TemplateContext): CalendarDate {
  const spec = context.get("date");
  if (spec?.kind !== "date") throw new Error("context has no date");
  return spec.value;
}

// The week of 2026-01-01 (Thursday) is ISO week 1 of 2026:
// start = Mon 2025-12-29, anchor = Thu 2026-01-01, end = Sun 2026-01-04.
const crossYearWeek = (): TemplateContext => hostContext("weekly", "2026-01-01", "2025-12-29");

describe("JournalLinkHandler", () => {
  let teardown: () => void;
  let container: Container;
  let handler: JournalLinkHandler;
  let engine: TemplateEngine;

  beforeEach(() => {
    ({ teardown } = installTestCalendar());
    container = buildContainer(ALL_JOURNALS);
    handler = container.resolve(JournalLinkHandler);
    engine = container.resolve(TemplateEngine);
  });

  afterEach(() => {
    teardown();
  });

  function render(argument: string, context: TemplateContext, modifiers: Modifier[] = [], format?: string): string {
    const input: FunctionInput = {
      arg: argument,
      sourceDate: dateOf(context),
      modifiers,
      context,
      engine,
      ...(format === undefined ? {} : { format }),
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

  it("returns the full vault path without the .md extension", () => {
    const journals = {
      ...ALL_JOURNALS,
      diary: fixedJournal("diary", { type: "day" }, { folder: "Diary/{{date:YYYY}}" }),
    };
    const c = buildContainer(journals);
    const result = c.resolve(JournalLinkHandler).render({
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
});
