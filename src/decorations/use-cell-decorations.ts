import { computed, onMounted, onUnmounted, provide, shallowRef, toRaw, toValue, watchEffect } from "vue";

import type { Period } from "@/calendar";
import { useService } from "@/infrastructure/di";
import { NoteMetadataService, NoteSizeService, NotesService, type VaultPath } from "@/infrastructure/host";
import { CycleService, JournalsIndex, JournalsRepository } from "@/journals";
import { useTasksVersion } from "@/tasks/use-tasks-version";

import { DecorationsStore } from "./decorations-store";
import {
  cellKey,
  DecorationEngine,
  periodKindForWrite,
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

  const cells = new Map<string, CellStyleRef>();
  let periodsByKey = new Map<string, Period[]>();
  let keysByPath = new Map<VaultPath, Set<string>>();
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

  function rebuildScopeMaps(periods: readonly Period[]): void {
    const journalNames = toValue(options.journalNames);
    journalNamesInScope = new Set(journalNames);
    keysByPath = new Map<VaultPath, Set<string>>();
    const addPath = (path: VaultPath, key: string): void => {
      const keys = keysByPath.get(path);
      if (keys) keys.add(key);
      else keysByPath.set(path, new Set([key]));
    };
    for (const period of periods) {
      const anchor = period.anchor.toAnchor();
      for (const name of journalNames) {
        const journalOpt = journals.get(name);
        if (journalOpt.isNone()) continue;
        if (!periodMatchesWrite(period.kind, journalOpt.value.write.type)) continue;
        const key = cellKey(period.kind, anchor);
        const owner = cycle.anchorOf(name, period.anchor);
        if (owner.isNone()) continue;
        const opt = index.entryByAnchor(name, owner.value);
        if (opt.isSome()) addPath(opt.value.path, key);
        // A tasks condition reads notelet structure, and a heading or tag edit there can leave the
        // published task items — and so tasksVersion — unchanged; only metadata-changed carries it.
        for (const notelet of index.noteletsAt(name, owner.value)) addPath(notelet.path, key);
      }
    }
  }

  function reseed(): void {
    // TaskIndex is not Vue-reactive (see useTasksVersion), so tasks conditions evaluated below
    // would otherwise never re-run once a provider publishes after this watchEffect's first pass.
    // Reading the version here registers it as a dependency.
    void tasksVersion.value;
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

  // Shared by metadata-changed and size-changed: both name a path, and both mean
  // "re-evaluate every live cell reading it", including offset days sharing an interval note.
  function repaintCell(path: VaultPath): void {
    const keys = keysByPath.get(path);
    if (!keys) return;
    const periods = [...keys].flatMap((key) => periodsByKey.get(key) ?? []);
    const result = engine.evaluateRange(periods, gatherDecorations());
    for (const key of keys) {
      const slot = cells.get(key);
      if (slot) slot.value = result.get(key) ?? [];
    }
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
    const offIndex = index.events.on("entryChanged", ({ entry, kind }) => {
      if (!journalNamesInScope.has(entry.journalName)) return;
      const journalOpt = journals.get(entry.journalName);
      if (journalOpt.isNone()) return;
      // A stored interval end can move later intervals too, even when its anchor is offscreen.
      if (journalOpt.value.write.type === "custom") {
        reseed();
        return;
      }
      const key = cellKey(periodKindForWrite(journalOpt.value.write.type), entry.anchor);
      if (!periodsByKey.has(key)) return;
      if (kind === "added") keysByPath.set(entry.path, new Set([key]));
      else keysByPath.delete(entry.path);
      const periodsAtKey = periodsByKey.get(key);
      const slot = cells.get(key);
      if (!periodsAtKey || !slot) return;
      slot.value = engine.evaluateRange(periodsAtKey, gatherDecorations()).get(key) ?? [];
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
      offRename();
      offResolved();
    });
  });

  return cells;
}
