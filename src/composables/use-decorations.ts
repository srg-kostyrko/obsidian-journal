import type { MomentDate } from "@/types/date.types";
import type {
  JournalDecorationCondition,
  JournalDecorationDateCondition,
  JournalDecorationOffsetCondition,
  JournalDecorationPropertyCondition,
  JournalDecorationsStyle,
  JournalDecorationTagCondition,
  JournalDecorationTitleCondition,
  JournalDecorationWeekdayCondition,
} from "@/types/settings.types";
import { computed, toRef, type ComputedRef, type MaybeRefOrGetter } from "vue";
import { useJournalDate } from "./use-journal-date";
import type { JournalNoteData } from "@/types/journal.types";
import { pluginSettings$ } from "@/stores/settings.store";

export function useDecorations(
  date: MaybeRefOrGetter<MomentDate>,
  journals: MaybeRefOrGetter<string[]>,
): ComputedRef<JournalDecorationsStyle[]> {
  const _date = toRef(date);
  const _journals = toRef(journals);
  return computed(() => {
    return _journals.value
      .map((journal) => {
        return useJournalDecorations(_date, journal).value;
      })
      .flat();
  });
}

export function useJournalDecorations(
  date: MaybeRefOrGetter<MomentDate>,
  journalName: MaybeRefOrGetter<string>,
): ComputedRef<JournalDecorationsStyle[]> {
  const _date = toRef(date);
  const _journalName = toRef(journalName);
  const _journalSettings = computed(() => pluginSettings$.value.journals[_journalName.value]);
  return computed(() => {
    const { noteData } = useJournalDate(_date, _journalName.value);
    return _journalSettings.value.decorations
      .filter((decoration) => {
        return checkDecorationConditions(_date.value, noteData.value, decoration.mode, decoration.conditions);
      })
      .map((decoration) => {
        return decoration.styles;
      })
      .flat();
  });
}

function checkDecorationConditions(
  date: MomentDate,
  noteDate: JournalNoteData | null,
  mode: "and" | "or",
  conditions: JournalDecorationCondition[],
): boolean {
  if (conditions.length === 0) return false;
  if (mode === "or") return conditions.some((condition) => checkDecorationCondition(date, noteDate, condition));
  return conditions.every((condition) => checkDecorationCondition(date, noteDate, condition));
}

function checkDecorationCondition(
  date: MomentDate,
  noteData: JournalNoteData | null,
  condition: JournalDecorationCondition,
): boolean {
  switch (condition.type) {
    case "title":
      return checkDecorationTitleCondition(noteData, condition);
    case "tag":
      return checkDecorationTagCondition(noteData, condition);
    case "date":
      return checkDecorationDateCondition(date, noteData, condition);
    case "property":
      return checkDecorationPropertyCondition(noteData, condition);
    case "weekday":
      return checkDecorationWeekdayCondition(date, noteData, condition);
    case "offset":
      return checkDecorationOffsetCondition(date, noteData, condition);
    case "all-tasks-completed":
      return checkDecorationAllTasksCompletedCondition(noteData);
    case "has-note":
      return checkDecorationHasNoteCondition(noteData);
    case "has-open-task":
      return checkDecorationHasOpenTaskCondition(noteData);
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
    case "contains":
      return title.includes(value);
    case "starts-with":
      return title.startsWith(value);
    case "ends-with":
      return title.endsWith(value);
  }
  return false;
}

function checkDecorationTagCondition(
  noteData: JournalNoteData | null,
  condition: JournalDecorationTagCondition,
): boolean {
  if (!noteData) return false;
  const tags = noteData.tags;
  if (!tags.length) return false;
  const value = condition.value.toLowerCase();
  switch (condition.condition) {
    case "contains":
      return tags.some((tag) => tag.toLowerCase().includes(value));
    case "starts-with":
      return tags.some((tag) => tag.toLowerCase().startsWith(value));
    case "ends-with":
      return tags.some((tag) => tag.toLowerCase().endsWith(value));
  }
}

function checkDecorationDateCondition(
  _date: MomentDate,
  _noteDate: JournalNoteData | null,
  _condition: JournalDecorationDateCondition,
): boolean {
  return false;
}

function checkDecorationPropertyCondition(
  noteData: JournalNoteData | null,
  condition: JournalDecorationPropertyCondition,
): boolean {
  if (!noteData) return false;
  const properties = noteData.properties;
  const name = condition.name;
  switch (condition.condition) {
    case "exists":
      return name in properties;
    case "does-not-exist":
      return !(name in properties);
    case "eq":
      return properties[name] == condition.value;
    case "neq":
      return properties[name] != condition.value;
    case "contains":
      if (Array.isArray(properties[name])) {
        return properties[name].some(
          (property) => typeof property === "string" && property.toLowerCase().includes(condition.value.toLowerCase()),
        );
      } else if (typeof properties[name] === "string") {
        return properties[name].toLowerCase().includes(condition.value.toLowerCase());
      }
      return false;
    case "does-not-contain":
      if (Array.isArray(properties[name])) {
        return !properties[name].some(
          (property) => typeof property === "string" && property.toLowerCase().includes(condition.value.toLowerCase()),
        );
      } else if (typeof properties[name] === "string") {
        return !properties[name].toLowerCase().includes(condition.value.toLowerCase());
      }
      return false;
    case "starts-with":
      if (Array.isArray(properties[name])) {
        return properties[name].some(
          (property) =>
            typeof property === "string" && property.toLowerCase().startsWith(condition.value.toLowerCase()),
        );
      } else if (typeof properties[name] === "string") {
        return properties[name].toLowerCase().startsWith(condition.value.toLowerCase());
      }
      return false;
    case "ends-with":
      if (Array.isArray(properties[name])) {
        return properties[name].some(
          (property) => typeof property === "string" && property.toLowerCase().endsWith(condition.value.toLowerCase()),
        );
      } else if (typeof properties[name] === "string") {
        return properties[name].toLowerCase().endsWith(condition.value.toLowerCase());
      }
      return false;
  }
  return false;
}

function checkDecorationWeekdayCondition(
  _date: MomentDate,
  _noteDate: JournalNoteData | null,
  _condition: JournalDecorationWeekdayCondition,
): boolean {
  return false;
}

function checkDecorationOffsetCondition(
  _date: MomentDate,
  _noteDate: JournalNoteData | null,
  _condition: JournalDecorationOffsetCondition,
): boolean {
  return false;
}

function checkDecorationAllTasksCompletedCondition(noteDate: JournalNoteData | null): boolean {
  if (!noteDate) return false;
  const tasks = noteDate.tasks;
  if (!tasks.length) return false;
  return tasks.every((task) => task.completed);
}

function checkDecorationHasOpenTaskCondition(noteDate: JournalNoteData | null): boolean {
  if (!noteDate) return false;
  const tasks = noteDate.tasks;
  if (!tasks.length) return false;
  const openTasks = tasks.filter((task) => !task.completed);
  return openTasks.length > 0;
}

function checkDecorationHasNoteCondition(noteData: JournalNoteData | null): boolean {
  return !!noteData;
}
