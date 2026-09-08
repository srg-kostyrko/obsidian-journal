import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { VaultPath } from "@/infrastructure/host";
import { testContainer, type TestHarness } from "@/testing";

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
});
