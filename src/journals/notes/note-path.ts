import { normalizePath } from "obsidian";

import { CalendarDate } from "@/calendar";
import { inject } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { Err, Ok, Option, type Result } from "@/infrastructure/result";
import { SettingsService } from "@/settings";
import { TemplateContext, TemplateEngine } from "@/templates";

import { journalConfigCollection } from "../config";
import { CycleService } from "../cycle";
import { JournalNotFoundError } from "../errors";

import type { JournalConfig } from "../config";
import type { JournalMetadata } from "../types";

export class NotePathService {
  readonly #settings = inject(SettingsService);
  readonly #cycle = inject(CycleService);
  readonly #engine = inject(TemplateEngine);

  pathFor(name: string, metadata: JournalMetadata): Result<VaultPath, JournalNotFoundError> {
    const config = this.configFor(name);
    if (config) {
      const context = this.contextFor(config, metadata);
      const filename = this.#engine.renderString(`${config.nameTemplate}.md`, context);
      const folder = config.folder ? this.#engine.renderString(config.folder, context) : "";
      const joined = folder ? `${folder}/${filename}` : filename;
      return new Ok(normalizePath(joined) as VaultPath);
    }
    return new Err(new JournalNotFoundError(name));
  }

  candidateFor(_name: string, _path: VaultPath): Option<JournalMetadata> {
    // Implemented in Task 7.
    return Option.none();
  }

  configFor(name: string): JournalConfig | undefined {
    return this.#settings.getCollection(journalConfigCollection).get(name) as JournalConfig | undefined;
  }

  contextFor(config: JournalConfig, metadata: JournalMetadata): TemplateContext {
    const dateValue = CalendarDate.fromAnchor(metadata.anchor);
    const startOpt = this.#cycle.startOf(config.name, metadata.anchor);
    const endOpt =
      metadata.endDate === undefined
        ? this.#cycle.endOf(config.name, metadata.anchor)
        : Option.some(CalendarDate.fromAnchor(metadata.endDate));
    let context = TemplateContext.empty()
      .date("date", dateValue, config.dateFormat)
      .string("journal_name", config.name);
    if (startOpt.isSome()) context = context.date("start_date", startOpt.value, config.dateFormat);
    if (endOpt.isSome()) context = context.date("end_date", endOpt.value, config.dateFormat);
    for (const source of config.numbering.sources) {
      const value = metadata.numbers?.[source.variable];
      if (value !== undefined) context = context.number(source.variable, value);
    }
    return context;
  }
}
