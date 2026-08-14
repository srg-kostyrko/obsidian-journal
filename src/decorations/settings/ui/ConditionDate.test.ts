import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { Calendar } from "@/calendar";
import { decorationConditionSchema, type JournalDecorationCondition } from "@/decorations";
import { m } from "@/i18n";
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
  it("names its day field for assistive tech", () => {
    mount({ type: "date", day: 1, month: 1, year: null });
    expect(
      screen.getByRole("combobox", { name: m.decoration_condition_date_unit_label({ unit: "day" }) }),
    ).toBeTruthy();
  });

  it("names its month field for assistive tech", () => {
    mount({ type: "date", day: 1, month: 1, year: null });
    expect(
      screen.getByRole("combobox", { name: m.decoration_condition_date_unit_label({ unit: "month" }) }),
    ).toBeTruthy();
  });

  it("names its year field for assistive tech", () => {
    mount({ type: "date", day: 1, month: 1, year: null });
    expect(
      screen.getByRole("spinbutton", { name: m.decoration_condition_date_unit_label({ unit: "year" }) }),
    ).toBeTruthy();
  });

  it("stores the selected day verbatim", async () => {
    const host = mount({ type: "date", day: 1, month: 1, year: null });
    const [dayDropdown] = screen.getAllByRole("combobox");
    await userEvent.selectOptions(dayDropdown, "14");
    expect(host.values.c.day).toBe(14);
  });

  it("displays the month one-based in the dropdown", () => {
    mount({ type: "date", day: 1, month: 2, year: null });
    const monthDropdown = screen.getAllByRole<HTMLSelectElement>("combobox")[1];
    expect(monthDropdown.value).toBe("3");
  });

  it("stores the selected month zero-based", async () => {
    const host = mount({ type: "date", day: 1, month: 2, year: null });
    await userEvent.selectOptions(screen.getAllByRole("combobox")[1], "5");
    expect(host.values.c.month).toBe(4);
  });

  it("stores the typed year verbatim", async () => {
    const host = mount({ type: "date", day: 1, month: 1, year: null });
    const yearInput = screen.getByRole("spinbutton");
    await userEvent.clear(yearInput);
    await userEvent.type(yearInput, "2026");
    expect(host.values.c.year).toBe(2026);
  });

  it("stores the wildcard sentinel when the day is set to any", async () => {
    const host = mount({ type: "date", day: 14, month: 1, year: null });
    await userEvent.selectOptions(screen.getAllByRole("combobox")[0], "");
    expect(host.values.c.day).toBe(-1);
  });

  it("stores the wildcard sentinel when the month is set to any", async () => {
    const host = mount({ type: "date", day: 1, month: 5, year: null });
    await userEvent.selectOptions(screen.getAllByRole("combobox")[1], "");
    expect(host.values.c.month).toBe(-1);
  });

  it("stores null for a year cleared to empty", async () => {
    const host = mount({ type: "date", day: 1, month: 1, year: 2026 });
    const yearInput = screen.getByRole("spinbutton");
    await userEvent.clear(yearInput);
    expect(host.values.c.year).toBeNull();
  });

  it("selects the any-day option for a wildcard day", () => {
    mount({ type: "date", day: -1, month: -1, year: null });
    expect(screen.getAllByRole<HTMLSelectElement>("combobox")[0].value).toBe("");
  });

  it("selects the any-month option for a wildcard month", () => {
    mount({ type: "date", day: -1, month: -1, year: null });
    expect(screen.getAllByRole<HTMLSelectElement>("combobox")[1].value).toBe("");
  });

  it("renders an empty year input for a wildcard condition", () => {
    mount({ type: "date", day: -1, month: -1, year: null });
    expect(screen.getByRole<HTMLInputElement>("spinbutton").value).toBe("");
  });
});
