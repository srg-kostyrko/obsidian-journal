import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt } from "@/infrastructure/result";
import { JournalsRepository, UnknownJournalError, toJournalFlowError, type NavBlockSegment } from "@/journals";

import { UnknownNavRowError, toNavRowFlowError } from "../errors";
import { editNavBlockRowModal } from "../ui/modals";

export interface EditNavBlockRowParameters {
  journalName: string;
  field?: "navBlock" | "intervalBlock";
  rowIndex?: number;
}

export interface EditNavBlockRowResult {
  row: NavBlockSegment;
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
    if (isEdit && (rowIndex < 0 || rowIndex >= config[field].lines.length)) {
      return AsyncResult.err(toNavRowFlowError(new UnknownNavRowError(parameters.journalName, rowIndex)));
    }
    // A line currently holds exactly one segment, so editing replaces the whole line.
    const existing = isEdit ? config[field].lines[rowIndex]?.[0] : undefined;
    return attempt.in(this, async function* (this: EditNavBlockRowFlow) {
      const submitted = yield* this.#modals
        .open(editNavBlockRowModal, { journalName: parameters.journalName, row: existing })
        .mapErr(() => new UserAborted("edit-nav-block-row-modal"));
      const nextLines = isEdit
        ? config[field].lines.map((line, i) => (i === rowIndex ? [submitted.row] : line))
        : [...config[field].lines, [submitted.row]];
      const nextBlock = { ...config[field], lines: nextLines };
      this.#repository.update(
        parameters.journalName,
        field === "navBlock" ? { navBlock: nextBlock } : { intervalBlock: nextBlock },
      );
      const newIndex = isEdit ? rowIndex : config[field].lines.length;
      return { row: submitted.row, index: newIndex };
    });
  }
}
