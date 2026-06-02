import type { Migration } from "@/settings";

import {
  allocateName,
  prepareCalendarJournalSettings,
  prepareIntervalJournalSettings,
  type ConfiguredNames,
} from "./journal-conversion";
import {
  calculateDoy,
  defaultCommands,
  type OldJournalSettings,
  type OldShelfSettings,
  type PluginSettingsV1,
} from "./old-shapes";

import type { PendingNoteMigration } from "./pending-note-migration";

const SECTIONS = ["day", "week", "month", "quarter", "year"] as const;

export const v1ToV2Migration: Migration = {
  fromVersion: 0,
  toVersion: 2,
  migrate(raw) {
    const old = raw as unknown as PluginSettingsV1;
    const journals: Record<string, OldJournalSettings> = {};
    const shelves: Record<string, OldShelfSettings> = {};
    const marker: PendingNoteMigration[] = [];
    const used = new Set<string>();

    for (const config of Object.values(old.journals)) {
      if (config.type === "interval") {
        const name = allocateName(config.name, used);
        const settings = prepareIntervalJournalSettings(config, false);
        settings.name = name;
        journals[name] = settings;
        marker.push({ oldJournalId: config.id, kind: "interval", name });
        continue;
      }

      const shelfName = config.name;
      const names: ConfiguredNames = {
        shelf: shelfName,
        day: `${config.name} Day`,
        week: `${config.name} Week`,
        month: `${config.name} Month`,
        quarter: `${config.name} Quarter`,
        year: `${config.name} Year`,
      };
      const sectionToName: Partial<Record<(typeof SECTIONS)[number], string>> = {};
      const shelfJournals: string[] = [];
      for (const section of SECTIONS) {
        if (!config[section].enabled) continue;
        const name = allocateName(names[section], used);
        const settings = prepareCalendarJournalSettings(config, section, names, true, false);
        settings.name = name;
        settings.shelves = [shelfName];
        journals[name] = settings;
        shelfJournals.push(name);
        sectionToName[section] = name;
      }
      if (shelfJournals.length > 0) {
        shelves[shelfName] = { name: shelfName, journals: shelfJournals, commands: [] };
        marker.push({ oldJournalId: config.id, kind: "calendar", sectionToName });
      }
    }

    const dow = old.calendar.firstDayOfWeek;
    const doy = dow === -1 ? 1 : calculateDoy(dow, old.calendar.firstWeekOfYear);

    return {
      version: 2,
      journals,
      shelves,
      commands: structuredClone(defaultCommands),
      calendar: { dow, doy, global: false },
      calendarView: { leaf: old.calendar_view.leaf, weeks: old.calendar_view.weeks },
      openOnStartup: "",
      pendingNoteMigration: marker,
    };
  },
};
