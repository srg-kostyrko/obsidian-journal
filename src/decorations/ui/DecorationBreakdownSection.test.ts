import { cleanup, render, screen, within } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { markRaw } from "vue";

import { Calendar, DayPeriod } from "@/calendar";
import { date, installTestCalendar, testCalendar } from "@/calendar/testing";
import { m } from "@/i18n";
import { provideInjectorOnApp } from "@/infrastructure/di";
import { JournalsRepository, type JournalsEvents } from "@/journals";
import { fixedJournal } from "@/journals/testing";
import { createSettingsService } from "@/settings/testing";
import { ShelvesRepository, type ShelvesEvents } from "@/shelves";

import { attributeCell } from "../attribute-cell";
import { DecorationsStore } from "../decorations-store";
import { decorationsSlice } from "../settings/slice";
import { buildCalendarDecoration, buildCondition, buildDecoration, buildStyle } from "../testing";

import DecorationBreakdownSection from "./DecorationBreakdownSection.vue";

import type { BreakdownCell } from "./breakdown-cell";
import type { CalendarDecoration, JournalDecoration } from "../config";
import type { Contribution } from "../engine";

const ANY_DATE_TEXT = m.decoration_condition_date_describe({
  day: m.decoration_condition_date_any(),
  month: m.decoration_condition_date_any(),
  year: m.decoration_condition_date_any(),
});

const hasNoteDecoration: JournalDecoration = buildDecoration({
  mode: "or",
  conditions: [buildCondition("has-note")],
  styles: [buildStyle("background")],
});

const anyDayCalendarDecoration: CalendarDecoration = buildCalendarDecoration({
  mode: "or",
  conditions: [buildCondition("date", { day: -1, month: -1, year: null })],
  styles: [buildStyle("background")],
});

// The section reads decorations back out of DecorationsStore by owner + index to render their
// condition text, so the fixtures must be registered there, not just referenced by the cell.
function mountSection(options: {
  journalDecorations?: readonly JournalDecoration[];
  globalDecorations?: readonly CalendarDecoration[];
  contributions: readonly Contribution[];
}) {
  const { container, service } = createSettingsService({ slices: [decorationsSlice] });
  service.getSlice(decorationsSlice).state = { decorations: [...(options.globalDecorations ?? [])] };

  const journals = JournalsRepository.fromParts(
    {
      daily: fixedJournal("daily", { type: "day" }, { decorations: [...(options.journalDecorations ?? [])] }),
    },
    createNanoEvents<JournalsEvents>(),
  );

  const shelves = ShelvesRepository.fromParts({}, createNanoEvents<ShelvesEvents>());

  container.register(JournalsRepository).useValue(journals);
  container.register(ShelvesRepository).useValue(shelves);
  container.register(DecorationsStore).useClass(DecorationsStore);
  container.register(Calendar).useValue(testCalendar());

  // @vue/test-utils stores props on a reactive() object, so an unmarked cell would get its
  // Period lazily wrapped in a Proxy on read — and calling a private-field method (e.g.
  // CalendarDate#format) with `this` bound to that Proxy throws, since Proxies carry no
  // private-field brand of their own.
  const cell: BreakdownCell = markRaw({
    kind: "fixed",
    period: DayPeriod.containing(date("2026-05-25")),
    isEntry: false,
    attribution: attributeCell(options.contributions),
    styles: options.contributions.map((contribution) => contribution.style),
  });

  render(DecorationBreakdownSection, {
    props: { cell, index: 0 },
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
          },
        },
      ],
    },
  });
}

describe("DecorationBreakdownSection", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
    cleanup();
  });

  it("names the winning decoration for a resolved property", () => {
    mountSection({
      globalDecorations: [anyDayCalendarDecoration],
      journalDecorations: [hasNoteDecoration],
      contributions: [
        { source: { owner: { kind: "global" }, index: 0 }, style: buildStyle("background") },
        { source: { owner: { kind: "journal", journalName: "daily" }, index: 0 }, style: buildStyle("background") },
      ],
    });

    const winnerGroup = screen.getByRole("group", {
      name: m.decoration_breakdown_property({ property: "background" }),
    });
    expect(within(winnerGroup).getByText(m.decoration_condition_has_note_describe())).toBeTruthy();
    expect(
      within(winnerGroup).getByText(m.decoration_breakdown_owner({ kind: "journal", name: "daily" })),
    ).toBeTruthy();
  });

  it("lists a contribution that lost a property under the overridden heading", () => {
    mountSection({
      globalDecorations: [anyDayCalendarDecoration],
      journalDecorations: [hasNoteDecoration],
      contributions: [
        { source: { owner: { kind: "global" }, index: 0 }, style: buildStyle("background") },
        { source: { owner: { kind: "journal", journalName: "daily" }, index: 0 }, style: buildStyle("background") },
      ],
    });

    const overriddenGroup = screen.getByRole("group", {
      name: m.decoration_breakdown_overridden_for({
        property: m.decoration_breakdown_property({ property: "background" }),
      }),
    });
    expect(within(overriddenGroup).getByText(ANY_DATE_TEXT)).toBeTruthy();
    expect(within(overriddenGroup).getByText(m.decoration_breakdown_owner({ kind: "global", name: "" }))).toBeTruthy();
  });

  it("interleaves the mode word between an OR decoration's conditions", () => {
    const orDecoration: JournalDecoration = buildDecoration({
      mode: "or",
      conditions: [buildCondition("has-note"), buildCondition("date", { day: -1, month: -1, year: null })],
      styles: [buildStyle("background")],
    });
    mountSection({
      journalDecorations: [orDecoration],
      contributions: [
        { source: { owner: { kind: "journal", journalName: "daily" }, index: 0 }, style: buildStyle("background") },
      ],
    });

    expect(screen.getByText(m.decoration_describe_mode({ kind: "or" }))).toBeTruthy();
  });

  it("lists marks without naming a winner", () => {
    const journalMark: JournalDecoration = buildDecoration({
      mode: "or",
      conditions: [buildCondition("has-note")],
      styles: [buildStyle("shape")],
    });
    mountSection({
      journalDecorations: [journalMark],
      contributions: [
        { source: { owner: { kind: "journal", journalName: "daily" }, index: 0 }, style: buildStyle("shape") },
      ],
    });

    expect(screen.getByText(m.decoration_breakdown_marks_heading())).toBeTruthy();
    expect(screen.queryByText(m.decoration_breakdown_overridden_heading())).toBeNull();
  });

  it("keeps its accessible name intact for a journal name containing a space", () => {
    const { container, service } = createSettingsService({ slices: [decorationsSlice] });
    service.getSlice(decorationsSlice).state = { decorations: [] };
    const journals = JournalsRepository.fromParts({}, createNanoEvents<JournalsEvents>());
    const shelves = ShelvesRepository.fromParts({}, createNanoEvents<ShelvesEvents>());
    container.register(JournalsRepository).useValue(journals);
    container.register(ShelvesRepository).useValue(shelves);
    container.register(DecorationsStore).useClass(DecorationsStore);
    container.register(Calendar).useValue(testCalendar());

    const cell: BreakdownCell = markRaw({
      kind: "interval",
      period: DayPeriod.containing(date("2026-05-25")),
      journalName: "sprint planning",
      isEntry: false,
      attribution: attributeCell([]),
      styles: [],
    });

    render(DecorationBreakdownSection, {
      props: { cell, index: 0 },
      global: {
        plugins: [
          {
            install(app) {
              provideInjectorOnApp(app, container);
            },
          },
        ],
      },
    });

    // `aria-labelledby` tokenizes on whitespace, so an id built from the raw journal name would
    // resolve to nonexistent ids and the region would lose its accessible name entirely.
    const heading = m.decoration_breakdown_interval_heading({ journal: "sprint planning", label: "2026-05-25" });
    expect(screen.getByRole("region", { name: heading })).toBeTruthy();
  });
});
