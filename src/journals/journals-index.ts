import { Component, type TAbstractFile, TFile, type FrontMatterCache } from "obsidian";
import { app$ } from "../stores/obsidian.store";
import { computed, ref, type ComputedRef } from "vue";
import type { JournalAnchorDate, JournalMetadata } from "../types/journal.types";
import {
  FRONTMATTER_END_DATE_KEY,
  FRONTMATTER_NAME_KEY,
  FRONTMATTER_INDEX_KEY,
  FRONTMATTER_DATE_KEY,
} from "../constants";
import { date_from_string } from "../calendar";
import { JournalIndex } from "./journal-index";

export class JournalsIndex extends Component {
  #pathIndex = ref(new Map<string, JournalMetadata>());
  #pathComputeds = new Map<string, ComputedRef<JournalMetadata | null>>();
  #journalIndecies = new Map<string, JournalIndex>();

  constructor() {
    super();
    this.#setupListeners();
  }

  getForPath(path: string): JournalMetadata | null {
    return this.#pathIndex.value.get(path) ?? null;
  }

  getForPathComputed(path: string) {
    let cmp = this.#pathComputeds.get(path);
    if (cmp) return cmp;
    cmp = computed(() => this.#pathIndex.value.get(path) ?? null);
    this.#pathComputeds.set(path, cmp);
    return cmp;
  }

  find(journalId: string, date: JournalAnchorDate): JournalMetadata | null {
    const path = this.#getJournalIndex(journalId).get(date);
    if (!path) return null;
    return this.getForPath(path);
  }

  findNext(journalId: string, anchorDate: JournalAnchorDate): JournalMetadata | null {
    const path = this.#getJournalIndex(journalId).findNext(anchorDate);
    if (!path) return null;
    return this.getForPath(path);
  }

  findPrevious(journalId: string, anchorDate: JournalAnchorDate): JournalMetadata | null {
    const path = this.#getJournalIndex(journalId).findPrevious(anchorDate);
    if (!path) return null;
    return this.getForPath(path);
  }

  async renameJournal(oldName: string, name: string): Promise<void> {
    const index = this.#getJournalIndex(oldName);
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

  #getJournalIndex(journalId: string) {
    let index = this.#journalIndecies.get(journalId);
    if (!index) {
      index = new JournalIndex();
      this.#journalIndecies.set(journalId, index);
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
        const index = this.#journalIndecies.get(metadata.name);
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
      this.#journalIndecies.get(metadata.name)?.delete(metadata.date);
    }
  };

  #onMetadataChanged = (file: TFile) => {
    const metadata = app$.value.metadataCache.getFileCache(file);
    if (!metadata) return;
    const { frontmatter } = metadata;
    if (!frontmatter) return;
    this.#processFrontmatter(file.path, frontmatter);
  };

  #processFrontmatter(path: string, frontmatter: FrontMatterCache): void {
    if (!(FRONTMATTER_NAME_KEY in frontmatter)) return;
    const date = frontmatter[FRONTMATTER_DATE_KEY];
    const end_date = frontmatter[FRONTMATTER_END_DATE_KEY];
    if (!date_from_string(date).isValid() || (end_date && !date_from_string(end_date).isValid())) return;
    const name = frontmatter[FRONTMATTER_NAME_KEY];
    const journalMetadata: JournalMetadata = {
      name,
      date,
      end_date,
      path,
      index: frontmatter[FRONTMATTER_INDEX_KEY],
    };
    this.#pathIndex.value.set(path, journalMetadata);
    this.#getJournalIndex(name).set(date, path);
  }

  onunload(): void {
    this.#pathIndex.value.clear();
    this.#pathComputeds.clear();
    this.#journalIndecies.clear();
  }
}
