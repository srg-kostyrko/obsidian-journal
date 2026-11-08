import { render } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { calendarStyleRules } from "../testing";

import NotesCalendarBand from "./NotesCalendarBand.vue";

describe("NotesCalendarBand", () => {
  it.each([
    ["weekend", "weekend"],
    ["currentWeek", "current-week"],
  ] as const)("draws the %s band's fill under its ring, on the grid lines it is given", (kind, state) => {
    const { container } = render(NotesCalendarBand, { props: { kind, column: "7 / span 2", row: "auto" } });
    const band = container.querySelector<HTMLElement>(".notes-calendar-band");

    expect({
      band: band?.dataset.band,
      column: band?.style.gridColumn,
      row: band?.style.gridRow,
      layers: [...(band?.children ?? [])].map((layer) => (layer as HTMLElement).dataset.layer),
    }).toEqual({ band: state, column: "7 / span 2", row: "auto", layers: [`${state}-fill`, `${state}-ring`] });
  });

  it("hides itself and its layers from assistive tech", () => {
    const { container } = render(NotesCalendarBand, {
      props: { kind: "weekend", column: "1 / -1", row: "2 / span 1" },
    });

    const hidden = [...container.querySelectorAll(".notes-calendar-band, .notes-calendar-band *")].map((element) =>
      element.getAttribute("aria-hidden"),
    );
    expect(hidden).toEqual(["true", "true", "true"]);
  });

  // An absolutely positioned grid child with no inset sits at its static position with no size, instead of filling its area.
  it("fills its grid area and takes no pointer", () => {
    const root = calendarStyleRules().band.find(
      (rule) => rule.container === null && rule.selector === ".notes-calendar-band",
    );

    expect({
      position: root?.declarations.get("position"),
      inset: root?.declarations.get("inset"),
      pointer: root?.declarations.get("pointer-events"),
      radius: root?.declarations.get("border-radius"),
    }).toEqual({ position: "absolute", inset: "0", pointer: "none", radius: "var(--_v-cell-radius)" });
  });
});
