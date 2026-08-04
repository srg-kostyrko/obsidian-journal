import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import DecorationLayerStrip from "./DecorationLayerStrip.vue";

import type { StyleSlotKey } from "../../style-slots";

afterEach(() => cleanup());

function renderStrip(modelValue: StyleSlotKey, occupied: StyleSlotKey[] = []) {
  return render(DecorationLayerStrip, { props: { modelValue, occupied: new Set(occupied) } });
}

describe("DecorationLayerStrip", () => {
  it("offers a chip for every style slot", () => {
    renderStrip("background");
    expect(screen.getAllByRole("button")).toHaveLength(6);
  });

  it("marks the active layer as pressed", () => {
    renderStrip("shape");
    expect(screen.getByRole("button", { name: "Shape" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("emits the chosen layer when a chip is clicked", async () => {
    const { emitted } = renderStrip("background");
    await userEvent.click(screen.getByRole("button", { name: "Corner" }));
    expect(emitted("update:modelValue")).toEqual([["corner"]]);
  });

  it("names an occupied chip as in use", () => {
    renderStrip("background", ["icon"]);
    expect(screen.getByRole("button", { name: "Icon, in use" })).toBeTruthy();
  });

  it("names an empty chip by its layer alone", () => {
    renderStrip("background", ["icon"]);
    expect(screen.getByRole("button", { name: "Corner" })).toBeTruthy();
  });
});
