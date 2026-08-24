import { describe, expect, it, vi } from "vitest";

import { testContainer } from "@/testing";

import { journalConfigCollection, type NavBlockSegment } from "./config";
import {
  InvalidJournalNameError,
  InvalidJournalUpdateError,
  JournalNameTakenError,
  JournalNotFoundError,
  UnknownJournalError,
} from "./errors";
import { journalsCoreModule } from "./module";
import { JournalsRepository } from "./repository";
import { fixedJournal } from "./testing";
import { JournalsEventsToken } from "./tokens";

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

describe("JournalsRepository", () => {
  describe("create", () => {
    it("inserts a journal with defaults for the given write", async () => {
      const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: {} } });
      const repo = harness.resolve(JournalsRepository);

      const result = repo.create("daily", { type: "day" });

      expect(result.kind).toBe("ok");
      expect(harness.settings.recordOf(journalConfigCollection).daily).toEqual(fixedJournal("daily", { type: "day" }));
    });

    it("emits created with the journal name", async () => {
      const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: {} } });
      const repo = harness.resolve(JournalsRepository);
      const events = harness.resolve(JournalsEventsToken);
      const spy = vi.fn();
      events.on("created", spy);

      repo.create("daily", { type: "day" });

      expect(spy).toHaveBeenCalledWith("daily");
    });

    it("rejects an empty name with InvalidJournalNameError", async () => {
      const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: {} } });
      const repo = harness.resolve(JournalsRepository);

      const result = repo.create("", { type: "day" });

      expect(result.isErr() && result.error).toBeInstanceOf(InvalidJournalNameError);
    });

    it("rejects a name already in use with JournalNameTakenError", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      const repo = harness.resolve(JournalsRepository);

      const result = repo.create("daily", { type: "day" });

      expect(result.isErr() && result.error).toBeInstanceOf(JournalNameTakenError);
    });
  });

  describe("rename", () => {
    it("stores the entity under the new key with the updated name field", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      const repo = harness.resolve(JournalsRepository);

      repo.rename("daily", "renamed");

      expect(harness.settings.recordOf(journalConfigCollection).renamed?.name).toBe("renamed");
    });

    it("removes the old key on rename", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      const repo = harness.resolve(JournalsRepository);

      repo.rename("daily", "renamed");

      expect(harness.settings.recordOf(journalConfigCollection).daily).toBeUndefined();
    });

    it("emits renamed with old and new name", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      const repo = harness.resolve(JournalsRepository);
      const events = harness.resolve(JournalsEventsToken);
      const spy = vi.fn();
      events.on("renamed", spy);

      repo.rename("daily", "renamed");

      expect(spy).toHaveBeenCalledWith("daily", "renamed");
    });

    it("does not emit created on rename", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      const repo = harness.resolve(JournalsRepository);
      const events = harness.resolve(JournalsEventsToken);
      const created = vi.fn();
      events.on("created", created);

      repo.rename("daily", "renamed");

      expect(created).not.toHaveBeenCalled();
    });

    it("does not emit deleted on rename", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      const repo = harness.resolve(JournalsRepository);
      const events = harness.resolve(JournalsEventsToken);
      const deleted = vi.fn();
      events.on("deleted", deleted);

      repo.rename("daily", "renamed");

      expect(deleted).not.toHaveBeenCalled();
    });

    it("rejects an empty new name with InvalidJournalNameError", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      const repo = harness.resolve(JournalsRepository);

      const result = repo.rename("daily", "");

      expect(result.isErr() && result.error).toBeInstanceOf(InvalidJournalNameError);
    });

    it("rejects newName equal to oldName with InvalidJournalNameError", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      const repo = harness.resolve(JournalsRepository);

      const result = repo.rename("daily", "daily");

      expect(result.isErr() && result.error).toBeInstanceOf(InvalidJournalNameError);
    });

    it("rejects an unknown old name with UnknownJournalError", async () => {
      const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: {} } });
      const repo = harness.resolve(JournalsRepository);

      const result = repo.rename("nope", "next");

      expect(result.isErr() && result.error).toBeInstanceOf(UnknownJournalError);
    });

    it("rejects a new name already in use with JournalNameTakenError", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { a: fixedJournal("a", { type: "day" }), b: fixedJournal("b", { type: "day" }) } },
      });
      const repo = harness.resolve(JournalsRepository);

      const result = repo.rename("a", "b");

      expect(result.isErr() && result.error).toBeInstanceOf(JournalNameTakenError);
    });
  });

  describe("clone", () => {
    it("stores a copy of the source config under the new name", async () => {
      const source = fixedJournal("daily", { type: "day" }, { folder: "Daily/", confirmCreation: true });
      const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: { daily: source } } });
      const repo = harness.resolve(JournalsRepository);

      repo.clone("daily", "daily copy");

      expect(harness.settings.recordOf(journalConfigCollection)["daily copy"]).toStrictEqual({
        ...source,
        name: "daily copy",
      });
    });

    it("leaves the source journal in place", async () => {
      const source = fixedJournal("daily", { type: "day" });
      const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: { daily: source } } });
      const repo = harness.resolve(JournalsRepository);

      repo.clone("daily", "daily copy");

      expect(harness.settings.recordOf(journalConfigCollection).daily).toStrictEqual(source);
    });

    it("detaches nested values so editing the copy leaves the source untouched", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      const repo = harness.resolve(JournalsRepository);

      repo.clone("daily", "daily copy");
      const storage = harness.settings.recordOf(journalConfigCollection);
      storage["daily copy"]?.navBlock.lines.push([addedRow]);

      expect(storage.daily?.navBlock.lines).not.toContainEqual([
        expect.objectContaining({ template: "added to the copy" }),
      ]);
    });

    it("returns the stored copy", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      const repo = harness.resolve(JournalsRepository);

      const result = repo.clone("daily", "daily copy");

      expect(result.isOk() && result.value.name).toBe("daily copy");
    });

    it("emits cloned with the source and new name", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      const repo = harness.resolve(JournalsRepository);
      const events = harness.resolve(JournalsEventsToken);
      const spy = vi.fn();
      events.on("cloned", spy);

      repo.clone("daily", "daily copy");

      expect(spy).toHaveBeenCalledWith("daily", "daily copy");
    });

    it("emits cloned after created so listeners see the stored copy", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      const repo = harness.resolve(JournalsRepository);
      const events = harness.resolve(JournalsEventsToken);
      const calls: string[] = [];
      events.on("created", () => calls.push("created"));
      events.on("cloned", () => calls.push("cloned"));

      repo.clone("daily", "daily copy");

      expect(calls).toStrictEqual(["created", "cloned"]);
    });

    it("rejects an empty new name with InvalidJournalNameError", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      const repo = harness.resolve(JournalsRepository);

      const result = repo.clone("daily", "");

      expect(result.isErr() && result.error).toBeInstanceOf(InvalidJournalNameError);
    });

    it("rejects an unknown source name with UnknownJournalError", async () => {
      const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: {} } });
      const repo = harness.resolve(JournalsRepository);

      const result = repo.clone("nope", "copy");

      expect(result.isErr() && result.error).toBeInstanceOf(UnknownJournalError);
    });

    it("rejects a new name already in use with JournalNameTakenError", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { a: fixedJournal("a", { type: "day" }), b: fixedJournal("b", { type: "day" }) } },
      });
      const repo = harness.resolve(JournalsRepository);

      const result = repo.clone("a", "b");

      expect(result.isErr() && result.error).toBeInstanceOf(JournalNameTakenError);
    });

    it("writes nothing when the new name is taken", async () => {
      const b = fixedJournal("b", { type: "day" });
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { a: fixedJournal("a", { type: "day" }, { folder: "A/" }), b } },
      });
      const repo = harness.resolve(JournalsRepository);

      repo.clone("a", "b");

      expect(harness.settings.recordOf(journalConfigCollection).b).toStrictEqual(b);
    });
  });

  describe("inherited update", () => {
    it("rejects a name change via update with InvalidJournalUpdateError", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      const repo = harness.resolve(JournalsRepository);
      const changes = { name: "other" };

      const result = repo.update("daily", changes);

      expect(result.isErr() && result.error).toBeInstanceOf(InvalidJournalUpdateError);
    });

    it("accepts updates to non-id fields", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      const repo = harness.resolve(JournalsRepository);

      const result = repo.update("daily", { folder: "Daily/" });

      expect(result.kind).toBe("ok");
      expect(harness.settings.recordOf(journalConfigCollection).daily?.folder).toBe("Daily/");
    });
  });

  describe("inherited delete", () => {
    it("removes the entity", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      const repo = harness.resolve(JournalsRepository);

      repo.delete("daily");

      expect(harness.settings.recordOf(journalConfigCollection).daily).toBeUndefined();
    });

    it("emits deleted with the journal name", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      const repo = harness.resolve(JournalsRepository);
      const events = harness.resolve(JournalsEventsToken);
      const spy = vi.fn();
      events.on("deleted", spy);

      repo.delete("daily");

      expect(spy).toHaveBeenCalledWith("daily");
    });

    it("returns UnknownJournalError for an unknown name", async () => {
      const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: {} } });
      const repo = harness.resolve(JournalsRepository);

      const result = repo.delete("nope");

      expect(result.isErr() && result.error).toBeInstanceOf(UnknownJournalError);
    });
  });

  describe("require", () => {
    it("returns Ok with the journal when it exists", async () => {
      const daily = fixedJournal("daily", { type: "day" });
      const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: { daily } } });
      const repo = harness.resolve(JournalsRepository);

      const result = repo.require("daily");

      expect(result.isOk() && result.value).toStrictEqual(daily);
    });

    it("returns Err with JournalNotFoundError when the journal is absent", async () => {
      const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: {} } });
      const repo = harness.resolve(JournalsRepository);

      const result = repo.require("nope");

      expect(result.isErr() && result.error).toBeInstanceOf(JournalNotFoundError);
    });
  });
});
