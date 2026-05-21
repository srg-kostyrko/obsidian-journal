import { m } from "@/i18n";
import type { JournalWrite } from "@/journals";

import type { CommandContext, CommandType } from "../config";

export function commandTypeLabel(writeType: JournalWrite["type"], type: CommandType, context: CommandContext): string {
  if (writeType === "day") {
    if (type === "same") return m.command_label_today();
    if (type === "next" && context === "today") return m.command_label_tomorrow();
    if (type === "previous" && context === "today") return m.command_label_yesterday();
  }
  return m.command_type_label({ type, writeType });
}
