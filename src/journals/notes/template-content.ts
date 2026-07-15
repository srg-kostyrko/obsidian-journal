import { inject } from "@/infrastructure/di";
import { NotesService, TemplaterService } from "@/infrastructure/host";
import type { NoteReadError, VaultPath } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";
import { TemplateEngine } from "@/templates";

import { JournalNotFoundError } from "../errors";
import { JournalsRepository } from "../repository";

import { NotePathService } from "./note-path";

import type { JournalMetadata } from "../types";

export class TemplateContentService {
  readonly #journals = inject(JournalsRepository);
  readonly #notes = inject(NotesService);
  readonly #engine = inject(TemplateEngine);
  readonly #path = inject(NotePathService);
  readonly #templater = inject(TemplaterService);

  renderFor(
    name: string,
    metadata: JournalMetadata,
    noteName: string,
    targetPath: VaultPath,
  ): AsyncResult<string, JournalNotFoundError | NoteReadError> {
    const configOpt = this.#journals.get(name);
    if (configOpt.isNone()) return AsyncResult.err(new JournalNotFoundError(name));
    const config = configOpt.value;
    if (config.templates.length === 0) return AsyncResult.ok("");

    // One context for both the template's path and its body: paths resolve
    // {{note_name}}/{{title}} too (v2 parity).
    const context = this.#path.bodyContextFor(config, metadata, noteName);

    return AsyncResult.fromPromise(
      (async () => {
        for (const entry of config.templates) {
          const withExtension = entry.endsWith(".md") ? entry : `${entry}.md`;
          const renderedPath = this.#engine.renderString(withExtension, context) as VaultPath;
          if (this.#notes.find(renderedPath).isNone()) continue;
          const readResult = await this.#notes.read(renderedPath);
          if (readResult.isErr()) throw readResult.error;
          // An empty template falls through to the next candidate (v2's truthy check);
          // only a template with content wins the slot.
          if (readResult.value === "") continue;
          const rendered = this.#engine.renderString(readResult.value, context);
          const applied = await this.#templater.apply(renderedPath, targetPath, rendered);
          return applied.match({ ok: (content) => content, err: () => rendered });
        }
        return "";
      })(),
      (error) => error as JournalNotFoundError | NoteReadError,
    );
  }
}
