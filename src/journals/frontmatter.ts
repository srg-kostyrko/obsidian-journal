import { CalendarDate } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { Option } from "@/infrastructure/result";
import type { Result } from "@/infrastructure/result";

import { FRONTMATTER_NAME_KEY } from "./config";
import { CycleService } from "./cycle";
import { JournalsIndex } from "./journals-index";
import { NumberingService } from "./numbering";
import { JournalsRepository } from "./repository";

import type { JournalNotFoundError } from "./errors";
import type { JournalEntry, JournalMetadata } from "./types";

export class FrontmatterService {
  readonly #journals = inject(JournalsRepository);
  readonly #cycle = inject(CycleService);
  readonly #numbering = inject(NumberingService);
  readonly #index = inject(JournalsIndex);

  parseEntry(path: VaultPath, frontmatter: Record<string, unknown>): Option<JournalEntry> {
    const journalName = frontmatter[FRONTMATTER_NAME_KEY];
    if (typeof journalName !== "string") return Option.none();
    const configOpt = this.#journals.get(journalName);
    if (configOpt.isNone()) return Option.none();
    const config = configOpt.value;

    const rawDate = frontmatter[config.frontmatter.dateField];
    if (typeof rawDate !== "string") return Option.none();
    const parsed = CalendarDate.parse(rawDate);
    if (!parsed.isOk()) return Option.none();
    const anchor = parsed.value.toAnchor();

    // Fixed cycles: reject a stored date that is not the period's canonical anchor, so a note left
    // behind by a same-named journal of a different write type is not silently re-interpreted.
    // anchorOf is pure for fixed cycles, so this is safe during the boot walk (no index read).
    // Custom cycles are validated after the index is complete (see VaultSubscriptionService).
    if (config.write.type !== "custom") {
      const canonical = this.#cycle.isCanonicalAnchor(journalName, anchor);
      if (!(canonical.isSome() && canonical.value)) return Option.none();
    }

    const rawEnd = frontmatter[config.frontmatter.endDateField];
    let endDate: AnchorString | undefined;
    if (typeof rawEnd === "string") {
      const endParsed = CalendarDate.parse(rawEnd);
      if (endParsed.isOk()) endDate = endParsed.value.toAnchor();
    }

    const numbers: Record<string, number> = {};
    for (const source of config.numbering.sources) {
      const value = frontmatter[source.frontmatterKey];
      if (typeof value === "number" && Number.isFinite(value)) {
        numbers[source.variable] = value;
      }
    }

    const entry: JournalEntry = {
      journalName,
      anchor,
      path,
      ...(endDate !== undefined && { endDate }),
      ...(Object.keys(numbers).length > 0 && { numbers }),
    };
    return Option.some(entry);
  }

  buildMetadata(name: string, anchor: AnchorString): Result<JournalMetadata, JournalNotFoundError> {
    return this.#journals.require(name).map(() => {
      const numbers = this.#numbering.assignNumbers(name, anchor);
      const storedEntry = this.#index.entryByAnchor(name, anchor);
      const endDate = storedEntry.isSome() ? storedEntry.value.endDate : undefined;

      const metadata: JournalMetadata = {
        journalName: name,
        anchor,
        ...(endDate !== undefined && { endDate }),
        ...(numbers.isSome() && { numbers: numbers.value }),
      };
      return metadata;
    });
  }

  clearMutator(name: string): Result<(fm: Record<string, unknown>) => void, JournalNotFoundError> {
    return this.#journals.require(name).map((config) => {
      const fields = config.frontmatter;
      return (fm: Record<string, unknown>) => {
        // Clear every key this journal could own under any config, regardless of current add* flags.
        delete fm[FRONTMATTER_NAME_KEY];
        delete fm[fields.dateField];
        delete fm[fields.startDateField];
        delete fm[fields.endDateField];
        for (const source of config.numbering.sources) delete fm[source.frontmatterKey];
      };
    });
  }

  writeMutator(
    name: string,
    metadata: JournalMetadata,
  ): Result<(fm: Record<string, unknown>) => void, JournalNotFoundError> {
    return this.#journals.require(name).map((config) => {
      const fields = config.frontmatter;
      const cycle = this.#cycle;

      return (fm: Record<string, unknown>) => {
        fm[FRONTMATTER_NAME_KEY] = name;
        fm[fields.dateField] = metadata.anchor;

        if (fields.addStartDate) {
          const start = cycle.startOf(name, metadata.anchor);
          if (start.isSome()) fm[fields.startDateField] = start.value.toAnchor();
        } else {
          delete fm[fields.startDateField];
        }

        const hasExtension = metadata.endDate !== undefined;
        if (fields.addEndDate || hasExtension) {
          if (metadata.endDate === undefined) {
            const computed = cycle.endOf(name, metadata.anchor);
            if (computed.isSome()) fm[fields.endDateField] = computed.value.toAnchor();
          } else {
            fm[fields.endDateField] = metadata.endDate;
          }
        } else {
          delete fm[fields.endDateField];
        }

        for (const source of config.numbering.sources) {
          const value = metadata.numbers?.[source.variable];
          if (value === undefined) delete fm[source.frontmatterKey];
          else fm[source.frontmatterKey] = value;
        }
      };
    });
  }
}
