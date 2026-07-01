import type { AnchorString } from "@/calendar";
import type { BenignFlowError } from "@/infrastructure/flows";

import { JournalsError } from "../errors";

export abstract class JournalNoteCreationError extends JournalsError {
  override name = "JournalNoteCreationError";
}

export class NoApplicableJournals extends JournalNoteCreationError implements BenignFlowError {
  override name = "NoApplicableJournals";
  readonly kind = "no-applicable-journals" as const;
  readonly benign = true as const;

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

export class AnchorOccupiedError extends JournalsError {
  override name = "AnchorOccupiedError";

  constructor(
    readonly journalName: string,
    readonly anchor: AnchorString,
    readonly occupantPath: string,
  ) {
    super(`Anchor ${anchor} in journal ${journalName} is already held by ${occupantPath}`);
  }
}
