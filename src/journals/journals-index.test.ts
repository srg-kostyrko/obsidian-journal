import { assert, describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";

import { JournalsIndex } from "./journals-index";

import type { JournalEntry, JournalsIndexEvents } from "./types";

const a = (s: string) => s as AnchorString;
const p = (s: string) => s as VaultPath;
const entry = (journalName: string, anchor: string, path: string): JournalEntry => ({
  journalName,
  anchor: a(anchor),
  path: p(path),
});

interface CapturedEvents {
  entryChanged: Parameters<JournalsIndexEvents["entryChanged"]>[0][];
  journalDirty: Parameters<JournalsIndexEvents["journalDirty"]>[0][];
}

function capture(index: JournalsIndex): CapturedEvents {
  const captured: CapturedEvents = { entryChanged: [], journalDirty: [] };
  index.events.on("entryChanged", (event) => captured.entryChanged.push(event));
  index.events.on("journalDirty", (event) => captured.journalDirty.push(event));
  return captured;
}

describe("JournalsIndex", () => {
  describe("register", () => {
    it("stores the full entry retrievable by path", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "Daily/2022-01-01.md"));
      const result = index.entryByPath(p("Daily/2022-01-01.md"));
      assert(result.isSome());
      expect(result.value.journalName).toBe("daily");
      expect(result.value.anchor).toBe(a("2022-01-01"));
    });

    it("emits entryChanged with kind: added for a new path", () => {
      const index = new JournalsIndex();
      const captured = capture(index);
      const dailyEntry = entry("daily", "2022-01-01", "Daily/2022-01-01.md");
      index.register(dailyEntry);
      expect(captured.entryChanged).toEqual([{ entry: dailyEntry, kind: "added" }]);
    });

    it("identical re-registration emits nothing", () => {
      const index = new JournalsIndex();
      const dailyEntry = entry("daily", "2022-01-01", "Daily/2022-01-01.md");
      index.register(dailyEntry);
      const captured = capture(index);
      index.register(dailyEntry);
      expect(captured.entryChanged).toEqual([]);
    });

    it("re-registering a path with a new anchor emits removed for the old entry and added for the new", () => {
      const index = new JournalsIndex();
      const oldEntry = entry("daily", "2022-01-01", "Daily/2022-01-01.md");
      const newEntry = entry("daily", "2022-01-02", "Daily/2022-01-01.md");
      index.register(oldEntry);
      const captured = capture(index);
      index.register(newEntry);
      expect(captured.entryChanged).toEqual([
        { entry: oldEntry, kind: "removed" },
        { entry: newEntry, kind: "added" },
      ]);
    });

    it("re-registering a path under a different journal returns the new entry", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "shared.md"));
      index.register(entry("weekly", "2022-W01", "shared.md"));
      const result = index.entryByPath(p("shared.md"));
      assert(result.isSome());
      expect(result.value.journalName).toBe("weekly");
    });

    it("re-registering across journals emits removed for the old and added for the new", () => {
      const index = new JournalsIndex();
      const oldEntry = entry("daily", "2022-01-01", "shared.md");
      const newEntry = entry("weekly", "2022-W01", "shared.md");
      index.register(oldEntry);
      const captured = capture(index);
      index.register(newEntry);
      expect(captured.entryChanged).toEqual([
        { entry: oldEntry, kind: "removed" },
        { entry: newEntry, kind: "added" },
      ]);
    });
  });

  describe("entryByPath", () => {
    it("returns None for an unknown path", () => {
      const index = new JournalsIndex();
      expect(index.entryByPath(p("missing.md")).isNone()).toBe(true);
    });
  });

  describe("unregister", () => {
    it("removes the entry from path lookup", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "Daily/2022-01-01.md"));
      index.unregister(p("Daily/2022-01-01.md"));
      expect(index.entryByPath(p("Daily/2022-01-01.md")).isNone()).toBe(true);
    });

    it("emits entryChanged with kind: removed", () => {
      const index = new JournalsIndex();
      const dailyEntry = entry("daily", "2022-01-01", "Daily/2022-01-01.md");
      index.register(dailyEntry);
      const events = capture(index);
      index.unregister(p("Daily/2022-01-01.md"));
      expect(events.entryChanged).toEqual([{ entry: dailyEntry, kind: "removed" }]);
    });

    it("is a no-op when path is unknown", () => {
      const index = new JournalsIndex();
      const events = capture(index);
      index.unregister(p("missing.md"));
      expect(events.entryChanged).toEqual([]);
    });
  });

  describe("transferPath", () => {
    it("updates the path while keeping journal and anchor", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "old.md"));
      index.transferPath(p("old.md"), p("new.md"));
      const result = index.entryByPath(p("new.md"));
      assert(result.isSome());
      expect(result.value.journalName).toBe("daily");
      expect(result.value.anchor).toBe(a("2022-01-01"));
      expect(result.value.path).toBe(p("new.md"));
    });

    it("removes the entry from the old path lookup", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "old.md"));
      index.transferPath(p("old.md"), p("new.md"));
      expect(index.entryByPath(p("old.md")).isNone()).toBe(true);
    });

    it("emits removed for the old path and added for the new path", () => {
      const index = new JournalsIndex();
      const oldEntry = entry("daily", "2022-01-01", "old.md");
      index.register(oldEntry);
      const events = capture(index);
      index.transferPath(p("old.md"), p("new.md"));
      const newEntry = entry("daily", "2022-01-01", "new.md");
      expect(events.entryChanged).toEqual([
        { entry: oldEntry, kind: "removed" },
        { entry: newEntry, kind: "added" },
      ]);
    });

    it("is a no-op when from path is unknown", () => {
      const index = new JournalsIndex();
      const events = capture(index);
      index.transferPath(p("missing.md"), p("new.md"));
      expect(events.entryChanged).toEqual([]);
    });

    it("is a no-op when from equals to", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "same.md"));
      const events = capture(index);
      index.transferPath(p("same.md"), p("same.md"));
      expect(events.entryChanged).toEqual([]);
    });
  });

  describe("clearJournal", () => {
    it("removes all entries for the journal", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "a.md"));
      index.register(entry("daily", "2022-01-02", "b.md"));
      index.clearJournal("daily");
      expect(index.entryByPath(p("a.md")).isNone()).toBe(true);
      expect(index.entryByPath(p("b.md")).isNone()).toBe(true);
    });

    it("does not affect other journals", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "a.md"));
      index.register(entry("weekly", "2022-W01", "w.md"));
      index.clearJournal("daily");
      expect(index.entryByPath(p("w.md")).isSome()).toBe(true);
    });

    it("does not emit per-entry entryChanged", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "a.md"));
      index.register(entry("daily", "2022-01-02", "b.md"));
      const events = capture(index);
      index.clearJournal("daily");
      expect(events.entryChanged).toEqual([]);
    });

    it("is a no-op when journal is unknown", () => {
      const index = new JournalsIndex();
      const events = capture(index);
      index.clearJournal("ghost");
      expect(events.entryChanged).toEqual([]);
    });
  });

  describe("clear", () => {
    it("empties every journal", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "a.md"));
      index.register(entry("weekly", "2022-W01", "w.md"));
      index.clear();
      expect(index.entryByPath(p("a.md")).isNone()).toBe(true);
      expect(index.entryByPath(p("w.md")).isNone()).toBe(true);
    });

    it("does not emit per-entry entryChanged", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "a.md"));
      index.register(entry("weekly", "2022-W01", "w.md"));
      const events = capture(index);
      index.clear();
      expect(events.entryChanged).toEqual([]);
    });
  });

  describe("journalDirty coalescing", () => {
    it("multiple register calls within one microtask emit one journalDirty per journal", async () => {
      const index = new JournalsIndex();
      const events = capture(index);
      index.register(entry("daily", "2022-01-01", "a.md"));
      index.register(entry("daily", "2022-01-02", "b.md"));
      index.register(entry("daily", "2022-01-03", "c.md"));
      await Promise.resolve();
      expect(events.journalDirty).toEqual([{ journalName: "daily" }]);
    });

    it("changes across different journals emit one journalDirty each", async () => {
      const index = new JournalsIndex();
      const events = capture(index);
      index.register(entry("daily", "2022-01-01", "a.md"));
      index.register(entry("weekly", "2022-W01", "w.md"));
      await Promise.resolve();
      expect(new Set(events.journalDirty.map((event) => event.journalName))).toEqual(new Set(["daily", "weekly"]));
      expect(events.journalDirty).toHaveLength(2);
    });

    it("entryChanged still fires synchronously per mutation during coalescing", () => {
      const index = new JournalsIndex();
      const events = capture(index);
      index.register(entry("daily", "2022-01-01", "a.md"));
      index.register(entry("daily", "2022-01-02", "b.md"));
      expect(events.entryChanged).toHaveLength(2);
    });
  });
});
