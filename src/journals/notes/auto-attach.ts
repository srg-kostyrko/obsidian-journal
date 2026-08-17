import { inject } from "@/infrastructure/di";
import { NoteMetadataService, NotesService, WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult } from "@/infrastructure/result";

import { FRONTMATTER_NAME_KEY } from "../config";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { JournalsRepository } from "../repository";
import { TimelineService } from "../timeline";

import { NoteCreationService } from "./note-creation";
import { NotePathService } from "./note-path";
import { SelfWriteGuard } from "./self-write-guard";

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
  // metadata-changed instead; auto-attach follows the same rule. It subscribes at layout-ready,
  // after that service's own subscription, so a note that parses into a valid entry is in the
  // index by the time this runs and #handle's first guard drops it untouched.
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
    const result = await this.#creation.attachNote(match.name, path, match.metadata);
    if (result.isErr()) {
      this.#logger.error("auto-attach failed", { path, error: result.error });
    } else {
      this.#logger.info("auto-attach succeeded", { path, journal: match.name });
    }
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
          this.#handleWhenParsed(to);
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
