import * as v from "valibot";

import { CalendarDate, type AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import {
  NoteStructureService,
  NotesService,
  type NoteNotFoundError,
  type NoteStructure,
  type NoteWriteError,
  type VaultPath,
} from "@/infrastructure/host";
import { AsyncResult, attempt, type Option, type Result } from "@/infrastructure/result";
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

import { NoCurrentPeriodError, type RollError } from "./errors";
import { placeGroups } from "./placement";
import { planSource, type PlannedRoot, type RollSource, type SourcePlan } from "./plan";
import { effectiveMove, moveDefaultsSlice, type EffectiveMove } from "./settings";
import { rewriteSource, type SourceRewrite } from "./source-write";

import type { ChangedSource, RollReport } from "./report";
import type { TaskRule } from "../conditions";

interface AnchoredPlan {
  readonly anchor: AnchorString;
  readonly plan: SourcePlan;
}

const CHECKBOX = /^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[(.)\]/u;

function hasTag(line: string, tag: string): boolean {
  const escaped = tag.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
  return new RegExp(String.raw`(?:^|\s)${escaped}(?=[\s,.;:!?)]|$)`, "iu").test(line);
}

// metadataCache trails a write. Planned against an older structure, a line stamped a moment ago
// reads as open and rolls twice, and a line number that has since shifted plans whatever now sits
// there — so the structure has to agree with the text on every task line before it is trusted.
function inSync(content: string, structure: NoteStructure, marker: string): boolean {
  const lines = content.split("\n");
  return structure.listItems.every((item) => {
    const line = lines[item.line];
    if (line === undefined || CHECKBOX.exec(line)?.[1] !== item.marker) return false;
    return marker === "" || hasTag(line, marker) === carriesMarker(item, structure, marker);
  });
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

function sourceRewrite(move: EffectiveMove, marker: string): SourceRewrite | null {
  if (move.mode === "move") return { kind: "remove" };
  // An empty marker would stamp a bare space and never read back as rolled.
  return move.stamp && marker !== "" ? { kind: "stamp", marker } : null;
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
  readonly #running = new Map<string, Promise<unknown>>();
  readonly #listing: TaskListingDependencies = {
    journals: this.#journals,
    index: this.#index,
    cycle: this.#cycle,
    structure: this.#structure,
    tasks: inject(TaskIndex),
    visibility: inject(TaskVisibility),
  };

  #todayAnchor(journalName: string): Result<AnchorString, NoCurrentPeriodError> {
    return this.#cycle
      .anchorOf(journalName, CalendarDate.today())
      .filter((anchor) => this.#timeline.contains(journalName, anchor))
      .okOr(new NoCurrentPeriodError(journalName));
  }

  // A notelet needs no period note at its anchor, so a source that reads notelets steps over the
  // anchors holding either kind.
  #previousAnchor(journalName: string, from: AnchorString, source: EffectiveMove["source"]): Option<AnchorString> {
    const note = this.#index
      .findPrevious(journalName, from)
      .flatMap((path) => this.#index.entryByPath(path))
      .map((entry) => entry.anchor);
    if (source === "note") return note;
    const notelet = this.#index.previousNoteletAnchor(journalName, from);
    if (note.isNone()) return notelet;
    if (notelet.isNone()) return note;
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
  // read as "nothing to roll", a stale one rolls the wrong lines.
  async #readSource(path: VaultPath): Promise<RollSource | "indexing" | null> {
    const content = await this.#notes.read(path);
    if (content.isErr()) return null;
    const structure = this.#structure.get(path);
    if (structure.isNone() || !inSync(content.value, structure.value, this.#checkbox.state.rolledMarker)) {
      return "indexing";
    }
    return { path, content: content.value, structure: structure.value, items: this.#itemsOf(path, structure.value) };
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
    // Collected inside the closure: the verdict is reached under vault.process's lock.
    const refusals: string[] = [];
    return this.#notes
      .process(path, (content) => {
        const outcome = rewriteSource(content, roots, rewrite);
        if ("reason" in outcome) {
          refusals.push(outcome.reason);
          return content;
        }
        return outcome.content;
      })
      .map(() => (refusals.length > 0 ? "changed" : "written"));
  }

  // Counted through the listing, not a query of our own, so the count matches what the period shows.
  // No source scope: a task note is reached by its date, which the listing never scopes by source.
  async #openNoteItems(journalName: string, anchors: readonly AnchorString[]): Promise<number> {
    const query = v.parse(taskQuerySchema, {
      scope: { provider: [NOTE_PROPERTY_PROVIDER_ID], depth: "literal" },
      filter: { mode: "and", conditions: [DEFAULT_STATUS_CONDITION] },
    });
    const keys = new Set<string>();
    for (const anchor of anchors) {
      const rows = await buildTaskListing(this.#listing, {
        kind: "period",
        hostJournal: journalName,
        anchor,
        journalNames: [journalName],
        query,
      });
      for (const row of rows) {
        if (!row.context && isOpen(row.item.status)) keys.add(row.key);
      }
    }
    return keys.size;
  }

  #rollNow(journalName: string, options: { readonly interactive: boolean }): AsyncResult<RollReport, RollError> {
    return attempt.in(this, async function* (this: RolloverService) {
      const config = yield* this.#journals.get(journalName).okOr(new JournalNotFoundError(journalName));
      const today = yield* this.#todayAnchor(journalName);
      const move = effectiveMove(config.tasks.move, this.#defaults.state);
      const selection = selectionOf(config.tasks.filter);
      const marker = this.#checkbox.state.rolledMarker;
      const read = this.#lookBack(journalName, today, move);

      const plans: AnchoredPlan[] = [];
      const indexing = new Set<AnchorString>();
      for (const anchor of read) {
        for (const path of this.#sourcePaths(journalName, anchor, move.source)) {
          const source = await this.#readSource(path);
          if (source === "indexing") indexing.add(anchor);
          if (source === null || source === "indexing") continue;
          plans.push({ anchor, plan: planSource(source, { selection, mode: move.mode, rolledMarker: marker }) });
        }
      }
      const contributing = plans.filter(({ plan }) => plan.roots.length > 0);

      const changedSources: ChangedSource[] = [];
      const failedSources: ChangedSource[] = [];
      if (contributing.length > 0) {
        const target = yield* this.#targetPath(journalName, today, options.interactive);
        const groups = contributing.flatMap(({ plan }) => plan.block);
        // The target goes first: a failure before the sources are written leaves a duplicate, never a gap.
        yield* this.#notes.process(target, (content) => placeGroups(content, groups, move.targetHeading));
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

      const heading = headingOf(selection);
      const report: RollReport = {
        journalName,
        mode: move.mode,
        rolled: contributing.reduce((sum, { plan }) => sum + plan.roots.length, 0),
        notes: contributing.length,
        sources: [...new Set(contributing.map(({ anchor }) => anchor))],
        read,
        noPrevious: read.length === 0,
        missingHeading:
          heading === null
            ? []
            : read.filter((anchor) => {
                const atAnchor = plans.filter((entry) => entry.anchor === anchor);
                return atAnchor.length > 0 && atAnchor.every(({ plan }) => plan.selectionMissedHeading);
              }),
        heading,
        skippedNoteItems: await this.#openNoteItems(journalName, read),
        skippedBlockIds: plans.reduce((sum, { plan }) => sum + plan.refusedForBlockId.length, 0),
        changedSources,
        failedSources,
        skippedSources: read.filter((anchor) => indexing.has(anchor)),
      };
      return report;
    });
  }

  // One roll per journal at a time: a second one planned before the first wrote would read the same
  // open lines and copy them again.
  roll(journalName: string, options: { readonly interactive: boolean }): AsyncResult<RollReport, RollError> {
    const previous = this.#running.get(journalName) ?? Promise.resolve();
    const run = attempt.in(this, async function* (this: RolloverService) {
      await previous;
      return yield* this.#rollNow(journalName, options);
    });
    // The tail never rejects: a roll that throws hands its rejection to its own caller, not to the
    // next roll queued behind it.
    const settled = Promise.resolve(run).then(
      () => true,
      () => false,
    );
    this.#running.set(journalName, settled);
    void settled.then(() => {
      if (this.#running.get(journalName) === settled) this.#running.delete(journalName);
    });
    return run;
  }
}
