import { createNanoEvents, type Emitter } from "nanoevents";
import { describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

import { journalDefaultsFor, type JournalConfig, type NavBlockRow } from "./config";
import {
  InvalidJournalNameError,
  InvalidJournalUpdateError,
  JournalNameTakenError,
  JournalNotFoundError,
  UnknownJournalError,
} from "./errors";
import { JournalsRepository, type JournalsEvents } from "./repository";

const addedRow: NavBlockRow = {
  template: "added to the copy",
  fontSize: 1,
  bold: false,
  italic: false,
  link: "none",
  journal: "",
  color: { type: "theme", name: "text-normal" },
  background: { type: "transparent" },
  addDecorations: false,
};

function buildRepo(initial: Record<string, JournalConfig> = {}) {
  const storage = reactive<Record<string, JournalConfig>>({ ...initial });
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
    it("stores the entity under the new key with the updated name field", () => {
      const original = journalDefaultsFor({ type: "day" }, "daily");
      const { repo, storage } = buildRepo({ daily: original });
      repo.rename("daily", "renamed");
      expect(storage.renamed?.name).toBe("renamed");
    });

    it("removes the old key on rename", () => {
      const original = journalDefaultsFor({ type: "day" }, "daily");
      const { repo, storage } = buildRepo({ daily: original });
      repo.rename("daily", "renamed");
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

  describe("duplicate", () => {
    it("stores a copy of the source config under the new name", () => {
      const source = { ...journalDefaultsFor({ type: "day" }, "daily"), folder: "Daily/", confirmCreation: true };
      const { repo, storage } = buildRepo({ daily: source });
      repo.duplicate("daily", "daily copy");
      expect(storage["daily copy"]).toStrictEqual({ ...source, name: "daily copy" });
    });

    it("leaves the source journal in place", () => {
      const source = journalDefaultsFor({ type: "day" }, "daily");
      const { repo, storage } = buildRepo({ daily: source });
      repo.duplicate("daily", "daily copy");
      expect(storage.daily).toStrictEqual(source);
    });

    it("detaches nested values so editing the copy leaves the source untouched", () => {
      const { repo, storage } = buildRepo({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      repo.duplicate("daily", "daily copy");
      storage["daily copy"]?.navBlock.rows.push(addedRow);
      expect(storage.daily?.navBlock.rows).not.toContainEqual(
        expect.objectContaining({ template: "added to the copy" }),
      );
    });

    it("returns the stored copy", () => {
      const { repo } = buildRepo({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      const result = repo.duplicate("daily", "daily copy");
      expect(result.isOk() && result.value.name).toBe("daily copy");
    });

    it("emits duplicated with the source and new name", () => {
      const { repo, events } = buildRepo({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      const spy = vi.fn();
      events.on("duplicated", spy);
      repo.duplicate("daily", "daily copy");
      expect(spy).toHaveBeenCalledWith("daily", "daily copy");
    });

    it("emits duplicated after created so listeners see the stored copy", () => {
      const { repo, events } = buildRepo({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      const calls: string[] = [];
      events.on("created", () => calls.push("created"));
      events.on("duplicated", () => calls.push("duplicated"));
      repo.duplicate("daily", "daily copy");
      expect(calls).toStrictEqual(["created", "duplicated"]);
    });

    it("rejects an empty new name with InvalidJournalNameError", () => {
      const { repo } = buildRepo({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      const result = repo.duplicate("daily", "");
      expect(result.isErr() && result.error).toBeInstanceOf(InvalidJournalNameError);
    });

    it("rejects an unknown source name with UnknownJournalError", () => {
      const { repo } = buildRepo();
      const result = repo.duplicate("nope", "copy");
      expect(result.isErr() && result.error).toBeInstanceOf(UnknownJournalError);
    });

    it("rejects a new name already in use with JournalNameTakenError", () => {
      const { repo } = buildRepo({
        a: journalDefaultsFor({ type: "day" }, "a"),
        b: journalDefaultsFor({ type: "day" }, "b"),
      });
      const result = repo.duplicate("a", "b");
      expect(result.isErr() && result.error).toBeInstanceOf(JournalNameTakenError);
    });

    it("writes nothing when the new name is taken", () => {
      const b = journalDefaultsFor({ type: "day" }, "b");
      const { repo, storage } = buildRepo({ a: { ...journalDefaultsFor({ type: "day" }, "a"), folder: "A/" }, b });
      repo.duplicate("a", "b");
      expect(storage.b).toStrictEqual(b);
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
    it("removes the entity", () => {
      const { repo, storage } = buildRepo({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      repo.delete("daily");
      expect(storage.daily).toBeUndefined();
    });

    it("emits deleted with the journal name", () => {
      const { repo, events } = buildRepo({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      const spy = vi.fn();
      events.on("deleted", spy);
      repo.delete("daily");
      expect(spy).toHaveBeenCalledWith("daily");
    });

    it("returns UnknownJournalError for an unknown name", () => {
      const { repo } = buildRepo();
      const result = repo.delete("nope");
      expect(result.isErr() && result.error).toBeInstanceOf(UnknownJournalError);
    });
  });

  describe("require", () => {
    it("returns Ok with the journal when it exists", () => {
      const daily = journalDefaultsFor({ type: "day" }, "daily");
      const { repo } = buildRepo({ daily });
      const result = repo.require("daily");
      expect(result.isOk() && result.value).toStrictEqual(daily);
    });

    it("returns Err with JournalNotFoundError when the journal is absent", () => {
      const { repo } = buildRepo();
      const result = repo.require("nope");
      expect(result.isErr() && result.error).toBeInstanceOf(JournalNotFoundError);
    });
  });
});
