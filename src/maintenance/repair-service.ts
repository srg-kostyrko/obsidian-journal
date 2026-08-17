import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult, InvariantError } from "@/infrastructure/result";
import { JournalsIndex } from "@/journals/journals-index";
import { NoteConnectionService } from "@/journals/notes/note-connection";

import type { RepairAction } from "./findings";

const INDEX_SETTLE_TIMEOUT_MS = 2000;

export type RepairOutcome =
  { kind: "repaired" } | { kind: "failed"; reason: "write-failed" | "still-rejected" | "contested"; message?: string };

export interface RepairLogEntry {
  readonly path: VaultPath;
  readonly journalName: string;
  readonly outcome: RepairOutcome;
}

interface Intent {
  readonly path: VaultPath;
  readonly journalName: string;
  readonly anchor: AnchorString;
}

export class RepairService {
  readonly #connection = inject(NoteConnectionService);
  readonly #index = inject(JournalsIndex);
  readonly #logger = inject(LoggerFactoryToken).named("maintenance");

  #satisfied(intents: readonly Intent[]): boolean {
    return intents.every((intent) => {
      const entry = this.#index.entryByPath(intent.path);
      return entry.isSome() && entry.value.journalName === intent.journalName && entry.value.anchor === intent.anchor;
    });
  }

  // updateFrontmatter reaches the index only through Obsidian's metadata-changed event, so a run
  // cannot know whether its writes were accepted until the index catches up.
  #awaitIndexed(intents: readonly Intent[]): Promise<void> {
    if (intents.length === 0 || this.#satisfied(intents)) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        off();
        window.clearTimeout(timer);
        resolve();
      };
      const off = this.#index.events.on("entryChanged", () => {
        if (this.#satisfied(intents)) finish();
      });
      const timer = window.setTimeout(finish, INDEX_SETTLE_TIMEOUT_MS);
    });
  }

  async #applyAll(actions: readonly RepairAction[]): Promise<RepairLogEntry[]> {
    const log: RepairLogEntry[] = [];
    const intents: Intent[] = [];
    // After the scan's collision gate this should never refuse anything; if it does, the gate
    // has a bug and one of the two notes would otherwise have vanished from the calendar.
    const claimed = new Map<string, Set<AnchorString>>();
    const claim = (journalName: string, anchor: AnchorString): boolean => {
      let taken = claimed.get(journalName);
      if (!taken) {
        taken = new Set<AnchorString>();
        for (const [existing] of this.#index.entriesFor(journalName)) taken.add(existing);
        claimed.set(journalName, taken);
      }
      if (taken.has(anchor)) return false;
      taken.add(anchor);
      return true;
    };

    for (const action of actions) {
      if (action.repair.kind === "undecidable") continue;

      if (action.repair.kind === "strip-claim") {
        const result = await this.#connection.disconnect(action.path);
        log.push({
          path: action.path,
          journalName: action.journalName,
          outcome:
            result.kind === "err"
              ? { kind: "failed", reason: "write-failed", message: result.error.message }
              : { kind: "repaired" },
        });
        continue;
      }

      const anchor = action.repair.anchor;
      if (!claim(action.journalName, anchor)) {
        log.push({
          path: action.path,
          journalName: action.journalName,
          outcome: { kind: "failed", reason: "contested" },
        });
        continue;
      }
      const result = await this.#connection.reanchor(action.journalName, action.path, { anchor });
      if (result.kind === "err") {
        log.push({
          path: action.path,
          journalName: action.journalName,
          outcome: { kind: "failed", reason: "write-failed", message: result.error.message },
        });
        continue;
      }
      intents.push({ path: action.path, journalName: action.journalName, anchor });
      log.push({ path: action.path, journalName: action.journalName, outcome: { kind: "repaired" } });
    }

    await this.#awaitIndexed(intents);

    const verified = log.map((entry) => {
      const intent = intents.find((candidate) => candidate.path === entry.path);
      if (intent === undefined || entry.outcome.kind === "failed") return entry;
      return this.#satisfied([intent])
        ? entry
        : { ...entry, outcome: { kind: "failed", reason: "still-rejected" } as const };
    });

    const failed = verified.filter((entry) => entry.outcome.kind === "failed");
    this.#logger.info("maintenance repair run finished", {
      attempted: verified.length,
      repaired: verified.length - failed.length,
      failed: failed.length,
    });
    for (const entry of failed) {
      this.#logger.warn("maintenance repair failed", { path: entry.path, outcome: entry.outcome });
    }
    return verified;
  }

  apply(actions: readonly RepairAction[]): AsyncResult<RepairLogEntry[], never> {
    return AsyncResult.fromPromise(this.#applyAll(actions), () => {
      throw new InvariantError("maintenance repair never rejects");
    });
  }
}
