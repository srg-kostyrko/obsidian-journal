import { match } from "ts-pattern";

import { CalendarDate } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { NoteMetadataService, NotesService, WorkspaceService } from "@/infrastructure/host";
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

type ReshapeMarker = Extract<PendingNoteMigration, { kind: "interval" | "calendar" }>;

export class DataMigrationService {
  readonly #notes = inject(NotesService);
  readonly #metadata = inject(NoteMetadataService);
  readonly #cycle = inject(CycleService);
  readonly #journals = inject(JournalsRepository);
  readonly #workspace = inject(WorkspaceService);
  readonly #logger = inject(LoggerFactoryToken).named("data-migration");

  readonly #slice = inject(SettingsService).getSlice(pendingNoteMigrationSlice);

  #runWhenResolved(): void {
    if (this.#allNotesResolved()) {
      void this.#run();
      return;
    }
    const dispose = this.#metadata.onResolved(() => {
      if (!this.#allNotesResolved()) return;
      dispose();
      void this.#run();
    });
  }

  #allNotesResolved(): boolean {
    return this.#notes.allMarkdownNotes().every((path) => this.#metadata.get(path).isSome());
  }

  async #run(): Promise<void> {
    const markers = this.#slice.state;
    if (markers.length === 0) return;

    const reshapeByOldId = new Map<string, ReshapeMarker>();
    const weekAnchorNames = new Set<string>();
    for (const marker of markers) {
      if (marker.kind === "week-anchor") weekAnchorNames.add(marker.journalName);
      else reshapeByOldId.set(marker.oldJournalId, marker);
    }

    for (const path of this.#notes.allMarkdownNotes()) {
      await this.#processNote(path, reshapeByOldId, weekAnchorNames);
    }

    this.#slice.state = [];
  }

  async #processNote(
    path: VaultPath,
    reshapeByOldId: Map<string, ReshapeMarker>,
    weekAnchorNames: Set<string>,
  ): Promise<void> {
    const metadata = this.#metadata.get(path);
    if (metadata.isNone()) return;

    const properties = metadata.value.properties;
    const name = properties[FRONTMATTER_NAME_KEY];
    if (typeof name !== "string") return;

    const reshape = reshapeByOldId.get(name);
    if (reshape) return this.#rewrite(path, reshape, properties);
    if (weekAnchorNames.has(name)) return this.#canonicalizeWeekAnchor(path, name, properties);
  }

  async #canonicalizeWeekAnchor(
    path: VaultPath,
    journalName: string,
    properties: Record<string, unknown>,
  ): Promise<void> {
    const config = this.#journals.get(journalName);
    if (config.isNone()) return;
    const dateField = config.value.frontmatter.dateField;
    const stored = properties[dateField];
    if (typeof stored !== "string") return;
    const parsed = CalendarDate.parse(stored);
    if (!parsed.isOk()) return;
    const anchor = this.#cycle.anchorOf(journalName, parsed.value);
    if (anchor.isNone() || anchor.value === stored) return;

    const canonical = anchor.value;
    const result = await this.#notes.updateFrontmatter(path, (fm) => {
      fm[dateField] = canonical;
    });
    result.tapErr((error) => {
      this.#logger.warn("failed to canonicalize weekly note anchor", { path, error });
    });
  }

  async #rewrite(path: VaultPath, marker: ReshapeMarker, properties: Record<string, unknown>): Promise<void> {
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
      // The date field must hold the period's canonical anchor (e.g. a week's
      // representative day), not the raw start date — a week-start date is
      // non-canonical and parseEntry would reject it.
      fm[config.frontmatter.dateField] = anchor;

      if (Object.hasOwn(fm, INTERVAL_INDEX_KEY)) {
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

  // The walk needs the whole vault visible and parsed, both of which Obsidian loads
  // asynchronously after onload. onLayoutReady is the point at which the file list is
  // complete (before it, getMarkdownFiles is empty and a walk clears the markers
  // having migrated nothing). Even then metadataCache resolves frontmatter
  // incrementally and fires "resolved" in batches, so wait until every note is parsed
  // before walking — otherwise not-yet-indexed notes are skipped yet marked done.
  initialize(): AsyncResult<void, never> {
    this.#workspace.onLayoutReady(() => this.#runWhenResolved());
    return AsyncResult.ok();
  }
}

type SectionName = "day" | "week" | "month" | "quarter" | "year";

function sectionOf(properties: Record<string, unknown>): SectionName {
  return String(properties[SECTION_KEY]) as SectionName;
}
