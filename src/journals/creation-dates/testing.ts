import { createNanoEvents } from "nanoevents";

import { CalendarDate, type AnchorString } from "@/calendar";
import type { Subscribable, TypedEmitter } from "@/infrastructure/events";
import type { VaultPath } from "@/infrastructure/host";

import type { CreatedNote } from "./creation-date-index";

interface CreationDateEvents {
  changed: () => void;
}

interface FakeEntry {
  readonly path: VaultPath;
  readonly date: AnchorString;
  readonly periodNote: boolean;
}

/** Stands in for `CreationDateIndex` where a test needs creation counts without building them from the vault. */
export class FakeCreationDateIndex {
  readonly #entries = new Map<VaultPath, FakeEntry>();
  readonly #emitter: TypedEmitter<CreationDateEvents> = createNanoEvents();
  #ready = true;

  readonly events: Subscribable<CreationDateEvents> = this.#emitter;

  #inRange(start: CalendarDate, end: CalendarDate): FakeEntry[] {
    if (!this.#ready) return [];
    const from = start.toAnchor();
    const to = end.toAnchor();
    return [...this.#entries.values()].filter((entry) => entry.date >= from && entry.date <= to);
  }

  setReady(ready: boolean): void {
    this.#ready = ready;
    this.#emitter.emit("changed");
  }

  add(path: string, date: string, options: { periodNote?: boolean } = {}): void {
    this.#entries.set(path as VaultPath, {
      path: path as VaultPath,
      date: date as AnchorString,
      periodNote: options.periodNote ?? false,
    });
    this.#emitter.emit("changed");
  }

  isReady(): boolean {
    return this.#ready;
  }

  between(start: CalendarDate, end: CalendarDate): readonly CreatedNote[] {
    return this.#inRange(start, end).map((entry) => ({
      note: {
        path: entry.path,
        basename: entry.path.split("/").at(-1)?.replace(/\.md$/, "") ?? entry.path,
        folder: entry.path.split("/").slice(0, -1).join("/") as VaultPath,
        size: 0,
        ctime: 0,
        mtime: 0,
      },
      created: CalendarDate.fromAnchor(entry.date),
    }));
  }

  countBetween(start: CalendarDate, end: CalendarDate, options: { excludePeriodNotes: boolean }): number {
    return this.#inRange(start, end).filter((entry) => !(options.excludePeriodNotes && entry.periodNote)).length;
  }
}
