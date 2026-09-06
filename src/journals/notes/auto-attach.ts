import { inject } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { NoteMetadataService, NotesService, WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult } from "@/infrastructure/result";

import { FRONTMATTER_NAME_KEY } from "../config";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { GatherPromptAnswersFlow } from "../prompts/flows/gather-prompt-answers.flow";
import { PROMPT_PLACEHOLDER } from "../prompts/placeholder";
import { promptsInPath } from "../prompts/prompts-in-path";
import { JournalsRepository } from "../repository";
import { TimelineService } from "../timeline";

import { NoteCreationService } from "./note-creation";
import { NotePathService } from "./note-path";
import { SelfWriteGuard } from "./self-write-guard";
import { splitVaultPath } from "./vault-path";

import type { JournalMetadata } from "../types";

export class AutoAttachService {
  readonly #notes = inject(NotesService);
  readonly #metadata = inject(NoteMetadataService);
  readonly #workspace = inject(WorkspaceService);
  readonly #path = inject(NotePathService);
  readonly #timeline = inject(TimelineService);
  readonly #creation = inject(NoteCreationService);
  readonly #guard = inject(SelfWriteGuard);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #index = inject(JournalsIndex);
  readonly #journals = inject(JournalsRepository);
  readonly #flows = inject(Flows);
  readonly #logger = inject(LoggerFactoryToken).named("auto-attach");
  readonly #unsubscribes: (() => void)[] = [];
  readonly #awaitingParse = new Set<VaultPath>();

  // A note naming a journal this version can't resolve is already claimed: a legacy id the
  // note migration still has to rewrite, or a journal deleted in "keep notes" mode. Adopting
  // it by path would overwrite that claim — and for a legacy note it also hides it from the
  // migration, whose lookup is keyed by the old id, stranding its legacy keys forever.
  #claimedElsewhere(path: VaultPath): boolean {
    const metadata = this.#metadata.get(path);
    if (metadata.isNone()) return false;
    const claimed = metadata.value.properties[FRONTMATTER_NAME_KEY];
    return typeof claimed === "string" && this.#journals.get(claimed).isNone();
  }

  // Every decision below reads state Obsidian only has once it has parsed the note: the index
  // entry, the existing claim, and the endDate attachNote rebuilds through buildMetadata. A
  // "created" event arrives before any of that, so all three read empty and a note that already
  // carries a complete claim is adopted and rewritten — which for a custom interval destroys a
  // manually set end date, and that end date *is* the sequence every later interval steps from.
  // VaultSubscriptionService answers this by never acting on "created" and waiting for
  // metadata-changed instead; a created path waits the same way here. It subscribes at
  // layout-ready, after that service's own subscription, so a note that parses into a valid entry
  // is in the index by the time this runs and #handle's first guard drops it untouched.
  //
  // Renames must NOT wait: a rename changes no content, so Obsidian re-keys the cache without
  // re-parsing and no metadata-changed ever follows. A renamed path parked here would never be
  // adopted at all. They need no wait either — VaultSubscriptionService registers its
  // renamed -> transferPath handler at initialize, ahead of this one, so an already-connected
  // note carries its index entry across and #handle's guard sees it.
  #handleWhenParsed(path: VaultPath): void {
    if (this.#metadata.get(path).isSome()) {
      void this.#handle(path);
      return;
    }
    this.#awaitingParse.add(path);
  }

  async #handle(path: VaultPath): Promise<void> {
    if (this.#guard.suppresses(path)) return;
    if (this.#index.entryByPath(path).isSome()) return;
    if (this.#claimedElsewhere(path)) {
      this.#logger.debug("auto-attach: note claims an unknown journal", { path });
      return;
    }
    const matches: { name: string; metadata: JournalMetadata }[] = [];
    for (const name of this.#journals.find().ids()) {
      const candidate = this.#path.candidateFor(name, path);
      if (candidate.isNone()) continue;
      if (!this.#timeline.contains(name, candidate.value.anchor)) continue;
      const builtResult = this.#frontmatter.buildMetadata(name, candidate.value.anchor);
      if (builtResult.kind === "err") continue;
      const merged: JournalMetadata = {
        ...builtResult.value,
        ...(candidate.value.numbers && { numbers: candidate.value.numbers }),
      };
      matches.push({ name, metadata: merged });
    }
    if (matches.length === 0) {
      this.#logger.debug("auto-attach: no matches", { path });
      return;
    }
    if (matches.length > 1) {
      this.#logger.debug("auto-attach: ambiguous", { path, candidates: matches.map((m) => m.name) });
      return;
    }
    const [match] = matches;
    if (!match) return;
    // Only a plugin-authored link produces a name carrying the placeholder, so this is the one
    // unattended path that may ask. A pre-existing file adopted by pattern must never prompt.
    const config = this.#journals.get(match.name).getOrUndefined();
    let metadata = match.metadata;
    let target = path;
    if (config && promptsInPath(config).length > 0 && path.includes(PROMPT_PLACEHOLDER)) {
      const gathered = await this.#flows.invoke(
        GatherPromptAnswersFlow,
        { metadata, confirming: false },
        { notify: false },
      );
      if (gathered.isErr()) {
        await this.#discardCancelledPlaceholderNote(path);
        return;
      }
      // The modal is the only long await in this handler, so it is the only window in which a
      // rename of this same note can re-enter and move it out from under this pass. Whichever
      // pass then held the stale path would rename from a file that is no longer there.
      if (this.#notes.find(path).isNone()) return;
      metadata = { ...metadata, answers: { ...metadata.answers, ...gathered.value } };
      const renamed = this.#path.pathFor(match.name, metadata);
      if (renamed.isOk() && renamed.value !== path) {
        // Marked before the rename, not after: the rename re-enters #handle through the renamed
        // handler, and the filled name failing to invert is not a guarantee, only a coincidence.
        this.#guard.mark(renamed.value);
        const moved = await this.#notes.rename(path, renamed.value);
        if (moved.isErr()) {
          this.#guard.release(renamed.value);
          return;
        }
        target = renamed.value;
        await this.#removeEmptyPlaceholderFolder(path);
      }
    }
    const result = await this.#creation.attachNote(match.name, target, metadata);
    if (result.isErr()) {
      this.#logger.error("auto-attach failed", { path: target, error: result.error });
    } else {
      this.#logger.info("auto-attach succeeded", { path: target, journal: match.name });
    }
  }

  // Obsidian created this file the instant the link was clicked, and the prompt is the only
  // thing that would have given it a real name. Cancelling has to leave the user where they
  // started, so the plugin takes back what it caused to exist — but only a file that is still
  // empty and still carries the placeholder, the same two-part predicate the folder cleanup
  // below uses, and for the same reason: anything else is the user's. Trashed, not erased.
  async #discardCancelledPlaceholderNote(path: VaultPath): Promise<void> {
    if (!path.includes(PROMPT_PLACEHOLDER)) return;
    const content = await this.#notes.read(path);
    if (content.isErr() || content.value.trim() !== "") return;
    const removed = await this.#notes.delete(path);
    if (removed.isErr()) return;
    await this.#removeEmptyPlaceholderFolder(path);
  }

  async #removeEmptyPlaceholderFolder(from: VaultPath): Promise<void> {
    const [folder] = splitVaultPath(from);
    if (folder === "" || !folder.includes(PROMPT_PLACEHOLDER)) return;
    const contents = await this.#notes.listInFolder(folder as VaultPath);
    if (contents.isErr() || contents.value.length > 0) return;
    // listInFolder walks the whole subtree but only reports TFile, so a folder holding
    // nothing but an empty subfolder reads as empty here. Deleting it would take that
    // subfolder with it, which is not ours to remove.
    if (this.#notes.listFolders().some((candidate) => candidate.startsWith(`${folder}/`))) return;
    await this.#notes.deleteFolder(folder as VaultPath);
  }

  initialize(): AsyncResult<void, never> {
    // Obsidian replays "create" for every file already in the vault while it loads. Those are not
    // new notes: adopting them by path would run before metadataCache has parsed their frontmatter
    // (leaving #claimedElsewhere blind) and before the note migration has rewritten legacy ones,
    // whose journal key it would overwrite. Subscribing at layout-ready skips that burst; unlike
    // the index's readiness it always arrives, and fires immediately on a mid-session enable.
    this.#workspace.onLayoutReady(() => {
      this.#unsubscribes.push(
        this.#notes.events.on("created", (note) => {
          this.#handleWhenParsed(note.path);
        }),
        this.#notes.events.on("renamed", ({ from, to }) => {
          this.#awaitingParse.delete(from);
          void this.#handle(to);
        }),
        this.#notes.events.on("deleted", (path) => {
          this.#awaitingParse.delete(path);
        }),
        this.#notes.events.on("metadata-changed", (path) => {
          if (!this.#awaitingParse.delete(path)) return;
          void this.#handle(path);
        }),
      );
    });
    return AsyncResult.ok();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    for (const off of this.#unsubscribes) off();
    this.#unsubscribes.length = 0;
    this.#awaitingParse.clear();
  }
}
