import type { VaultPath } from "@/infrastructure/host";

const SELF_WRITE_TIMEOUT_MS = 5000;

export class SelfWriteGuard {
  // `number`, not `ReturnType<typeof window.setTimeout>`: `window`'s declared type is
  // `Window & typeof globalThis`, and once anything in the program pulls in Node's ambient
  // timer globals (any `@types/express` import does, transitively, via a `/// <reference
  // types="node" />` in its own .d.ts), `typeof globalThis`'s `setTimeout` competes with
  // `Window`'s and the derived type can resolve to `NodeJS.Timeout` instead of the `number`
  // this is actually assigned at runtime — Obsidian is a browser context.
  readonly #pending = new Map<VaultPath, number>();

  mark(path: VaultPath): void {
    this.release(path);
    this.#pending.set(
      path,
      window.setTimeout(() => this.#pending.delete(path), SELF_WRITE_TIMEOUT_MS),
    );
  }

  suppresses(path: VaultPath): boolean {
    return this.#pending.has(path);
  }

  release(path: VaultPath): void {
    const handle = this.#pending.get(path);
    if (handle !== undefined) window.clearTimeout(handle);
    this.#pending.delete(path);
  }
}
