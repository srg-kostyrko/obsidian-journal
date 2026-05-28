import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";

import { ViewsRepository } from "./repository";

import type { View, ViewId } from "./config";
import type { ViewsEvents } from "./tokens";

function view(id: string, overrides: Partial<View> = {}): View {
  return {
    id: id as ViewId,
    name: "View " + id,
    icon: "calendar-days",
    defaultShelf: null,
    showInRibbon: false,
    blocks: [],
    ...overrides,
  };
}

function buildRepo(views: Record<string, View> = {}): ViewsRepository {
  return ViewsRepository.fromParts(views, createNanoEvents<ViewsEvents>());
}

describe("ViewsRepository", () => {
  describe("get", () => {
    it("returns None for an unknown view id", () => {
      const repo = buildRepo();
      expect(repo.get("missing" as ViewId).isNone()).toBe(true);
    });

    it("returns Some with the stored view when found", () => {
      const stored = view("abc");
      const repo = buildRepo({ abc: stored });
      const result = repo.get("abc" as ViewId);
      expect(result.isSome()).toBe(true);
      expect(result.getOr(view("fallback"))).toEqual(stored);
    });
  });

  describe("find", () => {
    it("iterates all stored views", () => {
      const repo = buildRepo({ a: view("a"), b: view("b") });
      const ids = [...repo.find().entries()].map(([id]) => id);
      expect(ids).toEqual(["a", "b"]);
    });
  });
});
