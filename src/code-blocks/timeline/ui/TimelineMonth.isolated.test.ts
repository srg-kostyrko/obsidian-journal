import { cleanup, render } from "@testing-library/vue";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";

import { installTestCalendar } from "@/calendar/testing";
import type { AnchorString } from "@/calendar/types";

import TimelineMonth from "./TimelineMonth.vue";

vi.mock("@/notes-calendar", () => ({
  NotesMonthView: defineComponent({
    props: { outsideDates: { type: String, default: "active" } },
    setup: (p) => () => h("div", { "data-testid": "month-stub", "data-outside-dates": p.outsideDates }),
  }),
}));

beforeAll(() => {
  installTestCalendar();
});

afterEach(() => cleanup());

describe("TimelineMonth", () => {
  it("keeps adjacent-month days actionable", () => {
    // Unlike quarter/calendar mode, which blanks overflow days, month mode keeps them
    // open so a leading/trailing day can still open its note.
    const { getByTestId } = render(TimelineMonth, {
      props: { refDate: "2026-05-15" as AnchorString, shelf: null },
    });
    expect(getByTestId("month-stub").dataset.outsideDates).toBe("active");
  });
});
