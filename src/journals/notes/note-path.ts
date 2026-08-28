import { normalizePath } from "obsidian";

import { CalendarDate, Clock, weekOfMonth } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { attempt, Err, Ok, Option, type Result } from "@/infrastructure/result";
import { TemplateContext, TemplateEngine, tokenize } from "@/templates";

import { CycleService } from "../cycle";
import { JournalNotFoundError, OutOfTimelineError } from "../errors";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { NumberingService } from "../numbering";
import { answersFromBindings, parseSpecFor, renderSpecFor } from "../prompts/prompt-binding";
import { JournalsRepository } from "../repository";
import { TimelineService } from "../timeline";

import { EmptyNoteNameError } from "./errors";

import type { JournalConfig } from "../config";
import type { PromptAnswer } from "../prompts/config";
import type { JournalMetadata } from "../types";

// A date variable names at most a year of periods on any cycle this plugin writes; the cap is
// what stops a format that renders no date at all (e.g. "{{date:[Log]}}") from walking forever.
const NAMED_PERIOD_SEARCH_LIMIT = 400;

/** A journal's path template, tokenized once, ready to invert many paths. */
export interface PathInverter {
  invert(path: VaultPath): Option<JournalMetadata>;
}

export class NotePathService {
  readonly #journals = inject(JournalsRepository);
  readonly #cycle = inject(CycleService);
  readonly #numbering = inject(NumberingService);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #engine = inject(TemplateEngine);
  readonly #index = inject(JournalsIndex);
  readonly #timeline = inject(TimelineService);

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
      .derived("week_of_month", CalendarDate.today(), weekOfMonth)
      .string("journal_name", config.name);
    for (const source of config.numbering.sources) {
      context = context.number(source.variable, 0);
    }
    for (const prompt of config.prompts) {
      context = context.withSpec(prompt.variable, parseSpecFor(prompt, config.dateFormat));
    }
    return context;
  }

  #metadataForDate(name: string, date: CalendarDate): Result<JournalMetadata, JournalNotFoundError> {
    return attempt.in(this, function* (this: NotePathService) {
      const anchor = yield* this.#cycle.anchorOf(name, date).okOrElse(() => new JournalNotFoundError(name));
      return yield* this.#frontmatter.buildMetadata(name, anchor);
    });
  }

  pathForDate(name: string, date: CalendarDate): Result<VaultPath, JournalNotFoundError | EmptyNoteNameError> {
    return this.#metadataForDate(name, date).flatMap((metadata) => this.pathFor(name, metadata));
  }

  /**
   * Where this journal's note for a period actually is, falling back to where it would be created.
   *
   * A connected note the user has since renamed or moved — or connected in place, keeping its own
   * name — keeps its real path; the rendered template answers only for a note that does not exist
   * yet. Anything that links to a note rather than creating one wants this, not `pathFor`.
   */
  resolvedPathFor(
    name: string,
    metadata: JournalMetadata,
  ): Result<VaultPath, JournalNotFoundError | EmptyNoteNameError> {
    const entry = this.#index.entryByAnchor(name, metadata.anchor);
    if (entry.isSome()) return new Ok(entry.value.path);
    return this.pathFor(name, metadata);
  }

  resolvedPathForDate(name: string, date: CalendarDate): Result<VaultPath, JournalNotFoundError | EmptyNoteNameError> {
    return this.#metadataForDate(name, date).flatMap((metadata) => this.resolvedPathFor(name, metadata));
  }

  /**
   * Where a link for this date should point, or why there is nothing to point at.
   *
   * Eligibility is "a note exists OR the date is in timeline" — the same rule `JournalsApi`
   * applies. The timeline bounds where a journal *writes*, not what it has already written, so a
   * note that outlived a narrowed timeline is still a real note to link to.
   */
  linkTargetForDate(
    name: string,
    date: CalendarDate,
  ): Result<VaultPath, JournalNotFoundError | EmptyNoteNameError | OutOfTimelineError> {
    return this.#metadataForDate(name, date).flatMap(
      (metadata): Result<VaultPath, EmptyNoteNameError | OutOfTimelineError | JournalNotFoundError> => {
        const exists = this.#index.entryByAnchor(name, metadata.anchor).isSome();
        if (!exists && !this.#timeline.contains(name, metadata.anchor)) {
          return new Err(new OutOfTimelineError(name, metadata.anchor));
        }
        return this.resolvedPathFor(name, metadata);
      },
    );
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
    return this.inverterFor(name).flatMap((inverter) => inverter.invert(path));
  }

  inverterFor(name: string): Option<PathInverter> {
    const config = this.configFor(name);
    if (!config) return Option.none();
    const context = this.#parseContext(config);
    // Invert the whole folder+name template in one pass so a date split across folder
    // segments and the filename (e.g. Journals/{{date:YYYY}}/{{date:MM}}/{{date:DD}})
    // reassembles into a single anchor rather than losing the folder's components.
    const template = config.folder ? `${config.folder}/${config.nameTemplate}.md` : `${config.nameTemplate}.md`;
    const tokens = tokenize(template);
    const engine = this.#engine;
    const cycle = this.#cycle;
    const numbering = this.#numbering;
    // The answers travel with the numbers: a prompted name re-renders to the path it was
    // inverted from only if the recovered answer goes back into it. Drop them and the
    // named-period search below never matches, silently falling back to the seed anchor.
    const rendersAs = (
      anchor: AnchorString,
      numbers: Readonly<Record<string, number>> | undefined,
      answers: Readonly<Record<string, PromptAnswer>> | undefined,
      path: VaultPath,
    ) => {
      const rendered = this.pathFor(name, {
        journalName: name,
        anchor,
        ...(numbers && { numbers }),
        ...(answers && { answers }),
      });
      return rendered.isOk() && rendered.value === path;
    };
    // Which period a name belongs to is not always a formula: a date variable can be too coarse
    // to tell the journal's periods apart ("{{date:YYYY}}" on a two-week cycle) while the
    // numbering beside it is cyclic and answers only within the year, so neither half inverts
    // alone and together they still do. The date bounds the search — the periods it names — and
    // the one whose own digits render the path is the answer.
    const searchNamedPeriod = (
      seed: AnchorString,
      path: VaultPath,
      captured: Readonly<Record<string, number>>,
      answers: Readonly<Record<string, PromptAnswer>> | undefined,
    ): AnchorString | undefined => {
      let anchor = seed;
      let digits = numbering.sequenceNumbersFor(name, anchor).getOrUndefined();
      let named = false;
      for (let steps = 0; steps < NAMED_PERIOD_SEARCH_LIMIT; steps++) {
        // Holding the captured digits fixed leaves only the date tokens free, so this asks
        // whether the period is one of those the name's date can mean. The window is contiguous:
        // once past it, no later period can name this date.
        if (rendersAs(anchor, captured, answers, path)) {
          named = true;
          // Ties go to the earliest period. A journal that names two periods identically, digits
          // and all, has no answer to give; the date's own reading picked the earliest too.
          if (rendersAs(anchor, digits, answers, path)) return anchor;
        } else if (named) break;
        const next = cycle.nextAnchor(name, anchor);
        if (next.isNone() || next.value <= anchor) break;
        anchor = next.value;
        // Stepped rather than recomputed: deriving digits from the anchor date costs a walk of
        // its own on a custom cycle, which would make the search quadratic.
        digits = digits
          ? numbering.nextNumbers(name, digits).getOrUndefined()
          : numbering.sequenceNumbersFor(name, anchor).getOrUndefined();
      }
      return undefined;
    };

    return Option.some({
      invert: (path: VaultPath): Option<JournalMetadata> => {
        const parsed = engine.parse(tokens, path, context);
        if (parsed.kind === "err") return Option.none();
        const bindings = parsed.value;
        const numbers: Record<string, number> = {};
        for (const source of config.numbering.sources) {
          const captured = bindings.get(source.variable);
          if (captured?.kind === "number") numbers[source.variable] = captured.value;
        }
        const recovered = answersFromBindings(config.prompts, bindings);
        const answers = Object.keys(recovered).length > 0 ? recovered : undefined;
        const metadataFor = (anchor: AnchorString): JournalMetadata => ({
          journalName: name,
          anchor,
          ...(Object.keys(numbers).length > 0 && { numbers }),
          ...(answers && { answers }),
        });
        // The date variable is the canonical anchor source; start_date/end_date fall inside the
        // same period, so a note named by its bounds recovers the anchor too. A template with no
        // date at all (e.g. "Sprint {{index}}") has nothing to bound a search with, and inverts
        // the captured numbering instead — which needs the odometer to be invertible on its own.
        const dateBinding = bindings.get("date") ?? bindings.get("start_date") ?? bindings.get("end_date");
        if (dateBinding?.kind === "date") {
          // A coarse format (e.g. a week's "YYYY-[W]w") parses back to some day inside the
          // period, not necessarily the period's canonical anchor. Resolve it, or the note
          // attaches with a date parseEntry will reject.
          const seed = cycle.anchorOf(name, dateBinding.value);
          if (seed.isNone()) return Option.none();
          // An odometer that never repeats names its period outright, so there is nothing to
          // search for: it agrees with the search by construction — no other period carries
          // these digits — and answering from it keeps the walk below off the common path.
          const outright = numbering
            .anchorForNumbers(name, numbers)
            .filter((candidate) => rendersAs(candidate, numbers, answers, path));
          if (outright.isSome()) return Option.some(metadataFor(outright.value));
          return Option.some(metadataFor(searchNamedPeriod(seed.value, path, numbers, answers) ?? seed.value));
        }
        const inverted = numbering.anchorForNumbers(name, numbers);
        if (inverted.isNone()) return Option.none();
        return Option.some(metadataFor(inverted.value));
      },
    });
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
      .derived("week_of_month", dateValue, weekOfMonth)
      .string("journal_name", config.name);
    if (startOpt.isSome()) context = context.date("start_date", startOpt.value, config.dateFormat);
    if (endOpt.isSome()) context = context.date("end_date", endOpt.value, config.dateFormat);
    for (const source of config.numbering.sources) {
      const value = metadata.numbers?.[source.variable];
      // A declared numbering variable that didn't resolve renders empty (e.g. numbering
      // disabled) rather than leaking the literal `{{index}}` token.
      context = value === undefined ? context.string(source.variable, "") : context.number(source.variable, value);
    }
    for (const prompt of config.prompts) {
      const spec = renderSpecFor(prompt, metadata.answers?.[prompt.variable], config.dateFormat);
      context = context.withSpec(prompt.variable, spec);
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
    let context = this.#withNoteName(this.contextFor(config, metadata), noteName);
    // The placeholder is a file-name device. In prose it would be an unrepairable token, and
    // every unattended attach path renders a template — so an unanswered prompt renders empty
    // here, the way a declared-but-unresolved numbering variable already does.
    for (const prompt of config.prompts) {
      if (metadata.answers?.[prompt.variable] === undefined) context = context.string(prompt.variable, "");
    }
    return context;
  }
}
