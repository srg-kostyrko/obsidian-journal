import { inject } from "@/infrastructure/di";
import { attempt, Err, Ok, Option, type Result } from "@/infrastructure/result";
import { journalConfigCollection, journalDefaultsFor, type JournalConfig, type JournalWrite } from "@/journals";
import { SettingsService } from "@/settings";

import { InvalidJournalNameError, JournalNameTakenError, UnknownJournalError } from "./errors";

export class JournalLifecycleService {
  readonly #settings = inject(SettingsService);

  create(name: string, write: JournalWrite): Result<JournalConfig, InvalidJournalNameError | JournalNameTakenError> {
    return attempt.in(this, function* () {
      if (name.length === 0) {
        yield* new Err<never, InvalidJournalNameError>(new InvalidJournalNameError(name));
      }
      const collection = this.#settings.getCollection(journalConfigCollection);
      if (collection.get(name) !== undefined) {
        yield* new Err<never, JournalNameTakenError>(new JournalNameTakenError(name));
      }
      const created = collection.add(name, journalDefaultsFor(write, name)) as JournalConfig;
      return created;
    });
  }

  rename(
    oldName: string,
    newName: string,
  ): Result<void, UnknownJournalError | InvalidJournalNameError | JournalNameTakenError> {
    return attempt.in(this, function* () {
      if (newName.length === 0 || newName === oldName) {
        yield* new Err<never, InvalidJournalNameError>(new InvalidJournalNameError(newName));
      }
      const collection = this.#settings.getCollection(journalConfigCollection);
      const existing = yield* Option.fromNullable(collection.get(oldName) as JournalConfig | undefined).okOrElse(
        () => new UnknownJournalError(oldName),
      );
      if (collection.get(newName) !== undefined) {
        yield* new Err<never, JournalNameTakenError>(new JournalNameTakenError(newName));
      }
      collection.add(newName, { ...existing, name: newName });
      collection.remove(oldName);
    });
  }

  delete(name: string): Result<void, UnknownJournalError> {
    const collection = this.#settings.getCollection(journalConfigCollection);
    if (collection.get(name) === undefined) return new Err(new UnknownJournalError(name));
    collection.remove(name);
    return new Ok(undefined);
  }
}
