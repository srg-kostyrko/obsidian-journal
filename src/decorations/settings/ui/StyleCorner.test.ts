import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, within } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationStyleSchema, type JournalDecorationStyle } from "@/decorations";
import { m } from "@/i18n";

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

function rowFor(label: string): HTMLElement {
  const labelElement = screen.getByText(label);
  const row = labelElement.closest(".setting-item");
  if (!row) throw new Error(`No row for ${label}`);
  return row as HTMLElement;
}

describe("StyleCorner", () => {
  it("updates placement when a different corner is chosen", async () => {
    const host = mount({ type: "corner", placement: "top-left", color: { type: "transparent" } });
    const placementRow = rowFor(m.decoration_style_corner_placement_label());
    await userEvent.selectOptions(within(placementRow).getByRole("combobox"), "bottom-right");
    expect(host.values.s.placement).toBe("bottom-right");
  });
});
