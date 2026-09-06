import { match } from "ts-pattern";

import type { CalendarDate } from "@/calendar";
import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { NoticeService, UriService } from "@/infrastructure/host";
import type { OpenMode, UriParameters } from "@/infrastructure/host";

import { CycleService } from "../cycle";
import { OutOfTimelineError } from "../errors";
import { OpenDateFlow } from "../flows/open-date.flow";
import { noteletTypeByName } from "../notelets/config";
import { CreateNoteletFlow } from "../notelets/flows/create-notelet.flow";
import { NoApplicableJournals } from "../notes/errors";
import { JournalsRepository } from "../repository";

import { parseJournalUriRequest } from "./parse-request";

import type { UriError } from "./errors";
import type { JournalUriRequest } from "./parse-request";
import type { JournalConfig } from "../config";

const URI_ACTION = "journals";

export class JournalUriHandler {
  readonly #uri = inject(UriService);
  readonly #flows = inject(Flows);
  readonly #journals = inject(JournalsRepository);
  readonly #cycle = inject(CycleService);
  readonly #notices = inject(NoticeService);

  async #handle(parameters: UriParameters): Promise<void> {
    const parsed = parseJournalUriRequest(parameters);
    if (parsed.isErr()) {
      this.#notices.show(this.#messageFor(parsed.error));
      return;
    }

    const { target, date, openMode } = parsed.value;

    if (target.kind === "journal") {
      const config = this.#journals.get(target.name);
      if (config.isNone()) {
        this.#notices.show(m.uri_unknown_journal({ journal: target.name }));
        return;
      }
      // A notelet type name is only unique within its journal, so this target is always a single
      // named journal and the candidate machinery below never applies to it.
      if (parsed.value.notelet !== undefined) {
        await this.#createNotelet(config.value, target.name, parsed.value.notelet, date, openMode);
        return;
      }
    }

    const candidates = this.#candidates(parsed.value);
    const [representative] = candidates;
    if (representative === undefined) {
      this.#notices.show(
        target.kind === "type" ? m.uri_no_journal_of_type({ type: target.writeType }) : m.uri_no_journal(),
      );
      return;
    }

    const anchor = this.#cycle.anchorOf(representative, date);
    if (anchor.isNone()) {
      this.#notices.show(m.uri_no_journal());
      return;
    }

    const result = await this.#flows.invoke(
      OpenDateFlow,
      {
        anchor: anchor.value,
        journalNames: candidates,
        openMode,
        existingOnly: false,
      },
      // This handler distinguishes the URI failure modes below with better copy.
      { notify: false },
    );

    if (result.isErr()) {
      const { error } = result;
      if (error instanceof UserAborted) return;
      if (error instanceof NoApplicableJournals) {
        this.#notices.show(m.uri_no_journal());
        return;
      }
      this.#notices.show(m.uri_open_failed());
    }
  }

  async #createNotelet(
    config: JournalConfig,
    journalName: string,
    typeName: string,
    date: CalendarDate,
    openMode: OpenMode,
  ): Promise<void> {
    const found = noteletTypeByName(config, typeName);
    if (found.isNone()) {
      this.#notices.show(m.uri_unknown_notelet_type({ journal: journalName, type: typeName }));
      return;
    }

    const anchor = this.#cycle.anchorOf(journalName, date);
    if (anchor.isNone()) {
      this.#notices.show(m.uri_no_journal());
      return;
    }

    // The type's own prompts are asked normally: a URI click is a user action with someone at the
    // keyboard, so this never runs unattended.
    const result = await this.#flows.invoke(
      CreateNoteletFlow,
      { journalName, typeId: found.value[0], anchor: anchor.value, openMode },
      // This handler distinguishes the URI failure modes below with better copy.
      { notify: false },
    );

    if (result.isErr()) {
      const { error } = result;
      // A dismissed prompt modal is a deliberate cancel, so it stays silent.
      if (error instanceof UserAborted) return;
      // The same user error the period path reports for a date its journal does not cover.
      if (error instanceof OutOfTimelineError) {
        this.#notices.show(m.uri_no_journal());
        return;
      }
      this.#notices.show(m.uri_notelet_failed());
    }
  }

  #candidates(request: JournalUriRequest): string[] {
    if (request.target.kind === "journal") return [request.target.name];
    const { writeType } = request.target;
    return [...this.#journals.find().entries()]
      .filter(([, config]) => config.write.type === writeType)
      .map(([name]) => name);
  }

  #messageFor(error: UriError): string {
    return match(error)
      .with({ kind: "missing-target" }, () => m.uri_missing_target())
      .with({ kind: "unknown-write-type" }, (writeTypeError) =>
        m.uri_unknown_write_type({ type: writeTypeError.value }),
      )
      .with({ kind: "invalid-date" }, (dateError) => m.uri_invalid_date({ date: dateError.value }))
      .with({ kind: "invalid-mode" }, (modeError) => m.uri_invalid_mode({ mode: modeError.value }))
      .with({ kind: "notelet-requires-journal" }, () => m.uri_notelet_requires_journal())
      .exhaustive();
  }

  initialize(): void {
    this.#uri.register(URI_ACTION, (parameters) => {
      void this.#handle(parameters);
    });
  }
}
