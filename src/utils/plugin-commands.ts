import { today } from "@/calendar";
import { JournalSuggestModal } from "@/components/suggests/journal-suggest";
import { FRONTMATTER_DATE_FORMAT } from "@/constants";
import type { Journal } from "@/journals/journal";
import { openDateInJournal } from "@/journals/open-date";
import type { JournalMetadata, JournalNoteData } from "@/types/journal.types";
import type { JournalPlugin } from "@/types/plugin.types";
import type { PluginCommand } from "@/types/settings.types";

export function resolveDateInJournal(journal: Journal, type: PluginCommand["type"]): string | null {
  let metadata: JournalNoteData | JournalMetadata | null = null;
  const date = today().format(FRONTMATTER_DATE_FORMAT);
  switch (type) {
    case "same": {
      metadata = journal.get(date);
      break;
    }
    case "next": {
      metadata = journal.next(date);
      break;
    }
    case "previous": {
      metadata = journal.previous(date);
      break;
    }
  }

  return metadata?.date ?? null;
}

export function registerPluginCommand(
  plugin: JournalPlugin,
  command: PluginCommand,
  prefix: string,
  journalsQuery: () => Journal[],
): void {
  plugin.appManager.addCommand(prefix, command, (checking) => {
    const journals = journalsQuery().filter((journal) => resolveDateInJournal(journal, command.type) !== null);

    if (checking) {
      return journals.length > 0;
    }
    if (journals.length === 1) {
      const [journal] = journals;
      const date = resolveDateInJournal(journal, command.type);
      if (!date) return false;
      openDateInJournal(plugin, date, journal.name, command.openMode).catch(console.error);
    } else {
      new JournalSuggestModal(
        plugin.app,
        journals.map((journal) => journal.name),
        (journalName) => {
          const journal = plugin.getJournal(journalName);
          if (!journal) return;
          const date = resolveDateInJournal(journal, command.type);
          if (!date) return;
          openDateInJournal(plugin, date, journalName, command.openMode).catch(console.error);
        },
      ).open();
    }
    return true;
  });
}

export function unregisterPluginCommand(plugin: JournalPlugin, command: PluginCommand, prefix: string): void {
  plugin.appManager.removeCommand(prefix, command);
  plugin.appManager.removeRibbonIcon(prefix, command.name);
}
