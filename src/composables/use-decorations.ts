import type {
  JournalDecoration,
  JournalDecorationCondition,
  JournalDecorationDateCondition,
  JournalDecorationOffsetCondition,
  JournalDecorationPropertyCondition,
  JournalDecorationsStyle,
  JournalDecorationTagCondition,
  JournalDecorationTitleCondition,
  JournalDecorationWeekdayCondition,
} from "@/types/settings.types";
import { computed, toRef, unref, type ComputedRef, type MaybeRefOrGetter } from "vue";
import { useJournalDate } from "./use-journal-date";
import type { JournalNoteData } from "@/types/journal.types";
import { useJournal } from "./use-journal";
import { date_from_string } from "@/calendar";
import type { JournalPlugin } from "@/types/plugin.types";

export function useDecorations(
  plugin: JournalPlugin,
  dateRef: MaybeRefOrGetter<string | null>,
  decorationsList: MaybeRefOrGetter<
    {
      journalName: string;
      decoration: JournalDecoration;
    }[]
  >,
): ComputedRef<JournalDecorationsStyle[]> {
  const _decorationsList = toRef(decorationsList);
  return computed(() => {
    const _date = unref(dateRef);
    if (!_date) return [];
    return _decorationsList.value.flatMap(({ journalName, decoration }) => {
      return useJournalDecorations(plugin, _date, journalName, decoration).value;
    });
  });
}

export function useJournalDecorations(
  plugin: JournalPlugin,
  date: MaybeRefOrGetter<string | null>,
  journalName: string,
  decoration: MaybeRefOrGetter<JournalDecoration>,
): ComputedRef<JournalDecorationsStyle[]> {
  const _date = toRef(date);
  const _journalName = toRef(journalName);
  const _decoration = toRef(decoration);

  return computed(() => {
    if (!_date.value) return [];
    const { noteData } = useJournalDate(plugin, _date, _journalName);
    const isApplicable = checkDecorationConditions(
      plugin,
      _date.value,
      _journalName.value,
      noteData.value,
      _decoration.value.mode,
      _decoration.value.conditions,
    );
    return isApplicable ? _decoration.value.styles : [];
  });
}

function checkDecorationConditions(
  plugin: JournalPlugin,
  date: string,
  journalName: string,
  noteDate: JournalNoteData | null,
  mode: "and" | "or",
  conditions: JournalDecorationCondition[],
): boolean {
  if (conditions.length === 0) return false;
  if (mode === "or")
    return conditions.some((condition) => checkDecorationCondition(plugin, date, journalName, noteDate, condition));
  return conditions.every((condition) => checkDecorationCondition(plugin, date, journalName, noteDate, condition));
}

function checkDecorationCondition(
  plugin: JournalPlugin,
  date: string,
  journalName: string,
  noteData: JournalNoteData | null,
  condition: JournalDecorationCondition,
): boolean {
  switch (condition.type) {
    case "title": {
      return checkDecorationTitleCondition(noteData, condition);
    }
    case "tag": {
      return checkDecorationTagCondition(noteData, condition);
    }
    case "date": {
      return checkDecorationDateCondition(date, condition);
    }
    case "property": {
      return checkDecorationPropertyCondition(noteData, condition);
    }
    case "weekday": {
      return checkDecorationWeekdayCondition(date, condition);
    }
    case "offset": {
      return checkDecorationOffsetCondition(plugin, date, journalName, condition);
    }
    case "all-tasks-completed": {
      return checkDecorationAllTasksCompletedCondition(noteData);
    }
    case "has-note": {
      return checkDecorationHasNoteCondition(noteData);
    }
    case "has-open-task": {
      return checkDecorationHasOpenTaskCondition(noteData);
    }
  }
  return false;
}

function checkDecorationTitleCondition(
  noteData: JournalNoteData | null,
  condition: JournalDecorationTitleCondition,
): boolean {
  if (!noteData) return false;
  const title = noteData.title.toLowerCase();
  const value = condition.value.toLowerCase();
  switch (condition.condition) {
    case "contains": {
      return title.includes(value);
    }
    case "starts-with": {
      return title.startsWith(value);
    }
    case "ends-with": {
      return title.endsWith(value);
    }
  }
  return false;
}

function checkDecorationTagCondition(
  noteData: JournalNoteData | null,
  condition: JournalDecorationTagCondition,
): boolean {
  if (!noteData) return false;
  const tags = noteData.tags;
  if (tags.length === 0) return false;
  const value = condition.value.toLowerCase();
  switch (condition.condition) {
    case "contains": {
      return tags.some((tag) => tag.toLowerCase().includes(value));
    }
    case "starts-with": {
      return tags.some((tag) => tag.toLowerCase().startsWith(value));
    }
    case "ends-with": {
      return tags.some((tag) => tag.toLowerCase().endsWith(value));
    }
  }
}

function checkDecorationDateCondition(date: string, condition: JournalDecorationDateCondition): boolean {
  const parsed = date_from_string(date);
  if (condition.day !== -1 && parsed.date() !== condition.day) return false;
  if (condition.month !== -1 && parsed.month() !== condition.month) return false;
  if (condition.year && parsed.year() !== condition.year) return false;
  return true;
}

function checkDecorationPropertyCondition(
  noteData: JournalNoteData | null,
  condition: JournalDecorationPropertyCondition,
): boolean {
  if (!noteData) return false;
  const properties = noteData.properties;
  const name = condition.name;
  switch (condition.condition) {
    case "exists": {
      return name in properties;
    }
    case "does-not-exist": {
      return !(name in properties);
    }
    case "eq": {
      return properties[name] == condition.value;
    }
    case "neq": {
      return properties[name] != condition.value;
    }
    case "contains": {
      if (Array.isArray(properties[name])) {
        return properties[name].some(
          (property) => typeof property === "string" && property.toLowerCase().includes(condition.value.toLowerCase()),
        );
      } else if (typeof properties[name] === "string") {
        return properties[name].toLowerCase().includes(condition.value.toLowerCase());
      }
      return false;
    }
    case "does-not-contain": {
      if (Array.isArray(properties[name])) {
        return !properties[name].some(
          (property) => typeof property === "string" && property.toLowerCase().includes(condition.value.toLowerCase()),
        );
      } else if (typeof properties[name] === "string") {
        return !properties[name].toLowerCase().includes(condition.value.toLowerCase());
      }
      return false;
    }
    case "starts-with": {
      if (Array.isArray(properties[name])) {
        return properties[name].some(
          (property) =>
            typeof property === "string" && property.toLowerCase().startsWith(condition.value.toLowerCase()),
        );
      } else if (typeof properties[name] === "string") {
        return properties[name].toLowerCase().startsWith(condition.value.toLowerCase());
      }
      return false;
    }
    case "ends-with": {
      if (Array.isArray(properties[name])) {
        return properties[name].some(
          (property) => typeof property === "string" && property.toLowerCase().endsWith(condition.value.toLowerCase()),
        );
      } else if (typeof properties[name] === "string") {
        return properties[name].toLowerCase().endsWith(condition.value.toLowerCase());
      }
      return false;
    }
  }
  return false;
}

function checkDecorationWeekdayCondition(date: string, condition: JournalDecorationWeekdayCondition): boolean {
  const parsed = date_from_string(date);
  return condition.weekdays.includes(parsed.day());
}

function checkDecorationOffsetCondition(
  plugin: JournalPlugin,
  date: string,
  journalName: string,
  condition: JournalDecorationOffsetCondition,
): boolean {
  const [positive, negative] = useJournal(plugin, journalName).value?.calculateOffset(date) ?? [0, 0];
  if (condition.offset < 0) return negative === condition.offset;
  return positive === condition.offset;
}

function checkDecorationAllTasksCompletedCondition(noteDate: JournalNoteData | null): boolean {
  if (!noteDate) return false;
  const tasks = noteDate.tasks;
  if (tasks.length === 0) return false;
  return tasks.every((task) => task.completed);
}

function checkDecorationHasOpenTaskCondition(noteDate: JournalNoteData | null): boolean {
  if (!noteDate) return false;
  const tasks = noteDate.tasks;
  if (tasks.length === 0) return false;
  const openTasks = tasks.filter((task) => !task.completed);
  return openTasks.length > 0;
}

function checkDecorationHasNoteCondition(noteData: JournalNoteData | null): boolean {
  return !!noteData;
}
