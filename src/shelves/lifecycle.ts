import { inject } from "@/infrastructure/di";
import { attempt, Err, type Result } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { shelvesCollection, type ShelfConfig } from "./config";
import { InvalidShelfNameError, ShelfNameTakenError } from "./errors";

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
}
