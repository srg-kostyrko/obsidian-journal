import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { defaultStyle } from "../../defaults";

import CanvasRegionBorder from "./CanvasRegionBorder.vue";

afterEach(() => cleanup());

const linked = defaultStyle("border");
const perSide = { ...defaultStyle("border"), border: "different" as const };

describe("CanvasRegionBorder", () => {
  describe("when the slot is empty", () => {
    it("offers a single ring region", () => {
      render(CanvasRegionBorder, { props: { activeSide: "top" } });
      expect(screen.getAllByRole("button")).toHaveLength(1);
    });
  });

  describe("when linked", () => {
    it("offers a single ring region", () => {
      render(CanvasRegionBorder, { props: { border: linked, activeSide: "top" } });
      expect(screen.getAllByRole("button")).toHaveLength(1);
    });

    it("emits the ring when it is clicked", async () => {
      const { emitted } = render(CanvasRegionBorder, { props: { border: linked, activeSide: "top" } });
      await userEvent.click(screen.getByRole("button", { name: "Cell outline" }));
      expect(emitted("chooseRing")).toHaveLength(1);
    });
  });

  describe("when per side", () => {
    it("offers a region for every side", () => {
      render(CanvasRegionBorder, { props: { border: perSide, activeSide: "top" } });
      expect(screen.getAllByRole("button")).toHaveLength(4);
    });

    it("emits the side that was clicked", async () => {
      const { emitted } = render(CanvasRegionBorder, { props: { border: perSide, activeSide: "top" } });
      await userEvent.click(screen.getByRole("button", { name: "Bottom" }));
      expect(emitted("chooseSide")).toEqual([["bottom"]]);
    });

    it("marks a shown side as pressed", () => {
      const border = { ...perSide, left: { ...perSide.left, show: true } };
      render(CanvasRegionBorder, { props: { border, activeSide: "top" } });
      expect(screen.getByRole("button", { name: "Left" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("marks a hidden side as unpressed", () => {
      const border = { ...perSide, right: { ...perSide.right, show: false } };
      render(CanvasRegionBorder, { props: { border, activeSide: "top" } });
      expect(screen.getByRole("button", { name: "Right" }).getAttribute("aria-pressed")).toBe("false");
    });
  });
});
