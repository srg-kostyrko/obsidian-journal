import { match } from "ts-pattern";

import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt, Err } from "@/infrastructure/result";
import { toFlowError, UnknownJournalError } from "@/journals/errors";
import type { TypeId } from "@/journals/notelets/config";
import { NoteletCommandService } from "@/journals/notelets/notelet-commands";
import { NoteConnectionService } from "@/journals/notes/note-connection";
import { JournalsRepository } from "@/journals/repository";
import { SettingsUiService } from "@/settings";

import { deleteNoteletTypeModal } from "../ui/modals";

export class DeleteNoteletTypeFlow implements Flow<{ journalName: string; typeId: string }, void, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #repository = inject(JournalsRepository);
  readonly #connection = inject(NoteConnectionService);
  readonly #noteletCommands = inject(NoteletCommandService);
  readonly #ui = inject(SettingsUiService);

  execute(parameters: { journalName: string; typeId: string }): AsyncResult<void, FlowError> {
    const openingType = this.#repository.get(parameters.journalName).getOrUndefined()?.notelets[parameters.typeId];
    if (openingType === undefined) {
      return AsyncResult.err(toFlowError(new UnknownJournalError(parameters.journalName)));
    }
    return attempt.in(this, async function* (this: DeleteNoteletTypeFlow) {
      const { mode } = yield* this.#modals
        .open(deleteNoteletTypeModal, { ...parameters, typeName: openingType.name })
        .mapErr(() => new UserAborted("delete-notelet-type-modal"));

      // Re-read across the await: disconnectNoteletsOfType/deleteNoteletsOfType match notelets by
      // the type's *stored* name, and the settings store can change while the modal is open (a
      // sync merge, or any other write reaching JournalsRepository from outside this flow) — the
      // same hazard RenameNoteletTypeFlow re-reads for. Purging by the pre-modal name would target
      // a name no notelet carries any more, leaving every one of them still wearing the type's
      // counter and question keys.
      const type = this.#repository.get(parameters.journalName).getOrUndefined()?.notelets[parameters.typeId];
      if (type === undefined) {
        return yield* new Err(toFlowError(new UnknownJournalError(parameters.journalName)));
      }

      // Purge before removing the type from config: clearMutator enumerates the journal's
      // current types to know which counter and question keys a notelet can carry, so a type
      // removed from config first leaves its own keys behind on every note it owned.
      yield* match(mode)
        .with("clear", () => this.#connection.disconnectNoteletsOfType(parameters.journalName, type.name))
        .with("delete", () => this.#connection.deleteNoteletsOfType(parameters.journalName, type.name))
        .with("keep", () => AsyncResult.ok())
        .exhaustive();

      yield* this.#repository
        .deleteNoteletType(parameters.journalName, parameters.typeId as TypeId)
        .mapErr(toFlowError);
      // The command's typeId would otherwise resolve to nothing, in all three modes.
      this.#noteletCommands.retire(parameters.journalName, parameters.typeId as TypeId);
      const current = this.#ui.current.value;
      if (
        current?.subpage.key === "notelet-type-edit" &&
        (current.props as { journalName: string; typeId: string }).journalName === parameters.journalName &&
        (current.props as { journalName: string; typeId: string }).typeId === parameters.typeId
      ) {
        this.#ui.pop();
      }
      return;
    });
  }
}
