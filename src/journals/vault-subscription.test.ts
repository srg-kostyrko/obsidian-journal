import { TFile } from "obsidian";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnchorString } from "@/calendar";
import { NoteMetadataService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import type { FakeHost } from "@/infrastructure/host/internal/testing";
import { SettingsEventsToken } from "@/settings";
import { testContainer, type TestHarness } from "@/testing";

import { CycleService } from "./cycle";
import { JournalsIndex } from "./journals-index";
import { journalsCoreModule } from "./module";
import { JournalsRepository } from "./repository";
import { customJournal, fixedJournal, unwrap } from "./testing";
import { VaultSubscriptionService } from "./vault-subscription";

function requireFile(host: FakeHost, path: VaultPath): TFile {
  const file = host.app.vault.getAbstractFileByPath(path);
  assert(file instanceof TFile);
  return file;
}

describe("VaultSubscriptionService", () => {
  describe("daily journal", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
    });

    it("populates JournalsIndex with parseable notes during initialize", async () => {
      harness.host.putFile("D/2024-01-01.md", "", { journal: "daily", "journal-date": "2024-01-01" });
      await harness.resolve(VaultSubscriptionService).initialize();

      expect(
        harness
          .resolve(JournalsIndex)
          .entryByPath("D/2024-01-01.md" as VaultPath)
          .isSome(),
      ).toBe(true);
    });

    it("registers a newly-parseable note on metadata-changed", async () => {
      await harness.resolve(VaultSubscriptionService).initialize();

      harness.host.putFile("D/X.md", "", { journal: "daily", "journal-date": "2024-01-02" });
      harness.host.emitMetadata("D/X.md");

      expect(
        harness
          .resolve(JournalsIndex)
          .entryByPath("D/X.md" as VaultPath)
          .isSome(),
      ).toBe(true);
    });

    it("unregisters a note when its frontmatter no longer parses", async () => {
      harness.host.putFile("D/X.md", "", { journal: "daily", "journal-date": "2024-01-02" });
      await harness.resolve(VaultSubscriptionService).initialize();
      const index = harness.resolve(JournalsIndex);
      expect(index.entryByPath("D/X.md" as VaultPath).isSome()).toBe(true);

      harness.host.putFile("D/X.md", "", {});
      harness.host.emitMetadata("D/X.md");

      expect(index.entryByPath("D/X.md" as VaultPath).isNone()).toBe(true);
    });

    it("transfers the entry path on rename", async () => {
      harness.host.putFile("D/A.md", "", { journal: "daily", "journal-date": "2024-01-01" });
      await harness.resolve(VaultSubscriptionService).initialize();
      const index = harness.resolve(JournalsIndex);

      await harness.host.app.vault.rename(requireFile(harness.host, "D/A.md" as VaultPath), "D/B.md");

      expect(index.entryByPath("D/A.md" as VaultPath).isNone()).toBe(true);
      expect(index.entryByPath("D/B.md" as VaultPath).isSome()).toBe(true);
    });

    it("unregisters on delete", async () => {
      harness.host.putFile("D/A.md", "", { journal: "daily", "journal-date": "2024-01-01" });
      await harness.resolve(VaultSubscriptionService).initialize();
      const index = harness.resolve(JournalsIndex);

      await harness.host.app.fileManager.trashFile(requireFile(harness.host, "D/A.md" as VaultPath));

      expect(index.entryByPath("D/A.md" as VaultPath).isNone()).toBe(true);
    });

    it("clears the index for a deleted journal whose notes keep their frontmatter", async () => {
      harness.host.putFile("D/A.md", "", { journal: "daily", "journal-date": "2024-01-01" });
      await harness.resolve(VaultSubscriptionService).initialize();
      const index = harness.resolve(JournalsIndex);
      expect(index.entryByPath("D/A.md" as VaultPath).isSome()).toBe(true);

      // The "keep" delete mode leaves the note (and its frontmatter) in place, so no vault event
      // fires — only the journal's own "deleted" event can drop its stale index entry.
      harness.resolve(JournalsRepository).delete("daily");

      expect(index.entryByPath("D/A.md" as VaultPath).isNone()).toBe(true);
    });

    it("reindexes notes when settings are reloaded from an external sync", async () => {
      await harness.resolve(VaultSubscriptionService).initialize();

      harness.host.putFile("D/X.md", "", { journal: "daily", "journal-date": "2024-01-03" });
      harness.resolve(SettingsEventsToken).emit("reloaded");

      expect(
        harness
          .resolve(JournalsIndex)
          .entryByPath("D/X.md" as VaultPath)
          .isSome(),
      ).toBe(true);
    });

    it("does not register on created (waits for metadata-changed)", async () => {
      await harness.resolve(VaultSubscriptionService).initialize();

      await harness.host.app.vault.create("D/A.md", "");

      expect(
        harness
          .resolve(JournalsIndex)
          .entryByPath("D/A.md" as VaultPath)
          .isNone(),
      ).toBe(true);
    });
  });

  // Imported note: on disk at boot, but metadataCache has not parsed it yet. createFakeHost fills
  // a putFile's cache atomically with the file and emits no "resolved" batch, so both halves of
  // that window are staged here — withhold the cache, then drive the batch the walk waits on.
  it("indexes an imported note whose metadata resolves only after the boot walk", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
    const imported = harness.host.putFile("day/2024-01-01.md", "", {
      journal: "daily",
      "journal-date": "2024-01-01",
    });
    const cache = harness.host.app.metadataCache;
    const read = cache.getFileCache.bind(cache);
    const unparsed = vi
      .spyOn(cache, "getFileCache")
      .mockImplementation((file) => (file === imported ? null : read(file)));
    const batches: (() => void)[] = [];
    vi.spyOn(harness.resolve(NoteMetadataService), "onResolved").mockImplementation((callback) => {
      batches.push(callback);
      return () => void batches.splice(batches.indexOf(callback), 1);
    });

    await harness.resolve(VaultSubscriptionService).initialize();
    const index = harness.resolve(JournalsIndex);
    expect(index.entryByPath("day/2024-01-01.md" as VaultPath).isNone()).toBe(true);

    unparsed.mockImplementation(read);
    for (const batch of batches.splice(0)) batch();

    expect(index.entryByPath("day/2024-01-01.md" as VaultPath).isSome()).toBe(true);
  });

  describe("custom biweekly journal anchored 2026-08-03", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { custom: customJournal("custom", "week", 2, "2026-08-03") } },
      });
    });

    it("updates the indexed end date when an interval's note is edited", async () => {
      harness.host.putFile("C/1.md", "", {
        journal: "custom",
        "journal-date": "2026-08-03",
        "journal-end-date": "2026-08-16",
      });
      await harness.resolve(VaultSubscriptionService).initialize();

      harness.host.putFile("C/1.md", "", {
        journal: "custom",
        "journal-date": "2026-08-03",
        "journal-end-date": "2026-08-23",
      });
      harness.host.emitMetadata("C/1.md");

      expect(unwrap(harness.resolve(JournalsIndex).entryByPath("C/1.md" as VaultPath)).endDate).toBe("2026-08-23");
    });

    it("updates the indexed numbering when a note's number is edited", async () => {
      harness.host.putFile("C/1.md", "", { journal: "custom", "journal-date": "2026-08-03", "journal-index": 1 });
      await harness.resolve(VaultSubscriptionService).initialize();

      harness.host.putFile("C/1.md", "", { journal: "custom", "journal-date": "2026-08-03", "journal-index": 7 });
      harness.host.emitMetadata("C/1.md");

      expect(unwrap(harness.resolve(JournalsIndex).entryByPath("C/1.md" as VaultPath)).numbers).toEqual({ index: 7 });
    });

    it("moves the next interval's anchor when an interval's end date is edited", async () => {
      harness.host.putFile("C/1.md", "", {
        journal: "custom",
        "journal-date": "2026-08-03",
        "journal-end-date": "2026-08-16",
      });
      await harness.resolve(VaultSubscriptionService).initialize();
      const cycle = harness.resolve(CycleService);
      expect(unwrap(cycle.nextAnchor("custom", "2026-08-03" as AnchorString))).toBe("2026-08-17");

      harness.host.putFile("C/1.md", "", {
        journal: "custom",
        "journal-date": "2026-08-03",
        "journal-end-date": "2026-08-23",
      });
      harness.host.emitMetadata("C/1.md");

      expect(unwrap(cycle.nextAnchor("custom", "2026-08-03" as AnchorString))).toBe("2026-08-24");
    });
  });

  describe("custom weekly journal anchored 2024-01-01", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { s: customJournal("s", "week", 1, "2024-01-01") } },
      });
    });

    it("drops an off-sequence custom note during the boot rebuild", async () => {
      harness.host.putFile("S/on.md", "", { journal: "s", "journal-date": "2024-01-01" });
      harness.host.putFile("S/off.md", "", { journal: "s", "journal-date": "2024-01-03" });
      await harness.resolve(VaultSubscriptionService).initialize();

      expect(
        harness
          .resolve(JournalsIndex)
          .entryByPath("S/off.md" as VaultPath)
          .isNone(),
      ).toBe(true);
    });

    it("keeps an on-grid custom note during the boot rebuild", async () => {
      harness.host.putFile("S/on.md", "", { journal: "s", "journal-date": "2024-01-01" });
      harness.host.putFile("S/off.md", "", { journal: "s", "journal-date": "2024-01-03" });
      await harness.resolve(VaultSubscriptionService).initialize();

      expect(
        harness
          .resolve(JournalsIndex)
          .entryByPath("S/on.md" as VaultPath)
          .isSome(),
      ).toBe(true);
    });

    it("keeps a manually extended custom interval whose start is off the regular grid", async () => {
      // first interval extended from 1 week to 18 days (ends 2024-01-18), so the next interval starts
      // 2024-01-19 — 18 days after the anchor, NOT a multiple of 7, so off the regular 1-week grid
      // but on the reconstructed sequence. Without the extension chain, the valid grid would be
      // 01-01, 01-08, 01-15, 01-22, ... and 2024-01-19 would be dropped.
      harness.host.putFile("S/first.md", "", {
        journal: "s",
        "journal-date": "2024-01-01",
        "journal-end-date": "2024-01-18",
      });
      harness.host.putFile("S/second.md", "", { journal: "s", "journal-date": "2024-01-19" });
      await harness.resolve(VaultSubscriptionService).initialize();

      expect(
        harness
          .resolve(JournalsIndex)
          .entryByPath("S/second.md" as VaultPath)
          .isSome(),
      ).toBe(true);
    });

    it("drops an off-sequence custom note on metadata-changed", async () => {
      await harness.resolve(VaultSubscriptionService).initialize();

      harness.host.putFile("S/off.md", "", { journal: "s", "journal-date": "2024-01-03" });
      harness.host.emitMetadata("S/off.md");

      expect(
        harness
          .resolve(JournalsIndex)
          .entryByPath("S/off.md" as VaultPath)
          .isNone(),
      ).toBe(true);
    });

    it("registers an on-grid custom note on metadata-changed", async () => {
      await harness.resolve(VaultSubscriptionService).initialize();

      harness.host.putFile("S/on.md", "", { journal: "s", "journal-date": "2024-01-08" });
      harness.host.emitMetadata("S/on.md");

      expect(
        harness
          .resolve(JournalsIndex)
          .entryByPath("S/on.md" as VaultPath)
          .isSome(),
      ).toBe(true);
    });
  });

  describe("journal creation", () => {
    it("reindexes notes kept by a same-named journal deleted in keep mode", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      harness.host.putFile("D/A.md", "", { journal: "daily", "journal-date": "2024-01-01" });
      await harness.resolve(VaultSubscriptionService).initialize();
      const index = harness.resolve(JournalsIndex);
      const repo = harness.resolve(JournalsRepository);

      // keep mode leaves the note and its frontmatter untouched, so only the journal events move.
      repo.delete("daily");
      repo.create("daily", { type: "day" });

      expect(index.entryByPath("D/A.md" as VaultPath).isSome()).toBe(true);
    });

    describe("no configured journals", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({ modules: [journalsCoreModule], data: { journals: {} } });
      });

      it("indexes an orphan note whose journal is created after the boot walk", async () => {
        harness.host.putFile("D/A.md", "", { journal: "daily", "journal-date": "2024-01-01" });
        await harness.resolve(VaultSubscriptionService).initialize();
        const index = harness.resolve(JournalsIndex);

        harness.resolve(JournalsRepository).create("daily", { type: "day" });

        expect(index.entryByPath("D/A.md" as VaultPath).isSome()).toBe(true);
      });

      it("indexes an on-grid orphan when the created journal writes a custom cycle", async () => {
        harness.host.putFile("S/on.md", "", { journal: "s", "journal-date": "2024-01-01" });
        await harness.resolve(VaultSubscriptionService).initialize();
        const index = harness.resolve(JournalsIndex);

        harness
          .resolve(JournalsRepository)
          .create("s", { type: "custom", every: "week", duration: 1, anchorDate: "2024-01-01" as AnchorString });

        expect(index.entryByPath("S/on.md" as VaultPath).isSome()).toBe(true);
      });

      // Pairs with the on-grid case above: a bare per-note walk would adopt this one too, because
      // parseEntry defers custom-cycle validation. Only the reconciliation pass drops it.
      it("drops an off-sequence orphan when the created journal writes a custom cycle", async () => {
        harness.host.putFile("S/on.md", "", { journal: "s", "journal-date": "2024-01-01" });
        harness.host.putFile("S/off.md", "", { journal: "s", "journal-date": "2024-01-03" });
        await harness.resolve(VaultSubscriptionService).initialize();
        const index = harness.resolve(JournalsIndex);

        harness
          .resolve(JournalsRepository)
          .create("s", { type: "custom", every: "week", duration: 1, anchorDate: "2024-01-01" as AnchorString });

        expect(index.entryByPath("S/off.md" as VaultPath).isNone()).toBe(true);
      });
    });
  });
});
