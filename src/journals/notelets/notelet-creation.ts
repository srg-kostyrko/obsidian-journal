import type { AnchorString } from "@/calendar";
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
import { type AsyncResult, Err, attempt } from "@/infrastructure/result";
import type { TemplateRenderError } from "@/templates";

import { JournalNotFoundError, NoteletTypeNotFoundError, OutOfTimelineError } from "../errors";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { SelfWriteGuard } from "../notes/self-write-guard";
import { TemplateContentService } from "../notes/template-content";
import { confirmCreationModal } from "../notes/ui/modals";
import { PromptsUnansweredError } from "../prompts/errors";
import { GatherPromptAnswersFlow } from "../prompts/flows/gather-prompt-answers.flow";
import { unattendedOutcome } from "../prompts/unattended-rule";
import { JournalsRepository } from "../repository";
import { TimelineService } from "../timeline";

import { NoteletPathService } from "./notelet-path";

import type { TypeId } from "./config";
import type { EmptyNoteNameError } from "../notes/errors";
import type { PromptAnswer } from "../prompts/config";
import type { NoteletMetadata } from "../types";

export type NoteletCreationError =
  | JournalNotFoundError
  | NoteletTypeNotFoundError
  | OutOfTimelineError
  | EmptyNoteNameError
  | TemplateRenderError
  | NoteReadError
  | NoteCreateError
  | NoteWriteError
  | NoteNotFoundError
  | FrontmatterError
  | PromptsUnansweredError
  | UserAborted;

export type NoteletAttachError =
  | JournalNotFoundError
  | NoteletTypeNotFoundError
  | TemplateRenderError
  | NoteReadError
  | NoteWriteError
  | NoteNotFoundError
  | FrontmatterError;

export interface CreateNoteletOptions {
  readonly unattended?: boolean;
  readonly skipConfirmation?: boolean;
}

export class NoteletCreationService {
  readonly #journals = inject(JournalsRepository);
  readonly #timeline = inject(TimelineService);
  readonly #index = inject(JournalsIndex);
  readonly #paths = inject(NoteletPathService);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #content = inject(TemplateContentService);
  readonly #notes = inject(NotesService);
  readonly #guard = inject(SelfWriteGuard);
  readonly #flows = inject(Flows);
  readonly #modals = inject(ModalService);

  /** Creates one notelet of `typeId` anchored at `anchor`. Never idempotent — several per anchor is the point. */
  createNotelet(
    journalName: string,
    typeId: TypeId,
    anchor: AnchorString,
    options?: CreateNoteletOptions,
  ): AsyncResult<{ path: VaultPath; counter?: number }, NoteletCreationError> {
    return attempt.in(this, async function* (this: NoteletCreationService) {
      const config = yield* this.#journals.require(journalName);
      const type = config.notelets[typeId];
      if (type === undefined) return yield* new Err(new NoteletTypeNotFoundError(journalName, typeId));
      if (!this.#timeline.contains(journalName, anchor)) {
        return yield* new Err(new OutOfTimelineError(journalName, anchor));
      }

      // An empty index restarts the counter at 1 and duplicates a name, so the count has to be
      // taken against a settled index rather than whatever has been parsed so far.
      await this.#index.whenReady();
      const counter = type.counter.enabled ? this.#paths.nextIndex(journalName, anchor, type.name) : undefined;

      // Creating a notelet is always an explicit act, so the journal's own confirmation setting —
      // which guards the note a calendar click can create by accident — does not reach here. The
      // type carries its own, and an unattended caller has already said nobody is watching.
      const confirming =
        !(options?.unattended ?? false) && !(options?.skipConfirmation ?? false) && type.confirmCreation;

      // Questions run before the name renders, because an answer can reach the filename and a
      // placeholder must never be persisted into one.
      let answers: Record<string, PromptAnswer> = {};
      if (type.prompts.length > 0) {
        if (options?.unattended ?? false) {
          const outcome = unattendedOutcome(type);
          if (outcome.kind === "refuse") {
            return yield* new Err(new PromptsUnansweredError(journalName, outcome.reason));
          }
        } else {
          const asked: NoteletMetadata = {
            kind: "notelet",
            journalName,
            anchor,
            typeId,
            ...(counter !== undefined && { counter }),
          };
          answers = yield* this.#flows
            .invoke(GatherPromptAnswersFlow, { metadata: asked, confirming }, { notify: false })
            .mapErr((error) => (error instanceof UserAborted ? error : new JournalNotFoundError(journalName)));
        }
      }

      const metadata: NoteletMetadata = {
        kind: "notelet",
        journalName,
        anchor,
        typeId,
        ...(counter !== undefined && { counter }),
        ...(Object.keys(answers).length > 0 && { answers }),
      };

      const path = yield* this.#paths.availablePathFor(config, type, metadata);
      const mutator = yield* this.#frontmatter.writeMutator(journalName, metadata);
      const bodyContext = yield* this.#paths.bodyContextFor(config, type, metadata, basenameOf(path));

      // The answers modal carries the note path and its own Cancel, so it is the confirmation for
      // a type that asks questions; a second dialog would ask the same thing twice.
      if (confirming && type.prompts.length === 0) {
        const confirmed = yield* this.#modals
          .open(confirmCreationModal, { journalName, noteName: basenameOf(path), typeName: type.name })
          .mapErr(() => new UserAborted("confirm-notelet-creation") as NoteletCreationError);
        if (!confirmed) return yield* new Err(new UserAborted("confirm-notelet-creation"));
      }

      this.#guard.mark(path);
      const createResult = await this.#notes.create(path, "");
      if (createResult.isErr()) {
        this.#guard.release(path);
        return yield* new Err(createResult.error as NoteletCreationError);
      }
      const content = yield* this.#content
        .renderTemplates(type.templates, bodyContext, path)
        .tapErr(() => this.#guard.release(path));
      if (content !== "") {
        yield* this.#notes.write(path, content).tapErr(() => this.#guard.release(path));
      }
      yield* this.#notes.updateFrontmatter(path, mutator).tapErr(() => this.#guard.release(path));
      return { path, ...(counter !== undefined && { counter }) };
    });
  }

  /**
   * Claims an existing note as a notelet of `metadata.typeId`.
   *
   * The period twin refuses an occupied anchor; this one cannot, because several notelets per
   * anchor is the design. Emptiness is judged against the note's original body — writing
   * frontmatter fills the file, so the read has to come first.
   *
   * `beforeWrite` runs inside the same frontmatter write, immediately before the claim — a
   * caller stripping an old claim gets one write, so nothing that fails here can leave the note
   * claimed by nobody.
   */
  attachNotelet(
    journalName: string,
    path: VaultPath,
    metadata: NoteletMetadata,
    beforeWrite?: (fm: Record<string, unknown>) => void,
  ): AsyncResult<void, NoteletAttachError> {
    return attempt.in(this, async function* (this: NoteletCreationService) {
      const config = yield* this.#journals.require(journalName);
      const type = config.notelets[metadata.typeId];
      if (type === undefined) return yield* new Err(new NoteletTypeNotFoundError(journalName, metadata.typeId));

      const claim = yield* this.#frontmatter.writeMutator(journalName, metadata);
      const existing = yield* this.#notes.read(path);
      if (existing.trim() === "") {
        const context = yield* this.#paths.bodyContextFor(config, type, metadata, basenameOf(path));
        const content = yield* this.#content.renderTemplates(type.templates, context, path);
        if (content !== "") yield* this.#notes.write(path, content);
      }
      yield* this.#notes.updateFrontmatter(path, (fm) => {
        beforeWrite?.(fm);
        claim(fm);
      });
    });
  }
}
