import { cleanup } from "@testing-library/vue";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";

import { installTestCalendar } from "@/calendar/testing";
import type { AnchorString } from "@/calendar/types";

import { mountViewBlock } from "../../testing";

import { monthCalendarBlock } from "./month-calendar-block";

vi.mock("@/notes-calendar/ui/NotesMonthView.vue", () => ({
  default: defineComponent({
    props: {
      month: { type: Object, required: true },
      shelf: { type: [String, null], default: null },
    },
    setup: (p) => {
      interface MonthLike {
        start: { toAnchor(): string };
      }
      return () =>
        h("div", {
          "data-testid": "month-stub",
          "data-month": (p.month as unknown as MonthLike).start.toAnchor(),
          "data-shelf": String(p.shelf ?? ""),
        });
    },
  }),
}));

beforeAll(() => {
  installTestCalendar();
});

afterEach(() => cleanup());

describe("MonthCalendarBlock", () => {
  it("renders a single NotesMonthView when before=0 and after=0", () => {
    const { getAllByTestId } = mountViewBlock(monthCalendarBlock, {
      config: { before: 0, after: 0, hideWeekends: false, weeks: "left" as const },
    });
    expect(getAllByTestId("month-stub").length).toBe(1);
  });

  it("renders before + after + 1 NotesMonthView instances", () => {
    const { getAllByTestId } = mountViewBlock(monthCalendarBlock, {
      config: { before: 1, after: 1, hideWeekends: false, weeks: "left" as const },
    });
    expect(getAllByTestId("month-stub").length).toBe(3);
  });

  it("anchors the first NotesMonthView at refDate shifted back by before months", () => {
    const { getAllByTestId } = mountViewBlock(
      monthCalendarBlock,
      { config: { before: 2, after: 0, hideWeekends: false, weeks: "left" as const } },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    const stubs = getAllByTestId("month-stub");
    expect(stubs[0]?.dataset.month).toBe("2026-03-01");
  });

  it("passes the current shelf to each NotesMonthView", () => {
    const { getAllByTestId } = mountViewBlock(
      monthCalendarBlock,
      { config: { before: 0, after: 1, hideWeekends: false, weeks: "left" as const } },
      { shelf: ref("my-shelf") },
    );
    const stubs = getAllByTestId("month-stub");
    expect(stubs.every((s) => s.dataset.shelf === "my-shelf")).toBe(true);
  });

  it("sets data-hide-weekends on the wrapper when config.hideWeekends is true", () => {
    const { container } = mountViewBlock(monthCalendarBlock, {
      config: { before: 0, after: 0, hideWeekends: true, weeks: "left" as const },
    });
    const wrapper = container.querySelector<HTMLElement>(".journal-view-month-calendar");
    expect(wrapper?.dataset.hideWeekends).toBe("true");
  });
});
