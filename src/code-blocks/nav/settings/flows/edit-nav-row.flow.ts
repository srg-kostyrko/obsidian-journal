import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt } from "@/infrastructure/result";
import { JournalsRepository, UnknownJournalError, toJournalFlowError, type NavBlockRow } from "@/journals";

import { UnknownNavRowError, toNavRowFlowError } from "../errors";
import { editNavBlockRowModal } from "../ui/modals";

export interface EditNavBlockRowParameters {
  journalName: string;
  field?: "navBlock" | "intervalBlock";
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
    const field = parameters.field ?? "navBlock";
    const configOption = this.#repository.get(parameters.journalName);
    if (configOption.isNone()) {
      return AsyncResult.err(toJournalFlowError(new UnknownJournalError(parameters.journalName)));
    }
    const config = configOption.value;
    const rowIndex = parameters.rowIndex;
    const isEdit = rowIndex !== undefined;
    if (isEdit && (rowIndex < 0 || rowIndex >= config[field].rows.length)) {
      return AsyncResult.err(toNavRowFlowError(new UnknownNavRowError(parameters.journalName, rowIndex)));
    }
    const existing = isEdit ? config[field].rows[rowIndex] : undefined;
    return attempt.in(this, async function* (this: EditNavBlockRowFlow) {
      const submitted = yield* this.#modals
        .open(editNavBlockRowModal, { journalName: parameters.journalName, row: existing })
        .mapErr(() => new UserAborted("edit-nav-block-row-modal"));
      const nextRows = isEdit
        ? config[field].rows.map((r, i) => (i === rowIndex ? submitted.row : r))
        : [...config[field].rows, submitted.row];
      const nextBlock = { ...config[field], rows: nextRows };
      this.#repository.update(
        parameters.journalName,
        field === "navBlock" ? { navBlock: nextBlock } : { intervalBlock: nextBlock },
      );
      const newIndex = isEdit ? rowIndex : config[field].rows.length;
      return { row: submitted.row, index: newIndex };
    });
  }
}
