import { normalizePath } from "obsidian";

import { CalendarDate, Clock } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { attempt, Option, type Result } from "@/infrastructure/result";
import { TemplateContext, TemplateEngine, tokenize } from "@/templates";
import type { Bindings } from "@/templates";

import { CycleService } from "../cycle";
import { JournalNotFoundError } from "../errors";
import { FrontmatterService } from "../frontmatter";
import { NumberingService } from "../numbering";
import { JournalsRepository } from "../repository";

import type { JournalConfig } from "../config";
import type { JournalMetadata } from "../types";

export class NotePathService {
  readonly #journals = inject(JournalsRepository);
  readonly #cycle = inject(CycleService);
  readonly #numbering = inject(NumberingService);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #engine = inject(TemplateEngine);

  #withNoteName(context: TemplateContext, noteName: string): TemplateContext {
    const noteSpec = { kind: "string", value: noteName } as const;
    return context.withSpec("note_name", noteSpec).withSpec("title", noteSpec);
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

  pathForDate(name: string, date: CalendarDate): Result<VaultPath, JournalNotFoundError> {
    return attempt.in(this, function* (this: NotePathService) {
      const anchor = yield* this.#cycle.anchorOf(name, date).okOrElse(() => new JournalNotFoundError(name));
      const metadata = yield* this.#frontmatter.buildMetadata(name, anchor);
      return yield* this.pathFor(name, metadata);
    });
  }

  pathFor(name: string, metadata: JournalMetadata): Result<VaultPath, JournalNotFoundError> {
    return this.#journals.require(name).map((config) => {
      const context = this.contextFor(config, metadata);
      const filename = this.#engine.renderString(`${config.nameTemplate}.md`, context);
      // The rendered note name feeds back into the folder as {{note_name}}/{{title}},
      // so the filename must render first (v2 order).
      const folderContext = this.#withNoteName(context, filename.replace(/\.md$/, ""));
      const folder = config.folder ? this.#engine.renderString(config.folder, folderContext) : "";
      const joined = folder ? `${folder}/${filename}` : filename;
      return normalizePath(joined) as VaultPath;
    });
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
    // The date variable is the canonical anchor source; a template without one (e.g.
    // "Sprint {{index}}") falls back to inverting the captured numbering value.
    const dateBinding = bindings.get("date");
    let anchor: AnchorString;
    if (dateBinding?.kind === "date") {
      // A coarse format (e.g. a week's "YYYY-[W]w") parses back to some day inside the
      // period, not necessarily the period's canonical anchor. Resolve it, or the note
      // attaches with a date parseEntry will reject.
      const resolved = this.#cycle.anchorOf(name, dateBinding.value);
      if (resolved.isNone()) return Option.none();
      anchor = resolved.value;
    } else {
      const inverted = this.#numbering.anchorForNumbers(name, numbers);
      if (inverted.isNone()) return Option.none();
      anchor = inverted.value;
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
    // {{date}} renders the period's representative day, which for weeks is the day whose
    // calendar year equals the week-year. The anchor is the stored identity, not the render date.
    const dateValue = this.#cycle
      .representativeOf(config.name, metadata.anchor)
      .getOr(CalendarDate.fromAnchor(metadata.anchor));
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
      // v2 fidelity: a declared numbering variable that didn't resolve renders empty
      // (e.g. numbering disabled) rather than leaking the literal `{{index}}` token.
      context = value === undefined ? context.string(source.variable, "") : context.number(source.variable, value);
    }
    // Render-time snapshots — invertible:false so they don't enter the filename→date round-trip.
    context = context.date("current_date", CalendarDate.today(), "YYYY-MM-DD", { invertible: false });
    const clockSpec = { kind: "clock", value: Clock.now(), defaultFormat: "HH:mm" } as const;
    context = context.withSpec("time", clockSpec).withSpec("current_time", clockSpec);
    return context;
  }

  bodyContextFor(config: JournalConfig, metadata: JournalMetadata, noteName: string): TemplateContext {
    return this.#withNoteName(this.contextFor(config, metadata), noteName);
  }
}
