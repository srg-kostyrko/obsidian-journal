import { match } from "ts-pattern";
import { watch } from "vue";

import { CalendarDate } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { CommandService, WorkspaceService } from "@/infrastructure/host";
import type { CommandRegistration } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { Option } from "@/infrastructure/result";
import { CycleService, JournalsIndex, NoApplicableJournals, OpenDateFlow, journalConfigCollection } from "@/journals";
import type { JournalEntry } from "@/journals";
import { JournalLifecycleService } from "@/journals/settings/lifecycle";
import { SettingsService } from "@/settings";
import { ShelvesLifecycleService, shelvesCollection } from "@/shelves";

import { commandCollection } from "./config";
import { compoundShift, supportedTypes } from "./resolve";

import type { CommandConfig } from "./config";

interface CommandPlan {
  readonly anchor: AnchorString;
  readonly journalNames: readonly string[];
}

export class DynamicCommandRegistry {
  readonly #commands = inject(CommandService);
  readonly #settings = inject(SettingsService);
  readonly #flows = inject(Flows);
  readonly #workspace = inject(WorkspaceService);
  readonly #index = inject(JournalsIndex);
  readonly #cycle = inject(CycleService);
  readonly #lifecycle = inject(JournalLifecycleService);
  readonly #shelfLifecycle = inject(ShelvesLifecycleService);
  readonly #logger = inject(LoggerFactoryToken).named("dynamic-commands");
  readonly #registered = new Map<string, string>();

  initialize(): void {
    this.#reconcile();
    watch(this.#commandEntries(), () => this.#reconcile(), { deep: true, flush: "sync" });
    this.#lifecycle.events.on("journalRenamed", ({ oldName, newName }) => this.#onJournalRenamed(oldName, newName));
    this.#lifecycle.events.on("journalDeleted", ({ journalName }) => this.#onJournalDeleted(journalName));
    this.#shelfLifecycle.events.on("shelfRenamed", ({ oldName, newName }) => this.#onShelfRenamed(oldName, newName));
    this.#shelfLifecycle.events.on("shelfDeleted", ({ shelfName }) => this.#onShelfDeleted(shelfName));
  }

  #commandEntries(): Readonly<Record<string, CommandConfig>> {
    return this.#settings.getCollection(commandCollection).entries;
  }

  #reconcile(): void {
    const entries = this.#commandEntries();
    const toRemove = [...this.#registered.keys()].filter((id) => !(id in entries));
    for (const id of toRemove) {
      this.#commands.unregister(id);
      this.#registered.delete(id);
    }
    for (const [id, command] of Object.entries(entries)) {
      const serialized = JSON.stringify(command);
      if (this.#registered.get(id) === serialized) continue;
      if (this.#registered.has(id)) this.#commands.unregister(id);
      this.#commands.register(this.#registration(id, command));
      this.#registered.set(id, serialized);
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
    const config = this.#settings.getCollection(journalConfigCollection).get(rep);
    if (config === undefined) return Option.none();
    if (!supportedTypes(config.write.type).includes(command.type)) return Option.none();
    return this.#reference(command, journalNames).flatMap((reference) =>
      this.#anchor(command, rep, reference).map((resolved) => ({ anchor: resolved, journalNames })),
    );
  }

  #candidates(command: CommandConfig): string[] {
    const journals = this.#settings.getCollection(journalConfigCollection);
    return match(command.target)
      .with({ kind: "all" }, (target) =>
        Object.keys(journals.entries).filter((name) => journals.get(name)?.write.type === target.writeType),
      )
      .with({ kind: "journal" }, (target) => (journals.get(target.journalName) ? [target.journalName] : []))
      .with({ kind: "shelf" }, (target) => {
        const shelf = this.#settings.getCollection(shelvesCollection).get(target.shelfName);
        if (shelf === undefined) return [];
        return shelf.journals.filter((name) => journals.get(name)?.write.type === target.writeType);
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
    const collection = this.#settings.getCollection(commandCollection);
    for (const id of Object.keys(collection.entries)) {
      const command = collection.get(id);
      if (command?.target.kind === "journal" && command.target.journalName === oldName) {
        command.target.journalName = newName;
      }
    }
  }

  #onJournalDeleted(journalName: string): void {
    const collection = this.#settings.getCollection(commandCollection);
    for (const id of Object.keys(collection.entries)) {
      const command = collection.get(id);
      if (command?.target.kind === "journal" && command.target.journalName === journalName) {
        collection.remove(id);
      }
    }
  }

  #onShelfRenamed(oldName: string, newName: string): void {
    const collection = this.#settings.getCollection(commandCollection);
    for (const id of Object.keys(collection.entries)) {
      const command = collection.get(id);
      if (command?.target.kind === "shelf" && command.target.shelfName === oldName) {
        command.target.shelfName = newName;
      }
    }
  }

  #onShelfDeleted(shelfName: string): void {
    const collection = this.#settings.getCollection(commandCollection);
    for (const id of Object.keys(collection.entries)) {
      const command = collection.get(id);
      if (command?.target.kind === "shelf" && command.target.shelfName === shelfName) {
        collection.remove(id);
      }
    }
  }
}
