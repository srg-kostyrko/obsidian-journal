import type { AnchorString } from "@/calendar";
import { m } from "@/i18n";

import { countedSentence, rollSentences, type AnchoredCount, type RollReport, type RollSentence } from "../report";

// Nobody pressed anything, so a roll that moved nothing has nothing to say about itself.
const SILENT_OUTCOMES: ReadonlySet<RollSentence["kind"]> = new Set(["nothing", "no-previous"]);

function keyOf(report: RollReport, anchor: AnchorString, kind: RollSentence["kind"]): string {
  return `${report.journalName}|${anchor}|${kind}`;
}

// A count sums over every note read, but a line that stays put is the same line on the next roll
// however far the look-back has shifted: only the notes not announced yet are counted again.
function unseenCount(report: RollReport, kind: RollSentence["kind"], seen: Set<string>): number {
  const counts: readonly AnchoredCount[] =
    kind === "note-items-skipped" ? report.skippedNoteItemsAt : report.skippedBlockIdsAt;
  let total = 0;
  for (const { anchor, count } of counts) {
    const key = keyOf(report, anchor, kind);
    if (seen.has(key)) continue;
    seen.add(key);
    total += count;
  }
  return total;
}

function shownText(report: RollReport, sentence: RollSentence, seen: Set<string>): string | null {
  if (sentence.kind === "rolled") return sentence.text;
  if (SILENT_OUTCOMES.has(sentence.kind)) return null;
  if (sentence.kind === "note-items-skipped" || sentence.kind === "block-ids-skipped") {
    const count = unseenCount(report, sentence.kind, seen);
    return count > 0 ? countedSentence(sentence.kind, count) : null;
  }
  if (sentence.anchor === null) return sentence.text;
  const key = keyOf(report, sentence.anchor, sentence.kind);
  if (seen.has(key)) return null;
  seen.add(key);
  return sentence.text;
}

/**
 * What an automatic roll tells the user: the rolled sentence always, every other refusal or warning
 * once per note and kind for as long as `seen` lives. Null when there is nothing left to say.
 */
export function noticeFor(report: RollReport, seen: Set<string>, prefixWithJournal: boolean): string | null {
  const shown = rollSentences(report)
    .map((sentence) => shownText(report, sentence, seen))
    .filter((text): text is string => text !== null);
  if (shown.length === 0) return null;
  const notice = shown.join(" ");
  return prefixWithJournal ? m.tasks_auto_roll_prefix({ journal: report.journalName, notice }) : notice;
}
