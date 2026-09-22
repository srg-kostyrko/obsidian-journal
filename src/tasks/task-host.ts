import { createNanoEvents } from "nanoevents";

import { inject } from "@/infrastructure/di";
import type { TypedEmitter } from "@/infrastructure/events";
import type { VaultPath } from "@/infrastructure/host";
import type { Option } from "@/infrastructure/result";
import { JournalsEventsToken, JournalsIndex, JournalsRepository } from "@/journals";

import { TaskIndex } from "./task-index";

import type { OwnedNote, OwnedNoteChange, TaskHost, TaskItem } from "./types";

interface TaskHostEvents {
  changed: (change: OwnedNoteChange) => void;
}

export class TaskHostService implements TaskHost {
  readonly #index = inject(TaskIndex);
  readonly #journals = inject(JournalsIndex);
  readonly #repository = inject(JournalsRepository);
  readonly #emitter: TypedEmitter<TaskHostEvents> = createNanoEvents();

  constructor(journalsEvents = inject(JournalsEventsToken)) {
    this.#journals.events.on("entryChanged", ({ entry }) => {
      this.#emitter.emit("changed", { kind: "note", path: entry.path });
    });
    // A journal's own rename/delete stream carries no field-level detail, so the one signal that
    // actually bears on a provider's rule is `updated` with `tasks` among the changed keys —
    // every other field change (a nav block, a notelet type) must not trigger a refill.
    journalsEvents.on("updated", (journalName, changes) => {
      if (!("tasks" in changes)) return;
      this.#emitter.emit("changed", { kind: "journal", journalName });
    });
  }

  publish(providerId: string, scope: "all" | { path: VaultPath }, items: readonly TaskItem[]): void {
    this.#index.publish(providerId, scope, items);
  }

  ownerOf(path: VaultPath, providerId: string): Option<OwnedNote> {
    return this.#journals.entryByPath(path).flatMap((entry) =>
      this.#repository.get(entry.journalName).map((config) => ({
        path: entry.path,
        journalName: entry.journalName,
        rule: (config.tasks as Record<string, unknown>)[providerId],
      })),
    );
  }

  *ownedNotes(providerId: string): Iterable<OwnedNote> {
    for (const journalName of this.#repository.find().ids()) {
      const config = this.#repository.get(journalName);
      if (config.isNone()) continue;
      const rule = (config.value.tasks as Record<string, unknown>)[providerId];
      for (const [, path] of this.#journals.entriesFor(journalName)) {
        yield { path, journalName, rule };
      }
      for (const notelet of this.#journals.noteletsFor(journalName)) {
        yield { path: notelet.path, journalName, rule };
      }
    }
  }

  onOwnedNotesChanged(callback: (change: OwnedNoteChange) => void): () => void {
    return this.#emitter.on("changed", callback);
  }
}
