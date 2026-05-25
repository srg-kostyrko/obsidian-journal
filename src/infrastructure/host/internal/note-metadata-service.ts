import { TFile } from "obsidian";

import { inject } from "@/infrastructure/di";
import { None, type Option, Some } from "@/infrastructure/result";

import { InternalObsidianAppToken } from "./tokens";

import type { NoteMetadata, VaultPath } from "../types";

export class NoteMetadataService {
  readonly #app = inject(InternalObsidianAppToken);

  get(path: VaultPath): Option<NoteMetadata> {
    const file = this.#app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return new None<NoteMetadata>();
    const cache = this.#app.metadataCache.getFileCache(file);
    if (!cache) return new None<NoteMetadata>();
    return new Some<NoteMetadata>({
      title: file.basename,
      tags: cache.tags?.map((entry) => entry.tag) ?? [],
      properties: cache.frontmatter ?? {},
      tasks:
        cache.listItems?.filter((item) => item.task !== undefined).map((item) => ({ completed: item.task !== " " })) ??
        [],
    });
  }
}
