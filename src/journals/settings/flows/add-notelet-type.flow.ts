import { nanoid } from "nanoid";

import { CommandsRepository } from "@/commands/repository";
import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, AsyncResult } from "@/infrastructure/result";
import { toFlowError, UnknownJournalError } from "@/journals/errors";
import { noteletTypeDefaults, type TypeId } from "@/journals/notelets/config";
import { JournalsRepository } from "@/journals/repository";
import { SettingsUiService } from "@/settings";

import { addNoteletTypeModal } from "../ui/modals";
import { noteletTypeSubpage } from "../ui/notelet-type-subpage";

export class AddNoteletTypeFlow implements Flow<{ journalName: string }, { typeId: TypeId }, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #repository = inject(JournalsRepository);
  readonly #commands = inject(CommandsRepository);
  readonly #ui = inject(SettingsUiService);

  execute(parameters: { journalName: string }): AsyncResult<{ typeId: TypeId }, FlowError> {
    const configOpt = this.#repository.get(parameters.journalName);
    if (configOpt.isNone()) {
      return AsyncResult.err(toFlowError(new UnknownJournalError(parameters.journalName)));
    }
    const config = configOpt.value;
    return attempt.in(this, async function* (this: AddNoteletTypeFlow) {
      const submitted = yield* this.#modals
        .open(addNoteletTypeModal, { journalName: parameters.journalName })
        .mapErr(() => new UserAborted("add-notelet-type-modal"));

      const typeId = crypto.randomUUID() as TypeId;
      const type = { ...noteletTypeDefaults(typeId), name: submitted.name };
      this.#repository.update(parameters.journalName, {
        notelets: { ...config.notelets, [typeId]: type },
      });

      // Every type has a command from the moment it exists, so no later flow has to handle a
      // command-less one. Everything but the target is the user's from here.
      this.#commands.create(nanoid(), {
        name: m.journal_notelet_command_name({ type: submitted.name }),
        icon: "",
        showInRibbon: false,
        openMode: "tab",
        target: { kind: "notelet", journalName: parameters.journalName, typeId },
        type: "same",
        context: "today",
      });

      this.#ui.push(noteletTypeSubpage, { journalName: parameters.journalName, typeId });
      return { typeId };
    });
  }
}
