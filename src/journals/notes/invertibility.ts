import { match } from "ts-pattern";

import { CalendarDate, weekOfMonth } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { formatConjunction, m } from "@/i18n";
import type { VaultPath } from "@/infrastructure/host";
import { TemplateContext, tokenize, variableNames, type TemplateEngine } from "@/templates";

import { parseSpecFor } from "../prompts/prompt-binding";
import { promptsInPath } from "../prompts/prompts-in-path";

import type { JournalConfig } from "../config";
import type { CycleService } from "../cycle";
import type { NotePathService } from "./note-path";
import type { Prompt } from "../prompts/config";

export type InvertibilityWarning =
  | {
      kind: "non-invertible";
      part: "name" | "folder";
      reason: "function-token" | "unknown-variable" | "clock-variable";
      offending: string;
    }
  | { kind: "coarse-date" }
  | { kind: "unreadable-date" }
  | { kind: "cyclic-top" }
  | { kind: "no-carry"; offending: string }
  | { kind: "unused-digits"; missing: readonly string[] }
  | { kind: "prompt-in-path"; reason: "text" | "toggle"; offending: string };

export interface InvertibilityServices {
  engine: TemplateEngine;
  cycle: CycleService;
  paths: NotePathService;
}

const DATE_VARIABLES = new Set(["date", "start_date", "end_date"]);

/** Why a saved journal's note paths cannot be read back into their periods, if they cannot. */
export function invertibilityOf(
  config: JournalConfig,
  { engine, cycle, paths }: InvertibilityServices,
): InvertibilityWarning | null {
  const pathAt = (anchor: AnchorString): VaultPath | undefined => {
    const path = paths.pathForDate(config.name, CalendarDate.fromAnchor(anchor));
    return path.isOk() ? path.value : undefined;
  };
  // Whether a note this journal writes for `anchor` names the period it was written for.
  // Nothing shorter answers that: a date variable identifies the period only when its format
  // is finer than the cycle, and the numbering only when the odometer inverts.
  const roundTripsAt = (name: string, anchor: AnchorString): boolean => {
    const path = pathAt(anchor);
    return (
      path !== undefined &&
      paths
        .candidateFor(name, path)
        .filter((meta) => meta.anchor === anchor)
        .isSome()
    );
  };

  if (!config.nameTemplate) return null;
  const numbering = config.numbering;
  const today = CalendarDate.today();
  let context = TemplateContext.empty()
    .string("journal_name", "preview")
    .date("date", today, "YYYY-MM-DD")
    .date("start_date", today, "YYYY-MM-DD")
    .date("end_date", today, "YYYY-MM-DD")
    .derived("week_of_month", today, weekOfMonth);
  for (const source of numbering.sources) {
    context = context.number(source.variable, 0);
  }
  for (const prompt of config.prompts) {
    context = context.withSpec(prompt.variable, parseSpecFor(prompt));
  }
  // A failure to match the sample path is expected; only a compile-time not-invertible
  // error means the template can't be reverse-parsed at all.
  const parsed = engine.parse(tokenize(config.nameTemplate), "preview", context);
  if (parsed.isErr()) {
    const detail = parsed.error.detail;
    if (detail.kind === "not-invertible") {
      return { kind: "non-invertible", part: "name", reason: detail.reason, offending: detail.offending };
    }
  }
  // The round-trip probe below fails on the same token but cannot say which one, and falls through
  // to verdicts that blame the date or pass the template outright.
  if (config.folder) {
    // The folder offers the rendered note name as a variable; it is known here, not a typo.
    const folderContext = context.string("note_name", "preview").string("title", "preview");
    const parsedFolder = engine.parse(tokenize(config.folder), "preview", folderContext);
    if (parsedFolder.isErr()) {
      const detail = parsedFolder.error.detail;
      if (detail.kind === "not-invertible") {
        return { kind: "non-invertible", part: "folder", reason: detail.reason, offending: detail.offending };
      }
    }
  }
  // Neither a text nor a yes/no answer has a bounded pattern — parseSpecFor gives both only
  // the placeholder as an alternative — so a name or folder carrying one matches only while it
  // is unanswered. Every real note of this journal is then invisible to path inversion, worth
  // its own verdict rather than passing silently as a template that "compiles". The round-trip
  // probe below cannot stand in for this: it renders the unanswered path, which does match.
  // A yes/no reaches a template only by being added to it after the fact — EditPromptModal
  // refuses the reverse order — so this is the only place that catches it.
  const promptInPath = promptsInPath(config).find(
    (prompt): prompt is Extract<Prompt, { type: "text" | "toggle" }> =>
      prompt.type === "text" || prompt.type === "toggle",
  );
  if (promptInPath) return { kind: "prompt-in-path", reason: promptInPath.type, offending: promptInPath.variable };
  // The template compiles, but auto-attach still needs to recover an anchor from the path.
  // Two adjacent periods, because a coarse date variable pins one period of its own range —
  // a year on a two-week cycle names every note of the year alike, yet the interval holding
  // January 1st still round-trips.
  const start = cycle.anchorOf(config.name, probeDate(config));
  const next = start.flatMap((anchor) => cycle.nextAnchor(config.name, anchor));
  if (
    start.isSome() &&
    next.isSome() &&
    roundTripsAt(config.name, start.value) &&
    roundTripsAt(config.name, next.value)
  )
    return null;
  const pathVariables = new Set([...variableNames(config.nameTemplate), ...variableNames(config.folder)]);
  // A template with no date at all is answered by the numbering verdicts alone — a name that
  // never names a date is not the same defect as one whose date names too many periods.
  const dated = [...pathVariables].some((name) => DATE_VARIABLES.has(name.toLowerCase()));
  // Two defects reach this point and they need different words. "Too coarse" means a date the
  // path does give back, just not the period's own -- the probe landed on an earlier period that
  // renders the same name. A date format carrying a time zone gives nothing back at all: the
  // path compiles to a pattern its own rendering never matches. So ask whether any date comes back,
  // not whether two paths differ -- they differ whenever some other segment moved, which a journal
  // naming every week of a month alike does at every month boundary. Where a path does not render
  // at all there is nothing to read, and the older verdict stands.
  const dateVerdict = (): InvertibilityWarning => {
    const path = start.isSome() ? pathAt(start.value) : undefined;
    if (path === undefined) return { kind: "coarse-date" };
    return paths.candidateFor(config.name, path).isSome() ? { kind: "coarse-date" } : { kind: "unreadable-date" };
  };
  // A disabled sequence renders its digits as empty strings, which is a separate defect;
  // none of the numbering verdicts below describes it.
  if (!numbering.enabled) return dated ? dateVerdict() : null;
  if (numbering.sources.every((source) => !pathVariables.has(source.variable))) return dated ? dateVerdict() : null;
  // A wrapping most significant digit repeats, so no template arrangement recovers a date.
  if (numbering.sources.at(0)?.reset.kind === "after") return { kind: "cyclic-top" };
  // A `never` digit below the top emits no carry, so every digit above it stays frozen.
  const noCarry = numbering.sources.slice(1).find((source) => source.reset.kind === "never");
  if (noCarry) return { kind: "no-carry", offending: noCarry.variable };
  const missing = numbering.sources
    .filter((source) => !pathVariables.has(source.variable))
    .map((source) => source.variable);
  return missing.length > 0 ? { kind: "unused-digits", missing } : null;
}

// Numbering does not resolve before its anchor date, so a journal that starts in the future
// has no numbers to name today's period with — probe from its own start instead.
function probeDate(config: JournalConfig): CalendarDate {
  const today = CalendarDate.today();
  const start = config.timeline.start || config.numbering.anchorDate;
  return start > today.toAnchor() ? CalendarDate.fromAnchor(start) : today;
}

export function invertibilityWarningText(warning: InvertibilityWarning): string {
  return match(warning)
    .with({ kind: "non-invertible", part: "folder" }, (w) => m.journal_edit_folder_invertibility_warning(w))
    .with({ kind: "non-invertible", part: "name" }, (w) => m.journal_edit_name_template_invertibility_warning(w))
    .with({ kind: "prompt-in-path" }, (w) => m.journal_invertibility_prompt_in_path(w))
    .with({ kind: "coarse-date" }, () => m.journal_edit_name_template_coarse_date_warning())
    .with({ kind: "unreadable-date" }, () => m.journal_edit_name_template_unreadable_date_warning())
    .with({ kind: "cyclic-top" }, () => m.journal_edit_name_template_cyclic_top_warning())
    .with({ kind: "no-carry" }, (w) => m.journal_edit_name_template_no_carry_warning(w))
    .with({ kind: "unused-digits" }, (w) =>
      m.journal_edit_name_template_unused_digits_warning({ missing: formatConjunction(w.missing) }),
    )
    .exhaustive();
}
