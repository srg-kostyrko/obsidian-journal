import { Component, type TAbstractFile, TFile, type CachedMetadata } from "obsidian";
import { app$ } from "../stores/obsidian.store";
import { computed, ref, shallowRef, type ComputedRef } from "vue";
import type { JournalAnchorDate, JournalNoteData } from "../types/journal.types";
import {
  FRONTMATTER_END_DATE_KEY,
  FRONTMATTER_NAME_KEY,
  FRONTMATTER_INDEX_KEY,
  FRONTMATTER_DATE_KEY,
} from "../constants";
import { date_from_string } from "../calendar";
import { JournalIndex } from "./journal-index";

export class JournalsIndex extends Component {
  #pathIndex = ref(new Map<string, JournalNoteData>());
  #pathComputeds = new Map<string, ComputedRef<JournalNoteData | null>>();
  #journalIndecies = shallowRef(new Map<string, JournalIndex>());

  constructor() {
    super();
    this.#setupListeners();
  }

  getForPath(path: string): JournalNoteData | null {
    return this.#pathIndex.value.get(path) ?? null;
  }

  getForPathComputed(path: string) {
    let cmp = this.#pathComputeds.get(path);
    if (cmp) return cmp;
    cmp = computed(() => this.#pathIndex.value.get(path) ?? null);
    this.#pathComputeds.set(path, cmp);
    return cmp;
  }

  get(journalId: string, date: JournalAnchorDate): JournalNoteData | null {
    const path = this.getJournalIndex(journalId).get(date);
    if (!path) return null;
    return this.getForPath(path);
  }

  findNext(journalId: string, anchorDate: JournalAnchorDate): JournalNoteData | null {
    const path = this.getJournalIndex(journalId).findNext(anchorDate);
    if (!path) return null;
    return this.getForPath(path);
  }

  findPrevious(journalId: string, anchorDate: JournalAnchorDate): JournalNoteData | null {
    const path = this.getJournalIndex(journalId).findPrevious(anchorDate);
    if (!path) return null;
    return this.getForPath(path);
  }

  async renameJournal(oldName: string, name: string): Promise<void> {
    const index = this.getJournalIndex(oldName);
    if (!index) return;
    for (const [, path] of index) {
      const file = app$.value.vault.getAbstractFileByPath(path);
      if (!file) continue;
      if (!(file instanceof TFile)) continue;
      await app$.value.fileManager.processFrontMatter(file, (frontmatter) => {
        frontmatter[FRONTMATTER_NAME_KEY] = name;
      });
    }
  }

  async reindex(): Promise<void> {
    const files = app$.value.vault.getMarkdownFiles();
    for (const file of files) {
      this.#onMetadataChanged(file);
    }
  }

  getJournalIndex(journalId: string) {
    let index = this.#journalIndecies.value.get(journalId);
    if (!index) {
      index = new JournalIndex();
      this.#journalIndecies.value.set(journalId, index);
    }
    return index;
  }

  #setupListeners() {
    this.registerEvent(app$.value.vault.on("rename", this.#onRenamed, this));
    this.registerEvent(app$.value.vault.on("delete", this.#onDeleted, this));
    this.registerEvent(app$.value.metadataCache.on("changed", this.#onMetadataChanged, this));
  }

  #onRenamed = (file: TAbstractFile, oldPath: string) => {
    if (file instanceof TFile) {
      const metadata = this.#pathIndex.value.get(oldPath);
      if (metadata) {
        this.#pathIndex.value.delete(oldPath);
        metadata.path = file.path;
        this.#pathIndex.value.set(file.path, metadata);
        const index = this.#journalIndecies.value.get(metadata.journal);
        if (!index) return;
        index.deleteForPath(oldPath);
        index.set(metadata.date, file.path);
      }
    }
  };

  #onDeleted = (file: TAbstractFile) => {
    if (file instanceof TFile) {
      const metadata = this.#pathIndex.value.get(file.path);
      if (!metadata) return;
      this.#pathIndex.value.delete(file.path);
      this.#pathComputeds.delete(file.path);
      this.#journalIndecies.value.get(metadata.journal)?.delete(metadata.date);
    }
  };

  #onMetadataChanged = (file: TFile) => {
    const metadata = app$.value.metadataCache.getFileCache(file);
    if (!metadata) return;
    this.#processMetadata(file.basename, file.path, metadata);
  };

  #processMetadata(title: string, path: string, metadata: CachedMetadata): void {
    const { frontmatter } = metadata;
    if (!frontmatter) return;
    if (!(FRONTMATTER_NAME_KEY in frontmatter)) return;
    const date = frontmatter[FRONTMATTER_DATE_KEY];
    const end_date = frontmatter[FRONTMATTER_END_DATE_KEY];
    if (!date_from_string(date).isValid() || (end_date && !date_from_string(end_date).isValid())) return;
    const journal = frontmatter[FRONTMATTER_NAME_KEY];
    const journalMetadata: JournalNoteData = {
      title,
      journal,
      date,
      end_date,
      path,
      index: frontmatter[FRONTMATTER_INDEX_KEY],
      tags: metadata.tags?.map((tag) => tag.tag) ?? [],
      tasks:
        metadata.listItems
          ?.filter((item) => item.task != undefined)
          .map((item) => ({
            completed: item.task !== " ",
          })) ?? [],
      properties: frontmatter,
    };
    this.#pathIndex.value.set(path, journalMetadata);
    this.getJournalIndex(journal).set(date, path);
  }

  onunload(): void {
    this.#pathIndex.value.clear();
    this.#pathComputeds.clear();
    this.#journalIndecies.value.clear();
  }
}
