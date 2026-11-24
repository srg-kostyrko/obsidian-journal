import { inject } from "@/infrastructure/di";
import { LoggerFactoryToken } from "@/infrastructure/logger";

import type { JournalDateFormatError } from "./errors";

/** Background work retries a broken format on every tick and event; the log hears it once. */
export class FormatFailureLog {
  readonly #logger = inject(LoggerFactoryToken).named("date-format");
  readonly #seen = new Set<string>();

  warnOnce(journalName: string, error: JournalDateFormatError): void {
    const key = JSON.stringify([journalName, error.pattern]);
    if (this.#seen.has(key)) return;
    this.#seen.add(key);
    this.#logger.warn("date format cannot be rendered on this device", {
      journalName,
      pattern: error.pattern,
      reason: error.reason,
    });
  }
}
