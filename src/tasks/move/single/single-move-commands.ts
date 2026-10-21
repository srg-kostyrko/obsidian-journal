import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { UserAborted } from "@/infrastructure/flows";
import {
  basenameOf,
  CommandService,
  NoticeService,
  WorkspaceService,
  type ActiveEditorState,
} from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import type { AsyncResult } from "@/infrastructure/result";
import { NoJournalsError, OutOfTimelineError } from "@/journals/errors";
import { JournalsIndex } from "@/journals/journals-index";
import { SettingsService } from "@/settings";

import { checkboxSlice } from "../../providers/checkbox/slice";
import { SingleMoveRefusedError } from "../errors";
import { planItem } from "../plan";

import { MoveTargets } from "./containing";
import { MoveTargetPicker } from "./pick-target";
import { SingleMoveService, type SingleMoveReport } from "./single-move-service";

function targetText(report: SingleMoveReport): string {
  return m.tasks_move_target_row({
    label: report.label,
    journal: "",
    notelet: report.noteletTitle ?? "",
    hasJournal: "no",
    hasNotelet: report.noteletTitle === undefined ? "no" : "yes",
  });
}

function reportNotice(source: ActiveEditorState, report: SingleMoveReport): string {
  const noteName = basenameOf(source.path);
  switch (report.outcome) {
    case "done": {
      return m.tasks_move_done({ mode: report.mode, target: targetText(report) });
    }
    case "nothing": {
      return m.tasks_move_nothing();
    }
    case "unread": {
      return m.tasks_move_source_unread({ noteName });
    }
    case "changed": {
      return m.tasks_move_source_changed({ noteName, mode: report.mode });
    }
    case "write-failed": {
      return m.tasks_move_source_write_failed({ noteName, mode: report.mode });
    }
  }
}

function refusalNotice(reason: SingleMoveRefusedError["reason"]): string {
  switch (reason) {
    case "not-a-task": {
      return m.tasks_move_not_a_task();
    }
    case "rolled": {
      return m.tasks_move_already_rolled();
    }
    case "same-note": {
      return m.tasks_move_same_note();
    }
  }
}

export class SingleMoveCommands {
  readonly #commands = inject(CommandService);
  readonly #workspace = inject(WorkspaceService);
  readonly #notices = inject(NoticeService);
  readonly #index = inject(JournalsIndex);
  readonly #targets = inject(MoveTargets);
  readonly #picker = inject(MoveTargetPicker);
  readonly #mover = inject(SingleMoveService);
  readonly #checkbox = inject(SettingsService).getSlice(checkboxSlice);
  readonly #logger = inject(LoggerFactoryToken).named("move-task");

  constructor() {
    this.#commands.register({
      id: "move-task-to-containing-period",
      name: m.command_move_task_to_containing_period(),
      check: () => this.#workspace.isEditingActiveNote(),
      execute: () => void this.#toContaining(),
    });
    this.#commands.register({
      id: "move-task-to-period-note",
      name: m.command_move_task_to_period_note(),
      check: () => this.#workspace.isEditingActiveNote(),
      execute: () => void this.#toPeriodNote(),
    });
  }

  async #source(): Promise<ActiveEditorState | undefined> {
    const pressed = this.#workspace.activeEditorState().getOrUndefined();
    if (pressed === undefined) {
      this.#notices.show(m.tasks_move_needs_editor());
      return undefined;
    }
    // Commands register before the startup scan lands, and until then the index is empty rather than
    // authoritative: the note would read as no journal's. The note is the one pressed in, read again
    // for what was typed during the wait; if another note is active by then, the press still names its own.
    await this.#index.whenReady();
    const now = this.#workspace.activeEditorState().getOrUndefined();
    const source = now?.path === pressed.path ? now : pressed;
    // Refused before any picker opens, so the user is not asked where a line that cannot move should go.
    const planned = planItem(source, source.cursorLine, {
      mode: "copy",
      rolledMarker: this.#checkbox.state.rolledMarker,
    });
    if (planned.kind === "refused" && planned.reason !== "block-id") {
      this.#notices.show(refusalNotice(planned.reason));
      return undefined;
    }
    return source;
  }

  async #toContaining(): Promise<void> {
    const source = await this.#source();
    if (source === undefined) return;
    if (this.#index.entryByPath(source.path).isNone()) {
      this.#notices.show(m.tasks_move_not_journal_note());
      return;
    }
    const targets = this.#targets.containingTargets(source.path);
    if (targets.length === 0) {
      this.#notices.show(m.tasks_move_no_containing());
      return;
    }
    await this.#report(
      source,
      this.#picker.pickTarget(targets).flatMap((target) => this.#mover.move(source, target)),
    );
  }

  async #toPeriodNote(): Promise<void> {
    const source = await this.#source();
    if (source === undefined) return;
    await this.#report(
      source,
      this.#picker.pickPeriodTarget().flatMap((target) => this.#mover.move(source, target)),
    );
  }

  async #report(source: ActiveEditorState, moved: AsyncResult<SingleMoveReport, unknown>): Promise<void> {
    const result = await moved;
    if (result.isOk()) {
      this.#notices.show(reportNotice(source, result.value));
      return;
    }
    const error = result.error;
    if (error instanceof UserAborted) return;
    if (error instanceof SingleMoveRefusedError) {
      this.#notices.show(refusalNotice(error.reason));
      return;
    }
    if (error instanceof NoJournalsError) {
      this.#notices.show(m.common_no_journals_yet());
      return;
    }
    if (error instanceof OutOfTimelineError) {
      this.#notices.show(m.tasks_move_out_of_timeline());
      return;
    }
    this.#logger.error("moving a task failed", { path: source.path, error });
    this.#notices.show(m.tasks_move_failed());
  }
}
