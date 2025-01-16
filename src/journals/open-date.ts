import { Menu } from "obsidian";
import { JournalSuggestModal } from "@/components/suggests/journal-suggest";
import type { JournalPlugin } from "@/types/plugin.types";
import type { OpenMode } from "@/types/settings.types";

export async function openDate(
  plugin: JournalPlugin,
  date: string,
  journals: string[],
  openMode?: OpenMode,
  event?: MouseEvent,
): Promise<void> {
  if (journals.length === 0) return;
  if (journals.length === 1) {
    const [name] = journals;
    await openDateInJournal(plugin, date, name, openMode);
    return;
  }

  if (event) {
    const menu = new Menu();
    for (const journal of journals) {
      menu.addItem((item) => {
        item.setTitle(journal).onClick(() => {
          openDateInJournal(plugin, date, journal, openMode).catch(console.error);
        });
      });
    }
    menu.showAtMouseEvent(event);
  } else {
    new JournalSuggestModal(plugin.app, journals, (journalId) => {
      openDateInJournal(plugin, date, journalId, openMode).catch(console.error);
    }).open();
  }
}

export async function openDateInJournal(
  plugin: JournalPlugin,
  date: string,
  journalName: string,
  openMode?: OpenMode,
): Promise<void> {
  const journal = plugin.getJournal(journalName);
  if (!journal) return;
  const metadata = journal.get(date);
  if (!metadata) return;
  await journal.open(metadata, openMode);
}
