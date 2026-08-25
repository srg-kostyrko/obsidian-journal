import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationConditionSchema, type JournalDecorationCondition } from "@/decorations";
import { m } from "@/i18n";

import ConditionOffset from "./ConditionOffset.vue";

const renderConditionOffsetHost = () => h(ConditionOffset, { name: "c" });

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

const fromStart = m.decoration_condition_offset_direction_option({ side: "start" });
const fromEnd = m.decoration_condition_offset_direction_option({ side: "end" });

describe("ConditionOffset", () => {
  it("shows a negative offset as counting from the end", () => {
    mount({ type: "offset", offset: -2 });
    expect(screen.getByRole("radio", { name: fromEnd, checked: true })).toBeTruthy();
  });

  it("shows a negative offset as a positive day number", () => {
    mount({ type: "offset", offset: -2 });
    expect(screen.getByRole<HTMLInputElement>("spinbutton").value).toBe("2");
  });

  it("stores a negative offset when the user counts from the end", async () => {
    const host = mount({ type: "offset", offset: 3 });
    await userEvent.click(screen.getByRole("radio", { name: fromEnd }));
    expect(host.values.c.offset).toBe(-3);
  });

  it("stores a positive offset when the user counts from the start", async () => {
    const host = mount({ type: "offset", offset: -3 });
    await userEvent.click(screen.getByRole("radio", { name: fromStart }));
    expect(host.values.c.offset).toBe(3);
  });

  it("stores the day number the user types", async () => {
    const host = mount({ type: "offset", offset: 1 });
    const input = screen.getByRole("spinbutton");
    await userEvent.clear(input);
    await userEvent.type(input, "5");
    expect(host.values.c.offset).toBe(5);
  });

  it("keeps the stored offset while the day input is empty", async () => {
    const host = mount({ type: "offset", offset: 4 });
    await userEvent.clear(screen.getByRole("spinbutton"));
    expect(host.values.c.offset).toBe(4);
  });

  it("stores the end direction when the day input holds a negative number", async () => {
    const host = mount({ type: "offset", offset: 3 });
    const input = screen.getByRole("spinbutton");
    await userEvent.clear(input);
    await userEvent.type(input, "-2");
    await userEvent.click(screen.getByRole("radio", { name: fromEnd }));
    expect(host.values.c.offset).toBe(-3);
  });

  it("does not store zero when the day input holds zero", async () => {
    const host = mount({ type: "offset", offset: 3 });
    const input = screen.getByRole("spinbutton");
    await userEvent.clear(input);
    await userEvent.type(input, "0");
    await userEvent.click(screen.getByRole("radio", { name: fromEnd }));
    expect(host.values.c.offset).toBe(-3);
  });

  it("flips direction using the stored magnitude while the day input is empty", async () => {
    const host = mount({ type: "offset", offset: 4 });
    await userEvent.clear(screen.getByRole("spinbutton"));
    await userEvent.click(screen.getByRole("radio", { name: fromEnd }));
    expect(host.values.c.offset).toBe(-4);
  });

  it("explains day 1 from the start as the interval's first day", () => {
    mount({ type: "offset", offset: 1 });
    expect(screen.getByText(m.decoration_condition_offset_hint({ side: "start", day: 1 }))).toBeTruthy();
  });

  it("explains day 1 from the end as the interval's last day", () => {
    mount({ type: "offset", offset: -1 });
    expect(screen.getByText(m.decoration_condition_offset_hint({ side: "end", day: 1 }))).toBeTruthy();
  });

  it("names the direction control for assistive tech", () => {
    mount({ type: "offset", offset: 1 });
    expect(screen.getByRole("radiogroup", { name: m.decoration_condition_offset_direction_label() })).toBeTruthy();
  });

  it("names the day input for assistive tech", () => {
    mount({ type: "offset", offset: 1 });
    expect(screen.getByRole("spinbutton", { name: m.decoration_condition_offset_day_label() })).toBeTruthy();
  });
});
