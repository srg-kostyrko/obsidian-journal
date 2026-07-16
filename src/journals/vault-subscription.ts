import { TFile } from "obsidian";

import { inject } from "@/infrastructure/di";
import { InternalObsidianAppToken, NoteMetadataService, NotesService, WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult } from "@/infrastructure/result";
import { SettingsEventsToken } from "@/settings";

import { CycleService } from "./cycle";
import { FrontmatterService } from "./frontmatter";
import { JournalsIndex } from "./journals-index";
import { JournalsRepository } from "./repository";
import { JournalsEventsToken } from "./tokens";

import type { JournalEntry } from "./types";

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
  readonly #cycle = inject(CycleService);
  readonly #journals = inject(JournalsRepository);
  readonly #unsubscribes: (() => void)[] = [];

  #rebuild(): void {
    for (const path of this.#notes.allMarkdownNotes()) {
      this.#scan(path, { reconcileCustom: false });
    }
    this.#reconcileCustomJournals();
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

  #scan(path: VaultPath, options: { reconcileCustom: boolean }): void {
    const fm = this.#readFrontmatter(path);
    if (!fm) {
      this.#index.unregister(path);
      return;
    }
    const entry = this.#frontmatter.parseEntry(path, fm);
    if (entry.isNone()) {
      this.#index.unregister(path);
      this.#logger.debug("frontmatter not parseable", { path });
      return;
    }
    const outcome = this.#index.register(entry.value);
    if (outcome === "collision") {
      this.#logger.warn("note shares an anchor with another note; not the canonical entry", { path });
    }
    if (options.reconcileCustom) this.#reconcileEntry(entry.value);
  }

  // Custom-cycle anchors depend on the whole index (extension chain), so a custom note can only be
  // validated once the index is complete: inline on metadata-changed, or in the rebuild's second pass.
  #reconcileEntry(entry: JournalEntry): void {
    const config = this.#journals.get(entry.journalName);
    if (config.isNone() || config.value.write.type !== "custom") return;
    const canonical = this.#cycle.isCanonicalAnchor(entry.journalName, entry.anchor);
    if (canonical.isSome() && canonical.value) return;
    this.#index.unregister(entry.path);
    this.#logger.debug("anchor off sequence", { path: entry.path });
  }

  #reconcileCustomJournals(): void {
    const customJournals = this.#journals
      .find()
      .filter((c) => c.write.type === "custom")
      .list();
    for (const config of customJournals) {
      const entries = [...this.#index.entriesFor(config.name)];
      if (entries.length === 0) continue;
      const anchors = entries.map(([anchor]) => anchor);
      let min = anchors[0];
      let max = anchors[0];
      for (const anchor of anchors) {
        if (anchor < min) min = anchor;
        if (anchor > max) max = anchor;
      }
      const valid = new Set(this.#cycle.intervalsInRange(config.name, min, max));
      for (const [anchor, path] of entries) {
        if (valid.has(anchor)) continue;
        this.#index.unregister(path);
        this.#logger.debug("anchor off sequence", { path });
      }
    }
  }

  #readFrontmatter(path: VaultPath): Record<string, unknown> | undefined {
    const file = this.#app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return undefined;
    return this.#app.metadataCache.getFileCache(file)?.frontmatter ?? undefined;
  }

  initialize(): AsyncResult<void, never> {
    this.#unsubscribes.push(
      this.#notes.events.on("metadata-changed", (path) => this.#scan(path, { reconcileCustom: true })),
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
