import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, within } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationConditionSchema, type JournalDecorationCondition } from "@/decorations";
import { m } from "@/i18n";

import ConditionProperty from "./ConditionProperty.vue";

const renderConditionPropertyHost = () => h(ConditionProperty, { name: "c" });

afterEach(() => cleanup());

type Property = Extract<JournalDecorationCondition, { type: "property" }>;

function mount(initial: Property) {
  const exposed: { values: { c: Property } } = { values: { c: initial } };
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { c: initial },
        validationSchema: toTypedSchema(v.object({ c: decorationConditionSchema })),
      });
      exposed.values = form.values as typeof exposed.values;
      return renderConditionPropertyHost;
    },
  });
  render(Host);
  return exposed;
}

function rowFor(label: string): HTMLElement {
  const labelElement = screen.getByText(label);
  const row = labelElement.closest(".setting-item");
  if (!row) throw new Error(`No row containing label ${label}`);
  return row as HTMLElement;
}

describe("ConditionProperty", () => {
  it("updates the property name as the user types", async () => {
    const host = mount({ type: "property", name: "", valueType: "text", condition: "exists", value: "" });
    const nameRow = rowFor(m.decoration_condition_property_name_label());
    await userEvent.type(within(nameRow).getByRole("textbox"), "mood");
    expect(host.values.c.name).toBe("mood");
  });

  it("resets condition and value when switching value type to number", async () => {
    const host = mount({ type: "property", name: "mood", valueType: "text", condition: "contains", value: "good" });
    const typeRow = rowFor(m.decoration_condition_property_value_type_label());
    await userEvent.selectOptions(within(typeRow).getByRole("combobox"), "number");
    expect(host.values.c).toEqual({
      type: "property",
      name: "mood",
      valueType: "number",
      condition: "exists",
      value: 0,
    });
  });

  it("renders a number input when the value type is number", () => {
    mount({ type: "property", name: "x", valueType: "number", condition: "eq", value: 0 });
    const valueRow = rowFor(m.decoration_condition_property_value_label());
    expect(within(valueRow).getByRole("spinbutton")).toBeTruthy();
  });

  it("renders no value input for checkbox type", () => {
    mount({ type: "property", name: "x", valueType: "checkbox", condition: "is-true" });
    expect(screen.queryByText(m.decoration_condition_property_value_label())).toBeNull();
  });
});
