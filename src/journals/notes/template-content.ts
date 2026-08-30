import { inject } from "@/infrastructure/di";
import { NotesService, TemplaterService } from "@/infrastructure/host";
import type { NoteReadError, VaultPath } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";
import { TemplateEngine } from "@/templates";
import type { TemplateContext } from "@/templates";

import { JournalsRepository } from "../repository";

import { NotePathService } from "./note-path";

import type { JournalNotFoundError } from "../errors";
import type { JournalMetadata } from "../types";

export class TemplateContentService {
  readonly #journals = inject(JournalsRepository);
  readonly #notes = inject(NotesService);
  readonly #engine = inject(TemplateEngine);
  readonly #path = inject(NotePathService);
  readonly #templater = inject(TemplaterService);

  /** Renders the first template with content, or "" when none matches. */
  renderTemplates(
    templates: readonly string[],
    context: TemplateContext,
    targetPath: VaultPath,
  ): AsyncResult<string, NoteReadError> {
    if (templates.length === 0) return AsyncResult.ok("");
    return AsyncResult.fromPromise(
      (async () => {
        for (const entry of templates) {
          const withExtension = entry.endsWith(".md") ? entry : `${entry}.md`;
          const renderedPath = this.#engine.renderString(withExtension, context) as VaultPath;
          if (this.#notes.find(renderedPath).isNone()) continue;
          const readResult = await this.#notes.read(renderedPath);
          if (readResult.isErr()) throw readResult.error;
          // An empty template falls through to the next candidate; only a template with
          // content wins the slot.
          if (readResult.value === "") continue;
          const rendered = this.#engine.renderString(readResult.value, context);
          const applied = await this.#templater.apply(renderedPath, targetPath, rendered);
          return applied.match({ ok: (content) => content, err: () => rendered });
        }
        return "";
      })(),
      (error) => error as NoteReadError,
    );
  }

  renderFor(
    name: string,
    metadata: JournalMetadata,
    noteName: string,
    targetPath: VaultPath,
  ): AsyncResult<string, JournalNotFoundError | NoteReadError> {
    const configResult = this.#journals.require(name);
    if (configResult.isErr()) return AsyncResult.err(configResult.error);
    const config = configResult.value;
    // One context for both the template's path and its body: paths resolve
    // {{note_name}}/{{title}} too.
    return this.renderTemplates(config.templates, this.#path.bodyContextFor(config, metadata, noteName), targetPath);
  }
}
