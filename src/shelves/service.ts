import { inject } from "@/infrastructure/di";
import { Err, Ok, type Result } from "@/infrastructure/result";
import { JournalsEventsToken, JournalsRepository, UnknownJournalError, type JournalsEvents } from "@/journals";

import { UnknownShelfError } from "./errors";
import { ShelvesRepository } from "./repository";

import type { Emitter } from "nanoevents";

export class ShelvesService {
  static fromParts(
    shelves: ShelvesRepository,
    journals: JournalsRepository,
    journalEvents: Emitter<JournalsEvents>,
  ): ShelvesService {
    return new ShelvesService(shelves, journals, journalEvents);
  }

  readonly #shelves: ShelvesRepository;
  readonly #journals: JournalsRepository;

  constructor(
    shelves: ShelvesRepository = inject(ShelvesRepository),
    journals: JournalsRepository = inject(JournalsRepository),
    journalEvents: Emitter<JournalsEvents> = inject(JournalsEventsToken),
  ) {
    this.#shelves = shelves;
    this.#journals = journals;
    journalEvents.on("renamed", (oldName, newName) => this.#renameJournalInShelves(oldName, newName));
    journalEvents.on("deleted", (journalName) => this.#removeJournalFromShelves(journalName));
    journalEvents.on("cloned", (sourceName, newName) => this.#shelveCopyWithSource(sourceName, newName));
  }

  #shelveCopyWithSource(sourceName: string, newName: string): void {
    for (const shelf of this.#shelves.find().list()) {
      if (!shelf.journals.includes(sourceName)) continue;
      this.#shelves.update(shelf.name, { journals: [...shelf.journals, newName] });
    }
  }

  #renameJournalInShelves(oldName: string, newName: string): void {
    for (const shelf of this.#shelves.find().list()) {
      if (!shelf.journals.includes(oldName)) continue;
      const journals = shelf.journals.map((entry) => (entry === oldName ? newName : entry));
      this.#shelves.update(shelf.name, { journals });
    }
  }

  #removeJournalFromShelves(journalName: string): void {
    for (const shelf of this.#shelves.find().list()) {
      const index = shelf.journals.indexOf(journalName);
      if (index !== -1) {
        this.#shelves.update(shelf.name, { journals: shelf.journals.filter((entry) => entry !== journalName) });
      }
    }
  }

  assign(journalName: string, shelfName: string): Result<void, UnknownJournalError | UnknownShelfError> {
    if (this.#journals.get(journalName).isNone()) return new Err(new UnknownJournalError(journalName));
    if (shelfName === "") {
      this.#removeJournalFromShelves(journalName);
      return new Ok(undefined);
    }
    if (this.#shelves.get(shelfName).isNone()) return new Err(new UnknownShelfError(shelfName));
    this.#removeJournalFromShelves(journalName);
    // Re-read AFTER the remove step — #removeJournalFromShelves may have replaced storage[shelfName] via update().
    const target = this.#shelves.get(shelfName).getOr({ name: shelfName, journals: [], decorations: [] });
    this.#shelves.update(shelfName, { journals: [...target.journals, journalName] });
    return new Ok(undefined);
  }

  hasShelves(): boolean {
    return this.#shelves.count() > 0;
  }

  shelfOf(journalName: string): string {
    for (const shelf of this.#shelves.find().list()) {
      if (shelf.journals.includes(journalName)) return shelf.name;
    }
    return "";
  }
}
