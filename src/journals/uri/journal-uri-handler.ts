import { match } from "ts-pattern";

import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { NoticeService, UriService } from "@/infrastructure/host";
import type { UriParameters } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";

import { CycleService } from "../cycle";
import { OpenDateFlow } from "../flows/open-date.flow";
import { NoApplicableJournals } from "../notes/errors";
import { JournalsRepository } from "../repository";

import { parseJournalUriRequest } from "./parse-request";

import type { UriError } from "./errors";
import type { JournalUriRequest } from "./parse-request";

const URI_ACTION = "journals";

export class JournalUriHandler {
  readonly #uri = inject(UriService);
  readonly #flows = inject(Flows);
  readonly #journals = inject(JournalsRepository);
  readonly #cycle = inject(CycleService);
  readonly #notices = inject(NoticeService);
  readonly #logger = inject(LoggerFactoryToken).named("journal-uri");

  async #handle(parameters: UriParameters): Promise<void> {
    const parsed = parseJournalUriRequest(parameters);
    if (parsed.isErr()) {
      this.#notices.show(this.#messageFor(parsed.error));
      return;
    }

    const { target, date, openMode } = parsed.value;

    if (target.kind === "journal" && this.#journals.get(target.name).isNone()) {
      this.#notices.show(m.uri_unknown_journal({ journal: target.name }));
      return;
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

    const result = await this.#flows.invoke(OpenDateFlow, {
      anchor: anchor.value,
      journalNames: candidates,
      openMode,
      existingOnly: false,
    });

    if (result.isErr()) {
      const { error } = result;
      if (error instanceof UserAborted) return;
      if (error instanceof NoApplicableJournals) {
        this.#notices.show(m.uri_no_journal());
        return;
      }
      this.#logger.error("journal uri open failed", { error });
      this.#notices.show(m.uri_open_failed());
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
      .exhaustive();
  }

  initialize(): void {
    this.#uri.register(URI_ACTION, (parameters) => {
      void this.#handle(parameters);
    });
  }
}
