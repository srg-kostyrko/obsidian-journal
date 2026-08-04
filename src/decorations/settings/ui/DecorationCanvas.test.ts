import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationSchema, type JournalDecoration } from "@/decorations";

import DecorationCanvas from "./DecorationCanvas.vue";

afterEach(() => cleanup());

function mount(styles: JournalDecoration["styles"] = []) {
  const exposed = {} as { values: JournalDecoration };
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
  render(Host);
  return exposed;
}

describe("DecorationCanvas", () => {
  it("creates a background when the empty cell is clicked", async () => {
    const host = mount();
    await userEvent.click(screen.getByRole("button", { name: "Cell background" }));
    expect(host.values.styles.map((s) => s.type)).toEqual(["background"]);
  });

  it("creates a shape at the position that was clicked", async () => {
    const host = mount();
    await userEvent.click(screen.getByRole("button", { name: "Shape" }));
    await userEvent.click(screen.getByRole("button", { name: "Top left" }));
    expect(host.values.styles.at(0)).toMatchObject({
      type: "shape",
      placement_x: "left",
      placement_y: "top",
    });
  });

  it("moves an existing shape rather than adding a second", async () => {
    const host = mount();
    await userEvent.click(screen.getByRole("button", { name: "Shape" }));
    await userEvent.click(screen.getByRole("button", { name: "Top left" }));
    await userEvent.click(screen.getByRole("button", { name: "Bottom right" }));
    expect(host.values.styles).toHaveLength(1);
  });

  it("places the moved shape at the new position", async () => {
    const host = mount();
    await userEvent.click(screen.getByRole("button", { name: "Shape" }));
    await userEvent.click(screen.getByRole("button", { name: "Top left" }));
    await userEvent.click(screen.getByRole("button", { name: "Bottom right" }));
    expect(host.values.styles.at(0)).toMatchObject({ placement_x: "right", placement_y: "bottom" });
  });

  it("moves an existing corner rather than adding a second", async () => {
    const host = mount();
    await userEvent.click(screen.getByRole("button", { name: "Corner" }));
    await userEvent.click(screen.getByRole("button", { name: "Top left" }));
    await userEvent.click(screen.getByRole("button", { name: "Bottom right" }));
    expect(host.values.styles).toHaveLength(1);
  });

  it("empties the slot when the layer is removed", async () => {
    const host = mount();
    await userEvent.click(screen.getByRole("button", { name: "Cell background" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(host.values.styles).toEqual([]);
  });

  it("shows a hint while the active layer is empty", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Icon" }));
    expect(screen.getByText("Click a position to add an icon.")).toBeTruthy();
  });

  it("only exposes the active layer's regions", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Corner" }));
    expect(screen.queryByRole("button", { name: "Middle left" })).toBeNull();
  });

  describe("border", () => {
    it("creates a linked border when the ring is clicked", async () => {
      const host = mount();
      await userEvent.click(screen.getByRole("button", { name: "Border" }));
      await userEvent.click(screen.getByRole("button", { name: "Cell outline" }));
      expect(host.values.styles.at(0)).toMatchObject({ type: "border", border: "uniform" });
    });

    it("switches the stored mode when per side is chosen", async () => {
      const host = mount();
      await userEvent.click(screen.getByRole("button", { name: "Border" }));
      await userEvent.click(screen.getByRole("button", { name: "Cell outline" }));
      await userEvent.click(screen.getByRole("radio", { name: "Per side" }));
      expect(host.values.styles.at(0)).toMatchObject({ border: "different" });
    });

    it("turns a hidden side on when its edge is clicked", async () => {
      const host = mount([
        {
          type: "border",
          border: "different",
          top: { show: false, width: 1, color: { type: "transparent" }, style: "solid" },
          right: { show: false, width: 1, color: { type: "transparent" }, style: "solid" },
          bottom: { show: false, width: 1, color: { type: "transparent" }, style: "solid" },
          left: { show: true, width: 1, color: { type: "theme", name: "text-accent" }, style: "solid" },
        },
      ]);
      await userEvent.click(screen.getByRole("button", { name: "Border, in use" }));
      await userEvent.click(screen.getByRole("button", { name: "Top" }));
      const border = host.values.styles.at(0);
      expect(border?.type === "border" && border.top.show).toBe(true);
    });

    it("empties the border slot when the last shown side is removed", async () => {
      const host = mount([
        {
          type: "border",
          border: "different",
          top: { show: false, width: 1, color: { type: "transparent" }, style: "solid" },
          right: { show: false, width: 1, color: { type: "transparent" }, style: "solid" },
          bottom: { show: false, width: 1, color: { type: "transparent" }, style: "solid" },
          left: { show: true, width: 1, color: { type: "theme", name: "text-accent" }, style: "solid" },
        },
      ]);
      await userEvent.click(screen.getByRole("button", { name: "Border, in use" }));
      await userEvent.click(screen.getByRole("button", { name: "Left" }));
      await userEvent.click(screen.getByRole("button", { name: "Remove" }));
      expect(host.values.styles).toEqual([]);
    });
  });

  describe("switching layers", () => {
    it("keeps the previous layer's fields after adding a second layer", async () => {
      const host = mount();
      await userEvent.click(screen.getByRole("button", { name: "Cell background" }));
      await userEvent.click(screen.getByRole("button", { name: "Shape" }));
      await userEvent.click(screen.getByRole("button", { name: "Top left" }));
      const background = host.values.styles.find((s) => s.type === "background");
      expect(background).toHaveProperty("color");
    });

    it("leaves a decoration that parses cleanly after adding a second layer", async () => {
      const host = mount();
      await userEvent.click(screen.getByRole("button", { name: "Cell background" }));
      await userEvent.click(screen.getByRole("button", { name: "Shape" }));
      await userEvent.click(screen.getByRole("button", { name: "Top left" }));
      expect(v.safeParse(decorationSchema, host.values).success).toBe(true);
    });

    it("keeps the active border side's fields after switching to another layer", async () => {
      const host = mount();
      await userEvent.click(screen.getByRole("button", { name: "Border" }));
      await userEvent.click(screen.getByRole("button", { name: "Cell outline" }));
      await userEvent.click(screen.getByRole("button", { name: "Shape" }));
      await userEvent.click(screen.getByRole("button", { name: "Top left" }));
      expect(v.safeParse(decorationSchema, host.values).success).toBe(true);
    });
  });
});
