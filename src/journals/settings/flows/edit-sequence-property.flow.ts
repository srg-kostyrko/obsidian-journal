import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { journalConfigCollection } from "../../config";
import { toFlowError, UnknownJournalError, UnknownSequenceSourceError } from "../errors";
import { editSequencePropertyModal } from "../ui/edit-sequence-property-modal";

export class EditSequencePropertyFlow implements Flow<
  { journalName: string; sourceIndex: number },
  { newValue: string },
  FlowError
> {
  readonly #modals = inject(ModalService);
  readonly #settings = inject(SettingsService);

  execute(parameters: { journalName: string; sourceIndex: number }): AsyncResult<{ newValue: string }, FlowError> {
    const collection = this.#settings.getCollection(journalConfigCollection);
    const config = collection.get(parameters.journalName);
    if (!config) {
      return AsyncResult.err(toFlowError(new UnknownJournalError(parameters.journalName)));
    }
    const source = config.numbering.sources[parameters.sourceIndex];
    if (!source) {
      return AsyncResult.err(
        toFlowError(new UnknownSequenceSourceError(parameters.journalName, parameters.sourceIndex)),
      );
    }
    return attempt.in(this, async function* (this: EditSequencePropertyFlow) {
      const submitted = yield* this.#modals
        .open(editSequencePropertyModal, {
          journalName: parameters.journalName,
          sourceIndex: parameters.sourceIndex,
        })
        .mapErr(() => new UserAborted("edit-sequence-property-modal"));
      source.frontmatterKey = submitted.newValue;
      return { newValue: submitted.newValue };
    });
  }
}
