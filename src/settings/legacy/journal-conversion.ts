import {
  defaultDateFormats,
  defaultOldJournalSettings,
  emptyNavRow,
  oldJournalDefaultsBasedOnType,
} from "./old-shapes";

import type { CalendarConfig, IntervalConfig, OldJournalSettings } from "./old-shapes";

const DEFAULT_RIBBON_TOOLTIPS = {
  day: "Open today's note",
  week: "Open this week's note",
  month: "Open this month's note",
  quarter: "Open this quarter's note",
  year: "Open this year's note",
};

export interface ConfiguredNames {
  shelf: string;
  day: string;
  week: string;
  month: string;
  quarter: string;
  year: string;
}

export function prepareIntervalJournalSettings(
  oldSettings: IntervalConfig,
  keepFrontmatter: boolean,
): OldJournalSettings {
  const write: OldJournalSettings["write"] = {
    type: "custom",
    anchorDate: oldSettings.start_date,
    every: oldSettings.granularity,
    duration: oldSettings.duration,
  };
  const settings: OldJournalSettings = structuredClone({
    ...defaultOldJournalSettings,
    ...oldJournalDefaultsBasedOnType(write),
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
    anchorDate: oldSettings.start_date,
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
      icon: oldSettings.ribbon.icon || "calendar-range",
      name: oldSettings.ribbon.tooltip || `Open current ${oldSettings.name} note`,
      type: "same",
      context: "today",
      showInRibbon: true,
      openMode: oldSettings.openMode,
    });
  }

  return settings;
}

export function prepareCalendarJournalSettings(
  oldSettings: CalendarConfig,
  sectionName: "day" | "week" | "month" | "quarter" | "year",
  names: ConfiguredNames,
  addShelf: boolean,
  keepFrontmatter: boolean,
): OldJournalSettings {
  const write: OldJournalSettings["write"] = {
    type: sectionName,
  };

  const settings: OldJournalSettings = structuredClone({
    ...defaultOldJournalSettings,
    ...oldJournalDefaultsBasedOnType(write),
    write,
  });

  const oldSection = oldSettings[sectionName];

  settings.name = names[sectionName];
  settings.autoCreate = oldSection.createOnStartup;

  if (addShelf && names.shelf) {
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

  return settings;
}

export function allocateName(proposed: string, used: Set<string>): string {
  if (!used.has(proposed)) {
    used.add(proposed);
    return proposed;
  }
  let n = 2;
  while (used.has(`${proposed} ${n}`)) n++;
  const name = `${proposed} ${n}`;
  used.add(name);
  return name;
}
