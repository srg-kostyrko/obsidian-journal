import type { CalendarDate } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { Err, type Result } from "@/infrastructure/result";
import { applyModifiers, TemplateRenderError, type FunctionHandler, type FunctionInput } from "@/templates";

import { JournalsRepository } from "../repository";
import { TimelineService } from "../timeline";

import { NotePathService } from "./note-path";

import type { FixedWriteIntervals } from "../config";

const GRANULARITY_RANK: Record<FixedWriteIntervals["type"], number> = {
  day: 0,
  week: 1,
  month: 2,
  quarter: 3,
  year: 4,
};

export class JournalLinkHandler implements FunctionHandler {
  readonly #journals = inject(JournalsRepository);
  readonly #timeline = inject(TimelineService);
  readonly #path = inject(NotePathService);
  readonly name = "journal_link";

  // Finer targets base off the host period start so day modifiers enumerate it
  // cleanly; coarser-or-equal targets base off the anchor so cross-year periods
  // resolve to their owning year/month/quarter.
  #baseDate(input: FunctionInput): CalendarDate {
    if (!this.#targetIsFiner(input)) return input.sourceDate;
    const start = input.context.get("start_date");
    return start?.kind === "date" ? start.value : input.sourceDate;
  }

  #targetIsFiner(input: FunctionInput): boolean {
    const hostName = input.context.get("journal_name");
    if (hostName?.kind !== "string") return false;
    const host = this.#journals.get(hostName.value);
    const target = this.#journals.get(input.arg);
    if (host.isNone() || target.isNone()) return false;
    const hostWrite = host.value.write;
    const targetWrite = target.value.write;
    if (hostWrite.type === "custom" || targetWrite.type === "custom") return false;
    return GRANULARITY_RANK[targetWrite.type] < GRANULARITY_RANK[hostWrite.type];
  }

  render(input: FunctionInput): Result<string, TemplateRenderError> {
    const base = applyModifiers(this.#baseDate(input), input.modifiers);
    // A target date outside the target journal's timeline has no note to link to; erroring
    // leaves the {{journal_link}} token unresolved rather than pointing at an unreachable note.
    if (!this.#timeline.contains(input.arg, base.toAnchor())) {
      return new Err(new TemplateRenderError("journal-link-out-of-bounds"));
    }
    return this.#path
      .resolvedPathForDate(input.arg, base)
      .map((path) => path.replace(/\.md$/, ""))
      .mapErr((error) => new TemplateRenderError("journal-link-unresolved", error));
  }
}
