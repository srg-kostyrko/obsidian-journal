import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import DecorationLayerStrip from "./DecorationLayerStrip.vue";

import type { StyleSlotKey } from "../../style-slots";

afterEach(() => cleanup());

function renderStrip(modelValue: StyleSlotKey, occupied: StyleSlotKey[] = []) {
  return render(DecorationLayerStrip, {
    props: { modelValue, occupied: new Set(occupied), panelId: "inspector" },
  });
}

// Border is third of six, so every key pressed from it has somewhere to go without wrapping.
async function pressFromBorder(key: string): Promise<void> {
  screen.getByRole("tab", { name: "Border" }).focus();
  await userEvent.keyboard(key);
}

describe("DecorationLayerStrip", () => {
  it("offers a tab for every style slot", () => {
    renderStrip("background");
    expect(screen.getAllByRole("tab")).toHaveLength(6);
  });

  it("marks the active layer as selected", () => {
    renderStrip("shape");
    expect(screen.getByRole("tab", { name: "Shape" }).getAttribute("aria-selected")).toBe("true");
  });

  it("emits the chosen layer when a tab is clicked", async () => {
    const { emitted } = renderStrip("background");
    await userEvent.click(screen.getByRole("tab", { name: "Corner" }));
    expect(emitted("update:modelValue")).toEqual([["corner"]]);
  });

  it("names an occupied tab as in use", () => {
    renderStrip("background", ["icon"]);
    expect(screen.getByRole("tab", { name: "Icon, in use" })).toBeTruthy();
  });

  it("names an empty tab by its layer alone", () => {
    renderStrip("background", ["icon"]);
    expect(screen.getByRole("tab", { name: "Corner" })).toBeTruthy();
  });

  describe("keyboard navigation", () => {
    it.each([
      { key: "{ArrowRight}", layer: "shape" },
      { key: "{ArrowLeft}", layer: "color" },
      { key: "{Home}", layer: "background" },
      { key: "{End}", layer: "corner" },
    ])("selects the $layer layer on $key", async ({ key, layer }) => {
      const { emitted } = renderStrip("border");
      await pressFromBorder(key);
      expect(emitted("update:modelValue")).toEqual([[layer]]);
    });

    it("wraps past the last layer to the first", async () => {
      const { emitted } = renderStrip("corner");
      screen.getByRole("tab", { name: "Corner" }).focus();
      await userEvent.keyboard("{ArrowRight}");
      expect(emitted("update:modelValue")).toEqual([["background"]]);
    });

    it("wraps before the first layer to the last", async () => {
      const { emitted } = renderStrip("background");
      screen.getByRole("tab", { name: "Background" }).focus();
      await userEvent.keyboard("{ArrowLeft}");
      expect(emitted("update:modelValue")).toEqual([["corner"]]);
    });

    it("moves focus to the tab it selects", async () => {
      renderStrip("border");
      await pressFromBorder("{ArrowRight}");
      expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Shape" }));
    });

    it("leaves the layers on a single tab stop", async () => {
      renderStrip("shape");
      await userEvent.tab();
      expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Shape" }));
    });
  });
});
