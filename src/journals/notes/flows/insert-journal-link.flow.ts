import { match } from "ts-pattern";

import type { Picking } from "@/calendar/ui";
import { datePickerModal } from "@/calendar/ui/modals";
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow } from "@/infrastructure/flows";
import { SuggestService, WorkspaceService } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import { JournalNotFoundError } from "../../errors";
import { JournalsRepository } from "../../repository";
import { journalPickerSuggest } from "../journal-picker";
import { NotePathService } from "../note-path";

import type { JournalWrite } from "../../config";

type InsertJournalLinkError = UserAborted | JournalNotFoundError;

function pickingFor(write: JournalWrite): Picking {
  return match(write)
    .with({ type: "week" }, () => "week" as const)
    .with({ type: "month" }, () => "month" as const)
    .with({ type: "quarter" }, () => "quarter" as const)
    .with({ type: "year" }, () => "year" as const)
    .otherwise(() => "day" as const);
}

export class InsertJournalLinkFlow implements Flow<void, void, InsertJournalLinkError> {
  readonly #suggests = inject(SuggestService);
  readonly #modals = inject(ModalService);
  readonly #journals = inject(JournalsRepository);
  readonly #path = inject(NotePathService);
  readonly #workspace = inject(WorkspaceService);

  execute(): AsyncResult<void, InsertJournalLinkError> {
    return attempt.in(this, async function* (this: InsertJournalLinkFlow) {
      const names = [...this.#journals.find().ids()];
      const [only] = names;
      const journalName =
        names.length === 1 && only !== undefined
          ? only
          : yield* this.#suggests
              .open(journalPickerSuggest, names)
              .mapErr(() => new UserAborted("insert-journal-link"));

      const config = yield* this.#journals.get(journalName).okOrElse(() => new JournalNotFoundError(journalName));
      const period = yield* this.#modals
        .open(datePickerModal, { picking: pickingFor(config.write) })
        .mapErr(() => new UserAborted("insert-journal-link"));

      const path = yield* this.#path.pathForDate(journalName, period.anchor);
      this.#workspace.insertNoteLinkAtCursor(path);
      return;
    });
  }
}
