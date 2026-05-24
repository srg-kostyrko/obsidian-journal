import { nanoid } from "nanoid";

import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import { CommandsRepository } from "../repository";

import { editCommandModal } from "./edit-command-modal";

import type { CommandTarget } from "../config";

export interface EditCommandParameters {
  readonly commandId?: string;
  readonly target: CommandTarget;
}

export class EditCommandFlow implements Flow<EditCommandParameters, { id: string }, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #repo = inject(CommandsRepository);

  execute(parameters: EditCommandParameters): AsyncResult<{ id: string }, FlowError> {
    const existing =
      parameters.commandId === undefined ? undefined : this.#repo.get(parameters.commandId).getOr(undefined as never);
    const target = existing?.target ?? parameters.target;
    const takenNames = [...this.#repo.find().entries()]
      .filter(([id]) => id !== parameters.commandId)
      .map(([, command]) => command.name);
    return attempt.in(this, async function* (this: EditCommandFlow) {
      const config = yield* this.#modals
        .open(editCommandModal, { command: existing, target, takenNames })
        .mapErr(() => new UserAborted("edit-command-modal"));
      const id = parameters.commandId ?? nanoid();
      if (parameters.commandId === undefined) {
        this.#repo.create(id, config);
      } else {
        this.#repo.update(id, config);
      }
      return { id };
    });
  }
}
