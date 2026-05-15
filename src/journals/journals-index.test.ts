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
});
