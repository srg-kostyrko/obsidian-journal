import { createNanoEvents } from "nanoevents";

import { inject } from "@/infrastructure/di";
import type { Subscribable, TypedEmitter } from "@/infrastructure/events";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { None, type Option, Some } from "@/infrastructure/result";

import { countNoteSize } from "./note-size";
import { NotesService } from "./notes-service";

import type { NoteSize, VaultPath } from "../types";

export interface NoteSizeEvents {
  "size-changed": (path: VaultPath) => void;
}

export class NoteSizeService {
  readonly #notes = inject(NotesService);
  readonly #logger = inject(LoggerFactoryToken).named("note-size");
  readonly #sizes = new Map<VaultPath, NoteSize>();
  readonly #pending = new Set<VaultPath>();
  readonly #generation = new Map<VaultPath, number>();
  readonly #emitter: TypedEmitter<NoteSizeEvents> = createNanoEvents();
  readonly events: Subscribable<NoteSizeEvents> = this.#emitter;

  constructor() {
    this.#notes.events.on("modified", (path) => this.#refresh(path));
    this.#notes.events.on("deleted", (path) => {
      this.#sizes.delete(path);
      this.#pending.delete(path);
      this.#bumpGeneration(path);
    });
    // A rename leaves content untouched, so the size moves with the path.
    this.#notes.events.on("renamed", ({ from, to }) => {
      const hit = this.#sizes.get(from);
      this.#sizes.delete(from);
      this.#pending.delete(from);
      this.#bumpGeneration(from);
      if (hit !== undefined) this.#sizes.set(to, hit);
    });
  }

  // Deleting the entry (rather than bumping it) would reset the sequence to 0, so
  // the next fill for this path would reuse generation 1 — the same number a still
  // in-flight fill from before the delete/rename may be holding. That in-flight fill
  // would then pass the "am I still current" check and both clobber #sizes with
  // stale content and delete #pending out from under the fresh fill. Bumping instead
  // guarantees every future fill for this path gets a generation no in-flight fill
  // could already hold.
  #bumpGeneration(path: VaultPath): number {
    const next = (this.#generation.get(path) ?? 0) + 1;
    this.#generation.set(path, next);
    return next;
  }

  // Only paths already in flight or cached are worth re-reading; anything else is a
  // note no visible cell has asked about. Bypasses #pending so a save during a cold
  // read still starts a fresh one — ordering is the generation counter's job.
  #refresh(path: VaultPath): void {
    if (!this.#sizes.has(path) && !this.#pending.has(path)) return;
    void this.#fill(path);
  }

  // Called as a floating promise, so it must not be able to reject: the emit below runs
  // subscribers synchronously and one of them re-evaluates decorations.
  async #fill(path: VaultPath): Promise<void> {
    const generation = this.#bumpGeneration(path);
    this.#pending.add(path);
    try {
      const result = await this.#notes.readCached(path);
      // A newer read superseded this one, so this content is the older of the two.
      if (this.#generation.get(path) !== generation) return;
      result.match({
        // Leaving the entry absent is the safe state, and the next get retries.
        err: () => {
          this.#logger.debug("failed to read note for sizing", { path });
        },
        ok: (content) => {
          const next = countNoteSize(content);
          const previous = this.#sizes.get(path);
          this.#sizes.set(path, next);
          // Frontmatter is stripped, so the plugin's own frontmatter writes produce an
          // identical count — announcing those would repaint every cell for nothing.
          if (previous?.words === next.words && previous.characters === next.characters) {
            return;
          }
          this.#emitter.emit("size-changed", path);
        },
      });
    } catch (error) {
      this.#logger.debug("failed to size note", { path, error });
    } finally {
      if (this.#generation.get(path) === generation) this.#pending.delete(path);
    }
  }

  // Absence is never zero: a miss returns None so a "less than" condition cannot
  // match a note that has simply not been read yet.
  get(path: VaultPath): Option<NoteSize> {
    const hit = this.#sizes.get(path);
    if (hit !== undefined) return new Some<NoteSize>(hit);
    // Collapses a miss storm — many cells asking for one path in one pass read once.
    if (!this.#pending.has(path)) void this.#fill(path);
    return new None<NoteSize>();
  }
}
