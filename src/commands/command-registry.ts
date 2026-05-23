import { match } from "ts-pattern";

import { CalendarDate } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { CommandService, WorkspaceService } from "@/infrastructure/host";
import type { CommandRegistration } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { Option } from "@/infrastructure/result";
import {
  CycleService,
  JournalsIndex,
  JournalsEventsToken,
  JournalsRepository,
  NoApplicableJournals,
  OpenDateFlow,
} from "@/journals";
import type { JournalEntry } from "@/journals";
import { ShelvesEventsToken, ShelvesRepository } from "@/shelves";

import { CommandsRepository } from "./repository";
import { compoundShift, supportedTypes } from "./resolve";
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
  readonly #index = inject(JournalsIndex);
  readonly #cycle = inject(CycleService);
  readonly #logger = inject(LoggerFactoryToken).named("dynamic-commands");
  readonly #registered = new Map<string, string>();
  readonly #commandsRepo = inject(CommandsRepository);
  readonly #commandsEvents = inject(CommandsEventsToken);
  readonly #journalsRepo = inject(JournalsRepository);
  readonly #journalsEvents = inject(JournalsEventsToken);
  readonly #shelvesRepo = inject(ShelvesRepository);
  readonly #shelvesEvents = inject(ShelvesEventsToken);

  initialize(): void {
    this.#reconcile();
    this.#commandsEvents.on("created", () => this.#reconcile());
    this.#commandsEvents.on("updated", () => this.#reconcile());
    this.#commandsEvents.on("deleted", () => this.#reconcile());
    this.#journalsEvents.on("renamed", (oldName, newName) => this.#onJournalRenamed(oldName, newName));
    this.#journalsEvents.on("deleted", (journalName) => this.#onJournalDeleted(journalName));
    this.#shelvesEvents.on("renamed", (oldName, newName) => this.#onShelfRenamed(oldName, newName));
    this.#shelvesEvents.on("deleted", (shelfName) => this.#onShelfDeleted(shelfName));
  }

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
      if (!present.has(id)) {
        this.#commands.unregister(id);
        this.#registered.delete(id);
      }
    }
  }

  #registration(id: string, command: CommandConfig): CommandRegistration {
    return {
      id,
      name: command.name,
      icon: command.icon,
      ribbon: command.showInRibbon,
      check: () => this.#plan(command).isSome(),
      execute: () => this.#run(command),
    };
  }

  #plan(command: CommandConfig): Option<CommandPlan> {
    const journalNames = this.#candidates(command);
    const [rep] = journalNames;
    if (rep === undefined) return Option.none();
    return this.#journalsRepo.get(rep).flatMap((config) => {
      if (!supportedTypes(config.write.type).includes(command.type)) return Option.none();
      return this.#reference(command, journalNames).flatMap((reference) =>
        this.#anchor(command, rep, reference).map((resolved) => ({ anchor: resolved, journalNames })),
      );
    });
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
      .with({ kind: "shelf" }, (target) => {
        const shelfOpt = this.#shelvesRepo.get(target.shelfName);
        if (shelfOpt.isNone()) return [];
        const shelf = shelfOpt.getOr({ name: target.shelfName, journals: [] });
        return shelf.journals.filter((name) =>
          this.#journalsRepo
            .get(name)
            .map((journal) => journal.write.type === target.writeType)
            .getOr(false),
        );
      })
      .exhaustive();
  }

  #reference(command: CommandConfig, candidates: readonly string[]): Option<CalendarDate> {
    return match(command.context)
      .with("today", () => Option.some(CalendarDate.today()))
      .with("open_note", () =>
        Option.some(
          this.#activeEntry()
            .map((entry) => CalendarDate.fromAnchor(entry.anchor))
            .getOr(CalendarDate.today()),
        ),
      )
      .with("only_open_note", () =>
        this.#activeEntry()
          .filter((entry) => candidates.includes(entry.journalName))
          .map((entry) => CalendarDate.fromAnchor(entry.anchor)),
      )
      .exhaustive();
  }

  #activeEntry(): Option<JournalEntry> {
    return this.#workspace.activeNote().flatMap((path) => this.#index.entryByPath(path));
  }

  #anchor(command: CommandConfig, journalName: string, reference: CalendarDate): Option<AnchorString> {
    return match(command.type)
      .with("same", () => this.#cycle.anchorOf(journalName, reference))
      .with("next", () =>
        this.#cycle.anchorOf(journalName, reference).flatMap((a) => this.#cycle.nextAnchor(journalName, a)),
      )
      .with("previous", () =>
        this.#cycle.anchorOf(journalName, reference).flatMap((a) => this.#cycle.previousAnchor(journalName, a)),
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
    if (!plan.isSome()) return;
    const result = await this.#flows.invoke(OpenDateFlow, {
      anchor: plan.value.anchor,
      journalNames: plan.value.journalNames,
      openMode: command.openMode,
      existingOnly: false,
    });
    if (result.kind === "err") {
      const { error } = result;
      if (error instanceof UserAborted || error instanceof NoApplicableJournals) return;
      this.#logger.error("dynamic command failed", { command: command.name, error });
    }
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
}
