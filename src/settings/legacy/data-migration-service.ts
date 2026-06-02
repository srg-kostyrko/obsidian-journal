import { match } from "ts-pattern";

import { CalendarDate } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { NoteMetadataService, NotesService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult } from "@/infrastructure/result";
import { CycleService, JournalsRepository } from "@/journals";
import { FRONTMATTER_NAME_KEY } from "@/journals/config";
import { SettingsService } from "@/settings";

import { pendingNoteMigrationSlice, type PendingNoteMigration } from "./pending-note-migration";

const SECTION_KEY = "journal-section";
const INTERVAL_INDEX_KEY = "journal-interval-index";
const START_DATE_KEY = "journal-start-date";
const END_DATE_KEY = "journal-end-date";

const ORPHAN_KEYS = [
  FRONTMATTER_NAME_KEY,
  SECTION_KEY,
  START_DATE_KEY,
  END_DATE_KEY,
  INTERVAL_INDEX_KEY,
  "journal-date",
  "journal-index",
] as const;

export class DataMigrationService {
  readonly #notes = inject(NotesService);
  readonly #metadata = inject(NoteMetadataService);
  readonly #cycle = inject(CycleService);
  readonly #journals = inject(JournalsRepository);
  readonly #logger = inject(LoggerFactoryToken).named("data-migration");

  readonly #slice = inject(SettingsService).getSlice(pendingNoteMigrationSlice);

  initialize(): AsyncResult<void, never> {
    return AsyncResult.fromPromise(this.#run(), () => undefined as never);
  }

  async #run(): Promise<void> {
    const markers = this.#slice.state;
    if (markers.length === 0) return;

    const byOldId = new Map<string, PendingNoteMigration>(markers.map((marker) => [marker.oldJournalId, marker]));

    for (const path of this.#notes.allMarkdownNotes()) {
      await this.#rewrite(path, byOldId);
    }

    this.#slice.state = [];
  }

  async #rewrite(path: VaultPath, byOldId: Map<string, PendingNoteMigration>): Promise<void> {
    const metadata = this.#metadata.get(path);
    if (metadata.isNone()) return;

    const properties = metadata.value.properties;
    const oldId = properties[FRONTMATTER_NAME_KEY];
    if (typeof oldId !== "string") return;
    const marker = byOldId.get(oldId);
    if (!marker) return;

    const targetName = match(marker)
      .with({ kind: "interval" }, (entry) => entry.name)
      .with({ kind: "calendar" }, (entry) => entry.sectionToName[sectionOf(properties)])
      .exhaustive();

    const date = properties[START_DATE_KEY];
    const configOption = targetName === undefined ? undefined : this.#journals.get(targetName);
    const config = configOption?.isSome() === true ? configOption.value : undefined;
    const anchor = this.#resolveAnchor(targetName, date);

    const result = await this.#notes.updateFrontmatter(path, (fm) => {
      if (targetName === undefined || config === undefined || anchor === undefined || typeof date !== "string") {
        for (const key of ORPHAN_KEYS) delete fm[key];
        return;
      }

      fm[FRONTMATTER_NAME_KEY] = targetName;
      fm[config.frontmatter.dateField] = date;

      if (INTERVAL_INDEX_KEY in fm) {
        const indexKey = config.numbering.sources[0]?.frontmatterKey ?? "journal-index";
        fm[indexKey] = fm[INTERVAL_INDEX_KEY];
        delete fm[INTERVAL_INDEX_KEY];
      }

      delete fm[SECTION_KEY];
      if (!config.frontmatter.addStartDate) delete fm[START_DATE_KEY];
      if (!config.frontmatter.addEndDate) delete fm[END_DATE_KEY];
    });

    result.tapErr((error) => {
      this.#logger.warn("failed to rewrite legacy note frontmatter", { path, error });
    });
  }

  #resolveAnchor(targetName: string | undefined, date: unknown): AnchorString | undefined {
    if (targetName === undefined || typeof date !== "string") return undefined;
    const parsed = CalendarDate.parse(date);
    if (!parsed.isOk()) return undefined;
    const anchor = this.#cycle.anchorOf(targetName, parsed.value);
    return anchor.isSome() ? anchor.value : undefined;
  }
}

type SectionName = "day" | "week" | "month" | "quarter" | "year";

function sectionOf(properties: Record<string, unknown>): SectionName {
  return String(properties[SECTION_KEY]) as SectionName;
}
