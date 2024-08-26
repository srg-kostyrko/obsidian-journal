import { Component, type TAbstractFile, TFile, moment, type FrontMatterCache } from "obsidian";
import { app$ } from "../stores/obsidian.store";
import { computed, ref, type ComputedRef } from "vue";
import IntervalTree from "@flatten-js/interval-tree";
import type { JournalInterval, JournalMetadata } from "../types/journal.types";
import {
  FRONTMATTER_END_DATE_KEY,
  FRONTMATTER_ID_KEY,
  FRONTMATTER_INDEX_KEY,
  FRONTMATTER_START_DATE_KEY,
} from "../constants";

export class JournalsIndex extends Component {
  #pathIndex = ref(new Map<string, JournalMetadata>());
  #pathComputeds = new Map<string, ComputedRef<JournalMetadata | null>>();
  #intervalTree = new IntervalTree<JournalMetadata>();

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

  find(journalId: string, date: string): JournalMetadata | null {
    const time = moment(date).toDate().getTime();
    const list = this.#intervalTree.search([time, time]);
    return list.find((entry) => entry.id === journalId);
  }

  findNext(journalId: string, metadata: JournalInterval): JournalMetadata | null {
    const date = moment(metadata.end_date).add(1, "day").toDate().getTime();
    const list = this.#intervalTree.search([date, Infinity]);
    return list.find((entry) => entry.id === journalId);
  }

  findPrevious(journalId: string, metadata: JournalInterval): JournalMetadata | null {
    const date = moment(metadata.start_date).subtract(1, "day").toDate().getTime();
    const list = this.#intervalTree.search([0, date]);
    return list.findLast((entry) => entry.id === journalId);
  }

  async reindex(): Promise<void> {
    const files = app$.value.vault.getMarkdownFiles();
    for (const file of files) {
      this.#onMetadataChanged(file);
    }
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
      }
    }
  };

  #onDeleted = (file: TAbstractFile) => {
    if (file instanceof TFile) {
      this.#pathIndex.value.delete(file.path);
      this.#pathComputeds.delete(file.path);
      const toDelete = [];
      for (const [key, entry] of this.#intervalTree.iterate(undefined, (value, key) => [key, value])) {
        if (entry?.path === file.path) {
          toDelete.push([key, entry]);
        }
      }
      for (const [key, entry] of toDelete) {
        this.#intervalTree.remove(key, entry);
      }
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
    if (!(FRONTMATTER_ID_KEY in frontmatter)) return;
    const start_date = frontmatter[FRONTMATTER_START_DATE_KEY];
    const end_date = frontmatter[FRONTMATTER_END_DATE_KEY];
    if (!moment(start_date).isValid() || !moment(end_date).isValid()) return;
    const journalMetadata: JournalMetadata = {
      id: frontmatter[FRONTMATTER_ID_KEY],
      start_date,
      end_date,
      path,
      index: frontmatter[FRONTMATTER_INDEX_KEY],
    };
    this.#pathIndex.value.set(path, journalMetadata);
    this.#intervalTree.insert(
      [moment(start_date).startOf("day").toDate().getTime(), moment(end_date).endOf("day").toDate().getTime()],
      journalMetadata,
    );
  }

  onunload(): void {
    this.#intervalTree.clear();
    this.#pathIndex.value.clear();
    this.#pathComputeds.clear();
  }
}
