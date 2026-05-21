import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { commandCollection, type CommandTarget } from "../config";

import { editCommandModal } from "./edit-command-modal";

export interface EditCommandParameters {
  readonly commandId?: string;
  readonly target: CommandTarget;
}

export class EditCommandFlow implements Flow<EditCommandParameters, { id: string }, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #settings = inject(SettingsService);

  execute(parameters: EditCommandParameters): AsyncResult<{ id: string }, FlowError> {
    const collection = this.#settings.getCollection(commandCollection);
    const existing = parameters.commandId === undefined ? undefined : collection.get(parameters.commandId);
    const target = existing?.target ?? parameters.target;
    const takenNames = Object.entries(collection.entries)
      .filter(([id]) => id !== parameters.commandId)
      .map(([, command]) => command.name);
    return attempt.in(this, async function* (this: EditCommandFlow) {
      const config = yield* this.#modals
        .open(editCommandModal, { command: existing, target, takenNames })
        .mapErr(() => new UserAborted("edit-command-modal"));
      const id = parameters.commandId ?? crypto.randomUUID();
      collection.add(id, config);
      return { id };
    });
  }
}
