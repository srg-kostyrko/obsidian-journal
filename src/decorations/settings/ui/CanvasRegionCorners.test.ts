import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import CanvasRegionCorners from "./CanvasRegionCorners.vue";

describe("CanvasRegionCorners", () => {
  it("offers a region for every corner", () => {
    render(CanvasRegionCorners, { props: {} });
    expect(screen.getAllByRole("button")).toHaveLength(4);
  });

  it("emits the corner that was clicked", async () => {
    const { emitted } = render(CanvasRegionCorners, { props: {} });
    await userEvent.click(screen.getByRole("button", { name: "Bottom right" }));
    expect(emitted("choose")).toEqual([["bottom-right"]]);
  });

  it("marks the occupied corner as pressed", () => {
    render(CanvasRegionCorners, { props: { occupied: "top-right" } });
    expect(screen.getByRole("button", { name: "Top right" }).getAttribute("aria-pressed")).toBe("true");
  });
});
