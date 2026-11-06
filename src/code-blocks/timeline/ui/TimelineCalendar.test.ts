import { beforeAll, describe, expect, it } from "vitest";

import { anchor } from "@/calendar/testing";
import { decorationsModule } from "@/decorations/module";
import { decorationsSettingsCoreModule } from "@/decorations/settings/module";
import { buildCondition, buildDecoration, buildStyle } from "@/decorations/testing";
import { initLocale } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { notesCalendarModule } from "@/notes-calendar/module";
import { shelvesCoreModule } from "@/shelves/module";
import { tasksCoreModule } from "@/tasks/module";
import { testContainer } from "@/testing";

import TimelineCalendar from "./TimelineCalendar.vue";

const MODULES = [
  journalsCoreModule,
  shelvesCoreModule,
  decorationsModule,
  decorationsSettingsCoreModule,
  notesCalendarModule,
  tasksCoreModule,
];

beforeAll(() => initLocale("en"));

describe("TimelineCalendar", () => {
  it("sizes its columns around the padding the journals in scope reserve", async () => {
    // A year of months wraps across rows, so the grid has to know how wide a decorated
    // month gets before it decides how many fit on one.
    const decoration = buildDecoration({
      mode: "or",
      conditions: [buildCondition("weekday", { weekdays: [1] })],
      styles: [buildStyle("shape", { placement_x: "right", placement_y: "middle", size: 0.5 })],
    });
    const harness = await testContainer({
      modules: MODULES,
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }) } },
    });

    const { container } = harness.render(TimelineCalendar, {
      props: { refDate: anchor("2026-08-15"), shelf: null, showHeader: true, showWeekdays: true },
    });

    const grid = container.querySelector<HTMLElement>(".timeline-calendar");
    expect(grid?.style.getPropertyValue("--journal-timeline-mark-reservation")).toBe("max(0.6em + 3px, 2px)");
  });

  it("renders the heading and a visible weekday row when stock visibility is passed", async () => {
    const harness = await testContainer({
      modules: MODULES,
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
    const { container } = harness.render(TimelineCalendar, {
      props: { refDate: anchor("2026-05-15"), shelf: null, showHeader: true, showWeekdays: true },
    });

    expect(container.querySelector(".notes-month-view__header")).not.toBeNull();
    expect(container.querySelector(".notes-month-view__row--visually-hidden")).toBeNull();
  });
});
