import { inject } from "@/infrastructure/di";
import { NotesService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult } from "@/infrastructure/result";

import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { JournalsRepository } from "../repository";
import { TimelineService } from "../timeline";

import { NoteCreationService } from "./note-creation";
import { NotePathService } from "./note-path";

import type { JournalMetadata } from "../types";

export class AutoAttachService {
  readonly #notes = inject(NotesService);
  readonly #path = inject(NotePathService);
  readonly #timeline = inject(TimelineService);
  readonly #creation = inject(NoteCreationService);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #index = inject(JournalsIndex);
  readonly #journals = inject(JournalsRepository);
  readonly #logger = inject(LoggerFactoryToken).named("auto-attach");
  readonly #unsubscribes: (() => void)[] = [];

  initialize(): AsyncResult<void, never> {
    this.#unsubscribes.push(
      this.#notes.events.on("created", (note) => {
        void this.#handle(note.path);
      }),
      this.#notes.events.on("renamed", ({ to }) => {
        void this.#handle(to);
      }),
    );
    return AsyncResult.ok();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    for (const off of this.#unsubscribes) off();
    this.#unsubscribes.length = 0;
  }

  async #handle(path: VaultPath): Promise<void> {
    if (this.#creation.expects(path)) return;
    if (this.#index.entryByPath(path).isSome()) return;
    const matches: { name: string; metadata: JournalMetadata }[] = [];
    for (const name of this.#journals.find().ids()) {
      const candidate = this.#path.candidateFor(name, path);
      if (candidate.isNone()) continue;
      if (!this.#timeline.contains(name, candidate.value.anchor)) continue;
      const builtResult = this.#frontmatter.buildMetadata(name, candidate.value.anchor);
      if (builtResult.kind === "err") continue;
      const merged: JournalMetadata = {
        ...builtResult.value,
        ...(candidate.value.numbers ? { numbers: candidate.value.numbers } : {}),
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
}
