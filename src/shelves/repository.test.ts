import { describe, expect, it, vi } from "vitest";

import { journalsCoreModule } from "@/journals/module";
import { testContainer } from "@/testing";

import { shelvesCollection, type ShelfConfig } from "./config";
import { InvalidShelfNameError, InvalidShelfUpdateError, ShelfNameTakenError, UnknownShelfError } from "./errors";
import { shelvesCoreModule } from "./module";
import { ShelvesRepository } from "./repository";
import { buildShelf } from "./testing";
import { ShelvesEventsToken } from "./tokens";

async function buildRepo(initial: Record<string, ShelfConfig> = {}) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule],
    data: { shelves: initial },
  });
  return {
    repo: harness.resolve(ShelvesRepository),
    storage: harness.settings.recordOf(shelvesCollection),
    events: harness.resolve(ShelvesEventsToken),
  };
}

describe("ShelvesRepository", () => {
  describe("create", () => {
    it("inserts a shelf with empty journals list", async () => {
      const { repo, storage } = await buildRepo();

      repo.create("Personal");

      expect(storage.Personal).toEqual(buildShelf("Personal"));
    });

    it("emits created", async () => {
      const { repo, events } = await buildRepo();
      const spy = vi.fn();
      events.on("created", spy);

      repo.create("Personal");

      expect(spy).toHaveBeenCalledWith("Personal");
    });

    it("rejects an empty name", async () => {
      const { repo } = await buildRepo();

      const result = repo.create("");

      expect(result.isErr() && result.error).toBeInstanceOf(InvalidShelfNameError);
    });

    it("rejects a name in use", async () => {
      const { repo } = await buildRepo({ Personal: buildShelf("Personal") });

      const result = repo.create("Personal");

      expect(result.isErr() && result.error).toBeInstanceOf(ShelfNameTakenError);
    });
  });

  describe("rename", () => {
    it("stores the entry under the new key with the new name field", async () => {
      const { repo, storage } = await buildRepo({ Personal: buildShelf("Personal", { journals: ["daily"] }) });

      repo.rename("Personal", "Home");

      expect(storage.Home).toEqual({ name: "Home", journals: ["daily"], decorations: [] });
    });

    it("removes the old key on rename", async () => {
      const { repo, storage } = await buildRepo({ Personal: buildShelf("Personal", { journals: ["daily"] }) });

      repo.rename("Personal", "Home");

      expect(storage.Personal).toBeUndefined();
    });

    it("emits renamed", async () => {
      const { repo, events } = await buildRepo({ Personal: buildShelf("Personal") });
      const spy = vi.fn();
      events.on("renamed", spy);

      repo.rename("Personal", "Home");

      expect(spy).toHaveBeenCalledWith("Personal", "Home");
    });

    it("rejects empty new name", async () => {
      const { repo } = await buildRepo({ Personal: buildShelf("Personal") });

      const result = repo.rename("Personal", "");

      expect(result.isErr() && result.error).toBeInstanceOf(InvalidShelfNameError);
    });

    it("rejects newName equal to oldName", async () => {
      const { repo } = await buildRepo({ Personal: buildShelf("Personal") });

      const result = repo.rename("Personal", "Personal");

      expect(result.isErr() && result.error).toBeInstanceOf(InvalidShelfNameError);
    });

    it("rejects unknown old name", async () => {
      const { repo } = await buildRepo();

      const result = repo.rename("nope", "Home");

      expect(result.isErr() && result.error).toBeInstanceOf(UnknownShelfError);
    });

    it("rejects newName already in use", async () => {
      const { repo } = await buildRepo({ Personal: buildShelf("Personal"), Home: buildShelf("Home") });

      const result = repo.rename("Personal", "Home");

      expect(result.isErr() && result.error).toBeInstanceOf(ShelfNameTakenError);
    });
  });

  describe("deleteWith", () => {
    it("removes the shelf when destination is omitted", async () => {
      const { repo, storage } = await buildRepo({ Personal: buildShelf("Personal", { journals: ["a"] }) });

      repo.deleteWith("Personal");

      expect(storage.Personal).toBeUndefined();
    });

    it("appends source journals to destination before removing", async () => {
      const { repo, storage } = await buildRepo({
        Personal: buildShelf("Personal", { journals: ["a"] }),
        Home: buildShelf("Home", { journals: ["b"] }),
      });

      repo.deleteWith("Personal", "Home");

      expect(storage.Home?.journals).toEqual(["b", "a"]);
      expect(storage.Personal).toBeUndefined();
    });

    it("emits deleted", async () => {
      const { repo, events } = await buildRepo({ Personal: buildShelf("Personal") });
      const spy = vi.fn();
      events.on("deleted", spy);

      repo.deleteWith("Personal");

      expect(spy).toHaveBeenCalledWith("Personal");
    });

    it("rejects unknown source", async () => {
      const { repo } = await buildRepo();

      const result = repo.deleteWith("nope");

      expect(result.isErr() && result.error).toBeInstanceOf(UnknownShelfError);
    });

    it("rejects provided-but-unknown destination", async () => {
      const { repo } = await buildRepo({ Personal: buildShelf("Personal") });

      const result = repo.deleteWith("Personal", "ghost");

      expect(result.isErr() && result.error).toBeInstanceOf(UnknownShelfError);
    });
  });

  describe("inherited update", () => {
    it("rejects a name change with InvalidShelfUpdateError", async () => {
      const { repo } = await buildRepo({ Personal: buildShelf("Personal") });

      const result = repo.update("Personal", { name: "Home" });

      expect(result.isErr() && result.error).toBeInstanceOf(InvalidShelfUpdateError);
    });

    it("accepts journal-list updates", async () => {
      const { repo, storage } = await buildRepo({ Personal: buildShelf("Personal") });

      repo.update("Personal", { journals: ["daily"] });

      expect(storage.Personal?.journals).toEqual(["daily"]);
    });
  });
});
