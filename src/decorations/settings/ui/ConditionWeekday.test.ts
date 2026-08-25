import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationConditionSchema, type JournalDecorationCondition } from "@/decorations";
import { m } from "@/i18n";
import { testContainer } from "@/testing";

import ConditionWeekday from "./ConditionWeekday.vue";

const renderConditionWeekdayHost = () => h(ConditionWeekday, { name: "c" });

type Weekday = Extract<JournalDecorationCondition, { type: "weekday" }>;

async function mount(initial: Weekday) {
  const exposed: { values: { c: Weekday } } = { values: { c: initial } };
  const harness = await testContainer();
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { c: initial },
        validationSchema: toTypedSchema(v.object({ c: decorationConditionSchema })),
      });
      exposed.values = form.values as typeof exposed.values;
      return renderConditionWeekdayHost;
    },
  });
  harness.render(Host);
  return exposed;
}

describe("ConditionWeekday", () => {
  it("names the weekday group for assistive tech", async () => {
    await mount({ type: "weekday", weekdays: [] });
    expect(screen.getByRole("group", { name: m.decoration_condition_weekday_label() })).toBeTruthy();
  });

  it("adds a weekday index when its segment is clicked", async () => {
    const host = await mount({ type: "weekday", weekdays: [] });
    await userEvent.click(screen.getByRole("button", { name: "Mon" }));
    expect(host.values.c.weekdays).toEqual([1]);
  });

  it("removes a weekday index when its active segment is clicked", async () => {
    const host = await mount({ type: "weekday", weekdays: [1] });
    await userEvent.click(screen.getByRole("button", { name: "Mon" }));
    expect(host.values.c.weekdays).toEqual([]);
  });

  it("keeps selected weekday indices sorted", async () => {
    const host = await mount({ type: "weekday", weekdays: [3] });
    await userEvent.click(screen.getByRole("button", { name: "Mon" }));
    expect(host.values.c.weekdays).toEqual([1, 3]);
  });

  it("marks the segment of a selected weekday as pressed", async () => {
    await mount({ type: "weekday", weekdays: [1] });
    expect(screen.getByRole("button", { name: "Mon" }).getAttribute("aria-pressed")).toBe("true");
  });
});
