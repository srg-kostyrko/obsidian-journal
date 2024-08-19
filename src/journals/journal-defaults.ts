import type { JournalSettings } from "../types/settings.types";

const defaultNameTemplates: Record<JournalSettings["write"]["type"], string> = {
  day: "{{date}}",
  week: "{{date}}",
  month: "{{date}}",
  quarter: "{{date}}",
  year: "{{date}}",
  weekdays: "",
  custom: "",
};

const defaultDateFormats: Record<JournalSettings["write"]["type"], string> = {
  day: "YYYY-MM-DD",
  week: "YYYY-[W]ww",
  month: "YYYY-MM",
  quarter: "YYYY-[Q]Q",
  year: "YYYY",
  weekdays: "",
  custom: "",
};

export function prepareJournalDefaultsBasedOnType(write: JournalSettings["write"]): Partial<JournalSettings> {
  return {
    nameTemplate: defaultNameTemplates[write.type],
    dateFormat: defaultDateFormats[write.type],
  };
}
