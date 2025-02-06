import { moment, TFile } from "obsidian";
import type { JournalDecorationCondition, JournalSettings } from "@/types/settings.types";
import { checkExhaustive } from "./types";
import type { JournalPlugin } from "@/types/plugin.types";
import { today } from "@/calendar";

export function getWritingDescription(writing: JournalSettings["write"]): string {
  if (writing.type === "custom") {
    return `every ${writing.duration} ${writing.every}s`;
  }
  switch (writing.type) {
    case "day": {
      return "daily";
    }
    case "week": {
      return "weekly";
    }
    case "month": {
      return "monthly";
    }
    case "quarter": {
      return "quarterly";
    }
    case "year": {
      return "annually";
    }
  }
  return "";
}

export function getDecorationConditionDescription(condition: JournalDecorationCondition): string {
  switch (condition.type) {
    case "title": {
      return `title ${condition.condition} ${condition.value}`;
    }
    case "tag": {
      return `tag ${condition.condition} ${condition.value}`;
    }
    case "property": {
      return `property ${condition.name} ${condition.condition} ${condition.value}`;
    }
    case "date": {
      return `date is ${condition.day}-${condition.month}-${condition.year ?? "any year"}`;
    }
    case "weekday": {
      return `weekday is any of ${condition.weekdays.map((day) => moment().localeData().weekdaysShort()[day]).join(", ")}`;
    }
    case "offset": {
      return `date is ${condition.offset < 0 ? -condition.offset : condition.offset} days away from interval ${condition.offset < 0 ? "end" : "start"}`;
    }
    case "has-note": {
      return "there is a note connected to a date";
    }
    case "has-open-task": {
      return "note connected to a date has an open task";
    }
    case "all-tasks-completed": {
      return "all tasks in note connected to date are completed";
    }
    default: {
      checkExhaustive(condition);
      return "";
    }
  }
}

export async function updateWeeklyJournals(
  plugin: JournalPlugin,
  notesToUpdate: Map<string, { year: number; weeks: number; path: string }[]>,
): Promise<void> {
  for (const [journalName, notes] of notesToUpdate) {
    const journal = plugin.getJournal(journalName);
    if (!journal) continue;
    for (const { year, weeks, path } of notes) {
      const file = plugin.app.vault.getAbstractFileByPath(path);
      if (!file) continue;
      if (!(file instanceof TFile)) continue;
      const date = today().year(year).week(weeks).format("YYYY-MM-DD");
      const anchorDate = journal.resolveAnchorDate(date);
      if (!anchorDate) continue;
      await plugin.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, string | number>) => {
        frontmatter[journal.frontmatterDate] = anchorDate;
        if (journal.config.value.frontmatter.addStartDate) {
          frontmatter[journal.frontmatterStartDate] = journal.resolveStartDate(anchorDate);
        }
        if (journal.config.value.frontmatter.addEndDate) {
          frontmatter[journal.frontmatterEndDate] = journal.resolveEndDate(anchorDate);
        }
      });
    }
  }
}
