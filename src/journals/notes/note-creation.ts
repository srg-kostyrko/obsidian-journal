import { inject } from "@/infrastructure/di";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { basenameOf, NoteMetadataService, NotesService } from "@/infrastructure/host";
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

import { FRONTMATTER_NAME_KEY } from "../config";
import { JournalNotFoundError } from "../errors";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { PromptsUnansweredError } from "../prompts/errors";
import { GatherPromptAnswersFlow } from "../prompts/flows/gather-prompt-answers.flow";
import { promptsInPath } from "../prompts/prompts-in-path";
import { unattendedOutcome } from "../prompts/unattended-rule";
import { JournalsRepository } from "../repository";

import { AnchorOccupiedError, NoteletHoldsPathError, NotePathClaimedError, type EmptyNoteNameError } from "./errors";
import { NotePathService } from "./note-path";
import { SelfWriteGuard } from "./self-write-guard";
import { TemplateContentService } from "./template-content";
import { confirmCreationModal } from "./ui/modals";

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
  | NotePathClaimedError
  | NoteletHoldsPathError
  | PromptsUnansweredError
  | UserAborted;

export class NoteCreationService {
  readonly #notes = inject(NotesService);
  readonly #metadata = inject(NoteMetadataService);
  readonly #index = inject(JournalsIndex);
  readonly #path = inject(NotePathService);
  readonly #journals = inject(JournalsRepository);
  readonly #content = inject(TemplateContentService);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #modals = inject(ModalService);
  readonly #guard = inject(SelfWriteGuard);
  readonly #flows = inject(Flows);

  // Whether a file already at the journal's derived path is THIS journal's own note rather
  // than a stray the journal is about to adopt, or a note a different journal already claims.
  // The claim key is what this plugin writes, so a match means the note has been through this
  // journal's creation once already — prompts and all. A claim naming another journal must not
  // match: that path belongs to a different journal's note sitting at a coincident derived
  // path, and short-circuiting on it would let this journal overwrite that journal's claim.
  #carriesJournalClaim(name: string, path: VaultPath): boolean {
    const metadata = this.#metadata.get(path);
    return metadata.isSome() && metadata.value.properties[FRONTMATTER_NAME_KEY] === name;
  }

  // A notelet of this journal carries the same claim key a period note does, so
  // #carriesJournalClaim would adopt it and write the period mutator over it — silently, and
  // permanently, since writeMutator leaves the type key in place. Read frontmatter rather than
  // the index: a notelet not yet indexed must refuse too.
  #holdsOwnNotelet(name: string, path: VaultPath): boolean {
    const config = this.#journals.get(name).getOrUndefined();
    if (config === undefined) return false;
    const metadata = this.#metadata.get(path);
    if (metadata.isNone()) return false;
    const properties = metadata.value.properties;
    if (properties[FRONTMATTER_NAME_KEY] !== name) return false;
    const claimed = properties[config.frontmatter.noteletField];
    return claimed !== undefined && claimed !== null;
  }

  // The other half of that question: a file at the derived path that a *different* journal owns
  // is that journal's note sitting at a coincident path, not a stray to adopt. Writing this
  // journal's claim over it drops the note out of its own journal's index — it no longer parses
  // for either journal — and AutoAttachService will not take it back, so the owner loses a note
  // with nothing on screen. The index is what the rest of the plugin treats as ownership; the
  // raw claim covers a note whose entry never made it in (a rejected anchor, a read before the
  // boot walk lands). An unresolvable claim is deliberately not this case — a legacy id the note
  // migration still has to rewrite, or a journal deleted in "keep notes" mode, has no journal
  // left to lose the note — and keeps falling through to adoption as it always has.
  #claimedByOtherJournal(name: string, path: VaultPath): string | undefined {
    const indexed = this.#index.entryByPath(path);
    if (indexed.isSome() && indexed.value.journalName !== name) return indexed.value.journalName;
    const metadata = this.#metadata.get(path);
    if (metadata.isNone()) return undefined;
    const claimed = metadata.value.properties[FRONTMATTER_NAME_KEY];
    if (typeof claimed !== "string" || claimed === name) return undefined;
    return this.#journals.get(claimed).isSome() ? claimed : undefined;
  }

  ensureNote(
    name: string,
    metadata: JournalMetadata,
    options?: { skipConfirmation?: boolean; unattended?: boolean },
  ): AsyncResult<{ path: VaultPath; created: boolean }, NoteCreationError> {
    // A connected note may live away from the config-derived path (renamed, moved,
    // or connected in place); the index knows its real location — reuse it instead
    // of spawning a duplicate at the derived path. It stays ahead of the prompt:
    // reopening a note this journal already has must never ask again.
    const indexed = this.#index.entryByAnchor(name, metadata.anchor);
    if (indexed.isSome() && this.#notes.find(indexed.value.path).isSome()) {
      const indexedPath = indexed.value.path;
      const mutatorResult = this.#frontmatter.writeMutator(name, metadata);
      if (mutatorResult.kind === "err") return AsyncResult.err(mutatorResult.error);
      return this.#notes
        .updateFrontmatter(indexedPath, mutatorResult.value)
        .map(() => ({ path: indexedPath, created: false as const }));
    }

    return attempt.in(this, async function* () {
      const config = this.#journals.get(name).getOrUndefined();
      const confirming = !(options?.skipConfirmation ?? false) && (config?.confirmCreation ?? false);

      // With an answer reaching the note name or folder the path genuinely cannot be known
      // before asking, so those journals keep the prompt-then-derive order below. Everywhere
      // else the path is knowable up front, and deriving it here is what lets this journal's
      // own note that fell out of the index — a rejected anchor, mangled frontmatter, a
      // cold-boot race — be recognized by its claim and returned without re-asking questions
      // it has already answered and stored. A file claimed by a *different* journal is not
      // this case: it falls through to the path below, where an unclaimed file is adopted and
      // one another journal owns is refused.
      const derived =
        config === undefined || promptsInPath(config).length === 0
          ? yield* this.#path.pathFor(name, metadata)
          : undefined;
      if (derived !== undefined && this.#notes.find(derived).isSome()) {
        if (this.#holdsOwnNotelet(name, derived)) {
          return yield* new Err(new NoteletHoldsPathError(name, derived));
        }
        if (this.#carriesJournalClaim(name, derived)) {
          const claimedMutator = yield* this.#frontmatter.writeMutator(name, metadata);
          yield* this.#notes.updateFrontmatter(derived, claimedMutator);
          return { path: derived, created: false as const };
        }
      }

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
            .invoke(GatherPromptAnswersFlow, { metadata, confirming }, { notify: false })
            .mapErr((error) => (error instanceof UserAborted ? error : new JournalNotFoundError(name)));
        }
      }
      const answered: JournalMetadata =
        Object.keys(answers).length > 0 ? { ...metadata, answers: { ...metadata.answers, ...answers } } : metadata;

      // Built from the answered metadata. One built before the prompt closes over the
      // pre-prompt metadata, so reusing it here would drop every answer on the floor with
      // nothing failing.
      const mutator = yield* this.#frontmatter.writeMutator(name, answered);

      // A connected note is reachable above without ever needing a resolvable
      // configured path, so the empty-name guard must gate creation only — deriving
      // it any earlier would block opening a note this journal already has. Only a
      // prompt in the path leaves the derivation to here, and that one has to follow
      // the answers.
      const path = derived ?? (yield* this.#path.pathFor(name, answered));

      if (this.#notes.find(path).isSome()) {
        if (this.#holdsOwnNotelet(name, path)) {
          return yield* new Err(new NoteletHoldsPathError(name, path));
        }
        const owner = this.#claimedByOtherJournal(name, path);
        if (owner !== undefined) return yield* new Err(new NotePathClaimedError(name, path, owner));
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
