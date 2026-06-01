import { match } from "ts-pattern";

import { CalendarDate, type AnchorString } from "@/calendar";
import type { FilterCondition } from "@/decorations/config";
import { checkProperty, checkTag, checkTitle } from "@/decorations/engine-checks";
import { inject } from "@/infrastructure/di";
import { NoteMetadataService, NotesService } from "@/infrastructure/host";
import type { FolderNotFoundError, NoteMetadata, VaultPath } from "@/infrastructure/host";
import { AsyncResult, Ok, attempt } from "@/infrastructure/result";

import { CycleService } from "../../cycle";
import { JournalsIndex } from "../../journals-index";
import { TimelineService } from "../../timeline";
import { NoteConnectionService } from "../note-connection";
import { NotePathService } from "../note-path";
import { splitVaultPath } from "../vault-path";

import { formatToRegexp } from "./format-to-regexp";

import type { BulkAddParameters } from "./config";

export type SkipReason = "already-connected" | "filtered" | "no-date" | "invalid-date" | "out-of-bounds";

export interface PlannedSkip {
  kind: "skip";
  path: VaultPath;
  reason: SkipReason;
}

export interface PlannedAction {
  kind: "action";
  path: VaultPath;
  anchor: AnchorString;
  occupant?: VaultPath;
  existing: "none" | "skip" | "override" | "merge" | "ask";
  folder: "n/a" | "keep" | "move" | "ask";
  name: "n/a" | "keep" | "rename" | "ask";
}

export type PlannedNote = PlannedSkip | PlannedAction;

export interface BulkPlan {
  notes: PlannedNote[];
}

export interface ResolvedAction {
  path: VaultPath;
  anchor: AnchorString;
  existing: "none" | "skip" | "override" | "merge";
  move: boolean;
  rename: boolean;
}

export interface BulkLogEntry {
  path: VaultPath;
  actions: string[];
}

export class BulkAddService {
  readonly #notes = inject(NotesService);
  readonly #metadata = inject(NoteMetadataService);
  readonly #index = inject(JournalsIndex);
  readonly #cycle = inject(CycleService);
  readonly #timeline = inject(TimelineService);
  readonly #path = inject(NotePathService);
  readonly #connection = inject(NoteConnectionService);

  plan(journalName: string, parameters: BulkAddParameters): AsyncResult<BulkPlan, FolderNotFoundError> {
    return attempt.in(this, async function* (this: BulkAddService) {
      const paths = yield* this.#notes.listInFolder(parameters.folder as VaultPath);
      const dateRegexp = formatToRegexp(parameters.dateFormat);
      const notes = paths.map((path) => this.#planNote(journalName, path, parameters, dateRegexp));
      return { notes };
    });
  }

  apply(journalName: string, actions: ResolvedAction[], dryRun: boolean): AsyncResult<BulkLogEntry[], never> {
    return AsyncResult._fromPromiseOfResult(
      (async () => {
        const log: BulkLogEntry[] = [];
        for (const action of actions) {
          log.push(await this.#applyOne(journalName, action, dryRun));
        }
        return new Ok<BulkLogEntry[], never>(log);
      })(),
    );
  }

  #planNote(journalName: string, path: VaultPath, parameters: BulkAddParameters, dateRegexp: RegExp): PlannedNote {
    if (this.#index.entryByPath(path).isSome()) return { kind: "skip", path, reason: "already-connected" };

    const metadataOption = this.#metadata.get(path);
    const metadata = metadataOption.isSome() ? metadataOption.value : null;
    if (!this.#passesFilters(parameters, metadata)) return { kind: "skip", path, reason: "filtered" };

    const source =
      parameters.datePlace === "title"
        ? (metadata?.title ?? splitVaultPath(path)[1].replace(/\.md$/, ""))
        : this.#stringProperty(metadata, parameters.propertyName);
    if (source === undefined) return { kind: "skip", path, reason: "no-date" };

    const dateMatch = source.match(dateRegexp);
    if (!dateMatch) return { kind: "skip", path, reason: "no-date" };
    const parsed = CalendarDate.parse(dateMatch[0], parameters.dateFormat);
    if (!parsed.isOk()) return { kind: "skip", path, reason: "invalid-date" };

    const anchorOption = this.#cycle.anchorOf(journalName, parsed.value);
    if (anchorOption.isNone()) return { kind: "skip", path, reason: "invalid-date" };
    const anchor = anchorOption.value;
    if (!this.#timeline.contains(journalName, anchor)) return { kind: "skip", path, reason: "out-of-bounds" };

    const occupantOption = this.#index.entryByAnchor(journalName, anchor);
    const occupant =
      occupantOption.isSome() && occupantOption.value.path !== path ? occupantOption.value.path : undefined;

    const configuredResult = this.#path.pathFor(journalName, { journalName, anchor });
    const configured = configuredResult.isOk() ? configuredResult.value : path;
    const [currentFolder, currentName] = splitVaultPath(path);
    const [configuredFolder, configuredName] = splitVaultPath(configured);

    return {
      kind: "action",
      path,
      anchor,
      ...(occupant === undefined ? {} : { occupant }),
      existing: occupant === undefined ? "none" : parameters.existingNote,
      folder: configuredFolder === currentFolder ? "n/a" : parameters.otherFolder,
      name: configuredName === currentName ? "n/a" : parameters.otherName,
    };
  }

  #passesFilters(parameters: BulkAddParameters, metadata: NoteMetadata | null): boolean {
    if (parameters.filterCombinator === "no" || parameters.filters.length === 0) return true;
    const results = parameters.filters.map((filter) => this.#checkFilter(filter, metadata));
    return parameters.filterCombinator === "and" ? results.every(Boolean) : results.some(Boolean);
  }

  #checkFilter(filter: FilterCondition, metadata: NoteMetadata | null): boolean {
    return match(filter)
      .with({ type: "title" }, (c) => checkTitle(c, metadata))
      .with({ type: "tag" }, (c) => checkTag(c, metadata))
      .with({ type: "property" }, (c) => checkProperty(c, metadata))
      .exhaustive();
  }

  #stringProperty(metadata: NoteMetadata | null, name: string): string | undefined {
    if (!metadata || !(name in metadata.properties)) return undefined;
    const raw = metadata.properties[name];
    return typeof raw === "string" ? raw : undefined;
  }

  async #applyOne(journalName: string, action: ResolvedAction, dryRun: boolean): Promise<BulkLogEntry> {
    const actions: string[] = [];
    if (action.existing === "skip") {
      actions.push(`Skipped: a note is already connected to ${action.anchor}.`);
      return { path: action.path, actions };
    }
    if (action.existing === "merge") {
      actions.push(`Merged into the note already connected to ${action.anchor}; source deleted.`);
      if (!dryRun) {
        const occupant = this.#index.entryByAnchor(journalName, action.anchor);
        if (occupant.isSome()) {
          const occupantPath = occupant.value.path;
          const result = await attempt.in(this, async function* (this: BulkAddService) {
            const content = yield* this.#notes.read(action.path);
            yield* this.#notes.append(occupantPath, `\n${content}`);
            yield* this.#notes.delete(action.path);
            return;
          });
          if (result.kind === "err") actions.push(`Failed: ${result.error.message}`);
        } else {
          actions.push("Failed: the occupant disappeared before merge.");
        }
      }
      return { path: action.path, actions };
    }

    const override = action.existing === "override";
    if (override) actions.push(`Replaced the note already connected to ${action.anchor}.`);
    if (action.move) actions.push("Moved into the journal's folder.");
    if (action.rename) actions.push("Renamed to match the journal.");
    actions.push(`Connected to ${journalName} at ${action.anchor}.`);

    if (!dryRun) {
      const result = await this.#connection.connect(journalName, action.path, action.anchor, {
        override,
        move: action.move,
        rename: action.rename,
      });
      if (result.kind === "err") actions.push(`Failed: ${result.error.message}`);
    }
    return { path: action.path, actions };
  }
}
