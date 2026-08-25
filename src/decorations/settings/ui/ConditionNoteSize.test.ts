import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { m } from "@/i18n";

import ConditionNoteSize from "./ConditionNoteSize.vue";

const renderHost = () => h(ConditionNoteSize, { name: "c" });

interface InitialNoteSize {
  unit: "words" | "characters";
  condition: "lt" | "lte" | "gt" | "gte";
  value: number;
}

function mount(initial: InitialNoteSize) {
  const exposed: { values: { c: InitialNoteSize } } = { values: { c: initial } };
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { c: initial },
        validationSchema: toTypedSchema(
          v.object({ c: v.object({ unit: v.string(), condition: v.string(), value: v.number() }) }),
        ),
      });
      exposed.values = form.values as typeof exposed.values;
      return renderHost;
    },
  });
  render(Host);
  return exposed;
}

describe("ConditionNoteSize", () => {
  it("names its operator dropdown for assistive tech", () => {
    mount({ unit: "words", condition: "gt", value: 0 });
    expect(screen.getByRole("combobox", { name: m.decoration_condition_op_label() })).toBeTruthy();
  });

  it("names its value field for assistive tech", () => {
    mount({ unit: "words", condition: "gt", value: 0 });
    expect(screen.getByRole("spinbutton", { name: m.decoration_condition_note_size_value_label() })).toBeTruthy();
  });

  it("updates the operator when a different one is selected", async () => {
    const host = mount({ unit: "words", condition: "gt", value: 0 });
    await userEvent.selectOptions(screen.getByRole("combobox"), "lte");
    expect(host.values.c.condition).toBe("lte");
  });

  it("switches the unit to characters when that option is picked", async () => {
    const host = mount({ unit: "words", condition: "gt", value: 0 });
    await userEvent.click(
      screen.getByRole("radio", { name: m.decoration_condition_note_size_unit_option({ unit: "characters" }) }),
    );
    expect(host.values.c.unit).toBe("characters");
  });

  it("holds the last valid threshold when the input is cleared", async () => {
    const host = mount({ unit: "words", condition: "gt", value: 250 });
    await userEvent.clear(screen.getByRole("spinbutton"));
    // EditDecorationModal renders no validation errors and its Save button is not
    // validity-gated, so letting the field go invalid makes Save die silently.
    expect(host.values.c.value).toBe(250);
  });
});
