import { CalendarDate, periodKinds, periodOfKind, type AnchorString, type PeriodKind } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { basenameOf, type VaultPath } from "@/infrastructure/host";
import type { JournalConfig } from "@/journals";
import { CycleService } from "@/journals/cycle";
import { JournalsIndex } from "@/journals/journals-index";
import { JournalsRepository } from "@/journals/repository";
import { TimelineService } from "@/journals/timeline";
import { accessibleFormatPattern } from "@/notes-calendar/cell-format";
import { ShelvesService } from "@/shelves";

export interface MoveTarget {
  readonly journalName: string;
  readonly anchor: AnchorString;
  /** Null when the period note does not exist yet. */
  readonly path: VaultPath | null;
  readonly label: string;
  readonly noteletTitle?: string;
}

interface Candidate {
  readonly name: string;
  readonly kind: PeriodKind;
}

function fixedKindOf(journal: JournalConfig): PeriodKind | null {
  return journal.write.type === "custom" ? null : journal.write.type;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export class MoveTargets {
  readonly #journals = inject(JournalsRepository);
  readonly #index = inject(JournalsIndex);
  readonly #shelves = inject(ShelvesService);
  readonly #cycle = inject(CycleService);
  readonly #timeline = inject(TimelineService);

  // A journal on no shelf considers every journal, the same fallback the write-type nav link rows use.
  #candidates(sourceName: string, sourceKind: PeriodKind): readonly Candidate[] {
    const shelf = this.#shelves.shelfOf(sourceName);
    const sourceRank = periodKinds.indexOf(sourceKind);
    return [...this.#journals.find().list()]
      .flatMap((journal): Candidate[] => {
        const kind = fixedKindOf(journal);
        if (kind === null || journal.name === sourceName) return [];
        if (periodKinds.indexOf(kind) <= sourceRank) return [];
        if (shelf !== "" && this.#shelves.shelfOf(journal.name) !== shelf) return [];
        return [{ name: journal.name, kind }];
      })
      .toSorted(
        (a, b) => periodKinds.indexOf(a.kind) - periodKinds.indexOf(b.kind) || collator.compare(a.name, b.name),
      );
  }

  #targetsIn(candidate: Candidate, date: CalendarDate): readonly MoveTarget[] {
    const at = this.#cycle.anchorOf(candidate.name, date).getOrUndefined();
    if (at === undefined || !this.#timeline.contains(candidate.name, at)) return [];
    const label = periodOfKind(candidate.kind, CalendarDate.fromAnchor(at)).format(
      accessibleFormatPattern(candidate.kind),
    );
    const period: MoveTarget = {
      journalName: candidate.name,
      anchor: at,
      path: this.#index.get(candidate.name, at).getOrUndefined() ?? null,
      label,
    };
    const notelets = this.#index
      .noteletsAt(candidate.name, at)
      .map((notelet) => notelet.path)
      .toSorted((a, b) => collator.compare(a, b))
      .map((path) => ({ ...period, path, noteletTitle: basenameOf(path) }));
    return [period, ...notelets];
  }

  /** Every period note, and its notelets, whose period contains the source note's start date. */
  containingTargets(sourcePath: VaultPath): readonly MoveTarget[] {
    const entry = this.#index.entryByPath(sourcePath).getOrUndefined();
    if (entry === undefined) return [];
    const source = this.#journals.get(entry.journalName).getOrUndefined();
    const sourceKind = source === undefined ? null : fixedKindOf(source);
    if (source === undefined || sourceKind === null) return [];
    const date = CalendarDate.fromAnchor(entry.anchor);
    return this.#candidates(source.name, sourceKind).flatMap((candidate) => this.#targetsIn(candidate, date));
  }
}
