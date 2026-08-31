import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt, Err } from "@/infrastructure/result";
import { toFlowError, UnknownJournalError, UnknownPromptError } from "@/journals/errors";
import { NoteConnectionService } from "@/journals/notes/note-connection";
import type { Prompt } from "@/journals/prompts/config";
import { JournalsRepository } from "@/journals/repository";

import { editPromptModal } from "../ui/modals";

interface PromptOwner {
  readonly prompts: readonly Prompt[];
}

export class EditPromptFlow implements Flow<
  { journalName: string; typeId?: string; promptIndex?: number },
  { variable: string },
  FlowError
> {
  readonly #modals = inject(ModalService);
  readonly #repository = inject(JournalsRepository);
  readonly #connection = inject(NoteConnectionService);

  execute(parameters: {
    journalName: string;
    typeId?: string;
    promptIndex?: number;
  }): AsyncResult<{ variable: string }, FlowError> {
    const configOpt = this.#repository.get(parameters.journalName);
    if (configOpt.isNone()) {
      return AsyncResult.err(toFlowError(new UnknownJournalError(parameters.journalName)));
    }
    const owner: PromptOwner | undefined =
      parameters.typeId === undefined ? configOpt.value : configOpt.value.notelets[parameters.typeId];
    if (owner === undefined) {
      return AsyncResult.err(toFlowError(new UnknownJournalError(parameters.journalName)));
    }
    const promptIndex = parameters.promptIndex;
    if (promptIndex !== undefined && owner.prompts.at(promptIndex) === undefined) {
      return AsyncResult.err(toFlowError(new UnknownPromptError(parameters.journalName, promptIndex)));
    }
    return attempt.in(this, async function* (this: EditPromptFlow) {
      const prompt = yield* this.#modals
        .open(editPromptModal, { journalName: parameters.journalName, typeId: parameters.typeId, promptIndex })
        .mapErr(() => new UserAborted("edit-prompt-modal"));

      // Re-read across the await: the journal or the type may be gone by the time the modal
      // closes, and a spread of the stale type would resurrect it as a partial object.
      const typeId = parameters.typeId;
      const config = this.#repository.get(parameters.journalName).getOrUndefined();
      const type = typeId === undefined ? undefined : config?.notelets[typeId];
      const current: PromptOwner | undefined = typeId === undefined ? config : type;
      if (config === undefined || current === undefined) {
        return yield* new Err(toFlowError(new UnknownJournalError(parameters.journalName)));
      }

      const oldKey = promptIndex === undefined ? undefined : current.prompts[promptIndex]?.frontmatterKey;
      const updatedPrompts =
        promptIndex === undefined
          ? [...current.prompts, prompt]
          : current.prompts.map((existing, i) => (i === promptIndex ? prompt : existing));

      if (typeId === undefined || type === undefined) {
        this.#repository.update(parameters.journalName, { prompts: updatedPrompts });
      } else {
        this.#repository.update(parameters.journalName, {
          notelets: { ...config.notelets, [typeId]: { ...type, prompts: updatedPrompts } },
        });
      }

      // Move the stored answer to the new key in every connected note so it survives the
      // rename instead of being stranded under the old key. "" is the sentinel for "not
      // stored" on either side, so there is nothing to move when either key is empty.
      //
      // A type's questions live on its notelets, and its key set is narrower than the
      // journal's — the same key on a period note is the journal's own answer, not this
      // type's, so the two walks must stay scoped apart.
      if (oldKey !== undefined && oldKey !== "" && prompt.frontmatterKey !== "" && prompt.frontmatterKey !== oldKey) {
        yield* type === undefined
          ? this.#connection.renameFieldAll(parameters.journalName, oldKey, prompt.frontmatterKey)
          : this.#connection.renameNoteletFieldForType(
              parameters.journalName,
              type.name,
              oldKey,
              prompt.frontmatterKey,
            );
      }
      return { variable: prompt.variable };
    });
  }
}
