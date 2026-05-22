import { inject } from "@/infrastructure/di";
import { attempt, Err, Option, type Result } from "@/infrastructure/result";
import { journalConfigCollection } from "@/journals";
import { UnknownJournalError } from "@/journals/settings/errors";
import { SettingsService } from "@/settings";

import { shelvesCollection, type ShelfConfig } from "./config";
import { InvalidShelfNameError, ShelfNameTakenError, UnknownShelfError } from "./errors";

export class ShelvesLifecycleService {
  readonly #settings = inject(SettingsService);

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
    });
  }

  assign(journalName: string, shelfName: string): Result<void, UnknownJournalError | UnknownShelfError> {
    return attempt.in(this, function* () {
      const journals = this.#settings.getCollection(journalConfigCollection);
      if (journals.get(journalName) === undefined) {
        yield* new Err<never, UnknownJournalError>(new UnknownJournalError(journalName));
      }
      const shelves = this.#settings.getCollection(shelvesCollection);
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

  #removeJournalFromShelves(journalName: string): void {
    const shelves = this.#settings.getCollection(shelvesCollection);
    for (const shelf of Object.values(shelves.entries)) {
      const index = shelf.journals.indexOf(journalName);
      if (index !== -1) shelf.journals.splice(index, 1);
    }
  }
}
