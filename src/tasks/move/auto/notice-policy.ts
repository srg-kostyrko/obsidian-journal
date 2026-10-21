import { m } from "@/i18n";

import { rollSentences, type RollReport, type RollSentence } from "../report";

// Nobody pressed anything, so a roll that moved nothing has nothing to say about itself.
const SILENT_OUTCOMES: ReadonlySet<RollSentence["kind"]> = new Set(["nothing", "no-previous"]);

// A sentence summing over every source read is about that set of notes; it is shown again once the
// look-back reaches a different one.
function keyOf(report: RollReport, sentence: RollSentence): string {
  const about = sentence.anchor ?? report.read.join(",");
  return `${report.journalName}|${about}|${sentence.kind}`;
}

/**
 * What an automatic roll tells the user: the rolled sentence always, every other refusal or warning
 * once per source and kind for as long as `seen` lives. Null when there is nothing left to say.
 */
export function noticeFor(report: RollReport, seen: Set<string>, prefixWithJournal: boolean): string | null {
  const shown: string[] = [];
  for (const sentence of rollSentences(report)) {
    if (sentence.kind === "rolled") {
      shown.push(sentence.text);
      continue;
    }
    if (SILENT_OUTCOMES.has(sentence.kind)) continue;
    const key = keyOf(report, sentence);
    if (seen.has(key)) continue;
    seen.add(key);
    shown.push(sentence.text);
  }
  if (shown.length === 0) return null;
  const notice = shown.join(" ");
  return prefixWithJournal ? m.tasks_auto_roll_prefix({ journal: report.journalName, notice }) : notice;
}
