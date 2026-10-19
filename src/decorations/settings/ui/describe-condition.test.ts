import { describe, expect, it } from "vitest";

import { Calendar } from "@/calendar";
import { formatDisjunction, m } from "@/i18n";
import { describeTagOrHeadingCondition, type TagOrHeadingCondition } from "@/tasks/ui/describe-condition";

import { buildCondition } from "../../testing";

import { describeCondition } from "./describe-condition";

const calendar = new Calendar();

const resolveTypeName = (id: string): string | undefined => ({ nt_a: "Meeting", nt_b: "1o1" })[id];

const source = (s: "note" | "notelets" | "both") => m.decoration_condition_tasks_source_phrase({ source: s });

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
      const out = describeCondition({ type: "date", day: 14, month: 2, year: 2026 }, calendar);
      expect(out).toBe(m.decoration_condition_date_describe({ day: "14", month: "3", year: "2026" }));
    });

    it("renders the month one-based", () => {
      const out = describeCondition({ type: "date", day: 1, month: 0, year: null }, calendar);
      expect(out).toBe(
        m.decoration_condition_date_describe({ day: "1", month: "1", year: m.decoration_condition_date_any() }),
      );
    });

    it("renders wildcard day and month as any", () => {
      const out = describeCondition({ type: "date", day: -1, month: -1, year: null }, calendar);
      expect(out).toBe(
        m.decoration_condition_date_describe({
          day: m.decoration_condition_date_any(),
          month: m.decoration_condition_date_any(),
          year: m.decoration_condition_date_any(),
        }),
      );
    });

    it("renders a null year as any, not the literal string null", () => {
      const out = describeCondition({ type: "date", day: 14, month: 2, year: null }, calendar);
      expect(out).toBe(
        m.decoration_condition_date_describe({ day: "14", month: "3", year: m.decoration_condition_date_any() }),
      );
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
    it("names offset 1 as the first day of the interval", () => {
      const out = describeCondition({ type: "offset", offset: 1 }, calendar);
      expect(out).toBe(m.decoration_condition_offset_describe({ side: "start", day: 1 }));
    });

    it("names offset -1 as the last day of the interval", () => {
      const out = describeCondition({ type: "offset", offset: -1 }, calendar);
      expect(out).toBe(m.decoration_condition_offset_describe({ side: "end", day: 1 }));
    });

    it("counts a positive offset forward from the interval start", () => {
      const out = describeCondition({ type: "offset", offset: 5 }, calendar);
      expect(out).toBe(m.decoration_condition_offset_describe({ side: "start", day: 5 }));
    });

    it("counts a negative offset back from the interval end", () => {
      const out = describeCondition({ type: "offset", offset: -3 }, calendar);
      expect(out).toBe(m.decoration_condition_offset_describe({ side: "end", day: 3 }));
    });
  });

  describe("has-note", () => {
    it("renders the localized has-note clause", () => {
      expect(describeCondition({ type: "has-note" }, calendar)).toBe(m.decoration_condition_has_note_describe());
    });
  });

  describe("note-size", () => {
    it("renders the localized note-size clause in words", () => {
      expect(describeCondition({ type: "note-size", unit: "words", condition: "gt", value: 250 }, calendar)).toBe(
        m.decoration_condition_note_size_describe({
          unit: "words",
          op: m.decoration_string_op_label({ op: "gt" }),
          value: 250,
        }),
      );
    });

    it("renders the localized note-size clause in characters", () => {
      expect(
        describeCondition({ type: "note-size", unit: "characters", condition: "lte", value: 1000 }, calendar),
      ).toBe(
        m.decoration_condition_note_size_describe({
          unit: "characters",
          op: m.decoration_string_op_label({ op: "lte" }),
          value: 1000,
        }),
      );
    });
  });

  describe("tasks", () => {
    it("describes any open task in the note and its notelets", () => {
      expect(
        describeCondition(buildCondition("tasks", { quantifier: "any", status: "open", source: "both" }), calendar),
      ).toBe(m.decoration_condition_tasks_describe({ quantifier: "any", status: "open", source: source("both") }));
    });

    it("describes no done task in the note", () => {
      expect(
        describeCondition(buildCondition("tasks", { quantifier: "none", status: "done", source: "note" }), calendar),
      ).toBe(m.decoration_condition_tasks_describe({ quantifier: "none", status: "done", source: source("note") }));
    });

    it("describes no task of any status as no task existing", () => {
      expect(
        describeCondition(buildCondition("tasks", { quantifier: "none", status: "all", source: "both" }), calendar),
      ).toBe(m.decoration_condition_tasks_describe({ quantifier: "none", status: "all", source: source("both") }));
    });

    it("describes the listing status as following the journal's task listing", () => {
      const out = describeCondition(
        buildCondition("tasks", { quantifier: "all", status: "listing", source: "notelets" }),
        calendar,
      );
      expect(out).toBe(
        m.decoration_condition_tasks_describe({ quantifier: "all", status: "listing", source: source("notelets") }),
      );
    });

    it("names the date choice only when it is not the default", () => {
      const base = m.decoration_condition_tasks_describe({ quantifier: "any", status: "open", source: source("both") });
      expect(describeCondition(buildCondition("tasks", { status: "open", date: "scheduled-or-due" }), calendar)).toBe(
        base,
      );
      expect(describeCondition(buildCondition("tasks", { status: "open", date: "due" }), calendar)).toBe(
        m.decoration_condition_tasks_describe_dated({ base, date: "due" }),
      );
    });

    it("names the date choice before the narrowing conditions", () => {
      const heading: TagOrHeadingCondition = { type: "heading", condition: "under", headings: ["Work"] };
      const out = describeCondition(
        buildCondition("tasks", { status: "open", date: "created", filter: { mode: "and", conditions: [heading] } }),
        calendar,
      );
      expect(out).toBe(
        m.decoration_condition_tasks_describe_narrowed({
          base: m.decoration_condition_tasks_describe_dated({
            base: m.decoration_condition_tasks_describe({ quantifier: "any", status: "open", source: source("both") }),
            date: "created",
          }),
          conditions: describeTagOrHeadingCondition(heading),
        }),
      );
    });

    it("appends the narrowing conditions", () => {
      const out = describeCondition(
        buildCondition("tasks", {
          status: "open",
          filter: { mode: "and", conditions: [{ type: "heading", condition: "under", headings: ["Work"] }] },
        }),
        calendar,
      );
      expect(out).toBe(
        m.decoration_condition_tasks_describe_narrowed({
          base: m.decoration_condition_tasks_describe({ quantifier: "any", status: "open", source: source("both") }),
          conditions: describeTagOrHeadingCondition({ type: "heading", condition: "under", headings: ["Work"] }),
        }),
      );
    });

    it("joins narrowing conditions with the disjunction under an or filter", () => {
      const headings: TagOrHeadingCondition = { type: "heading", condition: "under", headings: ["Work"] };
      const tag: TagOrHeadingCondition = { type: "tag", condition: "has", tags: ["#x"] };
      const out = describeCondition(
        buildCondition("tasks", { filter: { mode: "or", conditions: [headings, tag] } }),
        calendar,
      );
      expect(out).toContain(
        formatDisjunction([describeTagOrHeadingCondition(headings), describeTagOrHeadingCondition(tag)]),
      );
    });
  });

  describe("has-notelet", () => {
    it("describes an any-type condition", () => {
      expect(describeCondition({ type: "has-notelet", typeIds: [] }, calendar)).toBe("a notelet exists");
    });

    it("names the configured types", () => {
      expect(describeCondition({ type: "has-notelet", typeIds: ["nt_a", "nt_b"] }, calendar, resolveTypeName)).toBe(
        "a notelet of type Meeting, 1o1 exists",
      );
    });

    it("falls back for an id the journal no longer defines", () => {
      expect(describeCondition({ type: "has-notelet", typeIds: ["nt_gone"] }, calendar, () => undefined)).toBe(
        "a notelet of type unknown type exists",
      );
    });

    it("falls back when no resolver is supplied", () => {
      expect(describeCondition({ type: "has-notelet", typeIds: ["nt_a"] }, calendar)).toBe(
        "a notelet of type unknown type exists",
      );
    });
  });
});
