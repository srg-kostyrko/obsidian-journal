import userEvent from "@testing-library/user-event";
import { render, screen, within } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationStyleSchema, type JournalDecorationStyle } from "@/decorations";
import { defaultStyle } from "@/decorations/defaults";
import { m } from "@/i18n";

import StyleShape from "./StyleShape.vue";

type Shape = Extract<JournalDecorationStyle, { type: "shape" }>;

const initialShape: Shape = {
  type: "shape",
  size: 0.4,
  shape: "square",
  color: { type: "transparent" },
  placement_x: "center",
  placement_y: "middle",
};

const renderStyleShapeHost = () => h(StyleShape, { name: "s" });

function mount(initial: Shape) {
  const exposed: { values: { s: Shape } } = { values: { s: initial } };
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { s: initial },
        validationSchema: toTypedSchema(v.object({ s: decorationStyleSchema })),
      });
      exposed.values = form.values as typeof exposed.values;
      return renderStyleShapeHost;
    },
  });
  render(Host);
  return exposed;
}

function rowFor(label: string): HTMLElement {
  const labelElement = screen.getByText(label);
  const row = labelElement.closest(".setting-item");
  if (!row) throw new Error(`No row for ${label}`);
  return row as HTMLElement;
}

describe("StyleShape", () => {
  it("updates shape when a new shape is selected", async () => {
    const host = mount(initialShape);
    const shapeRow = rowFor(m.decoration_style_shape_shape_label());
    await userEvent.selectOptions(within(shapeRow).getByRole("combobox"), "circle");
    expect(host.values.s.shape).toBe("circle");
  });

  // The browser refuses to submit a form holding a value off the input's step, so a default the
  // step cannot reach leaves Save doing nothing.
  it("accepts the size a new shape starts at", () => {
    mount({ ...initialShape, size: defaultStyle("shape").size });
    const input = within(rowFor(m.common_label_size())).getByRole<HTMLInputElement>("spinbutton");
    // Not input.validity: jsdom's step check has no floating-point tolerance, where Chromium's does.
    const steps = (defaultStyle("shape").size - Number(input.min)) / Number(input.step);
    expect(steps).toBeCloseTo(Math.round(steps), 6);
  });

  it("updates size as the user changes the number", async () => {
    const host = mount(initialShape);
    const sizeRow = rowFor(m.common_label_size());
    const number = within(sizeRow).getByRole("spinbutton");
    await userEvent.clear(number);
    await userEvent.type(number, "0.8");
    expect(host.values.s.size).toBeCloseTo(0.8);
  });
});
