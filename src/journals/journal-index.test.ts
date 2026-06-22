import { assert, describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";

import { JournalIndex } from "./journal-index";

const a = (s: string) => s as AnchorString;
const p = (s: string) => s as VaultPath;

function buildRangeIndex(): JournalIndex {
  const index = new JournalIndex();
  index.set(a("2022-01-01"), p("notes/a.md"));
  index.set(a("2022-01-05"), p("notes/b.md"));
  index.set(a("2022-01-10"), p("notes/c.md"));
  index.set(a("2022-02-01"), p("notes/d.md"));
  return index;
}

function buildFindIndex(): JournalIndex {
  const index = new JournalIndex();
  index.set(a("2022-01-01"), p("notes/a.md"));
  index.set(a("2022-01-05"), p("notes/b.md"));
  index.set(a("2022-01-10"), p("notes/c.md"));
  return index;
}

function buildClosestIndex(): JournalIndex {
  const index = new JournalIndex();
  index.set(a("2022-01-01"), p("notes/a.md"));
  index.set(a("2022-01-02"), p("notes/b.md"));
  index.set(a("2022-01-04"), p("notes/c.md"));
  index.set(a("2022-11-10"), p("notes/d.md"));
  return index;
}

describe("JournalIndex", () => {
  describe("get", () => {
    it("returns the path when anchor exists", () => {
      const index = new JournalIndex();
      index.set(a("2022-01-01"), p("notes/2022-01-01.md"));
      const result = index.get(a("2022-01-01"));
      assert(result.isSome());
      expect(result.value).toBe(p("notes/2022-01-01.md"));
    });

    it("returns None when anchor is absent", () => {
      const index = new JournalIndex();
      index.set(a("2022-01-01"), p("notes/2022-01-01.md"));
      expect(index.get(a("2022-01-02")).isNone()).toBe(true);
    });
  });

  describe("has", () => {
    it("returns true for a known anchor", () => {
      const index = new JournalIndex();
      index.set(a("2022-01-01"), p("notes/a.md"));
      expect(index.has(a("2022-01-01"))).toBe(true);
    });

    it("returns false for an unknown anchor", () => {
      const index = new JournalIndex();
      expect(index.has(a("2022-01-01"))).toBe(false);
    });
  });

  describe("set", () => {
    it("overwrites the path when anchor already exists", () => {
      const index = new JournalIndex();
      index.set(a("2022-01-01"), p("notes/a.md"));
      index.set(a("2022-01-01"), p("notes/b.md"));
      const result = index.get(a("2022-01-01"));
      assert(result.isSome());
      expect(result.value).toBe(p("notes/b.md"));
    });

    it("does not duplicate the anchor in ordering after overwrite", () => {
      const index = new JournalIndex();
      index.set(a("2022-01-01"), p("notes/a.md"));
      index.set(a("2022-01-01"), p("notes/b.md"));
      expect(index.size).toBe(1);
      expect([...index]).toEqual([[a("2022-01-01"), p("notes/b.md")]]);
    });
  });

  describe("delete", () => {
    it("removes the entry", () => {
      const index = new JournalIndex();
      index.set(a("2022-01-01"), p("notes/a.md"));
      index.delete(a("2022-01-01"));
      expect(index.has(a("2022-01-01"))).toBe(false);
    });

    it("is a no-op when anchor is absent", () => {
      const index = new JournalIndex();
      index.set(a("2022-01-01"), p("notes/a.md"));
      index.delete(a("2099-12-31"));
      expect(index.has(a("2022-01-01"))).toBe(true);
    });
  });

  describe("clear", () => {
    it("empties the index", () => {
      const index = new JournalIndex();
      index.set(a("2022-01-01"), p("notes/a.md"));
      index.set(a("2022-01-02"), p("notes/b.md"));
      index.clear();
      expect(index.has(a("2022-01-01"))).toBe(false);
    });
  });

  describe("size", () => {
    it("starts at zero on an empty index", () => {
      expect(new JournalIndex().size).toBe(0);
    });

    it("increments when an entry is added", () => {
      const index = new JournalIndex();
      index.set(a("2022-01-01"), p("notes/a.md"));
      index.set(a("2022-01-02"), p("notes/b.md"));
      expect(index.size).toBe(2);
    });

    it("decrements when an entry is deleted", () => {
      const index = new JournalIndex();
      index.set(a("2022-01-01"), p("notes/a.md"));
      index.set(a("2022-01-02"), p("notes/b.md"));
      index.delete(a("2022-01-01"));
      expect(index.size).toBe(1);
    });
  });

  describe("iteration", () => {
    it("yields all entries in anchor order", () => {
      const index = new JournalIndex();
      index.set(a("2022-02-01"), p("notes/b.md"));
      index.set(a("2022-01-01"), p("notes/a.md"));
      index.set(a("2022-03-01"), p("notes/c.md"));
      const seen = [...index];
      expect(seen).toEqual([
        [a("2022-01-01"), p("notes/a.md")],
        [a("2022-02-01"), p("notes/b.md")],
        [a("2022-03-01"), p("notes/c.md")],
      ]);
    });
  });

  describe("getRange", () => {
    it("returns entries within an inclusive range", () => {
      const result = buildRangeIndex().getRange(a("2022-01-05"), a("2022-01-10"));
      expect([...result]).toEqual([
        [a("2022-01-05"), p("notes/b.md")],
        [a("2022-01-10"), p("notes/c.md")],
      ]);
    });

    it("returns empty map when range starts after all entries", () => {
      const result = buildRangeIndex().getRange(a("2023-01-01"), a("2023-12-31"));
      expect(result.size).toBe(0);
    });

    it("returns empty map when range ends before all entries", () => {
      const result = buildRangeIndex().getRange(a("2021-01-01"), a("2021-12-31"));
      expect(result.size).toBe(0);
    });

    it("returns empty map when start is after end", () => {
      const result = buildRangeIndex().getRange(a("2022-02-01"), a("2022-01-01"));
      expect(result.size).toBe(0);
    });
  });

  describe("findNext", () => {
    it("returns the next path when from is an existing anchor", () => {
      const result = buildFindIndex().findNext(a("2022-01-01"));
      assert(result.isSome());
      expect(result.value).toBe(p("notes/b.md"));
    });

    it("returns the next path when from is between entries", () => {
      const result = buildFindIndex().findNext(a("2022-01-03"));
      assert(result.isSome());
      expect(result.value).toBe(p("notes/b.md"));
    });

    it("returns the first path when from is before any anchor", () => {
      const result = buildFindIndex().findNext(a("2021-12-31"));
      assert(result.isSome());
      expect(result.value).toBe(p("notes/a.md"));
    });

    it("returns None when from is at or past the last anchor", () => {
      expect(buildFindIndex().findNext(a("2022-01-10")).isNone()).toBe(true);
      expect(buildFindIndex().findNext(a("2099-12-31")).isNone()).toBe(true);
    });

    it("returns None when the index is empty", () => {
      expect(new JournalIndex().findNext(a("2022-01-01")).isNone()).toBe(true);
    });
  });

  describe("findPrevious", () => {
    it("returns the previous path when from is an existing anchor", () => {
      const result = buildFindIndex().findPrevious(a("2022-01-10"));
      assert(result.isSome());
      expect(result.value).toBe(p("notes/b.md"));
    });

    it("returns the previous path when from is between entries", () => {
      const result = buildFindIndex().findPrevious(a("2022-01-07"));
      assert(result.isSome());
      expect(result.value).toBe(p("notes/b.md"));
    });

    it("returns the last path when from is after any anchor", () => {
      const result = buildFindIndex().findPrevious(a("2099-12-31"));
      assert(result.isSome());
      expect(result.value).toBe(p("notes/c.md"));
    });

    it("returns None when from is at or before the first anchor", () => {
      expect(buildFindIndex().findPrevious(a("2022-01-01")).isNone()).toBe(true);
      expect(buildFindIndex().findPrevious(a("2021-01-01")).isNone()).toBe(true);
    });

    it("returns None when the index is empty", () => {
      expect(new JournalIndex().findPrevious(a("2022-01-01")).isNone()).toBe(true);
    });
  });

  describe("findClosestAnchor", () => {
    it("returns the exact anchor when present", () => {
      const result = buildClosestIndex().findClosestAnchor(a("2022-01-02"));
      assert(result.isSome());
      expect(result.value).toBe(a("2022-01-02"));
    });

    it("returns the first anchor when target is before the range", () => {
      const result = buildClosestIndex().findClosestAnchor(a("2021-12-31"));
      assert(result.isSome());
      expect(result.value).toBe(a("2022-01-01"));
    });

    it("returns the last anchor when target is after the range", () => {
      const result = buildClosestIndex().findClosestAnchor(a("2023-01-01"));
      assert(result.isSome());
      expect(result.value).toBe(a("2022-11-10"));
    });

    it("returns the previous anchor when target is between entries", () => {
      const result = buildClosestIndex().findClosestAnchor(a("2022-01-05"));
      assert(result.isSome());
      expect(result.value).toBe(a("2022-01-04"));
    });

    it("returns None when the index is empty", () => {
      expect(new JournalIndex().findClosestAnchor(a("2022-01-01")).isNone()).toBe(true);
    });
  });
});
