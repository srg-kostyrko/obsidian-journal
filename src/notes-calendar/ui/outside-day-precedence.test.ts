import { describe, expect, it } from "vitest";

import cellSource from "./NotesCalendarCell.vue?raw";
import monthViewSource from "./NotesMonthView.vue?raw";

// happy-dom applies no SFC styles, so the cascade that decides an outside day's text color cannot be
// computed here. What decides it is structure: the order of the cell's text chain, highest first, and
// the month view no longer painting outside days muted from a rule of its own, which came later in
// the cascade and beat both states. Its own file because a ?raw import beside the component import in
// NotesCalendarCell.test.ts trips import-x/no-duplicates, and directive comments are banned.
function textChainOrder(): string[] {
  const rule = /\.notes-calendar-cell:is\([^)]*\)\s*\{\s*color:([^;]*);/.exec(cellSource);
  return [...(rule?.[1] ?? "").matchAll(/--_text-(\w+)/g)].map((match) => match[1] ?? "");
}

const MONTH_VIEW_OUTSIDE_COLOR = /\[data-outside\][^{]*\{[^}]*color/;

describe("text precedence on outside days", () => {
  it("an outside day that is today takes today's text, not the muted outside color", () => {
    const order = textChainOrder();
    expect(order).toContain("today");
    expect(order.indexOf("today")).toBeLessThan(order.indexOf("outside"));
    expect(monthViewSource).not.toMatch(MONTH_VIEW_OUTSIDE_COLOR);
  });

  it("an outside day that is the open note takes the open note's text, not the muted outside color", () => {
    const order = textChainOrder();
    expect(order).toContain("active");
    expect(order.indexOf("active")).toBeLessThan(order.indexOf("outside"));
    expect(monthViewSource).not.toMatch(MONTH_VIEW_OUTSIDE_COLOR);
  });
});
