import { beforeEach, describe, expect, it, vi } from "vitest";

import { calendarSlice } from "@/calendar";
import { calendarSettingsCoreModule } from "@/calendar/settings/module";
import { anchor } from "@/calendar/testing";
import { NoteMetadataService, NotesService, type VaultPath } from "@/infrastructure/host";
import { SettingsEventsToken } from "@/settings";
import { testContainer, type TestHarness } from "@/testing";

import { journalConfigCollection, type JournalConfig } from "../config";
import { JournalsIndex } from "../journals-index";
import { journalsCoreModule } from "../module";
import { JournalsRepository } from "../repository";
import { customJournal, fixedJournal } from "../testing";

import { LinkReferenceIndex, NAMING_REBUILD_DEBOUNCE_MS } from "./link-reference-index";
import { UnresolvedLinkMatcher } from "./unresolved-link-matcher";

const DAY_NOTE = "Journal/Daily/2026-10-05.md";

const settle = (): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, 0));

const afterDebounce = (): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, NAMING_REBUILD_DEBOUNCE_MS + 50));

const daily = fixedJournal("Daily", { type: "day" }, { folder: "Journal/Daily", nameTemplate: "{{date:YYYY-MM-DD}}" });

// What the journal edit form's v-model writes to: the stored record, not the repository.
const storedDaily = (harness: TestHarness): JournalConfig => harness.settings.recordOf(journalConfigCollection).Daily;

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

  async function startWithLinkToOctober5(
    journals: Record<string, JournalConfig>,
    before: () => void = () => undefined,
  ): Promise<void> {
    harness = await testContainer({ modules: [journalsCoreModule], data: { journals } });
    links = harness.resolve(LinkReferenceIndex);
    before();
    harness.resolve(JournalsIndex).markReady();
    await links.initialize();
    harness.host.putFile("a.md");
    harness.host.setLinks("a.md", { unresolved: { "2026-10-05": 1 } });
    await settle();
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

    it("a resolved link to a notelet does not count toward its period", async () => {
      const notelet = "Journal/Daily/2026-10-05 Meeting.md";
      harness.host.putFile(notelet);
      harness.resolve(JournalsIndex).register({
        kind: "notelet",
        journalName: "Daily",
        anchor: anchor("2026-10-05"),
        path: notelet as VaultPath,
        typeName: "Meeting",
        typeId: null,
      });
      harness.host.putFile("a.md");
      harness.host.putFile("b.md");
      harness.host.setLinks("a.md", { resolved: { [notelet]: 1 } });
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

    it("creating the note keeps the count while the link is still unresolved", async () => {
      harness.host.putFile("a.md");
      harness.host.setLinks("a.md", { unresolved: { "2026-10-05": 1 } });
      await settle();

      registerDayNote();
      await settle();
      expect(links.count("Daily", anchor("2026-10-05"))).toBe(1);

      harness.host.setLinks("a.md", { resolved: { [DAY_NOTE]: 1 } });
      await settle();
      expect(links.count("Daily", anchor("2026-10-05"))).toBe(1);
    });

    describe("when the period's note goes by another name", () => {
      const TRIP = "Trips/Trip.md" as VaultPath;

      function connectTrip(): void {
        harness.host.putFile(TRIP);
        harness.resolve(JournalsIndex).register({ journalName: "Daily", anchor: anchor("2026-10-05"), path: TRIP });
      }

      it("a link naming the date counts for no period", async () => {
        connectTrip();
        harness.host.putFile("a.md");
        harness.host.setLinks("a.md", { unresolved: { "2026-10-05": 1 } });
        await settle();

        expect(links.count("Daily", anchor("2026-10-05"))).toBe(0);
      });

      it("follows the note being connected, disconnected and connected again, without a rebuild", async () => {
        harness.host.putFile("a.md");
        harness.host.setLinks("a.md", { unresolved: { "2026-10-05": 1 } });
        await settle();
        const linkSources = vi.spyOn(harness.resolve(NoteMetadataService), "linkSources");

        connectTrip();
        await settle();
        expect(links.count("Daily", anchor("2026-10-05"))).toBe(0);

        harness.resolve(JournalsIndex).unregister(TRIP);
        await settle();
        expect(links.count("Daily", anchor("2026-10-05"))).toBe(1);

        connectTrip();
        await settle();
        expect(links.count("Daily", anchor("2026-10-05"))).toBe(0);
        expect(linkSources).not.toHaveBeenCalled();
      });

      it("a resolved link to that note still counts", async () => {
        connectTrip();
        harness.host.putFile("a.md");
        harness.host.setLinks("a.md", { resolved: { [TRIP]: 1 } });
        await settle();

        expect(links.count("Daily", anchor("2026-10-05"))).toBe(1);
      });
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

    it("a resolved link to an attachment never counts, even once a period claims its path", async () => {
      const attachment = "Journal/Daily/2026-10-06.png";
      registerDayNote();
      harness.host.putFile(attachment);
      harness.host.putFile("a.md");
      harness.host.setLinks("a.md", { resolved: { [attachment]: 1, [DAY_NOTE]: 1 } });
      await settle();

      harness.resolve(JournalsIndex).register({
        journalName: "Daily",
        anchor: anchor("2026-10-06"),
        path: attachment as VaultPath,
      });
      await settle();

      expect(links.count("Daily", anchor("2026-10-06"))).toBe(0);
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

  describe("when the journal naming changes", () => {
    beforeEach(async () => {
      harness.resolve(JournalsIndex).markReady();
      await links.initialize();
      harness.host.putFile("a.md");
      harness.host.putFile("b.md");
      harness.host.putFile("c.md");
      harness.host.setLinks("a.md", { unresolved: { "2026-10-05": 1 } });
      harness.host.setLinks("b.md", { unresolved: { "2026-10-05 Monday": 1 } });
      harness.host.setLinks("c.md", { unresolved: { "2026-10-05 Monday": 1 } });
      await settle();
    });

    it("an edit written straight into the stored config re-evaluates unresolved links", async () => {
      expect(links.count("Daily", anchor("2026-10-05"))).toBe(1);

      storedDaily(harness).nameTemplate = "{{date:YYYY-MM-DD}} {{date:dddd}}";
      await afterDebounce();

      expect(links.count("Daily", anchor("2026-10-05"))).toBe(2);
    });

    it("a keystroke burst rebuilds once, after the typing pauses", async () => {
      const linkSources = vi.spyOn(harness.resolve(NoteMetadataService), "linkSources");
      const stored = storedDaily(harness);

      for (const template of ["{{date:YYYY-MM-DD}} ", "{{date:YYYY-MM-DD}} {{", "{{date:YYYY-MM-DD}} {{date:dddd}}"]) {
        stored.nameTemplate = template;
        await settle();
      }
      expect(linkSources).not.toHaveBeenCalled();
      await afterDebounce();

      expect(linkSources).toHaveBeenCalledTimes(1);
    });

    it("renaming a journal moves its links to the new name", async () => {
      harness.resolve(JournalsRepository).rename("Daily", "Days");
      await afterDebounce();

      expect(links.count("Days", anchor("2026-10-05"))).toBe(1);
      expect(links.count("Daily", anchor("2026-10-05"))).toBe(0);
    });

    it("a settings reload rebuilds", async () => {
      const linkSources = vi.spyOn(harness.resolve(NoteMetadataService), "linkSources");

      harness.resolve(SettingsEventsToken).emit("reloaded");
      await afterDebounce();

      expect(linkSources).toHaveBeenCalledTimes(1);
    });
  });

  describe("when the week grid changes", () => {
    const ISO = { mode: "custom", dow: 1, doy: 4, global: false } as const;
    const WESTERN = { mode: "custom", dow: 0, doy: 6, global: false } as const;

    it("an unresolved link to a locale week re-anchors under the new grid", async () => {
      harness = await testContainer({
        modules: [journalsCoreModule, calendarSettingsCoreModule],
        data: {
          journals: {
            Weekly: fixedJournal("Weekly", { type: "week" }, { folder: "Weekly", nameTemplate: "{{date:gggg-[W]ww}}" }),
          },
          calendar: ISO,
          calendarDisplay: {},
        },
      });
      links = harness.resolve(LinkReferenceIndex);
      harness.resolve(JournalsIndex).markReady();
      await links.initialize();
      harness.host.putFile("a.md");
      harness.host.setLinks("a.md", { unresolved: { "2026-W41": 1 } });
      await settle();
      expect(links.count("Weekly", anchor("2026-10-05"))).toBe(1);

      harness.settings.getSlice(calendarSlice).state = WESTERN;
      await afterDebounce();

      expect(links.count("Weekly", anchor("2026-10-04"))).toBe(1);
      expect(links.count("Weekly", anchor("2026-10-05"))).toBe(0);
    });
  });

  describe("when a custom interval's stored end moves", () => {
    const FIRST = "Sprints/2026-10-01.md" as VaultPath;
    const sprint = customJournal("Sprint", "day", 3, "2026-10-01", {
      folder: "Sprints",
      nameTemplate: "{{date:YYYY-MM-DD}}",
    });

    function registerFirst(endDate?: string): void {
      harness.host.putFile(FIRST);
      harness.resolve(JournalsIndex).register({
        journalName: "Sprint",
        anchor: anchor("2026-10-01"),
        path: FIRST,
        ...(endDate !== undefined && { endDate: anchor(endDate) }),
      });
    }

    // Three-day intervals from 1 October start on the 1st, 4th and 7th: the 5th starts none until
    // the first interval runs through the 4th.
    it("a date that becomes an interval's start counts at once, without a rebuild", async () => {
      await startWithLinkToOctober5({ Sprint: sprint });
      expect(links.count("Sprint", anchor("2026-10-05"))).toBe(0);
      const linkSources = vi.spyOn(harness.resolve(NoteMetadataService), "linkSources");

      registerFirst("2026-10-04");
      await settle();
      expect(links.count("Sprint", anchor("2026-10-05"))).toBe(1);

      harness.resolve(JournalsIndex).unregister(FIRST);
      await settle();
      expect(links.count("Sprint", anchor("2026-10-05"))).toBe(0);
      expect(linkSources).not.toHaveBeenCalled();
    });

    it("a note under another name connected to the newly started interval stops the link counting", async () => {
      await startWithLinkToOctober5({ Sprint: sprint });
      registerFirst("2026-10-04");
      await settle();

      harness.host.putFile("Sprints/Kickoff.md");
      harness.resolve(JournalsIndex).register({
        journalName: "Sprint",
        anchor: anchor("2026-10-05"),
        path: "Sprints/Kickoff.md" as VaultPath,
      });
      await settle();

      expect(links.count("Sprint", anchor("2026-10-05"))).toBe(0);
    });

    it("an interval note with the default end date re-matches nothing", async () => {
      await startWithLinkToOctober5({ Sprint: sprint });
      const match = vi.spyOn(UnresolvedLinkMatcher.prototype, "match");
      const rematch = vi.spyOn(UnresolvedLinkMatcher.prototype, "rematch");

      registerFirst("2026-10-03");
      await settle();
      harness.resolve(JournalsIndex).unregister(FIRST);
      registerFirst();
      await settle();

      expect(match).not.toHaveBeenCalled();
      expect(rematch).not.toHaveBeenCalled();
      expect(links.count("Sprint", anchor("2026-10-05"))).toBe(0);
    });

    it("an end moved back to the default before the index built is noticed", async () => {
      await startWithLinkToOctober5({ Sprint: sprint }, () => {
        registerFirst("2026-10-04");
      });
      expect(links.count("Sprint", anchor("2026-10-05"))).toBe(1);

      registerFirst("2026-10-03");
      await settle();

      expect(links.count("Sprint", anchor("2026-10-05"))).toBe(0);
    });

    it("a name the interval comes to share with another journal counts for neither", async () => {
      await startWithLinkToOctober5({ Daily: daily, Sprint: sprint });
      expect(links.count("Daily", anchor("2026-10-05"))).toBe(1);

      registerFirst("2026-10-04");
      await settle();
      expect(links.count("Daily", anchor("2026-10-05"))).toBe(0);
      expect(links.count("Sprint", anchor("2026-10-05"))).toBe(0);

      harness.resolve(JournalsIndex).unregister(FIRST);
      await settle();
      expect(links.count("Daily", anchor("2026-10-05"))).toBe(1);
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
