import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt } from "@/infrastructure/result";
import { toFlowError, UnknownJournalError, UnknownPromptError } from "@/journals/errors";
import { NoteConnectionService } from "@/journals/notes/note-connection";
import { JournalsRepository } from "@/journals/repository";

import { editPromptModal } from "../ui/modals";

export class EditPromptFlow implements Flow<
  { journalName: string; promptIndex?: number },
  { variable: string },
  FlowError
> {
  readonly #modals = inject(ModalService);
  readonly #repository = inject(JournalsRepository);
  readonly #connection = inject(NoteConnectionService);

  execute(parameters: { journalName: string; promptIndex?: number }): AsyncResult<{ variable: string }, FlowError> {
    const configOpt = this.#repository.get(parameters.journalName);
    if (configOpt.isNone()) {
      return AsyncResult.err(toFlowError(new UnknownJournalError(parameters.journalName)));
    }
    const config = configOpt.value;
    const promptIndex = parameters.promptIndex;
    if (promptIndex !== undefined && config.prompts.at(promptIndex) === undefined) {
      return AsyncResult.err(toFlowError(new UnknownPromptError(parameters.journalName, promptIndex)));
    }
    return attempt.in(this, async function* (this: EditPromptFlow) {
      const prompt = yield* this.#modals
        .open(editPromptModal, { journalName: parameters.journalName, promptIndex })
        .mapErr(() => new UserAborted("edit-prompt-modal"));

      const oldKey = promptIndex === undefined ? undefined : config.prompts[promptIndex]?.frontmatterKey;
      const updatedPrompts =
        promptIndex === undefined
          ? [...config.prompts, prompt]
          : config.prompts.map((existing, i) => (i === promptIndex ? prompt : existing));

      this.#repository.update(parameters.journalName, { prompts: updatedPrompts });

      // Move the stored answer to the new key in every connected note so it survives the
      // rename instead of being stranded under the old key. "" is the sentinel for "not
      // stored" on either side, so there is nothing to move when either key is empty.
      if (oldKey !== undefined && oldKey !== "" && prompt.frontmatterKey !== "" && prompt.frontmatterKey !== oldKey) {
        yield* this.#connection.renameFieldAll(parameters.journalName, oldKey, prompt.frontmatterKey);
      }
      return { variable: prompt.variable };
    });
  }
}
