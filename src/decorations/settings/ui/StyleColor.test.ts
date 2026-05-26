import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationStyleSchema, type JournalDecorationStyle } from "@/decorations";

import StyleColor from "./StyleColor.vue";

type ColorStyle = Extract<JournalDecorationStyle, { type: "color" }>;

const renderStyleColorHost = () => h(StyleColor, { name: "s" });

afterEach(() => cleanup());

function mount(initial: ColorStyle) {
  const exposed: { values: { s: ColorStyle } } = { values: { s: initial } };
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { s: initial },
        validationSchema: toTypedSchema(v.object({ s: decorationStyleSchema })),
      });
      exposed.values = form.values as typeof exposed.values;
      return renderStyleColorHost;
    },
  });
  render(Host);
  return exposed;
}

describe("StyleColor", () => {
  it("updates color when the user picks a different kind", async () => {
    const host = mount({ type: "color", color: { type: "transparent" } });
    await userEvent.selectOptions(screen.getByRole("combobox"), "custom");
    expect(host.values.s.color).toEqual({ type: "custom", color: "#000000" });
  });
});
