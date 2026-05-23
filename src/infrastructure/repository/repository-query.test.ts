import { describe, expect, it } from "vitest";

import { RepositoryQuery } from "./repository-query";

interface Item {
  readonly name: string;
  readonly count: number;
}

function buildSource(items: readonly (readonly [string, Item])[]): IterableIterator<[string, Item]> {
  return items[Symbol.iterator]() as IterableIterator<[string, Item]>;
}

describe("RepositoryQuery", () => {
  describe("first", () => {
    it("returns the first entity when source has one", () => {
      const q = new RepositoryQuery<string, Item>(buildSource([["a", { name: "A", count: 1 }]]), "name");
      const out = q.first();
      expect(out.isSome()).toBe(true);
      expect(out.getOr({ name: "", count: 0 })).toEqual({ name: "A", count: 1 });
    });

    it("returns none when source is empty", () => {
      const q = new RepositoryQuery<string, Item>(buildSource([]), "name");
      expect(q.first().isNone()).toBe(true);
    });
  });

  describe("ids", () => {
    it("yields record keys in iteration order", () => {
      const q = new RepositoryQuery<string, Item>(
        buildSource([
          ["a", { name: "A", count: 1 }],
          ["b", { name: "B", count: 2 }],
        ]),
        "name",
      );
      expect([...q.ids()]).toEqual(["a", "b"]);
    });
  });

  describe("list", () => {
    it("yields entities in iteration order", () => {
      const q = new RepositoryQuery<string, Item>(
        buildSource([
          ["a", { name: "A", count: 1 }],
          ["b", { name: "B", count: 2 }],
        ]),
        "name",
      );
      expect([...q.list()]).toEqual([
        { name: "A", count: 1 },
        { name: "B", count: 2 },
      ]);
    });
  });

  describe("options", () => {
    it("labels entries using nameKey when set", () => {
      const q = new RepositoryQuery<string, Item>(
        buildSource([
          ["a", { name: "Alice", count: 1 }],
          ["b", { name: "Bob", count: 2 }],
        ]),
        "name",
      );
      expect([...q.options()]).toEqual([
        { value: "a", label: "Alice" },
        { value: "b", label: "Bob" },
      ]);
    });

    it("falls back to the id when nameKey is undefined", () => {
      const q = new RepositoryQuery<string, Item>(buildSource([["a", { name: "A", count: 1 }]]));
      expect([...q.options()]).toEqual([{ value: "a", label: "a" }]);
    });
  });

  describe("map", () => {
    it("yields the function result for each entity", () => {
      const q = new RepositoryQuery<string, Item>(
        buildSource([
          ["a", { name: "A", count: 1 }],
          ["b", { name: "B", count: 3 }],
        ]),
        "name",
      );
      expect([...q.map((entity) => entity.count * 2)]).toEqual([2, 6]);
    });
  });

  describe("filter", () => {
    it("returns a new query that yields only matching entities", () => {
      const q = new RepositoryQuery<string, Item>(
        buildSource([
          ["a", { name: "A", count: 1 }],
          ["b", { name: "B", count: 5 }],
          ["c", { name: "C", count: 9 }],
        ]),
        "name",
      );
      const filtered = q.filter((entity) => entity.count >= 5);
      expect([...filtered.list()]).toEqual([
        { name: "B", count: 5 },
        { name: "C", count: 9 },
      ]);
    });
  });

  describe("entries", () => {
    it("yields [id, entity] pairs", () => {
      const q = new RepositoryQuery<string, Item>(
        buildSource([
          ["a", { name: "A", count: 1 }],
          ["b", { name: "B", count: 2 }],
        ]),
        "name",
      );
      expect([...q.entries()]).toEqual([
        ["a", { name: "A", count: 1 }],
        ["b", { name: "B", count: 2 }],
      ]);
    });
  });

  describe("[Symbol.iterator]", () => {
    it("iterates entities directly", () => {
      const q = new RepositoryQuery<string, Item>(
        buildSource([
          ["a", { name: "A", count: 1 }],
          ["b", { name: "B", count: 2 }],
        ]),
        "name",
      );
      expect([...q]).toEqual([
        { name: "A", count: 1 },
        { name: "B", count: 2 },
      ]);
    });
  });
});
