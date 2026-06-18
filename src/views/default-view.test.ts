import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { viewSchema } from "./config";
import { defaultCalendarView } from "./default-view";

interface ToolbarItem {
  id: string;
  key: string;
  config: Record<string, unknown>;
}

function itemsOf(blockIndex: number): ToolbarItem[] {
  const block = defaultCalendarView().blocks[blockIndex];
  return (block.config as { items: ToolbarItem[] }).items;
}

function allItems(): ToolbarItem[] {
  return [...itemsOf(0), ...itemsOf(1)];
}

function actionOf(item: ToolbarItem): { type: string; mode?: string } | undefined {
  return (item.config as { action?: { type: string; mode?: string } }).action;
}

describe("defaultCalendarView", () => {
  it("produces a view that satisfies the view schema", () => {
    const result = v.safeParse(viewSchema, defaultCalendarView());
    expect(result.success).toBe(true);
  });

  it("orders blocks as two toolbars, month grid, divider, then intervals", () => {
    const keys = defaultCalendarView().blocks.map((block) => block.key);
    expect(keys).toEqual(["toolbar", "toolbar", "month-calendar", "divider", "custom-intervals"]);
  });

  it("lays out the actions row as shelf, spacer, then the two action buttons", () => {
    expect(itemsOf(0).map((item) => item.key)).toEqual(["shelf-selector", "spacer", "button", "button"]);
  });

  it("centres the period buttons between the nav buttons with flanking spacers", () => {
    expect(itemsOf(1).map((item) => item.key)).toEqual([
      "button",
      "button",
      "spacer",
      "period-buttons",
      "spacer",
      "button",
      "button",
    ]);
  });

  it("seeds the pick-date button in navigate mode", () => {
    const pick = allItems().find((item) => actionOf(item)?.type === "pick-date");
    expect(actionOf(pick!)?.mode).toBe("navigate");
  });

  it("seeds the current button in create mode", () => {
    const current = allItems().find((item) => actionOf(item)?.type === "current");
    expect(actionOf(current!)?.mode).toBe("create");
  });

  it("seeds period buttons for month, quarter, and year but not week", () => {
    const period = allItems().find((item) => item.key === "period-buttons");
    expect(period!.config).toEqual({ week: false, month: true, quarter: true, year: true });
  });

  it("hides the month grid's own heading in favour of the toolbar period buttons", () => {
    const monthGrid = defaultCalendarView().blocks.find((block) => block.key === "month-calendar");
    expect((monthGrid!.config as { showHeading: boolean }).showHeading).toBe(false);
  });

  it("seeds the default calendar view into the right sidebar", () => {
    expect(defaultCalendarView().leaf).toBe("right");
  });

  it("opts the default calendar view into open-on-startup", () => {
    expect(defaultCalendarView().openOnStartup).toBe(true);
  });
});
