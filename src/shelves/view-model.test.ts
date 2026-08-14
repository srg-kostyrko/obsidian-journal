import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";
import { reactive } from "vue";

import { ShelvesRepository, type ShelvesEvents } from "./repository";
import { ShelvesViewModel } from "./view-model";

import type { ShelfConfig } from "./config";

function buildVM(initial: Record<string, ShelfConfig> = {}) {
  const storage = reactive<Record<string, ShelfConfig>>({ ...initial });
  const events = createNanoEvents<ShelvesEvents>();
  const repo = ShelvesRepository.fromParts(storage, events);
  const vm = ShelvesViewModel.fromRepository(repo);
  return { vm, repo };
}

const shelf = (name: string, journals: string[] = []): ShelfConfig => ({ name, journals, decorations: [] });

describe("ShelvesViewModel", () => {
  describe("shelves", () => {
    it("yields the current shelves", () => {
      const { vm } = buildVM({ Personal: shelf("Personal") });
      expect(vm.shelves.value.map((s) => s.name)).toEqual(["Personal"]);
    });

    it("reflects mutations after create", () => {
      const { vm, repo } = buildVM();
      repo.create("Personal");
      expect(vm.shelves.value.map((s) => s.name)).toEqual(["Personal"]);
    });
  });

  describe("shelfOptions", () => {
    it("labels options by the shelf name", () => {
      const { vm } = buildVM({
        Personal: shelf("Personal"),
        Home: shelf("Home"),
      });
      expect(vm.shelfOptions.value).toEqual([
        { value: "Personal", label: "Personal" },
        { value: "Home", label: "Home" },
      ]);
    });
  });

  describe("shelfCount", () => {
    it("returns the count", () => {
      const { vm } = buildVM({ Personal: shelf("Personal") });
      expect(vm.shelfCount.value).toBe(1);
    });
  });

  describe("getShelf", () => {
    it("returns Some for a known name", () => {
      const { vm } = buildVM({ Personal: shelf("Personal") });
      expect(vm.getShelf("Personal").isSome()).toBe(true);
    });

    it("returns None for an unknown name", () => {
      const { vm } = buildVM();
      expect(vm.getShelf("nope").isNone()).toBe(true);
    });
  });

  describe("isShelfNameAvailable", () => {
    it("is false when the name is in use", () => {
      const { vm } = buildVM({ Personal: shelf("Personal") });
      expect(vm.isShelfNameAvailable("Personal")).toBe(false);
    });

    it("is true when the name is free", () => {
      const { vm } = buildVM({ Personal: shelf("Personal") });
      expect(vm.isShelfNameAvailable("Other")).toBe(true);
    });

    it("treats excludeCurrent as available", () => {
      const { vm } = buildVM({ Personal: shelf("Personal") });
      expect(vm.isShelfNameAvailable("Personal", "Personal")).toBe(true);
    });
  });
});
