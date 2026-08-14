import { createNanoEvents, type Emitter } from "nanoevents";
import { describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

import { InvalidShelfNameError, InvalidShelfUpdateError, ShelfNameTakenError, UnknownShelfError } from "./errors";
import { ShelvesRepository, type ShelvesEvents } from "./repository";

import type { ShelfConfig } from "./config";

function buildRepo(initial: Record<string, ShelfConfig> = {}) {
  const storage = reactive<Record<string, ShelfConfig>>({ ...initial });
  const events: Emitter<ShelvesEvents> = createNanoEvents();
  const repo = ShelvesRepository.fromParts(storage, events);
  return { repo, storage, events };
}

const shelf = (name: string, journals: string[] = []): ShelfConfig => ({ name, journals, decorations: [] });

describe("ShelvesRepository", () => {
  describe("create", () => {
    it("inserts a shelf with empty journals list", () => {
      const { repo, storage } = buildRepo();
      repo.create("Personal");
      expect(storage.Personal).toEqual({ name: "Personal", journals: [], decorations: [] });
    });

    it("emits created", () => {
      const { repo, events } = buildRepo();
      const spy = vi.fn();
      events.on("created", spy);
      repo.create("Personal");
      expect(spy).toHaveBeenCalledWith("Personal");
    });

    it("rejects an empty name", () => {
      const { repo } = buildRepo();
      const result = repo.create("");
      expect(result.isErr() && result.error).toBeInstanceOf(InvalidShelfNameError);
    });

    it("rejects a name in use", () => {
      const { repo } = buildRepo({ Personal: shelf("Personal") });
      const result = repo.create("Personal");
      expect(result.isErr() && result.error).toBeInstanceOf(ShelfNameTakenError);
    });
  });

  describe("rename", () => {
    it("stores the entry under the new key with the new name field", () => {
      const { repo, storage } = buildRepo({ Personal: shelf("Personal", ["daily"]) });
      repo.rename("Personal", "Home");
      expect(storage.Home).toEqual({ name: "Home", journals: ["daily"], decorations: [] });
    });

    it("removes the old key on rename", () => {
      const { repo, storage } = buildRepo({ Personal: shelf("Personal", ["daily"]) });
      repo.rename("Personal", "Home");
      expect(storage.Personal).toBeUndefined();
    });

    it("emits renamed", () => {
      const { repo, events } = buildRepo({ Personal: shelf("Personal") });
      const spy = vi.fn();
      events.on("renamed", spy);
      repo.rename("Personal", "Home");
      expect(spy).toHaveBeenCalledWith("Personal", "Home");
    });

    it("rejects empty new name", () => {
      const { repo } = buildRepo({ Personal: shelf("Personal") });
      const result = repo.rename("Personal", "");
      expect(result.isErr() && result.error).toBeInstanceOf(InvalidShelfNameError);
    });

    it("rejects newName equal to oldName", () => {
      const { repo } = buildRepo({ Personal: shelf("Personal") });
      const result = repo.rename("Personal", "Personal");
      expect(result.isErr() && result.error).toBeInstanceOf(InvalidShelfNameError);
    });

    it("rejects unknown old name", () => {
      const { repo } = buildRepo();
      const result = repo.rename("nope", "Home");
      expect(result.isErr() && result.error).toBeInstanceOf(UnknownShelfError);
    });

    it("rejects newName already in use", () => {
      const { repo } = buildRepo({ Personal: shelf("Personal"), Home: shelf("Home") });
      const result = repo.rename("Personal", "Home");
      expect(result.isErr() && result.error).toBeInstanceOf(ShelfNameTakenError);
    });
  });

  describe("deleteWith", () => {
    it("removes the shelf when destination is omitted", () => {
      const { repo, storage } = buildRepo({ Personal: shelf("Personal", ["a"]) });
      repo.deleteWith("Personal");
      expect(storage.Personal).toBeUndefined();
    });

    it("appends source journals to destination before removing", () => {
      const { repo, storage } = buildRepo({
        Personal: shelf("Personal", ["a"]),
        Home: shelf("Home", ["b"]),
      });
      repo.deleteWith("Personal", "Home");
      expect(storage.Home?.journals).toEqual(["b", "a"]);
      expect(storage.Personal).toBeUndefined();
    });

    it("emits deleted", () => {
      const { repo, events } = buildRepo({ Personal: shelf("Personal") });
      const spy = vi.fn();
      events.on("deleted", spy);
      repo.deleteWith("Personal");
      expect(spy).toHaveBeenCalledWith("Personal");
    });

    it("rejects unknown source", () => {
      const { repo } = buildRepo();
      const result = repo.deleteWith("nope");
      expect(result.isErr() && result.error).toBeInstanceOf(UnknownShelfError);
    });

    it("rejects provided-but-unknown destination", () => {
      const { repo } = buildRepo({ Personal: shelf("Personal") });
      const result = repo.deleteWith("Personal", "ghost");
      expect(result.isErr() && result.error).toBeInstanceOf(UnknownShelfError);
    });
  });

  describe("inherited update", () => {
    it("rejects a name change with InvalidShelfUpdateError", () => {
      const { repo } = buildRepo({ Personal: shelf("Personal") });
      const result = repo.update("Personal", { name: "Home" });
      expect(result.isErr() && result.error).toBeInstanceOf(InvalidShelfUpdateError);
    });

    it("accepts journal-list updates", () => {
      const { repo, storage } = buildRepo({ Personal: shelf("Personal") });
      repo.update("Personal", { journals: ["daily"] });
      expect(storage.Personal?.journals).toEqual(["daily"]);
    });
  });
});
