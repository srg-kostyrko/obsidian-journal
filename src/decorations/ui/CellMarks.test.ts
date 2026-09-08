import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/vue";
import { beforeAll, describe, expect, it } from "vitest";

import { initLocale } from "@/i18n";

import { PLACEMENTS, type CellMark, type Placement } from "../resolve-cell";
import { buildStyle } from "../testing";

import CellMarks from "./CellMarks.vue";

function shape(): CellMark {
  return buildStyle("shape", { placement_x: "right", placement_y: "top" });
}

function slots(count: number): Record<Placement, readonly CellMark[]> {
  const out = {} as Record<Placement, readonly CellMark[]>;
  for (const placement of PLACEMENTS) out[placement] = [];
  out.right_top = Array.from({ length: count }, shape);
  return out;
}

beforeAll(() => initLocale("en"));

describe("CellMarks", () => {
  it("draws no badge when a slot holds exactly the limit", () => {
    render(CellMarks, { props: { marks: slots(3), limit: 3 } });

    expect(screen.queryByTestId("mark-overflow")).toBeNull();
  });

  it("draws no badge when the limit is unlimited", () => {
    render(CellMarks, { props: { marks: slots(7), limit: 0 } });

    expect(screen.queryByTestId("mark-overflow")).toBeNull();
  });

  it("collapses the overflow into a badge counting the hidden marks", () => {
    const { container } = render(CellMarks, { props: { marks: slots(5), limit: 3 } });

    expect(screen.getByTestId("mark-overflow").textContent).toContain("+3");
    expect(container.querySelectorAll(".place-right_top .shape-decoration")).toHaveLength(2);
  });

  it("draws the badge before the surviving marks", () => {
    const { container } = render(CellMarks, { props: { marks: slots(5), limit: 3 } });

    const slot = container.querySelector(".place-right_top");
    expect((slot?.firstElementChild as HTMLElement | null)?.dataset.testid).toBe("mark-overflow");
  });

  it("shows every mark in the slot when the badge is hovered, not only the hidden ones", async () => {
    render(CellMarks, { props: { marks: slots(5), limit: 3 } });
    expect(screen.queryByTestId("mark-overflow-popover")).toBeNull();

    await userEvent.hover(screen.getByTestId("mark-overflow"));

    const popover = screen.getByTestId("mark-overflow-popover");
    expect(popover.querySelectorAll(".shape-decoration")).toHaveLength(5);
  });

  it("hides the popover again when the pointer leaves the badge", async () => {
    render(CellMarks, { props: { marks: slots(5), limit: 3 } });
    await userEvent.hover(screen.getByTestId("mark-overflow"));

    await userEvent.unhover(screen.getByTestId("mark-overflow"));

    expect(screen.queryByTestId("mark-overflow-popover")).toBeNull();
  });

  it("keeps the badge out of the accessibility tree", () => {
    render(CellMarks, { props: { marks: slots(5), limit: 3 } });

    expect(screen.getByTestId("mark-overflow").getAttribute("aria-hidden")).toBe("true");
  });
});
