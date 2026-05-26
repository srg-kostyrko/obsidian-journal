import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationStyleSchema, type JournalDecorationStyle } from "@/decorations";
import { m } from "@/i18n";

import StyleBorder from "./StyleBorder.vue";

type Border = Extract<JournalDecorationStyle, { type: "border" }>;

const blankSide = () => ({ show: false, width: 1, color: { type: "transparent" as const }, style: "solid" });
const uniform: Border = {
  type: "border",
  border: "uniform",
  top: blankSide(),
  bottom: blankSide(),
  left: blankSide(),
  right: blankSide(),
};

const renderStyleBorderHost = () => h(StyleBorder, { name: "s" });

afterEach(() => cleanup());

function mount(initial: Border) {
  const exposed: { values: { s: Border } } = { values: { s: initial } };
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { s: initial },
        validationSchema: toTypedSchema(v.object({ s: decorationStyleSchema })),
      });
      exposed.values = form.values as typeof exposed.values;
      return renderStyleBorderHost;
    },
  });
  render(Host);
  return exposed;
}

describe("StyleBorder", () => {
  it("shows only one side editor in uniform mode", () => {
    mount(uniform);
    expect(screen.getAllByText(m.decoration_style_border_show_label())).toHaveLength(1);
  });

  it("shows four side editors in different mode", () => {
    mount({ ...uniform, border: "different" });
    expect(screen.getAllByText(m.decoration_style_border_show_label())).toHaveLength(4);
  });

  it("mirrors width changes from top to other sides in uniform mode", async () => {
    const host = mount(uniform);
    const number = screen.getByRole("spinbutton");
    await userEvent.clear(number);
    await userEvent.type(number, "5");
    expect(host.values.s.top.width).toBe(5);
    expect(host.values.s.bottom.width).toBe(5);
    expect(host.values.s.left.width).toBe(5);
    expect(host.values.s.right.width).toBe(5);
  });
});
