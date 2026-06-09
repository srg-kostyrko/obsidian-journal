import type { VaultPath } from "@/infrastructure/host";

const SELF_WRITE_TIMEOUT_MS = 5000;

export class SelfWriteGuard {
  readonly #pending = new Map<VaultPath, ReturnType<typeof window.setTimeout>>();

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
