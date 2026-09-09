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

  it("draws the badge after the surviving marks", () => {
    const { container } = render(CellMarks, { props: { marks: slots(5), limit: 3 } });

    const slot = container.querySelector(".place-right_top");
    expect((slot?.lastElementChild as HTMLElement | null)?.dataset.testid).toBe("mark-overflow");
  });

  it("shows only the marks the badge hides when it is hovered", async () => {
    render(CellMarks, { props: { marks: slots(5), limit: 3 } });
    expect(screen.queryByTestId("mark-overflow-popover")).toBeNull();

    await userEvent.hover(screen.getByTestId("mark-overflow"));

    const popover = screen.getByTestId("mark-overflow-popover");
    expect(popover.querySelectorAll(".shape-decoration")).toHaveLength(3);
  });

  it("places the popover against the badge before showing it", async () => {
    render(CellMarks, { props: { marks: slots(5), limit: 3 } });

    await userEvent.hover(screen.getByTestId("mark-overflow"));

    expect(screen.getByTestId("mark-overflow-popover").className).toContain("mark-overflow__popover--placed");
  });

  it("hides the popover again when the pointer leaves the badge", async () => {
    render(CellMarks, { props: { marks: slots(5), limit: 3 } });
    await userEvent.hover(screen.getByTestId("mark-overflow"));

    await userEvent.unhover(screen.getByTestId("mark-overflow"));

    expect(screen.queryByTestId("mark-overflow-popover")).toBeNull();
  });

  // Both halves of the tooltip handover: Obsidian resolves a tooltip to the nearest `[aria-label]`
  // ancestor, so an empty one on the badge keeps the cell's date tooltip from opening over the
  // popover, and a pointerout with no relatedTarget dismisses one that is already on screen.
  it("carries an empty tooltip label of its own", () => {
    render(CellMarks, { props: { marks: slots(5), limit: 3 } });

    expect(screen.getByTestId("mark-overflow").getAttribute("aria-label")).toBe("");
  });

  it("dismisses a tooltip already on screen when the badge takes the hover", async () => {
    render(CellMarks, { props: { marks: slots(5), limit: 3 } });
    const badge = screen.getByTestId("mark-overflow");
    const dismissals: PointerEvent[] = [];
    badge.addEventListener("pointerout", (event) => dismissals.push(event));

    await userEvent.hover(badge);

    const dismissal = dismissals.find((event) => event.relatedTarget === null);
    expect(dismissal?.bubbles).toBe(true);
  });

  it("keeps the badge out of the accessibility tree", () => {
    render(CellMarks, { props: { marks: slots(5), limit: 3 } });

    expect(screen.getByTestId("mark-overflow").getAttribute("aria-hidden")).toBe("true");
  });
});
