import { Menu } from "obsidian";
import { app$, plugin$ } from "@/stores/obsidian.store";
import { JournalSuggestModal } from "@/components/suggests/journal-suggest";

export async function openDate(date: string, journals: string[], event?: MouseEvent): Promise<void> {
  if (journals.length === 0) return;
  if (journals.length === 1) {
    const [name] = journals;
    await openDateInJournal(date, name);
    return;
  }

  if (event) {
    const menu = new Menu();
    for (const journal of journals) {
      menu.addItem((item) => {
        item.setTitle(journal).onClick(() => {
          openDateInJournal(date, journal).catch(console.error);
        });
      });
    }
    menu.showAtMouseEvent(event);
  } else {
    new JournalSuggestModal(app$.value, journals, (journalId) => {
      openDateInJournal(date, journalId).catch(console.error);
    }).open();
  }
}

export async function openDateInJournal(date: string, journalName: string): Promise<void> {
  const journal = plugin$.value.getJournal(journalName);
  if (!journal) return;
  const metadata = await journal.get(date);
  if (!metadata) return;
  await journal.open(metadata);
}
