import type { AnchorString } from "@/calendar";
import { m } from "@/i18n";
import type { VaultPath } from "@/infrastructure/host";

export interface ChangedSource {
  readonly path: VaultPath;
  readonly anchor: AnchorString;
}

export interface RollReport {
  readonly journalName: string;
  // Decides what an unwritten source means: copy left it unmarked, move left the lines in place.
  readonly mode: "copy" | "move";
  // Roots written to the target; context ancestors carried along are not counted.
  readonly rolled: number;
  // Source notes that contributed at least one root.
  readonly notes: number;
  // Anchors that contributed, oldest first.
  readonly sources: readonly AnchorString[];
  // Every anchor the look-back reached, oldest first.
  readonly read: readonly AnchorString[];
  readonly noPrevious: boolean;
  // Anchors where no note read carried the selection's heading.
  readonly missingHeading: readonly AnchorString[];
  // The heading the selection names, the one missingHeading reports as absent.
  readonly heading: string | null;
  readonly skippedNoteItems: number;
  readonly skippedBlockIds: number;
  // Refused because the text no longer matched the plan; their items reached the target anyway.
  readonly changedSources: readonly ChangedSource[];
  // The source write failed; their items reached the target and are not marked as rolled.
  readonly failedSources: readonly ChangedSource[];
  // Anchors with a note whose metadata had not caught up with its text, so it was not read.
  readonly skippedSources: readonly AnchorString[];
}

function uniqueAnchors(sources: readonly ChangedSource[]): readonly AnchorString[] {
  return [...new Set(sources.map((source) => source.anchor))];
}

function outcomeSentence(report: RollReport): string | null {
  if (report.noPrevious) return m.tasks_roll_no_previous();
  const oldest = report.sources.at(0);
  if (report.rolled > 0 && oldest !== undefined) {
    return m.tasks_roll_done({ count: report.rolled, notes: report.notes, oldest });
  }
  // An anchor with a sentence of its own explaining why nothing came from it is not "empty".
  const explained = new Set([...report.missingHeading, ...report.skippedSources]);
  const firstEmpty = report.read.find((anchor) => !explained.has(anchor));
  return firstEmpty === undefined ? null : m.tasks_roll_nothing({ oldest: firstEmpty });
}

/** The notice summarizing a roll, one sentence per outcome in a fixed order. */
export function rollNotice(report: RollReport): string {
  const heading = report.heading;
  return [
    outcomeSentence(report),
    ...(heading === null ? [] : report.missingHeading.map((date) => m.tasks_roll_missing_heading({ heading, date }))),
    report.skippedNoteItems > 0 ? m.tasks_roll_note_items_skipped({ count: report.skippedNoteItems }) : null,
    report.skippedBlockIds > 0 ? m.tasks_roll_block_ids_skipped({ count: report.skippedBlockIds }) : null,
    ...uniqueAnchors(report.changedSources).map((date) => m.tasks_roll_source_changed({ date, mode: report.mode })),
    ...uniqueAnchors(report.failedSources).map((date) => m.tasks_roll_source_write_failed({ date, mode: report.mode })),
    ...report.skippedSources.map((date) => m.tasks_roll_source_indexing({ date })),
  ]
    .filter((sentence): sentence is string => sentence !== null)
    .join(" ");
}
