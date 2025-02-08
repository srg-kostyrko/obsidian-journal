import { Component, type CachedMetadata } from "obsidian";
import { computed, ref, shallowRef, type ComputedRef } from "vue";
import type { JournalAnchorDate, JournalNoteData } from "../types/journal.types";
import { FRONTMATTER_NAME_KEY } from "../constants";
import { date_from_string } from "../calendar";
import { JournalIndex } from "./journal-index";
import type { NotesManager } from "@/types/plugin.types";
import type { Journal } from "./journal";

export class JournalsIndex extends Component {
  #pathIndex = ref(new Map<string, JournalNoteData>());
  #pathComputeds = new Map<string, ComputedRef<JournalNoteData | null>>();
  #journalIndecies = shallowRef(new Map<string, JournalIndex>());
  #notesManager: NotesManager;

  constructor(notesManager: NotesManager) {
    super();
    this.#notesManager = notesManager;
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

  async renameJournal(oldName: string, name: string): Promise<void> {
    const index = this.getJournalIndex(oldName);
    if (!index) return;
    for (const [, path] of index) {
      await this.#notesManager.updateNoteFrontmatter(path, (frontmatter) => {
        frontmatter[FRONTMATTER_NAME_KEY] = name;
      });
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

  registerPathData(path: string, data: JournalNoteData): void {
    this.#pathIndex.value.set(path, data);
  }

  unregisterPathData(path: string): void {
    this.#pathIndex.value.delete(path);
  }

  clearForPath(path: string): void {
    const metadata = this.#pathIndex.value.get(path);
    if (!metadata) return;
    this.#pathIndex.value.delete(path);
    this.#pathComputeds.delete(path);
    this.#journalIndecies.value.get(metadata.journal)?.delete(metadata.date);
  }

  transferPathData(oldPath: string, newPath: string, newTitle: string) {
    const metadata = this.#pathIndex.value.get(oldPath);
    if (!metadata) return;
    this.#pathIndex.value.delete(oldPath);
    metadata.path = newPath;
    metadata.title = newTitle;
    this.#pathIndex.value.set(newPath, metadata);
    const index = this.#journalIndecies.value.get(metadata.journal);
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
    this.#pathComputeds.clear();
    this.#journalIndecies.value.clear();
  }
}
