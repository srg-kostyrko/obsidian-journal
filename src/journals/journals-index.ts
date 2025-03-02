import { type CachedMetadata } from "obsidian";
import { computed, ref, shallowRef, type ComputedRef } from "vue";
import type { JournalAnchorDate, JournalNoteData } from "../types/journal.types";
import { FRONTMATTER_NAME_KEY } from "../constants";
import { date_from_string } from "../calendar";
import { JournalIndex } from "./journal-index";
import type { Journal } from "./journal";

export class JournalsIndex {
  #pathIndex = ref(new Map<string, JournalNoteData>());
  #pathComputedRefs = new Map<string, ComputedRef<JournalNoteData | null>>();
  #journalIndices = shallowRef(new Map<string, JournalIndex>());

  getForPath(path: string): JournalNoteData | null {
    return this.#pathIndex.value.get(path) ?? null;
  }

  getForPathComputed(path: string) {
    let cmp = this.#pathComputedRefs.get(path);
    if (cmp) return cmp;
    cmp = computed(() => this.#pathIndex.value.get(path) ?? null);
    this.#pathComputedRefs.set(path, cmp);
    return cmp;
  }

  get(journalId: string, date: JournalAnchorDate): JournalNoteData | null {
    const path = this.getJournalIndex(journalId).get(date);
    if (!path) return null;
    return this.getForPath(path);
  }

  getAllPaths(journalId: string): string[] {
    return this.getJournalIndex(journalId).getAll();
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

  getJournalIndex(journalId: string) {
    let index = this.#journalIndices.value.get(journalId);
    if (!index) {
      index = new JournalIndex();
      this.#journalIndices.value.set(journalId, index);
    }
    return index;
  }

  registerPathData(path: string, data: JournalNoteData): void {
    this.#pathIndex.value.set(path, data);
    this.getJournalIndex(data.journal).set(data.date, path);
  }

  unregisterPathData(path: string): void {
    const data = this.#pathIndex.value.get(path);
    this.#pathIndex.value.delete(path);
    if (data) {
      this.getJournalIndex(data.journal).delete(data.date);
    }
  }

  clearForPath(path: string): void {
    const metadata = this.#pathIndex.value.get(path);
    if (!metadata) return;
    this.#pathIndex.value.delete(path);
    this.#pathComputedRefs.delete(path);
    this.#journalIndices.value.get(metadata.journal)?.delete(metadata.date);
  }

  transferPathData(oldPath: string, newPath: string, newTitle: string) {
    const metadata = this.#pathIndex.value.get(oldPath);
    if (!metadata) return;
    this.#pathIndex.value.delete(oldPath);
    metadata.path = newPath;
    metadata.title = newTitle;
    this.#pathIndex.value.set(newPath, metadata);
    const index = this.#journalIndices.value.get(metadata.journal);
    if (!index) return;
    index.deleteForPath(oldPath);
    index.set(metadata.date, newPath);
  }

  updateFromMetadata(journal: Journal, title: string, path: string, metadata: CachedMetadata): void {
    const { frontmatter } = metadata;
    if (!frontmatter) return;
    if (!(FRONTMATTER_NAME_KEY in frontmatter)) return;
    const date = frontmatter[journal.frontmatterDate];
    const end_date = frontmatter[journal.frontmatterEndDate];
    if (!date_from_string(date).isValid() || (end_date && !date_from_string(end_date).isValid())) return;

    const journalMetadata: JournalNoteData = {
      title,
      journal: journal.name,
      date,
      end_date,
      path,
      index: frontmatter[journal.frontmatterIndex],
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
    this.getJournalIndex(journal.name).set(date, path);
  }

  onunload(): void {
    this.#pathIndex.value.clear();
    this.#pathComputedRefs.clear();
    this.#journalIndices.value.clear();
  }
}
