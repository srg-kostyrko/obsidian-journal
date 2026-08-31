import type { AnchorString } from "@/calendar";
import { m } from "@/i18n";
import type { BenignFlowError, UserFacingFlowError } from "@/infrastructure/flows";

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

export class NotePathClaimedError extends JournalsError implements UserFacingFlowError {
  override name = "NotePathClaimedError";

  constructor(
    readonly journalName: string,
    readonly path: string,
    readonly claimedBy: string,
  ) {
    super(`Path ${path} derived for journal ${journalName} is already claimed by journal ${claimedBy}`);
  }

  get userNotice(): string {
    return m.journal_note_path_claimed_notice({
      journalName: this.journalName,
      path: this.path,
      claimedBy: this.claimedBy,
    });
  }
}

export class NoteletHoldsPathError extends JournalsError implements UserFacingFlowError {
  override name = "NoteletHoldsPathError";

  constructor(
    readonly journalName: string,
    readonly path: string,
  ) {
    super(`Path ${path} derived for journal ${journalName} holds one of its own notelets`);
  }

  get userNotice(): string {
    return m.journal_note_path_notelet_notice({ journalName: this.journalName, path: this.path });
  }
}

export class EmptyNoteNameError extends JournalsError implements UserFacingFlowError {
  override name = "EmptyNoteNameError";

  constructor(readonly journalName: string) {
    super(`Name template of journal ${journalName} resolves to an empty note name`);
  }

  get userNotice(): string {
    return m.journal_note_name_empty_notice({ journalName: this.journalName });
  }
}
