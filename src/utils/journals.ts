import {
  FRONTMATTER_NAME_KEY,
  FRONTMATTER_DATE_KEY,
  FRONTMATTER_END_DATE_KEY,
  FRONTMATTER_INDEX_KEY,
  FRONTMATTER_START_DATE_KEY,
} from "@/constants";
import type { JournalPlugin } from "@/types/plugin.types";
import type { OpenMode } from "@/types/settings.types";
import { Keymap, TFile } from "obsidian";

export async function disconnectNote(plugin: JournalPlugin, path: string): Promise<void> {
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (!file) return;
  if (!(file instanceof TFile)) return;
  await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
    const journalName = frontmatter[FRONTMATTER_NAME_KEY];
    const journal = plugin.getJournal(journalName);
    delete frontmatter[FRONTMATTER_NAME_KEY];
    if (journal) {
      delete frontmatter[journal.frontmatterDate];
      delete frontmatter[journal.frontmatterStartDate];
      delete frontmatter[journal.frontmatterEndDate];
      delete frontmatter[journal.frontmatterIndex];
    } else {
      delete frontmatter[FRONTMATTER_DATE_KEY];
      delete frontmatter[FRONTMATTER_START_DATE_KEY];
      delete frontmatter[FRONTMATTER_END_DATE_KEY];
      delete frontmatter[FRONTMATTER_INDEX_KEY];
    }
    // TODO remove when issue is fixed
    // if (Object.keys(frontmatter).length === 0) {
    //   frontmatter[" "] = "";
    // }
  });
}

export function defineOpenMode(event: MouseEvent): OpenMode {
  if (Keymap.isModifier(event, "Mod") || event.button === 1) return "tab";
  return "active";
}
