import { inject } from "@/infrastructure/di";
import { UserAborted } from "@/infrastructure/flows";
import { NotesService } from "@/infrastructure/host";
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
import { JournalsRepository } from "../repository";

import { NotePathService } from "./note-path";
import { SelfWriteGuard } from "./self-write-guard";
import { TemplateContentService } from "./template-content";
import { confirmCreationModal } from "./ui/modals";

import type { JournalNotFoundError } from "../errors";
import type { JournalMetadata } from "../types";

export type NoteCreationError =
  | JournalNotFoundError
  | TemplateRenderError
  | NoteReadError
  | NoteCreateError
  | NoteWriteError
  | NoteNotFoundError
  | FrontmatterError
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

  #basename(path: VaultPath): string {
    const filename = path.split("/").pop() ?? path;
    return filename.replace(/\.md$/, "");
  }

  ensureNote(
    name: string,
    metadata: JournalMetadata,
    options?: { skipConfirmation?: boolean },
  ): AsyncResult<{ path: VaultPath; created: boolean }, NoteCreationError> {
    const pathResult = this.#path.pathFor(name, metadata);
    if (pathResult.kind === "err") return AsyncResult.err(pathResult.error);
    const path = pathResult.value;
    const mutatorResult = this.#frontmatter.writeMutator(name, metadata);
    if (mutatorResult.kind === "err") return AsyncResult.err(mutatorResult.error);
    const mutator = mutatorResult.value;

    // A connected note may live away from the config-derived path (renamed, moved,
    // or connected in place); the index knows its real location — reuse it instead
    // of spawning a duplicate at the derived path.
    const indexed = this.#index.entryByAnchor(name, metadata.anchor);
    if (indexed.isSome() && this.#notes.find(indexed.value.path).isSome()) {
      const indexedPath = indexed.value.path;
      return this.#notes
        .updateFrontmatter(indexedPath, mutator)
        .map(() => ({ path: indexedPath, created: false as const }));
    }

    if (this.#notes.find(path).isSome()) {
      return this.#notes.updateFrontmatter(path, mutator).map(() => ({ path, created: false as const }));
    }

    return attempt.in(this, async function* () {
      const config = this.#journals.get(name).getOrUndefined();
      if (!options?.skipConfirmation && config?.confirmCreation) {
        const confirmed = yield* this.#modals
          .open(confirmCreationModal, { journalName: name, noteName: this.#basename(path) })
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
        .renderFor(name, metadata, this.#basename(path), path)
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
      // Emptiness must be judged against the note's original body: writing frontmatter fills
      // the file (Obsidian embeds a `---` block), which would otherwise make a freshly
      // link-created note look non-empty and skip its template. Render into the empty note
      // first, then attach frontmatter last — matching ensureNote's order.
      const existing = yield* this.#notes.read(path);
      if (existing.trim() === "") {
        const content = yield* this.#content.renderFor(name, metadata, this.#basename(path), path);
        if (content !== "") yield* this.#notes.write(path, content);
      }
      yield* this.#notes.updateFrontmatter(path, mutator);
    });
  }
}
