import { inject } from "@/infrastructure/di";

import { InternalObsidianAppToken } from "./tokens";

import type { App } from "obsidian";

interface PropertyInfo {
  readonly name: string;
  readonly type: string;
  readonly count: number;
}

interface MetadataTypeManagerApi {
  getPropertyInfo(name: string): PropertyInfo | undefined;
}

interface AppWithMetadataTypes extends App {
  readonly metadataTypeManager?: MetadataTypeManagerApi;
}

export class MetadataTypeService {
  readonly #app = inject(InternalObsidianAppToken);

  // Obsidian's registered type name for a frontmatter property (e.g. "text", "number",
  // "checkbox", "date", "datetime"), or null when the vault has never seen the property.
  // The registry keys property names lower-cased.
  getPropertyType(name: string): string | null {
    const manager = (this.#app as AppWithMetadataTypes).metadataTypeManager;
    return manager?.getPropertyInfo(name.toLowerCase())?.type ?? null;
  }
}
