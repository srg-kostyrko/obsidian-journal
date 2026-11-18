import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { m } from "@/i18n";

import ConditionLinked from "./ConditionLinked.vue";

const renderHost = () => h(ConditionLinked, { name: "c" });

function mount(initial: { atLeast: number }) {
  const exposed: { values: { c: { atLeast: number } } } = { values: { c: initial } };
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { c: initial },
        validationSchema: toTypedSchema(v.object({ c: v.object({ atLeast: v.number() }) })),
      });
      exposed.values = form.values as typeof exposed.values;
      return renderHost;
    },
  });
  render(Host);
  return exposed;
}

const input = () => screen.getByRole("spinbutton", { name: m.decoration_condition_linked_value_label() });

describe("ConditionLinked", () => {
  it("typing 3 writes atLeast 3", async () => {
    const host = mount({ atLeast: 1 });
    await userEvent.clear(input());
    await userEvent.type(input(), "3");
    expect(host.values.c.atLeast).toBe(3);
  });

  it("clearing the input keeps the last valid value", async () => {
    const host = mount({ atLeast: 4 });
    await userEvent.clear(input());
    expect(host.values.c.atLeast).toBe(4);
  });

  it("0 is not written", async () => {
    const host = mount({ atLeast: 2 });
    await userEvent.clear(input());
    await userEvent.type(input(), "0");
    expect(host.values.c.atLeast).toBe(2);
  });
});
