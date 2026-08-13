import { readonly, ref } from "vue";

// Session-scoped: a reload-requiring change stays flagged until Obsidian restarts, and
// a restart inherently clears it — no persistence needed.
export class ReloadHintService {
  readonly #pending = ref(false);
  readonly pending = readonly(this.#pending);

  request(): void {
    this.#pending.value = true;
  }
}
