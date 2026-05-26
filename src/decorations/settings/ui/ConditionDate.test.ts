import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationConditionSchema, type JournalDecorationCondition } from "@/decorations";

import ConditionDate from "./ConditionDate.vue";

const renderConditionDateHost = () => h(ConditionDate, { name: "c" });

afterEach(() => cleanup());

type DateCond = Extract<JournalDecorationCondition, { type: "date" }>;

function mount(initial: DateCond) {
  const exposed: { values: { c: DateCond } } = { values: { c: initial } };
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { c: initial },
        validationSchema: toTypedSchema(v.object({ c: decorationConditionSchema })),
      });
      exposed.values = form.values as typeof exposed.values;
      return renderConditionDateHost;
    },
  });
  render(Host);
  return exposed;
}

describe("ConditionDate", () => {
  it("updates day, month, and year as the user types", async () => {
    const host = mount({ type: "date", day: 1, month: 1, year: null });
    const inputs = screen.getAllByRole("spinbutton");
    await userEvent.clear(inputs[0]);
    await userEvent.type(inputs[0], "14");
    await userEvent.clear(inputs[1]);
    await userEvent.type(inputs[1], "2");
    await userEvent.clear(inputs[2]);
    await userEvent.type(inputs[2], "2026");
    expect(host.values.c.day).toBe(14);
    expect(host.values.c.month).toBe(2);
    expect(host.values.c.year).toBe(2026);
  });
});
