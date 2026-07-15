import { readonly, ref } from "vue";

// Session-scoped: a reload-requiring change stays flagged until Obsidian restarts, and
// a restart inherently clears it — no persistence needed (v2 persisted the flag only to
// reset it again on the next load).
export class ReloadHintService {
  readonly #pending = ref(false);
  readonly pending = readonly(this.#pending);

  request(): void {
    this.#pending.value = true;
  }
}
