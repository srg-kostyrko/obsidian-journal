import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt } from "@/infrastructure/result";
import { JournalsRepository, UnknownJournalError, toJournalFlowError, type NavBlockRow } from "@/journals";

import { UnknownNavRowError, toNavRowFlowError } from "../errors";
import { editNavBlockRowModal } from "../ui/modals";

export interface EditNavBlockRowParameters {
  journalName: string;
  rowIndex?: number;
}

export interface EditNavBlockRowResult {
  row: NavBlockRow;
  index: number;
}

export class EditNavBlockRowFlow implements Flow<EditNavBlockRowParameters, EditNavBlockRowResult, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #repository = inject(JournalsRepository);

  execute(parameters: EditNavBlockRowParameters): AsyncResult<EditNavBlockRowResult, FlowError> {
    const configOption = this.#repository.get(parameters.journalName);
    if (configOption.isNone()) {
      return AsyncResult.err(toJournalFlowError(new UnknownJournalError(parameters.journalName)));
    }
    const config = configOption.getOr(undefined as never);
    const rowIndex = parameters.rowIndex;
    const isEdit = rowIndex !== undefined;
    if (isEdit && (rowIndex < 0 || rowIndex >= config.navBlock.rows.length)) {
      return AsyncResult.err(toNavRowFlowError(new UnknownNavRowError(parameters.journalName, rowIndex)));
    }
    const existing = isEdit ? config.navBlock.rows[rowIndex] : undefined;
    return attempt.in(this, async function* (this: EditNavBlockRowFlow) {
      const submitted = yield* this.#modals
        .open(editNavBlockRowModal, { journalName: parameters.journalName, row: existing })
        .mapErr(() => new UserAborted("edit-nav-block-row-modal"));
      const nextRows = isEdit
        ? config.navBlock.rows.map((r, i) => (i === rowIndex ? submitted.row : r))
        : [...config.navBlock.rows, submitted.row];
      this.#repository.update(parameters.journalName, {
        navBlock: { ...config.navBlock, rows: nextRows },
      });
      const newIndex = isEdit ? rowIndex : config.navBlock.rows.length;
      return { row: submitted.row, index: newIndex };
    });
  }
}
