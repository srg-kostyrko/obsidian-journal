import { computed, type ComputedRef } from "vue";

import { inject } from "@/infrastructure/di";
import type { Option } from "@/infrastructure/result";

import { JournalsRepository } from "./repository";

import type { JournalConfig } from "./config";

export class JournalsViewModel {
  readonly #repository: JournalsRepository;

  readonly journals: ComputedRef<JournalConfig[]>;
  readonly journalOptions: ComputedRef<{ value: string; label: string }[]>;
  readonly journalCount: ComputedRef<number>;

  constructor(repository: JournalsRepository = inject(JournalsRepository)) {
    this.#repository = repository;
    this.journals = computed(() => [...repository.find().list()]);
    this.journalOptions = computed(() => [...repository.find().options()]);
    this.journalCount = computed(() => repository.count());
  }

  getJournal(name: string): Option<JournalConfig> {
    return this.#repository.get(name);
  }

  isJournalNameAvailable(name: string, excludeCurrent?: string): boolean {
    if (excludeCurrent !== undefined && name === excludeCurrent) return true;
    return this.#repository.get(name).isNone();
  }
}
