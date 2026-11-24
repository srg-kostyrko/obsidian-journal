import { inject } from "@/infrastructure/di";
import { NotesService, TemplaterService } from "@/infrastructure/host";
import type { NoteReadError, VaultPath } from "@/infrastructure/host";
import { AsyncResult, Err, Ok, type Result } from "@/infrastructure/result";
import { TemplateEngine } from "@/templates";
import type { TemplateContext, UnrenderableDateFormatError } from "@/templates";

import { JournalsRepository } from "../repository";

import { JournalDateFormatError } from "./errors";
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
    journalName: string,
    templates: readonly string[],
    context: TemplateContext,
    targetPath: VaultPath,
  ): AsyncResult<string, NoteReadError | JournalDateFormatError> {
    if (templates.length === 0) return AsyncResult.ok("");
    const unrenderable = (error: UnrenderableDateFormatError): JournalDateFormatError =>
      JournalDateFormatError.from(journalName, error);
    return AsyncResult.fromPromise(
      (async (): Promise<Result<string, JournalDateFormatError>> => {
        for (const entry of templates) {
          const withExtension = entry.endsWith(".md") ? entry : `${entry}.md`;
          const renderedPath = this.#engine.renderString(withExtension, context);
          if (renderedPath.isErr()) return new Err(unrenderable(renderedPath.error));
          const templatePath = renderedPath.value as VaultPath;
          if (this.#notes.find(templatePath).isNone()) continue;
          const readResult = await this.#notes.read(templatePath);
          if (readResult.isErr()) throw readResult.error;
          // An empty template falls through to the next candidate; only a template with
          // content wins the slot.
          if (readResult.value === "") continue;
          const rendered = this.#engine.renderDocument(readResult.value, context);
          if (rendered.isErr()) return new Err(unrenderable(rendered.error));
          // Templater pulls a `tp.file.include` sub-template straight off disk, so the same
          // context has to travel with it or the sub-template keeps its variables literal.
          // Templater wants a string back, so a sub-template that cannot render is held aside
          // and fails the whole render once Templater returns.
          let nestedFailure: UnrenderableDateFormatError | undefined;
          const applied = await this.#templater.apply(templatePath, targetPath, rendered.value, (raw) =>
            this.#engine.renderDocument(raw, context).match({
              ok: (content) => content,
              err: (error) => {
                nestedFailure ??= error;
                return raw;
              },
            }),
          );
          if (nestedFailure !== undefined) return new Err(unrenderable(nestedFailure));
          return new Ok(applied.match({ ok: (content) => content, err: () => rendered.value }));
        }
        return new Ok("");
      })(),
      (error) => error as NoteReadError,
    ).flatMap((result) => result);
  }

  renderFor(
    name: string,
    metadata: JournalMetadata,
    noteName: string,
    targetPath: VaultPath,
  ): AsyncResult<string, JournalNotFoundError | NoteReadError | JournalDateFormatError> {
    const configResult = this.#journals.require(name);
    if (configResult.isErr()) return AsyncResult.err(configResult.error);
    const config = configResult.value;
    // One context for both the template's path and its body: paths resolve
    // {{note_name}}/{{title}} too.
    return this.renderTemplates(
      name,
      config.templates,
      this.#path.bodyContextFor(config, metadata, noteName),
      targetPath,
    );
  }
}
