import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { NoteNotFoundError, NotesService } from "@/infrastructure/host";
import type {
  FrontmatterError,
  NoteAlreadyExistsError,
  NoteDeleteError,
  NoteRenameError,
  VaultPath,
} from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult, attempt, Err, Ok, type Result } from "@/infrastructure/result";

import { DEFAULT_FRONTMATTER_KEYS, FRONTMATTER_NAME_KEY } from "../config";
import { CycleService } from "../cycle";
import { NoteletTypeNotFoundError } from "../errors";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { NoteletCreationService } from "../notelets/notelet-creation";
import { NoteletPathService } from "../notelets/notelet-path";
import { promptsInTemplate } from "../prompts/prompts-in-path";
import { JournalsRepository } from "../repository";
import { isNotelet } from "../types";

import { AnchorOccupiedError } from "./errors";
import { NoteCreationService } from "./note-creation";
import { NotePathService } from "./note-path";
import { splitVaultPath } from "./vault-path";

import type { NoteCreationError } from "./note-creation";
import type { JournalNotFoundError } from "../errors";
import type { TypeId } from "../notelets/config";
import type { JournalMetadata, NoteletEntry, NoteletMetadata } from "../types";

export type ConnectError =
  | NoteCreationError
  | AnchorOccupiedError
  | NoteRenameError
  | NoteAlreadyExistsError
  | NoteNotFoundError
  | NoteDeleteError
  | FrontmatterError
  | NoteletTypeNotFoundError;

export type DisconnectError = NoteNotFoundError | FrontmatterError;

export interface ReanchorReport {
  readonly rewritten: number;
  readonly failed: number;
}

// endDate is the caller's call, not this service's: judging a stored end against a
// duration-derived default requires the grid the value was written under, and by the time a
// reanchor runs, the caller (WeekPresetService) has already moved the live grid to the new one.
// Only the caller still straddles both grids, so only the caller can tell stale period metadata
// apart from a genuine manual extension. Omitting endDate here means "let it be recomputed".
export interface ReanchorTarget {
  readonly anchor: AnchorString;
  readonly endDate?: AnchorString;
  // Presence routes the write to the notelet mutator. A notelet carries no start or end date,
  // and the period mutator would write exactly the keys the frontmatter contract forbids. The
  // caller supplies the name because the maintenance route re-anchors notes the index rejected,
  // which it therefore cannot look up.
  readonly noteletTypeName?: string;
}

export type ReanchorError = NoteNotFoundError | FrontmatterError | JournalNotFoundError | NoteletTypeNotFoundError;

export interface ConnectOptions {
  override?: boolean;
  rename?: boolean;
  move?: boolean;
  // Present ⇒ connect as a notelet of this type rather than as the period note.
  typeId?: TypeId;
  // Bulk add's scan-order allocation. connect on its own reads the index for the next counter,
  // which cannot advance mid-run because the index only learns of a write once vault events land.
  counter?: number;
}

export class NoteConnectionService {
  readonly #notes = inject(NotesService);
  readonly #path = inject(NotePathService);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #creation = inject(NoteCreationService);
  readonly #index = inject(JournalsIndex);
  readonly #cycle = inject(CycleService);
  readonly #journals = inject(JournalsRepository);
  readonly #noteletCreation = inject(NoteletCreationService);
  readonly #noteletPaths = inject(NoteletPathService);
  readonly #logger = inject(LoggerFactoryToken).named("note-connection");

  readonly #defaultClear = (fm: Record<string, unknown>): void => {
    for (const key of DEFAULT_FRONTMATTER_KEYS) delete fm[key];
  };

  // A journal that no longer resolves still owns keys on the note, so fall back to the default
  // set rather than refusing: the note is losing that claim either way.
  #clearMutatorFor(journalName: string): (fm: Record<string, unknown>) => void {
    const mutator = this.#frontmatter.clearMutator(journalName);
    return mutator.isOk() ? mutator.value : this.#defaultClear;
  }

  #periodPathsOf(journalName: string): VaultPath[] {
    return [...this.#index.entriesFor(journalName)].map(([, path]) => path);
  }

  // Best-effort: an AsyncResult never rejects, so Promise.all settles even when individual notes
  // fail. We discard the per-note Results so one bad note can't strand the journal-wide
  // operation. Paths are snapshotted by the caller before the ops mutate the index.
  #forEach(paths: readonly VaultPath[], op: (path: VaultPath) => AsyncResult<void, unknown>): AsyncResult<void, never> {
    const all: Promise<void> = Promise.all(paths.map((path) => op(path))).then(() => {
      return;
    });
    return AsyncResult.fromPromise(all, () => undefined as never);
  }

  // Every note the journal owns, of either kind. A journal-wide operation that walks only
  // entriesFor silently misses every notelet, with nothing on screen.
  #forEachConnected(
    journalName: string,
    op: (path: VaultPath) => AsyncResult<void, unknown>,
  ): AsyncResult<void, never> {
    return this.#forEach(
      [...this.#periodPathsOf(journalName), ...this.#index.noteletsFor(journalName).map((entry) => entry.path)],
      op,
    );
  }

  #forEachPeriodNote(
    journalName: string,
    op: (path: VaultPath) => AsyncResult<void, unknown>,
  ): AsyncResult<void, never> {
    return this.#forEach(this.#periodPathsOf(journalName), op);
  }

  #moveKey(oldKey: string, newKey: string): (fm: Record<string, unknown>) => void {
    return (fm) => {
      if (!Object.hasOwn(fm, oldKey)) return;
      fm[newKey] = fm[oldKey];
      delete fm[oldKey];
    };
  }

  #forEachOfType(
    journalName: string,
    typeName: string,
    op: (path: VaultPath) => AsyncResult<void, unknown>,
  ): AsyncResult<void, never> {
    return this.#forEach(
      this.#index.noteletsOfType(journalName, typeName).map((entry) => entry.path),
      op,
    );
  }

  // Shared by reapplyAll (which already holds a resolved typeId off the index entry) and
  // #noteletMetadataAt (which only has a stored type name and must resolve it itself). The two
  // inputs don't converge — only the metadata shape they produce does.
  #buildNoteletMetadata(
    journalName: string,
    anchor: AnchorString,
    typeId: TypeId,
    carried?: Pick<NoteletEntry, "counter" | "answers">,
  ): NoteletMetadata {
    return {
      kind: "notelet",
      journalName,
      anchor,
      typeId,
      ...(carried?.counter !== undefined && { counter: carried.counter }),
      ...(carried?.answers !== undefined && { answers: carried.answers }),
    };
  }

  // The type is resolved by its stored name, the same reference parseEntry uses. Counter and
  // answers ride along from the index when the note is in it; a re-anchor never recomputes them.
  #noteletMetadataAt(
    journalName: string,
    path: VaultPath,
    anchor: AnchorString,
    typeName: string,
  ): Result<NoteletMetadata, NoteletTypeNotFoundError | JournalNotFoundError> {
    return this.#journals.require(journalName).flatMap((config) => {
      const match = Object.entries(config.notelets).find(([, candidate]) => candidate.name === typeName);
      if (match === undefined) return new Err(new NoteletTypeNotFoundError(journalName, typeName));
      const existing = this.#index.entryByPath(path).getOrUndefined();
      const carried = existing !== undefined && isNotelet(existing) ? existing : undefined;
      return new Ok(this.#buildNoteletMetadata(journalName, anchor, match[0] as TypeId, carried));
    });
  }

  #reanchorOne(journalName: string, path: VaultPath, target: ReanchorTarget): AsyncResult<void, ReanchorError> {
    return attempt.in(this, async function* (this: NoteConnectionService) {
      if (target.noteletTypeName !== undefined) {
        const metadata = yield* this.#noteletMetadataAt(journalName, path, target.anchor, target.noteletTypeName);
        const noteletMutator = yield* this.#frontmatter.writeMutator(journalName, metadata);
        yield* this.#notes.updateFrontmatter(path, noteletMutator).tapErr((error) => {
          this.#logger.warn("failed to re-anchor notelet", { path, anchor: target.anchor, error });
        });
        return;
      }
      const built = yield* this.#frontmatter.buildMetadata(journalName, target.anchor);
      // buildMetadata resolves endDate by looking up the index at the note's NEW anchor, but the
      // move hasn't landed yet — the note is still filed under its OLD anchor, so that lookup either
      // misses or, worse, hands back whatever other note is about to vacate the new anchor. The
      // caller's target.endDate (or its absence) is the only trustworthy source here — see
      // ReanchorTarget for why this service can't re-derive it.
      const { endDate: _staleEndDate, ...rest } = built;
      const metadata: JournalMetadata = {
        ...rest,
        ...(target.endDate !== undefined && { endDate: target.endDate }),
      };
      const mutator = yield* this.#frontmatter.writeMutator(journalName, metadata);
      yield* this.#notes.updateFrontmatter(path, mutator).tapErr((error) => {
        this.#logger.warn("failed to re-anchor note", { path, anchor: target.anchor, error });
      });
    });
  }

  #connectNotelet(
    journalName: string,
    path: VaultPath,
    anchor: AnchorString,
    typeId: TypeId,
    options: ConnectOptions,
    clearStale: ((fm: Record<string, unknown>) => void) | undefined,
  ): AsyncResult<{ path: VaultPath }, ConnectError> {
    return attempt.in(this, async function* (this: NoteConnectionService) {
      const config = yield* this.#journals.require(journalName);
      const type = config.notelets[typeId];
      if (type === undefined) return yield* new Err(new NoteletTypeNotFoundError(journalName, typeId));

      // Assigned whether or not the note is renamed: listing order has to stay total across
      // notelets that kept their own names.
      const counter = type.counter.enabled
        ? (options.counter ??
          this.#carriedCounterAt(path, journalName, anchor, typeId) ??
          this.#noteletPaths.nextIndex(journalName, anchor, type.name))
        : undefined;
      const metadata: NoteletMetadata = {
        kind: "notelet",
        journalName,
        anchor,
        typeId,
        ...(counter !== undefined && { counter }),
      };

      let target = path;
      if (options.rename === true || options.move === true) {
        const configured = yield* this.#noteletPaths.pathFor(config, type, metadata);
        // Each half refuses independently and for the same reason as the period route: nobody is
        // being asked on this path, and a file renamed to a rendered placeholder has no repair.
        const nameRefused = promptsInTemplate(type.nameTemplate, type.prompts).length > 0;
        const folderRefused = promptsInTemplate(type.folder, type.prompts).length > 0;
        target = this.#combine(path, configured, {
          rename: options.rename === true && !nameRefused,
          move: options.move === true && !folderRefused,
        }) as VaultPath;
      }

      if (target !== path) yield* this.#notes.rename(path, target);
      if (clearStale !== undefined) this.#dropStaleEntry(path, target);
      yield* this.#noteletCreation.attachNotelet(journalName, target, metadata, clearStale);
      return { path: target };
    });
  }

  // nextIndex counts the note being connected along with the rest of the period, so a notelet
  // whose journal, anchor and type all stay put would be renumbered one higher every time its
  // dialog is confirmed. Only a move off that tuple earns a new number.
  #carriedCounterAt(path: VaultPath, journalName: string, anchor: AnchorString, typeId: TypeId): number | undefined {
    const existing = this.#index.entryByPath(path).getOrUndefined();
    if (existing === undefined || !isNotelet(existing)) return undefined;
    const unchanged = existing.journalName === journalName && existing.anchor === anchor && existing.typeId === typeId;
    return unchanged ? existing.counter : undefined;
  }

  // The journal whose keys this note has to lose before it takes a new claim, if any. Neither
  // write mutator removes the other kind's keys — the period one leaves the type key in place on
  // purpose — so a note that changed journal, kind or type would keep parsing as what it was.
  // A plain re-date is not a re-claim: clearing there would take a hand-typed answer with it.
  #staleClaimOn(path: VaultPath, journalName: string, typeId: TypeId | undefined): string | undefined {
    const existing = this.#index.entryByPath(path).getOrUndefined();
    if (existing === undefined) return undefined;
    if (existing.journalName !== journalName) return existing.journalName;
    if (isNotelet(existing)) return typeId === undefined || existing.typeId !== typeId ? journalName : undefined;
    return typeId === undefined ? undefined : journalName;
  }

  // The clear rides into the attach's own frontmatter write rather than being written first:
  // everything a connect can fail on — the type lookup, the path render, a rename collision —
  // runs before that single write, so a failed connect leaves the note claimed by whoever
  // claimed it before instead of by nobody.
  #staleClearFor(
    path: VaultPath,
    journalName: string,
    typeId: TypeId | undefined,
  ): ((fm: Record<string, unknown>) => void) | undefined {
    const stale = this.#staleClaimOn(path, journalName, typeId);
    return stale === undefined ? undefined : this.#clearMutatorFor(stale);
  }

  // The clear lands with the attach that follows this call, but the index only hears about it
  // once the vault events do. A rename may already have transferred the entry onto its new
  // path, so drop it under both.
  #dropStaleEntry(path: VaultPath, target: VaultPath): void {
    this.#index.unregister(path);
    if (target !== path) this.#index.unregister(target);
  }

  #combine(current: VaultPath, configured: VaultPath, options: ConnectOptions): string {
    const [currentFolder, currentName] = splitVaultPath(current);
    const [configuredFolder, configuredName] = splitVaultPath(configured);
    const folder = options.move ? configuredFolder : currentFolder;
    const name = options.rename ? configuredName : currentName;
    return folder ? `${folder}/${name}` : name;
  }

  // A stored end equal to the duration-derived default is period metadata written by an
  // earlier addEndDate config, not a manual extension — dropping it lets the write mutator
  // clear the field once the toggle is off, while genuine extensions survive.
  #withoutDefaultEnd(journalName: string, metadata: JournalMetadata): JournalMetadata {
    if (metadata.endDate === undefined) return metadata;
    const fallback = this.#cycle.defaultEndOf(journalName, metadata.anchor);
    if (fallback.isNone() || fallback.value.toAnchor() !== metadata.endDate) return metadata;
    const { endDate: _dropped, ...rest } = metadata;
    return rest;
  }

  // Maintenance repairs notes the index rejected, which reanchorAll (index-driven) cannot reach
  // and connect must not touch — connect renders the journal template into an empty note.
  reanchor(journalName: string, path: VaultPath, target: ReanchorTarget): AsyncResult<void, ReanchorError> {
    return this.#reanchorOne(journalName, path, target);
  }

  connect(
    journalName: string,
    path: VaultPath,
    anchor: AnchorString,
    options: ConnectOptions = {},
  ): AsyncResult<{ path: VaultPath }, ConnectError> {
    return attempt.in(this, async function* (this: NoteConnectionService) {
      const clearStale = this.#staleClearFor(path, journalName, options.typeId);

      if (options.typeId !== undefined) {
        return yield* this.#connectNotelet(journalName, path, anchor, options.typeId, options, clearStale);
      }

      // Metadata is resolved from the anchor's stored entry (incl. any endDate), so an
      // overridden slot's period metadata transfers to the new note.
      const metadata = yield* this.#frontmatter.buildMetadata(journalName, anchor);

      let target = path;
      if (options.rename || options.move) {
        const configured = yield* this.#path.pathFor(journalName, metadata);
        // A prompt reaching one half of the path renders the placeholder there — nobody is
        // being asked on this route, and a renamed/moved file carrying it has no repair path.
        // Each half refuses independently: a prompt in the name template leaves the note's own
        // name in place without blocking a move, and vice versa for the folder.
        const config = this.#journals.get(journalName).getOrUndefined();
        const nameRefused = config !== undefined && promptsInTemplate(config.nameTemplate, config.prompts).length > 0;
        const folderRefused = config !== undefined && promptsInTemplate(config.folder, config.prompts).length > 0;
        target = this.#combine(path, configured, {
          rename: options.rename && !nameRefused,
          move: options.move && !folderRefused,
        }) as VaultPath;
      }

      const occupant = this.#index.entryByAnchor(journalName, anchor);
      if (occupant.isSome() && occupant.value.path !== path) {
        if (!options.override) {
          return yield* AsyncResult.err(new AnchorOccupiedError(journalName, anchor, occupant.value.path));
        }
        // Override replaces the occupant. If we're relocating the incoming note onto the
        // occupant's own path, trash the occupant (recoverable) to free the slot; otherwise
        // just disconnect it, leaving its file in place.
        yield* target === occupant.value.path
          ? this.#notes.delete(occupant.value.path)
          : this.disconnect(occupant.value.path);
        // The slot is free as of now, but the index only learns that once the vault's
        // delete/metadata events land. Drop the stale entry so the attach below (which
        // refuses an occupied anchor) sees the same truth this branch just established.
        this.#index.unregister(occupant.value.path);
      }

      if (target !== path) yield* this.#notes.rename(path, target);
      if (clearStale !== undefined) this.#dropStaleEntry(path, target);
      yield* this.#creation.attachNote(journalName, target, metadata, clearStale);
      return { path: target };
    });
  }

  disconnect(path: VaultPath): AsyncResult<void, DisconnectError> {
    const entry = this.#index.entryByPath(path);
    const mutator = entry.isSome() ? this.#clearMutatorFor(entry.value.journalName) : this.#defaultClear;
    return this.#notes.updateFrontmatter(path, mutator);
  }

  disconnectAll(journalName: string): AsyncResult<void, never> {
    return this.#forEachConnected(journalName, (path) => this.disconnect(path));
  }

  deleteAll(journalName: string): AsyncResult<void, never> {
    return this.#forEachConnected(journalName, (path) => this.#notes.delete(path));
  }

  reconnectAll(oldName: string, newName: string): AsyncResult<void, never> {
    return this.#forEachConnected(oldName, (path) =>
      this.#notes.updateFrontmatter(path, (fm) => {
        fm[FRONTMATTER_NAME_KEY] = newName;
      }),
    );
  }

  // Renaming a frontmatter key in config alone would orphan every connected note (their old key
  // no longer matches parseEntry). Move the value across so the notes stay connected.
  //
  // Period notes only. A type's reserved key set is narrower than the journal's, so a type
  // question may legally carry the same key as a journal question or numbering digit — and on a
  // notelet that key holds the *type's* answer, which this rename has no claim on.
  renameFieldAll(journalName: string, oldKey: string, newKey: string): AsyncResult<void, never> {
    return this.#forEachPeriodNote(journalName, (path) =>
      this.#notes.updateFrontmatter(path, this.#moveKey(oldKey, newKey)),
    );
  }

  // The journal-level fields — the claim's date, start, end and type keys — which both kinds
  // carry identically and neither kind may disagree about.
  renameJournalFieldAll(journalName: string, oldKey: string, newKey: string): AsyncResult<void, never> {
    return this.#forEachConnected(journalName, (path) =>
      this.#notes.updateFrontmatter(path, this.#moveKey(oldKey, newKey)),
    );
  }

  // The stored type name is what parseEntry resolves a type by, so a config-only rename would
  // orphan every notelet already written under the old one.
  renameNoteletsOfType(journalName: string, oldTypeName: string, newTypeName: string): AsyncResult<void, never> {
    const field = this.#journals.get(journalName).getOrUndefined()?.frontmatter.noteletField;
    if (field === undefined) return AsyncResult.ok();
    return this.#forEachOfType(journalName, oldTypeName, (path) =>
      this.#notes.updateFrontmatter(path, (fm) => {
        fm[field] = newTypeName;
      }),
    );
  }

  renameNoteletFieldForType(
    journalName: string,
    typeName: string,
    oldKey: string,
    newKey: string,
  ): AsyncResult<void, never> {
    return this.#forEachOfType(journalName, typeName, (path) =>
      this.#notes.updateFrontmatter(path, this.#moveKey(oldKey, newKey)),
    );
  }

  disconnectNoteletsOfType(journalName: string, typeName: string): AsyncResult<void, never> {
    return this.#forEachOfType(journalName, typeName, (path) => this.disconnect(path));
  }

  deleteNoteletsOfType(journalName: string, typeName: string): AsyncResult<void, never> {
    return this.#forEachOfType(journalName, typeName, (path) => this.#notes.delete(path));
  }

  reapplyAll(journalName: string): AsyncResult<void, never> {
    return this.#forEachConnected(journalName, (path) =>
      attempt.in(this, async function* (this: NoteConnectionService) {
        const entry = yield* this.#index.entryByPath(path).okOrElse(() => new NoteNotFoundError(path));
        if (isNotelet(entry)) {
          // An orphaned notelet has no type config, so there are no counter or prompt keys to
          // write, and its claim and date are already correct — a rewrite could only guess.
          if (entry.typeId === null) return;
          const metadata = this.#buildNoteletMetadata(journalName, entry.anchor, entry.typeId, entry);
          const noteletMutator = yield* this.#frontmatter.writeMutator(journalName, metadata);
          yield* this.#notes.updateFrontmatter(path, noteletMutator);
          return;
        }
        const metadata = yield* this.#frontmatter.buildMetadata(journalName, entry.anchor);
        const mutator = yield* this.#frontmatter.writeMutator(
          journalName,
          this.#withoutDefaultEnd(journalName, metadata),
        );
        yield* this.#notes.updateFrontmatter(path, mutator);
      }),
    );
  }

  // Targets are resolved by the caller (which alone knows the old and new week grids); this
  // only has to apply them without letting two notes land on the same anchor.
  reanchorAll(
    journalName: string,
    targets: ReadonlyMap<VaultPath, ReanchorTarget>,
  ): AsyncResult<ReanchorReport, never> {
    const entries = [...this.#index.entriesFor(journalName)];
    const claimed = new Set<AnchorString>();
    const moves: { path: VaultPath; to: ReanchorTarget }[] = [];
    let blocked = 0;

    // Notes that are staying put keep their slot, so a mover cannot displace one.
    for (const [anchor, path] of entries) {
      const target = targets.get(path);
      if (target === undefined || target.anchor === anchor) claimed.add(anchor);
    }
    for (const [anchor, path] of entries) {
      const target = targets.get(path);
      if (target === undefined || target.anchor === anchor) continue;
      // A grid change can leave a year one week shorter, collapsing two weeks onto one anchor.
      // The loser keeps its old date rather than overwriting the winner's note.
      if (claimed.has(target.anchor)) {
        blocked += 1;
        this.#logger.warn("re-anchor target already claimed", { journalName, path, target: target.anchor });
        continue;
      }
      claimed.add(target.anchor);
      moves.push({ path, to: target });
    }

    const noteletMoves: { path: VaultPath; to: ReanchorTarget }[] = [];
    // Several notelets per anchor is the design, so a notelet neither claims a period slot nor
    // can be blocked out of one: every notelet with a moving target moves, and none of them can
    // reach the "couldn't move N notes" count — blocked stays fed only by the period loop above,
    // and a notelet write failure (logged in #reanchorOne) never inflates `failed` either.
    for (const entry of this.#index.noteletsFor(journalName)) {
      const target = targets.get(entry.path);
      if (target === undefined || target.anchor === entry.anchor) continue;
      noteletMoves.push({ path: entry.path, to: target });
    }

    const settled = Promise.all([
      Promise.all(moves.map((move) => this.#reanchorOne(journalName, move.path, move.to))),
      Promise.all(noteletMoves.map((move) => this.#reanchorOne(journalName, move.path, move.to))),
    ]).then(([periodResults, noteletResults]) => {
      const periodRewritten = periodResults.filter((result) => result.isOk()).length;
      const noteletRewritten = noteletResults.filter((result) => result.isOk()).length;
      return {
        rewritten: periodRewritten + noteletRewritten,
        failed: blocked + periodResults.length - periodRewritten,
      };
    });
    return AsyncResult.fromPromise(settled, () => undefined as never);
  }
}
