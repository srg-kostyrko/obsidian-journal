import type { JournalSettings } from "../types/settings.types";

type CommandTypes =
  | "same"
  | "next"
  | "previous"
  | "same_next_week"
  | "same_previous_week"
  | "same_next_month"
  | "same_previous_month"
  | "same_next_year"
  | "same_previous_year";

type ContextTypes = "today" | "open_note" | "only_open_note";

const supportedCommands: Record<JournalSettings["write"]["type"], CommandTypes[]> = {
  day: [
    "same",
    "next",
    "previous",
    "same_next_week",
    "same_previous_week",
    "same_next_month",
    "same_previous_month",
    "same_next_year",
    "same_previous_year",
  ],
  week: ["same", "next", "previous"],
  month: ["same", "next", "previous", "same_next_year", "same_previous_year"],
  quarter: ["same", "next", "previous", "same_next_year", "same_previous_year"],
  year: ["same", "next", "previous"],
  weekdays: [],
  custom: ["same", "next", "previous"],
};

export const buildSupportedCommandList = (type: JournalSettings["write"]["type"]) => {
  return supportedCommands[type];
};

export const resolveCommandLabel = (
  type: JournalSettings["write"]["type"],
  command: CommandTypes,
  context?: ContextTypes,
) => {
  switch (command) {
    case "same": {
      return type === "day" ? `Open today's note` : `Open current ${type}'s note`;
    }
    case "previous": {
      return type === "day" && context === "today" ? `Open yesterday's note` : `Open last ${type}'s note`;
    }
    case "next": {
      return type === "day" && context === "today" ? `Open tomorrow's note` : `Open next ${type}'s note`;
    }
    case "same_next_week": {
      return `Open same ${type} next week`;
    }
    case "same_previous_week": {
      return `Open same ${type} last week`;
    }
    case "same_next_month": {
      return `Open same ${type} next month`;
    }
    case "same_previous_month": {
      return `Open same ${type} last month`;
    }
    case "same_next_year": {
      return `Open same ${type} next year`;
    }
    case "same_previous_year": {
      return `Open same ${type} last year`;
    }
  }
};

export function resolveContextDescription(
  type: JournalSettings["write"]["type"],
  command: CommandTypes,
  context: ContextTypes,
) {
  if (command === "same") return "";
  if (context === "only_open_note") return "(using date of currently opened note)";
  if (context === "open_note") return "(using date of currently opened note or today's date)";
  return "";
}
