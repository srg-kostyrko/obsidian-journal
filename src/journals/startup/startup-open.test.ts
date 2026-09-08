import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { PlatformService, type DeviceKind, type VaultPath } from "@/infrastructure/host";
import { overrideWith, testContainer, type TestHarness } from "@/testing";

import { JournalsIndex } from "../journals-index";
import { journalsCoreModule } from "../module";
import { JournalsRepository } from "../repository";
import { fixedJournal } from "../testing";

import { journalStartupCoreModule } from "./module";
import { startupSlice } from "./slice";
import { StartupOpenService } from "./startup-open";

const MODULES = [journalsCoreModule, journalStartupCoreModule];
const TODAY_PATH = "2026-05-19.md" as VaultPath;
const OVERRIDE_TODAY_PATH = "private/2026-05-19.md" as VaultPath;
// The frozen clock below is a Tuesday, so this is the weekday index an override must claim to win.
const TUESDAY = 2;
const SATURDAY = 6;
const CONNECTED_PATH = "Daily/Tuesday standup.md" as VaultPath;

const onDevice = (device: DeviceKind): ReturnType<typeof overrideWith> =>
  overrideWith(PlatformService, { current: () => device });

async function excludedDevice(): Promise<TestHarness> {
  const harness = await testContainer({
    modules: MODULES,
    data: {
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      startup: { journalName: "daily" },
      noteCreation: { devices: "desktop" },
    },
    overrides: [onDevice("mobile")],
  });
  harness.host.workspace.layoutReady = false;
  return harness;
}

describe("StartupOpenService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 19, 9, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("a daily journal chosen to open at startup", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: MODULES,
        data: {
          journals: { daily: fixedJournal("daily", { type: "day" }) },
          startup: { journalName: "daily" },
        },
      });
    });

    it("opens the configured journal's today note on a genuine launch", async () => {
      harness.host.workspace.layoutReady = false;

      await harness.resolve(StartupOpenService).initialize();
      harness.host.setLayoutReady();
      await vi.advanceTimersByTimeAsync(0);

      expect(harness.host.workspace.openPaths.has(TODAY_PATH)).toBe(true);
    });

    it("does not open when the layout was already ready at initialize", async () => {
      await harness.resolve(StartupOpenService).initialize();
      await vi.advanceTimersByTimeAsync(0);

      expect(harness.host.workspace.openPaths.has(TODAY_PATH)).toBe(false);
    });

    it("updates the stored journal name when that journal is renamed", () => {
      harness.resolve(StartupOpenService);

      harness.resolve(JournalsRepository).rename("daily", "work");

      expect(harness.settings.getSlice(startupSlice).state.journalName).toBe("work");
    });

    it("clears the stored journal name when that journal is deleted", () => {
      harness.resolve(StartupOpenService);

      harness.resolve(JournalsRepository).delete("daily");

      expect(harness.settings.getSlice(startupSlice).state.journalName).toBe("");
    });
  });

  describe("a journal named by a weekday override", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: MODULES,
        data: {
          journals: {
            daily: fixedJournal("daily", { type: "day" }),
            private: fixedJournal("private", { type: "day" }, { folder: "private" }),
          },
          startup: { journalName: "daily", overrides: [{ weekdays: [SATURDAY], journalName: "private" }] },
        },
      });
    });

    it("follows that journal's rename", () => {
      harness.resolve(StartupOpenService);

      harness.resolve(JournalsRepository).rename("private", "personal");

      expect(harness.settings.getSlice(startupSlice).state.overrides).toEqual([
        { weekdays: [SATURDAY], journalName: "personal" },
      ]);
    });

    it("drops the override when that journal is deleted", () => {
      harness.resolve(StartupOpenService);

      harness.resolve(JournalsRepository).delete("private");

      expect(harness.settings.getSlice(startupSlice).state.overrides).toEqual([]);
    });

    it("keeps the overrides when the default journal is renamed", () => {
      harness.resolve(StartupOpenService);

      harness.resolve(JournalsRepository).rename("daily", "work");

      expect(harness.settings.getSlice(startupSlice).state.overrides).toEqual([
        { weekdays: [SATURDAY], journalName: "private" },
      ]);
    });
  });

  it("opens the journal an override claims for today's weekday", async () => {
    const harness = await testContainer({
      modules: MODULES,
      data: {
        journals: {
          daily: fixedJournal("daily", { type: "day" }),
          private: fixedJournal("private", { type: "day" }, { folder: "private" }),
        },
        startup: { journalName: "daily", overrides: [{ weekdays: [TUESDAY], journalName: "private" }] },
      },
    });
    harness.host.workspace.layoutReady = false;

    await harness.resolve(StartupOpenService).initialize();
    harness.host.setLayoutReady();
    await vi.advanceTimersByTimeAsync(0);

    expect(harness.host.workspace.openPaths.has(OVERRIDE_TODAY_PATH)).toBe(true);
    expect(harness.host.workspace.openPaths.has(TODAY_PATH)).toBe(false);
  });

  it("falls back to the default journal on a weekday no override claims", async () => {
    const harness = await testContainer({
      modules: MODULES,
      data: {
        journals: {
          daily: fixedJournal("daily", { type: "day" }),
          private: fixedJournal("private", { type: "day" }, { folder: "private" }),
        },
        startup: { journalName: "daily", overrides: [{ weekdays: [SATURDAY], journalName: "private" }] },
      },
    });
    harness.host.workspace.layoutReady = false;

    await harness.resolve(StartupOpenService).initialize();
    harness.host.setLayoutReady();
    await vi.advanceTimersByTimeAsync(0);

    expect(harness.host.workspace.openPaths.has(TODAY_PATH)).toBe(true);
    expect(harness.host.workspace.openPaths.has(OVERRIDE_TODAY_PATH)).toBe(false);
  });

  it("opens nothing when the override claiming today asks for no note", async () => {
    const harness = await testContainer({
      modules: MODULES,
      data: {
        journals: { daily: fixedJournal("daily", { type: "day" }) },
        startup: { journalName: "daily", overrides: [{ weekdays: [TUESDAY], journalName: "" }] },
      },
    });
    harness.host.workspace.layoutReady = false;

    await harness.resolve(StartupOpenService).initialize();
    harness.host.setLayoutReady();
    await vi.advanceTimersByTimeAsync(0);

    expect(harness.host.workspace.openPaths.size).toBe(0);
  });

  it("lets the first override win when two claim today", async () => {
    const harness = await testContainer({
      modules: MODULES,
      data: {
        journals: {
          daily: fixedJournal("daily", { type: "day" }),
          private: fixedJournal("private", { type: "day" }, { folder: "private" }),
        },
        startup: {
          journalName: "",
          overrides: [
            { weekdays: [TUESDAY], journalName: "private" },
            { weekdays: [TUESDAY], journalName: "daily" },
          ],
        },
      },
    });
    harness.host.workspace.layoutReady = false;

    await harness.resolve(StartupOpenService).initialize();
    harness.host.setLayoutReady();
    await vi.advanceTimersByTimeAsync(0);

    expect(harness.host.workspace.openPaths.has(OVERRIDE_TODAY_PATH)).toBe(true);
    expect(harness.host.workspace.openPaths.has(TODAY_PATH)).toBe(false);
  });

  it("writes the canonical period anchor as journal-date for a non-daily journal", async () => {
    const harness = await testContainer({
      modules: MODULES,
      data: {
        journals: { monthly: fixedJournal("monthly", { type: "month" }) },
        startup: { journalName: "monthly" },
      },
    });
    harness.host.workspace.layoutReady = false;

    await harness.resolve(StartupOpenService).initialize();
    harness.host.setLayoutReady();
    await vi.advanceTimersByTimeAsync(0);

    expect(harness.host.files.get("2026-05.md")?.frontmatter["journal-date"]).toBe("2026-05-01");
  });

  it("does nothing when no journal is configured", async () => {
    const harness = await testContainer({
      modules: MODULES,
      data: {
        journals: { daily: fixedJournal("daily", { type: "day" }) },
        startup: { journalName: "" },
      },
    });
    harness.host.workspace.layoutReady = false;

    await harness.resolve(StartupOpenService).initialize();
    harness.host.setLayoutReady();
    await vi.advanceTimersByTimeAsync(0);

    expect(harness.host.workspace.openPaths.has(TODAY_PATH)).toBe(false);
  });

  it("does nothing when the configured journal no longer exists", async () => {
    const harness = await testContainer({
      modules: MODULES,
      data: {
        journals: { daily: fixedJournal("daily", { type: "day" }) },
        startup: { journalName: "ghost" },
      },
    });
    harness.host.workspace.layoutReady = false;

    await harness.resolve(StartupOpenService).initialize();
    harness.host.setLayoutReady();
    await vi.advanceTimersByTimeAsync(0);

    expect(harness.host.workspace.openPaths.has(TODAY_PATH)).toBe(false);
  });

  describe("a device the automatic note creation rule excludes", () => {
    it("opens today's note when it already exists", async () => {
      const harness = await excludedDevice();
      harness.host.putFile(CONNECTED_PATH, "");
      const index = harness.resolve(JournalsIndex);
      index.register({ journalName: "daily", anchor: anchor("2026-05-19"), path: CONNECTED_PATH });
      index.markReady();

      await harness.resolve(StartupOpenService).initialize();
      harness.host.setLayoutReady();
      await vi.advanceTimersByTimeAsync(0);

      expect(harness.host.workspace.openPaths.has(CONNECTED_PATH)).toBe(true);
    });

    it("leaves the note it opens untouched", async () => {
      // OpenJournalEntryFlow writes the frontmatter mutator over an existing note, so a launch
      // that creates nothing still writes — under sync that is a conflict source of its own.
      const harness = await excludedDevice();
      harness.host.putFile(CONNECTED_PATH, "");
      const index = harness.resolve(JournalsIndex);
      index.register({ journalName: "daily", anchor: anchor("2026-05-19"), path: CONNECTED_PATH });
      index.markReady();

      await harness.resolve(StartupOpenService).initialize();
      harness.host.setLayoutReady();
      await vi.advanceTimersByTimeAsync(0);

      expect(harness.host.files.get(CONNECTED_PATH)?.frontmatter).toEqual({});
    });

    it("creates no note when today has none", async () => {
      const harness = await excludedDevice();
      harness.resolve(JournalsIndex).markReady();

      await harness.resolve(StartupOpenService).initialize();
      harness.host.setLayoutReady();
      await vi.advanceTimersByTimeAsync(0);

      expect(harness.host.files.has(TODAY_PATH)).toBe(false);
      expect(harness.host.workspace.openPaths.size).toBe(0);
    });

    it("waits for the index rather than reading an empty one as no note", async () => {
      // At layout-ready the boot walk has not landed, so "no entry for this anchor" means "not
      // indexed yet" — acting on it would leave the note the user has closed on their phone.
      const harness = await excludedDevice();
      harness.host.putFile(CONNECTED_PATH, "");
      const index = harness.resolve(JournalsIndex);

      await harness.resolve(StartupOpenService).initialize();
      harness.host.setLayoutReady();
      await vi.advanceTimersByTimeAsync(0);
      expect(harness.host.workspace.openPaths.size).toBe(0);

      index.register({ journalName: "daily", anchor: anchor("2026-05-19"), path: CONNECTED_PATH });
      index.markReady();
      await vi.advanceTimersByTimeAsync(0);

      expect(harness.host.workspace.openPaths.has(CONNECTED_PATH)).toBe(true);
    });

    it("opens nothing when disposed before the index is ready", async () => {
      const harness = await excludedDevice();
      harness.host.putFile(CONNECTED_PATH, "");
      const index = harness.resolve(JournalsIndex);
      const service = harness.resolve(StartupOpenService);

      await service.initialize();
      harness.host.setLayoutReady();
      await vi.advanceTimersByTimeAsync(0);
      await service[Symbol.asyncDispose]();

      index.register({ journalName: "daily", anchor: anchor("2026-05-19"), path: CONNECTED_PATH });
      index.markReady();
      await vi.advanceTimersByTimeAsync(0);

      expect(harness.host.workspace.openPaths.size).toBe(0);
    });

    it("still creates on the device the rule names", async () => {
      const harness = await testContainer({
        modules: MODULES,
        data: {
          journals: { daily: fixedJournal("daily", { type: "day" }) },
          startup: { journalName: "daily" },
          noteCreation: { devices: "desktop" },
        },
        overrides: [onDevice("desktop")],
      });
      harness.host.workspace.layoutReady = false;

      await harness.resolve(StartupOpenService).initialize();
      harness.host.setLayoutReady();
      await vi.advanceTimersByTimeAsync(0);

      expect(harness.host.files.has(TODAY_PATH)).toBe(true);
    });
  });
});
