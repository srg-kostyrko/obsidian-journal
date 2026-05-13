import { match } from "ts-pattern";

import { DuplicateRegistrationError } from "./errors";
import { type Resolver, withResolutionContext } from "./inject";
import { type AnyTokenLike, tokenKind } from "./token";

import type { RegistrationEntry } from "./registration";

export class Slot {
  #value: unknown;
  #has = false;

  get has(): boolean {
    return this.#has;
  }

  get value(): unknown {
    return this.#value;
  }

  getOrCreate(resolver: Resolver, token: AnyTokenLike, factory: () => unknown): unknown {
    if (this.#has) return this.#value;
    this.#value = withResolutionContext(resolver, token, factory);
    this.#has = true;
    return this.#value;
  }

  async dispose(): Promise<void> {
    if (!this.#has) return;
    const value = this.#value;
    this.#value = undefined;
    this.#has = false;
    await disposeInstance(value);
  }
}

export class StoredEntry {
  entry: RegistrationEntry<unknown>;
  readonly slot = new Slot();
  readonly registrationIndex: number;

  constructor(entry: RegistrationEntry<unknown>, registrationIndex: number) {
    this.entry = entry;
    this.registrationIndex = registrationIndex;
  }
}

export interface BindingsRow {
  readonly token: AnyTokenLike;
  readonly stored: StoredEntry;
}

export class Bindings {
  readonly #map = new Map<AnyTokenLike, StoredEntry[]>();
  #counter = 0;

  commit(token: AnyTokenLike, entry: RegistrationEntry<unknown>): StoredEntry {
    const stored = new StoredEntry(entry, this.#counter++);
    const list = this.#map.get(token) ?? [];
    match(tokenKind(token))
      .with("single", () => {
        if (list.length > 0) throw new DuplicateRegistrationError(token);
        this.#map.set(token, [stored]);
      })
      .with("multi", () => {
        list.push(stored);
        this.#map.set(token, list);
      })
      .exhaustive();
    return stored;
  }

  lookup(token: AnyTokenLike): readonly StoredEntry[] | undefined {
    return this.#map.get(token);
  }

  all(): readonly BindingsRow[] {
    const rows: BindingsRow[] = [];
    for (const [token, list] of this.#map) {
      for (const stored of list) rows.push({ token, stored });
    }
    return rows;
  }

  clear(): void {
    this.#map.clear();
  }
}

export async function disposeSlots(slots: readonly Slot[]): Promise<unknown[]> {
  const errors: unknown[] = [];
  for (const slot of slots) {
    try {
      await slot.dispose();
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

async function disposeInstance(instance: unknown): Promise<void> {
  if (instance == null || (typeof instance !== "object" && typeof instance !== "function")) return;
  const asyncDispose = (instance as { [Symbol.asyncDispose]?: () => Promise<void> })[Symbol.asyncDispose];
  if (typeof asyncDispose === "function") {
    await asyncDispose.call(instance);
    return;
  }
  const syncDispose = (instance as { [Symbol.dispose]?: () => void })[Symbol.dispose];
  if (typeof syncDispose === "function") {
    syncDispose.call(instance);
  }
}
