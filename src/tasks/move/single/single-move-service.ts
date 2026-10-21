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
import { rewriteNote, type NoteWriters } from "../note-write";
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
  /**
   * "nothing": the task had already left or been stamped by the time the move ran; "unread": the source
   * could not be read again before the write. Neither writes anything.
   */
  readonly outcome: "done" | "nothing" | "unread" | "changed" | "write-failed";
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
  readonly #writers: NoteWriters = { workspace: this.#workspace, notes: this.#notes };

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
    // The task was picked in an editor, whose buffer is LF whatever the file's line endings.
    return read.isOk() ? read.value.replaceAll(/\r$/gmu, "") : undefined;
  }

  #planAt(path: VaultPath, content: string, line: number, move: EffectiveMove, rolledMarker: string, allow: boolean) {
    const planned = planItem({ path, content }, line, { mode: move.mode, rolledMarker, allowBlockId: allow });
    return planned.kind === "planned" ? planned.plan : null;
  }

  // Planned again on the text as it is now, under the lock: a move queued behind another of the same
  // task would otherwise copy it a second time before its source check refused it.
  #replan(
    path: VaultPath,
    content: string,
    confirmed: Confirmed,
    move: EffectiveMove,
    rolledMarker: string,
  ): SourcePlan | null {
    const { root, allowBlockId } = confirmed;
    const again = this.#planAt(path, content, root.line, move, rolledMarker, allowBlockId);
    const now = again?.roots.at(0);
    const same =
      now?.line === root.line &&
      now.end === root.end &&
      now.lines.length === root.lines.length &&
      now.lines.every((line, index) => line === root.lines[index]);
    return same ? again : null;
  }

  // Only the user can write the source while the creation prompt is up, since this move holds the
  // lock, so an edit confined to the task's own lines is taken as theirs and what moves is the task as
  // it reads now. A change outside them leaves the line number pointing at something unknown.
  #afterPrompt(
    path: VaultPath,
    planned: { readonly content: string; readonly plan: SourcePlan },
    content: string,
    confirmed: Confirmed,
    move: EffectiveMove,
    rolledMarker: string,
  ): SourcePlan | null {
    if (content === planned.content) return planned.plan;
    const { line, end } = confirmed.root;
    const was = planned.content.split("\n");
    const now = content.split("\n");
    const below = was.length - end - 1;
    const outside = (index: number): boolean => index < line || index >= now.length - below;
    const untouched = now.every((text, index) => {
      if (!outside(index)) return true;
      return text === (index < line ? was[index] : was[index - now.length + was.length]);
    });
    if (!untouched || now.length - below <= line) return null;
    const plan = this.#planAt(path, content, line, move, rolledMarker, confirmed.allowBlockId);
    return plan?.roots.at(0)?.end === now.length - below - 1 ? plan : null;
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
      const before = await this.#currentText(source.path);
      if (before === undefined) return report("unread");
      const planned = this.#replan(source.path, before, confirmed, move, marker);
      if (planned === null) return report("nothing");
      const path = yield* this.#ensureTarget(target);
      // Read once more: creating the target may have asked first, and the user can edit the task meanwhile.
      const after = await this.#currentText(source.path);
      if (after === undefined) return report("unread");
      const plan = this.#afterPrompt(source.path, { content: before, plan: planned }, after, confirmed, move, marker);
      const root = plan?.roots.at(0);
      if (plan === null || root === undefined) return report("nothing");
      // Only an existing note can be the source, and ensuring one writes nothing.
      if (path === source.path) return yield* AsyncResult.err(new SingleMoveRefusedError("same-note"));
      // The target goes first, and reaches disk first: a failure before the source is written leaves a
      // duplicate, never a gap.
      yield* rewriteNote(this.#writers, path, (content) => placeGroups(content, plan.block, move.targetHeading), {
        flush: true,
      });
      const rewrite = sourceRewrite(move, marker);
      return report(rewrite === null ? "done" : await this.#rewriteSource(source.path, root, rewrite));
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
      // The source journal too: a roll of it reads this note and could take the same task.
      const sourceJournal = this.#index.entryByPath(source.path).map((entry) => entry.journalName);
      const journals = [target.journalName, ...(sourceJournal.isSome() ? [sourceJournal.value] : [])];
      return yield* this.#locks.run(journals, () => this.#write(source, target, confirmed, move, marker));
    });
  }
}
