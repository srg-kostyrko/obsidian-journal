import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { Calendar } from "@/calendar";
import { decorationConditionSchema, type JournalDecorationCondition } from "@/decorations";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";

import ConditionWeekday from "./ConditionWeekday.vue";

const renderConditionWeekdayHost = () => h(ConditionWeekday, { name: "c" });

afterEach(() => cleanup());

type Weekday = Extract<JournalDecorationCondition, { type: "weekday" }>;

function mount(initial: Weekday) {
  const exposed: { values: { c: Weekday } } = { values: { c: initial } };
  const container = new Container();
  container.register(Calendar).useValue(new Calendar());
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
  render(Host, {
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
          },
        },
      ],
    },
  });
  return exposed;
}

describe("ConditionWeekday", () => {
  it("adds a weekday index when its checkbox is clicked", async () => {
    const host = mount({ type: "weekday", weekdays: [] });
    await userEvent.click(screen.getByLabelText("Mon"));
    expect(host.values.c.weekdays).toEqual([1]);
  });

  it("removes a weekday index when its checkbox is unchecked", async () => {
    const host = mount({ type: "weekday", weekdays: [1] });
    await userEvent.click(screen.getByLabelText("Mon"));
    expect(host.values.c.weekdays).toEqual([]);
  });
});
