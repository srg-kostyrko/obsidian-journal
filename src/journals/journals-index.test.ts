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

    it("re-registering an unmoved path with a new end date stores it", () => {
      const index = new JournalsIndex();
      const path = "Custom/2022-01-01.md";
      index.register({ ...entry("custom", "2022-01-01", path), endDate: a("2022-01-14") });
      index.register({ ...entry("custom", "2022-01-01", path), endDate: a("2022-01-21") });
      const result = index.entryByPath(p(path));
      assert(result.isSome());
      expect(result.value.endDate).toBe(a("2022-01-21"));
    });

    it("re-registering an unmoved path with new numbers stores them", () => {
      const index = new JournalsIndex();
      const path = "Custom/2022-01-01.md";
      index.register({ ...entry("custom", "2022-01-01", path), numbers: { index: 1 } });
      index.register({ ...entry("custom", "2022-01-01", path), numbers: { index: 7 } });
      const result = index.entryByPath(p(path));
      assert(result.isSome());
      expect(result.value.numbers).toEqual({ index: 7 });
    });

    it("re-registering an unmoved path with a changed answer stores it and announces the change", () => {
      const index = new JournalsIndex();
      const path = "Custom/2022-01-01.md";
      index.register({ ...entry("custom", "2022-01-01", path), answers: { mood: "good" } });
      const captured = capture(index);
      const updated: JournalEntry = { ...entry("custom", "2022-01-01", path), answers: { mood: "sad" } };
      index.register(updated);
      const result = index.entryByPath(p(path));
      assert(result.isSome());
      expect(result.value.answers).toEqual({ mood: "sad" });
      expect(captured.entryChanged).toEqual([{ entry: updated, kind: "added" }]);
    });

    it("a payload-only change announces the new entry without removing the old", () => {
      const index = new JournalsIndex();
      const path = "Custom/2022-01-01.md";
      index.register({ ...entry("custom", "2022-01-01", path), endDate: a("2022-01-14") });
      const captured = capture(index);
      const updated: JournalEntry = { ...entry("custom", "2022-01-01", path), endDate: a("2022-01-21") };
      index.register(updated);
      expect(captured.entryChanged).toEqual([{ entry: updated, kind: "added" }]);
    });

    it("a payload-only change marks the journal dirty", async () => {
      const index = new JournalsIndex();
      const path = "Custom/2022-01-01.md";
      index.register({ ...entry("custom", "2022-01-01", path), numbers: { index: 1 } });
      const captured = capture(index);
      index.register({ ...entry("custom", "2022-01-01", path), numbers: { index: 7 } });
      await Promise.resolve();
      expect(captured.journalDirty).toEqual([{ journalName: "custom" }]);
    });

    it("a payload-only change keeps the anchor slot pointing at the same path", () => {
      const index = new JournalsIndex();
      const path = "Custom/2022-01-01.md";
      index.register({ ...entry("custom", "2022-01-01", path), endDate: a("2022-01-14") });
      index.register({ ...entry("custom", "2022-01-01", path), endDate: a("2022-01-21") });
      const slot = index.get("custom", a("2022-01-01"));
      assert(slot.isSome());
      expect(slot.value).toBe(p(path));
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

    it("re-registering across journals removes the anchor from the old journal", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "shared.md"));
      index.register(entry("weekly", "2022-W01", "shared.md"));
      expect(index.has("daily", a("2022-01-01"))).toBe(false);
    });

    it("keeps the incumbent when a different path claims an occupied anchor", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "original.md"));
      index.register(entry("daily", "2022-01-01", "original (conflicted copy).md"));
      const atAnchor = index.entryByAnchor("daily", a("2022-01-01"));
      assert(atAnchor.isSome());
      expect(atAnchor.value.path).toBe(p("original.md"));
    });

    it("reports collision when a different path claims an occupied anchor", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "original.md"));
      expect(index.register(entry("daily", "2022-01-01", "conflict.md"))).toBe("collision");
    });

    it("still resolves a colliding path by its own path", () => {
      // A settings-preview entry (a unique synthetic path at today's real anchor) must stay
      // resolvable by entryByPath even though the real note owns the anchor slot.
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "original.md"));
      index.register(entry("daily", "2022-01-01", "conflict.md"));
      const byPath = index.entryByPath(p("conflict.md"));
      assert(byPath.isSome());
      expect(byPath.value.anchor).toBe(a("2022-01-01"));
    });

    it("reports registered for a first-seen anchor", () => {
      const index = new JournalsIndex();
      expect(index.register(entry("daily", "2022-01-01", "original.md"))).toBe("registered");
    });

    it("does not orphan the incumbent when a collision loser is re-registered at a new anchor", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "original.md"));
      index.register(entry("daily", "2022-01-01", "conflict.md")); // collision loser at 2022-01-01
      index.register(entry("daily", "2022-01-05", "conflict.md")); // loser re-anchors elsewhere
      const atOriginal = index.entryByAnchor("daily", a("2022-01-01"));
      assert(atOriginal.isSome());
      expect(atOriginal.value.path).toBe(p("original.md"));
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

    it("removes the entry from its journal's anchor index", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "Daily/2022-01-01.md"));
      index.unregister(p("Daily/2022-01-01.md"));
      expect(index.has("daily", a("2022-01-01"))).toBe(false);
    });

    it("keeps the incumbent indexed when a rejected collision path is unregistered", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "original.md"));
      index.register(entry("daily", "2022-01-01", "conflict.md"));
      index.unregister(p("conflict.md"));
      const atAnchor = index.entryByAnchor("daily", a("2022-01-01"));
      assert(atAnchor.isSome());
      expect(atAnchor.value.path).toBe(p("original.md"));
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

    it("does not seize the incumbent's slot when a collision loser is renamed", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "original.md"));
      index.register(entry("daily", "2022-01-01", "conflict.md")); // collision loser
      index.transferPath(p("conflict.md"), p("renamed.md"));
      const atAnchor = index.entryByAnchor("daily", a("2022-01-01"));
      assert(atAnchor.isSome());
      expect(atAnchor.value.path).toBe(p("original.md"));
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

    it("emits journalDirty for the cleared journal", async () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "a.md"));
      await Promise.resolve(); // drain the register's microtask
      const events = capture(index);
      index.clearJournal("daily");
      await Promise.resolve();
      expect(events.journalDirty).toEqual([{ journalName: "daily" }]);
    });

    it("removes a collision loser from path lookup when its journal is cleared", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "original.md"));
      index.register(entry("daily", "2022-01-01", "conflict.md")); // collision loser
      index.clearJournal("daily");
      expect(index.entryByPath(p("conflict.md")).isNone()).toBe(true);
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

    it("emits journalDirty once per previously-known journal", async () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "a.md"));
      index.register(entry("weekly", "2022-W01", "w.md"));
      await Promise.resolve(); // drain register's coalesced events
      const events = capture(index);
      index.clear();
      await Promise.resolve();
      expect(new Set(events.journalDirty.map((event) => event.journalName))).toEqual(new Set(["daily", "weekly"]));
      expect(events.journalDirty).toHaveLength(2);
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

  describe("query passthroughs", () => {
    it("has returns true for an indexed (journal, anchor) pair", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "a.md"));
      expect(index.has("daily", a("2022-01-01"))).toBe(true);
    });

    it("has returns false for an unknown journal", () => {
      const index = new JournalsIndex();
      expect(index.has("ghost", a("2022-01-01"))).toBe(false);
    });

    it("get returns the path for an indexed (journal, anchor) pair", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "a.md"));
      const result = index.get("daily", a("2022-01-01"));
      assert(result.isSome());
      expect(result.value).toBe(p("a.md"));
    });

    it("get on an unknown journal returns None", () => {
      const index = new JournalsIndex();
      expect(index.get("ghost", a("2022-01-01")).isNone()).toBe(true);
    });

    it("getRange returns inclusive entries for the journal", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "a.md"));
      index.register(entry("daily", "2022-01-05", "b.md"));
      index.register(entry("daily", "2022-01-10", "c.md"));
      index.register(entry("weekly", "2022-W01", "w.md"));
      const result = index.getRange("daily", a("2022-01-01"), a("2022-01-05"));
      expect([...result]).toEqual([
        [a("2022-01-01"), p("a.md")],
        [a("2022-01-05"), p("b.md")],
      ]);
    });

    it("getRange on an unknown journal returns an empty map", () => {
      const index = new JournalsIndex();
      expect(index.getRange("ghost", a("2022-01-01"), a("2022-12-31")).size).toBe(0);
    });

    it("findNext returns the next path in the named journal", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "a.md"));
      index.register(entry("daily", "2022-01-05", "b.md"));
      const result = index.findNext("daily", a("2022-01-01"));
      assert(result.isSome());
      expect(result.value).toBe(p("b.md"));
    });

    it("findNext on an unknown journal returns None", () => {
      const index = new JournalsIndex();
      expect(index.findNext("ghost", a("2022-01-01")).isNone()).toBe(true);
    });

    it("findPrevious returns the previous path in the named journal", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "a.md"));
      index.register(entry("daily", "2022-01-05", "b.md"));
      const result = index.findPrevious("daily", a("2022-01-05"));
      assert(result.isSome());
      expect(result.value).toBe(p("a.md"));
    });

    it("findPrevious on an unknown journal returns None", () => {
      const index = new JournalsIndex();
      expect(index.findPrevious("ghost", a("2022-01-05")).isNone()).toBe(true);
    });

    it("findClosestAnchor returns the closest indexed anchor in the named journal", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "a.md"));
      index.register(entry("daily", "2022-01-05", "b.md"));
      const result = index.findClosestAnchor("daily", a("2022-01-03"));
      assert(result.isSome());
      expect(result.value).toBe(a("2022-01-01"));
    });

    it("findClosestAnchor on an unknown journal returns None", () => {
      const index = new JournalsIndex();
      expect(index.findClosestAnchor("ghost", a("2022-01-01")).isNone()).toBe(true);
    });

    it("entriesFor yields every entry of the named journal in anchor order", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-05", "b.md"));
      index.register(entry("daily", "2022-01-01", "a.md"));
      index.register(entry("weekly", "2022-W01", "w.md"));
      expect([...index.entriesFor("daily")]).toEqual([
        [a("2022-01-01"), p("a.md")],
        [a("2022-01-05"), p("b.md")],
      ]);
    });

    it("entriesFor on an unknown journal yields nothing", () => {
      const index = new JournalsIndex();
      expect([...index.entriesFor("ghost")]).toEqual([]);
    });
  });

  describe("findNearestExisting", () => {
    it("returns the closest earlier anchor across journals for previous", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "d/2022-01-01.md"));
      index.register(entry("work", "2022-01-05", "w/2022-01-05.md"));
      const result = index.findNearestExisting(["daily", "work"], a("2022-01-08"), "previous");
      assert(result.isSome());
      expect(result.value).toBe(a("2022-01-05"));
    });

    it("returns the closest later anchor across journals for next", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-10", "d/2022-01-10.md"));
      index.register(entry("work", "2022-01-05", "w/2022-01-05.md"));
      const result = index.findNearestExisting(["daily", "work"], a("2022-01-01"), "next");
      assert(result.isSome());
      expect(result.value).toBe(a("2022-01-05"));
    });

    it("excludes the reference anchor itself (strictly before/after)", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-05", "d/2022-01-05.md"));
      index.register(entry("daily", "2022-01-02", "d/2022-01-02.md"));
      const result = index.findNearestExisting(["daily"], a("2022-01-05"), "previous");
      assert(result.isSome());
      expect(result.value).toBe(a("2022-01-02"));
    });

    it("returns none when no entry exists in the direction", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-05", "d/2022-01-05.md"));
      expect(index.findNearestExisting(["daily"], a("2022-01-01"), "previous").isNone()).toBe(true);
    });

    it("skips unknown journal names", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-02", "d/2022-01-02.md"));
      const result = index.findNearestExisting(["daily", "missing"], a("2022-01-05"), "previous");
      assert(result.isSome());
      expect(result.value).toBe(a("2022-01-02"));
    });

    it("returns none for an empty journal list", () => {
      const index = new JournalsIndex();
      expect(index.findNearestExisting([], a("2022-01-05"), "next").isNone()).toBe(true);
    });
  });

  describe("entryByAnchor", () => {
    it("returns the full entry when the anchor is registered", () => {
      const index = new JournalsIndex();
      const dailyEntry = entry("daily", "2022-01-01", "Daily/2022-01-01.md");
      index.register(dailyEntry);
      const result = index.entryByAnchor("daily", a("2022-01-01"));
      assert(result.isSome());
      expect(result.value).toEqual(dailyEntry);
    });

    it("returns None for an unknown journal", () => {
      const index = new JournalsIndex();
      expect(index.entryByAnchor("missing", a("2022-01-01")).isNone()).toBe(true);
    });

    it("returns None for an unregistered anchor", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "Daily/2022-01-01.md"));
      expect(index.entryByAnchor("daily", a("2022-01-02")).isNone()).toBe(true);
    });

    it("returns the entry with endDate when registered with one", () => {
      const index = new JournalsIndex();
      const sprintEntry: JournalEntry = {
        journalName: "sprints",
        anchor: a("2022-01-01"),
        path: p("Sprints/S1.md"),
        endDate: a("2022-01-21"),
      };
      index.register(sprintEntry);
      const result = index.entryByAnchor("sprints", a("2022-01-01"));
      assert(result.isSome());
      expect(result.value).toEqual(sprintEntry);
    });
  });

  describe("pathsAt", () => {
    it("collects the path from each journal that has an entry at the anchor", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "Daily/2022-01-01.md"));
      index.register(entry("work", "2022-01-01", "Work/2022-01-01.md"));
      expect(index.pathsAt(["daily", "work"], a("2022-01-01"))).toEqual([
        p("Daily/2022-01-01.md"),
        p("Work/2022-01-01.md"),
      ]);
    });

    it("omits journals with no entry at the anchor", () => {
      const index = new JournalsIndex();
      index.register(entry("daily", "2022-01-01", "Daily/2022-01-01.md"));
      expect(index.pathsAt(["daily", "work"], a("2022-01-01"))).toEqual([p("Daily/2022-01-01.md")]);
    });

    it("returns an empty array when no journal has an entry at the anchor", () => {
      const index = new JournalsIndex();
      expect(index.pathsAt(["daily"], a("2022-01-01"))).toEqual([]);
    });
  });

  describe("isReady", () => {
    it("is false before markReady and true after", () => {
      const index = new JournalsIndex();
      expect(index.isReady()).toBe(false);
      index.markReady();
      expect(index.isReady()).toBe(true);
    });
  });
});
