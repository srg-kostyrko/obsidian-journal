import { $$, browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { reloadObsidianOn } from "../support/clock.js";

import { openSeededCalendarView, TOOLBAR } from "./view.js";

const NAVIGATION_TOOLBAR_INDEX = 1;
const SAME_ROW_TOLERANCE_PX = 4;
const EDGE_TOLERANCE_PX = 1;

interface Box {
  top: number;
  left: number;
  right: number;
}

interface Layout {
  toolbarRight: number;
  previousYear: Box;
  month: Box;
  year: Box;
  nextMonth: Box;
  nextYear: Box;
}

// A forced width on the toolbar, because the window itself cannot be resized from a spec. September
// is pinned as the longest English month, so both widths below stay meaningful whatever today is.
async function layoutAt(width: number): Promise<Layout> {
  return browser.execute(
    (toolbar: string, index: number, px: number, labels: Record<string, string>): Layout => {
      const root = document.querySelectorAll<HTMLElement>(toolbar)[index];
      root.style.width = `${px}px`;
      const box = (selector: string): Box => {
        const [element] = root.querySelectorAll(selector);
        const { top, left, right } = element.getBoundingClientRect();
        return { top, left, right };
      };
      const labelled = (label: string): Box => box(`[aria-label="${CSS.escape(label)}"]`);
      return {
        toolbarRight: root.getBoundingClientRect().right,
        previousYear: labelled(labels.previousYear),
        month: box("[data-period='month']"),
        year: box("[data-period='year']"),
        nextMonth: labelled(labels.nextMonth),
        nextYear: labelled(labels.nextYear),
      };
    },
    TOOLBAR,
    NAVIGATION_TOOLBAR_INDEX,
    width,
    {
      previousYear: m.view_toolbar_button_default_tooltip_prev_unit({ unit: "year" }),
      nextMonth: m.view_toolbar_button_default_tooltip_next_unit({ unit: "month" }),
      nextYear: m.view_toolbar_button_default_tooltip_next_unit({ unit: "year" }),
    },
  );
}

describe("toolbar in a narrow pane", () => {
  before(async () => {
    await reloadObsidianOn("2026-09-14", { vault: "./e2e-tests/fixtures/e2e-daily", plugins: ["journals"] });
    await openSeededCalendarView();
    await expect($$(TOOLBAR)).toBeElementsArrayOfSize(NAVIGATION_TOOLBAR_INDEX + 1);
  });

  it("keeps the default navigation on one row at 262px", async () => {
    const layout = await layoutAt(262);
    expect(Math.abs(layout.nextYear.top - layout.previousYear.top)).toBeLessThanOrEqual(SAME_ROW_TOLERANCE_PX);
  });

  it("draws the month and year labels with no gap between their buttons", async () => {
    const layout = await layoutAt(262);
    expect(Math.abs(layout.year.left - layout.month.right)).toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
  });

  it("wraps the forward arrows as a pair and keeps them on the right at 200px", async () => {
    const layout = await layoutAt(200);
    expect(layout.nextYear.top).toBeGreaterThan(layout.previousYear.top + SAME_ROW_TOLERANCE_PX);
    expect(Math.abs(layout.nextYear.top - layout.nextMonth.top)).toBeLessThanOrEqual(SAME_ROW_TOLERANCE_PX);
    expect(Math.abs(layout.nextYear.right - layout.toolbarRight)).toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
  });
});
