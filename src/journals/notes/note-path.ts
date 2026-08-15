import { normalizePath } from "obsidian";

import { CalendarDate, Clock } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { attempt, Err, Ok, Option, type Result } from "@/infrastructure/result";
import { TemplateContext, TemplateEngine, tokenize } from "@/templates";

import { CycleService } from "../cycle";
import { JournalNotFoundError } from "../errors";
import { FrontmatterService } from "../frontmatter";
import { NumberingService } from "../numbering";
import { JournalsRepository } from "../repository";

import { EmptyNoteNameError } from "./errors";

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
    // start_date/end_date mirror the render context (contextFor) so a note named by its
    // period bounds (e.g. a weekly "{{start_date:YYYY-MM-DD}}") is invertible too; the
    // seeded value is unused, only the kind and default format drive inversion.
    let context = TemplateContext.empty()
      .date("date", CalendarDate.today(), config.dateFormat)
      .date("start_date", CalendarDate.today(), config.dateFormat)
      .date("end_date", CalendarDate.today(), config.dateFormat)
      .string("journal_name", config.name);
    for (const source of config.numbering.sources) {
      context = context.number(source.variable, 0);
    }
    return context;
  }

  pathForDate(name: string, date: CalendarDate): Result<VaultPath, JournalNotFoundError | EmptyNoteNameError> {
    return attempt.in(this, function* (this: NotePathService) {
      const anchor = yield* this.#cycle.anchorOf(name, date).okOrElse(() => new JournalNotFoundError(name));
      const metadata = yield* this.#frontmatter.buildMetadata(name, anchor);
      return yield* this.pathFor(name, metadata);
    });
  }

  pathFor(name: string, metadata: JournalMetadata): Result<VaultPath, JournalNotFoundError | EmptyNoteNameError> {
    return this.#journals.require(name).flatMap((config) => {
      const context = this.contextFor(config, metadata);
      const noteName = this.#engine.renderString(config.nameTemplate, context);
      // A note named "" becomes the dotfile ".md", which is invisible in the vault.
      // Reject rather than trim: trimming would move every template that renders
      // trailing space to a different path.
      if (noteName.trim() === "") return new Err(new EmptyNoteNameError(name));
      // The rendered note name feeds back into the folder as {{note_name}}/{{title}},
      // so the filename must render first.
      const folderContext = this.#withNoteName(context, noteName);
      const folder = config.folder ? this.#engine.renderString(config.folder, folderContext) : "";
      const joined = folder ? `${folder}/${noteName}.md` : `${noteName}.md`;
      return new Ok(normalizePath(joined) as VaultPath);
    });
  }

  candidateFor(name: string, path: VaultPath): Option<JournalMetadata> {
    const config = this.configFor(name);
    if (!config) return Option.none();
    const context = this.#parseContext(config);
    // Invert the whole folder+name template in one pass so a date split across folder
    // segments and the filename (e.g. Journals/{{date:YYYY}}/{{date:MM}}/{{date:DD}})
    // reassembles into a single anchor rather than losing the folder's components.
    const template = config.folder ? `${config.folder}/${config.nameTemplate}.md` : `${config.nameTemplate}.md`;
    const parsed = this.#engine.parse(tokenize(template), path, context);
    if (parsed.kind === "err") return Option.none();
    const bindings = parsed.value;
    const numbers: Record<string, number> = {};
    for (const source of config.numbering.sources) {
      const captured = bindings.get(source.variable);
      if (captured?.kind === "number") numbers[source.variable] = captured.value;
    }
    // The date variable is the canonical anchor source; start_date/end_date fall inside the
    // same period, so a note named by its bounds recovers the anchor too. A template with no
    // date at all (e.g. "Sprint {{index}}") falls back to inverting the captured numbering.
    const dateBinding = bindings.get("date") ?? bindings.get("start_date") ?? bindings.get("end_date");
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
      // A declared numbering variable that didn't resolve renders empty (e.g. numbering
      // disabled) rather than leaking the literal `{{index}}` token.
      context = value === undefined ? context.string(source.variable, "") : context.number(source.variable, value);
    }
    // Render-time snapshots — invertible:false so they don't enter the filename→date round-trip.
    context = context.date("current_date", CalendarDate.today(), "YYYY-MM-DD", { invertible: false });
    const clockSpec = { kind: "clock", value: Clock.now(), defaultFormat: "HH:mm" } as const;
    context = context.withSpec("time", clockSpec).withSpec("current_time", clockSpec);
    return context;
  }

  /** What this journal calls the note for a period, whether or not that note exists yet. */
  noteNameFor(config: JournalConfig, metadata: JournalMetadata): string {
    return this.#engine.renderString(config.nameTemplate, this.contextFor(config, metadata));
  }

  bodyContextFor(config: JournalConfig, metadata: JournalMetadata, noteName: string): TemplateContext {
    return this.#withNoteName(this.contextFor(config, metadata), noteName);
  }
}
