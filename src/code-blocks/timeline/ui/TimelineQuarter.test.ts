import { cleanup, render } from "@testing-library/vue";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { anchor, installTestCalendar } from "@/calendar/testing";
import { buildCondition, buildDecoration, buildStyle } from "@/decorations/testing";
import { initLocale } from "@/i18n";
import { provideInjectorOnApp } from "@/infrastructure/di";
import { fixedJournal } from "@/journals/testing";
import { buildNotesCalendarHarness, type NotesCalendarHarness } from "@/notes-calendar/testing";

import TimelineQuarter from "./TimelineQuarter.vue";

function mount(h: NotesCalendarHarness) {
  return render(TimelineQuarter, {
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

describe("TimelineQuarter", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
    cleanup();
  });

  it("sizes its columns around the padding the journals in scope reserve", () => {
    // Three months share one row, so the row has to know how wide a decorated month gets
    // before it decides how many of them fit.
    const decoration = buildDecoration({
      mode: "or",
      conditions: [buildCondition("weekday", { weekdays: [1] })],
      styles: [buildStyle("shape", { placement_x: "right", placement_y: "middle", size: 0.5 })],
    });
    const h = buildNotesCalendarHarness({
      journals: { daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }) },
    });

    const { container } = mount(h);

    const grid = container.querySelector<HTMLElement>(".timeline-quarter");
    expect(grid?.style.getPropertyValue("--journal-cell-padding-inline")).toBe("max(0.6em, 2px)");
  });
});
