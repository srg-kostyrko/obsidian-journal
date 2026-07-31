import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";

import { decorationConditionSchema, type JournalDecorationCondition } from "@/decorations";
import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { InputSuggestService, MetadataTypeService, type VaultProperty } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";
import { createFakeHost, type FakeHost } from "@/infrastructure/host/internal/testing";
import { InternalObsidianAppToken } from "@/infrastructure/host/internal/tokens";

import ConditionProperty from "./ConditionProperty.vue";

const renderConditionPropertyHost = () => h(ConditionProperty, { name: "c" });

afterEach(() => cleanup());

type Property = Extract<JournalDecorationCondition, { type: "property" }>;

function mount(initial: Property, seed: (host: FakeHost) => void = () => undefined) {
  const exposed: { values: { c: Property } } = { values: { c: initial } };
  const host = createFakeHost();
  seed(host);
  const inputSuggest = new FakeInputSuggestService();
  const container = new Container();
  container.register(InternalObsidianAppToken).useValue(host.app);
  container.register(MetadataTypeService).useClass(MetadataTypeService);
  container.register(InputSuggestService).useValue(inputSuggest as unknown as InputSuggestService);
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
  const utilities = render(Host, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
  return { exposed, inputSuggest, ...utilities };
}

describe("ConditionProperty", () => {
  it("names its property-name field for assistive tech", () => {
    mount({ type: "property", name: "", valueType: "text", condition: "exists", value: "" });
    expect(screen.getByRole("textbox", { name: m.common_label_property_name() })).toBeTruthy();
  });

  it("names its condition dropdown for assistive tech", () => {
    mount({ type: "property", name: "", valueType: "text", condition: "exists", value: "" });
    expect(screen.getByRole("combobox", { name: m.decoration_condition_property_condition_label() })).toBeTruthy();
  });

  it("names its value field for assistive tech", () => {
    mount({ type: "property", name: "mood", valueType: "text", condition: "contains", value: "" });
    expect(screen.getByRole("textbox", { name: m.decoration_condition_property_value_label() })).toBeTruthy();
  });

  it("updates the property name as the user types", async () => {
    const { exposed } = mount({ type: "property", name: "", valueType: "text", condition: "exists", value: "" });
    await userEvent.type(screen.getAllByRole("textbox")[0], "mood");
    expect(exposed.values.c.name).toBe("mood");
  });

  it("fills the property name from a picked suggestion", async () => {
    const { exposed, inputSuggest } = mount(
      { type: "property", name: "", valueType: "text", condition: "exists", value: "" },
      (host) => host.setPropertyType("mood", "text"),
    );
    const handle = inputSuggest.handleFor<VaultProperty>(screen.getAllByRole("textbox")[0] as HTMLInputElement);
    handle.select(handle.query("mood")[0]);
    await nextTick();
    expect(exposed.values.c.name).toBe("mood");
  });

  it("derives the number value type from the vault property", async () => {
    const { exposed } = mount(
      { type: "property", name: "", valueType: "text", condition: "exists", value: "" },
      (host) => host.setPropertyType("rating", "number"),
    );
    await userEvent.type(screen.getAllByRole("textbox")[0], "rating");
    expect(exposed.values.c).toEqual({
      type: "property",
      name: "rating",
      valueType: "number",
      condition: "exists",
      value: 0,
    });
  });

  it("derives the date value type from the vault property", async () => {
    const { exposed, container } = mount(
      { type: "property", name: "", valueType: "text", condition: "exists", value: "" },
      (host) => host.setPropertyType("due", "date"),
    );
    await userEvent.type(screen.getAllByRole("textbox")[0], "due");
    expect(exposed.values.c.valueType).toBe("date");
    // Deriving the type resets the operator to "exists" (no operand); pick a comparison to reveal the value input.
    await userEvent.selectOptions(screen.getByRole("combobox"), "eq");
    expect(container.querySelector("input[type=date]")).toBeTruthy();
  });

  it("falls back to the text value type for an unknown property", async () => {
    const { exposed } = mount({ type: "property", name: "", valueType: "text", condition: "exists", value: "" });
    await userEvent.type(screen.getAllByRole("textbox")[0], "whatever");
    expect(exposed.values.c.valueType).toBe("text");
  });

  it("renders a number input when the value type is number", () => {
    mount({ type: "property", name: "x", valueType: "number", condition: "eq", value: 0 });
    expect(screen.getByRole("spinbutton")).toBeTruthy();
  });

  it("renders only the name input and operator for checkbox type", () => {
    mount({ type: "property", name: "x", valueType: "checkbox", condition: "is-true" });
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("hides the text value input for the exists operator", () => {
    mount({ type: "property", name: "x", valueType: "text", condition: "exists", value: "" });
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("hides the number value input for the does-not-exist operator", () => {
    mount({ type: "property", name: "x", valueType: "number", condition: "does-not-exist", value: 0 });
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });
});
