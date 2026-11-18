import { createNanoEvents } from "nanoevents";
import { watch, type WatchStopHandle } from "vue";

import { Calendar, type AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import type { Subscribable, TypedEmitter } from "@/infrastructure/events";
import { basenameOf, NoteMetadataService, NotesService, type VaultPath } from "@/infrastructure/host";
import type { Option } from "@/infrastructure/result";
import { SettingsEventsToken } from "@/settings";
import { TemplateEngine } from "@/templates";

import { CycleService } from "../cycle";
import { JournalsIndex } from "../journals-index";
import { NotePathService } from "../notes/note-path";
import { JournalsRepository } from "../repository";
import { isNotelet, periodEntryOf, type IndexedNote } from "../types";

import { UnresolvedLinkMatcher } from "./unresolved-link-matcher";

interface LinkReferenceEvents {
  changed: () => void;
}

// The journal edit form writes naming fields straight into the stored config on every keystroke,
// and each rebuild walks every link in the vault — so wait for the typing to pause.
export const NAMING_REBUILD_DEBOUNCE_MS = 250;

type Match = Option<{ journalName: string; anchor: AnchorString }>;

const EARLIEST = "0000-01-01" as AnchorString;
const LATEST = "9999-12-31" as AnchorString;

const keyOf = (journalName: string, anchor: AnchorString): string => `${journalName}\0${anchor}`;

function addTo<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  let values = map.get(key);
  if (values === undefined) {
    values = new Set();
    map.set(key, values);
  }
  values.add(value);
}

function removeFrom<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  const values = map.get(key);
  values?.delete(value);
  if (values?.size === 0) map.delete(key);
}

function sameMatch(a: Match, b: Match): boolean {
  if (a.isNone() || b.isNone()) return a.isNone() && b.isNone();
  return a.value.journalName === b.value.journalName && a.value.anchor === b.value.anchor;
}

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
  readonly #settingsEvents = inject(SettingsEventsToken);
  readonly #calendar = inject(Calendar);
  readonly #paths = inject(NotePathService);
  readonly #cycle = inject(CycleService);
  readonly #engine = inject(TemplateEngine);
  readonly #emitter: TypedEmitter<LinkReferenceEvents> = createNanoEvents();
  readonly #unsubscribes: (() => void)[] = [];

  readonly #bySource = new Map<VaultPath, ReadonlySet<string>>();
  readonly #byKey = new Map<string, Set<VaultPath>>();
  readonly #sourcesByTargetPath = new Map<VaultPath, Set<VaultPath>>();
  readonly #targetsBySource = new Map<VaultPath, ReadonlySet<VaultPath>>();
  readonly #sourcesByText = new Map<string, Set<VaultPath>>();
  readonly #textsBySource = new Map<VaultPath, ReadonlySet<string>>();
  #matcher: UnresolvedLinkMatcher | undefined;
  // Matching renders and inverts every journal's naming, and the same date is linked from many
  // notes; the answers hold exactly as long as the matcher they came from.
  #matches = new Map<string, Match>();
  // The memo read backwards, so a note connected to or leaving a period re-checks exactly the
  // sources whose link text names it.
  #textsByKey = new Map<string, Set<string>>();
  // Each custom interval's stored end where it differs from the duration's, keyed like a period.
  // Kept so an end moving back to the default — which leaves nothing on the new entry to tell it
  // apart from an untouched note — is still seen as a move.
  #movedEnds = new Map<string, AnchorString>();
  // Text that names no period comes to name one only when a custom interval's end moves, so its
  // sources need finding only while some journal is custom; skipping it keeps the build cheap.
  #hasCustomJournal = false;
  #stopNamingWatch: WatchStopHandle | undefined;
  #rebuildTimer: number | undefined;
  #changeScheduled = false;
  #disposed = false;

  readonly events: Subscribable<LinkReferenceEvents> = this.#emitter;

  // Everything the matcher reads to turn link text into a period: each journal's naming and the
  // installed week grid. Reading the grid through Calendar ties this to the grid actually installed,
  // which CalendarSettingsBridge does a tick after the slice write — re-anchoring before then would
  // answer for the old grid.
  #namingSignature(): string {
    const journals = [...this.#journals.find().list()].map((config) => [
      config.name,
      config.write,
      config.nameTemplate,
      config.folder,
      config.dateFormat,
      config.numbering,
      config.prompts,
      config.timeline.start,
    ]);
    return JSON.stringify([this.#calendar.installedWeek(), journals]);
  }

  #debounceRebuild(): void {
    if (this.#rebuildTimer !== undefined) window.clearTimeout(this.#rebuildTimer);
    this.#rebuildTimer = window.setTimeout(() => {
      this.#rebuildTimer = undefined;
      if (!this.#disposed) this.#rebuild();
    }, NAMING_REBUILD_DEBOUNCE_MS);
  }

  #rebuild(): void {
    const journalNames = [...this.#journals.find().list()].map((config) => config.name);
    this.#matcher = new UnresolvedLinkMatcher(
      { engine: this.#engine, cycle: this.#cycle, paths: this.#paths },
      journalNames,
    );
    this.#matches = new Map();
    this.#textsByKey = new Map();
    this.#movedEnds = new Map();
    this.#hasCustomJournal = journalNames.some((journalName) => this.#isCustom(journalName));
    for (const journalName of journalNames) {
      if (!this.#isCustom(journalName)) continue;
      const anchors = this.#index.getRange(journalName, EARLIEST, LATEST).keys();
      for (const anchor of anchors) {
        const end = this.#movedEndAt(journalName, anchor);
        if (end !== undefined) this.#movedEnds.set(keyOf(journalName, anchor), end);
      }
    }
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
      // Only a markdown note can be a period note; attachments would only grow the bookkeeping.
      if (target === source || !target.endsWith(".md")) continue;
      targets.add(target);
      const entry = this.#index.entryByPath(target).flatMap(periodEntryOf);
      if (entry.isSome()) keys.add(keyOf(entry.value.journalName, entry.value.anchor));
    }
    const texts = new Set<string>();
    for (const text of unresolved) {
      const linkText = text.endsWith(".md") ? text.slice(0, -".md".length) : text;
      const match = this.#matchOf(matcher, linkText);
      if (match.isSome() || this.#hasCustomJournal) texts.add(linkText);
      if (match.isSome() && this.#leadsToPeriod(linkText, match.value.journalName, match.value.anchor)) {
        keys.add(keyOf(match.value.journalName, match.value.anchor));
      }
    }
    this.#setTargets(source, targets);
    this.#setTexts(source, texts);
    this.#setKeys(source, keys);
  }

  #matchOf(matcher: UnresolvedLinkMatcher, linkText: string): Match {
    const known = this.#matches.get(linkText);
    if (known !== undefined) return known;
    const match = matcher.match(linkText);
    this.#matches.set(linkText, match);
    if (match.isSome()) addTo(this.#textsByKey, keyOf(match.value.journalName, match.value.anchor), linkText);
    return match;
  }

  // Once a period has a note, only links that lead to it count, and a broken link merely naming
  // the date leads nowhere. The exception is text naming that very note: Obsidian resolves it to
  // that note, but its link maps can catch up after the index has registered a new note, and
  // counting it bridges that gap instead of the count dipping to zero on every note created.
  #leadsToPeriod(linkText: string, journalName: string, anchor: AnchorString): boolean {
    const owner = this.#index.get(journalName, anchor);
    if (owner.isNone()) return true;
    const path = owner.value;
    return linkText.includes("/") ? path === `${linkText}.md` : basenameOf(path) === linkText;
  }

  #followEntry(entry: IndexedNote): void {
    const affected = new Set(this.#sourcesByTargetPath.get(entry.path));
    if (!isNotelet(entry)) {
      const texts = this.#textsByKey.get(keyOf(entry.journalName, entry.anchor)) ?? new Set<string>();
      for (const text of texts) this.#addSourcesOf(text, affected);
      this.#followIntervalEnd(entry.journalName, entry.anchor, affected);
    }
    for (const source of affected) this.#recompute(source);
  }

  #isCustom(journalName: string): boolean {
    const config = this.#journals.get(journalName);
    return config.isSome() && config.value.write.type === "custom";
  }

  #movedEndAt(journalName: string, anchor: AnchorString): AnchorString | undefined {
    const stored = this.#index.entryByAnchor(journalName, anchor).getOrUndefined()?.endDate;
    if (stored === undefined) return undefined;
    const fallback = this.#cycle.defaultEndOf(journalName, anchor).getOrUndefined();
    return fallback?.toAnchor() === stored ? undefined : stored;
  }

  // A custom interval's stored end decides where every later interval of its journal starts, so it
  // decides which dates name a period. Each remembered answer is asked again of that journal alone.
  #followIntervalEnd(journalName: string, anchor: AnchorString, affected: Set<VaultPath>): void {
    const matcher = this.#matcher;
    if (matcher === undefined || !this.#isCustom(journalName)) return;
    const key = keyOf(journalName, anchor);
    const end = this.#movedEndAt(journalName, anchor);
    if (end === this.#movedEnds.get(key)) return;
    if (end === undefined) this.#movedEnds.delete(key);
    else this.#movedEnds.set(key, end);
    for (const [text, previous] of this.#matches) {
      const next = matcher.rematch(text, journalName, previous);
      if (sameMatch(previous, next)) continue;
      this.#matches.set(text, next);
      if (previous.isSome())
        removeFrom(this.#textsByKey, keyOf(previous.value.journalName, previous.value.anchor), text);
      if (next.isSome()) addTo(this.#textsByKey, keyOf(next.value.journalName, next.value.anchor), text);
      this.#addSourcesOf(text, affected);
    }
  }

  #addSourcesOf(text: string, into: Set<VaultPath>): void {
    const sources = this.#sourcesByText.get(text) ?? new Set<VaultPath>();
    for (const source of sources) into.add(source);
  }

  #drop(source: VaultPath): void {
    this.#setTargets(source, new Set());
    this.#setTexts(source, new Set());
    this.#setKeys(source, new Set());
  }

  #setTargets(source: VaultPath, next: ReadonlySet<VaultPath>): void {
    const previous = this.#targetsBySource.get(source) ?? new Set<VaultPath>();
    for (const target of previous) if (!next.has(target)) removeFrom(this.#sourcesByTargetPath, target, source);
    for (const target of next) addTo(this.#sourcesByTargetPath, target, source);
    if (next.size === 0) this.#targetsBySource.delete(source);
    else this.#targetsBySource.set(source, next);
  }

  #setTexts(source: VaultPath, next: ReadonlySet<string>): void {
    const previous = this.#textsBySource.get(source);
    if (previous === undefined && next.size === 0) return;
    if (previous !== undefined)
      for (const text of previous) if (!next.has(text)) removeFrom(this.#sourcesByText, text, source);
    for (const text of next) addTo(this.#sourcesByText, text, source);
    if (next.size === 0) this.#textsBySource.delete(source);
    else this.#textsBySource.set(source, next);
  }

  #setKeys(source: VaultPath, next: ReadonlySet<string>): void {
    const previous = this.#bySource.get(source) ?? new Set<string>();
    if (sameKeys(previous, next)) return;
    for (const key of previous) if (!next.has(key)) removeFrom(this.#byKey, key, source);
    for (const key of next) addTo(this.#byKey, key, source);
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
      this.#index.events.on("entryChanged", ({ entry }) => this.#followEntry(entry)),
      // A sync or import rewrites the stored settings wholesale.
      this.#settingsEvents.on("reloaded", () => this.#debounceRebuild()),
    );
    // Watched rather than taken from repository events: the journal edit form binds naming fields
    // to the stored config directly, which no repository event reports. Creating, deleting,
    // renaming and cloning a journal all change the signature too.
    this.#stopNamingWatch = watch(
      () => this.#namingSignature(),
      () => this.#debounceRebuild(),
    );
  }

  count(journalName: string, anchor: AnchorString): number {
    return this.#byKey.get(keyOf(journalName, anchor))?.size ?? 0;
  }

  [Symbol.dispose](): void {
    this.#disposed = true;
    for (const off of this.#unsubscribes) off();
    this.#unsubscribes.length = 0;
    this.#stopNamingWatch?.();
    if (this.#rebuildTimer !== undefined) window.clearTimeout(this.#rebuildTimer);
  }
}
