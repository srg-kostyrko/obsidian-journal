import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import type { Flow } from "@/infrastructure/flows";
import { WorkspaceService } from "@/infrastructure/host";
import type { OpenMode, VaultPath, WorkspaceOpenError } from "@/infrastructure/host";
import { attempt } from "@/infrastructure/result";
import type { AsyncResult } from "@/infrastructure/result";

import { FrontmatterService } from "../frontmatter";
import { NoteCreationService } from "../notes/note-creation";

import type { NoteCreationError } from "../notes/note-creation";

export interface OpenJournalEntryParameters {
  journalName: string;
  anchor: AnchorString;
  openMode?: OpenMode;
}

export interface OpenJournalEntryResult {
  path: VaultPath;
  created: boolean;
}

export class OpenJournalEntryFlow implements Flow<
  OpenJournalEntryParameters,
  OpenJournalEntryResult,
  NoteCreationError | WorkspaceOpenError
> {
  readonly #frontmatter = inject(FrontmatterService);
  readonly #creation = inject(NoteCreationService);
  readonly #workspace = inject(WorkspaceService);

  execute(p: OpenJournalEntryParameters): AsyncResult<OpenJournalEntryResult, NoteCreationError | WorkspaceOpenError> {
    return attempt.in(this, async function* (this: OpenJournalEntryFlow) {
      const metadata = yield* this.#frontmatter.buildMetadata(p.journalName, p.anchor);
      const { path, created } = yield* this.#creation.ensureNote(p.journalName, metadata);
      yield* this.#workspace.openNote(path, p.openMode ?? "active");
      return { path, created };
    });
  }
}
