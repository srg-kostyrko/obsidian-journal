import { computed, ref, type ComputedRef } from "vue";

import { inject } from "@/infrastructure/di";

import { DuplicateBlockKeyError, DuplicateSubpageKeyError, UnregisteredSubpageError } from "../errors";
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

  push<TProps>(subpage: Subpage<TProps>, props: TProps): void {
    if (!this.#subpageKeys.has(subpage.key)) throw new UnregisteredSubpageError(subpage.key);
    this.#stack.value = [...this.#stack.value, { subpage: subpage as AnySubpage, props }];
  }

  pop(): void {
    const stack = this.#stack.value;
    if (stack.length === 0) return;
    this.#stack.value = stack.slice(0, -1);
  }

  reset(): void {
    this.#stack.value = [];
  }
}
