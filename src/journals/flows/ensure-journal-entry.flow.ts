import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import type { Flow } from "@/infrastructure/flows";
import { attempt } from "@/infrastructure/result";
import type { AsyncResult } from "@/infrastructure/result";

import { FrontmatterService } from "../frontmatter";
import { NoteCreationService } from "../notes/note-creation";

import type { OpenJournalEntryResult } from "./open-journal-entry.flow";
import type { NoteCreationError } from "../notes/note-creation";

export interface EnsureJournalEntryParameters {
  journalName: string;
  anchor: AnchorString;
  skipConfirmation?: boolean;
}

/**
 * Creation without opening. OpenJournalEntryFlow keeps its own copy of these two steps
 * rather than invoking this one, because flows compose by yield*-ing operations.
 */
export class EnsureJournalEntryFlow implements Flow<
  EnsureJournalEntryParameters,
  OpenJournalEntryResult,
  NoteCreationError
> {
  readonly #frontmatter = inject(FrontmatterService);
  readonly #creation = inject(NoteCreationService);

  execute(p: EnsureJournalEntryParameters): AsyncResult<OpenJournalEntryResult, NoteCreationError> {
    return attempt.in(this, async function* (this: EnsureJournalEntryFlow) {
      const metadata = yield* this.#frontmatter.buildMetadata(p.journalName, p.anchor);
      return yield* this.#creation.ensureNote(p.journalName, metadata, {
        skipConfirmation: p.skipConfirmation,
      });
    });
  }
}
