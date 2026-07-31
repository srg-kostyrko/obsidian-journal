import { inject } from "@/infrastructure/di";

import { InternalObsidianAppToken } from "./tokens";

import type { VaultProperty } from "../types";
import type { App } from "obsidian";

// Obsidian renamed the property registry's fields in 1.9: entries carry `widget` instead of
// `type`, and the user-assigned type moved from getAssignedType() to getAssignedWidget().
// manifest.minAppVersion still covers releases from before the rename, so both are read.
interface PropertyInfo {
  readonly name: string;
  readonly widget?: string;
  readonly type?: string;
}

interface MetadataTypeManagerApi {
  getAllProperties?: () => Record<string, PropertyInfo>;
  getAssignedWidget?: (name: string) => string | null;
  getAssignedType?: (name: string) => string | null;
}

interface AppWithMetadataTypes extends App {
  readonly metadataTypeManager?: MetadataTypeManagerApi;
}

export class MetadataTypeService {
  readonly #app = inject(InternalObsidianAppToken);

  get #manager(): MetadataTypeManagerApi | undefined {
    return (this.#app as AppWithMetadataTypes).metadataTypeManager;
  }

  // A type picked by hand in Obsidian's property settings outranks the one inferred from values.
  #assignedType(name: string): string | null {
    const key = name.toLowerCase();
    return this.#manager?.getAssignedWidget?.(key) ?? this.#manager?.getAssignedType?.(key) ?? null;
  }

  // Obsidian's type name for a frontmatter property (e.g. "text", "number", "checkbox",
  // "date", "datetime"), or null when the vault has never seen the property.
  getPropertyType(name: string): string | null {
    const info = this.#manager?.getAllProperties?.()[name.toLowerCase()];
    return this.#assignedType(name) ?? info?.widget ?? info?.type ?? null;
  }

  listProperties(): readonly VaultProperty[] {
    const all = this.#manager?.getAllProperties?.() ?? {};
    return Object.values(all).map((info) => ({
      name: info.name,
      type: this.#assignedType(info.name) ?? info.widget ?? info.type ?? "text",
    }));
  }
}
