import { cloneFnJSON } from "@vueuse/core";
import { nanoid } from "nanoid";

import { remapNoteletTypeIds } from "@/decorations/notelet-type-cascade";
import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt } from "@/infrastructure/result";
import { toFlowError, UnknownJournalError } from "@/journals/errors";
import { freeName } from "@/journals/free-name";
import type { TypeId } from "@/journals/notelets/config";
import { NoteletCommandService } from "@/journals/notelets/notelet-commands";
import { JournalsRepository } from "@/journals/repository";
import { SettingsUiService } from "@/settings";

import { journalEditSubpage } from "../ui/journals-subpage";
import { cloneJournalModal } from "../ui/modals";

export class CloneJournalFlow implements Flow<{ journalName: string }, { name: string }, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #repository = inject(JournalsRepository);
  readonly #noteletCommands = inject(NoteletCommandService);
  readonly #ui = inject(SettingsUiService);

  #suggestName(sourceName: string): string {
    return freeName(
      m.journal_clone_copy_name({ name: sourceName }),
      (index) => m.journal_clone_copy_name_indexed({ name: sourceName, index }),
      (candidate) => this.#repository.exists(candidate),
    );
  }

  execute(parameters: { journalName: string }): AsyncResult<{ name: string }, FlowError> {
    if (!this.#repository.exists(parameters.journalName)) {
      return AsyncResult.err(toFlowError(new UnknownJournalError(parameters.journalName)));
    }
    const suggestedName = this.#suggestName(parameters.journalName);
    return attempt.in(this, async function* (this: CloneJournalFlow) {
      const submitted = yield* this.#modals
        .open(cloneJournalModal, { sourceName: parameters.journalName, suggestedName })
        .mapErr(() => new UserAborted("clone-journal-modal"));

      // Re-read across the modal's await: the source's notelet types are what gets re-added below.
      const source = this.#repository.get(parameters.journalName).getOrUndefined();
      yield* this.#repository.clone(parameters.journalName, submitted.newName).mapErr(toFlowError);

      // clone() copies the notelets record verbatim, ids included, and ids are unique. Clear it,
      // then re-add each type with a fresh id and its own seeded command, so a cloned type is
      // indistinguishable from a hand-created one.
      this.#repository.update(submitted.newName, { notelets: {} });
      // Keyed by the source's *record* key, which a type's stored `id` is free to disagree with.
      const remapped = new Map<string, TypeId>();
      if (submitted.cloneNoteletTypes && source !== undefined) {
        for (const [sourceId, type] of Object.entries(source.notelets)) {
          const cloned = { ...cloneFnJSON(type), id: nanoid<TypeId>() };
          this.#repository.addNoteletType(submitted.newName, cloned);
          this.#noteletCommands.seed(submitted.newName, cloned);
          remapped.set(sourceId, cloned.id);
        }
      }
      if (source !== undefined) {
        this.#repository.update(submitted.newName, {
          decorations: remapNoteletTypeIds(cloneFnJSON(source.decorations), (id) => remapped.get(id)).decorations,
        });
      }

      this.#ui.push(journalEditSubpage, { journalName: submitted.newName });
      return { name: submitted.newName };
    });
  }
}
