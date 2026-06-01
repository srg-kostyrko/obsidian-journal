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
    leaf: "right",
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

    it("returns the stored view for a known id", () => {
      const stored = view("abc");
      const repo = buildRepo({ abc: stored });
      expect(repo.get("abc" as ViewId).match({ some: (v) => v, none: () => null })).toEqual(stored);
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
