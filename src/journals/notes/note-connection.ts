import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { NotesService } from "@/infrastructure/host";
import type {
  FrontmatterError,
  NoteAlreadyExistsError,
  NoteDeleteError,
  NoteNotFoundError,
  NoteRenameError,
  VaultPath,
} from "@/infrastructure/host";
import { AsyncResult, attempt } from "@/infrastructure/result";

import { DEFAULT_FRONTMATTER_KEYS, FRONTMATTER_NAME_KEY } from "../config";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";

import { AnchorOccupiedError } from "./errors";
import { NoteCreationService } from "./note-creation";
import { NotePathService } from "./note-path";
import { splitVaultPath } from "./vault-path";

import type { NoteCreationError } from "./note-creation";

export type ConnectError =
  | NoteCreationError
  | AnchorOccupiedError
  | NoteRenameError
  | NoteAlreadyExistsError
  | NoteNotFoundError
  | NoteDeleteError
  | FrontmatterError;

export type DisconnectError = NoteNotFoundError | FrontmatterError;

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

  #combine(current: VaultPath, configured: VaultPath, options: ConnectOptions): string {
    const [currentFolder, currentName] = splitVaultPath(current);
    const [configuredFolder, configuredName] = splitVaultPath(configured);
    const folder = options.move ? configuredFolder : currentFolder;
    const name = options.rename ? configuredName : currentName;
    return folder ? `${folder}/${name}` : name;
  }

  readonly #defaultClear = (fm: Record<string, unknown>): void => {
    for (const key of DEFAULT_FRONTMATTER_KEYS) delete fm[key];
  };
}
