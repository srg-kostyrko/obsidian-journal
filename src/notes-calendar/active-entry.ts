import { shallowRef, type ShallowRef } from "vue";

import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import type { Option } from "@/infrastructure/result";
import { JournalsIndex } from "@/journals";

export interface ActiveEntryRef {
  readonly journalName: string;
  readonly anchor: AnchorString;
}

export class ActiveEntryViewModel {
  readonly #workspace = inject(WorkspaceService);
  readonly #index = inject(JournalsIndex);

  readonly active: ShallowRef<ActiveEntryRef | null> = shallowRef(null);

  constructor() {
    this.#refresh(this.#workspace.activeNote());
    this.#workspace.events.on("active-note-changed", (path: Option<VaultPath>) => {
      this.#refresh(path);
    });
    this.#index.events.on("entryChanged", ({ entry, kind }) => {
      const current = this.#workspace.activeNote();
      if (current.isNone() || current.value !== entry.path) return;
      this.active.value = kind === "added" ? { journalName: entry.journalName, anchor: entry.anchor } : null;
    });
  }

  #refresh(path: Option<VaultPath>): void {
    this.active.value = path
      .flatMap((p) => this.#index.entryByPath(p))
      .match({
        some: (entry) => ({ journalName: entry.journalName, anchor: entry.anchor }),
        none: () => null as ActiveEntryRef | null,
      });
  }
}
