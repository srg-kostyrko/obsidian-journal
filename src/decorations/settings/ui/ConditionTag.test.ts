import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import ConditionTag from "./ConditionTag.vue";

const renderConditionTagHost = () => h(ConditionTag, { name: "c" });

afterEach(() => cleanup());

interface InitialTag {
  condition: "contains" | "starts-with" | "ends-with";
  value: string;
}

function mount(initial: InitialTag) {
  const exposed: { values: { c: InitialTag } } = { values: { c: initial } };
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { c: initial },
        validationSchema: toTypedSchema(v.object({ c: v.object({ condition: v.string(), value: v.string() }) })),
      });
      exposed.values = form.values as typeof exposed.values;
      return renderConditionTagHost;
    },
  });
  render(Host);
  return exposed;
}

describe("ConditionTag", () => {
  it("updates tag value as the user types", async () => {
    const host = mount({ condition: "contains", value: "" });
    await userEvent.type(screen.getByRole("textbox"), "#work");
    expect(host.values.c.value).toBe("#work");
  });

  it("updates op when a different operator is selected", async () => {
    const host = mount({ condition: "contains", value: "" });
    await userEvent.selectOptions(screen.getByRole("combobox"), "ends-with");
    expect(host.values.c.condition).toBe("ends-with");
  });
});
