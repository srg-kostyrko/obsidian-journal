import { datePickerModal } from "@/calendar/ui/modals";
import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { UserAborted } from "@/infrastructure/flows";
import { defineSuggest, SuggestService } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt } from "@/infrastructure/result";
import { CycleService } from "@/journals/cycle";
import { JournalNotFoundError, NoJournalsError, OutOfTimelineError } from "@/journals/errors";
import { periodLabelOf } from "@/journals/notelets/ui/period-label";
import { pickingForWrite } from "@/journals/picking";
import { JournalsRepository } from "@/journals/repository";
import { TimelineService } from "@/journals/timeline";

import { MoveTargets, type MoveTarget } from "./containing";

const SOURCE = "move-task";

type PickPeriodError = UserAborted | JournalNotFoundError | NoJournalsError | OutOfTimelineError;

const journalSuggest = defineSuggest<string[], string>({
  placeholder: () => m.tasks_move_pick_journal(),
  fetch: (query, names) => names.filter((name) => name.toLowerCase().includes(query.toLowerCase())),
  render: (name) => name,
});

function rowText(target: MoveTarget, among: readonly MoveTarget[]): string {
  const ambiguous = among.some((other) => other.label === target.label && other.journalName !== target.journalName);
  return m.tasks_move_target_row({
    label: target.label,
    journal: target.journalName,
    notelet: target.noteletTitle ?? "",
    hasJournal: ambiguous ? "yes" : "no",
    hasNotelet: target.noteletTitle === undefined ? "no" : "yes",
  });
}

export class MoveTargetPicker {
  readonly #suggests = inject(SuggestService);
  readonly #modals = inject(ModalService);
  readonly #journals = inject(JournalsRepository);
  readonly #targets = inject(MoveTargets);
  readonly #cycle = inject(CycleService);
  readonly #timeline = inject(TimelineService);

  pickTarget(targets: readonly MoveTarget[]): AsyncResult<MoveTarget, UserAborted> {
    const [only] = targets;
    if (targets.length === 1 && only !== undefined) return AsyncResult.ok(only);
    // The suggest's render sees one row at a time, so the journal suffix is decided here and handed over.
    const rows = new Map(targets.map((target) => [target, rowText(target, targets)]));
    return this.#suggests
      .open(
        defineSuggest<readonly MoveTarget[], MoveTarget>({
          placeholder: () => m.tasks_move_pick_target(),
          fetch: (query) => {
            const needle = query.toLowerCase();
            return targets.filter((target) => (rows.get(target) ?? "").toLowerCase().includes(needle));
          },
          render: (target) => rows.get(target),
        }),
        targets,
      )
      .mapErr(() => new UserAborted(SOURCE));
  }

  pickPeriodTarget(): AsyncResult<MoveTarget, PickPeriodError> {
    return attempt.in(this, async function* (this: MoveTargetPicker) {
      const names = [...this.#journals.find().ids()];
      const [only] = names;
      if (only === undefined) return yield* AsyncResult.err(new NoJournalsError());
      const journalName =
        names.length === 1
          ? only
          : yield* this.#suggests.open(journalSuggest, names).mapErr(() => new UserAborted(SOURCE));
      const config = yield* this.#journals.get(journalName).okOrElse(() => new JournalNotFoundError(journalName));
      const period = yield* this.#modals
        .open(datePickerModal, {
          picking: pickingForWrite(config.write),
          bounds: this.#timeline.boundsOf(journalName),
        })
        .mapErr(() => new UserAborted(SOURCE));
      const anchor = yield* this.#cycle
        .anchorOf(journalName, period.anchor)
        .okOrElse(() => new OutOfTimelineError(journalName, period.anchor.toAnchor()));
      const start = this.#cycle.startOf(journalName, anchor).getOrUndefined();
      const end = this.#cycle.endOf(journalName, anchor).getOrUndefined();
      if (start === undefined || end === undefined)
        return yield* AsyncResult.err(new JournalNotFoundError(journalName));
      const label = periodLabelOf({
        start: start.toAnchor(),
        end: end.toAnchor(),
        kind: config.write.type === "custom" ? null : config.write.type,
      });
      return yield* this.pickTarget(this.#targets.targetsAt(journalName, anchor, label));
    });
  }
}
