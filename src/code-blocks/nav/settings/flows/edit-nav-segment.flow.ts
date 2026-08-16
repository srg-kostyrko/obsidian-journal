import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt } from "@/infrastructure/result";
import { JournalsRepository, UnknownJournalError, toJournalFlowError, type NavBlockSegment } from "@/journals";

import { UnknownNavSegmentError, toNavSegmentFlowError } from "../errors";
import { editNavBlockSegmentModal } from "../ui/modals";

export interface EditNavBlockSegmentParameters {
  journalName: string;
  field?: "navBlock" | "intervalBlock";
  lineIndex?: number;
  segmentIndex?: number;
}

export interface EditNavBlockSegmentResult {
  segment: NavBlockSegment;
  lineIndex: number;
  segmentIndex: number;
}

export class EditNavBlockSegmentFlow implements Flow<
  EditNavBlockSegmentParameters,
  EditNavBlockSegmentResult,
  FlowError
> {
  readonly #modals = inject(ModalService);
  readonly #repository = inject(JournalsRepository);

  execute(parameters: EditNavBlockSegmentParameters): AsyncResult<EditNavBlockSegmentResult, FlowError> {
    const field = parameters.field ?? "navBlock";
    const configOption = this.#repository.get(parameters.journalName);
    if (configOption.isNone()) {
      return AsyncResult.err(toJournalFlowError(new UnknownJournalError(parameters.journalName)));
    }
    const config = configOption.value;
    const { lineIndex, segmentIndex } = parameters;
    if (lineIndex !== undefined && (lineIndex < 0 || lineIndex >= config[field].lines.length)) {
      return AsyncResult.err(toNavSegmentFlowError(new UnknownNavSegmentError(parameters.journalName, lineIndex)));
    }
    const line = lineIndex === undefined ? undefined : config[field].lines[lineIndex];
    if (line && segmentIndex !== undefined && (segmentIndex < 0 || segmentIndex >= line.length)) {
      return AsyncResult.err(toNavSegmentFlowError(new UnknownNavSegmentError(parameters.journalName, segmentIndex)));
    }
    const existing = line && segmentIndex !== undefined ? line[segmentIndex] : undefined;
    return attempt.in(this, async function* (this: EditNavBlockSegmentFlow) {
      const submitted = yield* this.#modals
        .open(editNavBlockSegmentModal, { journalName: parameters.journalName, segment: existing })
        .mapErr(() => new UserAborted("edit-nav-block-segment-modal"));
      const nextLines =
        lineIndex === undefined
          ? [...config[field].lines, [submitted.segment]]
          : config[field].lines.map((existingLine, i) => {
              if (i !== lineIndex) return existingLine;
              if (segmentIndex === undefined) return [...existingLine, submitted.segment];
              return existingLine.map((seg, segIndex) => (segIndex === segmentIndex ? submitted.segment : seg));
            });
      const nextBlock = { ...config[field], lines: nextLines };
      this.#repository.update(
        parameters.journalName,
        field === "navBlock" ? { navBlock: nextBlock } : { intervalBlock: nextBlock },
      );
      const newLineIndex = lineIndex ?? config[field].lines.length;
      const newSegmentIndex = segmentIndex ?? (lineIndex === undefined ? 0 : (line?.length ?? 0));
      return { segment: submitted.segment, lineIndex: newLineIndex, segmentIndex: newSegmentIndex };
    });
  }
}
