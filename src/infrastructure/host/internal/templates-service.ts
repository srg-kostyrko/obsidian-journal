import { inject } from "@/infrastructure/di";

import { NotesService } from "./notes-service";
import { TemplaterService } from "./templater-service";
import { InternalObsidianAppToken } from "./tokens";

import type { VaultPath } from "../types";

const CORE_TEMPLATES_PLUGIN_ID = "templates";

export class TemplatesService {
  readonly #app = inject(InternalObsidianAppToken);
  readonly #notes = inject(NotesService);
  readonly #templater = inject(TemplaterService);

  #coreTemplatesFolder(): string | null {
    const internalPlugins = (this.#app as { internalPlugins?: { getPluginById?: (id: string) => unknown } })
      .internalPlugins;
    const plugin = internalPlugins?.getPluginById?.(CORE_TEMPLATES_PLUGIN_ID);
    const instance = (plugin as { instance?: unknown } | null)?.instance;
    const options = (instance as { options?: unknown } | null)?.options;
    const folder = (options as { folder?: unknown } | null)?.folder;
    return typeof folder === "string" ? folder : null;
  }

  templateFolders(): VaultPath[] {
    const folders = new Set<VaultPath>();
    for (const value of [this.#coreTemplatesFolder(), this.#templater.templatesFolder()]) {
      const normalized = normalizeFolder(value);
      if (normalized !== null) folders.add(normalized);
    }
    return [...folders];
  }

  candidatePaths(): VaultPath[] {
    const folders = this.templateFolders();
    const all = this.#notes.allMarkdownNotes();
    if (folders.length === 0) return all;
    return all.filter((path) => folders.some((folder) => path === folder || path.startsWith(`${folder}/`)));
  }
}

function normalizeFolder(value: string | null): VaultPath | null {
  if (value === null) return null;
  const trimmed = value.trim().replace(/\/+$/, "");
  if (trimmed === "") return null;
  return trimmed as VaultPath;
}
