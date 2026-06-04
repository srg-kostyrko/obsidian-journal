import { moment } from "obsidian";

import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import type { Flow } from "@/infrastructure/flows";
import { NoticeService, NotesService } from "@/infrastructure/host";
import type { NoteAlreadyExistsError, NoteCreateError, VaultPath } from "@/infrastructure/host";
import { BufferSinkToken } from "@/infrastructure/logger";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import { formatLogDump } from "./format-dump";

type DumpLogsError = NoteCreateError | NoteAlreadyExistsError;

type MomentFactory = () => moment.Moment;

export class DumpLogsFlow implements Flow<void, void, DumpLogsError> {
  readonly #buffer = inject(BufferSinkToken);
  readonly #notes = inject(NotesService);
  readonly #notices = inject(NoticeService);

  execute(): AsyncResult<void, DumpLogsError> {
    return attempt.in(this, async function* (this: DumpLogsFlow) {
      const records = this.#buffer.snapshot();
      if (records.length === 0) {
        this.#notices.show(m.logging_dump_empty());
        return;
      }
      const now = (moment as unknown as MomentFactory)();
      const path = `journal-log-${now.format("YYYYMMDD-HHmmss")}.md` as VaultPath;
      const note = yield* this.#notes
        .create(path, formatLogDump(records))
        .tapErr(() => this.#notices.show(m.logging_dump_failed()));
      this.#notices.show(m.logging_dump_succeeded({ path: note.path }));
      return;
    });
  }
}
