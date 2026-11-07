import { render } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { calendarStyleRules } from "../testing";

import NotesCalendarDivider from "./NotesCalendarDivider.vue";

const rule = (selector: string) =>
  calendarStyleRules().divider.find((candidate) => candidate.container === null && candidate.selector === selector);

describe("NotesCalendarDivider", () => {
  it("sits on the grid lines it is given, hidden from assistive tech", () => {
    const { container } = render(NotesCalendarDivider, { props: { column: "2 / 3", row: "2 / auto" } });
    const divider = container.querySelector<HTMLElement>(".notes-calendar-divider");

    expect({
      column: divider?.style.gridColumn,
      row: divider?.style.gridRow,
      hidden: divider?.getAttribute("aria-hidden"),
    }).toEqual({ column: "2 / 3", row: "2 / auto", hidden: "true" });
  });

  it("runs the height of its grid area and takes no pointer", () => {
    expect({
      position: rule(".notes-calendar-divider")?.declarations.get("position"),
      inset: rule(".notes-calendar-divider")?.declarations.get("inset-block"),
      pointer: rule(".notes-calendar-divider")?.declarations.get("pointer-events"),
    }).toEqual({ position: "absolute", inset: "0", pointer: "none" });
  });

  // A divider wider than its track reaches into the cells either side, which are positioned and come later.
  it("paints above the cells, as an over band does, and below a lifted mark popover", () => {
    expect(rule(".notes-calendar-divider")?.declarations.get("z-index")).toBe("1");
  });

  // Its grid area is the track between the week numbers and the days, so a line centred in it keeps clear of both.
  it("draws its line centred in its grid area", () => {
    expect({
      inline: rule(".notes-calendar-divider")?.declarations.get("inset-inline"),
      line: rule(".notes-calendar-divider")?.declarations.get("border-inline-start"),
    }).toEqual({
      inline: "calc(50% - var(--_v-week-number-divider-width) / 2)",
      line: "var(--_v-week-number-divider-width) solid var(--_v-week-number-divider-color)",
    });
  });
});
