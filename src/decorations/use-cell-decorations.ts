import { computed, onMounted, onUnmounted, provide, shallowRef, toRaw, toValue, watchEffect } from "vue";

import { CalendarDate, type AnchorString, type Period } from "@/calendar";
import { useService } from "@/infrastructure/di";
import { NoteMetadataService, NoteSizeService, NotesService, type VaultPath } from "@/infrastructure/host";
import { CycleService, JournalsIndex, JournalsRepository } from "@/journals";
import { useCreationDatesVersion } from "@/journals/creation-dates";
import { useLinkReferencesVersion } from "@/journals/link-references";
import { useTasksVersion } from "@/tasks/use-tasks-version";

import { DecorationsStore } from "./decorations-store";
import {
  cellKey,
  DecorationEngine,
  periodMatchesWrite,
  type DecorationBinding,
  type JournalDecorationBinding,
} from "./engine";
import { gatherBindings } from "./gather-bindings";
import { formatPadding } from "./resolve-cell";
import {
  CellMarkLimitKey,
  defaultCellDecorationScope,
  type CellDecorationScope,
  type CellStyleRef,
} from "./ui/cell-decoration-map-key";
import { useCellPadding } from "./use-cell-padding";
import { useMarkLimit } from "./use-mark-limit";

import type { JournalDecoration, JournalDecorationStyle } from "./config";
import type { MaybeRefOrGetter } from "vue";

export interface CellDecorationsOptions {
  periods: MaybeRefOrGetter<readonly Period[]>;
  journalNames: MaybeRefOrGetter<readonly string[]>;
  scope?: CellDecorationScope;
  filter?: (binding: JournalDecorationBinding) => boolean;
  // Presence opts the surface into journal-free decorations. `shelf` is the shelf in scope,
  // or null for "all journals", where the vault-wide list and every shelf's list apply.
  calendarDecorations?: { shelf: MaybeRefOrGetter<string | null> };
}

function ownerKey(journalName: string, anchor: AnchorString): string {
  return `${journalName}\0${anchor}`;
}

export function useCellDecorations(options: CellDecorationsOptions): ReadonlyMap<string, CellStyleRef> {
  const scope = options.scope ?? defaultCellDecorationScope;
  const filter = options.filter ?? ((): boolean => true);
  const engine = useService(DecorationEngine);
  const journals = useService(JournalsRepository);
  const index = useService(JournalsIndex);
  const cycle = useService(CycleService);
  const notes = useService(NotesService);
  const metadata = useService(NoteMetadataService);
  const size = useService(NoteSizeService);
  // Presence-gated: a surface that never opts in must not force DecorationsStore (and its
  // settings/shelves dependencies) to exist in its DI container.
  const store = options.calendarDecorations ? useService(DecorationsStore) : undefined;
  const tasksVersion = useTasksVersion();
  const linksVersion = useLinkReferencesVersion();
  const createdVersion = useCreationDatesVersion();

  const cells = new Map<string, CellStyleRef>();
  let periodsByKey = new Map<string, Period[]>();
  let keysByPath = new Map<VaultPath, Set<string>>();
  // Cell keys by the journal period whose note answers them: the cell's own period for a fixed
  // journal, the owning interval for every day of a custom one (has-note reads the interval's note).
  let keysByOwner = new Map<string, Set<string>>();
  let journalNamesInScope = new Set<string>();

  function gatherDecorations(): readonly DecorationBinding[] {
    const calendar = options.calendarDecorations;
    return gatherBindings(journals, store, {
      journalNames: toValue(options.journalNames),
      shelf: calendar ? toValue(calendar.shelf) : null,
      includeCalendar: calendar !== undefined,
      filter,
    });
  }

  function readPeriods(): Period[] {
    return toValue(options.periods).map((p) => toRaw(p));
  }

  // One anchorOf per custom journal, then a forward walk over sorted days: a per-day anchorOf would
  // re-walk the cycle for every cell.
  function intervalOwners(name: string, anchors: readonly AnchorString[]): Map<AnchorString, AnchorString> {
    const owners = new Map<AnchorString, AnchorString>();
    const sorted = [...new Set(anchors)].toSorted();
    const first = sorted.at(0);
    if (first === undefined) return owners;
    const startOpt = cycle.anchorOf(name, CalendarDate.fromAnchor(first));
    if (startOpt.isNone()) return owners;
    let start = startOpt.value;
    let next = cycle.nextAnchor(name, start).getOrUndefined();
    for (const anchor of sorted) {
      while (next !== undefined && anchor >= next) {
        start = next;
        next = cycle.nextAnchor(name, start).getOrUndefined();
      }
      owners.set(anchor, start);
    }
    return owners;
  }

  function addKey<K>(map: Map<K, Set<string>>, at: K, key: string): void {
    const bucket = map.get(at);
    if (bucket) bucket.add(key);
    else map.set(at, new Set([key]));
  }

  function rebuildScopeMaps(periods: readonly Period[]): void {
    const journalNames = toValue(options.journalNames);
    journalNamesInScope = new Set(journalNames);
    keysByPath = new Map<VaultPath, Set<string>>();
    keysByOwner = new Map<string, Set<string>>();
    for (const name of journalNames) {
      const journalOpt = journals.get(name);
      if (journalOpt.isNone()) continue;
      const writeType = journalOpt.value.write.type;
      const matching = periods.filter((period) => periodMatchesWrite(period.kind, writeType));
      const owners =
        writeType === "custom"
          ? intervalOwners(
              name,
              matching.map((period) => period.anchor.toAnchor()),
            )
          : undefined;
      for (const period of matching) {
        const anchor = period.anchor.toAnchor();
        const key = cellKey(period.kind, anchor);
        const owner = owners?.get(anchor) ?? anchor;
        // The cell's own anchor stays a lookup too: the conditions other than has-note still read it.
        const lookups = owner === anchor ? [anchor] : [owner, anchor];
        for (const at of lookups) {
          addKey(keysByOwner, ownerKey(name, at), key);
          const opt = index.entryByAnchor(name, at);
          if (opt.isSome()) addKey(keysByPath, opt.value.path, key);
          // A tasks condition reads notelet structure, and a heading or tag edit there can leave the
          // published task items — and so tasksVersion — unchanged; only metadata-changed carries it.
          for (const notelet of index.noteletsAt(name, at)) addKey(keysByPath, notelet.path, key);
        }
      }
    }
  }

  function reseed(): void {
    // TaskIndex is not Vue-reactive (see useTasksVersion), so tasks conditions evaluated below
    // would otherwise never re-run once a provider publishes after this watchEffect's first pass.
    // Reading the version here registers it as a dependency.
    void tasksVersion.value;
    // Same for LinkReferenceIndex and CreationDateIndex, which build after boot and change on
    // linking edits and on note creates, renames and deletes.
    void linksVersion.value;
    void createdVersion.value;
    const periods = readPeriods();
    rebuildScopeMaps(periods);
    periodsByKey = new Map<string, Period[]>();
    for (const p of periods) {
      const key = cellKey(p.kind, p.anchor.toAnchor());
      const bucket = periodsByKey.get(key);
      if (bucket) bucket.push(p);
      else periodsByKey.set(key, [p]);
    }

    const decorations = gatherDecorations();
    const initial = engine.evaluateRange(periods, decorations);

    for (const key of cells.keys()) {
      if (!periodsByKey.has(key)) cells.delete(key);
    }
    for (const [key] of periodsByKey) {
      const styles: readonly JournalDecorationStyle[] = initial.get(key) ?? [];
      const existing = cells.get(key);
      if (existing) existing.value = styles;
      else cells.set(key, shallowRef<readonly JournalDecorationStyle[]>(styles));
    }

    // Detect mutations of any consumed journal's decorations array. Touching .length
    // and each decoration reference here is enough to register watchEffect dependencies
    // on the underlying reactive proxy.
    for (const name of toValue(options.journalNames)) {
      const opt = journals.get(name);
      if (opt.isNone()) continue;
      const array = opt.value.decorations as unknown as readonly JournalDecoration[];
      void array.length;
      for (const d of array) void d;
    }
  }

  // Re-evaluate every live cell against the current metadata without rebuilding the
  // scope maps — used when the backing notes are unchanged in scope but their parsed
  // metadata has caught up (e.g. after a rename, see below).
  function recomputeSlots(): void {
    const result = engine.evaluateRange(readPeriods(), gatherDecorations());
    for (const [key, slot] of cells) {
      slot.value = result.get(key) ?? [];
    }
  }

  function repaintKeys(keys: Iterable<string>): void {
    const live = [...keys].filter((key) => periodsByKey.has(key) && cells.has(key));
    if (live.length === 0) return;
    const result = engine.evaluateRange(
      live.flatMap((key) => periodsByKey.get(key) ?? []),
      gatherDecorations(),
    );
    for (const key of live) {
      const slot = cells.get(key);
      if (slot) slot.value = result.get(key) ?? [];
    }
  }

  // Shared by metadata-changed and size-changed: both name a path, and both mean
  // "re-evaluate whichever cells it answers, if any is currently live."
  function repaintCell(path: VaultPath): void {
    const keys = keysByPath.get(path);
    if (keys !== undefined) repaintKeys(keys);
  }

  watchEffect(reseed);
  provide(scope.map, cells);

  const paddingExtents = useCellPadding({
    journalNames: options.journalNames,
    filter: options.filter,
    calendarDecorations: options.calendarDecorations,
  });
  const sharedPadding = computed(() => formatPadding(paddingExtents.value));
  provide(scope.padding, sharedPadding);
  provide(CellMarkLimitKey, useMarkLimit());

  onMounted(() => {
    const offMeta = notes.events.on("metadata-changed", repaintCell);
    const offSize = size.events.on("size-changed", repaintCell);
    // Before readiness "missing" reads false everywhere, and becoming ready changes no entry.
    const offReady = index.events.on("ready", reseed);
    const offIndex = index.events.on("entryChanged", ({ entry, kind }) => {
      if (!journalNamesInScope.has(entry.journalName)) return;
      const keys = keysByOwner.get(ownerKey(entry.journalName, entry.anchor));
      if (keys === undefined) return;
      if (kind === "added") keysByPath.set(entry.path, new Set(keys));
      else keysByPath.delete(entry.path);
      repaintKeys(keys);
    });
    // A rename re-keys the index (entryChanged above) before metadataCache has re-parsed
    // the new path, so the synchronous re-eval reads stale (often empty) metadata and a
    // pure rename fires no metadata-changed to correct it. metadataCache "resolved" is the
    // "cache caught up" signal — recompute the affected cells once it lands.
    let recomputeAfterRename = false;
    const offRename = notes.events.on("renamed", ({ from, to }) => {
      if (keysByPath.has(from) || keysByPath.has(to)) recomputeAfterRename = true;
    });
    const offResolved = metadata.onResolved(() => {
      if (!recomputeAfterRename) return;
      recomputeAfterRename = false;
      recomputeSlots();
    });
    onUnmounted(() => {
      offMeta();
      offSize();
      offIndex();
      offReady();
      offRename();
      offResolved();
    });
  });

  return cells;
}
