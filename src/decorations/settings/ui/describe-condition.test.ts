import { describe, expect, it } from "vitest";

import { Calendar } from "@/calendar";
import { m } from "@/i18n";

import { describeCondition } from "./describe-condition";

const calendar = new Calendar();

describe("describeCondition", () => {
  describe("title", () => {
    it("renders the localized title clause", () => {
      const out = describeCondition({ type: "title", condition: "contains", value: "log" }, calendar);
      expect(out).toBe(
        m.decoration_condition_title_describe({ op: m.decoration_string_op_label({ op: "contains" }), value: "log" }),
      );
    });
  });

  describe("tag", () => {
    it("renders the localized tag clause", () => {
      const out = describeCondition({ type: "tag", condition: "starts-with", value: "#work" }, calendar);
      expect(out).toBe(
        m.decoration_condition_tag_describe({
          op: m.decoration_string_op_label({ op: "starts-with" }),
          value: "#work",
        }),
      );
    });
  });

  describe("property", () => {
    it("renders text property clause", () => {
      const out = describeCondition(
        {
          type: "property",
          name: "mood",
          valueType: "text",
          condition: "contains",
          value: "good",
        },
        calendar,
      );
      expect(out).toBe(
        m.decoration_condition_property_describe({
          name: "mood",
          op: m.decoration_string_op_label({ op: "contains" }),
          value: "good",
        }),
      );
    });
  });

  describe("date", () => {
    it("renders without year when year is null", () => {
      const out = describeCondition({ type: "date", day: 14, month: 2, year: null }, calendar);
      expect(out).toBe(m.decoration_condition_date_describe({ day: 14, month: 2, year: "null" }));
    });
  });

  describe("weekday", () => {
    it("includes moment-derived weekday names", () => {
      const out = describeCondition({ type: "weekday", weekdays: [1, 3] }, calendar);
      expect(out).toContain("Monday");
      expect(out).toContain("Wednesday");
    });
  });

  describe("offset", () => {
    it("renders the localized offset clause", () => {
      const out = describeCondition({ type: "offset", offset: 5 }, calendar);
      expect(out).toBe(m.decoration_condition_offset_describe({ offset: 5 }));
    });
  });

  describe("has-note", () => {
    it("renders the localized has-note clause", () => {
      expect(describeCondition({ type: "has-note" }, calendar)).toBe(m.decoration_condition_has_note_describe());
    });
  });

  describe("has-open-task", () => {
    it("renders the localized has-open-task clause", () => {
      expect(describeCondition({ type: "has-open-task" }, calendar)).toBe(
        m.decoration_condition_has_open_task_describe(),
      );
    });
  });

  describe("all-tasks-completed", () => {
    it("renders the localized all-tasks-completed clause", () => {
      expect(describeCondition({ type: "all-tasks-completed" }, calendar)).toBe(
        m.decoration_condition_all_tasks_completed_describe(),
      );
    });
  });
});
