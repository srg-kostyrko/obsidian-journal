import { match } from "ts-pattern";

import type { AnchorString, Period, PeriodKind } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { NoteMetadataService } from "@/infrastructure/host";
import type { NoteMetadata } from "@/infrastructure/host";
import type { Option } from "@/infrastructure/result";
import { CycleService, JournalsIndex, JournalsRepository } from "@/journals";
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

import type { JournalDecoration, JournalDecorationCondition, JournalDecorationStyle } from "./config";

export interface DecorationBinding {
  readonly journalName: string;
  readonly decoration: JournalDecoration;
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

export class DecorationEngine {
  readonly #journals = inject(JournalsRepository);
  readonly #index = inject(JournalsIndex);
  readonly #metadata = inject(NoteMetadataService);
  readonly #cycle = inject(CycleService);

  evaluateRange(
    periods: readonly Period[],
    decorations: readonly DecorationBinding[],
  ): Map<AnchorString, JournalDecorationStyle[]> {
    const result = new Map<AnchorString, JournalDecorationStyle[]>();
    if (periods.length === 0 || decorations.length === 0) return result;

    const configs = new Map<string, JournalConfig>();
    for (const { journalName } of decorations) {
      if (configs.has(journalName)) continue;
      const opt = this.#journals.get(journalName);
      if (opt.isSome()) configs.set(journalName, opt.value);
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

    for (const { journalName, decoration } of decorations) {
      const config = configs.get(journalName);
      if (!config) continue;
      for (const period of periods) {
        if (!periodMatchesWrite(period.kind, config.write.type)) continue;
        const anchorString = period.anchor.toAnchor();
        if (!this.#matches(decoration, period, config, () => metadataFor(journalName, anchorString))) continue;
        let bucket = result.get(anchorString);
        if (!bucket) {
          bucket = [];
          result.set(anchorString, bucket);
        }
        bucket.push(...decoration.styles);
      }
    }
    return result;
  }

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
}
