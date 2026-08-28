import { match } from "ts-pattern";

import { CalendarDate, type AnchorString } from "@/calendar";
import type { FilterCondition } from "@/decorations/config";
import { checkProperty, checkTag, checkTitle } from "@/decorations/engine-checks";
import { inject } from "@/infrastructure/di";
import { NoteMetadataService, NotesService } from "@/infrastructure/host";
import type { FolderNotFoundError, NoteMetadata, VaultPath } from "@/infrastructure/host";
import { AsyncResult, InvariantError, attempt } from "@/infrastructure/result";

import { CycleService } from "../../cycle";
import { JournalsIndex } from "../../journals-index";
import { promptsInTemplate } from "../../prompts/prompts-in-path";
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
  targetPath: VaultPath;
  existing: "none" | "skip" | "override" | "merge" | "ask";
  folder: "n/a" | "keep" | "move" | "ask" | "refused-prompt";
  name: "n/a" | "keep" | "rename" | "ask" | "refused-prompt";
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
  // Set when the plan already refused this half of the path for carrying an unanswered prompt
  // placeholder — #applyOne logs the refusal instead of treating a false move/rename as silence.
  moveRefused?: boolean;
  renameRefused?: boolean;
}

export interface BulkAddDecisions {
  existing: Readonly<Record<string, "skip" | "override" | "merge">>;
  folder: Readonly<Record<string, "keep" | "move">>;
  name: Readonly<Record<string, "keep" | "rename">>;
}

// What happened (or, on a dry run, what would have happened) to one note. Kept as data rather
// than prose so the caller words it: the service cannot know whether this was a dry run's
// intention or a completed action, and only the UI layer can localize it.
export type BulkLogAction =
  | { kind: "skipped-occupied"; anchor: AnchorString }
  | { kind: "merged"; anchor: AnchorString }
  | { kind: "replaced"; anchor: AnchorString }
  | { kind: "moved" }
  | { kind: "move-refused-prompt" }
  | { kind: "renamed" }
  | { kind: "rename-refused-prompt" }
  | { kind: "connected"; journalName: string; anchor: AnchorString }
  | { kind: "merge-occupant-missing" }
  | { kind: "failed"; message: string };

export interface BulkLogEntry {
  path: VaultPath;
  actions: BulkLogAction[];
}

// A nested ternary here reads fine but Prettier and the nested-ternary lint rule fight over
// where the parens go, so the three-way choice (unaffected / refused / the caller's own
// decision) is spelled out as branches instead.
function pathDecision<T extends string>(
  needsChange: boolean,
  refused: boolean,
  otherwise: T,
): "n/a" | "refused-prompt" | T {
  if (!needsChange) return "n/a";
  if (refused) return "refused-prompt";
  return otherwise;
}

export class BulkAddService {
  readonly #notes = inject(NotesService);
  readonly #metadata = inject(NoteMetadataService);
  readonly #index = inject(JournalsIndex);
  readonly #cycle = inject(CycleService);
  readonly #timeline = inject(TimelineService);
  readonly #path = inject(NotePathService);
  readonly #connection = inject(NoteConnectionService);

  async #applyAll(
    journalName: string,
    actions: ResolvedAction[],
    dryRun: boolean,
    onProgress?: (done: number, total: number) => void,
  ): Promise<BulkLogEntry[]> {
    const log: BulkLogEntry[] = [];
    for (const action of actions) {
      log.push(await this.#applyOne(journalName, action, dryRun));
      onProgress?.(log.length, actions.length);
    }
    return log;
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

    const config = this.#path.configFor(journalName);
    const nameRefused =
      configuredName !== currentName &&
      config !== undefined &&
      promptsInTemplate(config.nameTemplate, config.prompts).length > 0;
    const folderRefused =
      configuredFolder !== currentFolder &&
      config !== undefined &&
      promptsInTemplate(config.folder, config.prompts).length > 0;
    // A refused half must not leak the placeholder into the shown target path — fall back to
    // the note's own name/folder for whichever half is refused.
    const targetName = nameRefused ? currentName : configuredName;
    const targetFolder = folderRefused ? currentFolder : configuredFolder;

    return {
      kind: "action",
      path,
      anchor,
      ...(occupant !== undefined && { occupant }),
      targetPath: (targetFolder ? `${targetFolder}/${targetName}` : targetName) as VaultPath,
      existing: occupant === undefined ? "none" : parameters.existingNote,
      folder: pathDecision(configuredFolder !== currentFolder, folderRefused, parameters.otherFolder),
      name: pathDecision(configuredName !== currentName, nameRefused, parameters.otherName),
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
    if (!metadata || !Object.hasOwn(metadata.properties, name)) return undefined;
    const raw = metadata.properties[name];
    return typeof raw === "string" ? raw : undefined;
  }

  async #applyOne(journalName: string, action: ResolvedAction, dryRun: boolean): Promise<BulkLogEntry> {
    const actions: BulkLogAction[] = [];
    if (action.existing === "skip") {
      actions.push({ kind: "skipped-occupied", anchor: action.anchor });
      return { path: action.path, actions };
    }
    if (action.existing === "merge") {
      actions.push({ kind: "merged", anchor: action.anchor });
      if (!dryRun) {
        const occupant = this.#index.entryByAnchor(journalName, action.anchor);
        if (occupant.isSome()) {
          const occupantPath = occupant.value.path;
          const result = await attempt.in(this, async function* (this: BulkAddService) {
            const content = yield* this.#notes.read(action.path);
            yield* this.#notes.append(occupantPath, `\n\n${content}`);
            yield* this.#notes.delete(action.path);
            return;
          });
          if (result.kind === "err") actions.push({ kind: "failed", message: result.error.message });
        } else {
          actions.push({ kind: "merge-occupant-missing" });
        }
      }
      return { path: action.path, actions };
    }

    const override = action.existing === "override";
    if (override) actions.push({ kind: "replaced", anchor: action.anchor });
    if (action.moveRefused) actions.push({ kind: "move-refused-prompt" });
    else if (action.move) actions.push({ kind: "moved" });
    if (action.renameRefused) actions.push({ kind: "rename-refused-prompt" });
    else if (action.rename) actions.push({ kind: "renamed" });
    actions.push({ kind: "connected", journalName, anchor: action.anchor });

    if (!dryRun) {
      const result = await this.#connection.connect(journalName, action.path, action.anchor, {
        override,
        move: action.move,
        rename: action.rename,
      });
      if (result.kind === "err") actions.push({ kind: "failed", message: result.error.message });
    }
    return { path: action.path, actions };
  }

  resolve(actions: readonly PlannedAction[], decisions: BulkAddDecisions): ResolvedAction[] {
    return actions.map((a) => ({
      path: a.path,
      anchor: a.anchor,
      existing: a.existing === "ask" ? (decisions.existing[a.path] ?? "skip") : a.existing,
      move: a.folder === "ask" ? decisions.folder[a.path] === "move" : a.folder === "move",
      rename: a.name === "ask" ? decisions.name[a.path] === "rename" : a.name === "rename",
      moveRefused: a.folder === "refused-prompt",
      renameRefused: a.name === "refused-prompt",
    }));
  }

  plan(journalName: string, parameters: BulkAddParameters): AsyncResult<BulkPlan, FolderNotFoundError> {
    return attempt.in(this, async function* (this: BulkAddService) {
      const files = yield* this.#notes.listInFolder(parameters.folder as VaultPath);
      // The folder holds attachments too, and a date-named one plans exactly like a note: nothing
      // downstream reads an extension, so connect would write journal frontmatter into a binary.
      const paths = files.filter((path) => path.endsWith(".md"));
      const dateRegexp = formatToRegexp(parameters.dateFormat);
      const notes = paths.map((path) => this.#planNote(journalName, path, parameters, dateRegexp));
      return { notes };
    });
  }

  apply(
    journalName: string,
    actions: ResolvedAction[],
    dryRun: boolean,
    onProgress?: (done: number, total: number) => void,
  ): AsyncResult<BulkLogEntry[], never> {
    return AsyncResult.fromPromise(this.#applyAll(journalName, actions, dryRun, onProgress), () => {
      throw new InvariantError("bulk apply never rejects");
    });
  }
}
