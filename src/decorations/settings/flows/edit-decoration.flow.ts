import { toDecorationFlowError, UnknownDecorationError, type JournalDecoration } from "@/decorations";
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, AsyncResult } from "@/infrastructure/result";
import { toJournalFlowError, UnknownJournalError } from "@/journals";
import { JournalsRepository } from "@/journals/repository";

import { editDecorationModal } from "../ui/modals";

export interface EditDecorationParameters {
  journalName: string;
  index?: number;
}

export interface EditDecorationResult {
  decoration: JournalDecoration;
  index: number;
}

export class EditDecorationFlow implements Flow<EditDecorationParameters, EditDecorationResult, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #repository = inject(JournalsRepository);

  execute(parameters: EditDecorationParameters): AsyncResult<EditDecorationResult, FlowError> {
    const configOption = this.#repository.get(parameters.journalName);
    if (configOption.isNone()) {
      return AsyncResult.err(toJournalFlowError(new UnknownJournalError(parameters.journalName)));
    }
    const config = configOption.getOr(undefined as never);
    const index = parameters.index;
    const isEdit = index !== undefined;
    if (isEdit && (index < 0 || index >= config.decorations.length)) {
      return AsyncResult.err(toDecorationFlowError(new UnknownDecorationError(parameters.journalName, index)));
    }
    const existing = isEdit ? config.decorations[index] : undefined;
    return attempt.in(this, async function* (this: EditDecorationFlow) {
      const submitted = yield* this.#modals
        .open(editDecorationModal, {
          journalName: parameters.journalName,
          decoration: existing,
          writeType: config.write.type,
        })
        .mapErr(() => new UserAborted("edit-decoration-modal"));
      const nextDecorations = isEdit
        ? config.decorations.map((d, i) => (i === index ? submitted.decoration : d))
        : [...config.decorations, submitted.decoration];
      this.#repository.update(parameters.journalName, { decorations: nextDecorations });
      const newIndex = isEdit ? index : config.decorations.length;
      return { decoration: submitted.decoration, index: newIndex };
    });
  }
}
