import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationStyleSchema, type JournalDecorationStyle } from "@/decorations";

import { defaultStyle } from "../../defaults";

import StyleBorder from "./StyleBorder.vue";

type Border = Extract<JournalDecorationStyle, { type: "border" }>;

const renderStyleBorderHost = () => h(StyleBorder, { name: "s", side: "top" });

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
  it("switches the stored mode to per side", async () => {
    const host = mount({ ...defaultStyle("border") });
    await userEvent.click(screen.getByRole("radio", { name: "Per side" }));
    expect(host.values.s.border).toBe("different");
  });

  it("turns every side on when switching back to linked", async () => {
    const host = mount({
      ...defaultStyle("border"),
      border: "different",
      top: { show: false, width: 1, color: { type: "transparent" }, style: "solid" },
    });
    await userEvent.click(screen.getByRole("radio", { name: "Linked" }));
    expect(host.values.s.top.show).toBe(true);
  });

  it("edits only the named side", async () => {
    const host = mount({ ...defaultStyle("border"), border: "different" });
    await userEvent.clear(screen.getByRole("spinbutton"));
    await userEvent.type(screen.getByRole("spinbutton"), "4");
    expect(host.values.s.top.width).toBe(4);
    expect(host.values.s.left.width).toBe(1);
  });

  it("propagates a width edit in linked mode to the other sides", async () => {
    const host = mount({ ...defaultStyle("border") });
    await userEvent.clear(screen.getByRole("spinbutton"));
    await userEvent.type(screen.getByRole("spinbutton"), "5");
    expect(host.values.s.left.width).toBe(5);
  });
});
