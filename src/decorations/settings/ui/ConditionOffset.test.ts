import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationConditionSchema, type JournalDecorationCondition } from "@/decorations";

import ConditionOffset from "./ConditionOffset.vue";

const renderConditionOffsetHost = () => h(ConditionOffset, { name: "c" });

afterEach(() => cleanup());

type Offset = Extract<JournalDecorationCondition, { type: "offset" }>;

function mount(initial: Offset) {
  const exposed: { values: { c: Offset } } = { values: { c: initial } };
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { c: initial },
        validationSchema: toTypedSchema(v.object({ c: decorationConditionSchema })),
      });
      exposed.values = form.values as typeof exposed.values;
      return renderConditionOffsetHost;
    },
  });
  render(Host);
  return exposed;
}

describe("ConditionOffset", () => {
  it("updates the offset as the user types", async () => {
    const host = mount({ type: "offset", offset: 0 });
    const input = screen.getByRole("spinbutton");
    await userEvent.clear(input);
    await userEvent.type(input, "5");
    expect(host.values.c.offset).toBe(5);
  });
});
