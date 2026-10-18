import userEvent from "@testing-library/user-event";
import { render, screen, within } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationConditionSchema, type JournalDecorationTasksCondition } from "@/decorations";
import { m } from "@/i18n";

import { buildCondition } from "../../testing";

import ConditionTasks from "./ConditionTasks.vue";

const renderHost = () => h(ConditionTasks, { name: "c" });

function mount(initial: JournalDecorationTasksCondition = buildCondition("tasks")) {
  const exposed: { values: { c: JournalDecorationTasksCondition } } = { values: { c: initial } };
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { c: initial },
        validationSchema: toTypedSchema(v.object({ c: decorationConditionSchema })),
      });
      exposed.values = form.values as typeof exposed.values;
      return renderHost;
    },
  });
  render(Host);
  return exposed;
}

describe("ConditionTasks", () => {
  it("offers any, all and none in the quantifier dropdown", () => {
    mount();
    const select = screen.getByRole("combobox", { name: m.decoration_condition_tasks_quantifier_label() });
    const labels = within(select)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(labels).toEqual(
      (["any", "all", "none"] as const).map((quantifier) =>
        m.decoration_condition_tasks_quantifier_option({ quantifier }),
      ),
    );
  });

  it("writes the picked quantifier", async () => {
    const host = mount();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: m.decoration_condition_tasks_quantifier_label() }),
      m.decoration_condition_tasks_quantifier_option({ quantifier: "none" }),
    );
    expect(host.values.c.quantifier).toBe("none");
  });

  it("offers the status choices as one single-select group in order", () => {
    mount();
    const group = screen.getByRole("radiogroup", { name: m.decoration_condition_tasks_status_label() });
    expect(
      within(group)
        .getAllByRole("radio")
        .map((r) => r.closest("label")?.textContent),
    ).toEqual([
      m.decoration_condition_tasks_status_listing(),
      m.tasks_status_group_open(),
      m.tasks_status_group_done(),
      m.tasks_status_group_all(),
    ]);
  });

  it("replaces the status with the one picked", async () => {
    const host = mount(buildCondition("tasks", { status: "open" }));
    await userEvent.click(screen.getByRole("radio", { name: m.tasks_status_group_done() }));
    expect(host.values.c.status).toBe("done");
    await userEvent.click(screen.getByRole("radio", { name: m.decoration_condition_tasks_status_listing() }));
    expect(host.values.c.status).toBe("listing");
  });

  it("offers note, notelets and both as the source and writes the pick", async () => {
    const host = mount();
    const select = screen.getByRole("combobox", { name: m.decoration_condition_tasks_source_label() });
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual([
      m.view_block_tasks_source_note(),
      m.view_block_tasks_source_notelets(),
      m.view_block_tasks_source_both(),
    ]);
    await userEvent.selectOptions(select, m.view_block_tasks_source_notelets());
    expect(host.values.c.source).toBe("notelets");
  });

  it("narrows only by heading and tag and shows the and/or control", async () => {
    mount();
    expect(screen.getByDisplayValue(m.tasks_settings_mode_and())).toBeTruthy();
    await userEvent.click(screen.getByTestId("rule-add-condition"));
    const row = screen.getByTestId("rule-condition-row");
    const typeSelect = within(row).getAllByRole("combobox")[0];
    expect(
      within(typeSelect)
        .getAllByRole("option")
        .map((o) => o.getAttribute("value")),
    ).toEqual(["tag", "heading"]);
  });

  it("writes an added heading row into the filter", async () => {
    const host = mount();
    await userEvent.click(screen.getByTestId("rule-add-condition"));
    expect(host.values.c.filter.conditions).toHaveLength(1);
    expect(host.values.c.filter.conditions[0]?.type).toBe("heading");
  });
});
