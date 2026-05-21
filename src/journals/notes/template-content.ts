import { inject } from "@/infrastructure/di";
import { NotesService, TemplaterService } from "@/infrastructure/host";
import type { NoteReadError, VaultPath } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";
import { SettingsService } from "@/settings";
import { TemplateEngine } from "@/templates";

import { journalConfigCollection } from "../config";
import { JournalNotFoundError } from "../errors";

import { NotePathService } from "./note-path";

import type { JournalConfig } from "../config";
import type { JournalMetadata } from "../types";

export class TemplateContentService {
  readonly #settings = inject(SettingsService);
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
    const config = this.#settings.getCollection(journalConfigCollection).get(name) as JournalConfig | undefined;
    if (!config) return AsyncResult.err(new JournalNotFoundError(name));
    if (config.templates.length === 0) return AsyncResult.ok("");

    const pathContext = this.#path.contextFor(config, metadata);
    const bodyContext = this.#path.bodyContextFor(config, metadata, noteName);

    return AsyncResult.fromPromise(
      (async () => {
        for (const entry of config.templates) {
          const withExtension = entry.endsWith(".md") ? entry : `${entry}.md`;
          const renderedPath = this.#engine.renderString(withExtension, pathContext) as VaultPath;
          if (this.#notes.find(renderedPath).isNone()) continue;
          const readResult = await this.#notes.read(renderedPath);
          if (readResult.isErr()) throw readResult.error;
          const rendered = this.#engine.renderString(readResult.value, bodyContext);
          const applied = await this.#templater.apply(renderedPath, targetPath, rendered);
          return applied.match({ ok: (content) => content, err: () => rendered });
        }
        return "";
      })(),
      (error) => error as JournalNotFoundError | NoteReadError,
    );
  }
}
