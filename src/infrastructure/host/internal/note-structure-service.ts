import { parseFrontMatterTags, TFile } from "obsidian";

import { inject } from "@/infrastructure/di";
import { None, type Option, Some } from "@/infrastructure/result";

import { InternalObsidianAppToken } from "./tokens";

import type { NoteStructure, VaultPath } from "../types";

export class NoteStructureService {
  readonly #app = inject(InternalObsidianAppToken);

  get(path: VaultPath): Option<NoteStructure> {
    const file = this.#app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return new None<NoteStructure>();
    const cache = this.#app.metadataCache.getFileCache(file);
    if (!cache) return new None<NoteStructure>();
    return new Some<NoteStructure>({
      listItems: (cache.listItems ?? [])
        .filter((item) => item.task !== undefined)
        .map((item) => ({
          marker: item.task ?? " ",
          line: item.position.start.line,
          endLine: item.position.end.line,
          parent: item.parent < 0 ? null : item.parent,
        })),
      tags: (cache.tags ?? []).map((entry) => ({ tag: entry.tag, line: entry.position.start.line })),
      headings: (cache.headings ?? []).map((h) => ({
        heading: h.heading,
        level: h.level,
        line: h.position.start.line,
      })),
      // Read straight off the frontmatter rather than subtracting the inline tags out of
      // getAllTags: that concatenates the two lists without deduping, so a tag written both in
      // frontmatter and on a line loses its frontmatter occurrence too — and a note-level tag has
      // to keep counting for every item in the note.
      frontmatterTags: parseFrontMatterTags(cache.frontmatter) ?? [],
    });
  }
}
