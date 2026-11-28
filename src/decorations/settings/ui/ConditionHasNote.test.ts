import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { m } from "@/i18n";

import ConditionHasNote from "./ConditionHasNote.vue";

interface InitialHasNote {
  presence?: "exists" | "missing";
}

const renderHost = () => h(ConditionHasNote, { name: "c" });

function mount(initial: InitialHasNote) {
  const exposed: { values: { c: InitialHasNote } } = { values: { c: initial } };
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { c: initial },
        validationSchema: toTypedSchema(v.object({ c: v.object({ presence: v.optional(v.string()) }) })),
      });
      exposed.values = form.values as typeof exposed.values;
      return renderHost;
    },
  });
  render(Host);
  return exposed;
}

describe("ConditionHasNote", () => {
  it("switching to Missing writes presence missing", async () => {
    const host = mount({ presence: "exists" });
    await userEvent.click(
      screen.getByRole("radio", { name: m.decoration_condition_has_note_presence_option({ presence: "missing" }) }),
    );
    expect(host.values.c.presence).toBe("missing");
  });

  it("an old condition without presence shows Exists", () => {
    mount({});
    const exists = screen.getByRole<HTMLInputElement>("radio", {
      name: m.decoration_condition_has_note_presence_option({ presence: "exists" }),
    });
    expect(exists.checked).toBe(true);
  });

  it("names the control for assistive tech", () => {
    mount({ presence: "exists" });
    expect(screen.getByRole("radiogroup", { name: m.decoration_condition_has_note_presence_label() })).toBeTruthy();
  });
});
