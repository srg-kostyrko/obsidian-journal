import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, within } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationStyleSchema, type JournalDecorationStyle } from "@/decorations";
import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { InputSuggestService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";

import StyleIcon from "./StyleIcon.vue";

type Icon = Extract<JournalDecorationStyle, { type: "icon" }>;

const initialIcon: Icon = {
  type: "icon",
  icon: "",
  placement_x: "center",
  placement_y: "middle",
  color: { type: "transparent" },
  size: 0.5,
};

const renderStyleIconHost = () => h(StyleIcon, { name: "s" });

afterEach(() => cleanup());

function mount(initial: Icon) {
  const exposed: { values: { s: Icon } } = { values: { s: initial } };
  const container = new Container();
  container.register(InputSuggestService).useValue(new FakeInputSuggestService() as unknown as InputSuggestService);
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { s: initial },
        validationSchema: toTypedSchema(v.object({ s: decorationStyleSchema })),
      });
      exposed.values = form.values as typeof exposed.values;
      return renderStyleIconHost;
    },
  });
  render(Host, {
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
          },
        },
      ],
    },
  });
  return exposed;
}

function rowFor(label: string): HTMLElement {
  const labelElement = screen.getByText(label);
  const row = labelElement.closest(".setting-item");
  if (!row) throw new Error(`No row for ${label}`);
  return row as HTMLElement;
}

describe("StyleIcon", () => {
  it("updates the size as the user changes the number", async () => {
    const host = mount(initialIcon);
    const sizeRow = rowFor(m.decoration_style_icon_size_label());
    const number = within(sizeRow).getByRole("spinbutton");
    await userEvent.clear(number);
    await userEvent.type(number, "0.9");
    expect(host.values.s.size).toBeCloseTo(0.9);
  });
});
