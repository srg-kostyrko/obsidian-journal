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
  readonly #path = inject(NotePathService);
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

    if (this.#notes.find(path).isSome()) {
      return this.#notes.updateFrontmatter(path, mutator).map(() => ({ path, created: false as const }));
    }

    return attempt.in(this, async function* () {
      const config = this.#path.configFor(name);
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
      yield* this.#notes.updateFrontmatter(path, mutator);
      const existing = yield* this.#notes.read(path);
      if (existing.trim() !== "") return;
      const content = yield* this.#content.renderFor(name, metadata, this.#basename(path), path);
      if (content === "") return;
      yield* this.#notes.write(path, content);
    });
  }
}
