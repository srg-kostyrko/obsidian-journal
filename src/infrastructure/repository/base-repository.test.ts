import { createNanoEvents, type Emitter } from "nanoevents";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BaseRepository } from "./base-repository";
import { RepositoryQuery } from "./repository-query";

import type { RepositoryEvents } from "./types";

interface Item {
  name: string;
  count: number;
}

class TestUnknownError extends Error {
  readonly kind = "unknown" as const;
  constructor(public readonly id: string) {
    super(`Unknown: ${id}`);
    this.name = "TestUnknownError";
  }
}

class TestInvalidUpdateError extends Error {
  readonly kind = "invalid-update" as const;
  constructor(public readonly id: string) {
    super(`Invalid update for ${id}`);
    this.name = "TestInvalidUpdateError";
  }
}

class TestRepository extends BaseRepository<string, Item, TestUnknownError, TestInvalidUpdateError> {
  protected idKey: keyof Item = "name";
  protected nameKey: keyof Item = "name";
  protected QueryConstructor = RepositoryQuery;
  protected storage: Record<string, Item>;
  protected events: Emitter<RepositoryEvents<string, Item>>;
  protected unknownEntityError = (id: string) => new TestUnknownError(id);
  protected invalidUpdateError = (id: string) => new TestInvalidUpdateError(id);

  constructor(storage: Record<string, Item>, events: Emitter<RepositoryEvents<string, Item>>) {
    super();
    this.storage = storage;
    this.events = events;
  }

  add(id: string, entity: Item) {
    return this.addEntity(id, entity);
  }
}

describe("BaseRepository", () => {
  let storage: Record<string, Item>;
  let events: Emitter<RepositoryEvents<string, Item>>;
  let repo: TestRepository;

  beforeEach(() => {
    storage = {
      a: { name: "a", count: 1 },
      b: { name: "b", count: 2 },
    };
    events = createNanoEvents<RepositoryEvents<string, Item>>();
    repo = new TestRepository(storage, events);
  });

  describe("count", () => {
    it("returns the number of stored entities", () => {
      expect(repo.count()).toBe(2);
    });
  });

  describe("exists", () => {
    it("returns true when the id is stored", () => {
      expect(repo.exists("a")).toBe(true);
    });

    it("returns false when the id is absent", () => {
      expect(repo.exists("nope")).toBe(false);
    });
  });

  describe("get", () => {
    it("returns Some when the id is stored", () => {
      expect(repo.get("a").isSome()).toBe(true);
    });

    it("returns None when the id is absent", () => {
      expect(repo.get("nope").isNone()).toBe(true);
    });
  });

  describe("find", () => {
    it("returns a query iterating every stored entity", () => {
      expect([...repo.find().list()]).toEqual([
        { name: "a", count: 1 },
        { name: "b", count: 2 },
      ]);
    });
  });

  describe("update", () => {
    it("merges changes into the stored entity", () => {
      repo.update("a", { count: 99 });
      expect(storage.a).toEqual({ name: "a", count: 99 });
    });

    it("emits updated with the changes", () => {
      const spy = vi.fn();
      events.on("updated", spy);
      repo.update("a", { count: 99 });
      expect(spy).toHaveBeenCalledWith("a", { count: 99 });
    });

    it("returns UnknownEntityError when the id is absent", () => {
      const result = repo.update("nope", { count: 1 });
      expect(result.isErr()).toBe(true);
      expect(result.isErr() && result.error).toBeInstanceOf(TestUnknownError);
    });

    it("returns InvalidUpdateError when changes alter the id-key", () => {
      const result = repo.update("a", { name: "renamed" });
      expect(result.isErr()).toBe(true);
      expect(result.isErr() && result.error).toBeInstanceOf(TestInvalidUpdateError);
    });

    it("does not emit any event when the id-key is altered", () => {
      const spy = vi.fn();
      events.on("updated", spy);
      repo.update("a", { name: "renamed" });
      expect(spy).not.toHaveBeenCalled();
    });

    it("does not mutate storage when the id-key is altered", () => {
      const before = { ...storage.a };
      repo.update("a", { name: "renamed" });
      expect(storage.a).toEqual(before);
    });
  });

  describe("delete", () => {
    it("removes the stored entity", () => {
      repo.delete("a");
      expect(storage.a).toBeUndefined();
    });

    it("emits deleted with the id", () => {
      const spy = vi.fn();
      events.on("deleted", spy);
      repo.delete("a");
      expect(spy).toHaveBeenCalledWith("a");
    });

    it("returns UnknownEntityError when the id is absent", () => {
      const result = repo.delete("nope");
      expect(result.isErr()).toBe(true);
      expect(result.isErr() && result.error).toBeInstanceOf(TestUnknownError);
    });
  });

  describe("addEntity", () => {
    it("inserts a new entity", () => {
      repo.add("c", { name: "c", count: 3 });
      expect(storage.c).toEqual({ name: "c", count: 3 });
    });

    it("emits created with the id", () => {
      const spy = vi.fn();
      events.on("created", spy);
      repo.add("c", { name: "c", count: 3 });
      expect(spy).toHaveBeenCalledWith("c");
    });

    it("returns UnknownEntityError when the id is already stored", () => {
      const result = repo.add("a", { name: "a", count: 0 });
      expect(result.isErr()).toBe(true);
      expect(result.isErr() && result.error).toBeInstanceOf(TestUnknownError);
    });
  });
});
