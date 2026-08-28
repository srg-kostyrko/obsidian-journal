import { inject } from "@/infrastructure/di";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { basenameOf, NotesService } from "@/infrastructure/host";
import type {
  FrontmatterError,
  NoteCreateError,
  NoteNotFoundError,
  NoteReadError,
  NoteWriteError,
  VaultPath,
} from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, Err, attempt } from "@/infrastructure/result";
import type { TemplateRenderError } from "@/templates";

import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { PromptsUnansweredError } from "../prompts/errors";
import { GatherPromptAnswersFlow } from "../prompts/flows/gather-prompt-answers.flow";
import { unattendedOutcome } from "../prompts/unattended-rule";
import { JournalsRepository } from "../repository";

import { AnchorOccupiedError, type EmptyNoteNameError } from "./errors";
import { NotePathService } from "./note-path";
import { SelfWriteGuard } from "./self-write-guard";
import { TemplateContentService } from "./template-content";
import { confirmCreationModal } from "./ui/modals";

import type { JournalNotFoundError } from "../errors";
import type { PromptAnswer } from "../prompts/config";
import type { JournalMetadata } from "../types";

export type NoteCreationError =
  | JournalNotFoundError
  | EmptyNoteNameError
  | TemplateRenderError
  | NoteReadError
  | NoteCreateError
  | NoteWriteError
  | NoteNotFoundError
  | FrontmatterError
  | AnchorOccupiedError
  | PromptsUnansweredError
  | UserAborted;

export class NoteCreationService {
  readonly #notes = inject(NotesService);
  readonly #index = inject(JournalsIndex);
  readonly #path = inject(NotePathService);
  readonly #journals = inject(JournalsRepository);
  readonly #content = inject(TemplateContentService);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #modals = inject(ModalService);
  readonly #guard = inject(SelfWriteGuard);
  readonly #flows = inject(Flows);

  ensureNote(
    name: string,
    metadata: JournalMetadata,
    options?: { skipConfirmation?: boolean; unattended?: boolean },
  ): AsyncResult<{ path: VaultPath; created: boolean }, NoteCreationError> {
    const mutatorResult = this.#frontmatter.writeMutator(name, metadata);
    if (mutatorResult.kind === "err") return AsyncResult.err(mutatorResult.error);

    // A connected note may live away from the config-derived path (renamed, moved,
    // or connected in place); the index knows its real location — reuse it instead
    // of spawning a duplicate at the derived path. It stays ahead of the prompt:
    // reopening a note this journal already has must never ask again.
    const indexed = this.#index.entryByAnchor(name, metadata.anchor);
    if (indexed.isSome() && this.#notes.find(indexed.value.path).isSome()) {
      const indexedPath = indexed.value.path;
      return this.#notes
        .updateFrontmatter(indexedPath, mutatorResult.value)
        .map(() => ({ path: indexedPath, created: false as const }));
    }

    return attempt.in(this, async function* () {
      const config = this.#journals.get(name).getOrUndefined();
      const confirming = !(options?.skipConfirmation ?? false) && (config?.confirmCreation ?? false);

      // The unattended rule is a pure function; only the attended path opens a modal, and it
      // does so through a flow so aborts, timing and failure notices match every other modal.
      let answers: Record<string, PromptAnswer> = {};
      if (config !== undefined && config.prompts.length > 0) {
        if (options?.unattended ?? false) {
          const outcome = unattendedOutcome(config);
          if (outcome.kind === "refuse") {
            return yield* new Err(new PromptsUnansweredError(name, outcome.reason));
          }
        } else {
          answers = yield* this.#flows
            .invoke(
              GatherPromptAnswersFlow,
              { journalName: name, anchor: metadata.anchor, confirming },
              { notify: false },
            )
            .mapErr((error) => error as NoteCreationError);
        }
      }
      const answered: JournalMetadata =
        Object.keys(answers).length > 0 ? { ...metadata, answers: { ...metadata.answers, ...answers } } : metadata;

      // Rebuilt from the answered metadata. The mutator above closes over the pre-prompt
      // metadata, so reusing it here would drop every answer on the floor with nothing failing.
      const mutator = yield* this.#frontmatter.writeMutator(name, answered);

      // A connected note is reachable above without ever needing a resolvable
      // configured path, so the empty-name guard must gate creation only — deriving
      // it any earlier would block opening a note this journal already has. It also
      // has to follow the prompt, because an answer can reach the note name.
      const path = yield* this.#path.pathFor(name, answered);

      if (this.#notes.find(path).isSome()) {
        yield* this.#notes.updateFrontmatter(path, mutator);
        return { path, created: false as const };
      }

      // The answer modal carries the note name and its own Cancel, so it is the confirmation
      // for a prompting journal; a second dialog would ask the same question twice.
      if (confirming && (config?.prompts.length ?? 0) === 0) {
        const confirmed = yield* this.#modals
          .open(confirmCreationModal, { journalName: name, noteName: basenameOf(path) })
          .mapErr(() => new UserAborted("confirm-creation") as NoteCreationError);
        if (!confirmed) return yield* new Err(new UserAborted("confirm-creation"));
      }
      this.#guard.mark(path);
      const createResult = await this.#notes.create(path, "");
      if (createResult.isErr()) {
        this.#guard.release(path);
        return yield* new Err(createResult.error as NoteCreationError);
      }
      const content = yield* this.#content
        .renderFor(name, answered, basenameOf(path), path)
        .tapErr(() => this.#guard.release(path));
      if (content !== "") {
        yield* this.#notes.write(path, content).tapErr(() => this.#guard.release(path));
      }
      yield* this.#notes.updateFrontmatter(path, mutator).tapErr(() => this.#guard.release(path));
      return { path, created: true as const };
    });
  }

  attachNote(name: string, path: VaultPath, metadata: JournalMetadata): AsyncResult<void, NoteCreationError> {
    const mutatorResult = this.#frontmatter.writeMutator(name, metadata);
    if (mutatorResult.kind === "err") return AsyncResult.err(mutatorResult.error);
    const mutator = mutatorResult.value;

    return attempt.in(this, async function* () {
      // One note per anchor: a stray file whose name parses to a date inside an occupied
      // period must not claim that period's slot, or the anchor ends up with two notes and
      // the index keeps only one as its owner. The occupant's file must still be there —
      // a connect that just freed the slot by renaming or trashing its note leaves a stale
      // entry behind until the vault events land.
      const occupant = this.#index.entryByAnchor(name, metadata.anchor);
      if (occupant.isSome() && occupant.value.path !== path && this.#notes.find(occupant.value.path).isSome()) {
        return yield* new Err(new AnchorOccupiedError(name, metadata.anchor, occupant.value.path));
      }

      // Emptiness must be judged against the note's original body: writing frontmatter fills
      // the file (Obsidian embeds a `---` block), which would otherwise make a freshly
      // link-created note look non-empty and skip its template. Render into the empty note
      // first, then attach frontmatter last — matching ensureNote's order.
      const existing = yield* this.#notes.read(path);
      if (existing.trim() === "") {
        const content = yield* this.#content.renderFor(name, metadata, basenameOf(path), path);
        if (content !== "") yield* this.#notes.write(path, content);
      }
      yield* this.#notes.updateFrontmatter(path, mutator);
    });
  }
}
