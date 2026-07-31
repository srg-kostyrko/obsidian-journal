import { getAllTags, TFile } from "obsidian";

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
      // cache.tags holds inline body tags only; frontmatter tags live under
      // cache.frontmatter and reach us only through getAllTags, which also normalizes
      // every tag to a leading "#".
      tags: getAllTags(cache) ?? [],
      properties: cache.frontmatter ?? {},
      tasks:
        cache.listItems?.filter((item) => item.task !== undefined).map((item) => ({ completed: item.task !== " " })) ??
        [],
    });
  }

  // metadataCache resolves frontmatter incrementally and fires "resolved" each time
  // its queue drains — several times during a cold boot, not once at the end. A
  // whole-vault walk that needs every note indexed must re-check its own precondition
  // on each firing, so this keeps firing (returns a disposer) rather than running once.
  onResolved(callback: () => void): () => void {
    const ref = this.#app.metadataCache.on("resolved", callback);
    return () => this.#app.metadataCache.offref(ref);
  }
}
