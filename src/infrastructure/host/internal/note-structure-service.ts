import { getAllTags, TFile } from "obsidian";

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
    const inline = new Set((cache.tags ?? []).map((entry) => entry.tag));
    return new Some<NoteStructure>({
      listItems: (cache.listItems ?? [])
        .filter((item) => item.task !== undefined)
        .map((item) => ({
          marker: item.task ?? " ",
          line: item.position.start.line,
          endLine: item.position.end.line,
        })),
      tags: (cache.tags ?? []).map((entry) => ({ tag: entry.tag, line: entry.position.start.line })),
      headings: (cache.headings ?? []).map((h) => ({
        heading: h.heading,
        level: h.level,
        line: h.position.start.line,
      })),
      // getAllTags merges inline and frontmatter tags and normalizes the leading "#";
      // positions are lost there, so inline ones are subtracted back out by value.
      frontmatterTags: (getAllTags(cache) ?? []).filter((tag) => !inline.has(tag)),
    });
  }
}
