import { TFile, TFolder } from "obsidian";
import type { BulkAddPrams, NoteDataForProcessing } from "./bulk-add-notes.types";
import { app$, plugin$ } from "@/stores/obsidian.store";
import type { Journal } from "@/journals/journal";
import { formatToRegexp } from "@/utils/moment";
import { date_from_string } from "@/calendar";
import type {
  GenericConditions,
  JournalDecorationPropertyCondition,
  JournalDecorationTagCondition,
  JournalDecorationTitleCondition,
} from "@/types/settings.types";
import { checkExhaustive } from "@/utils/types";

export function buildNotesList(folderPath: string): TFile[] {
  const folder = app$.value.vault.getFolderByPath(folderPath ?? "/");
  if (!folder) {
    throw new Error(`Folder ${folderPath} not found`);
  }
  const notes = [];
  const queue = [folder];
  while (queue.length > 0) {
    const currentFolder = queue.shift();
    if (!currentFolder) break;
    for (const child of currentFolder.children) {
      if (child instanceof TFile) {
        notes.push(child);
      } else if (child instanceof TFolder) {
        queue.push(child);
      }
    }
  }
  return notes;
}

export function preprocessNotes(journal: Journal, notes: TFile[], parameters: BulkAddPrams): NoteDataForProcessing[] {
  const data: NoteDataForProcessing[] = [];
  const dateRegexp = formatToRegexp(parameters.date_format);
  for (const note of notes) {
    const noteData: NoteDataForProcessing = {
      file: note,
      operations: [],
    };
    data.push(noteData);
    const existing = plugin$.value.index.getForPath(note.path);
    if (existing) {
      noteData.operations.push({
        type: "skiping",
        reason:
          journal.name === existing.journal ? "already in journal" : "already in another journal " + existing.journal,
      });
      continue;
    }
    if (!checkFilters(note, parameters.filter_combinator, parameters.filters)) {
      noteData.operations.push({
        type: "skiping",
        reason: "does not match filters",
      });
      continue;
    }
    const dateString: string | undefined =
      parameters.date_place === "title"
        ? note.basename
        : app$.value.metadataCache.getFileCache(note)?.frontmatter?.[parameters.property_name];
    if (dateString === undefined) {
      noteData.operations.push({
        type: "skiping",
        reason: "does not have date containing proerty " + parameters.property_name,
      });
      continue;
    }
    const match = dateString.match(dateRegexp);
    if (!match) {
      noteData.operations.push({
        type: "skiping",
        reason: "date not found",
      });
      continue;
    }
    const date = date_from_string(match[0], parameters.date_format);
    if (!date.isValid()) {
      noteData.operations.push({
        type: "skiping",
        reason: "invalid date " + dateString,
      });
      continue;
    }
    const metadata = journal.get(date.format("YYYY-MM-DD"));
    if (!metadata) {
      noteData.operations.push({
        type: "skiping",
        reason: "date is outside of journal boundaries " + date.format("YYYY-MM-DD"),
      });
      continue;
    }
    if ("path" in metadata && metadata.path) {
      noteData.operations.push({
        type: "existing_note",
        other_file: app$.value.vault.getAbstractFileByPath(metadata.path) as TFile,
        desision: parameters.existing_note,
      });
    }
    const [configuredFolder, configuredFilename] = journal.getConfiguredPathData(metadata);
    if (configuredFolder !== note.parent?.path) {
      noteData.operations.push({
        type: "other_folder",
        configured_folder: configuredFolder,
        desision: parameters.other_folder,
      });
    }
    if (configuredFilename !== note.basename) {
      noteData.operations.push({
        type: "other_name",
        configured_name: configuredFilename,
        desision: parameters.other_name,
      });
    }
  }
  return data;
}

function checkFilters(note: TFile, combinator: BulkAddPrams["filter_combinator"], filters: BulkAddPrams["filters"]) {
  if (combinator === "no") return true;
  if (combinator === "and") return filters.every((f) => checkFilter(note, f));
  if (combinator === "or") return filters.some((f) => checkFilter(note, f));
  return false;
}

function checkFilter(note: TFile, filter: GenericConditions) {
  const metadata = app$.value.metadataCache.getFileCache(note);
  if (!metadata) return false;
  switch (filter.type) {
    case "title": {
      return checkNameFilter(note, filter);
    }
    case "tag": {
      return checkTagFilter(note, filter);
    }
    case "property": {
      return checkPropertyFilter(note, filter);
    }
  }
  return true;
}

function checkNameFilter(note: TFile, filter: JournalDecorationTitleCondition) {
  switch (filter.condition) {
    case "contains": {
      return note.basename.contains(filter.value);
    }
    case "starts-with": {
      return note.basename.startsWith(filter.value);
    }
    case "ends-with": {
      return note.basename.endsWith(filter.value);
    }
    default: {
      checkExhaustive(filter.condition);
    }
  }
}

function checkTagFilter(note: TFile, filter: JournalDecorationTagCondition) {
  const metadata = app$.value.metadataCache.getFileCache(note);
  if (!metadata) return false;
  if (!metadata.tags) return false;
  switch (filter.condition) {
    case "contains": {
      return metadata.tags.some((tag) => tag.tag.contains(filter.value));
    }
    case "starts-with": {
      return metadata.tags.some((tag) => tag.tag.startsWith(filter.value));
    }
    case "ends-with": {
      return metadata.tags.some((tag) => tag.tag.endsWith(filter.value));
    }
    default: {
      checkExhaustive(filter.condition);
    }
  }
}

function checkPropertyFilter(note: TFile, filter: JournalDecorationPropertyCondition) {
  const metadata = app$.value.metadataCache.getFileCache(note);
  if (!metadata) return false;
  const propertyValue = metadata.frontmatter?.[filter.name];
  switch (filter.condition) {
    case "exists": {
      return !!metadata.frontmatter && filter.name in metadata.frontmatter;
    }
    case "does-not-exist": {
      return !!metadata.frontmatter && !(filter.name in metadata.frontmatter);
    }
    case "eq": {
      return propertyValue == filter.value;
    }
    case "neq": {
      return propertyValue != filter.value;
    }
    case "contains": {
      return typeof propertyValue === "string" && propertyValue.contains(filter.value);
    }
    case "does-not-contain": {
      return (
        typeof propertyValue !== "string" ||
        (typeof propertyValue === "string" && !propertyValue.contains(filter.value))
      );
    }
    case "starts-with": {
      return typeof propertyValue === "string" && propertyValue.startsWith(filter.value);
    }
    case "ends-with": {
      return typeof propertyValue === "string" && propertyValue.endsWith(filter.value);
    }
    default: {
      checkExhaustive(filter.condition);
    }
  }
}
