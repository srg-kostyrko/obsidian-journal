import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CustomIntervalResolver } from "./custom-interval";
import { JournalsIndex } from "./journals-index";
import { computed } from "vue";
import { JournalAnchorDate } from "@/types/journal.types";
import { updateLocale, restoreLocale } from "@/calendar";

describe("CustomIntervalResolver", () => {
  describe("10 days interval", () => {
    const journalName = "10 days";
    const index = new JournalsIndex();
    const resolver = new CustomIntervalResolver(
      journalName,
      computed(() => ({ type: "custom", every: "day", duration: 10, anchorDate: JournalAnchorDate("2022-01-01") })),
      index,
    );

    it("returns correct repeats", () => {
      expect(resolver.repeats).toBe(10);
    });
    it("returns correct duration", () => {
      expect(resolver.duration).toBe("day");
    });

    describe("calculating interval anchor date without index records", () => {
      it("returns journal anchor for date in first interval", () => {
        expect(resolver.resolveForDate("2022-01-01")).toBe("2022-01-01");
        expect(resolver.resolveForDate("2022-01-05")).toBe("2022-01-01");
        expect(resolver.resolveForDate("2022-01-10")).toBe("2022-01-01");
      });

      it("return next interval anchor date", () => {
        expect(resolver.resolveForDate("2022-01-11")).toBe("2022-01-11");
        expect(resolver.resolveForDate("2022-01-15")).toBe("2022-01-11");
        expect(resolver.resolveForDate("2022-01-20")).toBe("2022-01-11");
      });

      it("resolves interval after one missing repetition", () => {
        expect(resolver.resolveForDate("2022-01-21")).toBe("2022-01-21");
        expect(resolver.resolveForDate("2022-01-25")).toBe("2022-01-21");
        expect(resolver.resolveForDate("2022-01-30")).toBe("2022-01-21");
      });

      it("resolves interval after two missing repetitions", () => {
        expect(resolver.resolveForDate("2022-01-31")).toBe("2022-01-31");
        expect(resolver.resolveForDate("2022-02-04")).toBe("2022-01-31");
        expect(resolver.resolveForDate("2022-02-09")).toBe("2022-01-31");
      });

      it("resolves interval after many missing repetitions", () => {
        expect(resolver.resolveForDate("2022-03-02")).toBe("2022-03-02");
        expect(resolver.resolveForDate("2022-03-07")).toBe("2022-03-02");
        expect(resolver.resolveForDate("2022-03-11")).toBe("2022-03-02");
      });

      it("return previous interval anchor date", () => {
        expect(resolver.resolveForDate("2021-12-22")).toBe("2021-12-22");
        expect(resolver.resolveForDate("2021-12-27")).toBe("2021-12-22");
        expect(resolver.resolveForDate("2021-12-31")).toBe("2021-12-22");
      });
      it("return anchor date for date with one missing interval", () => {
        expect(resolver.resolveForDate("2021-12-12")).toBe("2021-12-12");
        expect(resolver.resolveForDate("2021-12-17")).toBe("2021-12-12");
        expect(resolver.resolveForDate("2021-12-21")).toBe("2021-12-12");
      });
      it("return anchor date for date with two missing intervals", () => {
        expect(resolver.resolveForDate("2021-12-02")).toBe("2021-12-02");
        expect(resolver.resolveForDate("2021-12-07")).toBe("2021-12-02");
        expect(resolver.resolveForDate("2021-12-11")).toBe("2021-12-02");
      });
      it("return anchor date for date with many missing intervals", () => {
        expect(resolver.resolveForDate("2021-09-13")).toBe("2021-09-13");
        expect(resolver.resolveForDate("2021-09-18")).toBe("2021-09-13");
        expect(resolver.resolveForDate("2021-09-22")).toBe("2021-09-13");
      });
    });

    describe("calculating interval anchor date with index records (no custom end date)", () => {
      beforeAll(() => {
        index.registerPathData("2022-05-01.md", {
          journal: journalName,
          date: JournalAnchorDate("2022-05-01"),
          title: "2022-05-01",
          path: "2022-05-01.md",
          tags: [],
          properties: {},
          tasks: [],
        });
      });

      afterAll(() => {
        index.unregisterPathData("2022-05-01.md");
      });

      it("returns anchor date from index", () => {
        expect(resolver.resolveForDate("2022-05-01")).toBe("2022-05-01");
        expect(resolver.resolveForDate("2022-05-05")).toBe("2022-05-01");
        expect(resolver.resolveForDate("2022-05-10")).toBe("2022-05-01");
      });

      it("resolves interval right after known", () => {
        expect(resolver.resolveForDate("2022-05-11")).toBe("2022-05-11");
        expect(resolver.resolveForDate("2022-05-15")).toBe("2022-05-11");
        expect(resolver.resolveForDate("2022-05-20")).toBe("2022-05-11");
      });

      it("resolves interval right before known", () => {
        expect(resolver.resolveForDate("2022-04-21")).toBe("2022-04-21");
        expect(resolver.resolveForDate("2022-04-26")).toBe("2022-04-21");
        expect(resolver.resolveForDate("2022-04-30")).toBe("2022-04-21");
      });
    });

    describe("calculating interval anchor date with index records (with custom end date)", () => {
      beforeAll(() => {
        index.registerPathData("2022-05-01.md", {
          journal: journalName,
          date: JournalAnchorDate("2022-05-01"),
          end_date: JournalAnchorDate("2022-05-20"),
          title: "2022-05-01",
          path: "2022-05-01.md",
          tags: [],
          properties: {},
          tasks: [],
        });
      });

      afterAll(() => {
        index.unregisterPathData("2022-05-01.md");
      });

      it("returns anchor date from index", () => {
        expect(resolver.resolveForDate("2022-05-01")).toBe("2022-05-01");
        expect(resolver.resolveForDate("2022-05-05")).toBe("2022-05-01");
        expect(resolver.resolveForDate("2022-05-20")).toBe("2022-05-01");
      });

      it("resolves interval right after known", () => {
        expect(resolver.resolveForDate("2022-05-21")).toBe("2022-05-21");
        expect(resolver.resolveForDate("2022-05-25")).toBe("2022-05-21");
        expect(resolver.resolveForDate("2022-05-30")).toBe("2022-05-21");
      });
    });

    describe("resolve next interval", () => {
      it("resolves next interval based on anchor date", () => {
        expect(resolver.resolveNext("2022-01-05")).toBe("2022-01-11");
      });

      it("resolves next interval based on index record", () => {
        index.registerPathData("2022-05-01.md", {
          journal: journalName,
          date: JournalAnchorDate("2022-05-01"),
          title: "2022-05-01",
          path: "2022-05-01.md",
          tags: [],
          properties: {},
          tasks: [],
        });

        expect(resolver.resolveNext("2022-05-05")).toBe("2022-05-11");

        index.unregisterPathData("2022-05-01.md");
      });

      it("resolves next interval based on index record with custom end", () => {
        index.registerPathData("2022-05-01.md", {
          journal: journalName,
          date: JournalAnchorDate("2022-05-01"),
          end_date: JournalAnchorDate("2022-05-20"),
          title: "2022-05-01",
          path: "2022-05-01.md",
          tags: [],
          properties: {},
          tasks: [],
        });

        expect(resolver.resolveNext("2022-05-05")).toBe("2022-05-21");

        index.unregisterPathData("2022-05-01.md");
      });
    });

    describe("resolve previous interval", () => {
      it("resolves previous interval based on anchor date", () => {
        expect(resolver.resolvePrevious("2022-01-05")).toBe("2021-12-22");
      });

      it("resolves previous interval based on index record", () => {
        index.registerPathData("2022-05-01.md", {
          journal: journalName,
          date: JournalAnchorDate("2022-05-01"),
          title: "2022-05-01",
          path: "2022-05-01.md",
          tags: [],
          properties: {},
          tasks: [],
        });

        expect(resolver.resolvePrevious("2022-05-05")).toBe("2022-04-21");

        index.unregisterPathData("2022-05-01.md");
      });

      it("resolves previous interval with custom end date", () => {
        index.registerPathData("2022-05-01.md", {
          journal: journalName,
          date: JournalAnchorDate("2022-05-01"),
          end_date: JournalAnchorDate("2022-05-20"),
          title: "2022-05-01",
          path: "2022-05-01.md",
          tags: [],
          properties: {},
          tasks: [],
        });

        expect(resolver.resolvePrevious("2022-05-25")).toBe("2022-05-01");

        index.unregisterPathData("2022-05-01.md");
      });
    });

    it("should resolve date for command", () => {
      expect(resolver.resolveDateForCommand("2022-01-05", "same")).toBe("2022-01-01");
      expect(resolver.resolveDateForCommand("2022-01-05", "next")).toBe("2022-01-11");
      expect(resolver.resolveDateForCommand("2022-01-05", "previous")).toBe("2021-12-22");
    });

    it("should resolve start date of interval", () => {
      expect(resolver.resolveStartDate(JournalAnchorDate("2022-01-01"))).toBe("2022-01-01");
    });

    it("should resolve end date of interval", () => {
      expect(resolver.resolveEndDate(JournalAnchorDate("2022-01-01"))).toBe("2022-01-10");
    });

    it("should resolve custom end date of interval", () => {
      index.registerPathData("2022-05-01.md", {
        journal: journalName,
        date: JournalAnchorDate("2022-05-01"),
        end_date: JournalAnchorDate("2022-05-20"),
        title: "2022-05-01",
        path: "2022-05-01.md",
        tags: [],
        properties: {},
        tasks: [],
      });

      expect(resolver.resolveEndDate(JournalAnchorDate("2022-05-01"))).toBe("2022-05-20");

      index.unregisterPathData("2022-05-01.md");
    });

    // TODO test relative dates (need to find a way to override today)

    it("should calculate offset", () => {
      expect(resolver.calculateOffset("2022-01-05")).toStrictEqual([5, -6]);
    });

    it("should calculate offset with custom end date", () => {
      index.registerPathData("2022-05-01.md", {
        journal: journalName,
        date: JournalAnchorDate("2022-05-01"),
        end_date: JournalAnchorDate("2022-05-20"),
        title: "2022-05-01",
        path: "2022-05-01.md",
        tags: [],
        properties: {},
        tasks: [],
      });

      expect(resolver.calculateOffset("2022-05-05")).toStrictEqual([5, -16]);

      index.unregisterPathData("2022-05-01.md");
    });

    it("should calculate repeats", () => {
      expect(resolver.countRepeats("2022-01-21", "2022-01-01")).toBe(-2);
      expect(resolver.countRepeats("2022-01-11", "2022-01-01")).toBe(-1);
      expect(resolver.countRepeats("2022-01-01", "2022-01-10")).toBe(0);
      expect(resolver.countRepeats("2022-01-01", "2022-01-11")).toBe(1);
      expect(resolver.countRepeats("2022-01-01", "2022-01-21")).toBe(2);
    });

    it("should calculate repeats with custom end dates", () => {
      index.registerPathData("2022-05-01.md", {
        journal: journalName,
        date: JournalAnchorDate("2022-05-01"),
        end_date: JournalAnchorDate("2022-05-20"),
        title: "2022-05-01",
        path: "2022-05-01.md",
        tags: [],
        properties: {},
        tasks: [],
      });

      expect(resolver.countRepeats("2022-05-21", "2022-05-01")).toBe(-1);
      expect(resolver.countRepeats("2022-05-01", "2022-05-11")).toBe(0);
      expect(resolver.countRepeats("2022-05-01", "2022-05-21")).toBe(1);

      index.unregisterPathData("2022-05-01.md");
    });
  });

  describe("2 weeks interval", () => {
    const journalName = "2 weeks";
    const index = new JournalsIndex();
    const resolver = new CustomIntervalResolver(
      journalName,
      computed(() => ({ type: "custom", every: "week", duration: 2, anchorDate: JournalAnchorDate("2022-01-03") })),
      index,
    );

    beforeAll(() => {
      updateLocale(1, 4);
    });

    afterAll(() => {
      restoreLocale();
    });

    it("returns correct repeats", () => {
      expect(resolver.repeats).toBe(2);
    });
    it("returns correct duration", () => {
      expect(resolver.duration).toBe("week");
    });

    describe("calculating interval anchor date without index records", () => {
      it("returns journal anchor for date in first interval", () => {
        expect(resolver.resolveForDate("2022-01-03")).toBe("2022-01-03");
        expect(resolver.resolveForDate("2022-01-10")).toBe("2022-01-03");
        expect(resolver.resolveForDate("2022-01-16")).toBe("2022-01-03");
      });

      it("return next interval anchor date", () => {
        expect(resolver.resolveForDate("2022-01-17")).toBe("2022-01-17");
        expect(resolver.resolveForDate("2022-01-24")).toBe("2022-01-17");
        expect(resolver.resolveForDate("2022-01-30")).toBe("2022-01-17");
      });

      it("resolves interval after one missing repetition", () => {
        expect(resolver.resolveForDate("2022-01-31")).toBe("2022-01-31");
        expect(resolver.resolveForDate("2022-02-07")).toBe("2022-01-31");
        expect(resolver.resolveForDate("2022-02-13")).toBe("2022-01-31");
      });

      it("resolves interval after two missing repetitions", () => {
        expect(resolver.resolveForDate("2022-02-14")).toBe("2022-02-14");
        expect(resolver.resolveForDate("2022-02-21")).toBe("2022-02-14");
        expect(resolver.resolveForDate("2022-02-27")).toBe("2022-02-14");
      });

      it("resolves interval after many missing repetitions", () => {
        expect(resolver.resolveForDate("2022-04-25")).toBe("2022-04-25");
        expect(resolver.resolveForDate("2022-05-02")).toBe("2022-04-25");
        expect(resolver.resolveForDate("2022-05-08")).toBe("2022-04-25");
      });

      it("return previous interval anchor date", () => {
        expect(resolver.resolveForDate("2021-12-20")).toBe("2021-12-20");
        expect(resolver.resolveForDate("2021-12-27")).toBe("2021-12-20");
        expect(resolver.resolveForDate("2022-01-02")).toBe("2021-12-20");
      });
      it("return anchor date for date with one missing interval", () => {
        expect(resolver.resolveForDate("2021-12-06")).toBe("2021-12-06");
        expect(resolver.resolveForDate("2021-12-13")).toBe("2021-12-06");
        expect(resolver.resolveForDate("2021-12-19")).toBe("2021-12-06");
      });
      it("return anchor date for date with two missing intervals", () => {
        expect(resolver.resolveForDate("2021-11-22")).toBe("2021-11-22");
        expect(resolver.resolveForDate("2021-11-29")).toBe("2021-11-22");
        expect(resolver.resolveForDate("2021-12-05")).toBe("2021-11-22");
      });
      it("return anchor date for date with many missing intervals", () => {
        expect(resolver.resolveForDate("2021-09-13")).toBe("2021-09-13");
        expect(resolver.resolveForDate("2021-09-18")).toBe("2021-09-13");
        expect(resolver.resolveForDate("2021-09-22")).toBe("2021-09-13");
      });
    });

    describe("calculating interval anchor date with index records (no custom end date)", () => {
      beforeAll(() => {
        index.registerPathData("2022-05-02.md", {
          journal: journalName,
          date: JournalAnchorDate("2022-05-02"),
          title: "2022-05-02",
          path: "2022-05-02.md",
          tags: [],
          properties: {},
          tasks: [],
        });
      });

      afterAll(() => {
        index.unregisterPathData("2022-05-02.md");
      });

      it("returns anchor date from index", () => {
        expect(resolver.resolveForDate("2022-05-02")).toBe("2022-05-02");
        expect(resolver.resolveForDate("2022-05-09")).toBe("2022-05-02");
        expect(resolver.resolveForDate("2022-05-15")).toBe("2022-05-02");
      });

      it("resolves interval right after known", () => {
        expect(resolver.resolveForDate("2022-05-16")).toBe("2022-05-16");
        expect(resolver.resolveForDate("2022-05-23")).toBe("2022-05-16");
        expect(resolver.resolveForDate("2022-05-29")).toBe("2022-05-16");
      });

      it("resolves interval right before known", () => {
        expect(resolver.resolveForDate("2022-04-18")).toBe("2022-04-18");
        expect(resolver.resolveForDate("2022-04-25")).toBe("2022-04-18");
        expect(resolver.resolveForDate("2022-05-01")).toBe("2022-04-18");
      });
    });

    describe("calculating interval anchor date with index records (with custom end date)", () => {
      beforeAll(() => {
        index.registerPathData("2022-05-02.md", {
          journal: journalName,
          date: JournalAnchorDate("2022-05-02"),
          end_date: JournalAnchorDate("2022-05-22"),
          title: "2022-05-02",
          path: "2022-05-02.md",
          tags: [],
          properties: {},
          tasks: [],
        });
      });

      afterAll(() => {
        index.unregisterPathData("2022-05-02.md");
      });

      it("returns anchor date from index", () => {
        expect(resolver.resolveForDate("2022-05-02")).toBe("2022-05-02");
        expect(resolver.resolveForDate("2022-05-15")).toBe("2022-05-02");
        expect(resolver.resolveForDate("2022-05-22")).toBe("2022-05-02");
      });

      it("resolves interval right after known", () => {
        expect(resolver.resolveForDate("2022-05-23")).toBe("2022-05-23");
        expect(resolver.resolveForDate("2022-05-25")).toBe("2022-05-23");
        expect(resolver.resolveForDate("2022-06-05")).toBe("2022-05-23");
      });
    });

    describe("resolve next interval", () => {
      it("resolves next interval based on anchor date", () => {
        expect(resolver.resolveNext("2022-01-03")).toBe("2022-01-17");
      });

      it("resolves next interval based on index record", () => {
        index.registerPathData("2022-05-02.md", {
          journal: journalName,
          date: JournalAnchorDate("2022-05-02"),
          title: "2022-05-02",
          path: "2022-05-02.md",
          tags: [],
          properties: {},
          tasks: [],
        });

        expect(resolver.resolveNext("2022-05-05")).toBe("2022-05-16");

        index.unregisterPathData("2022-05-02.md");
      });

      it("resolves next interval based on index record with custom end", () => {
        index.registerPathData("2022-05-02.md", {
          journal: journalName,
          date: JournalAnchorDate("2022-05-02"),
          end_date: JournalAnchorDate("2022-05-22"),
          title: "2022-05-01",
          path: "2022-05-01.md",
          tags: [],
          properties: {},
          tasks: [],
        });

        expect(resolver.resolveNext("2022-05-05")).toBe("2022-05-23");

        index.unregisterPathData("2022-05-02.md");
      });
    });

    describe("resolve previous interval", () => {
      it("resolves previous interval based on anchor date", () => {
        expect(resolver.resolvePrevious("2022-01-05")).toBe("2021-12-20");
      });

      it("resolves previous interval based on index record", () => {
        index.registerPathData("2022-05-02.md", {
          journal: journalName,
          date: JournalAnchorDate("2022-05-02"),
          title: "2022-05-02",
          path: "2022-05-02.md",
          tags: [],
          properties: {},
          tasks: [],
        });

        expect(resolver.resolvePrevious("2022-05-05")).toBe("2022-04-18");

        index.unregisterPathData("2022-05-02.md");
      });

      it("resolves previous interval with custom end date", () => {
        index.registerPathData("2022-05-02.md", {
          journal: journalName,
          date: JournalAnchorDate("2022-05-02"),
          end_date: JournalAnchorDate("2022-05-22"),
          title: "2022-05-02",
          path: "2022-05-02.md",
          tags: [],
          properties: {},
          tasks: [],
        });

        expect(resolver.resolvePrevious("2022-05-25")).toBe("2022-05-02");

        index.unregisterPathData("2022-05-02.md");
      });
    });

    it("should resolve date for command", () => {
      expect(resolver.resolveDateForCommand("2022-01-05", "same")).toBe("2022-01-03");
      expect(resolver.resolveDateForCommand("2022-01-05", "next")).toBe("2022-01-17");
      expect(resolver.resolveDateForCommand("2022-01-05", "previous")).toBe("2021-12-20");
    });

    it("should resolve start date of interval", () => {
      expect(resolver.resolveStartDate(JournalAnchorDate("2022-01-03"))).toBe("2022-01-03");
    });

    it("should resolve end date of interval", () => {
      expect(resolver.resolveEndDate(JournalAnchorDate("2022-01-03"))).toBe("2022-01-16");
    });

    it("should resolve custom end date of interval", () => {
      index.registerPathData("2022-05-02.md", {
        journal: journalName,
        date: JournalAnchorDate("2022-05-02"),
        end_date: JournalAnchorDate("2022-05-22"),
        title: "2022-05-02",
        path: "2022-05-02.md",
        tags: [],
        properties: {},
        tasks: [],
      });

      expect(resolver.resolveEndDate(JournalAnchorDate("2022-05-02"))).toBe("2022-05-22");

      index.unregisterPathData("2022-05-02.md");
    });

    // TODO test relative dates (need to find a way to override today)

    it("should calculate offset", () => {
      expect(resolver.calculateOffset("2022-01-05")).toStrictEqual([3, -12]);
    });

    it("should calculate offset with custom end date", () => {
      index.registerPathData("2022-05-02.md", {
        journal: journalName,
        date: JournalAnchorDate("2022-05-02"),
        end_date: JournalAnchorDate("2022-05-22"),
        title: "2022-05-02",
        path: "2022-05-02.md",
        tags: [],
        properties: {},
        tasks: [],
      });

      expect(resolver.calculateOffset("2022-05-05")).toStrictEqual([4, -18]);

      index.unregisterPathData("2022-05-02.md");
    });

    it("should calculate repeats", () => {
      expect(resolver.countRepeats("2022-01-31", "2022-01-03")).toBe(-2);
      expect(resolver.countRepeats("2022-01-17", "2022-01-03")).toBe(-1);
      expect(resolver.countRepeats("2022-01-03", "2022-01-16")).toBe(0);
      expect(resolver.countRepeats("2022-01-03", "2022-01-17")).toBe(1);
      expect(resolver.countRepeats("2022-01-03", "2022-01-31")).toBe(2);
    });

    it("should calculate repeats with custom end dates", () => {
      index.registerPathData("2022-05-02.md", {
        journal: journalName,
        date: JournalAnchorDate("2022-05-02"),
        end_date: JournalAnchorDate("2022-05-22"),
        title: "2022-05-02",
        path: "2022-05-02.md",
        tags: [],
        properties: {},
        tasks: [],
      });

      expect(resolver.countRepeats("2022-05-23", "2022-05-02")).toBe(-1);
      expect(resolver.countRepeats("2022-05-02", "2022-05-22")).toBe(0);
      expect(resolver.countRepeats("2022-05-02", "2022-05-23")).toBe(1);

      index.unregisterPathData("2022-05-02.md");
    });
  });

  describe("3 months interval", () => {
    const journalName = "3 month";
    const index = new JournalsIndex();
    const resolver = new CustomIntervalResolver(
      journalName,
      computed(() => ({ type: "custom", every: "month", duration: 3, anchorDate: JournalAnchorDate("2022-02-01") })),
      index,
    );

    it("returns correct repeats", () => {
      expect(resolver.repeats).toBe(3);
    });
    it("returns correct duration", () => {
      expect(resolver.duration).toBe("month");
    });

    describe("calculating interval anchor date without index records", () => {
      it("returns journal anchor for date in first interval", () => {
        expect(resolver.resolveForDate("2022-02-01")).toBe("2022-02-01");
        expect(resolver.resolveForDate("2022-03-10")).toBe("2022-02-01");
        expect(resolver.resolveForDate("2022-04-30")).toBe("2022-02-01");
      });

      it("return next interval anchor date", () => {
        expect(resolver.resolveForDate("2022-05-01")).toBe("2022-05-01");
        expect(resolver.resolveForDate("2022-06-24")).toBe("2022-05-01");
        expect(resolver.resolveForDate("2022-07-31")).toBe("2022-05-01");
      });

      it("resolves interval after one missing repetition", () => {
        expect(resolver.resolveForDate("2022-08-01")).toBe("2022-08-01");
        expect(resolver.resolveForDate("2022-09-07")).toBe("2022-08-01");
        expect(resolver.resolveForDate("2022-10-31")).toBe("2022-08-01");
      });

      it("resolves interval after two missing repetitions", () => {
        expect(resolver.resolveForDate("2022-11-01")).toBe("2022-11-01");
        expect(resolver.resolveForDate("2022-12-21")).toBe("2022-11-01");
        expect(resolver.resolveForDate("2023-01-31")).toBe("2022-11-01");
      });

      it("resolves interval after many missing repetitions", () => {
        expect(resolver.resolveForDate("2023-05-01")).toBe("2023-05-01");
        expect(resolver.resolveForDate("2023-06-02")).toBe("2023-05-01");
        expect(resolver.resolveForDate("2023-07-30")).toBe("2023-05-01");
      });

      it("return previous interval anchor date", () => {
        expect(resolver.resolveForDate("2021-11-01")).toBe("2021-11-01");
        expect(resolver.resolveForDate("2021-12-27")).toBe("2021-11-01");
        expect(resolver.resolveForDate("2022-01-31")).toBe("2021-11-01");
      });
      it("return anchor date for date with one missing interval", () => {
        expect(resolver.resolveForDate("2021-08-01")).toBe("2021-08-01");
        expect(resolver.resolveForDate("2021-09-13")).toBe("2021-08-01");
        expect(resolver.resolveForDate("2021-10-30")).toBe("2021-08-01");
      });
      it("return anchor date for date with two missing intervals", () => {
        expect(resolver.resolveForDate("2021-05-01")).toBe("2021-05-01");
        expect(resolver.resolveForDate("2021-06-29")).toBe("2021-05-01");
        expect(resolver.resolveForDate("2021-07-31")).toBe("2021-05-01");
      });
      it("return anchor date for date with many missing intervals", () => {
        expect(resolver.resolveForDate("2020-11-01")).toBe("2020-11-01");
        expect(resolver.resolveForDate("2020-12-18")).toBe("2020-11-01");
        expect(resolver.resolveForDate("2021-01-31")).toBe("2020-11-01");
      });
    });

    describe("calculating interval anchor date with index records (no custom end date)", () => {
      beforeAll(() => {
        index.registerPathData("2022-05-01.md", {
          journal: journalName,
          date: JournalAnchorDate("2022-05-01"),
          title: "2022-05-01",
          path: "2022-05-01.md",
          tags: [],
          properties: {},
          tasks: [],
        });
      });

      afterAll(() => {
        index.unregisterPathData("2022-05-01.md");
      });

      it("returns anchor date from index", () => {
        expect(resolver.resolveForDate("2022-05-01")).toBe("2022-05-01");
        expect(resolver.resolveForDate("2022-06-09")).toBe("2022-05-01");
        expect(resolver.resolveForDate("2022-07-31")).toBe("2022-05-01");
      });

      it("resolves interval right after known", () => {
        expect(resolver.resolveForDate("2022-08-01")).toBe("2022-08-01");
        expect(resolver.resolveForDate("2022-09-23")).toBe("2022-08-01");
        expect(resolver.resolveForDate("2022-10-29")).toBe("2022-08-01");
      });

      it("resolves interval right before known", () => {
        expect(resolver.resolveForDate("2022-02-01")).toBe("2022-02-01");
        expect(resolver.resolveForDate("2022-03-25")).toBe("2022-02-01");
        expect(resolver.resolveForDate("2022-04-30")).toBe("2022-02-01");
      });
    });

    describe("calculating interval anchor date with index records (with custom end date)", () => {
      beforeAll(() => {
        index.registerPathData("2022-05-01.md", {
          journal: journalName,
          date: JournalAnchorDate("2022-05-01"),
          end_date: JournalAnchorDate("2022-08-31"),
          title: "2022-05-01",
          path: "2022-05-01.md",
          tags: [],
          properties: {},
          tasks: [],
        });
      });

      afterAll(() => {
        index.unregisterPathData("2022-05-01.md");
      });

      it("returns anchor date from index", () => {
        expect(resolver.resolveForDate("2022-05-01")).toBe("2022-05-01");
        expect(resolver.resolveForDate("2022-06-15")).toBe("2022-05-01");
        expect(resolver.resolveForDate("2022-08-31")).toBe("2022-05-01");
      });

      it("resolves interval right after known", () => {
        expect(resolver.resolveForDate("2022-09-01")).toBe("2022-09-01");
        expect(resolver.resolveForDate("2022-10-25")).toBe("2022-09-01");
        expect(resolver.resolveForDate("2022-11-30")).toBe("2022-09-01");
      });
    });

    describe("resolve next interval", () => {
      it("resolves next interval based on anchor date", () => {
        expect(resolver.resolveNext("2022-02-01")).toBe("2022-05-01");
      });

      it("resolves next interval based on index record", () => {
        index.registerPathData("2022-05-01.md", {
          journal: journalName,
          date: JournalAnchorDate("2022-05-01"),
          title: "2022-05-01",
          path: "2022-05-01.md",
          tags: [],
          properties: {},
          tasks: [],
        });

        expect(resolver.resolveNext("2022-05-05")).toBe("2022-08-01");

        index.unregisterPathData("2022-05-01.md");
      });

      it("resolves next interval based on index record with custom end", () => {
        index.registerPathData("2022-05-01.md", {
          journal: journalName,
          date: JournalAnchorDate("2022-05-01"),
          end_date: JournalAnchorDate("2022-08-31"),
          title: "2022-05-01",
          path: "2022-05-01.md",
          tags: [],
          properties: {},
          tasks: [],
        });

        expect(resolver.resolveNext("2022-05-05")).toBe("2022-09-01");

        index.unregisterPathData("2022-05-01.md");
      });
    });

    describe("resolve previous interval", () => {
      it("resolves previous interval based on anchor date", () => {
        expect(resolver.resolvePrevious("2022-02-01")).toBe("2021-11-01");
      });

      it("resolves previous interval based on index record", () => {
        index.registerPathData("2022-05-01.md", {
          journal: journalName,
          date: JournalAnchorDate("2022-05-01"),
          title: "2022-05-01",
          path: "2022-05-01.md",
          tags: [],
          properties: {},
          tasks: [],
        });

        expect(resolver.resolvePrevious("2022-05-05")).toBe("2022-02-01");

        index.unregisterPathData("2022-05-01.md");
      });

      it("resolves previous interval with custom end date", () => {
        index.registerPathData("2022-05-01.md", {
          journal: journalName,
          date: JournalAnchorDate("2022-05-01"),
          end_date: JournalAnchorDate("2022-08-31"),
          title: "2022-05-01",
          path: "2022-05-01.md",
          tags: [],
          properties: {},
          tasks: [],
        });

        expect(resolver.resolvePrevious("2022-09-25")).toBe("2022-05-01");

        index.unregisterPathData("2022-05-01.md");
      });
    });

    it("should resolve date for command", () => {
      expect(resolver.resolveDateForCommand("2022-02-01", "same")).toBe("2022-02-01");
      expect(resolver.resolveDateForCommand("2022-02-01", "next")).toBe("2022-05-01");
      expect(resolver.resolveDateForCommand("2022-02-01", "previous")).toBe("2021-11-01");
    });

    it("should resolve start date of interval", () => {
      expect(resolver.resolveStartDate(JournalAnchorDate("2022-02-01"))).toBe("2022-02-01");
    });

    it("should resolve end date of interval", () => {
      expect(resolver.resolveEndDate(JournalAnchorDate("2022-02-01"))).toBe("2022-04-30");
    });

    it("should resolve custom end date of interval", () => {
      index.registerPathData("2022-05-01.md", {
        journal: journalName,
        date: JournalAnchorDate("2022-05-01"),
        end_date: JournalAnchorDate("2022-08-31"),
        title: "2022-05-01",
        path: "2022-05-01.md",
        tags: [],
        properties: {},
        tasks: [],
      });

      expect(resolver.resolveEndDate(JournalAnchorDate("2022-05-01"))).toBe("2022-08-31");

      index.unregisterPathData("2022-05-01.md");
    });

    // TODO test relative dates (need to find a way to override today)

    it("should calculate offset", () => {
      expect(resolver.calculateOffset("2022-02-05")).toStrictEqual([5, -85]);
    });

    it("should calculate offset with custom end date", () => {
      index.registerPathData("2022-05-01.md", {
        journal: journalName,
        date: JournalAnchorDate("2022-05-01"),
        end_date: JournalAnchorDate("2022-08-31"),
        title: "2022-05-01",
        path: "2022-05-01.md",
        tags: [],
        properties: {},
        tasks: [],
      });

      expect(resolver.calculateOffset("2022-05-05")).toStrictEqual([5, -119]);

      index.unregisterPathData("2022-05-01.md");
    });

    it("should calculate repeats", () => {
      expect(resolver.countRepeats("2022-08-01", "2022-02-01")).toBe(-2);
      expect(resolver.countRepeats("2022-05-01", "2022-02-01")).toBe(-1);
      expect(resolver.countRepeats("2022-02-01", "2022-04-30")).toBe(0);
      expect(resolver.countRepeats("2022-02-01", "2022-05-01")).toBe(1);
      expect(resolver.countRepeats("2022-02-01", "2022-08-01")).toBe(2);
    });

    it("should calculate repeats with custom end dates", () => {
      index.registerPathData("2022-05-01.md", {
        journal: journalName,
        date: JournalAnchorDate("2022-05-01"),
        end_date: JournalAnchorDate("2022-08-31"),
        title: "2022-05-01",
        path: "2022-05-01.md",
        tags: [],
        properties: {},
        tasks: [],
      });

      expect(resolver.countRepeats("2022-09-01", "2022-05-01")).toBe(-1);
      expect(resolver.countRepeats("2022-05-01", "2022-08-31")).toBe(0);
      expect(resolver.countRepeats("2022-05-01", "2022-09-01")).toBe(1);

      index.unregisterPathData("2022-05-01.md");
    });
  });

  describe("3 months interval starting at the end of month", () => {
    const journalName = "3 month";
    const index = new JournalsIndex();
    const resolver = new CustomIntervalResolver(
      journalName,
      computed(() => ({ type: "custom", every: "month", duration: 3, anchorDate: JournalAnchorDate("2022-01-31") })),
      index,
    );

    it("returns correct repeats", () => {
      expect(resolver.repeats).toBe(3);
    });
    it("returns correct duration", () => {
      expect(resolver.duration).toBe("month");
    });

    describe("calculating interval anchor date without index records", () => {
      it("returns journal anchor for date in first interval", () => {
        expect(resolver.resolveForDate("2022-01-31")).toBe("2022-01-31");
        expect(resolver.resolveForDate("2022-02-21")).toBe("2022-01-31");
        expect(resolver.resolveForDate("2022-04-29")).toBe("2022-01-31");
      });

      it("return next interval anchor date", () => {
        expect(resolver.resolveForDate("2022-04-30")).toBe("2022-04-30");
        expect(resolver.resolveForDate("2022-05-24")).toBe("2022-04-30");
        expect(resolver.resolveForDate("2022-07-30")).toBe("2022-04-30");
      });

      it("resolves interval after one missing repetition", () => {
        expect(resolver.resolveForDate("2022-07-31")).toBe("2022-07-31");
        expect(resolver.resolveForDate("2022-09-07")).toBe("2022-07-31");
        expect(resolver.resolveForDate("2022-10-30")).toBe("2022-07-31");
      });

      it("resolves interval after two missing repetitions", () => {
        expect(resolver.resolveForDate("2022-10-31")).toBe("2022-10-31");
        expect(resolver.resolveForDate("2022-11-21")).toBe("2022-10-31");
        expect(resolver.resolveForDate("2023-01-30")).toBe("2022-10-31");
      });

      it("resolves interval after many missing repetitions", () => {
        expect(resolver.resolveForDate("2023-07-31")).toBe("2023-07-31");
        expect(resolver.resolveForDate("2023-09-07")).toBe("2023-07-31");
        expect(resolver.resolveForDate("2023-10-30")).toBe("2023-07-31");
      });

      it("return previous interval anchor date", () => {
        expect(resolver.resolveForDate("2021-10-31")).toBe("2021-10-31");
        expect(resolver.resolveForDate("2021-11-27")).toBe("2021-10-31");
        expect(resolver.resolveForDate("2022-01-30")).toBe("2021-10-31");
      });
      it("return anchor date for date with one missing interval", () => {
        expect(resolver.resolveForDate("2021-07-31")).toBe("2021-07-31");
        expect(resolver.resolveForDate("2021-09-13")).toBe("2021-07-31");
        expect(resolver.resolveForDate("2021-10-30")).toBe("2021-07-31");
      });
      it("return anchor date for date with two missing intervals", () => {
        expect(resolver.resolveForDate("2021-04-30")).toBe("2021-04-30");
        expect(resolver.resolveForDate("2021-06-29")).toBe("2021-04-30");
        expect(resolver.resolveForDate("2021-07-30")).toBe("2021-04-30");
      });
      it("return anchor date for date with many missing intervals", () => {
        expect(resolver.resolveForDate("2020-07-31")).toBe("2020-07-31");
        expect(resolver.resolveForDate("2020-09-07")).toBe("2020-07-31");
        expect(resolver.resolveForDate("2020-10-30")).toBe("2020-07-31");
      });
    });

    describe("calculating interval anchor date with index records (no custom end date)", () => {
      beforeAll(() => {
        index.registerPathData("2023-01-31.md", {
          journal: journalName,
          date: JournalAnchorDate("2023-01-31"),
          title: "2023-01-31",
          path: "2023-01-31.md",
          tags: [],
          properties: {},
          tasks: [],
        });
      });

      afterAll(() => {
        index.unregisterPathData("2023-01-31.md");
      });

      it("returns anchor date from index", () => {
        expect(resolver.resolveForDate("2023-01-31")).toBe("2023-01-31");
        expect(resolver.resolveForDate("2023-02-21")).toBe("2023-01-31");
        expect(resolver.resolveForDate("2023-04-29")).toBe("2023-01-31");
      });

      it("resolves interval right after known", () => {
        expect(resolver.resolveForDate("2023-04-30")).toBe("2023-04-30");
        expect(resolver.resolveForDate("2023-05-24")).toBe("2023-04-30");
        expect(resolver.resolveForDate("2023-07-30")).toBe("2023-04-30");
      });

      it("resolves interval right before known", () => {
        expect(resolver.resolveForDate("2022-10-31")).toBe("2022-10-31");
        expect(resolver.resolveForDate("2022-11-27")).toBe("2022-10-31");
        expect(resolver.resolveForDate("2023-01-30")).toBe("2022-10-31");
      });
    });

    describe("resolve next interval", () => {
      it("resolves next interval based on anchor date", () => {
        expect(resolver.resolveNext("2022-01-31")).toBe("2022-04-30");
      });

      it("resolves next interval based on index record", () => {
        index.registerPathData("2023-01-31.md", {
          journal: journalName,
          date: JournalAnchorDate("2023-01-31"),
          title: "2023-01-31",
          path: "2023-01-31.md",
          tags: [],
          properties: {},
          tasks: [],
        });

        expect(resolver.resolveNext("2023-05-05")).toBe("2023-07-31");

        index.unregisterPathData("2023-01-31.md");
      });
    });

    describe("resolve previous interval", () => {
      it("resolves previous interval based on anchor date", () => {
        expect(resolver.resolvePrevious("2022-01-31")).toBe("2021-10-31");
      });

      it("resolves previous interval based on index record", () => {
        index.registerPathData("2023-01-31.md", {
          journal: journalName,
          date: JournalAnchorDate("2023-01-31"),
          title: "2023-01-31",
          path: "2023-01-31.md",
          tags: [],
          properties: {},
          tasks: [],
        });

        expect(resolver.resolvePrevious("2023-05-05")).toBe("2023-01-31");

        index.unregisterPathData("2023-01-31.md");
      });
    });

    it("should resolve date for command", () => {
      expect(resolver.resolveDateForCommand("2022-01-31", "same")).toBe("2022-01-31");
      expect(resolver.resolveDateForCommand("2022-01-31", "next")).toBe("2022-04-30");
      expect(resolver.resolveDateForCommand("2022-01-31", "previous")).toBe("2021-10-31");
    });

    it("should resolve start date of interval", () => {
      expect(resolver.resolveStartDate(JournalAnchorDate("2022-01-31"))).toBe("2022-01-31");
    });

    it("should resolve end date of interval", () => {
      expect(resolver.resolveEndDate(JournalAnchorDate("2022-01-31"))).toBe("2022-04-29");
    });

    it("should calculate offset", () => {
      expect(resolver.calculateOffset("2022-02-05")).toStrictEqual([6, -84]);
    });

    it("should calculate repeats", () => {
      expect(resolver.countRepeats("2022-08-01", "2022-02-01")).toBe(-2);
      expect(resolver.countRepeats("2022-05-01", "2022-02-01")).toBe(-1);
      expect(resolver.countRepeats("2022-02-01", "2022-04-29")).toBe(0);
      expect(resolver.countRepeats("2022-02-01", "2022-05-01")).toBe(1);
      expect(resolver.countRepeats("2022-02-01", "2022-08-01")).toBe(2);
    });
  });
});
