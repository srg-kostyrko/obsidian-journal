import { variableNames } from "@/templates";

import { promptsInTemplate } from "../../prompts/prompts-in-path";

import type { JournalConfig } from "../../config";
import type { NoteletType } from "../../notelets/config";

// The clock-kind variables NotePathService.periodContextFor registers alongside every other
// spec; both read the render moment rather than anything constant across a period.
const CLOCK_VARIABLES: ReadonlySet<string> = new Set(["time", "current_time"]);

/**
 * True when the type's name template has nothing that can distinguish two notelets of this
 * type created in the same period: no clock token, no `{{notelet_index}}`, and none of the
 * type's own prompts. Everything else in the render context (the date, the journal name, the
 * journal's numbering digits, the journal's own questions) is constant across a period.
 */
export function hasNoWithinPeriodVariable(type: Pick<NoteletType, "nameTemplate" | "prompts">): boolean {
  const names = new Set([...variableNames(type.nameTemplate)].map((name) => name.toLowerCase()));
  if (names.has("notelet_index")) return false;
  if ([...names].some((name) => CLOCK_VARIABLES.has(name))) return false;
  return promptsInTemplate(type.nameTemplate, type.prompts).length === 0;
}

/**
 * True when the type's own note path resolves onto the journal's period-note path, using the
 * same structural key `findCollidingJournals` compares: the name template with
 * `{{journal_name}}` substituted, plus the folder. A type has no `dateFormat` of its own — it
 * inherits the journal's — so that component of the key always matches and is not compared.
 *
 * Advisory only: `NoteletPathService.availablePathFor` already reserves the journal's derived
 * period-note path unconditionally, so a match here is guidance, not a live path conflict.
 */
export function rendersOntoPeriodNotePath(
  journal: Pick<JournalConfig, "name" | "nameTemplate" | "folder" | "dateFormat">,
  type: Pick<NoteletType, "nameTemplate" | "folder">,
): boolean {
  const journalKey = journal.nameTemplate.replaceAll("{{journal_name}}", () => journal.name);
  const typeKey = type.nameTemplate.replaceAll("{{journal_name}}", () => journal.name);
  return typeKey === journalKey && type.folder === journal.folder;
}
