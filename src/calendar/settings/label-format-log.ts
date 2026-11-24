import { inject } from "@/infrastructure/di";
import { LoggerFactoryToken } from "@/infrastructure/logger";

import type { DateFormatError } from "../errors";

/** A calendar label falls back on every render; the log hears each unrenderable pattern once. */
export class LabelFormatLog {
  readonly #logger = inject(LoggerFactoryToken).named("date-format");
  readonly #seen = new Set<string>();

  warnOnce(error: DateFormatError): void {
    if (this.#seen.has(error.pattern)) return;
    this.#seen.add(error.pattern);
    this.#logger.warn("calendar label format cannot be rendered on this device; using the default", {
      pattern: error.pattern,
      reason: error.reason,
    });
  }
}
