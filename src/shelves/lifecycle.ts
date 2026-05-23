import { createNanoEvents } from "nanoevents";

import { inject } from "@/infrastructure/di";
import type { Subscribable, TypedEmitter } from "@/infrastructure/events";
import { attempt, Err, Option, type Result } from "@/infrastructure/result";
import { journalConfigCollection } from "@/journals";
import { UnknownJournalError } from "@/journals/errors";
import { JournalLifecycleService } from "@/journals/settings/lifecycle";
import { SettingsService } from "@/settings";

import { shelvesCollection, type ShelfConfig } from "./config";
import { InvalidShelfNameError, ShelfNameTakenError, UnknownShelfError } from "./errors";

export interface ShelvesLifecycleEvents {
  shelfRenamed: (payload: { oldName: string; newName: string }) => void;
  shelfDeleted: (payload: { shelfName: string }) => void;
}

export class ShelvesLifecycleService {
  readonly #emitter: TypedEmitter<ShelvesLifecycleEvents> = createNanoEvents();
  readonly events: Subscribable<ShelvesLifecycleEvents> = this.#emitter;
  readonly #settings = inject(SettingsService);
  readonly #journalLifecycle = inject(JournalLifecycleService);

  constructor() {
    this.#journalLifecycle.events.on("journalRenamed", ({ oldName, newName }) => {
      this.#renameJournalInShelves(oldName, newName);
    });
    this.#journalLifecycle.events.on("journalDeleted", ({ journalName }) => {
      this.#removeJournalFromShelves(journalName);
    });
  }

  create(name: string): Result<ShelfConfig, InvalidShelfNameError | ShelfNameTakenError> {
    return attempt.in(this, function* () {
      if (name.length === 0) {
        yield* new Err<never, InvalidShelfNameError>(new InvalidShelfNameError(name));
      }
      const collection = this.#settings.getCollection(shelvesCollection);
      if (collection.get(name) !== undefined) {
        yield* new Err<never, ShelfNameTakenError>(new ShelfNameTakenError(name));
      }
      return collection.add(name);
    });
  }

  rename(
    oldName: string,
    newName: string,
  ): Result<void, UnknownShelfError | InvalidShelfNameError | ShelfNameTakenError> {
    return attempt.in(this, function* () {
      if (newName.length === 0 || newName === oldName) {
        yield* new Err<never, InvalidShelfNameError>(new InvalidShelfNameError(newName));
      }
      const collection = this.#settings.getCollection(shelvesCollection);
      const existing = yield* Option.fromNullable(collection.get(oldName)).okOrElse(
        () => new UnknownShelfError(oldName),
      );
      if (collection.get(newName) !== undefined) {
        yield* new Err<never, ShelfNameTakenError>(new ShelfNameTakenError(newName));
      }
      collection.add(newName, { ...existing, name: newName });
      collection.remove(oldName);
      this.#emitter.emit("shelfRenamed", { oldName, newName });
    });
  }

  delete(name: string, destinationShelf?: string): Result<void, UnknownShelfError> {
    return attempt.in(this, function* () {
      const collection = this.#settings.getCollection(shelvesCollection);
      const shelf = yield* Option.fromNullable(collection.get(name)).okOrElse(() => new UnknownShelfError(name));
      if (destinationShelf) {
        const destination = yield* Option.fromNullable(collection.get(destinationShelf)).okOrElse(
          () => new UnknownShelfError(destinationShelf),
        );
        destination.journals.push(...shelf.journals);
      }
      collection.remove(name);
      this.#emitter.emit("shelfDeleted", { shelfName: name });
    });
  }

  assign(journalName: string, shelfName: string): Result<void, UnknownJournalError | UnknownShelfError> {
    return attempt.in(this, function* () {
      const journals = this.#settings.getCollection(journalConfigCollection);
      yield* Option.fromNullable(journals.get(journalName)).okOrElse(() => new UnknownJournalError(journalName));
      const shelves = this.#settings.getCollection(shelvesCollection);
      // An empty shelfName means unassign — remove the journal from every shelf with no replacement.
      if (shelfName === "") {
        this.#removeJournalFromShelves(journalName);
        return;
      }
      const target = yield* Option.fromNullable(shelves.get(shelfName)).okOrElse(
        () => new UnknownShelfError(shelfName),
      );
      this.#removeJournalFromShelves(journalName);
      target.journals.push(journalName);
    });
  }

  #renameJournalInShelves(oldName: string, newName: string): void {
    const shelves = this.#settings.getCollection(shelvesCollection);
    for (const shelf of Object.values(shelves.entries)) {
      const index = shelf.journals.indexOf(oldName);
      if (index !== -1) shelf.journals[index] = newName;
    }
  }

  #removeJournalFromShelves(journalName: string): void {
    const shelves = this.#settings.getCollection(shelvesCollection);
    for (const shelf of Object.values(shelves.entries)) {
      const index = shelf.journals.indexOf(journalName);
      if (index !== -1) shelf.journals.splice(index, 1);
    }
  }
}
