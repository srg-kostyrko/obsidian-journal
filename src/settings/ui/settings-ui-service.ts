import { computed, ref, type ComputedRef } from "vue";

import { inject } from "@/infrastructure/di";

import {
  DuplicateBlockKeyError,
  DuplicateSubpageKeyError,
  NotImplementedError,
  UnregisteredSubpageError,
} from "../errors";
import { DashboardBlockToken, SubpageToken } from "../tokens";

import type { AnySubpage, DashboardBlock, Subpage } from "./schema";

export interface SubpageFrame {
  readonly subpage: AnySubpage;
  readonly props: unknown;
}

export class SettingsUiService {
  readonly #blocks: readonly DashboardBlock[];
  readonly #subpageKeys: ReadonlySet<string>;
  readonly #stack = ref<readonly SubpageFrame[]>([]);
  readonly #current: ComputedRef<SubpageFrame | null>;

  constructor() {
    const blocks = [...inject(DashboardBlockToken)];
    const blockKeys = new Set<string>();
    for (const b of blocks) {
      if (blockKeys.has(b.key)) throw new DuplicateBlockKeyError(b.key);
      blockKeys.add(b.key);
    }
    blocks.sort((a, b) => a.order - b.order);
    this.#blocks = blocks;

    const subpages = inject(SubpageToken);
    const subpageKeys = new Set<string>();
    for (const s of subpages) {
      if (subpageKeys.has(s.key)) throw new DuplicateSubpageKeyError(s.key);
      subpageKeys.add(s.key);
    }
    this.#subpageKeys = subpageKeys;

    this.#current = computed(() => this.#stack.value.at(-1) ?? null);
  }

  get blocks(): readonly DashboardBlock[] {
    return this.#blocks;
  }

  get current(): ComputedRef<SubpageFrame | null> {
    return this.#current;
  }

  push<TProps>(subpage: Subpage<TProps>, _props: TProps): void {
    if (!this.#subpageKeys.has(subpage.key)) throw new UnregisteredSubpageError(subpage.key);
    throw new NotImplementedError();
  }

  pop(): void {
    throw new NotImplementedError();
  }

  reset(): void {
    throw new NotImplementedError();
  }
}
