import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { viewSchema } from "./config";
import { defaultCalendarView } from "./default-view";

interface ToolbarItem {
  id: string;
  key: string;
  config: Record<string, unknown>;
}

function toolbarItems(): ToolbarItem[] {
  const [toolbar] = defaultCalendarView().blocks;
  return (toolbar.config as { items: ToolbarItem[] }).items;
}

function actionOf(item: ToolbarItem): { type: string; mode?: string } | undefined {
  return (item.config as { action?: { type: string; mode?: string } }).action;
}

describe("defaultCalendarView", () => {
  it("produces a view that satisfies the view schema", () => {
    const result = v.safeParse(viewSchema, defaultCalendarView());
    expect(result.success).toBe(true);
  });

  it("orders blocks as toolbar, month grid, divider, then intervals", () => {
    const keys = defaultCalendarView().blocks.map((block) => block.key);
    expect(keys).toEqual(["toolbar", "month-calendar", "divider", "custom-intervals"]);
  });

  it("mirrors the v2 header controls in order", () => {
    expect(toolbarItems().map((item) => item.key)).toEqual([
      "shelf-selector",
      "button",
      "button",
      "button",
      "button",
      "period-buttons",
      "button",
      "button",
    ]);
  });

  it("seeds the pick-date button in navigate mode", () => {
    const pick = toolbarItems().find((item) => actionOf(item)?.type === "pick-date");
    expect(actionOf(pick!)?.mode).toBe("navigate");
  });

  it("seeds the current button in create mode", () => {
    const current = toolbarItems().find((item) => actionOf(item)?.type === "current");
    expect(actionOf(current!)?.mode).toBe("create");
  });

  it("seeds period buttons for month, quarter, and year but not week", () => {
    const period = toolbarItems().find((item) => item.key === "period-buttons");
    expect(period!.config).toEqual({ week: false, month: true, quarter: true, year: true });
  });

  it("seeds the default calendar view into the right sidebar", () => {
    expect(defaultCalendarView().leaf).toBe("right");
  });

  it("opts the default calendar view into open-on-startup", () => {
    expect(defaultCalendarView().openOnStartup).toBe(true);
  });
});
