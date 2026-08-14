import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import CanvasRegionSlots from "./CanvasRegionSlots.vue";

afterEach(() => cleanup());

describe("CanvasRegionSlots", () => {
  it("offers a region for every placement", () => {
    render(CanvasRegionSlots, { props: {} });
    expect(screen.getAllByRole("button")).toHaveLength(9);
  });

  it("emits the placement that was clicked", async () => {
    const { emitted } = render(CanvasRegionSlots, { props: {} });
    await userEvent.click(screen.getByRole("button", { name: "Bottom center" }));
    expect(emitted("choose")).toEqual([["center_bottom"]]);
  });

  it("marks the occupied placement as pressed", () => {
    render(CanvasRegionSlots, { props: { occupied: "left_top" } });
    expect(screen.getByRole("button", { name: "Top left" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("leaves the other placements unpressed", () => {
    render(CanvasRegionSlots, { props: { occupied: "left_top" } });
    expect(screen.getByRole("button", { name: "Center" }).getAttribute("aria-pressed")).toBe("false");
  });
});
