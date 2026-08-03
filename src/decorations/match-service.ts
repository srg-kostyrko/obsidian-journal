import { match } from "ts-pattern";

import { CalendarDate, type AnchorString, type Period, type PeriodKind } from "@/calendar";
import { periodForJournal } from "@/code-blocks/nav/period-for-journal";
import { inject } from "@/infrastructure/di";
import { CycleService, JournalsIndex, JournalsRepository, TimelineService } from "@/journals";
import type { JournalConfig } from "@/journals/config";

import { DecorationsStore } from "./decorations-store";
import { DecorationEngine, periodKindForWrite, type DecorationBinding } from "./engine";
import { UnknownDecorationError } from "./errors";
import { CUSTOM_MATCH_HORIZON, fixedWindow, needsNotes, type WindowDirection } from "./match-window";

import type { CalendarDecoration } from "./config";
import type { DecorationOwner } from "./owner";

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

  #describeJournal(journalName: string, binding: DecorationBinding): MatchBadge {
    const configOpt = this.#journals.get(journalName);
    if (configOpt.isNone()) return { kind: "no-history" };
    const config = configOpt.value;

    const today = CalendarDate.today();
    const startOpt = this.#timeline.startOf(journalName);
    let direction: WindowDirection = "past";
    let referenceDate = today;
    if (startOpt.isSome() && startOpt.value.isAfter(today)) {
      direction = "future";
      referenceDate = startOpt.value;
    }

    const isCustom = config.write.type === "custom";
    const rawWindow = isCustom
      ? this.#customWindow(journalName, config, referenceDate, direction)
      : fixedWindow(periodKindForWrite(config.write.type), referenceDate, direction);

    const clipped = rawWindow.filter((period) => this.#timeline.contains(journalName, period.anchor.toAnchor()));
    if (clipped.length === 0) return { kind: "no-history" };

    if (
      binding.kind === "journal" &&
      needsNotes(binding.decoration) &&
      clipped.every((period) => !this.#index.has(journalName, period.anchor.toAnchor()))
    ) {
      return { kind: "no-notes" };
    }

    const matched = this.#engine.explainRange(clipped, [binding]).size;
    const unit: BadgeUnit = isCustom ? "interval" : periodKindForWrite(config.write.type);
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

  #describeCalendar(binding: DecorationBinding): MatchBadge {
    const window = fixedWindow("day", CalendarDate.today(), "past");
    const matched = this.#engine.explainRange(window, [binding]).size;
    return matched > 0
      ? { kind: "matched", matched, total: window.length, unit: "day", direction: "past" }
      : { kind: "silent", total: window.length, unit: "day", direction: "past" };
  }

  describe(owner: DecorationOwner, index: number): MatchBadge {
    const decoration = this.#store.list(owner).at(index);
    if (decoration === undefined) throw new UnknownDecorationError(owner, index);

    const binding: DecorationBinding =
      owner.kind === "journal"
        ? { kind: "journal", journalName: owner.journalName, index, decoration }
        : { kind: "calendar", owner, index, decoration: decoration as CalendarDecoration };

    return match(owner)
      .with({ kind: "journal" }, (o) => this.#describeJournal(o.journalName, binding))
      .otherwise(() => this.#describeCalendar(binding));
  }
}
