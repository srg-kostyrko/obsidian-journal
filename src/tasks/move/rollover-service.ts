import { createNanoEvents } from "nanoevents";
import * as v from "valibot";

import { CalendarDate, type AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import type { Subscribable, TypedEmitter } from "@/infrastructure/events";
import { Flows } from "@/infrastructure/flows";
import {
  NoteStructureService,
  NotesService,
  WorkspaceService,
  type NoteNotFoundError,
  type NoteStructure,
  type NoteWriteError,
  type VaultPath,
} from "@/infrastructure/host";
import { AsyncResult, attempt, Err, type Option, type Result } from "@/infrastructure/result";
import { CycleService } from "@/journals/cycle";
import { JournalNotFoundError } from "@/journals/errors";
import { EnsureJournalEntryFlow } from "@/journals/flows";
import { JournalsIndex } from "@/journals/journals-index";
import { JournalsRepository } from "@/journals/repository";
import { TimelineService } from "@/journals/timeline";
import { SettingsService } from "@/settings";

import { buildTaskListing, type TaskListingDependencies } from "../listing";
import { carriesMarker, CHECKBOX_PROVIDER_ID, extractItems } from "../providers/checkbox/extract";
import { parseJournalRule } from "../providers/checkbox/provider";
import { checkboxSlice } from "../providers/checkbox/slice";
import { NOTE_PROPERTY_PROVIDER_ID } from "../providers/note-property/slice";
import { DEFAULT_STATUS_CONDITION, taskQuerySchema } from "../query";
import { isOpen } from "../status";
import { TaskIndex } from "../task-index";
import { TaskHostToken, type TaskItem } from "../types";
import { TaskVisibility } from "../visibility";

import { AutomaticRollRefusedError, NoCurrentPeriodError, type RollError } from "./errors";
import { lineHasTag } from "./line-tags";
import { MoveLocks } from "./locks";
import { rewriteNote, type NoteWriters } from "./note-write";
import { placeGroups } from "./placement";
import { planSource, type PlannedRoot, type RollSource, type SourcePlan } from "./plan";
import { automaticBlocked, effectiveMove, moveDefaultsSlice, type EffectiveMove } from "./settings";
import { rewriteSource, sourceRewrite, type SourceRewrite } from "./source-write";

import type { AnchoredCount, ChangedSource, RollReport } from "./report";
import type { TaskRule } from "../conditions";

interface AnchoredPlan {
  readonly anchor: AnchorString;
  readonly plan: SourcePlan;
}

const CHECKBOX = /^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[(.)\]/u;

const ATX_HEADING = /^[ \t]*(#{1,6})(?=[ \t]|$)(.*)$/u;
// Obsidian's text for a heading: trailing whitespace and a whitespace-preceded closing #-run go.
const ATX_CLOSING = /(?:^|[ \t])[ \t#]*$/u;
const HEADING_UNDERLINE = { 1: /^\s*=+\s*$/u, 2: /^\s*-+\s*$/u } as const;

// metadataCache lists root headings only, so a quoted heading never needs matching here.
function holdsHeading(lines: readonly string[], heading: NoteStructure["headings"][number]): boolean {
  const line = (lines[heading.line] ?? "").replace(/\r$/u, "");
  const atx = ATX_HEADING.exec(line);
  if (atx !== null) {
    const text = (atx[2] ?? "").replace(ATX_CLOSING, "").trim();
    return atx[1]?.length === heading.level && text === heading.heading;
  }
  const underline = heading.level === 1 || heading.level === 2 ? HEADING_UNDERLINE[heading.level] : null;
  return underline !== null && underline.test(lines[heading.line + 1] ?? "") && line.trim() === heading.heading;
}

// Looser than lineHasTag: only a tag that is gone or has grown longer matters here.
function holdsTag(lines: readonly string[], tag: NoteStructure["tags"][number]): boolean {
  const line = lines[tag.line];
  if (line === undefined) return false;
  const escaped = tag.tag.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
  return new RegExp(String.raw`${escaped}(?![\p{L}\p{N}_/-])`, "iu").test(line);
}

// metadataCache trails a write. Planned against an older structure, a line stamped a moment ago
// reads as open and rolls twice, a line number that has since shifted plans whatever now sits
// there, and a renamed heading or tag selects lines the filter no longer names — so the structure
// has to agree with the text on every task line, heading and tag before it is trusted.
function inSync(content: string, structure: NoteStructure, marker: string): boolean {
  const lines = content.split("\n");
  const tasksAgree = structure.listItems.every((item) => {
    const line = lines[item.line];
    if (line === undefined || CHECKBOX.exec(line)?.[1] !== item.marker) return false;
    return marker === "" || lineHasTag(line, marker) === carriesMarker(item, structure, marker);
  });
  return (
    tasksAgree &&
    structure.headings.every((heading) => holdsHeading(lines, heading)) &&
    structure.tags.every((tag) => holdsTag(lines, tag))
  );
}

export interface RollOptions {
  readonly interactive: boolean;
  // False for a roll nobody asked for: a missing target is reported, never created.
  readonly createTarget?: boolean;
  // True for an automatic roll: settings can change while it waits for the lock, so it is refused
  // unless the journal is still automatic, and allowed to be, once the lock is held.
  readonly requireAutomatic?: boolean;
}

function noTargetReport(journalName: string, mode: RollReport["mode"], heading: string | null): RollReport {
  return {
    journalName,
    mode,
    rolled: 0,
    notes: 0,
    sources: [],
    read: [],
    noPrevious: false,
    noTarget: true,
    missingHeading: [],
    heading,
    skippedNoteItems: 0,
    skippedBlockIds: 0,
    skippedNoteItemsAt: [],
    skippedBlockIdsAt: [],
    changedSources: [],
    failedSources: [],
    skippedSources: [],
    unreadSources: [],
  };
}

function sum(counts: readonly AnchoredCount[]): number {
  return counts.reduce((total, { count }) => total + count, 0);
}

function selectionOf(filter: TaskRule): TaskRule {
  return { mode: filter.mode, conditions: filter.conditions.filter((condition) => condition.type !== "status") };
}

function headingOf(selection: TaskRule): string | null {
  const named = selection.conditions.flatMap((condition) =>
    condition.type === "heading" && condition.condition === "under" ? condition.headings : [],
  );
  return named.at(0) ?? null;
}

interface RolloverEvents {
  rolled: (report: RollReport, options: RollOptions) => void;
}

/** Rolls a journal's unfinished checkbox items from its previous notes into today's. */
export class RolloverService {
  readonly #journals = inject(JournalsRepository);
  readonly #index = inject(JournalsIndex);
  readonly #cycle = inject(CycleService);
  readonly #timeline = inject(TimelineService);
  readonly #flows = inject(Flows);
  readonly #notes = inject(NotesService);
  readonly #structure = inject(NoteStructureService);
  readonly #host = inject(TaskHostToken);
  readonly #checkbox = inject(SettingsService).getSlice(checkboxSlice);
  readonly #defaults = inject(SettingsService).getSlice(moveDefaultsSlice);
  readonly #locks = inject(MoveLocks);
  readonly #workspace = inject(WorkspaceService);
  readonly #writers: NoteWriters = { workspace: this.#workspace, notes: this.#notes };
  readonly #listing: TaskListingDependencies = {
    journals: this.#journals,
    index: this.#index,
    cycle: this.#cycle,
    structure: this.#structure,
    tasks: inject(TaskIndex),
    visibility: inject(TaskVisibility),
  };
  readonly #emitter: TypedEmitter<RolloverEvents> = createNanoEvents();
  /** Fires after every roll that finished, whoever asked for it. */
  readonly events: Subscribable<RolloverEvents> = this.#emitter;

  #todayAnchor(journalName: string): Result<AnchorString, NoCurrentPeriodError> {
    return this.#cycle
      .anchorOf(journalName, CalendarDate.today())
      .filter((anchor) => this.#timeline.contains(journalName, anchor))
      .okOr(new NoCurrentPeriodError(journalName));
  }

  // A step is an anchor holding what the source reads: a notelet needs no period note at its anchor,
  // and a period note alone gives a notelets-only roll nothing.
  #previousAnchor(journalName: string, from: AnchorString, source: EffectiveMove["source"]): Option<AnchorString> {
    const notelet = this.#index.previousNoteletAnchor(journalName, from);
    if (source === "notelets") return notelet;
    const note = this.#index
      .findPrevious(journalName, from)
      .flatMap((path) => this.#index.entryByPath(path))
      .map((entry) => entry.anchor);
    if (source === "note" || notelet.isNone()) return note;
    if (note.isNone()) return notelet;
    return note.value > notelet.value ? note : notelet;
  }

  #lookBack(journalName: string, from: AnchorString, move: EffectiveMove): readonly AnchorString[] {
    const found: AnchorString[] = [];
    let cursor = from;
    while (found.length < move.lookBack) {
      const previous = this.#previousAnchor(journalName, cursor, move.source);
      if (previous.isNone()) break;
      found.push(previous.value);
      cursor = previous.value;
    }
    return found.toReversed();
  }

  #sourcePaths(journalName: string, anchor: AnchorString, source: EffectiveMove["source"]): readonly VaultPath[] {
    const note =
      source === "notelets"
        ? []
        : this.#index.get(journalName, anchor).match({ some: (path) => [path], none: () => [] });
    const notelets =
      source === "note"
        ? []
        : this.#index
            .noteletsAt(journalName, anchor)
            .map((entry) => entry.path)
            .toSorted();
    return [...note, ...notelets];
  }

  // A note whose structure has not resolved, or lags its text, is not planned: an empty plan would
  // read as "nothing to roll", a stale one rolls the wrong lines. An open view is read rather than the
  // file, since an edit made through it reaches disk only on save; metadataCache parses only what is
  // saved, so a view holding unsaved typing has no structure that describes it yet.
  async #readSource(path: VaultPath): Promise<RollSource | "indexing" | "unread"> {
    const disk = await this.#notes.read(path);
    if (disk.isErr()) return "unread";
    const open = this.#workspace.openNoteText(path);
    // The editor's buffer is LF whatever the file's line endings.
    if (open.isSome() && open.value !== disk.value.replaceAll(/\r$/gmu, "")) return "indexing";
    const content = open.isSome() ? open.value : disk.value;
    const structure = this.#structure.get(path);
    if (structure.isNone() || !inSync(content, structure.value, this.#checkbox.state.rolledMarker)) {
      return "indexing";
    }
    return { path, content, structure: structure.value, items: this.#itemsOf(path, structure.value) };
  }

  // The provider's own inputs, so a line rolls exactly when the provider calls it a task.
  #itemsOf(path: VaultPath, structure: NoteStructure): readonly TaskItem[] {
    const { enabled, rule, statusMap, rolledMarker } = this.#checkbox.state;
    if (!enabled) return [];
    const owner = this.#host.ownerOf(path, CHECKBOX_PROVIDER_ID).getOrUndefined();
    return extractItems({
      path,
      structure,
      vault: rule,
      journal: owner === undefined ? null : parseJournalRule(owner.rule),
      statusMap,
      rolledMarker,
      owned: true,
      lineDates: undefined,
    });
  }

  #targetPath(journalName: string, anchor: AnchorString, interactive: boolean): AsyncResult<VaultPath, RollError> {
    const existing = this.#index.get(journalName, anchor);
    if (existing.isSome()) return AsyncResult.ok(existing.value);
    return this.#flows
      .invoke(EnsureJournalEntryFlow, { journalName, anchor, unattended: !interactive }, { notify: false })
      .map(({ path }) => path);
  }

  #rewrite(
    path: VaultPath,
    roots: readonly PlannedRoot[],
    rewrite: SourceRewrite,
  ): AsyncResult<"written" | "changed", NoteNotFoundError | NoteWriteError> {
    return rewriteNote(
      this.#writers,
      path,
      (content) => {
        const outcome = rewriteSource(content, roots, rewrite);
        return "reason" in outcome ? null : outcome.content;
      },
      // Saved before the lock is released, so the next roll reads the stamp or removal off disk too.
      { flush: true },
    ).map((written) => (written === "refused" ? "changed" : "written"));
  }

  // Counted through the listing, not a query of our own, so the count matches what the period shows.
  // No source scope: a task note is reached by its date, which the listing never scopes by source.
  async #openNoteItems(journalName: string, anchors: readonly AnchorString[]): Promise<readonly AnchoredCount[]> {
    const query = v.parse(taskQuerySchema, {
      scope: { provider: [NOTE_PROPERTY_PROVIDER_ID], depth: "literal" },
      filter: { mode: "and", conditions: [DEFAULT_STATUS_CONDITION] },
    });
    const keys = new Set<string>();
    const counts: AnchoredCount[] = [];
    for (const anchor of anchors) {
      const rows = await buildTaskListing(this.#listing, {
        kind: "period",
        hostJournal: journalName,
        anchor,
        journalNames: [journalName],
        query,
      });
      // An item a later anchor's listing also reaches counts once, at the oldest.
      const before = keys.size;
      for (const row of rows) {
        if (!row.context && isOpen(row.item.status)) keys.add(row.key);
      }
      if (keys.size > before) counts.push({ anchor, count: keys.size - before });
    }
    return counts;
  }

  #rollNow(journalName: string, options: RollOptions): AsyncResult<RollReport, RollError> {
    return attempt.in(this, async function* (this: RolloverService) {
      const config = yield* this.#journals.get(journalName).okOr(new JournalNotFoundError(journalName));
      const today = yield* this.#todayAnchor(journalName);
      const move = effectiveMove(config.tasks.move, this.#defaults.state);
      if (options.requireAutomatic === true) {
        const refused = config.tasks.move.automatic ? automaticBlocked(move) : "not-automatic";
        if (refused !== null) return yield* new Err(new AutomaticRollRefusedError(journalName, refused));
      }
      const selection = selectionOf(config.tasks.filter);
      const heading = headingOf(selection);
      const createTarget = options.createTarget ?? true;
      if (!createTarget && this.#index.get(journalName, today).isNone()) {
        return noTargetReport(journalName, move.mode, heading);
      }
      const marker = this.#checkbox.state.rolledMarker;
      const read = this.#lookBack(journalName, today, move);

      const plans: AnchoredPlan[] = [];
      const indexing = new Set<AnchorString>();
      const unread = new Set<AnchorString>();
      for (const anchor of read) {
        for (const path of this.#sourcePaths(journalName, anchor, move.source)) {
          const source = await this.#readSource(path);
          if (source === "indexing") indexing.add(anchor);
          else if (source === "unread") unread.add(anchor);
          else plans.push({ anchor, plan: planSource(source, { selection, mode: move.mode, rolledMarker: marker }) });
        }
      }
      const contributing = plans.filter(({ plan }) => plan.roots.length > 0);

      const changedSources: ChangedSource[] = [];
      const failedSources: ChangedSource[] = [];
      if (contributing.length > 0) {
        // The reads await, and the note can be deleted meanwhile.
        if (!createTarget && this.#index.get(journalName, today).isNone()) {
          return noTargetReport(journalName, move.mode, heading);
        }
        const target = yield* this.#targetPath(journalName, today, options.interactive);
        const groups = contributing.flatMap(({ plan }) => plan.block);
        // The target goes first, and reaches disk first: a failure before the sources are written leaves
        // a duplicate, never a gap.
        yield* rewriteNote(this.#writers, target, (content) => placeGroups(content, groups, move.targetHeading), {
          flush: true,
        });
        const rewrite = sourceRewrite(move, marker);
        if (rewrite !== null) {
          // A failed source is reported, not raised: its items already sit in the target.
          for (const { anchor, plan } of contributing) {
            const outcome = await this.#rewrite(plan.path, plan.roots, rewrite);
            if (outcome.isErr()) failedSources.push({ path: plan.path, anchor });
            else if (outcome.value === "changed") changedSources.push({ path: plan.path, anchor });
          }
        }
      }

      const skippedNoteItemsAt = await this.#openNoteItems(journalName, read);
      const skippedBlockIdsAt = read.flatMap((anchor) => {
        const count = plans
          .filter((entry) => entry.anchor === anchor)
          .reduce((total, { plan }) => total + plan.refusedForBlockId.length, 0);
        return count > 0 ? [{ anchor, count }] : [];
      });
      const report: RollReport = {
        journalName,
        mode: move.mode,
        rolled: contributing.reduce((sum, { plan }) => sum + plan.roots.length, 0),
        notes: contributing.length,
        sources: [...new Set(contributing.map(({ anchor }) => anchor))],
        read,
        noPrevious: read.length === 0,
        noTarget: false,
        missingHeading:
          heading === null
            ? []
            : read.filter((anchor) => {
                const atAnchor = plans.filter((entry) => entry.anchor === anchor);
                return atAnchor.length > 0 && atAnchor.every(({ plan }) => plan.selectionMissedHeading);
              }),
        heading,
        skippedNoteItems: sum(skippedNoteItemsAt),
        skippedBlockIds: sum(skippedBlockIdsAt),
        skippedNoteItemsAt,
        skippedBlockIdsAt,
        changedSources,
        failedSources,
        skippedSources: read.filter((anchor) => indexing.has(anchor)),
        unreadSources: read.filter((anchor) => unread.has(anchor)),
      };
      return report;
    });
  }

  roll(journalName: string, options: RollOptions): AsyncResult<RollReport, RollError> {
    return this.#locks
      .run([journalName], () => this.#rollNow(journalName, options))
      .tap((report) => this.#emitter.emit("rolled", report, options));
  }
}
