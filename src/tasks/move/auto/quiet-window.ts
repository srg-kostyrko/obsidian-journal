import { inject } from "@/infrastructure/di";
import { NotesService } from "@/infrastructure/host";

export const QUIET_MS = 5000;
export const MAX_WAIT_MS = 60_000;

/** Waits for the vault to stop changing, as it does once a sync catch-up has landed. */
export class QuietWindow {
  readonly #notes = inject(NotesService);

  wait(signal?: AbortSignal): Promise<"quiet" | "busy" | "cancelled"> {
    return new Promise<"quiet" | "busy" | "cancelled">((resolve) => {
      if (signal?.aborted === true) {
        resolve("cancelled");
        return;
      }
      let quiet = 0;
      let ceiling = 0;
      const stops: (() => void)[] = [];
      const finish = (verdict: "quiet" | "busy" | "cancelled"): void => {
        window.clearTimeout(quiet);
        window.clearTimeout(ceiling);
        for (const stop of stops.splice(0)) stop();
        resolve(verdict);
      };
      const restart = (): void => {
        window.clearTimeout(quiet);
        quiet = window.setTimeout(() => finish("quiet"), QUIET_MS);
      };
      const cancel = (): void => finish("cancelled");
      ceiling = window.setTimeout(() => finish("busy"), MAX_WAIT_MS);
      signal?.addEventListener("abort", cancel, { once: true });
      stops.push(
        () => signal?.removeEventListener("abort", cancel),
        this.#notes.events.on("created", restart),
        this.#notes.events.on("modified", restart),
        this.#notes.events.on("renamed", restart),
        this.#notes.events.on("deleted", restart),
      );
      restart();
    });
  }
}
