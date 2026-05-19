import { inject } from "@/infrastructure/di";
import { NotesService } from "@/infrastructure/host";
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

  renderFor(name: string, metadata: JournalMetadata): AsyncResult<string, JournalNotFoundError | NoteReadError> {
    const config = this.#settings.getCollection(journalConfigCollection).get(name) as JournalConfig | undefined;
    if (!config) return AsyncResult.err(new JournalNotFoundError(name));
    if (config.templates.length === 0) return AsyncResult.ok("");

    const context = this.#path.contextFor(config, metadata);

    return AsyncResult.fromPromise(
      (async () => {
        for (const entry of config.templates) {
          const withExtension = entry.endsWith(".md") ? entry : `${entry}.md`;
          const renderedPath = this.#engine.renderString(withExtension, context) as VaultPath;
          if (this.#notes.find(renderedPath).isNone()) continue;
          const readResult = await this.#notes.read(renderedPath);
          if (readResult.isErr()) throw readResult.error;
          return this.#engine.renderString(readResult.value, context);
        }
        return "";
      })(),
      (cause) => cause as JournalNotFoundError | NoteReadError,
    );
  }
}
