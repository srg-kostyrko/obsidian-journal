import { match } from "ts-pattern";

import { CalendarDate } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { CommandService, NoticeService, WorkspaceService } from "@/infrastructure/host";
import type { CommandRegistration } from "@/infrastructure/host";
import { Option } from "@/infrastructure/result";
import {
  CycleService,
  JournalsIndex,
  JournalsEventsToken,
  JournalsRepository,
  OpenDateFlow,
  TimelineService,
} from "@/journals";
import type { JournalEntry } from "@/journals";
import { SettingsEventsToken } from "@/settings";
import { ShelvesEventsToken, ShelvesRepository } from "@/shelves";

import { CommandsRepository } from "./repository";
import { compoundShift, isAvailableType, supportedTypes } from "./resolve";
import { CommandsEventsToken } from "./tokens";

import type { CommandConfig } from "./config";

interface CommandPlan {
  readonly anchor: AnchorString;
  readonly journalNames: readonly string[];
}

export class DynamicCommandRegistry {
  readonly #commands = inject(CommandService);
  readonly #flows = inject(Flows);
  readonly #workspace = inject(WorkspaceService);
  readonly #notices = inject(NoticeService);
  readonly #index = inject(JournalsIndex);
  readonly #cycle = inject(CycleService);
  readonly #timeline = inject(TimelineService);
  readonly #registered = new Map<string, string>();
  readonly #commandsRepo = inject(CommandsRepository);
  readonly #commandsEvents = inject(CommandsEventsToken);
  readonly #journalsRepo = inject(JournalsRepository);
  readonly #journalsEvents = inject(JournalsEventsToken);
  readonly #shelvesRepo = inject(ShelvesRepository);
  readonly #shelvesEvents = inject(ShelvesEventsToken);
  readonly #settingsEvents = inject(SettingsEventsToken);

  #reconcile(): void {
    const present = new Set<string>();
    for (const [id, command] of this.#commandsRepo.find().entries()) {
      present.add(id);
      const serialized = JSON.stringify(command);
      if (this.#registered.get(id) === serialized) continue;
      if (this.#registered.has(id)) this.#commands.unregister(id);
      this.#commands.register(this.#registration(id, command));
      this.#registered.set(id, serialized);
    }
    for (const id of this.#registered.keys()) {
      if (present.has(id)) continue;
      this.#commands.unregister(id);
      this.#registered.delete(id);
    }
  }

  #registration(id: string, command: CommandConfig): CommandRegistration {
    return {
      id,
      name: this.#paletteName(command),
      icon: command.icon,
      ribbon: command.showInRibbon,
      check: () => this.#listable(command),
      execute: () => this.#run(command),
    };
  }

  // The palette lists every journal's commands side by side; the owning journal/shelf
  // prefix is what disambiguates same-named commands across owners (v2 format).
  #paletteName(command: CommandConfig): string {
    return match(command.target)
      .with({ kind: "journal" }, (target) =>
        m.command_palette_journal_name({ journal: target.journalName, name: command.name }),
      )
      .with({ kind: "shelf" }, (target) =>
        m.command_palette_shelf_name({ shelf: target.shelfName, name: command.name }),
      )
      .with({ kind: "all" }, () => command.name)
      .exhaustive();
  }

  #targetJournals(command: CommandConfig): Option<readonly string[]> {
    const journalNames = this.#candidates(command);
    const [rep] = journalNames;
    if (rep === undefined) return Option.none();
    return this.#journalsRepo
      .get(rep)
      .filter((config) => supportedTypes(config.write.type).includes(command.type))
      .map(() => journalNames);
  }

  #plan(command: CommandConfig): Option<CommandPlan> {
    return this.#targetJournals(command).flatMap((journalNames) =>
      this.#reference(command).flatMap((reference) =>
        // Listing and running must share one predicate. OpenDateFlow drops journals whose
        // timeline excludes the anchor, so planning without that filter lets a command list in
        // the palette, run, and end in NoApplicableJournals — a flow error that never reaches
        // the notice below. v2 gated availability and execution on the same check.
        this.#anchor(command, journalNames, reference).flatMap((resolved) => {
          const inTimeline = journalNames.filter((name) => this.#timeline.contains(name, resolved));
          if (inTimeline.length === 0) return Option.none<CommandPlan>();
          return Option.some<CommandPlan>({ anchor: resolved, journalNames: inTimeline });
        }),
      ),
    );
  }

  #listable(command: CommandConfig): boolean {
    if (!isAvailableType(command.type)) return this.#plan(command).isSome();
    // An available-type command lists whenever it has a reference date to search from: whether
    // a note exists in that direction is answered by running it, not by hiding it.
    return this.#targetJournals(command).isSome() && this.#reference(command).isSome();
  }

  #unavailableNotice(command: CommandConfig): string {
    const journalNames = this.#targetJournals(command);
    if (!journalNames.isSome()) return m.command_open_unavailable();
    if (this.#reference(command).isNone()) return m.command_open_needs_active_note();
    return match(command.type)
      .with("previous_available", () => m.command_open_no_previous())
      .with("next_available", () => m.command_open_no_next())
      .otherwise(() => m.command_open_unavailable());
  }

  #candidates(command: CommandConfig): string[] {
    return match(command.target)
      .with({ kind: "all" }, (target) =>
        [...this.#journalsRepo.find().entries()]
          .filter(([, journal]) => journal.write.type === target.writeType)
          .map(([name]) => name),
      )
      .with({ kind: "journal" }, (target) =>
        this.#journalsRepo.get(target.journalName).isSome() ? [target.journalName] : [],
      )
      .with({ kind: "shelf" }, (target) =>
        this.#shelvesRepo
          .get(target.shelfName)
          .map((shelf) =>
            shelf.journals.filter((name) =>
              this.#journalsRepo
                .get(name)
                .map((journal) => journal.write.type === target.writeType)
                .getOr(false),
            ),
          )
          .getOr([] as string[]),
      )
      .exhaustive();
  }

  // Any journal note dates the command, not just one of its own target journals: the open note
  // supplies a date, and each target journal answers for the period of its own granularity
  // containing it — a "next month" command run from a daily note means the month that day sits in.
  #reference(command: CommandConfig): Option<CalendarDate> {
    return match(command.context)
      .with("today", () => Option.some(CalendarDate.today()))
      .with("open_note", () =>
        Option.some(
          this.#activeEntry()
            .map((entry) => CalendarDate.fromAnchor(entry.anchor))
            .getOr(CalendarDate.today()),
        ),
      )
      .with("only_open_note", () => this.#activeEntry().map((entry) => CalendarDate.fromAnchor(entry.anchor)))
      .exhaustive();
  }

  #activeEntry(): Option<JournalEntry> {
    return this.#workspace.activeNote().flatMap((path) => this.#index.entryByPath(path));
  }

  #anchor(command: CommandConfig, journalNames: readonly string[], reference: CalendarDate): Option<AnchorString> {
    const [journalName] = journalNames;
    if (journalName === undefined) return Option.none();
    return match(command.type)
      .with("same", () => this.#cycle.anchorOf(journalName, reference))
      .with("next", () =>
        this.#cycle.anchorOf(journalName, reference).flatMap((a) => this.#cycle.nextAnchor(journalName, a)),
      )
      .with("previous", () =>
        this.#cycle.anchorOf(journalName, reference).flatMap((a) => this.#cycle.previousAnchor(journalName, a)),
      )
      .with("previous_available", "next_available", (type) =>
        this.#index.findNearestExisting(
          journalNames,
          reference.toAnchor(),
          type === "previous_available" ? "previous" : "next",
        ),
      )
      .with(
        "same_next_week",
        "same_previous_week",
        "same_next_month",
        "same_previous_month",
        "same_next_year",
        "same_previous_year",
        (type) => {
          const shift = compoundShift(type);
          if (shift === null) return Option.none<AnchorString>();
          return this.#cycle.anchorOf(journalName, reference.shift(shift.amount, shift.unit));
        },
      )
      .exhaustive();
  }

  async #run(command: CommandConfig): Promise<void> {
    const plan = this.#plan(command);
    if (!plan.isSome()) {
      this.#notices.show(this.#unavailableNotice(command));
      return;
    }
    await this.#flows.invoke(
      OpenDateFlow,
      {
        anchor: plan.value.anchor,
        journalNames: plan.value.journalNames,
        openMode: command.openMode,
        existingOnly: isAvailableType(command.type),
      },
      { context: { command: command.name } },
    );
  }

  #onJournalRenamed(oldName: string, newName: string): void {
    for (const [id, command] of this.#commandsRepo.find().entries()) {
      if (command.target.kind === "journal" && command.target.journalName === oldName) {
        this.#commandsRepo.update(id, { target: { ...command.target, journalName: newName } });
      }
    }
  }

  #onJournalDeleted(journalName: string): void {
    for (const [id, command] of this.#commandsRepo.find().entries()) {
      if (command.target.kind === "journal" && command.target.journalName === journalName) {
        this.#commandsRepo.delete(id);
      }
    }
  }

  #onShelfRenamed(oldName: string, newName: string): void {
    for (const [id, command] of this.#commandsRepo.find().entries()) {
      if (command.target.kind === "shelf" && command.target.shelfName === oldName) {
        this.#commandsRepo.update(id, { target: { ...command.target, shelfName: newName } });
      }
    }
  }

  #onShelfDeleted(shelfName: string): void {
    for (const [id, command] of this.#commandsRepo.find().entries()) {
      if (command.target.kind === "shelf" && command.target.shelfName === shelfName) {
        this.#commandsRepo.delete(id);
      }
    }
  }

  initialize(): void {
    this.#reconcile();
    this.#commandsEvents.on("created", () => this.#reconcile());
    this.#commandsEvents.on("updated", () => this.#reconcile());
    this.#commandsEvents.on("deleted", () => this.#reconcile());
    this.#journalsEvents.on("renamed", (oldName, newName) => this.#onJournalRenamed(oldName, newName));
    this.#journalsEvents.on("deleted", (journalName) => this.#onJournalDeleted(journalName));
    this.#shelvesEvents.on("renamed", (oldName, newName) => this.#onShelfRenamed(oldName, newName));
    this.#shelvesEvents.on("deleted", (shelfName) => this.#onShelfDeleted(shelfName));
    // An external settings sync rewrites the collections without firing repository
    // events, so re-reconcile every registration against the freshly loaded data.
    this.#settingsEvents.on("reloaded", () => this.#reconcile());
  }
}
