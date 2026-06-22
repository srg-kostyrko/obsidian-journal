import { normalizePath } from "obsidian";

import { CalendarDate, Clock } from "@/calendar";
import { inject } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { attempt, Err, Ok, Option, type Result } from "@/infrastructure/result";
import { TemplateContext, TemplateEngine, tokenize } from "@/templates";
import type { Bindings } from "@/templates";

import { CycleService } from "../cycle";
import { JournalNotFoundError } from "../errors";
import { FrontmatterService } from "../frontmatter";
import { JournalsRepository } from "../repository";

import type { JournalConfig } from "../config";
import type { JournalMetadata } from "../types";

export class NotePathService {
  readonly #journals = inject(JournalsRepository);
  readonly #cycle = inject(CycleService);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #engine = inject(TemplateEngine);

  #parseContext(config: JournalConfig): TemplateContext {
    let context = TemplateContext.empty()
      .date("date", CalendarDate.today(), config.dateFormat)
      .string("journal_name", config.name);
    for (const source of config.numbering.sources) {
      context = context.number(source.variable, 0);
    }
    return context;
  }

  pathForDate(name: string, date: CalendarDate): Result<VaultPath, JournalNotFoundError> {
    return attempt.in(this, function* (this: NotePathService) {
      const anchor = yield* this.#cycle.anchorOf(name, date).okOrElse(() => new JournalNotFoundError(name));
      const metadata = yield* this.#frontmatter.buildMetadata(name, anchor);
      return yield* this.pathFor(name, metadata);
    });
  }

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
    // The template engine can't reconcile two date bindings for the same variable
    // at different resolutions (e.g. {{date:YYYY}} in the folder vs {{date}} in
    // the filename). Parsing each part independently avoids the conflict; filename
    // is the canonical date source, so its bindings take precedence on any overlap.
    let filename: string = path;
    let folderBindings: Bindings | undefined;
    if (config.folder) {
      const lastSlash = path.lastIndexOf("/");
      if (lastSlash === -1) return Option.none();
      const folderPart = path.slice(0, lastSlash);
      filename = path.slice(lastSlash + 1);
      const folderParsed = this.#engine.parse(tokenize(config.folder), folderPart, context);
      if (folderParsed.kind === "err") return Option.none();
      folderBindings = folderParsed.value;
    }
    const parsed = this.#engine.parse(tokenize(`${config.nameTemplate}.md`), filename, context);
    if (parsed.kind === "err") return Option.none();
    const bindings = parsed.value;
    const dateBinding = bindings.get("date");
    if (dateBinding?.kind !== "date") return Option.none();
    const anchor = dateBinding.value.toAnchor();
    const numbers: Record<string, number> = {};
    // Seed from folder bindings first so filename bindings take precedence.
    if (folderBindings) {
      for (const source of config.numbering.sources) {
        const captured = folderBindings.get(source.variable);
        if (captured?.kind === "number") numbers[source.variable] = captured.value;
      }
    }
    for (const source of config.numbering.sources) {
      const captured = bindings.get(source.variable);
      if (captured?.kind === "number") numbers[source.variable] = captured.value;
    }
    const metadata: JournalMetadata = {
      journalName: name,
      anchor,
      ...(Object.keys(numbers).length > 0 && { numbers }),
    };
    return Option.some(metadata);
  }

  configFor(name: string): JournalConfig | undefined {
    const opt = this.#journals.get(name);
    return opt.isSome() ? opt.value : undefined;
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
    // Render-time snapshots — invertible:false so they don't enter the filename→date round-trip.
    context = context.date("current_date", CalendarDate.today(), "YYYY-MM-DD", { invertible: false });
    const clockSpec = { kind: "clock", value: Clock.now(), defaultFormat: "HH:mm" } as const;
    context = context.withSpec("time", clockSpec).withSpec("current_time", clockSpec);
    return context;
  }

  bodyContextFor(config: JournalConfig, metadata: JournalMetadata, noteName: string): TemplateContext {
    const base = this.contextFor(config, metadata);
    const noteSpec = { kind: "string", value: noteName } as const;
    return base.withSpec("note_name", noteSpec).withSpec("title", noteSpec);
  }
}
