import { match } from "ts-pattern";

import type { AnchorString, Period, PeriodKind } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { NoteMetadataService } from "@/infrastructure/host";
import type { NoteMetadata } from "@/infrastructure/host";
import type { Option } from "@/infrastructure/result";
import { CycleService, JournalsIndex, JournalsRepository, TimelineService } from "@/journals";
import type { JournalConfig, JournalWrite } from "@/journals/config";

import {
  allTasksCompleted,
  checkDate,
  checkOffset,
  checkProperty,
  checkTag,
  checkTitle,
  checkWeekday,
  hasOpenTask,
} from "./engine-checks";

import type {
  CalendarDecoration,
  CalendarDecorationCondition,
  JournalDecoration,
  JournalDecorationCondition,
  JournalDecorationStyle,
} from "./config";
import type { CalendarDecorationOwner, DecorationOwner } from "./owner";

export interface JournalDecorationBinding {
  readonly kind: "journal";
  readonly journalName: string;
  readonly index: number;
  readonly decoration: JournalDecoration;
}

export interface CalendarDecorationBinding {
  readonly kind: "calendar";
  readonly owner: CalendarDecorationOwner;
  readonly index: number;
  readonly decoration: CalendarDecoration;
}

export type DecorationBinding = JournalDecorationBinding | CalendarDecorationBinding;

export interface DecorationSource {
  readonly owner: DecorationOwner;
  readonly index: number;
}

export function sourceOf(binding: DecorationBinding): DecorationSource {
  return binding.kind === "journal"
    ? { owner: { kind: "journal", journalName: binding.journalName }, index: binding.index }
    : { owner: binding.owner, index: binding.index };
}

export interface Contribution {
  readonly source: DecorationSource;
  readonly style: JournalDecorationStyle;
}

export function periodMatchesWrite(kind: PeriodKind, writeType: JournalWrite["type"]): boolean {
  return match([kind, writeType] as const)
    .with(["day", "day"], ["day", "custom"], () => true)
    .with(["week", "week"], () => true)
    .with(["month", "month"], () => true)
    .with(["quarter", "quarter"], () => true)
    .with(["year", "year"], () => true)
    .otherwise(() => false);
}

export function periodKindForWrite(writeType: JournalWrite["type"]): PeriodKind {
  return writeType === "custom" ? "day" : writeType;
}

// Offset conditions mark single days inside a custom interval, so decorations carrying one
// render on the day calendar grid while all other custom-journal decorations belong to the
// interval list — the two surfaces split a custom journal's decorations by this predicate.
export function hasOffsetCondition(decoration: JournalDecoration): boolean {
  return decoration.conditions.some((condition) => condition.type === "offset");
}

// A week and a day period can share an anchor date (a week's anchor is one of its days),
// so the cell map is keyed by period kind + anchor — keying by anchor alone would merge a
// daily decoration onto the colliding week cell and vice versa.
export function cellKey(kind: PeriodKind, anchor: AnchorString): string {
  return `${kind}:${anchor}`;
}

export class DecorationEngine {
  readonly #journals = inject(JournalsRepository);
  readonly #index = inject(JournalsIndex);
  readonly #metadata = inject(NoteMetadataService);
  readonly #cycle = inject(CycleService);
  readonly #timeline = inject(TimelineService);

  #matches(
    decoration: JournalDecoration,
    period: Period,
    journal: JournalConfig,
    metadata: () => Option<NoteMetadata>,
  ): boolean {
    const { mode, conditions } = decoration;
    if (conditions.length === 0) return false;
    const test = (c: JournalDecorationCondition): boolean => this.#check(c, period, journal, metadata);
    return mode === "or" ? conditions.some(test) : conditions.every(test);
  }

  #matchesCalendar(decoration: CalendarDecoration, period: Period): boolean {
    const { mode, conditions } = decoration;
    if (conditions.length === 0) return false;
    const test = (c: CalendarDecorationCondition): boolean =>
      match(c)
        .with({ type: "date" }, (x) => checkDate(x, period))
        .with({ type: "weekday" }, (x) => checkWeekday(x, period))
        .exhaustive();
    return mode === "or" ? conditions.some(test) : conditions.every(test);
  }

  #check(
    condition: JournalDecorationCondition,
    period: Period,
    journal: JournalConfig,
    metadata: () => Option<NoteMetadata>,
  ): boolean {
    const meta = (): NoteMetadata | null => {
      const opt = metadata();
      return opt.isSome() ? opt.value : null;
    };
    return match(condition)
      .with({ type: "title" }, (c) => checkTitle(c, meta()))
      .with({ type: "tag" }, (c) => checkTag(c, meta()))
      .with({ type: "property" }, (c) => checkProperty(c, meta()))
      .with({ type: "date" }, (c) => checkDate(c, period))
      .with({ type: "weekday" }, (c) => checkWeekday(c, period))
      .with({ type: "offset" }, (c) => checkOffset(c, period, journal, this.#cycle))
      .with({ type: "has-note" }, () => metadata().isSome())
      .with({ type: "has-open-task" }, () => metadata().match({ none: () => false, some: hasOpenTask }))
      .with({ type: "all-tasks-completed" }, () => metadata().match({ none: () => false, some: allTasksCompleted }))
      .exhaustive();
  }

  explainRange(periods: readonly Period[], decorations: readonly DecorationBinding[]): Map<string, Contribution[]> {
    const result = new Map<string, Contribution[]>();
    if (periods.length === 0 || decorations.length === 0) return result;

    // Contributions accumulate into a bucket keyed by cell, so the same cell listed twice would
    // paint its decorations twice. Callers legitimately produce repeats: a nav block resolves
    // each of its three adjacent day anchors through a month-linked segment and gets one month
    // period back three times. A cell is a cell — collapse before matching.
    const cells = new Map<string, Period>();
    for (const period of periods) {
      const key = cellKey(period.kind, period.anchor.toAnchor());
      if (!cells.has(key)) cells.set(key, period);
    }
    const uniquePeriods = [...cells.values()];

    const configs = new Map<string, JournalConfig>();
    for (const binding of decorations) {
      if (binding.kind !== "journal") continue;
      if (configs.has(binding.journalName)) continue;
      const opt = this.#journals.get(binding.journalName);
      if (opt.isSome()) configs.set(binding.journalName, opt.value);
    }

    const metaCache = new Map<string, Option<NoteMetadata>>();
    const metadataFor = (journalName: string, anchorString: AnchorString): Option<NoteMetadata> => {
      const key = `${journalName}::${anchorString}`;
      const hit = metaCache.get(key);
      if (hit !== undefined) return hit;
      const value = this.#index
        .entryByAnchor(journalName, anchorString)
        .flatMap((entry) => this.#metadata.get(entry.path));
      metaCache.set(key, value);
      return value;
    };

    // A journal's decorations describe its own periods, and its timeline is what says which
    // periods those are — outside it the calendar already refuses to open or create anything.
    // A custom journal decorates day cells, so the bound is judged against the interval owning
    // the day, not the day itself; for a fixed journal anchorOf is the period's own anchor.
    const timelineCache = new Map<string, boolean>();
    const inTimeline = (journalName: string, period: Period): boolean => {
      const key = `${journalName}::${period.anchor.toAnchor()}`;
      const hit = timelineCache.get(key);
      if (hit !== undefined) return hit;
      const value = this.#cycle
        .anchorOf(journalName, period.anchor)
        .match({ none: () => false, some: (anchor) => this.#timeline.contains(journalName, anchor) });
      timelineCache.set(key, value);
      return value;
    };

    const push = (period: Period, binding: DecorationBinding): void => {
      const styles = binding.decoration.styles;
      // A decoration that matches but contributes nothing should not make its cell read as
      // decorated, so a match with zero styles produces no entry rather than an empty bucket.
      if (styles.length === 0) return;
      const key = cellKey(period.kind, period.anchor.toAnchor());
      let bucket = result.get(key);
      if (!bucket) {
        bucket = [];
        result.set(key, bucket);
      }
      const source = sourceOf(binding);
      for (const style of styles) bucket.push({ source, style });
    };

    for (const binding of decorations) {
      if (binding.kind === "calendar") {
        for (const period of uniquePeriods) {
          // Journal-free decorations paint calendar days only. Custom-interval rows are also
          // "day"-kind periods, so surfaces that render them simply do not opt in.
          if (period.kind !== "day") continue;
          if (!this.#matchesCalendar(binding.decoration, period)) continue;
          push(period, binding);
        }
        continue;
      }
      const config = configs.get(binding.journalName);
      if (!config) continue;
      for (const period of uniquePeriods) {
        if (!periodMatchesWrite(period.kind, config.write.type)) continue;
        if (!inTimeline(binding.journalName, period)) continue;
        const anchorString = period.anchor.toAnchor();
        if (!this.#matches(binding.decoration, period, config, () => metadataFor(binding.journalName, anchorString)))
          continue;
        push(period, binding);
      }
    }
    return result;
  }

  evaluateRange(
    periods: readonly Period[],
    decorations: readonly DecorationBinding[],
  ): Map<string, JournalDecorationStyle[]> {
    const result = new Map<string, JournalDecorationStyle[]>();
    for (const [key, contributions] of this.explainRange(periods, decorations)) {
      result.set(
        key,
        contributions.map((contribution) => contribution.style),
      );
    }
    return result;
  }
}
