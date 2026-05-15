import { assert, describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";

import { JournalIndex } from "./journal-index";

const a = (s: string) => s as AnchorString;
const p = (s: string) => s as VaultPath;

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
});
