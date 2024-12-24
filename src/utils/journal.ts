import { moment } from "obsidian";
import type { JournalDecorationCondition, JournalSettings } from "@/types/settings.types";
import { checkExhaustive } from "./types";

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
      return `day is ${condition.offset < 0 ? -condition.offset : condition.offset} away from interval ${condition.offset < 0 ? "start" : "end"}`;
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
