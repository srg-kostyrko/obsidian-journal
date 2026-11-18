import { beforeEach, describe, expect, it, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { NotesService, type VaultPath } from "@/infrastructure/host";
import { testContainer, type TestHarness } from "@/testing";

import { JournalsIndex } from "../journals-index";
import { journalsCoreModule } from "../module";
import { JournalsRepository } from "../repository";
import { fixedJournal } from "../testing";

import { LinkReferenceIndex } from "./link-reference-index";

const DAY_NOTE = "Journal/Daily/2026-10-05.md";

const settle = (): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, 0));

const daily = fixedJournal("Daily", { type: "day" }, { folder: "Journal/Daily", nameTemplate: "{{date:YYYY-MM-DD}}" });

describe("LinkReferenceIndex", () => {
  let harness: TestHarness;
  let links: LinkReferenceIndex;

  function registerDayNote(): void {
    harness.host.putFile(DAY_NOTE);
    harness.resolve(JournalsIndex).register({
      journalName: "Daily",
      anchor: anchor("2026-10-05"),
      path: DAY_NOTE as VaultPath,
    });
  }

  beforeEach(async () => {
    harness = await testContainer({ modules: [journalsCoreModule], data: { journals: { Daily: daily } } });
    links = harness.resolve(LinkReferenceIndex);
  });

  describe("once the journals index is ready", () => {
    beforeEach(async () => {
      harness.resolve(JournalsIndex).markReady();
      await links.initialize();
    });

    it("counts an unresolved link to a date with no note", async () => {
      harness.host.putFile("a.md");
      harness.host.setLinks("a.md", { unresolved: { "2026-10-05": 1 } });
      await settle();

      expect(links.count("Daily", anchor("2026-10-05"))).toBe(1);
    });

    it("counts an unresolved link written with the extension", async () => {
      harness.host.putFile("a.md");
      harness.host.setLinks("a.md", { unresolved: { "2026-10-05.md": 1 } });
      await settle();

      expect(links.count("Daily", anchor("2026-10-05"))).toBe(1);
    });

    it("counts distinct notes, not occurrences", async () => {
      harness.host.putFile("a.md");
      harness.host.putFile("b.md");
      harness.host.setLinks("a.md", { unresolved: { "2026-10-05": 3 } });
      harness.host.setLinks("b.md", { unresolved: { "2026-10-05": 1 } });
      await settle();

      expect(links.count("Daily", anchor("2026-10-05"))).toBe(2);
    });

    it("counts a resolved link to the journal note", async () => {
      registerDayNote();
      harness.host.putFile("a.md");
      harness.host.setLinks("a.md", { resolved: { [DAY_NOTE]: 1 } });
      await settle();

      expect(links.count("Daily", anchor("2026-10-05"))).toBe(1);
    });

    it("a note's link to itself does not count", async () => {
      registerDayNote();
      harness.host.setLinks(DAY_NOTE, { resolved: { [DAY_NOTE]: 1 } });
      await settle();

      expect(links.count("Daily", anchor("2026-10-05"))).toBe(0);
    });

    it("a resolved link to a date-named non-journal note does not count", async () => {
      harness.host.putFile("Meeting 2026-10-05.md");
      harness.host.putFile("a.md");
      harness.host.putFile("b.md");
      harness.host.setLinks("a.md", { resolved: { "Meeting 2026-10-05.md": 1 } });
      harness.host.setLinks("b.md", { unresolved: { "2026-10-06": 1 } });
      await settle();

      expect(links.count("Daily", anchor("2026-10-05"))).toBe(0);
      expect(links.count("Daily", anchor("2026-10-06"))).toBe(1);
    });

    it("creating the note keeps the count", async () => {
      harness.host.putFile("a.md");
      harness.host.setLinks("a.md", { unresolved: { "2026-10-05": 1 } });
      await settle();
      expect(links.count("Daily", anchor("2026-10-05"))).toBe(1);

      registerDayNote();
      harness.host.setLinks("a.md", { resolved: { [DAY_NOTE]: 1 } });
      await settle();

      expect(links.count("Daily", anchor("2026-10-05"))).toBe(1);
    });

    it("a resolved link follows the target note leaving the journal", async () => {
      registerDayNote();
      harness.host.putFile("a.md");
      harness.host.setLinks("a.md", { resolved: { [DAY_NOTE]: 1 } });
      await settle();

      harness.resolve(JournalsIndex).unregister(DAY_NOTE as VaultPath);
      await settle();

      expect(links.count("Daily", anchor("2026-10-05"))).toBe(0);
    });

    it("deleting the linking note drops it", async () => {
      harness.host.putFile("a.md");
      harness.host.setLinks("a.md", { unresolved: { "2026-10-05": 1 } });
      await settle();

      await harness.resolve(NotesService).delete("a.md" as VaultPath);
      await settle();

      expect(links.count("Daily", anchor("2026-10-05"))).toBe(0);
    });

    it("renaming the linking note keeps it under the new path", async () => {
      harness.host.putFile("a.md");
      harness.host.setLinks("a.md", { unresolved: { "2026-10-05": 1 } });
      await settle();

      await harness.resolve(NotesService).rename("a.md" as VaultPath, "b.md" as VaultPath);
      await settle();
      expect(links.count("Daily", anchor("2026-10-05"))).toBe(1);

      await harness.resolve(NotesService).delete("b.md" as VaultPath);
      await settle();
      expect(links.count("Daily", anchor("2026-10-05"))).toBe(0);
    });

    it("a naming change re-evaluates unresolved links", async () => {
      harness.host.putFile("a.md");
      harness.host.setLinks("a.md", { unresolved: { "2026-10-05": 1 } });
      await settle();

      harness.resolve(JournalsRepository).update("Daily", { nameTemplate: "{{date:YYYY-MM-DD}} {{date:dddd}}" });
      await settle();
      expect(links.count("Daily", anchor("2026-10-05"))).toBe(0);

      harness.host.putFile("b.md");
      harness.host.setLinks("b.md", { unresolved: { "2026-10-05 Monday": 1 } });
      await settle();
      expect(links.count("Daily", anchor("2026-10-05"))).toBe(1);
    });

    it("emits changed once per batch", async () => {
      const changed = vi.fn();
      links.events.on("changed", changed);
      harness.host.putFile("a.md");
      harness.host.putFile("b.md");

      harness.host.setLinks("a.md", { unresolved: { "2026-10-05": 1 } });
      harness.host.setLinks("b.md", { unresolved: { "2026-10-06": 1 } });
      await settle();

      expect(changed).toHaveBeenCalledTimes(1);
    });

    it("emits nothing when no period's set changed", async () => {
      harness.host.putFile("a.md");
      harness.host.setLinks("a.md", { unresolved: { "2026-10-05": 1 } });
      await settle();
      const changed = vi.fn();
      links.events.on("changed", changed);

      harness.host.setLinks("a.md", { unresolved: { "2026-10-05": 2, "not a date": 1 } });
      await settle();

      expect(changed).not.toHaveBeenCalled();
    });
  });

  it("builds nothing before the journals index is ready", async () => {
    harness.host.putFile("a.md");
    harness.host.setLinks("a.md", { unresolved: { "2026-10-05": 1 } });
    const changed = vi.fn();
    links.events.on("changed", changed);

    const initialized = links.initialize();
    await settle();
    expect(links.count("Daily", anchor("2026-10-05"))).toBe(0);
    expect(changed).not.toHaveBeenCalled();

    harness.resolve(JournalsIndex).markReady();
    await initialized;
    await settle();
    expect(links.count("Daily", anchor("2026-10-05"))).toBe(1);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("stops following links once disposed", async () => {
    harness.resolve(JournalsIndex).markReady();
    await links.initialize();
    links[Symbol.dispose]();

    harness.host.putFile("a.md");
    harness.host.setLinks("a.md", { unresolved: { "2026-10-05": 1 } });
    await settle();

    expect(links.count("Daily", anchor("2026-10-05"))).toBe(0);
  });
});
