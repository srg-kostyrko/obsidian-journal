import { Menu } from "obsidian";
import { app$, plugin$ } from "@/stores/obsidian.store";
import { JournalSuggestModal } from "@/components/suggests/journal-suggest";

export async function openDate(
  date: string,
  journals: { id: string; name: string }[],
  event?: MouseEvent,
): Promise<void> {
  if (!journals.length) return;
  if (journals.length === 1) {
    const [{ id }] = journals;
    await openDateInJournal(date, id);
    return;
  }

  if (event) {
    const menu = new Menu();
    for (const journal of journals) {
      menu.addItem((item) => {
        item.setTitle(journal.name).onClick(() => {
          openDateInJournal(date, journal.id);
        });
      });
    }
    menu.showAtMouseEvent(event);
  } else {
    new JournalSuggestModal(app$.value, journals, (journalId) => openDateInJournal(date, journalId)).open();
  }
}

export async function openDateInJournal(date: string, journalId: string): Promise<void> {
  const journal = plugin$.value.getJournal(journalId);
  if (!journal) return;
  const metadata = await journal.find(date);
  if (!metadata) return;
  await journal.open(metadata);
}
