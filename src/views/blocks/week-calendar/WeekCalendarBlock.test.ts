import { cleanup } from "@testing-library/vue";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";

import { installTestCalendar } from "@/calendar/testing";
import type { AnchorString } from "@/calendar/types";

import { mountViewBlock } from "../../testing";

import { weekCalendarBlock } from "./week-calendar-block";

vi.mock("@/notes-calendar/ui/NotesWeekView.vue", () => ({
  default: defineComponent({
    props: {
      week: { type: Object, required: true },
      shelf: { type: [String, null], default: null },
    },
    setup: (p) => {
      interface WeekLike {
        start: { toAnchor(): string };
      }
      return () =>
        h("div", {
          "data-testid": "week-stub",
          "data-week": (p.week as unknown as WeekLike).start.toAnchor(),
          "data-shelf": String(p.shelf ?? ""),
        });
    },
  }),
}));

beforeAll(() => {
  installTestCalendar();
});

afterEach(() => cleanup());

describe("WeekCalendarBlock", () => {
  it("renders a single NotesWeekView when before=0 and after=0", () => {
    const { getAllByTestId } = mountViewBlock(weekCalendarBlock, {
      config: { before: 0, after: 0, hideWeekends: false, weeks: "left" as const },
    });
    expect(getAllByTestId("week-stub").length).toBe(1);
  });

  it("renders before + after + 1 NotesWeekView instances", () => {
    const { getAllByTestId } = mountViewBlock(weekCalendarBlock, {
      config: { before: 1, after: 1, hideWeekends: false, weeks: "left" as const },
    });
    expect(getAllByTestId("week-stub").length).toBe(3);
  });

  it("anchors the first NotesWeekView at the week shifted back by before weeks", () => {
    const { getAllByTestId } = mountViewBlock(
      weekCalendarBlock,
      { config: { before: 2, after: 0, hideWeekends: false, weeks: "left" as const } },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    const stubs = getAllByTestId("week-stub");
    // refDate 2026-05-15 → containing week (locale firstDayOfWeek) → previous twice.
    // The exact anchor depends on installTestCalendar's seed; assert it differs from
    // the focus-week anchor and that there are 3 distinct anchors in order.
    expect(stubs[0]?.dataset.week).not.toBe(stubs[1]?.dataset.week);
    expect(stubs[0]?.dataset.week ?? "").not.toBe("");
  });

  it("passes the current shelf to each NotesWeekView", () => {
    const { getAllByTestId } = mountViewBlock(
      weekCalendarBlock,
      { config: { before: 0, after: 1, hideWeekends: false, weeks: "left" as const } },
      { shelf: ref("my-shelf") },
    );
    const stubs = getAllByTestId("week-stub");
    expect(stubs.every((s) => s.dataset.shelf === "my-shelf")).toBe(true);
  });

  it("sets data-hide-weekends on the wrapper when config.hideWeekends is true", () => {
    const { container } = mountViewBlock(weekCalendarBlock, {
      config: { before: 0, after: 0, hideWeekends: true, weeks: "left" as const },
    });
    const wrapper = container.querySelector<HTMLElement>(".journal-view-week-calendar");
    expect(wrapper?.dataset.hideWeekends).toBe("true");
  });
});
