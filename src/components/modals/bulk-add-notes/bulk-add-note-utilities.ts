import { normalizePath } from "obsidian";
import type {
  BulkAddPrams,
  ConnectNote,
  FolderDifference,
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

export function preprocessNotes(
  plugin: JournalPlugin,
  journal: Journal,
  notes: string[],
  parameters: BulkAddPrams,
): NoteDataForProcessing[] {
  const data: NoteDataForProcessing[] = [];
  const dateRegexp = formatToRegexp(parameters.date_format);
  for (const path of notes) {
    const noteData: NoteDataForProcessing = {
      path,
      operations: [],
    };
    data.push(noteData);
    const existing = plugin.index.getForPath(path);
    if (existing) {
      noteData.operations.push({
        type: "skipping",
        reason:
          journal.name === existing.journal ? "already in journal" : "already in another journal " + existing.journal,
      });
      continue;
    }
    if (!checkFilters(plugin, path, parameters.filter_combinator, parameters.filters)) {
      noteData.operations.push({
        type: "skipping",
        reason: "does not match filters",
      });
      continue;
    }
    const dateString: string | undefined =
      parameters.date_place === "title"
        ? plugin.notesManager.getNoteName(path)
        : plugin.notesManager.getNoteMetadata(path)?.frontmatter?.[parameters.property_name];
    if (dateString === undefined) {
      noteData.operations.push({
        type: "skipping",
        reason: "does not have date containing property " + parameters.property_name,
      });
      continue;
    }
    const match = dateString.match(dateRegexp);
    if (!match) {
      noteData.operations.push({
        type: "skipping",
        reason: "date with configured format not found",
      });
      continue;
    }
    const date = date_from_string(match[0], parameters.date_format);
    if (!date.isValid()) {
      noteData.operations.push({
        type: "skipping",
        reason: "invalid date " + dateString,
      });
      continue;
    }
    const metadata = journal.get(date.format("YYYY-MM-DD"));
    if (!metadata) {
      noteData.operations.push({
        type: "skipping",
        reason: "date is outside of journal boundaries " + date.format("YYYY-MM-DD"),
      });
      continue;
    }
    if ("path" in metadata && metadata.path) {
      noteData.operations.push({
        type: "existing_note",
        other_file: metadata.path,
        decision: parameters.existing_note,
      });
    }
    const [configuredFolder, configuredFilename] = journal.getConfiguredPathData(metadata);
    if (configuredFolder !== plugin.notesManager.getNoteFolder(path)) {
      noteData.operations.push({
        type: "other_folder",
        configured_folder: configuredFolder,
        decision: parameters.other_folder,
      });
    }
    if (configuredFilename !== plugin.notesManager.getNoteFilename(path)) {
      noteData.operations.push({
        type: "other_name",
        configured_name: configuredFilename,
        decision: parameters.other_name,
      });
    }
    noteData.operations.push({
      type: "connect",
      anchor_date: metadata.date,
    });
  }
  return data;
}

function checkFilters(
  plugin: JournalPlugin,
  path: string,
  combinator: BulkAddPrams["filter_combinator"],
  filters: BulkAddPrams["filters"],
) {
  if (combinator === "no") return true;
  if (combinator === "and") return filters.every((f) => checkFilter(plugin, path, f));
  if (combinator === "or") return filters.some((f) => checkFilter(plugin, path, f));
  return false;
}

function checkFilter(plugin: JournalPlugin, path: string, filter: GenericConditions) {
  const metadata = plugin.notesManager.getNoteMetadata(path);
  if (!metadata) return false;
  switch (filter.type) {
    case "title": {
      return checkNameFilter(plugin, path, filter);
    }
    case "tag": {
      return checkTagFilter(plugin, path, filter);
    }
    case "property": {
      return checkPropertyFilter(plugin, path, filter);
    }
  }
  return true;
}

function checkNameFilter(plugin: JournalPlugin, path: string, filter: JournalDecorationTitleCondition) {
  const name = plugin.notesManager.getNoteName(path);
  switch (filter.condition) {
    case "contains": {
      return name.contains(filter.value);
    }
    case "starts-with": {
      return name.startsWith(filter.value);
    }
    case "ends-with": {
      return name.endsWith(filter.value);
    }
    default: {
      checkExhaustive(filter.condition);
    }
  }
}

function checkTagFilter(plugin: JournalPlugin, path: string, filter: JournalDecorationTagCondition) {
  const metadata = plugin.notesManager.getNoteMetadata(path);
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

function checkPropertyFilter(plugin: JournalPlugin, path: string, filter: JournalDecorationPropertyCondition) {
  const metadata = plugin.notesManager.getNoteMetadata(path);
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
  result.actions.push(`Note connected to journal at ${operation.anchor_date}`);
  if (!parameters.dry_run) {
    await journal.connectNote(noteData.path, operation.anchor_date, {});
  }
}

async function relateExistingNote(
  plugin: JournalPlugin,
  noteData: NoteDataForProcessing,
  parameters: BulkAddPrams,
  operation: RelateToExistingNote,
  result: NoteProcessingResult,
) {
  switch (operation.decision) {
    case "skip": {
      result.actions.push(`Skipped: other note connected to same date already exists in journal`);
      break;
    }
    case "override": {
      result.actions.push(`Other note "${operation.other_file}" connected to same date disconnected`);
      if (!parameters.dry_run) {
        await plugin.disconnectNote(noteData.path);
      }
      break;
    }
    case "merge": {
      result.actions.push(`Content of note was merged into "${operation.other_file}, note deleted"`);
      if (!parameters.dry_run) {
        const content = await plugin.notesManager.getNoteContent(noteData.path);
        await plugin.notesManager.appendNote(operation.other_file, content);
        await plugin.notesManager.deleteNote(noteData.path);
      }
      break;
    }
  }
}

async function processDifferentFolder(
  plugin: JournalPlugin,
  noteData: NoteDataForProcessing,
  parameters: BulkAddPrams,
  operation: FolderDifference,
  result: NoteProcessingResult,
) {
  switch (operation.decision) {
    case "keep": {
      result.actions.push(
        `Notes folder "${plugin.notesManager.getNoteFolder(noteData.path) ?? "/"}" differs from configured folder "${operation.configured_folder ?? "/"}" - keeping as is`,
      );
      break;
    }
    case "move": {
      result.actions.push(`Moved note to "${operation.configured_folder ?? "/"}"`);
      if (!parameters.dry_run) {
        const filename = plugin.notesManager.getNoteFilename(noteData.path);
        const path = normalizePath(
          operation.configured_folder ? `${operation.configured_folder}/${filename}` : filename,
        );
        await plugin.notesManager.renameNote(noteData.path, path);
        noteData.path = path;
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
  switch (operation.decision) {
    case "keep": {
      result.actions.push(
        `Note name "${plugin.notesManager.getNoteName(noteData.path)}" differs from configured name "${operation.configured_name}" - keeping as is`,
      );
      break;
    }
    case "rename": {
      result.actions.push(`Renamed note to "${operation.configured_name}"`);
      if (!parameters.dry_run) {
        const folder = plugin.notesManager.getNoteFolder(noteData.path);
        const path = normalizePath(folder ? `${folder}/${operation.configured_name}` : operation.configured_name);
        await plugin.notesManager.renameNote(noteData.path, path);
        noteData.path = path;
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
  const { path, operations } = noteData;
  const result: NoteProcessingResult = {
    note: plugin.notesManager.getNoteFilename(path),
    folder: plugin.notesManager.getNoteFolder(path),
    path,
    actions: [],
  };
  try {
    for (const op of operations) {
      switch (op.type) {
        case "skipping": {
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
