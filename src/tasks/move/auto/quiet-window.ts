import { inject } from "@/infrastructure/di";
import { NotesService } from "@/infrastructure/host";

export const QUIET_MS = 5000;
export const MAX_WAIT_MS = 60_000;

/** Waits for the vault to stop changing, as it does once a sync catch-up has landed. */
export class QuietWindow {
  readonly #notes = inject(NotesService);

  wait(): Promise<"quiet" | "busy"> {
    return new Promise<"quiet" | "busy">((resolve) => {
      let quiet = 0;
      const finish = (verdict: "quiet" | "busy"): void => {
        window.clearTimeout(quiet);
        window.clearTimeout(ceiling);
        for (const stop of stops) stop();
        resolve(verdict);
      };
      const restart = (): void => {
        window.clearTimeout(quiet);
        quiet = window.setTimeout(() => finish("quiet"), QUIET_MS);
      };
      const ceiling: number = window.setTimeout(() => finish("busy"), MAX_WAIT_MS);
      const stops = [
        this.#notes.events.on("created", restart),
        this.#notes.events.on("modified", restart),
        this.#notes.events.on("deleted", restart),
      ];
      restart();
    });
  }
}
