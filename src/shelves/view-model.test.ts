import { describe, expect, it } from "vitest";

import { journalsCoreModule } from "@/journals/module";
import { testContainer } from "@/testing";

import { shelvesCoreModule } from "./module";
import { ShelvesRepository } from "./repository";
import { buildShelf } from "./testing";
import { ShelvesViewModel } from "./view-model";

import type { ShelfConfig } from "./config";

async function resolveViewModel(initial: Record<string, ShelfConfig> = {}) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule],
    data: { shelves: initial },
  });
  return { vm: harness.resolve(ShelvesViewModel), repo: harness.resolve(ShelvesRepository) };
}

describe("ShelvesViewModel", () => {
  describe("shelves", () => {
    it("yields the current shelves", async () => {
      const { vm } = await resolveViewModel({ Personal: buildShelf("Personal") });

      expect(vm.shelves.value.map((s) => s.name)).toEqual(["Personal"]);
    });

    it("reflects mutations after create", async () => {
      const { vm, repo } = await resolveViewModel();

      repo.create("Personal");

      expect(vm.shelves.value.map((s) => s.name)).toEqual(["Personal"]);
    });
  });

  describe("shelfOptions", () => {
    it("labels options by the shelf name", async () => {
      const { vm } = await resolveViewModel({ Personal: buildShelf("Personal"), Home: buildShelf("Home") });

      expect(vm.shelfOptions.value).toEqual([
        { value: "Personal", label: "Personal" },
        { value: "Home", label: "Home" },
      ]);
    });
  });

  describe("shelfCount", () => {
    it("returns the count", async () => {
      const { vm } = await resolveViewModel({ Personal: buildShelf("Personal") });

      expect(vm.shelfCount.value).toBe(1);
    });
  });

  describe("getShelf", () => {
    it("returns Some for a known name", async () => {
      const { vm } = await resolveViewModel({ Personal: buildShelf("Personal") });

      expect(vm.getShelf("Personal").isSome()).toBe(true);
    });

    it("returns None for an unknown name", async () => {
      const { vm } = await resolveViewModel();

      expect(vm.getShelf("nope").isNone()).toBe(true);
    });
  });

  describe("isShelfNameAvailable", () => {
    it("is false when the name is in use", async () => {
      const { vm } = await resolveViewModel({ Personal: buildShelf("Personal") });

      expect(vm.isShelfNameAvailable("Personal")).toBe(false);
    });

    it("is true when the name is free", async () => {
      const { vm } = await resolveViewModel({ Personal: buildShelf("Personal") });

      expect(vm.isShelfNameAvailable("Other")).toBe(true);
    });

    it("treats excludeCurrent as available", async () => {
      const { vm } = await resolveViewModel({ Personal: buildShelf("Personal") });

      expect(vm.isShelfNameAvailable("Personal", "Personal")).toBe(true);
    });
  });
});
