import { normalizePath, TFile, TFolder } from "obsidian";
import type {
  BulkAddPrams,
  ConnectNote,
  FolderDeifference,
  NameDifference,
  NoteDataForProcessing,
  NoteProcessingResult,
  RelateToExistingNote,
  SkippingNote,
} from "./bulk-add-notes.types";
import { Journal } from "@/journals/journal";
import { formatToRegexp } from "@/utils/moment";
import { date_from_string } from "@/calendar";
import type {
  GenericConditions,
  JournalDecorationPropertyCondition,
  JournalDecorationTagCondition,
  JournalDecorationTitleCondition,
} from "@/types/settings.types";
import { checkExhaustive } from "@/utils/types";
import type { JournalPlugin } from "@/types/plugin.types";
import { ensureFolderExists } from "@/utils/io";
import { disconnectNote } from "@/utils/journals";

export function buildNotesList(plugin: JournalPlugin, folderPath = "/"): TFile[] {
  const folder = plugin.app.vault.getFolderByPath(folderPath || "/");
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

export function preprocessNotes(
  plugin: JournalPlugin,
  journal: Journal,
  notes: TFile[],
  parameters: BulkAddPrams,
): NoteDataForProcessing[] {
  const data: NoteDataForProcessing[] = [];
  const dateRegexp = formatToRegexp(parameters.date_format);
  for (const note of notes) {
    const noteData: NoteDataForProcessing = {
      file: note,
      operations: [],
    };
    data.push(noteData);
    const existing = plugin.index.getForPath(note.path);
    if (existing) {
      noteData.operations.push({
        type: "skiping",
        reason:
          journal.name === existing.journal ? "already in journal" : "already in another journal " + existing.journal,
      });
      continue;
    }
    if (!checkFilters(plugin, note, parameters.filter_combinator, parameters.filters)) {
      noteData.operations.push({
        type: "skiping",
        reason: "does not match filters",
      });
      continue;
    }
    const dateString: string | undefined =
      parameters.date_place === "title"
        ? note.basename
        : plugin.app.metadataCache.getFileCache(note)?.frontmatter?.[parameters.property_name];
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
        reason: "date with configured format not found",
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
        other_file: plugin.app.vault.getAbstractFileByPath(metadata.path) as TFile,
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
    if (configuredFilename !== note.name) {
      noteData.operations.push({
        type: "other_name",
        configured_name: configuredFilename,
        desision: parameters.other_name,
      });
    }
  }
  return data;
}

function checkFilters(
  plugin: JournalPlugin,
  note: TFile,
  combinator: BulkAddPrams["filter_combinator"],
  filters: BulkAddPrams["filters"],
) {
  if (combinator === "no") return true;
  if (combinator === "and") return filters.every((f) => checkFilter(plugin, note, f));
  if (combinator === "or") return filters.some((f) => checkFilter(plugin, note, f));
  return false;
}

function checkFilter(plugin: JournalPlugin, note: TFile, filter: GenericConditions) {
  const metadata = plugin.app.metadataCache.getFileCache(note);
  if (!metadata) return false;
  switch (filter.type) {
    case "title": {
      return checkNameFilter(note, filter);
    }
    case "tag": {
      return checkTagFilter(plugin, note, filter);
    }
    case "property": {
      return checkPropertyFilter(plugin, note, filter);
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

function checkTagFilter(plugin: JournalPlugin, note: TFile, filter: JournalDecorationTagCondition) {
  const metadata = plugin.app.metadataCache.getFileCache(note);
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

function checkPropertyFilter(plugin: JournalPlugin, note: TFile, filter: JournalDecorationPropertyCondition) {
  const metadata = plugin.app.metadataCache.getFileCache(note);
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

function skipNote(operation: SkippingNote, result: NoteProcessingResult) {
  result.actions.push(`Skipped: ${operation.reason}`);
}

async function connectNote(
  journal: Journal,
  noteData: NoteDataForProcessing,
  parameters: BulkAddPrams,
  operation: ConnectNote,
  result: NoteProcessingResult,
) {
  result.actions.push(`Note connected to journal as ${operation.anchor_date}`);
  if (!parameters.dry_run) {
    await journal.connectNote(noteData.file, operation.anchor_date, {});
  }
}

async function relateExistingNote(
  plugin: JournalPlugin,
  noteData: NoteDataForProcessing,
  parameters: BulkAddPrams,
  operation: RelateToExistingNote,
  result: NoteProcessingResult,
) {
  switch (operation.desision) {
    case "skip": {
      result.actions.push(`Skipped: other note connected to same date already exists in journal`);
      break;
    }
    case "override": {
      result.actions.push(`Other note "${operation.other_file.path}" connected to same date disconnected`);
      if (!parameters.dry_run) {
        await disconnectNote(plugin, noteData.file.path);
      }
      break;
    }
    case "merge": {
      result.actions.push(`Content of note was merged into "${operation.other_file.path}, note deleted"`);
      if (!parameters.dry_run) {
        const content = await plugin.app.vault.cachedRead(noteData.file);
        await plugin.app.vault.append(operation.other_file, content);
        await plugin.app.vault.delete(noteData.file);
      }
      break;
    }
  }
}

async function processDifferentFolder(
  plugin: JournalPlugin,
  noteData: NoteDataForProcessing,
  parameters: BulkAddPrams,
  operation: FolderDeifference,
  result: NoteProcessingResult,
) {
  switch (operation.desision) {
    case "keep": {
      result.actions.push(
        `Notes folder "${noteData.file.parent?.path ?? "/"}" differs from configured folder "${parameters.folder || "/"}" - keeping as is`,
      );
      break;
    }
    case "move": {
      result.actions.push(`Moved note to "${operation.configured_folder ?? "/"}"`);
      if (!parameters.dry_run) {
        const filename = noteData.file.name;
        const path = normalizePath(
          operation.configured_folder ? `${operation.configured_folder}/${filename}` : filename,
        );
        await ensureFolderExists(plugin.app, path);
        await plugin.app.vault.rename(noteData.file, path);
        noteData.file = plugin.app.vault.getAbstractFileByPath(path) as TFile;
      }
      break;
    }
  }
}

async function processDifferentName(
  plugin: JournalPlugin,
  noteData: NoteDataForProcessing,
  parameters: BulkAddPrams,
  operation: NameDifference,
  result: NoteProcessingResult,
) {
  switch (operation.desision) {
    case "keep": {
      result.actions.push(
        `Note name "${noteData.file.basename}" differs from configured name "${parameters.property_name}" - keeping as is`,
      );
      break;
    }
    case "rename": {
      result.actions.push(`Renamed note to "${operation.configured_name}"`);
      if (!parameters.dry_run) {
        const folder = noteData.file.parent?.path;
        const path = normalizePath(folder ? `${folder}/${operation.configured_name}` : operation.configured_name);
        await ensureFolderExists(plugin.app, path);
        await plugin.app.vault.rename(noteData.file, path);
        noteData.file = plugin.app.vault.getAbstractFileByPath(path) as TFile;
      }
      break;
    }
  }
}

export async function processNote(
  plugin: JournalPlugin,
  journal: Journal,
  noteData: NoteDataForProcessing,
  parameters: BulkAddPrams,
): Promise<NoteProcessingResult> {
  const { file, operations } = noteData;
  const result: NoteProcessingResult = {
    note: file.basename,
    folder: file.parent?.path ?? "",
    path: file.path,
    actions: [],
  };
  try {
    for (const op of operations) {
      switch (op.type) {
        case "skiping": {
          skipNote(op, result);
          break;
        }
        case "connect": {
          await connectNote(journal, noteData, parameters, op, result);
          break;
        }
        case "existing_note": {
          await relateExistingNote(plugin, noteData, parameters, op, result);
          return result;
        }
        case "other_folder": {
          await processDifferentFolder(plugin, noteData, parameters, op, result);
          break;
        }
        case "other_name": {
          await processDifferentName(plugin, noteData, parameters, op, result);
          break;
        }
      }
    }
  } catch (error) {
    console.error(error);
    result.actions.push(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }
  return result;
}
