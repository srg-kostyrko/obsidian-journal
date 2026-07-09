import { TFile } from "obsidian";

import { inject } from "@/infrastructure/di";
import { InternalObsidianAppToken, NoteMetadataService, NotesService, WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult } from "@/infrastructure/result";
import { SettingsEventsToken } from "@/settings";

import { FrontmatterService } from "./frontmatter";
import { JournalsIndex } from "./journals-index";
import { JournalsEventsToken } from "./tokens";

export class VaultSubscriptionService {
  readonly #notes = inject(NotesService);
  readonly #app = inject(InternalObsidianAppToken);
  readonly #metadata = inject(NoteMetadataService);
  readonly #workspace = inject(WorkspaceService);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #index = inject(JournalsIndex);
  readonly #journalEvents = inject(JournalsEventsToken);
  readonly #settingsEvents = inject(SettingsEventsToken);
  readonly #logger = inject(LoggerFactoryToken).named("vault-subscription");
  readonly #unsubscribes: (() => void)[] = [];

  #rebuild(): void {
    for (const path of this.#notes.allMarkdownNotes()) {
      this.#scan(path);
    }
  }

  // The boot walk needs the file list complete (onLayoutReady — before it
  // getMarkdownFiles is empty) and every note's frontmatter parsed. metadataCache
  // resolves incrementally, so a note imported/synced before this launch reads as
  // unresolved at boot; walking then would unregister it as frontmatter-less. Wait
  // until every note is resolved — re-checking on each "resolved" batch — before the
  // first walk, exactly as DataMigrationService does.
  #rebuildWhenResolved(): void {
    if (this.#allNotesResolved()) {
      this.#rebuild();
      return;
    }
    const dispose = this.#metadata.onResolved(() => {
      if (!this.#allNotesResolved()) return;
      dispose();
      this.#rebuild();
    });
    this.#unsubscribes.push(dispose);
  }

  #allNotesResolved(): boolean {
    return this.#notes.allMarkdownNotes().every((path) => this.#metadata.get(path).isSome());
  }

  #scan(path: VaultPath): void {
    const fm = this.#readFrontmatter(path);
    if (!fm) {
      this.#index.unregister(path);
      return;
    }
    const entry = this.#frontmatter.parseEntry(path, fm);
    if (entry.isSome()) {
      this.#index.register(entry.value);
    } else {
      this.#index.unregister(path);
      this.#logger.debug("frontmatter not parseable", { path });
    }
  }

  #readFrontmatter(path: VaultPath): Record<string, unknown> | undefined {
    const file = this.#app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return undefined;
    return this.#app.metadataCache.getFileCache(file)?.frontmatter ?? undefined;
  }

  initialize(): AsyncResult<void, never> {
    this.#unsubscribes.push(
      this.#notes.events.on("metadata-changed", (path) => this.#scan(path)),
      this.#notes.events.on("renamed", ({ from, to }) => this.#index.transferPath(from, to)),
      this.#notes.events.on("deleted", (path) => this.#index.unregister(path)),
      // A deleted journal's notes may survive with their frontmatter intact (the "keep" delete
      // mode), so no vault event clears their index entries — drop them by journal name here.
      this.#journalEvents.on("deleted", (journalName) => this.#index.clearJournal(journalName)),
      // An external settings sync changes journal configs without any vault event, so
      // re-scan every note to reindex against the freshly loaded journals.
      this.#settingsEvents.on("reloaded", () => this.#rebuild()),
    );

    this.#workspace.onLayoutReady(() => this.#rebuildWhenResolved());

    return AsyncResult.ok();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    for (const off of this.#unsubscribes) off();
    this.#unsubscribes.length = 0;
  }
}
