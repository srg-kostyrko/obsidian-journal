import { normalizePath } from "obsidian";

import { CalendarDate } from "@/calendar";
import { inject } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { Err, Ok, Option, type Result } from "@/infrastructure/result";
import { SettingsService } from "@/settings";
import { TemplateContext, TemplateEngine, tokenize } from "@/templates";

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

  candidateFor(name: string, path: VaultPath): Option<JournalMetadata> {
    const config = this.configFor(name);
    if (!config) return Option.none();
    const context = this.#parseContext(config);
    // When a folder template is present, verify the path has a matching folder
    // prefix, then reverse-parse only the filename against nameTemplate. Folder
    // templates often use partial date formats (e.g. {{date:YYYY}}) that would
    // conflict with the full date captured from the nameTemplate during merge.
    let filename: string = path;
    if (config.folder) {
      const lastSlash = path.lastIndexOf("/");
      if (lastSlash === -1) return Option.none();
      const folderPart = path.slice(0, lastSlash);
      filename = path.slice(lastSlash + 1);
      const folderParsed = this.#engine.parse(tokenize(config.folder), folderPart, context);
      if (folderParsed.kind === "err") return Option.none();
    }
    const parsed = this.#engine.parse(tokenize(`${config.nameTemplate}.md`), filename, context);
    if (parsed.kind === "err") return Option.none();
    const bindings = parsed.value;
    const dateBinding = bindings.get("date");
    if (dateBinding?.kind !== "date") return Option.none();
    const anchor = dateBinding.value.toAnchor();
    const numbers: Record<string, number> = {};
    for (const source of config.numbering.sources) {
      const captured = bindings.get(source.variable);
      if (captured?.kind === "number") numbers[source.variable] = captured.value;
    }
    const metadata: JournalMetadata = {
      journalName: name,
      anchor,
      ...(Object.keys(numbers).length > 0 ? { numbers } : {}),
    };
    return Option.some(metadata);
  }

  #parseContext(config: JournalConfig): TemplateContext {
    let context = TemplateContext.empty()
      .date("date", CalendarDate.today(), config.dateFormat)
      .string("journal_name", config.name);
    for (const source of config.numbering.sources) {
      context = context.number(source.variable, 0);
    }
    return context;
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
