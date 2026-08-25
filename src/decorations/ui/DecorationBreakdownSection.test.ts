import { screen, within } from "@testing-library/vue";
import { describe, expect, it } from "vitest";
import { markRaw } from "vue";

import { DayPeriod } from "@/calendar";
import { date } from "@/calendar/testing";
import { m } from "@/i18n";
import type { JournalConfig } from "@/journals/config";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer, type TestHarness } from "@/testing";

import { attributeCell } from "../attribute-cell";
import { decorationsModule } from "../module";
import { decorationsSettingsCoreModule } from "../settings/module";
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

async function buildHarness(
  options: { journals?: Record<string, JournalConfig>; globalDecorations?: readonly CalendarDecoration[] } = {},
): Promise<TestHarness> {
  return testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, decorationsModule, decorationsSettingsCoreModule],
    data: {
      journals: options.journals ?? {},
      shelves: {},
      decorations: { decorations: [...(options.globalDecorations ?? [])] },
    },
  });
}

// The section reads decorations back out of DecorationsStore by owner + index to render their
// condition text, so the fixtures must be registered there, not just referenced by the cell.
async function mountSection(options: {
  journalDecorations?: readonly JournalDecoration[];
  globalDecorations?: readonly CalendarDecoration[];
  contributions: readonly Contribution[];
}): Promise<void> {
  const harness = await buildHarness({
    journals: {
      daily: fixedJournal("daily", { type: "day" }, { decorations: [...(options.journalDecorations ?? [])] }),
    },
    globalDecorations: options.globalDecorations,
  });

  // @vue/test-utils stores props on a reactive() object, so an unmarked cell would get its
  // Period lazily wrapped in a Proxy on read — and calling a private-field method (e.g.
  // CalendarDate#format) with `this` bound to that Proxy throws, since Proxies carry no
  // private-field brand of their own.
  const cell: BreakdownCell = markRaw({
    kind: "fixed",
    period: DayPeriod.containing(date("2026-05-25")),
    attribution: attributeCell(options.contributions),
    styles: options.contributions.map((contribution) => contribution.style),
  });

  harness.render(DecorationBreakdownSection, { props: { cell, index: 0 } });
}

describe("DecorationBreakdownSection", () => {
  it("names the winning decoration for a resolved property", async () => {
    await mountSection({
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

  it("lists a contribution that lost a property under the overridden heading", async () => {
    await mountSection({
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

  it("interleaves the mode word between an OR decoration's conditions", async () => {
    const orDecoration: JournalDecoration = buildDecoration({
      mode: "or",
      conditions: [buildCondition("has-note"), buildCondition("date", { day: -1, month: -1, year: null })],
      styles: [buildStyle("background")],
    });
    await mountSection({
      journalDecorations: [orDecoration],
      contributions: [
        { source: { owner: { kind: "journal", journalName: "daily" }, index: 0 }, style: buildStyle("background") },
      ],
    });

    expect(screen.getByText(m.decoration_condition_has_note_describe())).toBeTruthy();
    expect(screen.getByText(ANY_DATE_TEXT)).toBeTruthy();
    expect(screen.getByText(m.decoration_describe_mode({ kind: "or" }))).toBeTruthy();
  });

  it("lists marks without naming a winner", async () => {
    const journalMark: JournalDecoration = buildDecoration({
      mode: "or",
      conditions: [buildCondition("has-note")],
      styles: [buildStyle("shape")],
    });
    const globalMark: CalendarDecoration = buildCalendarDecoration({
      mode: "or",
      conditions: [buildCondition("date", { day: -1, month: -1, year: null })],
      styles: [buildStyle("shape")],
    });
    await mountSection({
      journalDecorations: [journalMark],
      globalDecorations: [globalMark],
      contributions: [
        { source: { owner: { kind: "journal", journalName: "daily" }, index: 0 }, style: buildStyle("shape") },
        { source: { owner: { kind: "global" }, index: 0 }, style: buildStyle("shape") },
      ],
    });

    // Both marks' condition text must resolve through DecorationsStore's owner+index lookup,
    // not just structurally appear under the marks heading without naming a winner.
    expect(screen.getByText(m.decoration_breakdown_marks_heading())).toBeTruthy();
    expect(screen.getByText(m.decoration_condition_has_note_describe())).toBeTruthy();
    expect(screen.getByText(ANY_DATE_TEXT)).toBeTruthy();
    expect(screen.queryByText(m.decoration_breakdown_overridden_heading())).toBeNull();
  });

  it("keeps its accessible name intact for a journal name containing a space", async () => {
    const harness = await buildHarness();

    const cell: BreakdownCell = markRaw({
      kind: "interval",
      period: DayPeriod.containing(date("2026-05-25")),
      journalName: "sprint planning",
      attribution: attributeCell([]),
      styles: [],
    });

    harness.render(DecorationBreakdownSection, { props: { cell, index: 0 } });

    // `aria-labelledby` tokenizes on whitespace, so an id built from the raw journal name would
    // resolve to nonexistent ids and the region would lose its accessible name entirely.
    const heading = m.decoration_breakdown_interval_heading({ journal: "sprint planning", label: "2026-05-25" });
    expect(screen.getByRole("region", { name: heading })).toBeTruthy();
  });
});
