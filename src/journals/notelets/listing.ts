import type { AnchorString, PeriodKind } from "@/calendar";
import { basenameOf } from "@/infrastructure/host";

import type { CycleService } from "../cycle";
import type { JournalsIndex } from "../journals-index";
import type { JournalsRepository } from "../repository";
import type { NoteletEntry } from "../types";

export interface NoteletListingDependencies {
  readonly journals: Pick<JournalsRepository, "get">;
  readonly index: Pick<JournalsIndex, "noteletsAt">;
  readonly cycle: Pick<CycleService, "intervalsInRange" | "startOf" | "endOf">;
}

export interface PeriodBounds {
  readonly start: AnchorString;
  readonly end: AnchorString;
  readonly kind: PeriodKind | null;
}

export type NoteletListingRequest =
  | {
      readonly kind: "period";
      readonly journalName: string;
      readonly anchor: AnchorString;
      readonly typeIds?: readonly string[];
    }
  | {
      readonly kind: "window";
      readonly journalNames: readonly string[];
      readonly start: AnchorString;
      readonly end: AnchorString;
      readonly typeIds?: readonly string[];
    };

export interface NoteletTypeGroup {
  readonly key: string;
  readonly journalName: string;
  readonly typeName: string;
  readonly typeId: string | null;
  readonly notelets: readonly NoteletEntry[];
}

export interface NoteletPeriodGroup extends PeriodBounds {
  readonly key: string;
  readonly types: readonly NoteletTypeGroup[];
}

export interface NoteletListing {
  readonly periods: readonly NoteletPeriodGroup[];
  readonly total: number;
  readonly qualifyByJournal: boolean;
}

interface TypeBucket {
  key: string;
  journalName: string;
  typeName: string;
  typeId: string | null;
  notelets: NoteletEntry[];
}

interface PeriodBucket {
  key: string;
  start: AnchorString;
  end: AnchorString;
  kind: PeriodKind | null;
  types: Map<string, TypeBucket>;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function periodBoundsOf(
  dependencies: NoteletListingDependencies,
  journalName: string,
  anchor: AnchorString,
): PeriodBounds | undefined {
  const config = dependencies.journals.get(journalName).getOrUndefined();
  if (config === undefined) return undefined;
  const start = dependencies.cycle.startOf(journalName, anchor);
  const end = dependencies.cycle.endOf(journalName, anchor);
  if (start.isNone() || end.isNone()) return undefined;
  return {
    start: start.value.toAnchor(),
    end: end.value.toAnchor(),
    kind: config.write.type === "custom" ? null : config.write.type,
  };
}

// intervalsInRange starts from the period containing the window start, which is already the
// overlap rule for a partitioned cycle. A custom cycle whose stored end was pulled in can
// still hand back a leading period that closed before the window opened; only that one can
// fail the check, so the filter is cheap.
export function anchorsInWindow(
  dependencies: NoteletListingDependencies,
  journalName: string,
  start: AnchorString,
  end: AnchorString,
): readonly AnchorString[] {
  return dependencies.cycle.intervalsInRange(journalName, start, end).filter((anchor) => {
    const closes = dependencies.cycle.endOf(journalName, anchor);
    return closes.isSome() && closes.value.toAnchor() >= start;
  });
}

function matchesTypeFilter(entry: NoteletEntry, typeIds: readonly string[] | undefined): boolean {
  if (typeIds === undefined || typeIds.length === 0) return true;
  return entry.typeId !== null && typeIds.includes(entry.typeId);
}

function placementsOf(
  dependencies: NoteletListingDependencies,
  request: NoteletListingRequest,
): readonly { journalName: string; anchor: AnchorString }[] {
  if (request.kind === "period") return [{ journalName: request.journalName, anchor: request.anchor }];
  return request.journalNames.flatMap((journalName) =>
    anchorsInWindow(dependencies, journalName, request.start, request.end).map((anchor) => ({ journalName, anchor })),
  );
}

function compareNotelets(a: NoteletEntry, b: NoteletEntry): number {
  const left = a.counter ?? Infinity;
  const right = b.counter ?? Infinity;
  if (left !== right) return left - right;
  return collator.compare(basenameOf(a.path), basenameOf(b.path));
}

function compareTypes(a: TypeBucket, b: TypeBucket): number {
  const orphaned = Number(a.typeId === null) - Number(b.typeId === null);
  if (orphaned !== 0) return orphaned;
  const byName = collator.compare(a.typeName, b.typeName);
  return byName === 0 ? collator.compare(a.journalName, b.journalName) : byName;
}

function comparePeriods(a: PeriodBucket, b: PeriodBucket): number {
  if (a.start !== b.start) return a.start < b.start ? -1 : 1;
  if (a.end !== b.end) return a.end < b.end ? -1 : 1;
  return 0;
}

export function buildNoteletListing(
  dependencies: NoteletListingDependencies,
  request: NoteletListingRequest,
): NoteletListing {
  const buckets = new Map<string, PeriodBucket>();
  const journalNames = new Set<string>();
  let total = 0;

  for (const { journalName, anchor } of placementsOf(dependencies, request)) {
    const bounds = periodBoundsOf(dependencies, journalName, anchor);
    if (bounds === undefined) continue;
    const entries = dependencies.index
      .noteletsAt(journalName, anchor)
      .filter((entry) => matchesTypeFilter(entry, request.typeIds));
    if (entries.length === 0) continue;

    const periodKey = `${bounds.start}|${bounds.end}`;
    const bucket = buckets.get(periodKey) ?? { key: periodKey, ...bounds, types: new Map<string, TypeBucket>() };
    bucket.kind ??= bounds.kind;
    buckets.set(periodKey, bucket);

    for (const entry of entries) {
      const typeKey = `${journalName} ${entry.typeName}`;
      const typeBucket = bucket.types.get(typeKey) ?? {
        key: typeKey,
        journalName,
        typeName: entry.typeName,
        typeId: entry.typeId,
        notelets: [],
      };
      typeBucket.notelets.push(entry);
      bucket.types.set(typeKey, typeBucket);
      journalNames.add(journalName);
      total += 1;
    }
  }

  const periods = [...buckets.values()].toSorted(comparePeriods).map((bucket) => ({
    key: bucket.key,
    start: bucket.start,
    end: bucket.end,
    kind: bucket.kind,
    types: [...bucket.types.values()].toSorted(compareTypes).map((type) => ({
      key: type.key,
      journalName: type.journalName,
      typeName: type.typeName,
      typeId: type.typeId,
      notelets: type.notelets.toSorted(compareNotelets),
    })),
  }));

  return { periods, total, qualifyByJournal: journalNames.size > 1 };
}
