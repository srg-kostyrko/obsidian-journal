import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { m } from "@/i18n";

import ConditionTitle from "./ConditionTitle.vue";

const renderConditionTitleHost = () => h(ConditionTitle, { name: "c" });

interface InitialTitle {
  condition: "contains" | "starts-with" | "ends-with";
  value: string;
}

function mount(initial: InitialTitle) {
  const exposed: { values: { c: InitialTitle } } = { values: { c: initial } };
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { c: initial },
        validationSchema: toTypedSchema(v.object({ c: v.object({ condition: v.string(), value: v.string() }) })),
      });
      exposed.values = form.values as typeof exposed.values;
      return renderConditionTitleHost;
    },
  });
  render(Host);
  return exposed;
}

describe("ConditionTitle", () => {
  it("names its value field for assistive tech", () => {
    mount({ condition: "contains", value: "" });
    expect(screen.getByRole("textbox", { name: m.decoration_condition_title_value_label() })).toBeTruthy();
  });

  it("names its operator dropdown for assistive tech", () => {
    mount({ condition: "contains", value: "" });
    expect(screen.getByRole("combobox", { name: m.decoration_condition_op_label() })).toBeTruthy();
  });

  it("updates value as the user types", async () => {
    const host = mount({ condition: "contains", value: "" });
    await userEvent.type(screen.getByRole("textbox"), "log");
    expect(host.values.c.value).toBe("log");
  });

  it("updates op when a different operator is selected", async () => {
    const host = mount({ condition: "contains", value: "" });
    await userEvent.selectOptions(screen.getByRole("combobox"), "starts-with");
    expect(host.values.c.condition).toBe("starts-with");
  });
});
