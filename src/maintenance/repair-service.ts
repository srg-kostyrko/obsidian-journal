import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { NoteMetadataService, NotesService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult, InvariantError } from "@/infrastructure/result";
import { FRONTMATTER_NAME_KEY } from "@/journals/config";
import { FrontmatterService } from "@/journals/frontmatter";
import { JournalsIndex } from "@/journals/journals-index";
import { NoteConnectionService } from "@/journals/notes/note-connection";

import type { RepairAction } from "./findings";

const INDEX_SETTLE_TIMEOUT_MS = 2000;

export type RepairOutcome =
  | { kind: "repaired" }
  | { kind: "failed"; reason: "write-failed" | "still-rejected" | "still-claimed" | "contested"; message?: string };

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
  readonly #notes = inject(NotesService);
  readonly #metadata = inject(NoteMetadataService);
  readonly #frontmatter = inject(FrontmatterService);
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

  // The strip counterpart of #satisfied. clearMutator and disconnect both remove the claim key
  // whatever else they touch, so its absence from metadataCache is the one affirmative signal
  // that the write landed and Obsidian re-parsed it. An unparsed note reads as not-yet-cleared:
  // a strip is only a repair once the vault can be seen to have accepted it.
  #claimCleared(path: VaultPath): boolean {
    const metadata = this.#metadata.get(path);
    return metadata.isSome() && metadata.value.properties[FRONTMATTER_NAME_KEY] === undefined;
  }

  // A strip pushes no Intent, so #awaitIndexed sees nothing to wait for and resolves immediately
  // -- but a strip still reaches the vault only through processFrontMatter, which the caller's
  // re-scan reads back via metadataCache, not the write itself. An orphaned claim was never in the
  // index, so entryChanged (used above) has no signal for it either; metadataCache's own
  // "changed" event is the one signal that covers both the orphan and the duplicate-loser case.
  #awaitMetadataChanged(paths: readonly VaultPath[]): Promise<void> {
    // The listener attaches only after the whole write loop has run, so for an orphaned claim --
    // never in the index, nothing else waiting on it -- the event has often already fired. Without
    // this the batch idles out the full timeout on the path where that is most likely.
    const remaining = new Set(paths.filter((path) => !this.#claimCleared(path)));
    if (remaining.size === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        off();
        window.clearTimeout(timer);
        resolve();
      };
      const off = this.#notes.events.on("metadata-changed", (path) => {
        if (!this.#claimCleared(path)) return;
        remaining.delete(path);
        if (remaining.size === 0) finish();
      });
      const timer = window.setTimeout(finish, INDEX_SETTLE_TIMEOUT_MS);
    });
  }

  async #applyAll(actions: readonly RepairAction[]): Promise<RepairLogEntry[]> {
    // Paired positionally rather than re-matched by path afterwards: a batch can carry two
    // actions for the same path (a strip-claim and a rewrite, or two rewrites), and matching by
    // path alone would verify every entry for that path against whichever intent `find` hit first.
    const results: { entry: RepairLogEntry; intent?: Intent; stripped?: VaultPath }[] = [];
    const intents: Intent[] = [];
    const stripped: VaultPath[] = [];
    // Seeded from every anchor currently in the index, so a stale-range rewrite — by construction
    // a rewrite at the note's own existing anchor — finds its own slot already taken. Let a note
    // reclaim the anchor it already owns; only a different path contesting the anchor should fail.
    // After the scan's collision gate no *other* contest should reach here; if one does, the gate
    // has a bug and one of the two notes would otherwise have vanished from the calendar.
    const claimed = new Map<string, Set<AnchorString>>();
    const claim = (journalName: string, anchor: AnchorString, path: VaultPath): boolean => {
      let taken = claimed.get(journalName);
      if (!taken) {
        taken = new Set<AnchorString>();
        for (const [existing] of this.#index.entriesFor(journalName)) taken.add(existing);
        claimed.set(journalName, taken);
      }
      if (taken.has(anchor)) {
        const occupant = this.#index.entryByAnchor(journalName, anchor);
        if (!(occupant.isSome() && occupant.value.path === path)) return false;
      }
      taken.add(anchor);
      return true;
    };

    for (const action of actions) {
      if (action.repair.kind === "undecidable") continue;

      if (action.repair.kind === "strip-claim") {
        // disconnect() resolves the journal through the index, which is exactly what a stranded
        // duplicate loser or a rejected note is absent from -- it would fall back to clearing only
        // the five default keys and leave a custom-field journal's real keys behind. The action
        // already carries the claimed journal's name; use it directly when that journal still
        // exists. When it doesn't (the orphan case), nothing can know the field names it used.
        const cleared = this.#frontmatter.clearMutator(action.journalName);
        const result = cleared.isOk()
          ? await this.#notes.updateFrontmatter(action.path, cleared.value)
          : await this.#connection.disconnect(action.path);
        if (result.kind === "ok") stripped.push(action.path);
        results.push({
          entry: {
            path: action.path,
            journalName: action.journalName,
            outcome:
              result.kind === "err"
                ? { kind: "failed", reason: "write-failed", message: result.error.message }
                : { kind: "repaired" },
          },
          ...(result.kind === "ok" && { stripped: action.path }),
        });
        continue;
      }

      const anchor = action.repair.anchor;
      if (!claim(action.journalName, anchor, action.path)) {
        results.push({
          entry: {
            path: action.path,
            journalName: action.journalName,
            outcome: { kind: "failed", reason: "contested" },
          },
        });
        continue;
      }
      const result = await this.#connection.reanchor(action.journalName, action.path, { anchor });
      if (result.kind === "err") {
        results.push({
          entry: {
            path: action.path,
            journalName: action.journalName,
            outcome: { kind: "failed", reason: "write-failed", message: result.error.message },
          },
        });
        continue;
      }
      const intent: Intent = { path: action.path, journalName: action.journalName, anchor };
      intents.push(intent);
      results.push({
        entry: { path: action.path, journalName: action.journalName, outcome: { kind: "repaired" } },
        intent,
      });
    }

    // Both waits run concurrently: rewrites settle through the index, strips through
    // metadataCache directly, and the caller's re-scan must not run ahead of either.
    await Promise.all([this.#awaitIndexed(intents), this.#awaitMetadataChanged(stripped)]);

    const verified = results.map(({ entry, intent, stripped: strippedPath }) => {
      if (entry.outcome.kind === "failed") return entry;
      if (strippedPath !== undefined) {
        return this.#claimCleared(strippedPath)
          ? entry
          : { ...entry, outcome: { kind: "failed", reason: "still-claimed" } as const };
      }
      if (intent === undefined) return entry;
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
