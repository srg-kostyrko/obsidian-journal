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
import { InputSuggestService, MetadataTypeService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";

import ConditionItem from "./ConditionItem.vue";

afterEach(() => cleanup());

function mount(initial: JournalDecorationCondition) {
  const container = new Container();
  container.register(Calendar).useValue(new Calendar());
  container
    .register(MetadataTypeService)
    .useValue({ getPropertyType: () => null, listProperties: () => [] } as unknown as MetadataTypeService);
  container.register(InputSuggestService).useValue(new FakeInputSuggestService() as unknown as InputSuggestService);
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
}

describe("ConditionItem", () => {
  it("renders ConditionTitle for a title condition", () => {
    mount({ type: "title", condition: "contains", value: "" });
    expect(screen.getByText(m.decoration_string_op_label({ op: "contains" }))).toBeTruthy();
  });

  it("renders ConditionTag for a tag condition", () => {
    mount({ type: "tag", condition: "contains", value: "" });
    expect(screen.getByText(m.decoration_string_op_label({ op: "contains" }))).toBeTruthy();
  });

  it("renders ConditionProperty for a property condition", () => {
    mount({ type: "property", name: "x", valueType: "text", condition: "exists", value: "" });
    expect(screen.getByText(m.decoration_string_op_label({ op: "exists" }))).toBeTruthy();
  });

  it("renders ConditionDate for a date condition", () => {
    mount({ type: "date", day: 1, month: 1, year: null });
    expect(screen.getByText(m.decoration_condition_date_any_unit({ unit: "day" }))).toBeTruthy();
  });

  it("renders ConditionWeekday for a weekday condition", () => {
    mount({ type: "weekday", weekdays: [] });
    expect(screen.getAllByRole("button")).toHaveLength(7);
  });

  it("renders ConditionOffset for an offset condition", () => {
    mount({ type: "offset", offset: 0 });
    expect(screen.getByRole("spinbutton")).toBeTruthy();
  });

  it("renders ConditionTypeOnly for has-note", () => {
    mount({ type: "has-note" });
    expect(screen.getByText(m.decoration_condition_has_note_describe())).toBeTruthy();
  });

  it("renders ConditionTypeOnly for has-open-task", () => {
    mount({ type: "has-open-task" });
    expect(screen.getByText(m.decoration_condition_has_open_task_describe())).toBeTruthy();
  });

  it("renders ConditionTypeOnly for all-tasks-completed", () => {
    mount({ type: "all-tasks-completed" });
    expect(screen.getByText(m.decoration_condition_all_tasks_completed_describe())).toBeTruthy();
  });
});
