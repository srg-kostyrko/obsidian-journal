import type { AnchorString } from "@/calendar";
import { m } from "@/i18n";
import type { VaultPath } from "@/infrastructure/host";

export interface ChangedSource {
  readonly path: VaultPath;
  readonly anchor: AnchorString;
}

export interface AnchoredCount {
  readonly anchor: AnchorString;
  readonly count: number;
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
  // Today's note was missing and the roll was not allowed to create it, so nothing was read or written.
  readonly noTarget: boolean;
  // Anchors where no note read carried the selection's heading.
  readonly missingHeading: readonly AnchorString[];
  // The heading the selection names, the one missingHeading reports as absent.
  readonly heading: string | null;
  readonly skippedNoteItems: number;
  readonly skippedBlockIds: number;
  // The same two counts by the anchor they were found at, oldest first; each sums to its total.
  readonly skippedNoteItemsAt: readonly AnchoredCount[];
  readonly skippedBlockIdsAt: readonly AnchoredCount[];
  // Refused because the text no longer matched the plan; their items reached the target anyway.
  readonly changedSources: readonly ChangedSource[];
  // The source write failed; their items reached the target and are not marked as rolled.
  readonly failedSources: readonly ChangedSource[];
  // Anchors with a note whose metadata had not caught up with its text, so it was not read.
  readonly skippedSources: readonly AnchorString[];
  // Anchors with a note that failed to read, so it was not planned.
  readonly unreadSources: readonly AnchorString[];
}

function uniqueAnchors(sources: readonly ChangedSource[]): readonly AnchorString[] {
  return [...new Set(sources.map((source) => source.anchor))];
}

export type RollSentenceKind =
  | "rolled"
  | "nothing"
  | "no-previous"
  | "missing-heading"
  | "note-items-skipped"
  | "block-ids-skipped"
  | "source-changed"
  | "source-write-failed"
  | "source-indexing"
  | "source-unread";

export interface RollSentence {
  readonly kind: RollSentenceKind;
  readonly text: string;
  // The source the sentence names, or null for one that sums over every source read.
  readonly anchor: AnchorString | null;
}

function outcomeSentence(report: RollReport): RollSentence | null {
  if (report.noPrevious) return { kind: "no-previous", text: m.tasks_roll_no_previous(), anchor: null };
  const oldest = report.sources.at(0);
  if (report.rolled > 0 && oldest !== undefined) {
    return {
      kind: "rolled",
      text: m.tasks_roll_done({ count: report.rolled, notes: report.notes, oldest }),
      anchor: null,
    };
  }
  // An anchor with a sentence of its own explaining why nothing came from it is not "empty".
  const explained = new Set([...report.missingHeading, ...report.skippedSources, ...report.unreadSources]);
  const firstEmpty = report.read.find((anchor) => !explained.has(anchor));
  return firstEmpty === undefined
    ? null
    : { kind: "nothing", text: m.tasks_roll_nothing({ oldest: firstEmpty }), anchor: firstEmpty };
}

function perAnchor(
  kind: RollSentenceKind,
  anchors: readonly AnchorString[],
  text: (date: AnchorString) => string,
): readonly RollSentence[] {
  return anchors.map((anchor) => ({ kind, text: text(anchor), anchor }));
}

export type CountedKind = "note-items-skipped" | "block-ids-skipped";

/** The sentence for a count of skipped items, whichever sources it sums over. */
export function countedSentence(kind: CountedKind, count: number): string {
  return kind === "note-items-skipped"
    ? m.tasks_roll_note_items_skipped({ count })
    : m.tasks_roll_block_ids_skipped({ count });
}

function counted(kind: CountedKind, count: number): readonly RollSentence[] {
  return count > 0 ? [{ kind, text: countedSentence(kind, count), anchor: null }] : [];
}

/** A roll's outcome sentences, in the fixed order its notice shows them. */
export function rollSentences(report: RollReport): readonly RollSentence[] {
  const { heading, mode } = report;
  const outcome = outcomeSentence(report);
  return [
    ...(outcome === null ? [] : [outcome]),
    ...(heading === null
      ? []
      : perAnchor("missing-heading", report.missingHeading, (date) => m.tasks_roll_missing_heading({ heading, date }))),
    ...counted("note-items-skipped", report.skippedNoteItems),
    ...counted("block-ids-skipped", report.skippedBlockIds),
    ...perAnchor("source-changed", uniqueAnchors(report.changedSources), (date) =>
      m.tasks_roll_source_changed({ date, mode }),
    ),
    ...perAnchor("source-write-failed", uniqueAnchors(report.failedSources), (date) =>
      m.tasks_roll_source_write_failed({ date, mode }),
    ),
    ...perAnchor("source-indexing", report.skippedSources, (date) => m.tasks_roll_source_indexing({ date })),
    ...perAnchor("source-unread", report.unreadSources, (date) => m.tasks_roll_source_unread({ date })),
  ];
}

/** The notice summarizing a roll, one sentence per outcome in a fixed order. */
export function rollNotice(report: RollReport): string {
  return rollSentences(report)
    .map((sentence) => sentence.text)
    .join(" ");
}
