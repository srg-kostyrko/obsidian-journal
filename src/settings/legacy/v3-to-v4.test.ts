import { describe, expect, it } from "vitest";

import type { View } from "@/views";
import { DEFAULT_CALENDAR_VIEW_ID } from "@/views/default-view";

import { v3ToV4Migration } from "./v3-to-v4";

interface ToolbarItem {
  config?: { action?: { type?: string; mode?: string } };
}

function monolithV3() {
  return {
    version: 3,
    journals: {
      "My Journal Day": {
        name: "My Journal Day",
        write: { type: "day" },
        confirmCreation: false,
        autoCreate: false,
        nameTemplate: "{{date}}",
        dateFormat: "YYYY-MM-DD",
        folder: "",
        templates: [],
        start: "",
        end: { type: "never" },
        index: { enabled: false, anchorDate: "", anchorIndex: 1, allowBefore: false, type: "increment", resetAfter: 0 },
        commands: [],
        decorations: [],
        navBlock: { type: "create", rows: [], decorateWholeBlock: false },
        calendarViewBlock: { rows: [], decorateWholeBlock: false },
        frontmatter: {
          dateField: "journal-date",
          addStartDate: false,
          startDateField: "journal-start-date",
          addEndDate: false,
          endDateField: "journal-end-date",
          indexField: "journal-index",
        },
      },
    },
    shelves: { "My Journal": { name: "My Journal", journals: ["My Journal Day"], commands: [] } },
    commands: [
      { name: "Open today's note", writeType: "day", type: "same", openMode: "tab", showInRibbon: false, icon: "" },
    ],
    calendar: { dow: 1, doy: 4, global: false },
    calendarView: {
      display: "month",
      leaf: "left",
      weeks: "left",
      todayMode: "create",
      pickMode: "navigate",
      todayStyle: { color: { type: "theme", name: "a" }, background: { type: "transparent" } },
      activeStyle: { color: { type: "theme", name: "b" }, background: { type: "transparent" } },
    },
    openOnStartup: "My Journal Day",
    pendingNoteMigration: [{ oldJournalId: "cal", kind: "calendar", sectionToName: { day: "My Journal Day" } }],
  };
}

describe("v3ToV4Migration", () => {
  it("targets version 3 -> 4", () => {
    expect(v3ToV4Migration.fromVersion).toBe(3);
    expect(v3ToV4Migration.toVersion).toBe(4);
  });

  it("reshapes a journal into the new config shape", () => {
    const out = v3ToV4Migration.migrate(monolithV3());
    const journals = Object.values(out.journals as Record<string, Record<string, unknown>>);
    expect(journals).toHaveLength(1);
    const journal = journals[0];
    expect(journal.timeline).toEqual({ start: "", end: { kind: "never" } });
    expect(journal.numbering).toMatchObject({
      enabled: false,
      sources: [{ variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } }],
    });
    expect(journal.intervalBlock).toEqual({ type: "create", rows: [], decorateWholeBlock: false });
    expect(journal).not.toHaveProperty("start");
    expect(journal).not.toHaveProperty("index");
  });

  it("keys each journal by its name so the repository resolves it", () => {
    const out = v3ToV4Migration.migrate(monolithV3());
    expect(Object.keys(out.journals as Record<string, unknown>)).toEqual(["My Journal Day"]);
  });

  it("keys each shelf by its name", () => {
    const out = v3ToV4Migration.migrate(monolithV3());
    expect(Object.keys(out.shelves as Record<string, unknown>)).toEqual(["My Journal"]);
  });

  it("maps a plugin command to an all-target command", () => {
    const out = v3ToV4Migration.migrate(monolithV3());
    const cmd = Object.values(out.commands as Record<string, Record<string, unknown>>)[0];
    expect(cmd.target).toEqual({ kind: "all", writeType: "day" });
    expect(cmd.context).toBe("today");
  });

  describe("command ids preserve v2 hotkey bindings", () => {
    // Obsidian persists custom hotkeys keyed by the full command id (journals:<id>).
    // v2 derived <id> from the owner prefix + command name (lowercased, spaces dashed),
    // so re-deriving the same slug as the migrated collection key keeps every existing
    // hotkey pointing at its command.
    it("keys a journal command by its v2 slug", () => {
      const data = monolithV3();
      (data.journals["My Journal Day"] as { commands: unknown[] }).commands = [
        {
          name: "Open Today",
          icon: "",
          type: "same",
          context: "today",
          showInRibbon: false,
          openMode: "active",
        },
      ];
      const out = v3ToV4Migration.migrate(data);
      expect(Object.keys(out.commands as Record<string, unknown>)).toContain("my-journal-day:open-today");
    });

    it("keys a plugin-level command by its v2 slug", () => {
      const out = v3ToV4Migration.migrate(monolithV3());
      expect(Object.keys(out.commands as Record<string, unknown>)).toEqual([":open-today's-note"]);
    });

    it("keys a shelf command by its v2 slug", () => {
      const data = monolithV3();
      (data.shelves["My Journal"] as { commands: unknown[] }).commands = [
        {
          name: "Open Weekly",
          icon: "",
          writeType: "week",
          type: "same",
          showInRibbon: false,
          openMode: "active",
        },
      ];
      const out = v3ToV4Migration.migrate(data);
      expect(Object.keys(out.commands as Record<string, unknown>)).toContain("shelf:-my-journal:open-weekly");
    });

    it("suffixes a colliding slug so both commands survive", () => {
      const data = monolithV3();
      data.commands = [
        { name: "Open X", writeType: "day", type: "same", openMode: "active", showInRibbon: false, icon: "" },
        { name: "Open X", writeType: "week", type: "same", openMode: "active", showInRibbon: false, icon: "" },
      ];
      const out = v3ToV4Migration.migrate(data);
      expect(Object.keys(out.commands as Record<string, unknown>)).toEqual([":open-x", ":open-x-2"]);
    });
  });

  it("maps a custom-week calendar to the custom mode", () => {
    const out = v3ToV4Migration.migrate(monolithV3());
    expect(out.calendar).toEqual({ mode: "custom", dow: 1, doy: 4, global: false });
  });

  it("maps the locale sentinel to locale mode", () => {
    const data = monolithV3();
    data.calendar = { dow: -1, doy: 1, global: false };
    const out = v3ToV4Migration.migrate(data);
    expect(out.calendar).toEqual({ mode: "locale" });
  });

  it("moves calendar styles into the appearance slice", () => {
    const out = v3ToV4Migration.migrate(monolithV3());
    expect(out.appearance).toMatchObject({ today: { color: { type: "theme", name: "a" } } });
  });

  it("patches the seeded default view's leaf, weeks and button modes", () => {
    const out = v3ToV4Migration.migrate(monolithV3());
    const view = (out.views as Record<string, View>)[DEFAULT_CALENDAR_VIEW_ID];
    expect(view.leaf).toBe("left");
    const monthBlock = view.blocks.find((b) => b.key === "month-calendar");
    expect(monthBlock?.config.weeks).toBe("left");
    const toolbar = view.blocks.find((b) => b.key === "toolbar");
    const items = toolbar?.config.items as ToolbarItem[];
    expect(items.find((i) => i.config?.action?.type === "current")?.config?.action?.mode).toBe("create");
    expect(items.find((i) => i.config?.action?.type === "pick-date")?.config?.action?.mode).toBe("navigate");
  });

  it("maps openOnStartup into the startup slice", () => {
    const out = v3ToV4Migration.migrate(monolithV3());
    expect(out.startup).toEqual({ journalName: "My Journal Day" });
  });

  it("carries the pendingNoteMigration marker forward", () => {
    const out = v3ToV4Migration.migrate(monolithV3());
    expect(out.pendingNoteMigration).toEqual([
      { oldJournalId: "cal", kind: "calendar", sectionToName: { day: "My Journal Day" } },
    ]);
  });

  it("emits a week-anchor marker for each weekly journal", () => {
    const data = monolithV3();
    (data.journals as Record<string, unknown>)["My Weekly"] = {
      ...data.journals["My Journal Day"],
      name: "My Weekly",
      write: { type: "week" },
    };
    const out = v3ToV4Migration.migrate(data);
    expect(out.pendingNoteMigration).toContainEqual({ kind: "week-anchor", journalName: "My Weekly" });
  });

  it("maps switch_date today/pick modes to select-only buttons", () => {
    const data = monolithV3();
    data.calendarView.todayMode = "switch_date";
    data.calendarView.pickMode = "switch_date";
    const out = v3ToV4Migration.migrate(data);
    const view = (out.views as Record<string, View>)[DEFAULT_CALENDAR_VIEW_ID];
    const items = (view.blocks.find((b) => b.key === "toolbar")!.config as { items: ToolbarItem[] }).items;
    expect(items.find((i) => i.config?.action?.type === "current")!.config!.action!.mode).toBe("select-only");
    expect(items.find((i) => i.config?.action?.type === "pick-date")!.config!.action!.mode).toBe("select-only");
  });

  it("swaps the month-calendar block for a week-calendar block when display is week", () => {
    const data = monolithV3();
    data.calendarView.display = "week";
    const out = v3ToV4Migration.migrate(data);
    const view = (out.views as Record<string, View>)[DEFAULT_CALENDAR_VIEW_ID];
    expect(view.blocks.find((b) => b.key === "month-calendar")).toBeUndefined();
    const week = view.blocks.find((b) => b.key === "week-calendar");
    expect(week).toBeDefined();
    expect(week!.config).toEqual({ before: 0, after: 0, hiddenWeekdays: [], weeks: "left" });
  });

  it("drops legacy-only keys", () => {
    const data = { ...monolithV3(), ui: { calendarShelf: null }, useShelves: true, dismissedNotifications: ["x"] };
    const out = v3ToV4Migration.migrate(data);
    expect(out).not.toHaveProperty("ui");
    expect(out).not.toHaveProperty("useShelves");
    expect(out).not.toHaveProperty("dismissedNotifications");
  });
});
