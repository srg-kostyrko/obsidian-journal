import { match } from "ts-pattern";

import { CalendarDate, type AnchorString, type Period, type PeriodKind } from "@/calendar";
import { periodForJournal } from "@/code-blocks/nav/period-for-journal";
import { inject } from "@/infrastructure/di";
import { Option } from "@/infrastructure/result";
import { CycleService, JournalsIndex, JournalsRepository, TimelineService } from "@/journals";
import type { JournalConfig } from "@/journals/config";

import { DecorationsStore } from "./decorations-store";
import { DecorationEngine, hasOffsetCondition, periodKindForWrite, type DecorationBinding } from "./engine";
import { UnknownDecorationError } from "./errors";
import { CUSTOM_MATCH_HORIZON, fixedWindow, needsNotes, type WindowDirection } from "./match-window";

import type { CalendarDecoration, JournalDecoration } from "./config";
import type { CalendarDecorationOwner, DecorationOwner } from "./owner";

export type BadgeUnit = PeriodKind | "interval";

export type MatchBadge =
  | {
      readonly kind: "matched";
      readonly matched: number;
      readonly total: number;
      readonly unit: BadgeUnit;
      readonly direction: WindowDirection;
    }
  | {
      readonly kind: "silent";
      readonly total: number;
      readonly unit: BadgeUnit;
      readonly direction: WindowDirection;
    }
  | { readonly kind: "no-history" }
  | { readonly kind: "no-notes" };

export class DecorationMatchService {
  readonly #engine = inject(DecorationEngine);
  readonly #store = inject(DecorationsStore);
  readonly #journals = inject(JournalsRepository);
  readonly #index = inject(JournalsIndex);
  readonly #cycle = inject(CycleService);
  readonly #timeline = inject(TimelineService);

  #describeJournal(journalName: string, index: number, decoration: JournalDecoration): MatchBadge {
    const configOpt = this.#journals.get(journalName);
    if (configOpt.isNone()) return { kind: "no-history" };
    const config = configOpt.value;

    const today = CalendarDate.today();
    const startOpt = this.#timeline.startOf(journalName);
    const endOpt = this.#timeline.endOf(journalName);
    let direction: WindowDirection = "past";
    let referenceDate = today;
    if (startOpt.isSome() && startOpt.value.isAfter(today)) {
      direction = "future";
      referenceDate = startOpt.value;
    } else if (endOpt.isSome() && endOpt.value.isBefore(today)) {
      // A journal that has already ended has no "today" to anchor on — its timeline stops
      // before today ever entered the picture. Anchoring at today would clip its whole
      // history away; anchoring at its own end measures it against the data it actually ran on.
      referenceDate = endOpt.value;
    }

    const isCustom = config.write.type === "custom";
    // Offset conditions mark single days inside an interval, so they can only ever be
    // satisfied by a day-granular window — an interval-anchored window always lands on the
    // interval's first day, making every offset but 1 permanently unreachable.
    const dayGranular = isCustom && hasOffsetCondition(decoration);
    let rawWindow: readonly Period[];
    let unit: BadgeUnit;
    if (dayGranular) {
      rawWindow = fixedWindow("day", referenceDate, direction);
      unit = "day";
    } else if (isCustom) {
      rawWindow = this.#customWindow(journalName, config, referenceDate, direction);
      unit = "interval";
    } else {
      unit = periodKindForWrite(config.write.type);
      rawWindow = fixedWindow(unit, referenceDate, direction);
    }

    // Only a day-granular window needs anchorOf's cycle walk: its periods are individual days,
    // not the intervals the timeline is judged against. The interval-anchored and fixed-journal
    // windows never need it — their periods came out of #customWindow's previousAnchor/nextAnchor
    // walk or fixedWindow's own periodOfKind call, so period.anchor is already the canonical
    // anchor the timeline expects, and re-resolving it through anchorOf is the identity walked
    // the expensive way.
    const clipped = dayGranular
      ? this.#clipDayGranular(journalName, rawWindow)
      : rawWindow.filter((period) => this.#timeline.contains(journalName, period.anchor.toAnchor()));
    if (clipped.length === 0) return { kind: "no-history" };

    if (needsNotes(decoration) && clipped.every((period) => !this.#index.has(journalName, period.anchor.toAnchor()))) {
      return { kind: "no-notes" };
    }

    const binding: DecorationBinding = { kind: "journal", journalName, index, decoration };
    const matched = this.#engine.explainRange(clipped, [binding]).size;
    const total = clipped.length;
    return matched > 0
      ? { kind: "matched", matched, total, unit, direction }
      : { kind: "silent", total, unit, direction };
  }

  // anchorOf walks the custom cycle from scratch, so it is called once to find the interval
  // containing the reference date; every further step reuses previousAnchor/nextAnchor, which
  // walk from the anchor they are given instead of re-deriving it.
  #customWindow(
    name: string,
    config: JournalConfig,
    referenceDate: CalendarDate,
    direction: WindowDirection,
  ): Period[] {
    const startAnchorOpt = this.#cycle.anchorOf(name, referenceDate);
    if (startAnchorOpt.isNone()) return [];
    const anchors: AnchorString[] = [startAnchorOpt.value];
    let current = startAnchorOpt.value;
    for (let i = 1; i < CUSTOM_MATCH_HORIZON; i += 1) {
      const stepOpt =
        direction === "past" ? this.#cycle.previousAnchor(name, current) : this.#cycle.nextAnchor(name, current);
      if (stepOpt.isNone()) break;
      // Mirrors CycleService.intervalsInRange/countRepeats' own non-advancing-step guards: a
      // corrupt stored endDate could fail to advance the walk. Without this, a stuck step keeps
      // pushing the same anchor for the rest of the horizon; explainRange's cellKey dedupe then
      // silently drops the duplicates from the match count while total keeps counting them,
      // under-reporting a rule that actually matched everything.
      if (stepOpt.value === current) break;
      current = stepOpt.value;
      anchors.push(current);
    }
    if (direction === "past") anchors.reverse();
    return anchors.map((anchor) => periodForJournal(config.write, anchor));
  }

  // Resolves each day to the custom interval that owns it, without anchorOf's cycle walk per
  // day. anchorOf runs once, on the window's first (earliest) day; from there the days are
  // consecutive and ascending (fixedWindow's own guarantee), so the cursor only steps to the
  // next interval — via nextAnchor, a single step, not a re-derivation from the cycle anchor —
  // when a day crosses out of the interval currently in hand.
  #clipDayGranular(journalName: string, days: readonly Period[]): Period[] {
    if (days.length === 0) return [];
    const firstAnchorOpt = this.#cycle.anchorOf(journalName, days[0].anchor);
    if (firstAnchorOpt.isNone()) return [];
    let intervalAnchor = firstAnchorOpt.value;
    let intervalEnd = this.#cycle.endOf(journalName, intervalAnchor);
    let inTimeline = this.#timeline.contains(journalName, intervalAnchor);
    const out: Period[] = [];
    for (const day of days) {
      while (intervalEnd.isSome() && day.anchor.isAfter(intervalEnd.value)) {
        const nextOpt = this.#cycle.nextAnchor(journalName, intervalAnchor);
        // Same non-advancing-step guard as #customWindow: treat the rest of the days as
        // unresolvable rather than spin on a duplicate anchor.
        if (nextOpt.isNone() || nextOpt.value === intervalAnchor) {
          intervalEnd = Option.none();
          inTimeline = false;
          break;
        }
        intervalAnchor = nextOpt.value;
        intervalEnd = this.#cycle.endOf(journalName, intervalAnchor);
        inTimeline = this.#timeline.contains(journalName, intervalAnchor);
      }
      if (inTimeline) out.push(day);
    }
    return out;
  }

  #describeCalendar(owner: CalendarDecorationOwner, index: number, decoration: CalendarDecoration): MatchBadge {
    const window = fixedWindow("day", CalendarDate.today(), "past");
    const binding: DecorationBinding = { kind: "calendar", owner, index, decoration };
    const matched = this.#engine.explainRange(window, [binding]).size;
    return matched > 0
      ? { kind: "matched", matched, total: window.length, unit: "day", direction: "past" }
      : { kind: "silent", total: window.length, unit: "day", direction: "past" };
  }

  describe(owner: DecorationOwner, index: number): MatchBadge {
    const decoration = this.#store.list(owner).at(index);
    if (decoration === undefined) throw new UnknownDecorationError(owner, index);

    return match(owner)
      .with({ kind: "journal" }, (o) => this.#describeJournal(o.journalName, index, decoration))
      .otherwise((o) => this.#describeCalendar(o, index, decoration as CalendarDecoration));
  }
}
