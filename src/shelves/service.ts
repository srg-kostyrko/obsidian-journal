import { inject } from "@/infrastructure/di";
import { Err, Ok, type Result } from "@/infrastructure/result";
import { JournalsEventsToken, JournalsRepository, UnknownJournalError, type JournalsEvents } from "@/journals";

import { UnknownShelfError } from "./errors";
import { ShelvesRepository } from "./repository";

import type { Emitter } from "nanoevents";

export class ShelvesService {
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
  }

  static fromParts(
    shelves: ShelvesRepository,
    journals: JournalsRepository,
    journalEvents: Emitter<JournalsEvents>,
  ): ShelvesService {
    return new ShelvesService(shelves, journals, journalEvents);
  }

  assign(journalName: string, shelfName: string): Result<void, UnknownJournalError | UnknownShelfError> {
    if (this.#journals.get(journalName).isNone()) return new Err(new UnknownJournalError(journalName));
    if (shelfName === "") {
      this.#removeJournalFromShelves(journalName);
      return new Ok(undefined);
    }
    const targetOpt = this.#shelves.get(shelfName);
    if (targetOpt.isNone()) return new Err(new UnknownShelfError(shelfName));
    this.#removeJournalFromShelves(journalName);
    const target = targetOpt.getOr({ name: shelfName, journals: [] });
    this.#shelves.update(shelfName, { journals: [...target.journals, journalName] });
    return new Ok(undefined);
  }

  #renameJournalInShelves(oldName: string, newName: string): void {
    for (const shelf of this.#shelves.find().list()) {
      const index = shelf.journals.indexOf(oldName);
      if (index !== -1) {
        const journals = [...shelf.journals];
        journals[index] = newName;
        this.#shelves.update(shelf.name, { journals });
      }
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
}
