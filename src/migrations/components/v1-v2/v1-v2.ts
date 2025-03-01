import { calculateDoy } from "@/calendar";
import { FRONTMATTER_END_DATE_KEY, FRONTMATTER_NAME_KEY, FRONTMATTER_START_DATE_KEY } from "@/constants";
import { defaultJournalSettings, defaultPluginSettings } from "@/defaults";
import type { Journal } from "@/journals/journal";
import { emptyNavRow, prepareJournalDefaultsBasedOnType } from "@/journals/journal-defaults";
import { JournalAnchorDate } from "@/types/journal.types";
import type { CalendarConfig, IntervalConfig, PluginSettingsV1 } from "@/types/old-settings.types";
import type { JournalPlugin } from "@/types/plugin.types";
import type { JournalSettings, PluginSettings } from "@/types/settings.types";
import { deepCopy } from "@/utils/misc";
import { defaultDateFormats } from "@/journals/journal-defaults";

export const FRONTMATTER_SECTION_KEY = "journal-section";
export const FRONTMATTER_INDEX_KEY = "journal-interval-index";

export const DEFAULT_RIBBON_TOOLTIPS = {
  day: "Open today's note",
  week: "Open this week's note",
  month: "Open this month's note",
  quarter: "Open this quarter's note",
  year: "Open this year's note",
};

interface ConfiguredNames {
  shelf: string;
  day: string;
  week: string;
  month: string;
  quarter: string;
  year: string;
}

export function countSections(settings: CalendarConfig) {
  let count = 0;
  if (settings.day.enabled) count++;
  if (settings.week.enabled) count++;
  if (settings.month.enabled) count++;
  if (settings.quarter.enabled) count++;
  if (settings.year.enabled) count++;
  return count;
}

export function migrateV1toV2(oldData: PluginSettingsV1): PluginSettings {
  const newData = deepCopy(defaultPluginSettings);

  newData.calendar.dow = oldData.calendar.firstDayOfWeek;
  newData.calendar.doy =
    oldData.calendar.firstDayOfWeek === -1
      ? 1
      : calculateDoy(oldData.calendar.firstDayOfWeek, oldData.calendar.firstWeekOfYear);

  newData.calendarView.leaf = oldData.calendar_view.leaf;
  newData.calendarView.weeks = oldData.calendar_view.weeks;

  newData.pendingMigrations.push({
    type: "v1-v2",
    shelfDecided: false,
    frontmatterDecided: false,
    journals: Object.values(oldData.journals),
  });

  return newData;
}

export async function migrateIntervalJournal(
  plugin: JournalPlugin,
  oldSettings: IntervalConfig,
  keepFrontmatter: boolean,
): Promise<void> {
  const write: JournalSettings["write"] = {
    type: "custom",
    anchorDate: JournalAnchorDate(oldSettings.start_date),
    every: oldSettings.granularity,
    duration: oldSettings.duration,
  };
  const settings: JournalSettings = deepCopy({
    ...defaultJournalSettings,
    ...prepareJournalDefaultsBasedOnType(write),
    write,
  });

  settings.name = oldSettings.name;
  settings.autoCreate = oldSettings.createOnStartup;
  settings.nameTemplate = oldSettings.nameTemplate || "{{journal_name}} {{index}}";
  settings.dateFormat = oldSettings.dateFormat || "YYYY-MM-DD";
  settings.folder = oldSettings.folder;
  if (oldSettings.template) {
    settings.templates.push(oldSettings.template);
  }
  settings.start = oldSettings.start_date;
  if (oldSettings.end_type === "date") {
    settings.end = {
      type: "date",
      date: oldSettings.end_date,
    };
  } else if (oldSettings.end_type === "repeats") {
    settings.end = {
      type: "repeats",
      repeats: oldSettings.repeats,
    };
  }

  settings.index = {
    enabled: true,
    anchorDate: JournalAnchorDate(oldSettings.start_date),
    anchorIndex: oldSettings.start_index,
    allowBefore: false,
    type: "increment",
    resetAfter: 0,
  };
  if (oldSettings.numeration_type === "year") {
    settings.index.type = "reset_after";
    const duration = oldSettings.duration;
    switch (oldSettings.granularity) {
      case "month": {
        settings.index.resetAfter = Math.floor(12 / duration);
        break;
      }
      case "week": {
        settings.index.resetAfter = Math.floor(52 / duration);
        break;
      }
      case "day": {
        settings.index.resetAfter = Math.floor(365 / duration);
        break;
      }
    }
  }

  if (oldSettings.navNameTemplate || oldSettings.navDatesTemplate) {
    settings.navBlock.rows = [
      {
        ...emptyNavRow,
        template: oldSettings.navNameTemplate || "{{journal_name}} {{index}}",
        link: "self",
        fontSize: 3,
        bold: true,
        addDecorations: true,
      },
    ];
    if (oldSettings.navDatesTemplate) {
      for (const row of oldSettings.navDatesTemplate.split("|")) {
        settings.navBlock.rows.push({
          ...emptyNavRow,
          template: row,
        });
      }
    } else {
      settings.navBlock.rows.push(
        {
          ...emptyNavRow,
          template: "{{start_date}}",
        },
        {
          ...emptyNavRow,
          template: "to",
        },
        {
          ...emptyNavRow,
          template: "{{end_date}}",
        },
      );
    }
  }

  if (keepFrontmatter) {
    settings.frontmatter.addStartDate = true;
    settings.frontmatter.addEndDate = true;
  }

  if (oldSettings.ribbon.show) {
    settings.commands.push({
      icon: oldSettings.ribbon.icon,
      name: oldSettings.ribbon.tooltip,
      type: "same",
      context: "today",
      showInRibbon: true,
      openMode: oldSettings.openMode,
    });
  }

  const journal = plugin.registerJournal(settings);

  await updateFrontMatterInterval(plugin, journal, oldSettings);
}

async function updateFrontMatterInterval(
  plugin: JournalPlugin,
  journal: Journal,
  oldSettings: IntervalConfig,
): Promise<void> {
  const files = plugin.notesManager.getMarkdownFiles();
  for (const file of files) {
    const metadata = plugin.notesManager.getNoteMetadata(file.path);
    if (!metadata) continue;
    const { frontmatter } = metadata;
    if (!frontmatter) continue;
    if (!(FRONTMATTER_NAME_KEY in frontmatter)) continue;
    const journalId = frontmatter[FRONTMATTER_NAME_KEY];
    if (journalId !== oldSettings.id) continue;

    await plugin.notesManager.updateNoteFrontmatter(file.path, (frontmatter) => {
      const date = frontmatter[FRONTMATTER_START_DATE_KEY] as string;
      const endDate = frontmatter[FRONTMATTER_END_DATE_KEY];
      const anchorDate = journal.resolveAnchorDate(date);
      if (anchorDate) {
        frontmatter[FRONTMATTER_NAME_KEY] = journal.name;
        frontmatter[journal.frontmatterDate] = date;
        if (journal.config.value.frontmatter.addStartDate) {
          frontmatter[journal.frontmatterStartDate] = journal.resolveStartDate(anchorDate);
        } else {
          delete frontmatter[FRONTMATTER_START_DATE_KEY];
        }
        if (journal.config.value.frontmatter.addEndDate || endDate !== journal.resolveEndDate(anchorDate)) {
          frontmatter[journal.frontmatterEndDate] = endDate;
        } else {
          delete frontmatter[FRONTMATTER_END_DATE_KEY];
        }
        frontmatter[journal.frontmatterIndex] = frontmatter[FRONTMATTER_INDEX_KEY];
        delete frontmatter[FRONTMATTER_INDEX_KEY];
      } else {
        delete frontmatter[FRONTMATTER_NAME_KEY];
        delete frontmatter[FRONTMATTER_START_DATE_KEY];
        delete frontmatter[FRONTMATTER_END_DATE_KEY];
        delete frontmatter[FRONTMATTER_INDEX_KEY];
      }
    });
  }
}

export async function migrateCalendarJournal(
  plugin: JournalPlugin,
  oldSettings: CalendarConfig,
  names: ConfiguredNames,
  keepFrontmatter: boolean,
): Promise<void> {
  if (oldSettings.day.enabled) await migrateCalendarSection(plugin, oldSettings, "day", names, keepFrontmatter);
  if (oldSettings.week.enabled) await migrateCalendarSection(plugin, oldSettings, "week", names, keepFrontmatter);
  if (oldSettings.month.enabled) await migrateCalendarSection(plugin, oldSettings, "month", names, keepFrontmatter);
  if (oldSettings.quarter.enabled) await migrateCalendarSection(plugin, oldSettings, "quarter", names, keepFrontmatter);
  if (oldSettings.year.enabled) await migrateCalendarSection(plugin, oldSettings, "year", names, keepFrontmatter);
}

export async function migrateCalendarSection(
  plugin: JournalPlugin,
  oldSettings: CalendarConfig,
  sectionName: "day" | "week" | "month" | "quarter" | "year",
  names: ConfiguredNames,
  keepFrontmatter: boolean,
): Promise<void> {
  const write: JournalSettings["write"] = {
    type: sectionName,
  };

  const settings: JournalSettings = deepCopy({
    ...defaultJournalSettings,
    ...prepareJournalDefaultsBasedOnType(write),
    write,
  });

  const oldSection = oldSettings[sectionName];

  settings.name = names[sectionName];
  settings.autoCreate = oldSection.createOnStartup;

  if (plugin.usesShelves && names.shelf) {
    settings.shelves = [names.shelf];
  }

  settings.nameTemplate = oldSection.nameTemplate || "{{date}}";
  settings.dateFormat = oldSection.dateFormat || defaultDateFormats[sectionName];
  settings.folder = oldSettings.rootFolder ? oldSettings.rootFolder + "/" + oldSection.folder : oldSection.folder;
  if (oldSection.template) {
    settings.templates.push(oldSection.template);
  }

  if (oldSection.ribbon.show) {
    settings.commands.push({
      icon: oldSection.ribbon.icon || "calendar-days",
      name: oldSection.ribbon.tooltip || DEFAULT_RIBBON_TOOLTIPS[sectionName],
      type: "same",
      context: "today",
      showInRibbon: true,
      openMode: oldSection.openMode,
    });
  }

  if (keepFrontmatter) {
    settings.frontmatter.addStartDate = true;
    settings.frontmatter.addEndDate = true;
  }

  const journal = plugin.registerJournal(settings);

  await updateFrontmatterCalendarSection(plugin, journal, sectionName, oldSettings);
}

async function updateFrontmatterCalendarSection(
  plugin: JournalPlugin,
  journal: Journal,
  sectionName: "day" | "week" | "month" | "quarter" | "year",
  oldSettings: CalendarConfig,
) {
  const files = plugin.notesManager.getMarkdownFiles();
  for (const file of files) {
    const metadata = plugin.notesManager.getNoteMetadata(file.path);
    if (!metadata) continue;
    const { frontmatter } = metadata;
    if (!frontmatter) continue;
    if (!(FRONTMATTER_NAME_KEY in frontmatter)) continue;
    const journalId = frontmatter[FRONTMATTER_NAME_KEY];
    if (journalId !== oldSettings.id) continue;
    const section = frontmatter[FRONTMATTER_SECTION_KEY];
    if (section !== sectionName) continue;

    await plugin.notesManager.updateNoteFrontmatter(file.path, (frontmatter) => {
      const date = frontmatter[FRONTMATTER_START_DATE_KEY] as string;
      const anchorDate = journal.resolveAnchorDate(date);
      if (anchorDate) {
        frontmatter[FRONTMATTER_NAME_KEY] = journal.name;
        frontmatter[journal.frontmatterDate] = date;
        if (journal.config.value.frontmatter.addStartDate) {
          frontmatter[journal.frontmatterStartDate] = journal.resolveStartDate(anchorDate);
        } else {
          delete frontmatter[FRONTMATTER_START_DATE_KEY];
        }
        if (journal.config.value.frontmatter.addEndDate) {
          frontmatter[journal.frontmatterEndDate] = journal.resolveEndDate(anchorDate);
        } else {
          delete frontmatter[FRONTMATTER_END_DATE_KEY];
        }
        delete frontmatter[FRONTMATTER_SECTION_KEY];
      } else {
        delete frontmatter[FRONTMATTER_NAME_KEY];
        delete frontmatter[FRONTMATTER_SECTION_KEY];
        delete frontmatter[FRONTMATTER_START_DATE_KEY];
        delete frontmatter[FRONTMATTER_END_DATE_KEY];
        delete frontmatter[FRONTMATTER_INDEX_KEY];
      }
    });
  }
}
