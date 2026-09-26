import { createNanoEvents } from "nanoevents";

import { inject } from "@/infrastructure/di";
import type { TypedEmitter } from "@/infrastructure/events";
import { NotesService, type VaultPath } from "@/infrastructure/host";
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

  constructor(journalsEvents = inject(JournalsEventsToken), notes = inject(NotesService)) {
    this.#journals.events.on("entryChanged", ({ entry }) => {
      this.#emitter.emit("changed", { kind: "note", path: entry.path });
    });
    // Editing a note's body changes no frontmatter, so JournalsIndex.register finds the slot and
    // the payload unchanged and returns without emitting entryChanged — the feed above never sees a
    // ticked, added or deleted checkbox. `metadata-changed` rather than `modified` because
    // extraction reads metadataCache, so it wants the parse and not the bytes that precede it.
    // Gated on ownership: an edit anywhere else in the vault must not bump the index version.
    notes.events.on("metadata-changed", (path) => {
      if (this.#journals.entryByPath(path).isNone()) return;
      this.#emitter.emit("changed", { kind: "note", path });
    });
    // A journal's own rename/delete stream carries no field-level detail, so the one signal that
    // actually bears on a provider's rule is `updated` with `tasks` among the changed keys —
    // every other field change (a nav block, a notelet type) must not trigger a refill.
    journalsEvents.on("updated", (journalName, changes) => {
      if (!("tasks" in changes)) return;
      this.#emitter.emit("changed", { kind: "journal", journalName });
    });
    // A deleted journal's notes leave JournalsIndex through clearJournal, which deliberately emits
    // no per-entry entryChanged (pinned in journals-index.test.ts), so the note feed above never
    // sees them go. Naming the journal here would not help either: VaultSubscriptionService
    // subscribes to this same event first and has already cleared the entries, so a journal-scoped
    // walk finds nothing to republish. Only a full refill — which republishes the owned set and
    // replaces the provider's whole store — takes the vanished notes' items with them.
    journalsEvents.on("deleted", () => {
      this.#emitter.emit("changed", { kind: "all" });
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
        rule: (config.tasks.providers as Record<string, unknown>)[providerId],
      })),
    );
  }

  *ownedNotes(providerId: string, forJournal?: string): Iterable<OwnedNote> {
    const names = forJournal === undefined ? this.#repository.find().ids() : [forJournal];
    for (const journalName of names) {
      const config = this.#repository.get(journalName);
      if (config.isNone()) continue;
      const rule = (config.value.tasks.providers as Record<string, unknown>)[providerId];
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
