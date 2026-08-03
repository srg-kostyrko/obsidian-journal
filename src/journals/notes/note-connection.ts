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
import { AsyncResult, attempt } from "@/infrastructure/result";

import { DEFAULT_FRONTMATTER_KEYS, FRONTMATTER_NAME_KEY } from "../config";
import { CycleService } from "../cycle";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";

import { AnchorOccupiedError } from "./errors";
import { NoteCreationService } from "./note-creation";
import { NotePathService } from "./note-path";
import { splitVaultPath } from "./vault-path";

import type { NoteCreationError } from "./note-creation";
import type { JournalNotFoundError } from "../errors";
import type { JournalMetadata } from "../types";

export type ConnectError =
  | NoteCreationError
  | AnchorOccupiedError
  | NoteRenameError
  | NoteAlreadyExistsError
  | NoteNotFoundError
  | NoteDeleteError
  | FrontmatterError;

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
}

type ReanchorError = NoteNotFoundError | FrontmatterError | JournalNotFoundError;

export interface ConnectOptions {
  override?: boolean;
  rename?: boolean;
  move?: boolean;
}

export class NoteConnectionService {
  readonly #notes = inject(NotesService);
  readonly #path = inject(NotePathService);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #creation = inject(NoteCreationService);
  readonly #index = inject(JournalsIndex);
  readonly #cycle = inject(CycleService);
  readonly #logger = inject(LoggerFactoryToken).named("note-connection");

  readonly #defaultClear = (fm: Record<string, unknown>): void => {
    for (const key of DEFAULT_FRONTMATTER_KEYS) delete fm[key];
  };

  #forEachConnected(
    journalName: string,
    op: (path: VaultPath) => AsyncResult<void, unknown>,
  ): AsyncResult<void, never> {
    const paths = [...this.#index.entriesFor(journalName)].map(([, path]) => path);
    // Best-effort, matching v2: an AsyncResult never rejects, so Promise.all settles even when
    // individual notes fail. We discard the per-note Results so one bad note can't strand the
    // journal-wide operation. Spreading entriesFor up front snapshots paths before the ops mutate the index.
    const all: Promise<void> = Promise.all(paths.map((path) => op(path))).then(() => {
      return;
    });
    return AsyncResult.fromPromise(all, () => undefined as never);
  }

  #reanchorOne(journalName: string, path: VaultPath, target: ReanchorTarget): AsyncResult<void, ReanchorError> {
    return attempt.in(this, async function* (this: NoteConnectionService) {
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

  connect(
    journalName: string,
    path: VaultPath,
    anchor: AnchorString,
    options: ConnectOptions = {},
  ): AsyncResult<{ path: VaultPath }, ConnectError> {
    return attempt.in(this, async function* (this: NoteConnectionService) {
      // Metadata is resolved from the anchor's stored entry (incl. any endDate), so an
      // overridden slot's period metadata transfers to the new note — matching v2 connect.
      const metadata = yield* this.#frontmatter.buildMetadata(journalName, anchor);

      let target = path;
      if (options.rename || options.move) {
        const configured = yield* this.#path.pathFor(journalName, metadata);
        target = this.#combine(path, configured, options) as VaultPath;
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
      yield* this.#creation.attachNote(journalName, target, metadata);
      return { path: target };
    });
  }

  disconnect(path: VaultPath): AsyncResult<void, DisconnectError> {
    const entry = this.#index.entryByPath(path);
    let mutator: (fm: Record<string, unknown>) => void;
    if (entry.isSome()) {
      const mutatorResult = this.#frontmatter.clearMutator(entry.value.journalName);
      mutator = mutatorResult.isOk() ? mutatorResult.value : this.#defaultClear;
    } else {
      mutator = this.#defaultClear;
    }
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

  // Renaming a frontmatter key in config alone would orphan every connected note (their old
  // key no longer matches parseEntry). Move the value across so the notes stay connected.
  renameFieldAll(journalName: string, oldKey: string, newKey: string): AsyncResult<void, never> {
    return this.#forEachConnected(journalName, (path) =>
      this.#notes.updateFrontmatter(path, (fm) => {
        if (!Object.hasOwn(fm, oldKey)) return;
        fm[newKey] = fm[oldKey];
        delete fm[oldKey];
      }),
    );
  }

  reapplyAll(journalName: string): AsyncResult<void, never> {
    return this.#forEachConnected(journalName, (path) =>
      attempt.in(this, async function* (this: NoteConnectionService) {
        const entry = yield* this.#index.entryByPath(path).okOrElse(() => new NoteNotFoundError(path));
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

    const settled = Promise.all(moves.map((move) => this.#reanchorOne(journalName, move.path, move.to))).then(
      (results) => {
        const rewritten = results.filter((result) => result.isOk()).length;
        return { rewritten, failed: blocked + results.length - rewritten };
      },
    );
    return AsyncResult.fromPromise(settled, () => undefined as never);
  }
}
