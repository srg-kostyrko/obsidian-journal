import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationSchema, type JournalDecoration } from "@/decorations";
import { m } from "@/i18n";
import { testContainer } from "@/testing";

import { STYLE_SLOT_KEYS, type StyleSlotKey } from "../../style-slots";

import DecorationCanvas from "./DecorationCanvas.vue";

function layerChipLabel(type: StyleSlotKey, occupied: boolean): string {
  return m.decoration_layer_chip_label({ type, state: occupied ? "occupied" : "empty" });
}

// Each layer creates its style through a different gesture: a whole-cell region for
// background/color, a 3x3 mark slot for shape/icon, a corner, or the border ring.
const createStyleIn: Record<StyleSlotKey, () => Promise<void>> = {
  background: () => userEvent.click(screen.getByRole("button", { name: "Cell background" })),
  color: () => userEvent.click(screen.getByRole("button", { name: "Cell text" })),
  border: () => userEvent.click(screen.getByRole("button", { name: "Cell outline" })),
  shape: () => userEvent.click(screen.getByRole("button", { name: "Top left" })),
  icon: () => userEvent.click(screen.getByRole("button", { name: "Top left" })),
  corner: () => userEvent.click(screen.getByRole("button", { name: "Top left" })),
};

async function mount(styles: JournalDecoration["styles"] = []) {
  const exposed = {} as { values: JournalDecoration };
  const harness = await testContainer();
  const Host = defineComponent({
    setup() {
      const form = useForm<JournalDecoration>({
        initialValues: { mode: "and", conditions: [], styles },
        validationSchema: toTypedSchema(decorationSchema),
      });
      exposed.values = form.values;
      return () => h(DecorationCanvas, { name: "styles", styles: form.values.styles });
    },
  });
  harness.render(Host);
  return exposed;
}

describe("DecorationCanvas", () => {
  it("opens an existing decoration on its first occupied layer", async () => {
    await mount([{ type: "corner", placement: "top-left", color: { type: "theme", name: "text-accent" } }]);
    expect(screen.getByRole("tab", { name: layerChipLabel("corner", true) }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  // Strip order, not the order the styles were authored in: the tab that lights up is the
  // leftmost filled one, which is what the user sees rather than what data.json happens to list.
  it("opens on the leftmost occupied layer rather than the first authored style", async () => {
    await mount([
      { type: "corner", placement: "top-left", color: { type: "theme", name: "text-accent" } },
      { type: "background", color: { type: "theme", name: "interactive-accent" } },
    ]);
    expect(screen.getByRole("tab", { name: layerChipLabel("background", true) }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  it("creates a background when the empty cell is clicked", async () => {
    const host = await mount();
    await userEvent.click(screen.getByRole("button", { name: "Cell background" }));
    expect(host.values.styles.map((s) => s.type)).toEqual(["background"]);
  });

  it("creates a shape at the position that was clicked", async () => {
    const host = await mount();
    await userEvent.click(screen.getByRole("tab", { name: "Shape" }));
    await userEvent.click(screen.getByRole("button", { name: "Top left" }));
    expect(host.values.styles.at(0)).toMatchObject({
      type: "shape",
      placement_x: "left",
      placement_y: "top",
    });
  });

  it("moves an existing shape rather than adding a second", async () => {
    const host = await mount();
    await userEvent.click(screen.getByRole("tab", { name: "Shape" }));
    await userEvent.click(screen.getByRole("button", { name: "Top left" }));
    await userEvent.click(screen.getByRole("button", { name: "Bottom right" }));
    expect(host.values.styles).toHaveLength(1);
  });

  it("places the moved shape at the new position", async () => {
    const host = await mount();
    await userEvent.click(screen.getByRole("tab", { name: "Shape" }));
    await userEvent.click(screen.getByRole("button", { name: "Top left" }));
    await userEvent.click(screen.getByRole("button", { name: "Bottom right" }));
    expect(host.values.styles.at(0)).toMatchObject({ placement_x: "right", placement_y: "bottom" });
  });

  it("moves an existing corner rather than adding a second", async () => {
    const host = await mount();
    await userEvent.click(screen.getByRole("tab", { name: "Corner" }));
    await userEvent.click(screen.getByRole("button", { name: "Top left" }));
    await userEvent.click(screen.getByRole("button", { name: "Bottom right" }));
    expect(host.values.styles).toHaveLength(1);
  });

  it("empties the slot when the layer is removed", async () => {
    const host = await mount();
    await userEvent.click(screen.getByRole("button", { name: "Cell background" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(host.values.styles).toEqual([]);
  });

  it("shows a hint while the active layer is empty", async () => {
    await mount();
    await userEvent.click(screen.getByRole("tab", { name: "Icon" }));
    expect(screen.getByText("Click a position to add an icon.")).toBeTruthy();
  });

  it("only exposes the active layer's regions", async () => {
    await mount();
    await userEvent.click(screen.getByRole("tab", { name: "Corner" }));
    expect(screen.queryByRole("button", { name: "Middle left" })).toBeNull();
  });

  describe("border", () => {
    it("creates a linked border when the ring is clicked", async () => {
      const host = await mount();
      await userEvent.click(screen.getByRole("tab", { name: "Border" }));
      await userEvent.click(screen.getByRole("button", { name: "Cell outline" }));
      expect(host.values.styles.at(0)).toMatchObject({ type: "border", border: "uniform" });
    });

    it("switches the stored mode when per side is chosen", async () => {
      const host = await mount();
      await userEvent.click(screen.getByRole("tab", { name: "Border" }));
      await userEvent.click(screen.getByRole("button", { name: "Cell outline" }));
      await userEvent.click(screen.getByRole("radio", { name: "Per side" }));
      expect(host.values.styles.at(0)).toMatchObject({ border: "different" });
    });

    it("turns a hidden side on when its edge is clicked", async () => {
      const host = await mount([
        {
          type: "border",
          border: "different",
          top: { show: false, width: 1, color: { type: "transparent" }, style: "solid" },
          right: { show: false, width: 1, color: { type: "transparent" }, style: "solid" },
          bottom: { show: false, width: 1, color: { type: "transparent" }, style: "solid" },
          left: { show: true, width: 1, color: { type: "theme", name: "text-accent" }, style: "solid" },
        },
      ]);
      await userEvent.click(screen.getByRole("tab", { name: "Border, in use" }));
      await userEvent.click(screen.getByRole("button", { name: "Top" }));
      const border = host.values.styles.at(0);
      expect(border?.type === "border" && border.top.show).toBe(true);
    });

    it("empties the border slot when the last shown side is removed", async () => {
      const host = await mount([
        {
          type: "border",
          border: "different",
          top: { show: false, width: 1, color: { type: "transparent" }, style: "solid" },
          right: { show: false, width: 1, color: { type: "transparent" }, style: "solid" },
          bottom: { show: false, width: 1, color: { type: "transparent" }, style: "solid" },
          left: { show: true, width: 1, color: { type: "theme", name: "text-accent" }, style: "solid" },
        },
      ]);
      await userEvent.click(screen.getByRole("tab", { name: "Border, in use" }));
      await userEvent.click(screen.getByRole("button", { name: "Left" }));
      await userEvent.click(screen.getByRole("button", { name: "Remove" }));
      expect(host.values.styles).toEqual([]);
    });

    // activeSide starts on "top" and only chooseSide ever moves it, so opening a border whose
    // only shown side is something else — without first clicking that side's edge — must still
    // reconcile before Remove runs, or Remove silently rewrites the already-hidden "top" side.
    it("removes the only shown side when the layer is opened without selecting it first", async () => {
      const host = await mount([
        {
          type: "border",
          border: "different",
          top: { show: false, width: 1, color: { type: "transparent" }, style: "solid" },
          right: { show: false, width: 1, color: { type: "transparent" }, style: "solid" },
          bottom: { show: true, width: 1, color: { type: "theme", name: "text-accent" }, style: "solid" },
          left: { show: false, width: 1, color: { type: "transparent" }, style: "solid" },
        },
      ]);
      await userEvent.click(screen.getByRole("tab", { name: "Border, in use" }));
      await userEvent.click(screen.getByRole("button", { name: "Remove" }));
      expect(host.values.styles).toEqual([]);
    });
  });

  describe("switching layers", () => {
    it("keeps the previous layer's fields after adding a second layer", async () => {
      const host = await mount();
      await userEvent.click(screen.getByRole("button", { name: "Cell background" }));
      await userEvent.click(screen.getByRole("tab", { name: "Shape" }));
      await userEvent.click(screen.getByRole("button", { name: "Top left" }));
      const background = host.values.styles.find((s) => s.type === "background");
      expect(background).toHaveProperty("color");
    });

    it("leaves a decoration that parses cleanly after adding a second layer", async () => {
      const host = await mount();
      await userEvent.click(screen.getByRole("button", { name: "Cell background" }));
      await userEvent.click(screen.getByRole("tab", { name: "Shape" }));
      await userEvent.click(screen.getByRole("button", { name: "Top left" }));
      expect(v.safeParse(decorationSchema, host.values).success).toBe(true);
    });

    it("keeps the active border side's fields after switching to another layer", async () => {
      const host = await mount();
      await userEvent.click(screen.getByRole("tab", { name: "Border" }));
      await userEvent.click(screen.getByRole("button", { name: "Cell outline" }));
      await userEvent.click(screen.getByRole("tab", { name: "Shape" }));
      await userEvent.click(screen.getByRole("button", { name: "Top left" }));
      expect(v.safeParse(decorationSchema, host.values).success).toBe(true);
    });

    // Every Style*.vue leaf sets keepValueOnUnmount so vee-validate doesn't prune its fields when
    // its inspector unmounts on a layer switch. Only exercising a couple of leaves would let the
    // flag silently go missing from the rest, so this covers all six.
    it.each(STYLE_SLOT_KEYS)("keeps a %s style parseable after switching layers", async (layer) => {
      const host = await mount();
      await userEvent.click(screen.getByRole("tab", { name: layerChipLabel(layer, false) }));
      await createStyleIn[layer]();
      const other = STYLE_SLOT_KEYS.find((key) => key !== layer);
      if (other === undefined) throw new Error("expected a second layer to switch to");
      await userEvent.click(screen.getByRole("tab", { name: layerChipLabel(other, false) }));
      await createStyleIn[other]();
      expect(v.safeParse(decorationSchema, host.values).success).toBe(true);
    });

    it("keeps the second style parseable after removing the first", async () => {
      const host = await mount();
      await userEvent.click(screen.getByRole("tab", { name: layerChipLabel("background", false) }));
      await createStyleIn.background();
      await userEvent.click(screen.getByRole("tab", { name: layerChipLabel("shape", false) }));
      await createStyleIn.shape();
      await userEvent.click(screen.getByRole("tab", { name: layerChipLabel("background", true) }));
      await userEvent.click(screen.getByRole("button", { name: "Remove" }));
      expect(host.values.styles).toHaveLength(1);
      expect(v.safeParse(decorationSchema, host.values).success).toBe(true);
    });
  });
});
