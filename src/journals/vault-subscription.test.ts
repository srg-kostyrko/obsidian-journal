import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installTestCalendar } from "@/calendar/testing";
import type { VaultPath } from "@/infrastructure/host";

import { JournalsIndex } from "./journals-index";
import { customJournal, fixedJournal } from "./testing";
import { VaultSubscriptionService } from "./vault-subscription";
import { buildRig } from "./vault-subscription.testing";

describe("VaultSubscriptionService", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  it("populates JournalsIndex with parseable notes during initialize", async () => {
    const rig = buildRig({ daily: fixedJournal("daily", { type: "day" }) }, ["D/2024-01-01.md" as VaultPath]);
    rig.setFrontmatter("D/2024-01-01.md", { journal: "daily", "journal-date": "2024-01-01" });
    const sub = rig.container.resolve(VaultSubscriptionService);
    await sub.initialize();
    const index = rig.container.resolve(JournalsIndex);
    expect(index.entryByPath("D/2024-01-01.md" as VaultPath).isSome()).toBe(true);
  });

  it("indexes an imported note whose metadata resolves only after the boot walk", async () => {
    const rig = buildRig({ daily: fixedJournal("daily", { type: "day" }) }, ["day/2024-01-01.md" as VaultPath]);
    rig.setFrontmatter("day/2024-01-01.md", { journal: "daily", "journal-date": "2024-01-01" });
    // Imported note: on disk at boot, but metadataCache has not parsed it yet.
    rig.setResolved("day/2024-01-01.md", false);
    const sub = rig.container.resolve(VaultSubscriptionService);
    await sub.initialize();
    const index = rig.container.resolve(JournalsIndex);

    rig.setResolved("day/2024-01-01.md", true);
    rig.emitResolved();

    expect(index.entryByPath("day/2024-01-01.md" as VaultPath).isSome()).toBe(true);
  });

  it("registers a newly-parseable note on metadata-changed", async () => {
    const rig = buildRig({ daily: fixedJournal("daily", { type: "day" }) });
    const sub = rig.container.resolve(VaultSubscriptionService);
    await sub.initialize();

    rig.setFrontmatter("D/X.md", { journal: "daily", "journal-date": "2024-01-02" });
    rig.emit("metadata-changed", "D/X.md" as VaultPath);

    const index = rig.container.resolve(JournalsIndex);
    expect(index.entryByPath("D/X.md" as VaultPath).isSome()).toBe(true);
  });

  it("unregisters a note when its frontmatter no longer parses", async () => {
    const rig = buildRig({ daily: fixedJournal("daily", { type: "day" }) }, ["D/X.md" as VaultPath]);
    rig.setFrontmatter("D/X.md", { journal: "daily", "journal-date": "2024-01-02" });
    const sub = rig.container.resolve(VaultSubscriptionService);
    await sub.initialize();
    const index = rig.container.resolve(JournalsIndex);
    expect(index.entryByPath("D/X.md" as VaultPath).isSome()).toBe(true);

    rig.setFrontmatter("D/X.md", {});
    rig.emit("metadata-changed", "D/X.md" as VaultPath);

    expect(index.entryByPath("D/X.md" as VaultPath).isNone()).toBe(true);
  });

  it("transfers the entry path on rename", async () => {
    const rig = buildRig({ daily: fixedJournal("daily", { type: "day" }) }, ["D/A.md" as VaultPath]);
    rig.setFrontmatter("D/A.md", { journal: "daily", "journal-date": "2024-01-01" });
    const sub = rig.container.resolve(VaultSubscriptionService);
    await sub.initialize();
    const index = rig.container.resolve(JournalsIndex);

    rig.emit("renamed", { from: "D/A.md" as VaultPath, to: "D/B.md" as VaultPath });

    expect(index.entryByPath("D/A.md" as VaultPath).isNone()).toBe(true);
    expect(index.entryByPath("D/B.md" as VaultPath).isSome()).toBe(true);
  });

  it("unregisters on delete", async () => {
    const rig = buildRig({ daily: fixedJournal("daily", { type: "day" }) }, ["D/A.md" as VaultPath]);
    rig.setFrontmatter("D/A.md", { journal: "daily", "journal-date": "2024-01-01" });
    const sub = rig.container.resolve(VaultSubscriptionService);
    await sub.initialize();
    const index = rig.container.resolve(JournalsIndex);

    rig.emit("deleted", "D/A.md" as VaultPath);

    expect(index.entryByPath("D/A.md" as VaultPath).isNone()).toBe(true);
  });

  it("clears the index for a deleted journal whose notes keep their frontmatter", async () => {
    const rig = buildRig({ daily: fixedJournal("daily", { type: "day" }) }, ["D/A.md" as VaultPath]);
    rig.setFrontmatter("D/A.md", { journal: "daily", "journal-date": "2024-01-01" });
    const sub = rig.container.resolve(VaultSubscriptionService);
    await sub.initialize();
    const index = rig.container.resolve(JournalsIndex);
    expect(index.entryByPath("D/A.md" as VaultPath).isSome()).toBe(true);

    // The "keep" delete mode leaves the note (and its frontmatter) in place, so no vault event
    // fires — only the journal's own "deleted" event can drop its stale index entry.
    rig.emitJournalDeleted("daily");

    expect(index.entryByPath("D/A.md" as VaultPath).isNone()).toBe(true);
  });

  it("reindexes notes when settings are reloaded from an external sync", async () => {
    const rig = buildRig({ daily: fixedJournal("daily", { type: "day" }) });
    const sub = rig.container.resolve(VaultSubscriptionService);
    await sub.initialize();

    rig.setFrontmatter("D/X.md", { journal: "daily", "journal-date": "2024-01-03" });
    rig.setMarkdownNotes(["D/X.md" as VaultPath]);
    rig.emitSettingsReloaded();

    const index = rig.container.resolve(JournalsIndex);
    expect(index.entryByPath("D/X.md" as VaultPath).isSome()).toBe(true);
  });

  it("does not register on created (waits for metadata-changed)", async () => {
    const rig = buildRig({ daily: fixedJournal("daily", { type: "day" }) });
    const sub = rig.container.resolve(VaultSubscriptionService);
    await sub.initialize();
    const index = rig.container.resolve(JournalsIndex);

    rig.emit("created", { path: "D/A.md" as VaultPath, basename: "A", folder: "D" as VaultPath });
    expect(index.entryByPath("D/A.md" as VaultPath).isNone()).toBe(true);
  });

  it("drops an off-sequence custom note during the boot rebuild", async () => {
    const rig = buildRig({ s: customJournal("s", "week", 1, "2024-01-01") }, [
      "S/on.md" as VaultPath,
      "S/off.md" as VaultPath,
    ]);
    rig.setFrontmatter("S/on.md", { journal: "s", "journal-date": "2024-01-01" });
    rig.setFrontmatter("S/off.md", { journal: "s", "journal-date": "2024-01-03" });
    const sub = rig.container.resolve(VaultSubscriptionService);
    await sub.initialize();
    const index = rig.container.resolve(JournalsIndex);

    expect(index.entryByPath("S/off.md" as VaultPath).isNone()).toBe(true);
  });

  it("keeps an on-grid custom note during the boot rebuild", async () => {
    const rig = buildRig({ s: customJournal("s", "week", 1, "2024-01-01") }, [
      "S/on.md" as VaultPath,
      "S/off.md" as VaultPath,
    ]);
    rig.setFrontmatter("S/on.md", { journal: "s", "journal-date": "2024-01-01" });
    rig.setFrontmatter("S/off.md", { journal: "s", "journal-date": "2024-01-03" });
    const sub = rig.container.resolve(VaultSubscriptionService);
    await sub.initialize();
    const index = rig.container.resolve(JournalsIndex);

    expect(index.entryByPath("S/on.md" as VaultPath).isSome()).toBe(true);
  });

  it("keeps a manually extended custom interval whose start is off the regular grid", async () => {
    const rig = buildRig({ s: customJournal("s", "week", 1, "2024-01-01") }, [
      "S/first.md" as VaultPath,
      "S/second.md" as VaultPath,
    ]);
    // first interval extended from 1 week to 18 days (ends 2024-01-18), so the next interval starts
    // 2024-01-19 — 18 days after the anchor, NOT a multiple of 7, so off the regular 1-week grid
    // but on the reconstructed sequence. Without the extension chain, the valid grid would be
    // 01-01, 01-08, 01-15, 01-22, ... and 2024-01-19 would be dropped.
    rig.setFrontmatter("S/first.md", { journal: "s", "journal-date": "2024-01-01", "journal-end-date": "2024-01-18" });
    rig.setFrontmatter("S/second.md", { journal: "s", "journal-date": "2024-01-19" });
    const sub = rig.container.resolve(VaultSubscriptionService);
    await sub.initialize();
    const index = rig.container.resolve(JournalsIndex);

    expect(index.entryByPath("S/second.md" as VaultPath).isSome()).toBe(true);
  });

  it("drops an off-sequence custom note on metadata-changed", async () => {
    const rig = buildRig({ s: customJournal("s", "week", 1, "2024-01-01") });
    const sub = rig.container.resolve(VaultSubscriptionService);
    await sub.initialize();

    rig.setFrontmatter("S/off.md", { journal: "s", "journal-date": "2024-01-03" });
    rig.emit("metadata-changed", "S/off.md" as VaultPath);

    const index = rig.container.resolve(JournalsIndex);
    expect(index.entryByPath("S/off.md" as VaultPath).isNone()).toBe(true);
  });

  it("registers an on-grid custom note on metadata-changed", async () => {
    const rig = buildRig({ s: customJournal("s", "week", 1, "2024-01-01") });
    const sub = rig.container.resolve(VaultSubscriptionService);
    await sub.initialize();

    rig.setFrontmatter("S/on.md", { journal: "s", "journal-date": "2024-01-08" });
    rig.emit("metadata-changed", "S/on.md" as VaultPath);

    const index = rig.container.resolve(JournalsIndex);
    expect(index.entryByPath("S/on.md" as VaultPath).isSome()).toBe(true);
  });
});
