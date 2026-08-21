import { cleanup, render } from "@testing-library/vue";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { anchor, installTestCalendar } from "@/calendar/testing";
import { buildCondition, buildDecoration, buildStyle } from "@/decorations/testing";
import { initLocale } from "@/i18n";
import { provideInjectorOnApp } from "@/infrastructure/di";
import { fixedJournal } from "@/journals/testing";
import { buildNotesCalendarHarness, type NotesCalendarHarness } from "@/notes-calendar/testing";

import TimelineCalendar from "./TimelineCalendar.vue";

function mount(h: NotesCalendarHarness) {
  return render(TimelineCalendar, {
    props: { refDate: anchor("2026-08-15"), shelf: null },
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, h.container);
          },
        },
      ],
    },
  });
}

beforeAll(() => initLocale("en"));

describe("TimelineCalendar", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
    cleanup();
  });

  it("sizes its columns around the padding the journals in scope reserve", () => {
    // A year of months wraps across rows, so the grid has to know how wide a decorated
    // month gets before it decides how many fit on one.
    const decoration = buildDecoration({
      mode: "or",
      conditions: [buildCondition("weekday", { weekdays: [1] })],
      styles: [buildStyle("shape", { placement_x: "right", placement_y: "middle", size: 0.5 })],
    });
    const h = buildNotesCalendarHarness({
      journals: { daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }) },
    });

    const { container } = mount(h);

    const grid = container.querySelector<HTMLElement>(".timeline-calendar");
    expect(grid?.style.getPropertyValue("--journal-cell-padding-inline")).toBe("max(0.6em, 2px)");
  });
});
