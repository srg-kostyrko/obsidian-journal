import { TFile } from "obsidian";

import { inject } from "@/infrastructure/di";
import { InternalObsidianAppToken, NotesService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult } from "@/infrastructure/result";

import { FrontmatterService } from "./frontmatter";
import { JournalsIndex } from "./journals-index";

export class VaultSubscriptionService {
  readonly #notes = inject(NotesService);
  readonly #app = inject(InternalObsidianAppToken);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #index = inject(JournalsIndex);
  readonly #logger = inject(LoggerFactoryToken).named("vault-subscription");
  readonly #unsubscribes: (() => void)[] = [];

  initialize(): AsyncResult<void, never> {
    for (const path of this.#notes.allMarkdownNotes()) {
      this.#scan(path);
    }

    this.#unsubscribes.push(
      this.#notes.events.on("metadata-changed", (path) => this.#scan(path)),
      this.#notes.events.on("renamed", ({ from, to }) => this.#index.transferPath(from, to)),
      this.#notes.events.on("deleted", (path) => this.#index.unregister(path)),
    );

    return AsyncResult.ok();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    for (const off of this.#unsubscribes) off();
    this.#unsubscribes.length = 0;
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
}
