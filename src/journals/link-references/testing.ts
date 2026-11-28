import { createNanoEvents } from "nanoevents";

import type { AnchorString } from "@/calendar";
import type { Subscribable, TypedEmitter } from "@/infrastructure/events";

interface LinkReferenceEvents {
  changed: () => void;
}

/** Stands in for `LinkReferenceIndex` where a test needs a link count without building one from the vault. */
export class FakeLinkReferenceIndex {
  readonly #counts = new Map<string, number>();
  readonly #emitter: TypedEmitter<LinkReferenceEvents> = createNanoEvents();

  readonly events: Subscribable<LinkReferenceEvents> = this.#emitter;

  count(journalName: string, anchor: AnchorString): number {
    return this.#counts.get(`${journalName}\0${anchor}`) ?? 0;
  }

  setCount(journalName: string, anchor: string, count: number): void {
    this.#counts.set(`${journalName}\0${anchor}`, count);
    this.#emitter.emit("changed");
  }
}
