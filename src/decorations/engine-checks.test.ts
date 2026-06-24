import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DayPeriod } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";
import type { NoteMetadata } from "@/infrastructure/host";
import type { CycleService } from "@/journals";
import type { JournalConfig } from "@/journals/config";

import {
  allTasksCompleted,
  checkDate,
  checkOffset,
  checkProperty,
  checkTag,
  checkTitle,
  checkWeekday,
  hasOpenTask,
} from "./engine-checks";
import { buildCondition } from "./testing";

function meta(partial: Partial<NoteMetadata>): NoteMetadata {
  return {
    title: "",
    tags: [],
    properties: {},
    tasks: [],
    ...partial,
  };
}

describe("engine-checks", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  describe("checkTitle", () => {
    it("is false when metadata is null", () => {
      const condition = buildCondition("title", { condition: "contains", value: "foo" });
      expect(checkTitle(condition, null)).toBe(false);
    });

    it("matches contains case-insensitively", () => {
      const condition = buildCondition("title", { condition: "contains", value: "FOO" });
      expect(checkTitle(condition, meta({ title: "my-foo-note" }))).toBe(true);
    });

    it("matches starts-with case-insensitively", () => {
      const condition = buildCondition("title", { condition: "starts-with", value: "Hello" });
      expect(checkTitle(condition, meta({ title: "hello world" }))).toBe(true);
    });

    it("matches ends-with case-insensitively", () => {
      const condition = buildCondition("title", { condition: "ends-with", value: "BAR" });
      expect(checkTitle(condition, meta({ title: "fooBAR" }))).toBe(true);
    });
  });

  describe("checkTag", () => {
    it("is false when metadata is null", () => {
      const condition = buildCondition("tag", { condition: "contains", value: "x" });
      expect(checkTag(condition, null)).toBe(false);
    });

    it("matches any tag that contains the value", () => {
      const condition = buildCondition("tag", { condition: "contains", value: "work" });
      expect(checkTag(condition, meta({ tags: ["#personal", "#workout"] }))).toBe(true);
    });

    it("is false when no tag matches", () => {
      const condition = buildCondition("tag", { condition: "starts-with", value: "#x" });
      expect(checkTag(condition, meta({ tags: ["#yoga"] }))).toBe(false);
    });
  });

  describe("checkProperty", () => {
    describe("text", () => {
      it("matches exists when the property is present", () => {
        const condition = buildCondition("property", {
          name: "mood",
          valueType: "text",
          condition: "exists",
          value: "",
        });
        expect(checkProperty(condition, meta({ properties: { mood: "ok" } }))).toBe(true);
      });

      it("matches does-not-exist when the property is missing", () => {
        const condition = buildCondition("property", {
          name: "mood",
          valueType: "text",
          condition: "does-not-exist",
          value: "",
        });
        expect(checkProperty(condition, meta({ properties: {} }))).toBe(true);
      });

      it("matches eq case-sensitively for strings (v2 parity)", () => {
        const condition = buildCondition("property", {
          name: "label",
          valueType: "text",
          condition: "eq",
          value: "Ok",
        });
        expect(checkProperty(condition, meta({ properties: { label: "OK" } }))).toBe(false);
      });

      it("matches contains over array property", () => {
        const condition = buildCondition("property", {
          name: "tags",
          valueType: "text",
          condition: "contains",
          value: "Yoga",
        });
        expect(checkProperty(condition, meta({ properties: { tags: ["yoga-class", "running"] } }))).toBe(true);
      });

      it("returns false when valueType is text but property is a number", () => {
        const condition = buildCondition("property", {
          name: "x",
          valueType: "text",
          condition: "eq",
          value: "5",
        });
        expect(checkProperty(condition, meta({ properties: { x: 5 } }))).toBe(false);
      });
    });

    describe("number", () => {
      it("matches eq", () => {
        const condition = buildCondition("property", { name: "x", valueType: "number", condition: "eq", value: 5 });
        expect(checkProperty(condition, meta({ properties: { x: 5 } }))).toBe(true);
      });

      it("matches gt", () => {
        const condition = buildCondition("property", { name: "x", valueType: "number", condition: "gt", value: 5 });
        expect(checkProperty(condition, meta({ properties: { x: 6 } }))).toBe(true);
      });

      it("does not match gt when equal", () => {
        const condition = buildCondition("property", { name: "x", valueType: "number", condition: "gt", value: 5 });
        expect(checkProperty(condition, meta({ properties: { x: 5 } }))).toBe(false);
      });

      it("returns false when valueType is number but property is a string", () => {
        const condition = buildCondition("property", { name: "x", valueType: "number", condition: "eq", value: 5 });
        expect(checkProperty(condition, meta({ properties: { x: "5" } }))).toBe(false);
      });
    });

    describe("checkbox", () => {
      it("matches is-true when value is exactly true", () => {
        const condition = buildCondition("property", { name: "done", valueType: "checkbox", condition: "is-true" });
        expect(checkProperty(condition, meta({ properties: { done: true } }))).toBe(true);
      });

      it("rejects is-true when value is false", () => {
        const condition = buildCondition("property", { name: "done", valueType: "checkbox", condition: "is-true" });
        expect(checkProperty(condition, meta({ properties: { done: false } }))).toBe(false);
      });

      it("matches is-false when value is exactly false", () => {
        const condition = buildCondition("property", { name: "done", valueType: "checkbox", condition: "is-false" });
        expect(checkProperty(condition, meta({ properties: { done: false } }))).toBe(true);
      });
    });

    describe("date", () => {
      it("matches eq on the ISO date string", () => {
        const condition = buildCondition("property", {
          name: "due",
          valueType: "date",
          condition: "eq",
          value: "2026-06-24",
        });
        expect(checkProperty(condition, meta({ properties: { due: "2026-06-24" } }))).toBe(true);
      });

      it("matches lt when the property date is earlier", () => {
        const condition = buildCondition("property", {
          name: "due",
          valueType: "date",
          condition: "lt",
          value: "2026-06-24",
        });
        expect(checkProperty(condition, meta({ properties: { due: "2026-01-01" } }))).toBe(true);
      });

      it("does not match gt when the dates are equal", () => {
        const condition = buildCondition("property", {
          name: "due",
          valueType: "date",
          condition: "gt",
          value: "2026-06-24",
        });
        expect(checkProperty(condition, meta({ properties: { due: "2026-06-24" } }))).toBe(false);
      });

      it("returns false when valueType is date but the property is a number", () => {
        const condition = buildCondition("property", {
          name: "due",
          valueType: "date",
          condition: "eq",
          value: "2026-06-24",
        });
        expect(checkProperty(condition, meta({ properties: { due: 2026 } }))).toBe(false);
      });
    });
  });

  describe("checkDate", () => {
    it("matches when day, month, year all equal the period's anchor", () => {
      const period = DayPeriod.containing(date("2026-05-25"));
      const condition = buildCondition("date", { day: 25, month: 4, year: 2026 });
      expect(checkDate(condition, period)).toBe(true);
    });

    it("treats day === -1 as a wildcard", () => {
      const period = DayPeriod.containing(date("2026-05-25"));
      const condition = buildCondition("date", { day: -1, month: 4, year: 2026 });
      expect(checkDate(condition, period)).toBe(true);
    });

    it("treats year === null as any year", () => {
      const period = DayPeriod.containing(date("2026-05-25"));
      const condition = buildCondition("date", { day: 25, month: 4, year: null });
      expect(checkDate(condition, period)).toBe(true);
    });

    it("is false when the day mismatches a non-wildcard value", () => {
      const period = DayPeriod.containing(date("2026-05-25"));
      const condition = buildCondition("date", { day: 26, month: 4, year: null });
      expect(checkDate(condition, period)).toBe(false);
    });
  });

  describe("checkWeekday", () => {
    it("matches when the anchor's weekday is in the list", () => {
      // 2026-05-25 is a Monday → moment.day() === 1
      const period = DayPeriod.containing(date("2026-05-25"));
      const condition = buildCondition("weekday", { weekdays: [1, 3] });
      expect(checkWeekday(condition, period)).toBe(true);
    });

    it("is false on empty weekday list", () => {
      const period = DayPeriod.containing(date("2026-05-25"));
      const condition = buildCondition("weekday", { weekdays: [] });
      expect(checkWeekday(condition, period)).toBe(false);
    });
  });

  describe("checkOffset", () => {
    const journal = { name: "daily" } as JournalConfig;
    const period = DayPeriod.containing(date("2026-05-25"));

    it("matches the positive offset slot", () => {
      const condition = buildCondition("offset", { offset: 3 });
      const cycle = {
        offsets: () => ({ isNone: () => false, value: [3, -1] as const }),
      } as unknown as Pick<CycleService, "offsets">;
      expect(checkOffset(condition, period, journal, cycle)).toBe(true);
    });

    it("returns false when cycle.offsets is None", () => {
      const condition = buildCondition("offset", { offset: 3 });
      const cycle = {
        offsets: () => ({ isNone: () => true }),
      } as unknown as Pick<CycleService, "offsets">;
      expect(checkOffset(condition, period, journal, cycle)).toBe(false);
    });
  });

  describe("hasOpenTask", () => {
    it("is true when at least one task is open", () => {
      expect(hasOpenTask(meta({ tasks: [{ completed: true }, { completed: false }] }))).toBe(true);
    });

    it("is false when all tasks are completed", () => {
      expect(hasOpenTask(meta({ tasks: [{ completed: true }] }))).toBe(false);
    });

    it("is false on empty task list (v2 parity)", () => {
      expect(hasOpenTask(meta({ tasks: [] }))).toBe(false);
    });
  });

  describe("allTasksCompleted", () => {
    it("is true when every task is completed", () => {
      expect(allTasksCompleted(meta({ tasks: [{ completed: true }, { completed: true }] }))).toBe(true);
    });

    it("is false when any task is open", () => {
      expect(allTasksCompleted(meta({ tasks: [{ completed: true }, { completed: false }] }))).toBe(false);
    });

    it("is false on empty task list (v2 parity)", () => {
      expect(allTasksCompleted(meta({ tasks: [] }))).toBe(false);
    });
  });
});
