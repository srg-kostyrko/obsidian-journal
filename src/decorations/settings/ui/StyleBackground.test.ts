import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationStyleSchema, type JournalDecorationStyle } from "@/decorations";

import StyleBackground from "./StyleBackground.vue";

type Background = Extract<JournalDecorationStyle, { type: "background" }>;

const renderStyleBackgroundHost = () => h(StyleBackground, { name: "s" });

afterEach(() => cleanup());

function mount(initial: Background) {
  const exposed: { values: { s: Background } } = { values: { s: initial } };
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { s: initial },
        validationSchema: toTypedSchema(v.object({ s: decorationStyleSchema })),
      });
      exposed.values = form.values as typeof exposed.values;
      return renderStyleBackgroundHost;
    },
  });
  render(Host);
  return exposed;
}

describe("StyleBackground", () => {
  it("updates color when the user picks a different kind", async () => {
    const host = mount({ type: "background", color: { type: "transparent" } });
    await userEvent.selectOptions(screen.getByRole("combobox"), "theme");
    expect(host.values.s.color).toEqual({ type: "theme", name: "" });
  });
});
