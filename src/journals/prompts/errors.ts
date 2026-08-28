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
