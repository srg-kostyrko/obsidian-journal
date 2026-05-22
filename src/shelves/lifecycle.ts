import { inject } from "@/infrastructure/di";
import { attempt, Err, Option, type Result } from "@/infrastructure/result";
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
}
