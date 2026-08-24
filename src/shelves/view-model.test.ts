import { beforeEach, describe, expect, it } from "vitest";

import { journalsCoreModule } from "@/journals/module";
import { testContainer, type TestHarness } from "@/testing";

import { shelvesCoreModule } from "./module";
import { ShelvesRepository } from "./repository";
import { buildShelf } from "./testing";
import { ShelvesViewModel } from "./view-model";

describe("ShelvesViewModel", () => {
  describe("shelves", () => {
    it("yields the current shelves", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: { shelves: { Personal: buildShelf("Personal") } },
      });

      expect(harness.resolve(ShelvesViewModel).shelves.value.map((s) => s.name)).toEqual(["Personal"]);
    });

    it("reflects mutations after create", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: { shelves: {} },
      });
      const vm = harness.resolve(ShelvesViewModel);

      harness.resolve(ShelvesRepository).create("Personal");

      expect(vm.shelves.value.map((s) => s.name)).toEqual(["Personal"]);
    });
  });

  describe("shelfOptions", () => {
    it("labels options by the shelf name", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: { shelves: { Personal: buildShelf("Personal"), Home: buildShelf("Home") } },
      });

      expect(harness.resolve(ShelvesViewModel).shelfOptions.value).toEqual([
        { value: "Personal", label: "Personal" },
        { value: "Home", label: "Home" },
      ]);
    });
  });

  describe("shelfCount", () => {
    it("returns the count", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: { shelves: { Personal: buildShelf("Personal") } },
      });

      expect(harness.resolve(ShelvesViewModel).shelfCount.value).toBe(1);
    });
  });

  describe("getShelf", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: { shelves: { Personal: buildShelf("Personal") } },
      });
    });

    it("returns Some for a known name", () => {
      expect(harness.resolve(ShelvesViewModel).getShelf("Personal").isSome()).toBe(true);
    });

    it("returns None for an unknown name", () => {
      expect(harness.resolve(ShelvesViewModel).getShelf("nope").isNone()).toBe(true);
    });
  });

  describe("isShelfNameAvailable", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: { shelves: { Personal: buildShelf("Personal") } },
      });
    });

    it("is false when the name is in use", () => {
      expect(harness.resolve(ShelvesViewModel).isShelfNameAvailable("Personal")).toBe(false);
    });

    it("is true when the name is free", () => {
      expect(harness.resolve(ShelvesViewModel).isShelfNameAvailable("Other")).toBe(true);
    });

    it("treats excludeCurrent as available", () => {
      expect(harness.resolve(ShelvesViewModel).isShelfNameAvailable("Personal", "Personal")).toBe(true);
    });
  });
});
