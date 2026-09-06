import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationConditionSchema, type JournalDecorationCondition } from "@/decorations";
import { m } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import { testContainer, type TestHarness } from "@/testing";

import ConditionItem from "./ConditionItem.vue";

async function mount(initial: JournalDecorationCondition, harness?: TestHarness) {
  const resolvedHarness = harness ?? (await testContainer());
  const renderHost = () => h(ConditionItem, { name: "c", condition: initial });
  const Host = defineComponent({
    setup() {
      useForm({
        initialValues: { c: initial },
        validationSchema: toTypedSchema(v.object({ c: decorationConditionSchema })),
      });
      return renderHost;
    },
  });
  resolvedHarness.render(Host);
}

describe("ConditionItem", () => {
  it("renders ConditionTitle for a title condition", async () => {
    await mount({ type: "title", condition: "contains", value: "" });
    expect(screen.getByText(m.decoration_string_op_label({ op: "contains" }))).toBeTruthy();
  });

  it("renders ConditionTag for a tag condition", async () => {
    await mount({ type: "tag", condition: "contains", value: "" });
    expect(screen.getByText(m.decoration_string_op_label({ op: "contains" }))).toBeTruthy();
  });

  it("renders ConditionProperty for a property condition", async () => {
    await mount({ type: "property", name: "x", valueType: "text", condition: "exists", value: "" });
    expect(screen.getByText(m.decoration_string_op_label({ op: "exists" }))).toBeTruthy();
  });

  it("renders ConditionDate for a date condition", async () => {
    await mount({ type: "date", day: 1, month: 1, year: null });
    expect(screen.getByText(m.decoration_condition_date_any_unit({ unit: "day" }))).toBeTruthy();
  });

  it("renders ConditionWeekday for a weekday condition", async () => {
    await mount({ type: "weekday", weekdays: [] });
    expect(screen.getAllByRole("button")).toHaveLength(7);
  });

  it("renders ConditionOffset for an offset condition", async () => {
    await mount({ type: "offset", offset: 1 });
    expect(screen.getByRole("spinbutton")).toBeTruthy();
  });

  it("renders ConditionNoteSize for a note-size condition", async () => {
    await mount({ type: "note-size", unit: "words", condition: "gt", value: 0 });
    expect(screen.getByLabelText(m.decoration_condition_note_size_value_label())).toBeTruthy();
  });

  it("renders ConditionTypeOnly for has-note", async () => {
    await mount({ type: "has-note" });
    expect(screen.getByText(m.decoration_condition_has_note_describe())).toBeTruthy();
  });

  it("renders ConditionTypeOnly for has-open-task", async () => {
    await mount({ type: "has-open-task" });
    expect(screen.getByText(m.decoration_condition_has_open_task_describe())).toBeTruthy();
  });

  it("renders ConditionTypeOnly for all-tasks-completed", async () => {
    await mount({ type: "all-tasks-completed" });
    expect(screen.getByText(m.decoration_condition_all_tasks_completed_describe())).toBeTruthy();
  });

  it("renders ConditionHasNotelet for a has-notelet condition", async () => {
    const harness = await testContainer({ modules: [journalsCoreModule] });
    await mount({ type: "has-notelet", typeIds: [] }, harness);
    expect(screen.getByText(m.decoration_condition_has_notelet_empty())).toBeTruthy();
  });

  it("derives a property condition's number value type from the vault's registered type", async () => {
    const harness = await testContainer();
    harness.host.setPropertyType("rating", "number");
    await mount({ type: "property", name: "", valueType: "text", condition: "exists", value: "" }, harness);

    await userEvent.type(screen.getAllByRole("textbox")[0], "rating");
    await userEvent.selectOptions(screen.getByRole("combobox"), m.decoration_string_op_label({ op: "eq" }));

    expect(screen.getByRole("spinbutton")).toBeTruthy();
  });
});
