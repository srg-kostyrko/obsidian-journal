import { computed, type ComputedRef } from "vue";

import { inject } from "@/infrastructure/di";
import type { Option } from "@/infrastructure/result";

import { CommandsRepository } from "./repository";

import type { CommandConfig } from "./config";

export class CommandsViewModel {
  static fromRepository(repository: CommandsRepository): CommandsViewModel {
    return new CommandsViewModel(repository);
  }

  readonly #repository: CommandsRepository;

  readonly commands: ComputedRef<CommandConfig[]>;
  readonly commandIds: ComputedRef<string[]>;
  readonly commandCount: ComputedRef<number>;

  constructor(repository: CommandsRepository = inject(CommandsRepository)) {
    this.#repository = repository;
    this.commands = computed(() => [...repository.find().list()]);
    this.commandIds = computed(() => [...repository.find().ids()]);
    this.commandCount = computed(() => repository.count());
  }

  getCommand(id: string): Option<CommandConfig> {
    return this.#repository.get(id);
  }
}
