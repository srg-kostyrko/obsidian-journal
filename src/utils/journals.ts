import {
  FRONTMATTER_NAME_KEY,
  FRONTMATTER_DATE_KEY,
  FRONTMATTER_END_DATE_KEY,
  FRONTMATTER_INDEX_KEY,
} from "@/constants";
import { app$ } from "@/stores/obsidian.store";
import { TFile } from "obsidian";

export async function disconnectNote(path: string): Promise<void> {
  const file = app$.value.vault.getAbstractFileByPath(path);
  if (!file) return;
  if (!(file instanceof TFile)) return;
  await app$.value.fileManager.processFrontMatter(file, (frontmatter) => {
    delete frontmatter[FRONTMATTER_NAME_KEY];
    delete frontmatter[FRONTMATTER_DATE_KEY];
    delete frontmatter[FRONTMATTER_END_DATE_KEY];
    delete frontmatter[FRONTMATTER_INDEX_KEY];
    // TODO remove when issue is fixed
    if (Object.keys(frontmatter).length === 0) {
      frontmatter[" "] = "";
    }
  });
}
