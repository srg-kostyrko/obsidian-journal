import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationStyleSchema, type JournalDecorationStyle } from "@/decorations";

import StyleCorner from "./StyleCorner.vue";

type Corner = Extract<JournalDecorationStyle, { type: "corner" }>;

const renderStyleCornerHost = () => h(StyleCorner, { name: "s" });

afterEach(() => cleanup());

function mount(initial: Corner) {
  const exposed: { values: { s: Corner } } = { values: { s: initial } };
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { s: initial },
        validationSchema: toTypedSchema(v.object({ s: decorationStyleSchema })),
      });
      exposed.values = form.values as typeof exposed.values;
      return renderStyleCornerHost;
    },
  });
  render(Host);
  return exposed;
}

describe("StyleCorner", () => {
  it("updates color when the user picks a different kind", async () => {
    const host = mount({ type: "corner", placement: "top-left", color: { type: "transparent" } });
    await userEvent.selectOptions(screen.getByRole("combobox"), "custom");
    expect(host.values.s.color).toEqual({ type: "custom", color: "#000000" });
  });
});
