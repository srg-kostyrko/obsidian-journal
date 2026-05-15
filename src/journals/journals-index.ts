import { createNanoEvents } from "nanoevents";

import type { Subscribable, TypedEmitter } from "@/infrastructure/events";
import type { VaultPath } from "@/infrastructure/host";
import { Option } from "@/infrastructure/result";

import { JournalIndex } from "./journal-index";

import type { JournalEntry, JournalsIndexEvents } from "./types";

export class JournalsIndex {
  readonly #journals = new Map<string, JournalIndex>();
  readonly #byPath = new Map<VaultPath, JournalEntry>();
  readonly #emitter: TypedEmitter<JournalsIndexEvents> = createNanoEvents();
  readonly events: Subscribable<JournalsIndexEvents> = this.#emitter;

  readonly #dirty = new Set<string>();
  #flushScheduled = false;

  entryByPath(path: VaultPath): Option<JournalEntry> {
    return Option.fromNullable(this.#byPath.get(path));
  }

  register(entry: JournalEntry): void {
    const existing = this.#byPath.get(entry.path);
    if (existing) {
      if (existing.journalName === entry.journalName && existing.anchor === entry.anchor) {
        return;
      }
      this.#journals.get(existing.journalName)?.delete(existing.anchor);
      this.#emitter.emit("entryChanged", { entry: existing, kind: "removed" });
      this.#markDirty(existing.journalName);
    }
    let journalIndex = this.#journals.get(entry.journalName);
    if (!journalIndex) {
      journalIndex = new JournalIndex();
      this.#journals.set(entry.journalName, journalIndex);
    }
    journalIndex.set(entry.anchor, entry.path);
    this.#byPath.set(entry.path, entry);
    this.#emitter.emit("entryChanged", { entry, kind: "added" });
    this.#markDirty(entry.journalName);
  }

  #markDirty(journalName: string): void {
    this.#dirty.add(journalName);
    if (this.#flushScheduled) return;
    this.#flushScheduled = true;
    queueMicrotask(() => {
      this.#flushScheduled = false;
      const names = [...this.#dirty];
      this.#dirty.clear();
      for (const name of names) {
        this.#emitter.emit("journalDirty", { journalName: name });
      }
    });
  }
}
