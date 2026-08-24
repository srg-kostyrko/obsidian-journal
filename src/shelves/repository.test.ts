import { beforeEach, describe, expect, it, vi } from "vitest";

import { journalsCoreModule } from "@/journals/module";
import { testContainer, type TestHarness } from "@/testing";

import { shelvesCollection } from "./config";
import { InvalidShelfNameError, InvalidShelfUpdateError, ShelfNameTakenError, UnknownShelfError } from "./errors";
import { shelvesCoreModule } from "./module";
import { ShelvesRepository } from "./repository";
import { buildShelf } from "./testing";
import { ShelvesEventsToken } from "./tokens";

describe("ShelvesRepository", () => {
  describe("create", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: { shelves: {} },
      });
    });

    it("inserts a shelf with empty journals list", () => {
      harness.resolve(ShelvesRepository).create("Personal");

      expect(harness.settings.recordOf(shelvesCollection).Personal).toEqual(buildShelf("Personal"));
    });

    it("emits created", () => {
      const spy = vi.fn();
      harness.resolve(ShelvesEventsToken).on("created", spy);

      harness.resolve(ShelvesRepository).create("Personal");

      expect(spy).toHaveBeenCalledWith("Personal");
    });

    it("rejects an empty name", () => {
      const result = harness.resolve(ShelvesRepository).create("");

      expect(result.isErr() && result.error).toBeInstanceOf(InvalidShelfNameError);
    });

    it("rejects a name in use", async () => {
      harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: { shelves: { Personal: buildShelf("Personal") } },
      });

      const result = harness.resolve(ShelvesRepository).create("Personal");

      expect(result.isErr() && result.error).toBeInstanceOf(ShelfNameTakenError);
    });
  });

  describe("rename", () => {
    it("stores the entry under the new key with the new name field", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: { shelves: { Personal: buildShelf("Personal", { journals: ["daily"] }) } },
      });

      harness.resolve(ShelvesRepository).rename("Personal", "Home");

      expect(harness.settings.recordOf(shelvesCollection).Home).toEqual({
        name: "Home",
        journals: ["daily"],
        decorations: [],
      });
    });

    it("removes the old key on rename", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: { shelves: { Personal: buildShelf("Personal", { journals: ["daily"] }) } },
      });

      harness.resolve(ShelvesRepository).rename("Personal", "Home");

      expect(harness.settings.recordOf(shelvesCollection).Personal).toBeUndefined();
    });

    describe("with a lone Personal shelf", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule, shelvesCoreModule],
          data: { shelves: { Personal: buildShelf("Personal") } },
        });
      });

      it("emits renamed", () => {
        const spy = vi.fn();
        harness.resolve(ShelvesEventsToken).on("renamed", spy);

        harness.resolve(ShelvesRepository).rename("Personal", "Home");

        expect(spy).toHaveBeenCalledWith("Personal", "Home");
      });

      it("rejects empty new name", () => {
        const result = harness.resolve(ShelvesRepository).rename("Personal", "");

        expect(result.isErr() && result.error).toBeInstanceOf(InvalidShelfNameError);
      });

      it("rejects newName equal to oldName", () => {
        const result = harness.resolve(ShelvesRepository).rename("Personal", "Personal");

        expect(result.isErr() && result.error).toBeInstanceOf(InvalidShelfNameError);
      });
    });

    it("rejects unknown old name", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: { shelves: {} },
      });

      const result = harness.resolve(ShelvesRepository).rename("nope", "Home");

      expect(result.isErr() && result.error).toBeInstanceOf(UnknownShelfError);
    });

    it("rejects newName already in use", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: { shelves: { Personal: buildShelf("Personal"), Home: buildShelf("Home") } },
      });

      const result = harness.resolve(ShelvesRepository).rename("Personal", "Home");

      expect(result.isErr() && result.error).toBeInstanceOf(ShelfNameTakenError);
    });
  });

  describe("deleteWith", () => {
    it("removes the shelf when destination is omitted", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: { shelves: { Personal: buildShelf("Personal", { journals: ["a"] }) } },
      });

      harness.resolve(ShelvesRepository).deleteWith("Personal");

      expect(harness.settings.recordOf(shelvesCollection).Personal).toBeUndefined();
    });

    it("appends source journals to destination before removing", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: {
          shelves: {
            Personal: buildShelf("Personal", { journals: ["a"] }),
            Home: buildShelf("Home", { journals: ["b"] }),
          },
        },
      });

      harness.resolve(ShelvesRepository).deleteWith("Personal", "Home");

      expect(harness.settings.recordOf(shelvesCollection).Home?.journals).toEqual(["b", "a"]);
      expect(harness.settings.recordOf(shelvesCollection).Personal).toBeUndefined();
    });

    it("emits deleted", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: { shelves: { Personal: buildShelf("Personal") } },
      });
      const spy = vi.fn();
      harness.resolve(ShelvesEventsToken).on("deleted", spy);

      harness.resolve(ShelvesRepository).deleteWith("Personal");

      expect(spy).toHaveBeenCalledWith("Personal");
    });

    it("rejects unknown source", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: { shelves: {} },
      });

      const result = harness.resolve(ShelvesRepository).deleteWith("nope");

      expect(result.isErr() && result.error).toBeInstanceOf(UnknownShelfError);
    });

    it("rejects provided-but-unknown destination", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: { shelves: { Personal: buildShelf("Personal") } },
      });

      const result = harness.resolve(ShelvesRepository).deleteWith("Personal", "ghost");

      expect(result.isErr() && result.error).toBeInstanceOf(UnknownShelfError);
    });
  });

  describe("inherited update", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: { shelves: { Personal: buildShelf("Personal") } },
      });
    });

    it("rejects a name change with InvalidShelfUpdateError", () => {
      const result = harness.resolve(ShelvesRepository).update("Personal", { name: "Home" });

      expect(result.isErr() && result.error).toBeInstanceOf(InvalidShelfUpdateError);
    });

    it("accepts journal-list updates", () => {
      harness.resolve(ShelvesRepository).update("Personal", { journals: ["daily"] });

      expect(harness.settings.recordOf(shelvesCollection).Personal?.journals).toEqual(["daily"]);
    });
  });
});
