import { render } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { calendarStyleRules } from "../testing";

import NotesCalendarDivider from "./NotesCalendarDivider.vue";

const rule = (selector: string) =>
  calendarStyleRules().divider.find((candidate) => candidate.container === null && candidate.selector === selector);

describe("NotesCalendarDivider", () => {
  it("sits on the grid lines it is given, on the side it is given, hidden from assistive tech", () => {
    const { container } = render(NotesCalendarDivider, { props: { side: "end", column: "1 / 2", row: "2 / auto" } });
    const divider = container.querySelector<HTMLElement>(".notes-calendar-divider");

    expect({
      side: divider?.dataset.side,
      column: divider?.style.gridColumn,
      row: divider?.style.gridRow,
      hidden: divider?.getAttribute("aria-hidden"),
    }).toEqual({ side: "end", column: "1 / 2", row: "2 / auto", hidden: "true" });
  });

  it("fills its grid area and takes no pointer", () => {
    expect({
      position: rule(".notes-calendar-divider")?.declarations.get("position"),
      inset: rule(".notes-calendar-divider")?.declarations.get("inset"),
      pointer: rule(".notes-calendar-divider")?.declarations.get("pointer-events"),
    }).toEqual({ position: "absolute", inset: "0", pointer: "none" });
  });

  it.each([
    ["end", "border-inline-end"],
    ["start", "border-inline-start"],
  ] as const)("draws its line on the %s edge", (side, property) => {
    expect(rule(`.notes-calendar-divider[data-side="${side}"]`)?.declarations.get(property)).toBe(
      "var(--_v-week-number-divider-width) solid var(--_v-week-number-divider-color)",
    );
  });

  // A filled week-number cell paints over anything inside its column, so the line sits in the gutter instead.
  it.each([
    ["end", "inset-inline-end"],
    ["start", "inset-inline-start"],
  ] as const)("centres its %s line in the grid's cell gap", (side, property) => {
    expect(rule(`.notes-calendar-divider[data-side="${side}"]`)?.declarations.get(property)).toBe(
      "calc(var(--_v-cell-gap, 0px) / -2 - var(--_v-week-number-divider-width) / 2)",
    );
  });
});
