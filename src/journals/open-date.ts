import { Menu } from "obsidian";
import { JournalSuggestModal } from "@/components/suggests/journal-suggest";
import type { JournalPlugin } from "@/types/plugin.types";
import type { OpenMode } from "@/types/settings.types";

export async function openDate(
  plugin: JournalPlugin,
  date: string,
  journals: string[],
  existing = false,
  openMode?: OpenMode,
  event?: MouseEvent,
): Promise<void> {
  const applicableJournals = journals.filter((journalName) => {
    const journal = plugin.getJournal(journalName);
    if (!journal) return false;
    const metadata = journal.get(date);
    if (!metadata) return false;
    if (existing && !("path" in metadata)) return false;
    return true;
  });

  if (applicableJournals.length === 0) return;
  if (applicableJournals.length === 1) {
    const [name] = applicableJournals;
    await openDateInJournal(plugin, date, name, openMode);
    return;
  }

  if (event) {
    const menu = new Menu();
    for (const journal of applicableJournals) {
      menu.addItem((item) => {
        item.setTitle(journal).onClick(() => {
          openDateInJournal(plugin, date, journal, openMode).catch(console.error);
        });
      });
    }
    menu.showAtMouseEvent(event);
  } else {
    new JournalSuggestModal(plugin.app, applicableJournals, (journalId) => {
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
