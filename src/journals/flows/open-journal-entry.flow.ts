import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import type { Flow } from "@/infrastructure/flows";
import { TemplaterService, WorkspaceService } from "@/infrastructure/host";
import type { OpenMode, VaultPath, WorkspaceOpenError } from "@/infrastructure/host";
import { attempt } from "@/infrastructure/result";
import type { AsyncResult } from "@/infrastructure/result";

import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { NoteCreationService } from "../notes/note-creation";

import { journalPinGroup } from "./journal-pin-group";

import type { NoteCreationError } from "../notes/note-creation";
import type { PromptAnswer } from "../prompts/config";

export interface OpenJournalEntryParameters {
  journalName: string;
  anchor: AnchorString;
  openMode?: OpenMode;
  skipConfirmation?: boolean;
  unattended?: boolean;
  answers?: Readonly<Record<string, PromptAnswer>>;
  pinned?: boolean;
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
  readonly #templater = inject(TemplaterService);
  readonly #index = inject(JournalsIndex);

  execute(p: OpenJournalEntryParameters): AsyncResult<OpenJournalEntryResult, NoteCreationError | WorkspaceOpenError> {
    return attempt.in(this, async function* (this: OpenJournalEntryFlow) {
      const metadata = yield* this.#frontmatter.buildMetadata(p.journalName, p.anchor);
      const { path, created } = yield* this.#creation.ensureNote(p.journalName, metadata, {
        skipConfirmation: p.skipConfirmation,
        unattended: p.unattended,
        answers: p.answers,
      });
      const pin = p.pinned ? journalPinGroup(this.#index, p.journalName) : undefined;
      yield* this.#workspace.openNote(path, p.openMode ?? "active", pin);
      if (created) yield* this.#templater.cursorJump(path);
      return { path, created };
    });
  }
}
