import { match } from "ts-pattern";

import { CalendarDate, type AnchorString, type Period, type PeriodKind } from "@/calendar";
import { periodForJournal } from "@/code-blocks/nav/period-for-journal";
import { inject } from "@/infrastructure/di";
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

    // A custom journal's periods are keyed by the interval that owns them, not by the day
    // itself — resolving through the cycle before checking the timeline is what lets a
    // day-granular offset window clip against the right interval instead of a phantom one
    // built by treating a mid-interval day as if it were an interval's own anchor.
    const clipped = rawWindow.filter((period) =>
      this.#cycle
        .anchorOf(journalName, period.anchor)
        .match({ none: () => false, some: (anchor) => this.#timeline.contains(journalName, anchor) }),
    );
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
      current = stepOpt.value;
      anchors.push(current);
    }
    if (direction === "past") anchors.reverse();
    return anchors.map((anchor) => periodForJournal(config.write, anchor));
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
