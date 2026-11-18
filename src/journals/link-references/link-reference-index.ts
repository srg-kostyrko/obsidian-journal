import { createNanoEvents } from "nanoevents";

import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import type { Subscribable, TypedEmitter } from "@/infrastructure/events";
import { NoteMetadataService, NotesService, type VaultPath } from "@/infrastructure/host";
import { TemplateEngine } from "@/templates";

import { CycleService } from "../cycle";
import { JournalsIndex } from "../journals-index";
import { NotePathService } from "../notes/note-path";
import { JournalsRepository } from "../repository";
import { JournalsEventsToken } from "../tokens";
import { periodEntryOf } from "../types";

import { UnresolvedLinkMatcher } from "./unresolved-link-matcher";

interface LinkReferenceEvents {
  changed: () => void;
}

const keyOf = (journalName: string, anchor: AnchorString): string => `${journalName}\0${anchor}`;

function sameKeys(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const key of a) if (!b.has(key)) return false;
  return true;
}

/** Which notes link to each journal period, by resolved link or by the text of an unresolved one. */
export class LinkReferenceIndex {
  readonly #metadata = inject(NoteMetadataService);
  readonly #notes = inject(NotesService);
  readonly #index = inject(JournalsIndex);
  readonly #journals = inject(JournalsRepository);
  readonly #journalEvents = inject(JournalsEventsToken);
  readonly #paths = inject(NotePathService);
  readonly #cycle = inject(CycleService);
  readonly #engine = inject(TemplateEngine);
  readonly #emitter: TypedEmitter<LinkReferenceEvents> = createNanoEvents();
  readonly #unsubscribes: (() => void)[] = [];

  readonly #bySource = new Map<VaultPath, ReadonlySet<string>>();
  readonly #byKey = new Map<string, Set<VaultPath>>();
  readonly #sourcesByTargetPath = new Map<VaultPath, Set<VaultPath>>();
  readonly #targetsBySource = new Map<VaultPath, ReadonlySet<VaultPath>>();
  #matcher: UnresolvedLinkMatcher | undefined;
  #changeScheduled = false;
  #rebuildScheduled = false;
  #disposed = false;

  readonly events: Subscribable<LinkReferenceEvents> = this.#emitter;

  #scheduleRebuild(): void {
    if (this.#rebuildScheduled) return;
    this.#rebuildScheduled = true;
    queueMicrotask(() => {
      this.#rebuildScheduled = false;
      if (!this.#disposed) this.#rebuild();
    });
  }

  #rebuild(): void {
    const journalNames = [...this.#journals.find().list()].map((config) => config.name);
    this.#matcher = new UnresolvedLinkMatcher(
      { engine: this.#engine, cycle: this.#cycle, paths: this.#paths },
      journalNames,
    );
    const sources = new Set(this.#metadata.linkSources());
    for (const known of this.#bySource.keys()) if (!sources.has(known)) this.#drop(known);
    for (const source of sources) this.#recompute(source);
  }

  #recompute(source: VaultPath): void {
    const matcher = this.#matcher;
    if (matcher === undefined) return;
    const { resolved, unresolved } = this.#metadata.linksFrom(source);
    const keys = new Set<string>();
    const targets = new Set<VaultPath>();
    for (const target of resolved) {
      if (target === source) continue;
      targets.add(target);
      const entry = this.#index.entryByPath(target).flatMap(periodEntryOf);
      if (entry.isSome()) keys.add(keyOf(entry.value.journalName, entry.value.anchor));
    }
    for (const text of unresolved) {
      const match = matcher.match(text.endsWith(".md") ? text.slice(0, -".md".length) : text);
      if (match.isSome()) keys.add(keyOf(match.value.journalName, match.value.anchor));
    }
    this.#setTargets(source, targets);
    this.#setKeys(source, keys);
  }

  #drop(source: VaultPath): void {
    this.#setTargets(source, new Set());
    this.#setKeys(source, new Set());
  }

  #setTargets(source: VaultPath, next: ReadonlySet<VaultPath>): void {
    const previous = this.#targetsBySource.get(source) ?? new Set<VaultPath>();
    for (const target of previous) {
      if (next.has(target)) continue;
      const sources = this.#sourcesByTargetPath.get(target);
      sources?.delete(source);
      if (sources?.size === 0) this.#sourcesByTargetPath.delete(target);
    }
    for (const target of next) {
      let sources = this.#sourcesByTargetPath.get(target);
      if (sources === undefined) {
        sources = new Set();
        this.#sourcesByTargetPath.set(target, sources);
      }
      sources.add(source);
    }
    if (next.size === 0) this.#targetsBySource.delete(source);
    else this.#targetsBySource.set(source, next);
  }

  #setKeys(source: VaultPath, next: ReadonlySet<string>): void {
    const previous = this.#bySource.get(source) ?? new Set<string>();
    if (sameKeys(previous, next)) return;
    for (const key of previous) {
      if (next.has(key)) continue;
      const sources = this.#byKey.get(key);
      sources?.delete(source);
      if (sources?.size === 0) this.#byKey.delete(key);
    }
    for (const key of next) {
      let sources = this.#byKey.get(key);
      if (sources === undefined) {
        sources = new Set();
        this.#byKey.set(key, sources);
      }
      sources.add(source);
    }
    if (next.size === 0) this.#bySource.delete(source);
    else this.#bySource.set(source, next);
    this.#scheduleChanged();
  }

  #scheduleChanged(): void {
    if (this.#changeScheduled) return;
    this.#changeScheduled = true;
    queueMicrotask(() => {
      this.#changeScheduled = false;
      if (!this.#disposed) this.#emitter.emit("changed");
    });
  }

  async initialize(): Promise<void> {
    await this.#index.whenReady();
    if (this.#disposed) return;
    this.#rebuild();
    this.#unsubscribes.push(
      this.#metadata.onLinksResolved((path) => this.#recompute(path)),
      this.#notes.events.on("deleted", (path) => this.#drop(path)),
      // Obsidian re-keys its link maps under the new path without firing "resolve" for it.
      this.#notes.events.on("renamed", ({ from, to }) => {
        this.#drop(from);
        this.#recompute(to);
      }),
      this.#index.events.on("entryChanged", ({ entry }) => {
        const sources = this.#sourcesByTargetPath.get(entry.path);
        if (sources === undefined) return;
        for (const source of sources) this.#recompute(source);
      }),
      ...(["created", "updated", "deleted", "renamed", "cloned"] as const).map((event) =>
        this.#journalEvents.on(event, () => this.#scheduleRebuild()),
      ),
    );
  }

  count(journalName: string, anchor: AnchorString): number {
    return this.#byKey.get(keyOf(journalName, anchor))?.size ?? 0;
  }

  [Symbol.dispose](): void {
    this.#disposed = true;
    for (const off of this.#unsubscribes) off();
    this.#unsubscribes.length = 0;
  }
}
