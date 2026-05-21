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

import { confirmCreationModal } from "./confirm-creation-modal";
import { NotePathService } from "./note-path";
import { TemplateContentService } from "./template-content";

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

const EXPECTS_TIMEOUT_MS = 5000;

export class NoteCreationService {
  readonly #notes = inject(NotesService);
  readonly #path = inject(NotePathService);
  readonly #content = inject(TemplateContentService);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #modals = inject(ModalService);

  readonly #expected = new Map<VaultPath, ReturnType<typeof window.setTimeout>>();

  expects(path: VaultPath): boolean {
    return this.#expected.has(path);
  }

  ensureNote(
    name: string,
    metadata: JournalMetadata,
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
      if (config?.confirmCreation) {
        const confirmed = yield* this.#modals
          .open(confirmCreationModal, { journalName: name, noteName: this.#basename(path) })
          .mapErr(() => new UserAborted("confirm-creation") as NoteCreationError);
        if (!confirmed) return yield* new Err(new UserAborted("confirm-creation"));
      }
      this.#markExpected(path);
      const createResult = await this.#notes.create(path, "");
      if (createResult.isErr()) {
        this.#clearExpected(path);
        return yield* new Err(createResult.error as NoteCreationError);
      }
      const content = yield* this.#content.renderFor(name, metadata, this.#basename(path), path);
      if (content !== "") yield* this.#notes.write(path, content);
      yield* this.#notes.updateFrontmatter(path, mutator);
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

  clearExpected(path: VaultPath): void {
    this.#clearExpected(path);
  }

  #markExpected(path: VaultPath): void {
    this.#clearExpected(path);
    this.#expected.set(
      path,
      window.setTimeout(() => this.#expected.delete(path), EXPECTS_TIMEOUT_MS),
    );
  }

  #clearExpected(path: VaultPath): void {
    const handle = this.#expected.get(path);
    if (handle !== undefined) window.clearTimeout(handle);
    this.#expected.delete(path);
  }

  #basename(path: VaultPath): string {
    const filename = path.split("/").pop() ?? path;
    return filename.replace(/\.md$/, "");
  }
}
