import { match } from "ts-pattern";

import { CalendarDate, relativeDate, type AnchorString, type PeriodKind } from "@/calendar";
import { m } from "@/i18n";
import { basenameOf } from "@/infrastructure/host";
import { Err, type Option, type Result } from "@/infrastructure/result";
import type {
  CycleService,
  JournalConfig,
  JournalEntry,
  JournalMetadata,
  NotePathService,
  NumberingService,
  JournalWrite,
} from "@/journals";
import { UnrenderableDateFormatError, variableNames, type TemplateContext, type TemplateEngine } from "@/templates";

export interface NavRowContextInputs {
  readonly journal: JournalConfig;
  readonly refDate: AnchorString;
  readonly entry: Option<JournalEntry>;
  readonly cycle: CycleService;
  readonly numbering: NumberingService;
  readonly notePath: NotePathService;
  readonly today: AnchorString;
}

function fixedPeriodKindFor(write: JournalWrite): Exclude<PeriodKind, "decade"> | null {
  return match(write)
    .with({ type: "day" }, () => "day" as const)
    .with({ type: "week" }, () => "week" as const)
    .with({ type: "month" }, () => "month" as const)
    .with({ type: "quarter" }, () => "quarter" as const)
    .with({ type: "year" }, () => "year" as const)
    .with({ type: "custom" }, () => null)
    .exhaustive();
}

// Custom intervals have no fixed period unit, so relative_date names the interval by the
// journal itself ("This/Last/Next <journal>", "N <journal> ago") rather than pluralizing an
// English unit name, since a user's journal name can't be inflected. Steps are counted from
// the interval containing today to the row's interval.
function customRelativeDate(name: string, cycle: CycleService, refDate: AnchorString, today: AnchorString): string {
  const stepsOpt = cycle
    .anchorOf(name, CalendarDate.fromAnchor(today))
    .flatMap((currentAnchor) => cycle.countRepeats(name, currentAnchor, refDate));
  if (stepsOpt.isNone()) return "";
  const steps = stepsOpt.value;
  if (steps === 0) return m.relative_date_custom_this({ name });
  if (steps === -1) return m.relative_date_custom_last({ name });
  if (steps === 1) return m.relative_date_custom_next({ name });
  if (steps < 0) return m.relative_date_custom_ago({ name, count: -steps });
  return m.relative_date_custom_from_now({ name, count: steps });
}

const NOTE_NAME_VARIABLES = new Set(["note_name", "title"]);

function buildContext(inputs: NavRowContextInputs): {
  context: TemplateContext;
  nameError: { pattern: string; reason: string } | null;
} {
  const { journal, refDate, entry, cycle, numbering, notePath, today } = inputs;
  const periodKind = fixedPeriodKindFor(journal.write);
  const relative =
    periodKind === null
      ? customRelativeDate(journal.name, cycle, refDate, today)
      : relativeDate(periodKind, refDate, today);

  // A note's stored numbers are authoritative (manual extension/renumber); fall back to the
  // computed numbering so the row resolves the index even before the note exists.
  const numbers =
    entry.isSome() && entry.value.numbers
      ? entry.value.numbers
      : numbering.assignNumbers(journal.name, refDate).getOrUndefined();
  const metadata: JournalMetadata = { journalName: journal.name, anchor: refDate, ...(numbers && { numbers }) };

  // A row names the note it opens, so an existing note is named as it actually is — renamed,
  // or created under a name template the journal has since changed. Only a note that does not
  // exist yet is named by rendering the template.
  // A name that cannot render leaves the variable empty and is returned beside the context:
  // only a segment that reads note_name or title is failed by it (renderNavRow), not every row.
  const named = entry.isSome() ? undefined : notePath.noteNameFor(journal, metadata);
  let noteName = "";
  if (entry.isSome()) noteName = basenameOf(entry.value.path);
  else if (named?.kind === "ok") noteName = named.value;
  const nameError = named?.kind === "err" ? named.error : null;
  const noteSpec = { kind: "string", value: noteName } as const;

  // Sharing the note's own render context is what keeps a row's variables in step with the
  // note's — the date trio, the numbering fallbacks and the render-time clock included.
  const context = notePath
    .contextFor(journal, metadata)
    .string("relative_date", relative)
    .withSpec("note_name", noteSpec)
    .withSpec("title", noteSpec);
  return { context, nameError };
}

export function buildNavRowContext(inputs: NavRowContextInputs): TemplateContext {
  return buildContext(inputs).context;
}

export function renderNavRow(
  engine: TemplateEngine,
  template: string,
  inputs: NavRowContextInputs,
): Result<string, UnrenderableDateFormatError> {
  const { context, nameError } = buildContext(inputs);
  if (nameError) {
    const used = [...variableNames(template)].find((name) => NOTE_NAME_VARIABLES.has(name.toLowerCase()));
    if (used !== undefined) {
      return new Err(new UnrenderableDateFormatError(used, nameError.pattern, nameError.reason));
    }
  }
  return engine.renderString(template, context);
}
