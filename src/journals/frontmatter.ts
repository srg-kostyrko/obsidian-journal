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

import type { JournalConfig } from "./config";
import type { JournalNotFoundError } from "./errors";
import type { PromptAnswer } from "./prompts/config";
import type { IndexedNote, JournalEntry, JournalMetadata, NoteletEntry } from "./types";

export class FrontmatterService {
  readonly #journals = inject(JournalsRepository);
  readonly #cycle = inject(CycleService);
  readonly #numbering = inject(NumberingService);
  readonly #index = inject(JournalsIndex);

  // Only a non-empty string can name a type; anything else stays an unresolvable notelet rather
  // than being promoted to a period note, so a damaged note is visible and repairable.
  #parseNotelet(
    path: VaultPath,
    frontmatter: Record<string, unknown>,
    config: JournalConfig,
    journalName: string,
    anchor: AnchorString,
    rawType: unknown,
  ): NoteletEntry {
    const typeName = typeof rawType === "string" ? rawType : String(rawType);
    const type =
      typeName === "" ? undefined : Object.values(config.notelets).find((candidate) => candidate.name === typeName);

    const counterValue = type === undefined ? undefined : frontmatter[type.counter.frontmatterKey];
    const counter = typeof counterValue === "number" && Number.isFinite(counterValue) ? counterValue : undefined;

    const answers: Record<string, PromptAnswer> = {};
    const prompts = type?.prompts ?? [];
    for (const prompt of prompts) {
      if (prompt.frontmatterKey === "") continue;
      const value = frontmatter[prompt.frontmatterKey];
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        answers[prompt.variable] = value;
      }
    }

    return {
      kind: "notelet",
      journalName,
      anchor,
      path,
      typeName,
      typeId: type?.id ?? null,
      ...(counter !== undefined && { counter }),
      ...(Object.keys(answers).length > 0 && { answers }),
    };
  }

  parseEntry(path: VaultPath, frontmatter: Record<string, unknown>): Option<IndexedNote> {
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

    const rawType = frontmatter[config.frontmatter.noteletField];
    if (rawType !== undefined && rawType !== null) {
      return Option.some(this.#parseNotelet(path, frontmatter, config, journalName, anchor, rawType));
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

    const answers: Record<string, PromptAnswer> = {};
    for (const prompt of config.prompts) {
      if (prompt.frontmatterKey === "") continue;
      const value = frontmatter[prompt.frontmatterKey];
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        answers[prompt.variable] = value;
      }
    }

    const entry: JournalEntry = {
      journalName,
      anchor,
      path,
      ...(endDate !== undefined && { endDate }),
      ...(Object.keys(numbers).length > 0 && { numbers }),
      ...(Object.keys(answers).length > 0 && { answers }),
    };
    return Option.some(entry);
  }

  buildMetadata(name: string, anchor: AnchorString): Result<JournalMetadata, JournalNotFoundError> {
    return this.#journals.require(name).map(() => {
      const numbers = this.#numbering.assignNumbers(name, anchor);
      const storedEntry = this.#index.entryByAnchor(name, anchor);
      const endDate = storedEntry.isSome() ? storedEntry.value.endDate : undefined;
      const answers = storedEntry.isSome() ? storedEntry.value.answers : undefined;

      const metadata: JournalMetadata = {
        journalName: name,
        anchor,
        ...(endDate !== undefined && { endDate }),
        ...(numbers.isSome() && { numbers: numbers.value }),
        ...(answers !== undefined && { answers }),
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
        for (const prompt of config.prompts) {
          if (prompt.frontmatterKey !== "") delete fm[prompt.frontmatterKey];
        }
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

        // An end equal to the auto-derived period end is redundant metadata, not a
        // manual extension, so it is persisted only when the end-date field is enabled. A genuine
        // extension (end differs from the default period end) is always kept.
        const isManualExtension =
          metadata.endDate !== undefined &&
          !cycle
            .defaultEndOf(name, metadata.anchor)
            .map((end) => end.toAnchor() === metadata.endDate)
            .getOr(false);
        if (fields.addEndDate || isManualExtension) {
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

        // Unlike a numbering digit, an answer is not recomputable — and ensureNote runs this
        // mutator on every open of an existing note. Deleting on absence would wipe a
        // hand-edited answer the next time the user opened the note.
        for (const prompt of config.prompts) {
          if (prompt.frontmatterKey === "") continue;
          const value = metadata.answers?.[prompt.variable];
          if (value !== undefined) fm[prompt.frontmatterKey] = value;
        }
      };
    });
  }
}
