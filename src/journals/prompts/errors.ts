import { JournalsError } from "../errors";

/**
 * An unattended creation that cannot proceed without asking: `unattendedOutcome` refused it
 * because an answer reaches the note name, or because a prompt is required.
 */
export class PromptsUnansweredError extends JournalsError {
  override name = "PromptsUnansweredError";

  constructor(
    readonly journalName: string,
    readonly reason: "in-path" | "required",
  ) {
    super(
      reason === "in-path"
        ? `Journal ${journalName} needs a prompt answer for its note name and cannot be created unattended`
        : `Journal ${journalName} has a required prompt and cannot be created unattended`,
    );
  }
}

/** The user dismissed the journal or date picker while choosing a journal note to link. */
export class JournalNoteLinkCancelledError extends JournalsError {
  override name = "JournalNoteLinkCancelledError";

  constructor() {
    super("Choosing a journal note to link was cancelled");
  }
}

/** A journal whose note names use answers has no path for a note it has not created yet. */
export class NamedByAnswersError extends JournalsError {
  override name = "NamedByAnswersError";

  constructor(readonly journalName: string) {
    super(`Journal ${journalName} names its notes after answers, so a note it has not created has no path to link`);
  }
}
