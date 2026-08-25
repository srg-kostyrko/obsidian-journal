import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { borderSideSchema, type BorderSide } from "@/decorations";

import StyleBorderSide from "./StyleBorderSide.vue";

const renderStyleBorderSideHost = () => h(StyleBorderSide, { name: "s" });

function mount(initial: BorderSide) {
  const exposed: { values: { s: BorderSide } } = { values: { s: initial } };
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { s: initial },
        validationSchema: toTypedSchema(v.object({ s: borderSideSchema })),
      });
      exposed.values = form.values as typeof exposed.values;
      return renderStyleBorderSideHost;
    },
  });
  render(Host);
  return exposed;
}

const blankSide = (): BorderSide => ({ show: false, width: 1, color: { type: "transparent" }, style: "solid" });

describe("StyleBorderSide", () => {
  it("updates width as the user types", async () => {
    const host = mount({ ...blankSide(), show: true });
    const number = screen.getByRole("spinbutton");
    await userEvent.clear(number);
    await userEvent.type(number, "3");
    expect(host.values.s.width).toBe(3);
  });
});
