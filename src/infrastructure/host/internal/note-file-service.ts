import { TFile } from "obsidian";

import { inject } from "@/infrastructure/di";

import { InternalObsidianAppToken } from "./tokens";

/**
 * The one place a raw `TFile` leaves the host layer. It exists because the public
 * plugin API hands integrators a `TFile`, which every other consumer gets as the
 * domain `Note` instead. Not exported from the host barrel, and lint-fenced to
 * `src/api/**` — widen neither without revisiting that decision.
 */
export class NoteFileService {
  readonly #app = inject(InternalObsidianAppToken);

  resolve(path: string): TFile | null {
    const file = this.#app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? file : null;
  }
}
