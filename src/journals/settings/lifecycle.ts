import { createNanoEvents } from "nanoevents";

import { inject } from "@/infrastructure/di";
import type { Subscribable, TypedEmitter } from "@/infrastructure/events";
import { attempt, Err, Ok, Option, type Result } from "@/infrastructure/result";
import { InvalidJournalNameError, JournalNameTakenError, UnknownJournalError } from "@/journals/errors";
import { SettingsService } from "@/settings";

import { journalConfigCollection, journalDefaultsFor, type JournalConfig, type JournalWrite } from "../config";

export interface JournalLifecycleEvents {
  journalRenamed: (payload: { oldName: string; newName: string }) => void;
  journalDeleted: (payload: { journalName: string }) => void;
}

export class JournalLifecycleService {
  readonly #settings = inject(SettingsService);
  readonly #emitter: TypedEmitter<JournalLifecycleEvents> = createNanoEvents();
  readonly events: Subscribable<JournalLifecycleEvents> = this.#emitter;

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
      this.#emitter.emit("journalRenamed", { oldName, newName });
    });
  }

  delete(name: string): Result<void, UnknownJournalError> {
    const collection = this.#settings.getCollection(journalConfigCollection);
    if (collection.get(name) === undefined) return new Err(new UnknownJournalError(name));
    collection.remove(name);
    this.#emitter.emit("journalDeleted", { journalName: name });
    return new Ok(undefined);
  }
}
