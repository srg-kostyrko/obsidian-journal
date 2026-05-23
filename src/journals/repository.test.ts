import { createNanoEvents, type Emitter } from "nanoevents";
import { describe, expect, it, vi } from "vitest";

import { journalDefaultsFor, type JournalConfig } from "./config";
import {
  InvalidJournalNameError,
  InvalidJournalUpdateError,
  JournalNameTakenError,
  UnknownJournalError,
} from "./errors";
import { JournalsRepository, type JournalsEvents } from "./repository";

function buildRepo(initial: Record<string, JournalConfig> = {}) {
  const storage: Record<string, JournalConfig> = { ...initial };
  const events: Emitter<JournalsEvents> = createNanoEvents();
  const repo = JournalsRepository.fromParts(storage, events);
  return { repo, storage, events };
}

describe("JournalsRepository", () => {
  describe("create", () => {
    it("inserts a journal with defaults for the given write", () => {
      const { repo, storage } = buildRepo();
      const result = repo.create("daily", { type: "day" });
      expect(result.kind).toBe("ok");
      expect(storage.daily).toEqual(journalDefaultsFor({ type: "day" }, "daily"));
    });

    it("emits created with the journal name", () => {
      const { repo, events } = buildRepo();
      const spy = vi.fn();
      events.on("created", spy);
      repo.create("daily", { type: "day" });
      expect(spy).toHaveBeenCalledWith("daily");
    });

    it("rejects an empty name with InvalidJournalNameError", () => {
      const { repo } = buildRepo();
      const result = repo.create("", { type: "day" });
      expect(result.isErr() && result.error).toBeInstanceOf(InvalidJournalNameError);
    });

    it("rejects a name already in use with JournalNameTakenError", () => {
      const { repo } = buildRepo({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      const result = repo.create("daily", { type: "day" });
      expect(result.isErr() && result.error).toBeInstanceOf(JournalNameTakenError);
    });
  });

  describe("rename", () => {
    it("moves the entity to the new key with the new name field", () => {
      const original = journalDefaultsFor({ type: "day" }, "daily");
      const { repo, storage } = buildRepo({ daily: original });
      const result = repo.rename("daily", "renamed");
      expect(result.kind).toBe("ok");
      expect(storage.renamed?.name).toBe("renamed");
      expect(storage.daily).toBeUndefined();
    });

    it("emits renamed with old and new name", () => {
      const { repo, events } = buildRepo({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      const spy = vi.fn();
      events.on("renamed", spy);
      repo.rename("daily", "renamed");
      expect(spy).toHaveBeenCalledWith("daily", "renamed");
    });

    it("does not emit created on rename", () => {
      const { repo, events } = buildRepo({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      const created = vi.fn();
      events.on("created", created);
      repo.rename("daily", "renamed");
      expect(created).not.toHaveBeenCalled();
    });

    it("does not emit deleted on rename", () => {
      const { repo, events } = buildRepo({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      const deleted = vi.fn();
      events.on("deleted", deleted);
      repo.rename("daily", "renamed");
      expect(deleted).not.toHaveBeenCalled();
    });

    it("rejects an empty new name with InvalidJournalNameError", () => {
      const { repo } = buildRepo({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      const result = repo.rename("daily", "");
      expect(result.isErr() && result.error).toBeInstanceOf(InvalidJournalNameError);
    });

    it("rejects newName equal to oldName with InvalidJournalNameError", () => {
      const { repo } = buildRepo({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      const result = repo.rename("daily", "daily");
      expect(result.isErr() && result.error).toBeInstanceOf(InvalidJournalNameError);
    });

    it("rejects an unknown old name with UnknownJournalError", () => {
      const { repo } = buildRepo();
      const result = repo.rename("nope", "next");
      expect(result.isErr() && result.error).toBeInstanceOf(UnknownJournalError);
    });

    it("rejects a new name already in use with JournalNameTakenError", () => {
      const { repo } = buildRepo({
        a: journalDefaultsFor({ type: "day" }, "a"),
        b: journalDefaultsFor({ type: "day" }, "b"),
      });
      const result = repo.rename("a", "b");
      expect(result.isErr() && result.error).toBeInstanceOf(JournalNameTakenError);
    });
  });

  describe("inherited update", () => {
    it("rejects a name change via update with InvalidJournalUpdateError", () => {
      const { repo } = buildRepo({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      const changes: Partial<JournalConfig> = { name: "other" };
      const result = repo.update("daily", changes);
      expect(result.isErr() && result.error).toBeInstanceOf(InvalidJournalUpdateError);
    });

    it("accepts updates to non-id fields", () => {
      const { repo, storage } = buildRepo({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      const result = repo.update("daily", { folder: "Daily/" });
      expect(result.kind).toBe("ok");
      expect(storage.daily?.folder).toBe("Daily/");
    });
  });

  describe("inherited delete", () => {
    it("removes the entity and emits deleted", () => {
      const { repo, storage, events } = buildRepo({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      const spy = vi.fn();
      events.on("deleted", spy);
      repo.delete("daily");
      expect(storage.daily).toBeUndefined();
      expect(spy).toHaveBeenCalledWith("daily");
    });

    it("returns UnknownJournalError for an unknown name", () => {
      const { repo } = buildRepo();
      const result = repo.delete("nope");
      expect(result.isErr() && result.error).toBeInstanceOf(UnknownJournalError);
    });
  });
});
