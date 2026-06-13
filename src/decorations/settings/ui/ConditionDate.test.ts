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

import ConditionDate from "./ConditionDate.vue";

const renderConditionDateHost = () => h(ConditionDate, { name: "c" });

afterEach(() => cleanup());

type DateCond = Extract<JournalDecorationCondition, { type: "date" }>;

function mount(initial: DateCond) {
  const exposed: { values: { c: DateCond } } = { values: { c: initial } };
  const container = new Container();
  container.register(Calendar).useValue(new Calendar());
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
  render(Host, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
  return exposed;
}

describe("ConditionDate", () => {
  it("stores the typed day verbatim", async () => {
    const host = mount({ type: "date", day: 1, month: 1, year: null });
    const [dayInput] = screen.getAllByRole("spinbutton");
    await userEvent.clear(dayInput);
    await userEvent.type(dayInput, "14");
    expect(host.values.c.day).toBe(14);
  });

  it("displays the month one-based in the dropdown", () => {
    mount({ type: "date", day: 1, month: 2, year: null });
    expect(screen.getByRole<HTMLSelectElement>("combobox").value).toBe("3");
  });

  it("stores the selected month zero-based", async () => {
    const host = mount({ type: "date", day: 1, month: 2, year: null });
    await userEvent.selectOptions(screen.getByRole("combobox"), "5");
    expect(host.values.c.month).toBe(4);
  });

  it("stores the typed year verbatim", async () => {
    const host = mount({ type: "date", day: 1, month: 1, year: null });
    const yearInput = screen.getAllByRole("spinbutton")[1];
    await userEvent.clear(yearInput);
    await userEvent.type(yearInput, "2026");
    expect(host.values.c.year).toBe(2026);
  });

  it("stores the wildcard sentinel for a day cleared to empty", async () => {
    const host = mount({ type: "date", day: 14, month: 1, year: null });
    const [dayInput] = screen.getAllByRole("spinbutton");
    await userEvent.clear(dayInput);
    expect(host.values.c.day).toBe(-1);
  });

  it("stores the wildcard sentinel when the month is set to any", async () => {
    const host = mount({ type: "date", day: 1, month: 5, year: null });
    await userEvent.selectOptions(screen.getByRole("combobox"), "");
    expect(host.values.c.month).toBe(-1);
  });

  it("stores null for a year cleared to empty", async () => {
    const host = mount({ type: "date", day: 1, month: 1, year: 2026 });
    const yearInput = screen.getAllByRole("spinbutton")[1];
    await userEvent.clear(yearInput);
    expect(host.values.c.year).toBeNull();
  });

  it("renders empty day and year inputs for a wildcard condition", () => {
    mount({ type: "date", day: -1, month: -1, year: null });
    for (const input of screen.getAllByRole("spinbutton")) {
      expect((input as HTMLInputElement).value).toBe("");
    }
  });

  it("selects the any-month option for a wildcard month", () => {
    mount({ type: "date", day: -1, month: -1, year: null });
    expect(screen.getByRole<HTMLSelectElement>("combobox").value).toBe("");
  });
});
