import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { basenameOf, NoteMetadataService, NoteNotFoundError, NotesService } from "@/infrastructure/host";
import type {
  FrontmatterError,
  NoteCreateError,
  NoteReadError,
  NoteWriteError,
  VaultPath,
} from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, Err, attempt } from "@/infrastructure/result";
import type { TemplateRenderError } from "@/templates";

import { FRONTMATTER_NAME_KEY } from "../config";
import { CycleService } from "../cycle";
import { JournalNotFoundError } from "../errors";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { PromptsUnansweredError } from "../prompts/errors";
import { GatherPromptAnswersFlow } from "../prompts/flows/gather-prompt-answers.flow";
import { promptsInPath } from "../prompts/prompts-in-path";
import { unattendedOutcome } from "../prompts/unattended-rule";
import { JournalsRepository } from "../repository";
import { isNotelet, type JournalMetadata } from "../types";

import {
  AnchorOccupiedError,
  NoteletHoldsPathError,
  NotePathClaimedError,
  NotePathHeldByPeriodError,
  type EmptyNoteNameError,
} from "./errors";
import { NotePathService } from "./note-path";
import { SelfWriteGuard } from "./self-write-guard";
import { TemplateContentService } from "./template-content";
import { confirmCreationModal } from "./ui/modals";

import type { PromptAnswer } from "../prompts/config";

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
  | NotePathHeldByPeriodError
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
  readonly #cycle = inject(CycleService);

  // The index hears about a note only when Obsidian's metadata cache re-parses it, a moment after
  // this write; a second call arriving in between would find no note and create another. The entry
  // is registered from the exact frontmatter written, so the later metadata event matches it.
  #writeClaim(path: VaultPath, mutator: (fm: Record<string, unknown>) => void): AsyncResult<void, NoteCreationError> {
    let written: Record<string, unknown> | undefined;
    return this.#notes
      .updateFrontmatter(path, (fm) => {
        mutator(fm);
        written = { ...fm };
      })
      .map(() => {
        if (written === undefined) return;
        const entry = this.#frontmatter.parseEntry(path, written);
        if (entry.isSome()) this.#index.register(entry.value);
      });
  }

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

  // A name template can repeat over a longer cycle than it separates — `{{date:MMMM}}` names
  // every March alike — so the file at the derived path may be this journal's own note for a
  // different period. Adopting it rewrites its date and the earlier period loses its note with
  // nothing on screen. Only a canonical stored date says which period a note belongs to; one that
  // names no period start is the fallen-out-of-the-index case adoption exists for, and stays so.
  #heldForOtherPeriod(name: string, path: VaultPath, anchor: AnchorString): AnchorString | undefined {
    const indexed = this.#index.entryByPath(path);
    if (indexed.isSome() && indexed.value.journalName === name && !isNotelet(indexed.value)) {
      return indexed.value.anchor === anchor ? undefined : indexed.value.anchor;
    }
    const metadata = this.#metadata.get(path);
    if (metadata.isNone()) return undefined;
    const parsed = this.#frontmatter.parseEntry(path, metadata.value.properties);
    if (parsed.isNone() || parsed.value.journalName !== name || isNotelet(parsed.value)) return undefined;
    const held = parsed.value.anchor;
    if (held === anchor) return undefined;
    return this.#cycle.isCanonicalAnchor(name, held).getOr(false) ? held : undefined;
  }

  ensureNote(
    name: string,
    metadata: JournalMetadata,
    options?: {
      skipConfirmation?: boolean;
      unattended?: boolean;
      answers?: Readonly<Record<string, PromptAnswer>>;
    },
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
      return this.#writeClaim(indexedPath, mutatorResult.value).map(() => ({
        path: indexedPath,
        created: false as const,
      }));
    }

    return attempt.in(this, async function* () {
      const config = this.#journals.get(name).getOrUndefined();
      // For a period note with no questions, confirm and prompt are independent levers (unlike a
      // notelet, where unattended suppresses both): a bare `unattended` must still show this plain
      // confirmation. A journal with questions has no second dialog to independently suppress —
      // the answer modal below doubles as the confirmation, reading `confirming` to decide whether
      // to offer one — so `prompt: false` with no answers supplied skips asking anything at all,
      // confirmCreation notwithstanding. Only supplied answers — which stand in for either modal —
      // skip confirmation outright, because whoever supplied them was never going to see one.
      const confirming =
        options?.answers === undefined && !(options?.skipConfirmation ?? false) && (config?.confirmCreation ?? false);

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
        const heldFor = this.#heldForOtherPeriod(name, derived, metadata.anchor);
        if (heldFor !== undefined) return yield* new Err(new NotePathHeldByPeriodError(name, derived, heldFor));
        if (this.#carriesJournalClaim(name, derived)) {
          const claimedMutator = yield* this.#frontmatter.writeMutator(name, metadata);
          yield* this.#writeClaim(derived, claimedMutator);
          return { path: derived, created: false as const };
        }
      }

      // The unattended rule is a pure function; only the attended path opens a modal, and it
      // does so through a flow so aborts, timing and failure notices match every other modal.
      // Supplied answers stand in for the modal: whoever supplied them is not watching one.
      let answers: Record<string, PromptAnswer> = {};
      if (config !== undefined && config.prompts.length > 0) {
        if (options?.answers !== undefined || (options?.unattended ?? false)) {
          const supplied = options?.answers ?? {};
          const outcome = unattendedOutcome(config, supplied);
          if (outcome.kind === "refuse") {
            return yield* new Err(new PromptsUnansweredError(name, outcome.reason));
          }
          answers = { ...supplied };
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
        const heldFor = this.#heldForOtherPeriod(name, path, metadata.anchor);
        if (heldFor !== undefined) return yield* new Err(new NotePathHeldByPeriodError(name, path, heldFor));
        const owner = this.#claimedByOtherJournal(name, path);
        if (owner !== undefined) return yield* new Err(new NotePathClaimedError(name, path, owner));
        yield* this.#writeClaim(path, mutator);
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
      yield* this.#writeClaim(path, mutator).tapErr(() => this.#guard.release(path));
      return { path, created: true as const };
    });
  }

  /** Replaces the whole file of the journal's note at `anchor`, keeping the note's journal claim. */
  replaceContent(
    name: string,
    anchor: AnchorString,
    content: string,
  ): AsyncResult<{ path: VaultPath }, NoteCreationError> {
    return attempt.in(this, async function* () {
      // Built before the write, while the index still holds the entry's endDate: the new body
      // carries no claim, and its re-parse drops the entry. Stored answers are left out: the
      // mutator would write them over the ones the new body carries, or bring back ones it dropped.
      const { answers: _stored, ...metadata } = yield* this.#frontmatter.buildMetadata(name, anchor);
      const claim = yield* this.#frontmatter.writeMutator(name, metadata);
      const indexed = this.#index.entryByAnchor(name, anchor);
      if (indexed.isNone() || this.#notes.find(indexed.value.path).isNone()) {
        return yield* new Err(new NoteNotFoundError(yield* this.#path.pathFor(name, metadata)));
      }
      const path = indexed.value.path;
      yield* this.#notes.write(path, content);
      yield* this.#writeClaim(path, claim);
      return { path };
    });
  }

  /**
   * Claims an existing note as this journal's note for `metadata.anchor`.
   *
   * `beforeWrite` runs inside the same frontmatter write, immediately before the claim — a
   * caller stripping an old claim gets one write, so nothing that fails here can leave the note
   * claimed by nobody.
   */
  attachNote(
    name: string,
    path: VaultPath,
    metadata: JournalMetadata,
    beforeWrite?: (fm: Record<string, unknown>) => void,
  ): AsyncResult<void, NoteCreationError> {
    const mutatorResult = this.#frontmatter.writeMutator(name, metadata);
    if (mutatorResult.kind === "err") return AsyncResult.err(mutatorResult.error);
    const claim = mutatorResult.value;

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
      yield* this.#notes.updateFrontmatter(path, (fm) => {
        beforeWrite?.(fm);
        claim(fm);
      });
    });
  }
}
