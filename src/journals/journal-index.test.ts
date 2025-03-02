import { describe, test, expect } from "vitest";
import { JournalIndex } from "./journal-index";
import { JournalAnchorDate } from "@/types/journal.types";

describe("JournalIndex", () => {
  test("has path by date", () => {
    const index = new JournalIndex();
    index.set(JournalAnchorDate("2022-01-01"), "path1");
    index.set(JournalAnchorDate("2022-01-02"), "path2");
    expect(index.has(JournalAnchorDate("2022-01-01"))).toBe(true);
    expect(index.has(JournalAnchorDate("2022-01-02"))).toBe(true);
    expect(index.has(JournalAnchorDate("2022-01-03"))).toBe(false);
  });

  test("stores path by date", () => {
    const index = new JournalIndex();
    index.set(JournalAnchorDate("2022-01-01"), "path1");
    index.set(JournalAnchorDate("2022-01-02"), "path2");
    expect(index.get(JournalAnchorDate("2022-01-01"))).toBe("path1");
    expect(index.get(JournalAnchorDate("2022-01-02"))).toBe("path2");
    expect(index.get(JournalAnchorDate("2022-01-03"))).toBe(null);
  });

  test("deletes path by date", () => {
    const index = new JournalIndex();
    index.set(JournalAnchorDate("2022-01-01"), "path1");
    index.set(JournalAnchorDate("2022-01-02"), "path2");
    index.delete(JournalAnchorDate("2022-01-01"));
    expect(index.get(JournalAnchorDate("2022-01-01"))).toBe(null);
    expect(index.get(JournalAnchorDate("2022-01-02"))).toBe("path2");
  });

  test("deletes by path", () => {
    const index = new JournalIndex();
    index.set(JournalAnchorDate("2022-01-01"), "path1");
    index.set(JournalAnchorDate("2022-01-02"), "path2");
    index.deleteForPath("path1");
    expect(index.get(JournalAnchorDate("2022-01-01"))).toBe(null);
    expect(index.get(JournalAnchorDate("2022-01-02"))).toBe("path2");
  });

  test("finds next known date", () => {
    const index = new JournalIndex();
    index.set(JournalAnchorDate("2022-01-01"), "path1");
    index.set(JournalAnchorDate("2022-01-02"), "path2");
    expect(index.findNext(JournalAnchorDate("2022-01-01"))).toBe("path2");
    expect(index.findNext(JournalAnchorDate("2022-01-02"))).toBe(null);
  });

  test("finds previous known date", () => {
    const index = new JournalIndex();
    index.set(JournalAnchorDate("2022-01-01"), "path1");
    index.set(JournalAnchorDate("2022-01-02"), "path2");
    expect(index.findPrevious(JournalAnchorDate("2022-01-01"))).toBe(null);
    expect(index.findPrevious(JournalAnchorDate("2022-01-02"))).toBe("path1");
  });

  describe("closest date", () => {
    const index = new JournalIndex();
    index.set(JournalAnchorDate("2022-01-01"), "path1");
    index.set(JournalAnchorDate("2022-01-02"), "path2");
    index.set(JournalAnchorDate("2022-01-04"), "path3");
    index.set(JournalAnchorDate("2022-11-10"), "path4");

    test("it should return first date for dates before known", () => {
      expect(index.findClosestDate("2021-12-31")).toBe(JournalAnchorDate("2022-01-01"));
    });

    test("it should return last date for dates after known", () => {
      expect(index.findClosestDate("2023-01-01")).toBe(JournalAnchorDate("2022-11-10"));
    });

    test("it should return known date if found", () => {
      expect(index.findClosestDate("2022-01-02")).toBe(JournalAnchorDate("2022-01-02"));
    });

    test("it should return closest previous date", () => {
      expect(index.findClosestDate("2022-01-05")).toBe(JournalAnchorDate("2022-01-04"));
    });
  });
});
