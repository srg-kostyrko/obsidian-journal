import { inject } from "@/infrastructure/di";
import { Flows, UserAborted } from "@/infrastructure/flows";
import {
  NotesService,
  WorkspaceService,
  type ActiveEditorState,
  type LineReplacement,
  type VaultPath,
} from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt, InvariantError } from "@/infrastructure/result";
import { JournalNotFoundError } from "@/journals/errors";
import { EnsureJournalEntryFlow } from "@/journals/flows";
import { JournalsIndex } from "@/journals/journals-index";
import { JournalsRepository } from "@/journals/repository";
import { SettingsService } from "@/settings";

import { checkboxSlice } from "../../providers/checkbox/slice";
import { SingleMoveRefusedError, type SingleMoveError } from "../errors";
import { MoveLocks } from "../locks";
import { placeGroups } from "../placement";
import { planItem, type PlannedRoot, type SourcePlan } from "../plan";
import { effectiveMove, moveDefaultsSlice, type EffectiveMove } from "../settings";
import { rewriteSource, sourceRewrite, stampLine, type SourceRewrite } from "../source-write";
import { confirmBlockLinkModal } from "../ui/modals";

import type { MoveTarget } from "./containing";

const SOURCE = "move-task";

export interface SingleMoveReport {
  readonly mode: "copy" | "move";
  readonly label: string;
  readonly noteletTitle?: string;
  /** "nothing": the task had already left or been stamped by the time the move ran; nothing was written. */
  readonly outcome: "done" | "nothing" | "changed" | "write-failed";
}

interface Confirmed {
  readonly root: PlannedRoot;
  readonly allowBlockId: boolean;
}

type SourceOutcome = SingleMoveReport["outcome"];

// The verdict is rewriteSource's own check, so the editor path refuses exactly what the disk path would.
function lineChange(content: string, root: PlannedRoot, rewrite: SourceRewrite): LineReplacement | null {
  if ("reason" in rewriteSource(content, [root], rewrite)) return null;
  return rewrite.kind === "remove"
    ? { from: root.line, to: root.end, lines: [] }
    : { from: root.line, to: root.line, lines: [stampLine(root.firstLine, rewrite.marker)] };
}

/** Moves or copies the one task under the editor's cursor into another note. */
export class SingleMoveService {
  readonly #journals = inject(JournalsRepository);
  readonly #index = inject(JournalsIndex);
  readonly #flows = inject(Flows);
  readonly #notes = inject(NotesService);
  readonly #workspace = inject(WorkspaceService);
  readonly #modals = inject(ModalService);
  readonly #locks = inject(MoveLocks);
  readonly #checkbox = inject(SettingsService).getSlice(checkboxSlice);
  readonly #defaults = inject(SettingsService).getSlice(moveDefaultsSlice);

  #plan(
    source: ActiveEditorState,
    mode: EffectiveMove["mode"],
    rolledMarker: string,
  ): AsyncResult<Confirmed, SingleMoveRefusedError | UserAborted> {
    return attempt.in(this, async function* (this: SingleMoveService) {
      let allowBlockId = false;
      let planned = planItem(source, source.cursorLine, { mode, rolledMarker });
      if (planned.kind === "refused" && planned.reason === "block-id") {
        yield* this.#modals.open(confirmBlockLinkModal, {}).mapErr(() => new UserAborted(SOURCE));
        allowBlockId = true;
        planned = planItem(source, source.cursorLine, { mode, rolledMarker, allowBlockId });
      }
      if (planned.kind === "refused") {
        if (planned.reason === "block-id") throw new InvariantError("planItem refused a block id it was allowed");
        return yield* AsyncResult.err(new SingleMoveRefusedError(planned.reason));
      }
      const root = planned.plan.roots.at(0);
      if (root === undefined) throw new InvariantError("planItem planned no root");
      const confirmed: Confirmed = { root, allowBlockId };
      return confirmed;
    });
  }

  async #currentText(path: VaultPath): Promise<string | undefined> {
    const open = this.#workspace.openNoteText(path);
    if (open.isSome()) return open.value;
    const read = await this.#notes.read(path);
    return read.isOk() ? read.value : undefined;
  }

  // Planned again on the text as it is now, under the lock: a move queued behind another of the same
  // task would otherwise copy it a second time before its source check refused it.
  async #replan(
    path: VaultPath,
    confirmed: Confirmed,
    move: EffectiveMove,
    rolledMarker: string,
  ): Promise<SourcePlan | null> {
    const content = await this.#currentText(path);
    if (content === undefined) return null;
    const { root, allowBlockId } = confirmed;
    const again = planItem({ path, content }, root.line, { mode: move.mode, rolledMarker, allowBlockId });
    if (again.kind === "refused") return null;
    const now = again.plan.roots.at(0);
    const same =
      now?.line === root.line &&
      now.end === root.end &&
      now.lines.length === root.lines.length &&
      now.lines.every((line, index) => line === root.lines[index]);
    return same ? again.plan : null;
  }

  #ensureTarget(target: MoveTarget): AsyncResult<VaultPath, SingleMoveError> {
    const existing = target.path ?? this.#index.get(target.journalName, target.anchor).getOrUndefined();
    if (existing !== undefined) return AsyncResult.ok(existing);
    return this.#flows
      .invoke(EnsureJournalEntryFlow, { journalName: target.journalName, anchor: target.anchor }, { notify: false })
      .map(({ path }) => path);
  }

  async #rewriteSource(path: VaultPath, root: PlannedRoot, rewrite: SourceRewrite): Promise<SourceOutcome> {
    const edited = this.#workspace.replaceLinesInOpenNote(path, (content) => lineChange(content, root, rewrite));
    if (edited === "applied") return "done";
    if (edited === "refused") return "changed";
    // No open view holds the note, so nothing unsaved can be lost: the file is the source.
    let refused = false;
    const written = await this.#notes.process(path, (content) => {
      const outcome = rewriteSource(content, [root], rewrite);
      if ("reason" in outcome) {
        refused = true;
        return content;
      }
      return outcome.content;
    });
    if (written.isErr()) return "write-failed";
    return refused ? "changed" : "done";
  }

  #write(
    source: ActiveEditorState,
    target: MoveTarget,
    confirmed: Confirmed,
    move: EffectiveMove,
    marker: string,
  ): AsyncResult<SingleMoveReport, SingleMoveError> {
    return attempt.in(this, async function* (this: SingleMoveService) {
      const report = (outcome: SourceOutcome): SingleMoveReport => ({
        mode: move.mode,
        label: target.label,
        ...(target.noteletTitle !== undefined && { noteletTitle: target.noteletTitle }),
        outcome,
      });
      const plan = await this.#replan(source.path, confirmed, move, marker);
      if (plan === null) return report("nothing");
      const path = yield* this.#ensureTarget(target);
      // Only an existing note can be the source, and ensuring one writes nothing.
      if (path === source.path) return yield* AsyncResult.err(new SingleMoveRefusedError("same-note"));
      // The target goes first: a failure before the source is written leaves a duplicate, never a gap.
      yield* this.#notes.process(path, (content) => placeGroups(content, plan.block, move.targetHeading));
      const rewrite = sourceRewrite(move, marker);
      return report(rewrite === null ? "done" : await this.#rewriteSource(source.path, confirmed.root, rewrite));
    });
  }

  // Mode, stamp and heading are the target journal's: placement belongs to the note it lands in.
  move(source: ActiveEditorState, target: MoveTarget): AsyncResult<SingleMoveReport, SingleMoveError> {
    return attempt.in(this, async function* (this: SingleMoveService) {
      const config = yield* this.#journals
        .get(target.journalName)
        .okOrElse(() => new JournalNotFoundError(target.journalName));
      const move = effectiveMove(config.tasks.move, this.#defaults.state);
      const marker = this.#checkbox.state.rolledMarker;
      // The confirm stays outside the lock so a pending answer never holds up a roll into the journal.
      const confirmed = yield* this.#plan(source, move.mode, marker);
      return yield* this.#locks.run(target.journalName, () => this.#write(source, target, confirmed, move, marker));
    });
  }
}
