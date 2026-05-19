import type { AnchorString } from "@/calendar";

import { JournalsError } from "../errors";

export abstract class JournalNoteCreationError extends JournalsError {
  override name = "JournalNoteCreationError";
}

export class NoApplicableJournals extends JournalNoteCreationError {
  override name = "NoApplicableJournals";
  readonly kind = "no-applicable-journals" as const;

  constructor(
    readonly anchor: AnchorString,
    readonly requested?: readonly string[],
  ) {
    super(
      requested
        ? `No applicable journals for ${anchor} among ${requested.join(", ")}`
        : `No applicable journals for ${anchor}`,
    );
  }
}
