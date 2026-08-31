import { beforeEach, describe, expect, it, vi } from "vitest";

import { testContainer } from "@/testing";

import { journalConfigCollection, type JournalConfig, type NavBlockSegment } from "./config";
import {
  InvalidJournalNameError,
  InvalidJournalUpdateError,
  JournalNameTakenError,
  JournalNotFoundError,
  UnknownJournalError,
} from "./errors";
import { journalsCoreModule } from "./module";
import { JournalsRepository } from "./repository";
import { buildNoteletType, fixedJournal } from "./testing";
import { JournalsEventsToken } from "./tokens";

import type { NoteletType, TypeId } from "./notelets/config";

const addedRow: NavBlockSegment = {
  template: "added to the copy",
  fontSize: 1,
  bold: false,
  italic: false,
  link: "none",
  journal: "",
  linkDate: "",
  color: { type: "theme", name: "text-normal" },
  background: { type: "transparent" },
  addDecorations: false,
};

async function buildRepo(initial: Record<string, JournalConfig> = {}) {
  const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: initial } });
  return {
    repo: harness.resolve(JournalsRepository),
    storage: harness.settings.recordOf(journalConfigCollection),
    events: harness.resolve(JournalsEventsToken),
  };
}

describe("JournalsRepository", () => {
  describe("create", () => {
    it("inserts a journal with defaults for the given write", async () => {
      const { repo, storage } = await buildRepo();

      const result = repo.create("daily", { type: "day" });

      expect(result.kind).toBe("ok");
      expect(storage.daily).toEqual(fixedJournal("daily", { type: "day" }));
    });

    it("emits created with the journal name", async () => {
      const { repo, events } = await buildRepo();
      const spy = vi.fn();
      events.on("created", spy);

      repo.create("daily", { type: "day" });

      expect(spy).toHaveBeenCalledWith("daily");
    });

    it("rejects an empty name with InvalidJournalNameError", async () => {
      const { repo } = await buildRepo();

      const result = repo.create("", { type: "day" });

      expect(result.isErr() && result.error).toBeInstanceOf(InvalidJournalNameError);
    });

    it("rejects a name already in use with JournalNameTakenError", async () => {
      const { repo } = await buildRepo({ daily: fixedJournal("daily", { type: "day" }) });

      const result = repo.create("daily", { type: "day" });

      expect(result.isErr() && result.error).toBeInstanceOf(JournalNameTakenError);
    });
  });

  describe("rename", () => {
    it("stores the entity under the new key with the updated name field", async () => {
      const original = fixedJournal("daily", { type: "day" });
      const { repo, storage } = await buildRepo({ daily: original });

      repo.rename("daily", "renamed");

      expect(storage.renamed?.name).toBe("renamed");
    });

    it("removes the old key on rename", async () => {
      const original = fixedJournal("daily", { type: "day" });
      const { repo, storage } = await buildRepo({ daily: original });

      repo.rename("daily", "renamed");

      expect(storage.daily).toBeUndefined();
    });

    it("emits renamed with old and new name", async () => {
      const { repo, events } = await buildRepo({ daily: fixedJournal("daily", { type: "day" }) });
      const spy = vi.fn();
      events.on("renamed", spy);

      repo.rename("daily", "renamed");

      expect(spy).toHaveBeenCalledWith("daily", "renamed");
    });

    it("does not emit created on rename", async () => {
      const { repo, events } = await buildRepo({ daily: fixedJournal("daily", { type: "day" }) });
      const created = vi.fn();
      events.on("created", created);

      repo.rename("daily", "renamed");

      expect(created).not.toHaveBeenCalled();
    });

    it("does not emit deleted on rename", async () => {
      const { repo, events } = await buildRepo({ daily: fixedJournal("daily", { type: "day" }) });
      const deleted = vi.fn();
      events.on("deleted", deleted);

      repo.rename("daily", "renamed");

      expect(deleted).not.toHaveBeenCalled();
    });

    it("rejects an empty new name with InvalidJournalNameError", async () => {
      const { repo } = await buildRepo({ daily: fixedJournal("daily", { type: "day" }) });

      const result = repo.rename("daily", "");

      expect(result.isErr() && result.error).toBeInstanceOf(InvalidJournalNameError);
    });

    it("rejects newName equal to oldName with InvalidJournalNameError", async () => {
      const { repo } = await buildRepo({ daily: fixedJournal("daily", { type: "day" }) });

      const result = repo.rename("daily", "daily");

      expect(result.isErr() && result.error).toBeInstanceOf(InvalidJournalNameError);
    });

    it("rejects an unknown old name with UnknownJournalError", async () => {
      const { repo } = await buildRepo();

      const result = repo.rename("nope", "next");

      expect(result.isErr() && result.error).toBeInstanceOf(UnknownJournalError);
    });

    it("rejects a new name already in use with JournalNameTakenError", async () => {
      const { repo } = await buildRepo({
        a: fixedJournal("a", { type: "day" }),
        b: fixedJournal("b", { type: "day" }),
      });

      const result = repo.rename("a", "b");

      expect(result.isErr() && result.error).toBeInstanceOf(JournalNameTakenError);
    });
  });

  describe("clone", () => {
    it("stores a copy of the source config under the new name", async () => {
      const source = fixedJournal("daily", { type: "day" }, { folder: "Daily/", confirmCreation: true });
      const { repo, storage } = await buildRepo({ daily: source });

      repo.clone("daily", "daily copy");

      expect(storage["daily copy"]).toStrictEqual({ ...source, name: "daily copy" });
    });

    it("leaves the source journal in place", async () => {
      const source = fixedJournal("daily", { type: "day" });
      const { repo, storage } = await buildRepo({ daily: source });

      repo.clone("daily", "daily copy");

      expect(storage.daily).toStrictEqual(source);
    });

    it("detaches nested values so editing the copy leaves the source untouched", async () => {
      const { repo, storage } = await buildRepo({ daily: fixedJournal("daily", { type: "day" }) });

      repo.clone("daily", "daily copy");
      storage["daily copy"]?.navBlock.lines.push([addedRow]);

      expect(storage.daily?.navBlock.lines).not.toContainEqual([
        expect.objectContaining({ template: "added to the copy" }),
      ]);
    });

    it("returns the stored copy", async () => {
      const { repo } = await buildRepo({ daily: fixedJournal("daily", { type: "day" }) });

      const result = repo.clone("daily", "daily copy");

      expect(result.isOk() && result.value.name).toBe("daily copy");
    });

    it("emits cloned with the source and new name", async () => {
      const { repo, events } = await buildRepo({ daily: fixedJournal("daily", { type: "day" }) });
      const spy = vi.fn();
      events.on("cloned", spy);

      repo.clone("daily", "daily copy");

      expect(spy).toHaveBeenCalledWith("daily", "daily copy");
    });

    it("emits cloned after created so listeners see the stored copy", async () => {
      const { repo, events } = await buildRepo({ daily: fixedJournal("daily", { type: "day" }) });
      const calls: string[] = [];
      events.on("created", () => calls.push("created"));
      events.on("cloned", () => calls.push("cloned"));

      repo.clone("daily", "daily copy");

      expect(calls).toStrictEqual(["created", "cloned"]);
    });

    it("rejects an empty new name with InvalidJournalNameError", async () => {
      const { repo } = await buildRepo({ daily: fixedJournal("daily", { type: "day" }) });

      const result = repo.clone("daily", "");

      expect(result.isErr() && result.error).toBeInstanceOf(InvalidJournalNameError);
    });

    it("rejects an unknown source name with UnknownJournalError", async () => {
      const { repo } = await buildRepo();

      const result = repo.clone("nope", "copy");

      expect(result.isErr() && result.error).toBeInstanceOf(UnknownJournalError);
    });

    it("rejects a new name already in use with JournalNameTakenError", async () => {
      const { repo } = await buildRepo({
        a: fixedJournal("a", { type: "day" }),
        b: fixedJournal("b", { type: "day" }),
      });

      const result = repo.clone("a", "b");

      expect(result.isErr() && result.error).toBeInstanceOf(JournalNameTakenError);
    });

    it("writes nothing when the new name is taken", async () => {
      const b = fixedJournal("b", { type: "day" });
      const { repo, storage } = await buildRepo({ a: { ...fixedJournal("a", { type: "day" }), folder: "A/" }, b });

      repo.clone("a", "b");

      expect(storage.b).toStrictEqual(b);
    });
  });

  describe("inherited update", () => {
    let harness: Awaited<ReturnType<typeof buildRepo>>;

    beforeEach(async () => {
      harness = await buildRepo({ daily: fixedJournal("daily", { type: "day" }) });
    });

    it("rejects a name change via update with InvalidJournalUpdateError", () => {
      const changes: Partial<JournalConfig> = { name: "other" };

      const result = harness.repo.update("daily", changes);

      expect(result.isErr() && result.error).toBeInstanceOf(InvalidJournalUpdateError);
    });

    it("accepts updates to non-id fields", () => {
      const result = harness.repo.update("daily", { folder: "Daily/" });

      expect(result.kind).toBe("ok");
      expect(harness.storage.daily?.folder).toBe("Daily/");
    });
  });

  describe("inherited delete", () => {
    it("removes the entity", async () => {
      const { repo, storage } = await buildRepo({ daily: fixedJournal("daily", { type: "day" }) });

      repo.delete("daily");

      expect(storage.daily).toBeUndefined();
    });

    it("emits deleted with the journal name", async () => {
      const { repo, events } = await buildRepo({ daily: fixedJournal("daily", { type: "day" }) });
      const spy = vi.fn();
      events.on("deleted", spy);

      repo.delete("daily");

      expect(spy).toHaveBeenCalledWith("daily");
    });

    it("returns UnknownJournalError for an unknown name", async () => {
      const { repo } = await buildRepo();

      const result = repo.delete("nope");

      expect(result.isErr() && result.error).toBeInstanceOf(UnknownJournalError);
    });
  });

  describe("notelet types", () => {
    it("adds a type and announces it", async () => {
      const { repo, events } = await buildRepo({ daily: fixedJournal("daily", { type: "day" }) });
      const seen: { journalName: string; type: NoteletType }[] = [];
      events.on("noteletTypeAdded", (journalName, type) => {
        seen.push({ journalName, type });
      });
      const type = buildNoteletType({ id: "nt_1" as TypeId, name: "Standup" });

      const result = repo.addNoteletType("daily", type);

      expect(result.isOk()).toBe(true);
      expect(repo.get("daily").getOrUndefined()?.notelets).toMatchObject({ nt_1: type });
      expect(seen).toEqual([{ journalName: "daily", type }]);
    });

    it("deletes a type and announces it", async () => {
      const seeded = buildNoteletType({ id: "nt_1" as TypeId, name: "Standup" });
      const { repo, events } = await buildRepo({
        daily: fixedJournal("daily", { type: "day" }, { notelets: { nt_1: seeded } }),
      });
      const seen: { journalName: string; typeId: TypeId }[] = [];
      events.on("noteletTypeDeleted", (journalName, typeId) => {
        seen.push({ journalName, typeId });
      });

      const result = repo.deleteNoteletType("daily", "nt_1" as TypeId);

      expect(result.isOk()).toBe(true);
      expect(repo.get("daily").getOrUndefined()?.notelets).toEqual({});
      expect(seen).toEqual([{ journalName: "daily", typeId: "nt_1" }]);
    });

    it("refuses to add a type to a journal that does not exist", async () => {
      const { repo } = await buildRepo();

      const result = repo.addNoteletType("gone", buildNoteletType());

      expect(result.isErr()).toBe(true);
      expect(result.isErr() && result.error).toBeInstanceOf(UnknownJournalError);
    });

    it("refuses to delete a type from a journal that does not exist", async () => {
      const { repo } = await buildRepo();

      const result = repo.deleteNoteletType("gone", "nt_1" as TypeId);

      expect(result.isErr()).toBe(true);
      expect(result.isErr() && result.error).toBeInstanceOf(UnknownJournalError);
    });
  });

  describe("require", () => {
    it("returns Ok with the journal when it exists", async () => {
      const daily = fixedJournal("daily", { type: "day" });
      const { repo } = await buildRepo({ daily });

      const result = repo.require("daily");

      expect(result.isOk() && result.value).toStrictEqual(daily);
    });

    it("returns Err with JournalNotFoundError when the journal is absent", async () => {
      const { repo } = await buildRepo();

      const result = repo.require("nope");

      expect(result.isErr() && result.error).toBeInstanceOf(JournalNotFoundError);
    });
  });
});
