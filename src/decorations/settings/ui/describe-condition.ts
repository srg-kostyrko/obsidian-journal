import { match } from "ts-pattern";

import type { Calendar } from "@/calendar";
import type { JournalDecorationCondition } from "@/decorations";
import { m } from "@/i18n";

import { DATE_CONDITION_ANY, storedMonthToDisplay } from "../../date-condition";

export function describeCondition(condition: JournalDecorationCondition, calendar: Calendar): string {
  return match(condition)
    .with({ type: "title" }, (c) =>
      m.decoration_condition_title_describe({
        op: m.decoration_string_op_label({ op: c.condition }),
        value: c.value,
      }),
    )
    .with({ type: "tag" }, (c) =>
      m.decoration_condition_tag_describe({
        op: m.decoration_string_op_label({ op: c.condition }),
        value: c.value,
      }),
    )
    .with({ type: "property" }, (c) =>
      m.decoration_condition_property_describe({
        name: c.name,
        op:
          c.valueType === "date"
            ? m.decoration_date_op_label({ op: c.condition })
            : m.decoration_string_op_label({ op: c.condition }),
        value: "value" in c ? String(c.value) : "",
      }),
    )
    .with({ type: "date" }, (c) =>
      m.decoration_condition_date_describe({
        day: c.day === DATE_CONDITION_ANY ? m.decoration_condition_date_any() : String(c.day),
        month:
          c.month === DATE_CONDITION_ANY ? m.decoration_condition_date_any() : String(storedMonthToDisplay(c.month)),
        year: c.year === null ? m.decoration_condition_date_any() : String(c.year),
      }),
    )
    .with({ type: "weekday" }, (c) => {
      const names = calendar.weekdays();
      const list = c.weekdays
        .map((i) => names[i])
        .filter(Boolean)
        .join(", ");
      return m.decoration_condition_weekday_describe({ weekdays: list });
    })
    .with({ type: "offset" }, (c) =>
      m.decoration_condition_offset_describe({
        side: c.offset < 0 ? "end" : "start",
        day: Math.abs(c.offset),
      }),
    )
    .with({ type: "has-note" }, () => m.decoration_condition_has_note_describe())
    .with({ type: "has-open-task" }, () => m.decoration_condition_has_open_task_describe())
    .with({ type: "all-tasks-completed" }, () => m.decoration_condition_all_tasks_completed_describe())
    .exhaustive();
}
