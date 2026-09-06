import { m } from "@/i18n";
import type { JournalWrite } from "@/journals";

import type { CommandContext, CommandTarget, CommandType } from "../config";

/**
 * A notelet command always creates a note of its type for the resolved period, so it reads
 * nothing like the period-note commands the same dropdown and list row show elsewhere.
 */
export function commandTypeLabel(
  target: CommandTarget,
  writeType: JournalWrite["type"],
  type: CommandType,
  context: CommandContext,
): string {
  return target.kind === "notelet" ? noteletLabel(writeType, type, context) : periodNoteLabel(writeType, type, context);
}

function periodNoteLabel(writeType: JournalWrite["type"], type: CommandType, context: CommandContext): string {
  if (writeType === "day") {
    if (type === "same") return m.command_label_today();
    if (type === "next" && context === "today") return m.command_label_tomorrow();
    if (type === "previous" && context === "today") return m.command_label_yesterday();
  }
  return m.command_type_label({ type, writeType });
}

function noteletLabel(writeType: JournalWrite["type"], type: CommandType, context: CommandContext): string {
  if (writeType === "day") {
    if (type === "same") return m.command_notelet_label_today();
    if (type === "next" && context === "today") return m.command_notelet_label_tomorrow();
    if (type === "previous" && context === "today") return m.command_notelet_label_yesterday();
  }
  return m.command_notelet_type_label({ type, writeType });
}

export function commandContextLabel(context: CommandContext): string | null {
  if (context === "open_note") return m.command_context_open_note_clarifier();
  if (context === "only_open_note") return m.command_context_only_open_note_clarifier();
  return null;
}
